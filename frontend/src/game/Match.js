import * as THREE from "three";
import {
  BOMB_FUSE_MS,
  Block,
  BombStatus,
  ISLAND_COUNT,
  MatchPhase,
  Message,
  PLAYER_COLORS,
  WATER_LEVEL,
  islandCenter,
  pieceCells,
  rankPlayers,
} from "@kaboom-bay/shared";
import { AimController } from "./bombs/AimController.js";
import { BombView } from "./bombs/BombView.js";
import { TrajectoryPreview } from "./bombs/TrajectoryPreview.js";
import { Clouds } from "./rendering/Clouds.js";
import { createRenderer } from "./rendering/renderer.js";
import { createScene } from "./rendering/scene.js";
import { OrbitCamera } from "./rendering/camera.js";
import { Effects } from "./rendering/effects.js";
import { Island } from "./islands/Island.js";
import { hud } from "../ui/hud.js";
import { lobby } from "../ui/lobby.js";
import { Lantern, PlayerAvatar } from "./characters/CharacterFactory.js";
import { BuildController } from "./islands/BuildController.js";
import { sound } from "../audio/Sound.js";
import { PIECES, PIECE_TYPES } from "@kaboom-bay/shared";
import { BLOCK_COLORS } from "./rendering/palette.js";
import { HeroController } from "./player/HeroController.js";
import { CameraRig } from "./rendering/CameraRig.js";
import { TouchControls, isTouchDevice } from "../ui/touch.js";
import { cg } from "../platform/crazygames.js";
import { BOMB_MAX_THROW_POWER, BOMB_PICKUP_RADIUS, THROW_CHARGE_MS } from "@kaboom-bay/shared";

export const colorHex = (i) => `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16).padStart(6, "0")}`;
const _v = new THREE.Vector3();

/**
 * Online match view (Phase 3): mirrors the server state - four islands generated from the
 * shared seed, pieces and terrain diffs applied to local voxel grids, players and phases in the HUD.
 * Building input arrives in Phase 4, bombs in Phase 5.
 */
export class Match {
  constructor(canvas, net, { onPlayAgain } = {}) {
    this.canvas = canvas;
    this.net = net;
    this.room = net.room;
    this.onPlayAgain = onPlayAgain;
    this.disposed = false;

    this.renderer = createRenderer(canvas);
    const { scene, water } = createScene();
    this.scene = scene;
    this.water = water;
    this.orbit = new OrbitCamera(window.innerWidth / window.innerHeight);
    this.detachCamera = this.orbit.attach(canvas);
    this.rig = new CameraRig(this.orbit, canvas);
    this.rig.onModeChange = (mode) => this._onViewChange(mode);
    this.hero = null; // HeroController for the local player
    this.charge = null; // first-person throw charge { start }
    this.touch = null;
    this.effects = new Effects(scene);
    this.clouds = new Clouds(scene);
    this.preview = new TrajectoryPreview(scene);

    const seed = this.room.state.seed;
    this.islands = Array.from({ length: ISLAND_COUNT }, (_, i) => {
      const c = islandCenter(i);
      return new Island(scene, { index: i, seed: seed + i, center: new THREE.Vector3(c.x, c.y, c.z) });
    });
    this.avatars = new Map(); // islandIndex -> PlayerAvatar
    this.bombs = new Map(); // bombId -> { view, target, status, holder, armedAt, islandIndex }
    this.aiming = null; // bomb record being pulled back
    this._pullOffset = new THREE.Vector3();
    this.dirty = new Set();
    this.pieceCells = new Map(); // pieceId -> { owner, cells }
    this.players = new Map(); // key -> snapshot
    this.myKey = this.room.sessionId;
    this.myIsland = 0;
    this.phase = null;

    this._bind();
    this._bindCombat();
    this._bindBuild();
    this._bindControls();
    this._focusIsland(this.myIsland);
    hud.setSound(sound.enabled, () => { sound.setEnabled(!sound.enabled); hud.setSound(sound.enabled); sound.play("click"); });
    hud.setView(this.rig.mode, () => this.toggleView());
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._resize();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- state binding ----------

  _bind() {
    const { $ } = this.net;
    const state = this.room.state;

    $(state).players.onAdd((p, key) => {
      const snap = { key, name: p.name, islandIndex: p.islandIndex, coins: p.coins, ready: p.ready, connected: p.connected, isBot: p.isBot, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
      this.players.set(key, snap);
      for (const f of ["x", "y", "z", "yaw"]) $(p).listen(f, (v) => { snap[f] = v; });
      if (key === this.myKey && !this.hero) {
        this.hero = new HeroController({ island: this.islands[p.islandIndex], net: this.net, start: { x: p.x, y: p.y, z: p.z, yaw: p.yaw } });
      }
      if (key === this.myKey) hud.setCoins(p.coins);
      for (const f of ["name", "islandIndex", "coins", "ready", "connected", "isBot"]) {
        $(p).listen(f, (v) => {
          snap[f] = v;
          if (key === this.myKey && f === "coins") hud.setCoins(v);
          if (key === this.myKey && f === "islandIndex") this._focusIsland(v);
          this._playersChanged();
        });
      }
      if (key === this.myKey) this._focusIsland(p.islandIndex);
      this._playersChanged();
    });
    $(state).players.onRemove((_p, key) => {
      this.players.delete(key);
      this._playersChanged();
    });

    $(state).pieces.onAdd((piece, id) => {
      const cells = pieceCells(piece.type, piece.x, piece.y, piece.z, piece.rot);
      if (!cells) return;
      if (piece.owner === this.myIsland && this.phase === MatchPhase.BUILD) { sound.play("place"); this._refreshBuildBar?.(); }
      const island = this.islands[piece.owner];
      for (const [x, y, z] of cells) island.grid.set(x, y, z, piece.type);
      this.pieceCells.set(id, { owner: piece.owner, cells });
      this.dirty.add(piece.owner);
    });
    $(state).pieces.onRemove((_piece, id) => {
      const rec = this.pieceCells.get(id);
      if (!rec) return;
      if (rec.owner === this.myIsland && this.phase === MatchPhase.BUILD) { sound.play("remove"); queueMicrotask(() => this._refreshBuildBar?.()); }
      for (const [x, y, z] of rec.cells) this.islands[rec.owner].grid.set(x, y, z, Block.AIR);
      this.pieceCells.delete(id);
      this.dirty.add(rec.owner);
    });

    $(state).terrainDiffs.onAdd((v) => {
      const island = v >>> 16, cell = v & 0xffff;
      const isl = this.islands[island];
      if (!isl || cell >= isl.grid.length) return;
      const block = isl.grid.data[cell];
      isl.grid.data[cell] = Block.AIR;
      this.dirty.add(island);
      if (block && this.phase === MatchPhase.COMBAT && Math.random() < 0.5) {
        const [x, y, z] = isl.grid.coords(cell);
        this.effects.burstCell(isl.gridToWorld(x, y, z), block);
      }
    });

    $(state).listen("phase", (phase) => this._onPhase(phase));

    this.room.onLeave((code) => {
      if (this.disposed) return;
      if (this.phase !== MatchPhase.RESULTS) lobby.showError(`Disconnected from the match (code ${code}).`, () => this.onPlayAgain?.());
    });
    this.room.onError((code, message) => console.error("[KaBoom Bay] room error", code, message));
  }

  // ---------- build ----------

  _bindBuild() {
    this.build = new BuildController({
      canvas: this.canvas,
      camera: this.orbit.camera,
      scene: this.scene,
      island: this.islands[this.myIsland],
      net: this.net,
      getPieceCount: () => [...this.pieceCells.values()].filter((r) => r.owner === this.myIsland).length,
      pieceAt: (x, y, z) => {
        for (const [id, rec] of this.pieceCells) if (rec.owner === this.myIsland && rec.cells.some((c) => c[0] === x && c[1] === y && c[2] === z)) return id;
        return null;
      },
      onChange: () => this._refreshBuildBar(),
      isBlocked: (x, y, z) => {
        if (!this.hero) return false;
        const o = this.islands[this.myIsland].origin;
        const hx = Math.floor(this.hero.pos.x - o.x), hy = Math.floor(this.hero.pos.y - o.y + 0.01), hz = Math.floor(this.hero.pos.z - o.z);
        return x === hx && z === hz && (y === hy || y === hy + 1);
      },
    });
    hud.showBuildBar({
      pieces: PIECE_TYPES.map((t) => ({ type: t, name: PIECES[t].name, color: `#${BLOCK_COLORS[t].toString(16).padStart(6, "0")}` })),
      onSelect: (t) => { this.build.setType(t); sound.play("click"); },
      onRotate: () => { this.build.rotate(); sound.play("click"); },
      onRemoveMode: () => { this.build.setMode(this.build.mode === "remove" ? "place" : "remove"); sound.play("click"); },
    });
    hud.hideBuildBar();
  }

  _refreshBuildBar() {
    hud.setBuildState({ type: this.build.type, mode: this.build.mode, count: this.build.pieceCount, max: this.build.budget });
  }

  // ---------- controls: view toggle, first-person input, touch ----------

  _bindControls() {
    this._onKey = (e) => {
      if (e.target?.tagName === "INPUT") return;
      if (e.key === "v" || e.key === "V") this.toggleView();
      if (e.key === "e" || e.key === "E") this.tryGrab();
    };
    window.addEventListener("keydown", this._onKey);

    // first-person mouse: LMB charge/throw or place, RMB remove
    this._onMouseDown = (e) => {
      if (this.rig.mode !== "first") return;
      this.rig.requestLock();
      if (e.button === 0) this.primary("down");
      else if (e.button === 2 && this.phase === MatchPhase.BUILD) this.build.commit("remove");
    };
    this._onMouseUp = (e) => { if (this.rig.mode === "first" && e.button === 0) this.primary("up"); };
    this._onWheel = (e) => {
      if (this.rig.mode !== "first" || this.phase !== MatchPhase.BUILD) return;
      const i = PIECE_TYPES.indexOf(this.build.type);
      this.build.setType(PIECE_TYPES[(i + (e.deltaY > 0 ? 1 : PIECE_TYPES.length - 1)) % PIECE_TYPES.length]);
    };
    this.canvas.addEventListener("mousedown", this._onMouseDown);
    this.canvas.addEventListener("mouseup", this._onMouseUp);
    this.canvas.addEventListener("wheel", this._onWheel, { passive: true });

    if (isTouchDevice()) {
      this.touch = new TouchControls({
        onMove: (x, y) => this.hero?.setJoystick(x, y),
        onLook: (dx, dy) => this.rig.look(dx, dy),
        onAction: (phase) => this.primary(phase, true),
        onSecondary: () => (this.phase === MatchPhase.BUILD ? this.build.setMode(this.build.mode === "remove" ? "place" : "remove") : this.tryGrab()),
        onRotate: () => this.build.rotate(),
        onView: () => this.toggleView(),
      });
      this.touch.setContext({ phase: this.phase, mode: this.rig.mode });
    }
  }

  toggleView() {
    this.rig.toggle(this.hero?.yaw ?? 0);
    sound.play("click");
  }

  _onViewChange(mode) {
    hud.setView(mode);
    const avatar = this.avatars.get(this.myIsland);
    if (avatar) avatar.group.visible = mode !== "first";
    this.build.centerMode = mode === "first";
    this.build.ghost.count = 0;
    if (mode === "third") { this._cancelCharge(); if (this.phase === MatchPhase.BUILD) this._buildCamera(); else this._focusIsland(this.myIsland); }
    this.touch?.setContext({ phase: this.phase, mode });
    hud.setHint(this._hintFor(this.phase, mode));
  }

  /** Primary action: combat = charge & throw (first person / touch), build = place at crosshair. */
  primary(phase, fromTouch = false) {
    if (this.phase === MatchPhase.BUILD) {
      if (phase === "down") {
        if (this.rig.mode === "first" || fromTouch) { if (this.rig.mode !== "first") this.build.updateCenter(); this.build.commit("place"); }
      }
      return;
    }
    if (this.phase !== MatchPhase.COMBAT) return;
    if (this.rig.mode !== "first" && !fromTouch) return; // third person mouse uses the slingshot
    const held = this._myHeldBomb();
    if (phase === "down") {
      if (!held) { this.tryGrab(); return; }
      this.net.send(Message.ARM_BOMB);
      this.charge = { start: performance.now() };
    } else if (phase === "up" && this.charge && held) {
      const power = this._chargePower();
      const dir = this.rig.mode === "first" ? this.rig.forward() : new THREE.Vector3(Math.sin(this.hero.yaw), 0.6, Math.cos(this.hero.yaw)).normalize();
      if (dir.y < 0.2) { dir.y = 0.2; dir.normalize(); }
      const v = dir.multiplyScalar(power * BOMB_MAX_THROW_POWER);
      this.net.send(Message.THROW_BOMB, { vx: v.x, vy: v.y, vz: v.z });
      this._cancelCharge();
    }
  }

  _chargePower() { return this.charge ? Math.min(1, 0.2 + 0.8 * ((performance.now() - this.charge.start) / THROW_CHARGE_MS)) : 0; }
  _cancelCharge() { this.charge = null; hud.setCharge(null); this.preview.hide(); }

  /** Grab the nearest live bomb resting on my island if the hero is close enough; otherwise walk to it. */
  tryGrab() {
    if (this.phase !== MatchPhase.COMBAT || !this.hero) return false;
    const held = this._myHeldBomb();
    if (held && (held.armedAt || held.owner !== this.myIsland)) return false; // an unarmed own bomb is dropped by the server on grab
    let best = null, bestD = Infinity;
    for (const rec of this.bombs.values()) {
      if (rec.status !== BombStatus.RESTING || rec.islandIndex !== this.myIsland) continue;
      const d = Math.hypot(rec.target.x - this.hero.pos.x, rec.target.z - this.hero.pos.z);
      if (d < bestD) { best = rec; bestD = d; }
    }
    if (!best) return false;
    if (bestD <= BOMB_PICKUP_RADIUS) { this.net.send(Message.GRAB_BOMB, best.id); sound.play("grab"); return true; }
    this.hero.moveTo(best.target, () => { this.net.send(Message.GRAB_BOMB, best.id); sound.play("grab"); });
    return true;
  }

  _hintFor(phase, mode) {
    const move = isTouchDevice() ? "Joystick to walk." : "WASD to walk, V to switch view.";
    if (phase === MatchPhase.BUILD) return mode === "first"
      ? `Build: aim with the crosshair, click to place, right-click removes, wheel cycles pieces, R rotates. ${move}`
      : `Build: pick a piece, hover your island and click to place. R rotates, right-click or Remove deletes. ${move}`;
    if (phase === MatchPhase.COMBAT) return mode === "first"
      ? `Hold to charge, release to throw. E grabs a bomb that landed near you. ${move}`
      : `Drag back from your bomb and release to lob it. Tap a landed bomb to run over and grab it. ${move}`;
    return "";
  }

  _buildCamera() {
    const c = this.islands[this.myIsland].center;
    this.orbit.target.set(c.x, 5, c.z);
    this.orbit.distance = 58;
    this.orbit.pitch = 0.78;
  }

  // ---------- combat ----------

  _bindCombat() {
    const { $ } = this.net;
    const state = this.room.state;

    $(state).bombs.onAdd((bomb, id) => {
      const view = new BombView(this.scene);
      const rec = { id, view, target: new THREE.Vector3(bomb.x, bomb.y, bomb.z), status: bomb.status, holder: bomb.holder, armedAt: bomb.armedAt, islandIndex: bomb.islandIndex, owner: bomb.owner };
      view.setPosition(rec.target);
      this.bombs.set(id, rec);
      for (const f of ["x", "y", "z"]) $(bomb).listen(f, (v) => { rec.target[f] = v; if (rec.holder === this.myKey && !this.aiming) this.aim.setAnchor(rec.target); });
      for (const f of ["status", "holder", "armedAt", "islandIndex"]) $(bomb).listen(f, (v) => { rec[f] = v; });
      if (bomb.holder === this.myKey) this.aim.setAnchor(rec.target);
    });
    $(state).bombs.onRemove((_bomb, id) => {
      const rec = this.bombs.get(id);
      if (!rec) return;
      if (this.aiming === rec) { this.aiming = null; this.preview.hide(); }
      rec.view.dispose();
      this.bombs.delete(id);
    });

    this.room.onMessage(Message.BOMB_EXPLODED, (m) => {
      const pos = new THREE.Vector3(m.x, m.y, m.z);
      this.effects.explosion(pos, m.radius);
      const mine = this.islands[this.myIsland].center;
      const d = Math.hypot(pos.x - mine.x, pos.z - mine.z);
      this.orbit.addShake(d < 20 ? 0.8 : 0.25);
      sound.play("boom", { volume: d < 20 ? 1 : 0.6 });
      const gained = m.coinsBy?.[this.myKey];
      if (gained) { hud.popText(this._toScreen(pos), gained > 0 ? `+${gained}` : `${gained}`, gained > 0 ? "#ffd23f" : "#ff4b3e"); sound.play(gained > 0 ? "coin" : "penalty", { volume: 1 }); }
      // blast damage arrives as terrain diffs; debris from whatever we know was there
      for (const i of m.islands) this.dirty.add(i);
    });
    this.room.onMessage(Message.BOMB_SPLASH, (m) => { this.effects.splash(new THREE.Vector3(m.x, m.y, m.z)); sound.play("splash", { volume: 0.7 }); });
    this.room.onMessage(Message.BOMB_CLASH, (m) => { this.effects.sparks(new THREE.Vector3(m.x, m.y, m.z)); sound.play("clash"); });
    this.room.onMessage(Message.THROW_BOMB, ({ by }) => {
      const p = this.players.get(by);
      if (p) this.avatars.get(p.islandIndex)?.throwPose();
      sound.play("throw", { volume: by === this.myKey ? 1 : 0.5 });
    });

    this.aim = new AimController(this.canvas, this.orbit.camera, {
      onStart: (hit) => this._onAimStart(hit),
      onPull: ({ pull, velocity }) => this._onPull(pull, velocity),
      onRelease: ({ velocity }) => this._onRelease(velocity),
      onCancel: () => this._onAimCancel(),
    });
  }

  _toScreen(worldPos) {
    _v.copy(worldPos).project(this.orbit.camera);
    return { x: ((_v.x + 1) / 2) * window.innerWidth, y: ((1 - _v.y) / 2) * window.innerHeight };
  }

  _myHeldBomb() {
    for (const rec of this.bombs.values()) if (rec.holder === this.myKey) return rec;
    return null;
  }

  _onAimStart(hit) {
    if (this.phase !== MatchPhase.COMBAT || this.rig.mode !== "third") return false;
    const held = this._myHeldBomb();
    if (held && hit.distanceTo(held.target) < 3.5) {
      this.net.send(Message.ARM_BOMB);
      this.aiming = held;
      this.aim.setAnchor(held.target);
      return true;
    }
    // tap a live bomb resting on my island to pick it up
    let best = null, bestD = 1.8;
    for (const rec of this.bombs.values()) {
      if (rec.status !== BombStatus.RESTING || rec.islandIndex !== this.myIsland) continue;
      const d = rec.target.distanceTo(hit);
      if (d < bestD) { best = rec; bestD = d; }
    }
    if (best) this.tryGrab();
    return false;
  }

  _onPull(pull, velocity) {
    if (!this.aiming) return;
    const len = pull.length();
    const k = len > 1.6 ? 1.6 / len : 1;
    this._pullOffset.copy(pull).multiplyScalar(-k);
    this.aiming.view.setPosition(_v.copy(this.aiming.target).add(this._pullOffset));
    this.preview.show(this.aiming.target, velocity, (x, y, z) => y < WATER_LEVEL - 0.5 || this.islands.some((isl) => isl.isSolidAt(x, y, z)));
  }

  _onRelease(velocity) {
    if (!this.aiming) return;
    this.net.send(Message.THROW_BOMB, { vx: velocity.x, vy: velocity.y, vz: velocity.z });
    this.aiming = null;
    this.preview.hide();
  }

  _onAimCancel() {
    if (this.aiming) this.aiming.view.setPosition(this.aiming.target);
    this.aiming = null;
    this.preview.hide();
  }

  _updateBombs(dt) {
    const now = this.net.serverNow();
    const cam = this.orbit.camera;
    let myFuse = null;
    const firstPersonHand = this.rig.mode === "first";
    for (const rec of this.bombs.values()) {
      if (firstPersonHand && rec.holder === this.myKey) {
        // my held bomb: draw it in the "hand" (lower right of the view) instead of at the server position
        const cam = this.orbit.camera;
        const fwd = this.rig.forward(_v);
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
        rec.view.group.position.copy(cam.position).addScaledVector(fwd, 1.1).addScaledVector(right, 0.55).add(new THREE.Vector3(0, -0.55 + (this.charge ? -0.1 * this._chargePower() : 0), 0));
        rec.view.group.scale.setScalar(0.7);
      } else if (rec !== this.aiming) {
        rec.view.group.scale.setScalar(1);
        const pos = rec.view.group.position;
        if (rec.status === BombStatus.FLYING) {
          pos.lerp(rec.target, 1 - Math.exp(-dt * 16));
          rec.view.body.rotation.x += dt * 6;
        } else {
          pos.lerp(rec.target, 1 - Math.exp(-dt * 20));
        }
      }
      const fraction = rec.armedAt ? Math.max(0, BOMB_FUSE_MS - (now - rec.armedAt)) / BOMB_FUSE_MS : null;
      rec.view.updateFuse(fraction, cam, this._time ?? 0);
      if (rec.holder === this.myKey) myFuse = fraction;
      // ticking in the last three seconds of any live bomb near my island
      if (fraction !== null && fraction < 0.3) {
        const secondsLeft = Math.ceil(fraction * BOMB_FUSE_MS / 1000);
        if (rec._tick !== secondsLeft) { rec._tick = secondsLeft; sound.play("tick", { volume: rec.holder === this.myKey || rec.islandIndex === this.myIsland ? 1 : 0.35 }); }
      }
    }
    hud.setFuse(myFuse);
  }

  _onPhase(phase) {
    this.phase = phase;
    switch (phase) {
      case MatchPhase.LOBBY:
        this._showWaiting();
        break;
      case MatchPhase.BUILD: {
        lobby.hide();
        sound.play("phase");
        cg.gameplayStart();
        if (this.rig.mode === "third") this._buildCamera();
        this.build.setEnabled(true);
        hud.setBuildState({ type: this.build.type, mode: this.build.mode, count: this.build.pieceCount, max: this.build.budget });
        document.querySelector("[data-build]").style.display = "flex";
        hud.setHint(this._hintFor(phase, this.rig.mode));
        this.touch?.setContext({ phase, mode: this.rig.mode });
        break;
      }
      case MatchPhase.COMBAT:
        sound.play("phase");
        this.build.setEnabled(false);
        hud.hideBuildBar();
        if (this.rig.mode === "third") this._focusIsland(this.myIsland);
        hud.setHint(this._hintFor(phase, this.rig.mode));
        this.touch?.setContext({ phase, mode: this.rig.mode });
        break;
      case MatchPhase.RESULTS: {
        const ranked = rankPlayers([...this.players.values()]);
        const won = ranked.find((p) => p.key === this.myKey)?.rank === 1;
        sound.play(won ? "win" : "lose");
        cg.gameplayStop();
        if (won) cg.happytime();
        this._cancelCharge();
        this.rig.setMode("third");
        this.touch?.setContext({ phase, mode: this.rig.mode });
        lobby.showResults({ ranked, myKey: this.myKey, onAgain: () => this.onPlayAgain?.() });
        break;
      }
    }
  }

  _playersChanged() {
    for (const p of this.players.values()) {
      if (this.avatars.has(p.islandIndex) || !this.islands[p.islandIndex]) continue;
      const island = this.islands[p.islandIndex];
      const stand = new THREE.Vector3(p.x, p.y, p.z);
      const avatar = new PlayerAvatar(this.scene, { variant: p.islandIndex, teamColor: PLAYER_COLORS[p.islandIndex] });
      avatar.place(stand, island.center);
      this.avatars.set(p.islandIndex, avatar);
      const side = new THREE.Vector3().subVectors(island.center, stand).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(1.6);
      (this.lanterns ??= []).push(new Lantern(this.scene, stand.clone().add(side)));
    }
    hud.setScoreboard([...this.players.values()], this.myKey);
    if (this.phase === MatchPhase.LOBBY) this._showWaiting();
  }

  _showWaiting() {
    lobby.showWaiting({
      players: [...this.players.values()],
      myKey: this.myKey,
      countdownMs: this.room.state.phaseEndsAt ? this.room.state.phaseEndsAt - this.net.serverNow() : null,
      onReady: (ready) => this.net.send("player_ready", ready),
    });
  }

  _focusIsland(index) {
    this.myIsland = index;
    if (this.build) this.build.island = this.islands[index];
    const c = this.islands[index].center;
    // Look from behind your island towards the bay centre so all four islands are in frame.
    this.orbit.target.set(c.x * 0.5, 3, c.z * 0.5);
    this.orbit.yaw = Math.atan2(c.x, c.z);
    this.orbit.distance = 125;
    this.orbit.pitch = 0.66;
  }

  // ---------- loop ----------

  _frame(t) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (t - (this._last ?? t)) / 1000);
    this._last = t;

    for (const i of this.dirty) this.islands[i].mesher.rebuild(this.islands[i].grid);
    this.dirty.clear();

    const state = this.room.state;
    const remaining = state.phaseEndsAt ? state.phaseEndsAt - this.net.serverNow() : 0;
    hud.setPhase(state.phase, remaining);
    if (state.phase === MatchPhase.LOBBY && state.phaseEndsAt) lobby.setCountdown(remaining);

    this._time = (this._time ?? 0) + dt;
    this._updateHeroes(dt);
    this._updateLabels();
    this._updateBombs(dt);
    if (this.rig.mode === "first" && this.phase === MatchPhase.BUILD) this.build.updateCenter();
    if (this.charge) {
      const held = this._myHeldBomb();
      if (!held) this._cancelCharge();
      else {
        const power = this._chargePower();
        hud.setCharge(power);
        const dir = this.rig.mode === "first" ? this.rig.forward() : new THREE.Vector3(Math.sin(this.hero.yaw), 0.6, Math.cos(this.hero.yaw)).normalize();
        if (dir.y < 0.2) { dir.y = 0.2; dir.normalize(); }
        const v = dir.multiplyScalar(power * BOMB_MAX_THROW_POWER);
        this.preview.show(held.target, v, (x, y, z) => y < WATER_LEVEL - 0.5 || this.islands.some((isl) => isl.isSolidAt(x, y, z)));
      }
    }
    this.effects.update(dt);
    this.clouds.update(dt);
    for (const island of this.islands) island.update(dt, this._time);
    for (const a of this.avatars.values()) a.update(dt, this._time);
    this.aim.enabled = this.rig.mode === "third" && this.phase === MatchPhase.COMBAT;
    for (const l of this.lanterns ?? []) l.update(dt, this._time);
    this.water.update(dt);
    this.rig.update(dt, this.hero?.pos);
    this.renderer.render(this.scene, this.orbit.camera);
    this._raf = requestAnimationFrame((n) => this._frame(n));
  }

  _updateHeroes(dt) {
    if (this.hero) {
      const first = this.rig.mode === "first";
      this.hero.update(dt, this.rig.forwardYaw(), first ? this.rig.yaw : null);
      const mine = this.avatars.get(this.myIsland);
      if (mine) { mine.group.position.copy(this.hero.pos); mine.group.rotation.y = this.hero.yaw; }
    }
    const k = 1 - Math.exp(-dt * 12);
    for (const p of this.players.values()) {
      if (p.key === this.myKey) continue;
      const avatar = this.avatars.get(p.islandIndex);
      if (!avatar) continue;
      avatar.group.position.lerp(_v.set(p.x, p.y, p.z), k);
      let d = p.yaw - avatar.group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      avatar.group.rotation.y += d * k;
    }
  }

  _updateLabels() {
    const labels = [];
    const byIsland = new Map([...this.players.values()].map((p) => [p.islandIndex, p]));
    for (const island of this.islands) {
      const p = byIsland.get(island.index);
      _v.copy(island.center).setY(11).project(this.orbit.camera);
      if (_v.z > 1) continue;
      labels.push({
        x: ((_v.x + 1) / 2) * window.innerWidth,
        y: ((1 - _v.y) / 2) * window.innerHeight,
        text: p ? `${p.name}${p.isBot ? " [bot]" : ""}${p.key === this.myKey ? " (you)" : ""}` : "Empty",
        color: colorHex(island.index),
        mine: p?.key === this.myKey,
      });
    }
    hud.setLabels(labels);
  }

  _resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.orbit.resize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.detachCamera();
    for (const island of this.islands) island.dispose();
    for (const a of this.avatars.values()) a.dispose();
    for (const b of this.bombs.values()) b.view.dispose();
    for (const l of this.lanterns ?? []) l.dispose();
    this.build.dispose();
    this.hero?.dispose();
    this.touch?.dispose();
    this.rig.setMode("third");
    window.removeEventListener("keydown", this._onKey);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    this.canvas.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("wheel", this._onWheel);
    hud.setCharge(null);
    hud.setView("third");
    hud.hideBuildBar();
    this.clouds.dispose();
    this.aim.enabled = false;
    hud.setLabels([]);
    hud.setScoreboard([], null);
  }
}
