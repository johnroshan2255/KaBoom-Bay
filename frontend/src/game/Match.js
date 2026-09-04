import * as THREE from "three";
import {
  BOMB_FUSE_MS,
  BOMB_TYPES,
  Block,
  BombStatus,
  BombType,
  CRATE_PICKUP_RADIUS,
  GameMode,
  ISLAND_COUNT,
  MatchPhase,
  Message,
  PLAYER_COLORS,
  TEAM_COLORS,
  WATER_LEVEL,
  islandCenter,
  pieceCells,
  rankPlayers,
  rankTeams,
  sameTeam,
  teamOf,
  activeIslands,
  blastKnockback,
  SUPPLY_DROP_FALL_MS,
} from "@kaboom-bay/shared";
import { CrateView } from "./bombs/CrateView.js";
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
import { FrameGovernor } from "./rendering/quality.js";
import { TouchControls, isTouchDevice } from "../ui/touch.js";
import { ChatPanel } from "../ui/chat.js";
import { cg } from "../platform/crazygames.js";
import { BOMB_MAX_THROW_POWER, BOMB_PICKUP_RADIUS, THROW_CHARGE_MS } from "@kaboom-bay/shared";

export const colorHex = (i) => `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16).padStart(6, "0")}`;
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const _v = new THREE.Vector3();

/**
 * Online match view (Phase 3): mirrors the server state - four islands generated from the
 * shared seed, pieces and terrain diffs applied to local voxel grids, players and phases in the HUD.
 * Building input arrives in Phase 4, bombs in Phase 5.
 */
export class Match {
  constructor(canvas, net, { onPlayAgain, onLeave } = {}) {
    this.canvas = canvas;
    this.net = net;
    this.room = net.room;
    this.onPlayAgain = onPlayAgain; // rejoin after an unrecoverable disconnect
    this.onLeave = onLeave; // back to the menu from the results screen
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
    this.governor = new FrameGovernor(); // lowers the graphics tier if this device can't keep up

    const seed = this.room.state.seed;
    this.islands = Array.from({ length: ISLAND_COUNT }, (_, i) => {
      const c = islandCenter(i);
      return new Island(scene, { index: i, seed: seed + i, center: new THREE.Vector3(c.x, c.y, c.z) });
    });
    this.avatars = new Map(); // islandIndex -> PlayerAvatar
    this.bombs = new Map(); // bombId -> { view, target, status, holder, armedAt, islandIndex }
    this.crates = new Map(); // crateId -> { view, target, landsAt, landed, islandIndex, type }
    this.aiming = null; // bomb record being pulled back
    this._pullOffset = new THREE.Vector3();
    this.dirty = new Set();
    this.pieceCells = new Map(); // pieceId -> { owner, cells }
    this.players = new Map(); // key -> snapshot
    this.myKey = this.room.sessionId;
    this.myIsland = 0;
    this.mode = this.room.state.mode || GameMode.FFA; // GameMode; fixed for the room's lifetime
    this.phase = null;

    this._bind();
    this._bindCombat();
    this._bindBuild();
    this._bindChat(); // before the touch controls, which hide their CHAT button when chat is disabled
    this._bindControls();
    this._focusIsland(this.myIsland);
    hud.setSound(sound.enabled, () => { sound.setEnabled(!sound.enabled); hud.setSound(sound.enabled); sound.play("click"); });
    hud.setView(this.rig.mode, () => this.toggleView());
    hud.setZoom(() => this.orbit.zoomIn(), () => this.orbit.zoomOut());
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._resize();
    {
      // compile every shader before the first frame: effects, a bomb with its fuse ring, the aim preview
      this._anchorBomb = new BombView(this.scene); // stays hidden in the scene so the bomb shaders stay resident
      this._anchorBomb.updateFuse(0.5, this.orbit.camera, 0);
      this.scene.remove(this._anchorBomb.group);
      this._anchorCrate = new CrateView(this.scene, "mega"); // same for the supply crate materials
      this.scene.remove(this._anchorCrate.group);
      this.preview.show(new THREE.Vector3(0, -50, 0), new THREE.Vector3(1, 1, 0), () => false);
      this.effects.prewarm(this.renderer, this.orbit.camera, [this._anchorBomb.group, this._anchorCrate.group]);
      this.preview.hide();
    }
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- state binding ----------

  _bind() {
    const { $ } = this.net;
    const state = this.room.state;

    $(state).players.onAdd((p, key) => {
      const snap = { key, name: p.name, islandIndex: p.islandIndex, team: p.team, coins: p.coins, ready: p.ready, connected: p.connected, isBot: p.isBot, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
      this.players.set(key, snap);
      for (const f of ["x", "y", "z", "yaw"]) $(p).listen(f, (v) => { snap[f] = v; });
      if (key === this.myKey && !this.hero) {
        this.hero = new HeroController({ island: this.islands[p.islandIndex], net: this.net, start: { x: p.x, y: p.y, z: p.z, yaw: p.yaw } });
        this.hero.onFall = (pos) => this._onHeroFell(pos);
      }
      if (key === this.myKey) {
        snap.selected = p.selected;
        const refresh = () => { snap.bombs = Object.fromEntries(p.bombs.entries()); this._refreshBombBar(); };
        $(p).listen("selected", (v) => { snap.selected = v; this._refreshBombBar(); });
        $(p).bombs.onAdd(refresh); $(p).bombs.onChange(refresh); $(p).bombs.onRemove(refresh);
        refresh();
      }
      if (key === this.myKey) hud.setCoins(p.coins);
      for (const f of ["name", "islandIndex", "team", "coins", "ready", "connected", "isBot"]) {
        $(p).listen(f, (v) => {
          const prev = snap[f];
          snap[f] = v;
          if (key === this.myKey && f === "coins") hud.setCoins(v);
          if (f === "islandIndex" && prev !== v) this._playerMoved(snap, prev, p);
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
      if (!island) return;
      for (const [x, y, z] of cells) island.grid.set(x, y, z, piece.type);
      this.pieceCells.set(id, { owner: piece.owner, cells });
      this.dirty.add(piece.owner);
    });
    $(state).pieces.onRemove((_piece, id) => {
      const rec = this.pieceCells.get(id);
      if (!rec) return;
      if (rec.owner === this.myIsland && this.phase === MatchPhase.BUILD) { sound.play("remove"); queueMicrotask(() => this._refreshBuildBar?.()); }
      for (const [x, y, z] of rec.cells) this.islands[rec.owner]?.grid.set(x, y, z, Block.AIR);
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

    $(state).listen("seed", (seed) => { if (this._seed !== undefined && seed !== this._seed) this._newRound(seed); this._seed = seed; });
    $(state).listen("islandCount", (n) => this._applyIslandSet(n));
    $(state).listen("hostId", () => { if (this.phase === MatchPhase.LOBBY) this._showWaiting(); });
    for (const f of ["botCount", "minutes", "buildMs", "code"]) $(state).listen(f, () => { this._pendingSettings = {}; if (this.phase === MatchPhase.LOBBY) this._showWaiting(); });
    $(state).listen("phase", (phase) => this._onPhase(phase));

    // The SDK retries a dropped connection on its own; the server keeps the seat for a few seconds.
    this.room.onDrop?.(() => {
      if (this.disposed) return;
      this._cancelCharge();
      this._onAimCancel();
      hud.setHint("Connection lost, reconnecting…");
    });
    this.room.onReconnect?.(() => {
      if (this.disposed) return;
      hud.setHint(this._hintFor(this.phase, this.rig.mode));
    });
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

  // ---------- chat ----------

  _bindChat() {
    if (cg.settings()?.disableChat) return; // portal setting: no chat at all
    this.chat = new ChatPanel({ teams: this.mode === GameMode.TEAMS, onSend: (text, team) => this.net.send(Message.CHAT, { text, team }) });
    this.room.onMessage(Message.CHAT, (m) => {
      this.chat?.add(m, { mine: m.from === this.myKey, teamsMode: this.mode === GameMode.TEAMS });
      if (m.from !== this.myKey) sound.play("click", { volume: 0.5 });
    });
    this._onChatKey = (e) => {
      if (!this.chat || e.target?.tagName === "INPUT") return;
      if (e.key === "Enter" || e.code === "KeyT") { e.preventDefault(); this.chat.open(); }
    };
    window.addEventListener("keydown", this._onChatKey);
    cg.onSettingsChange((s) => { if (s?.disableChat && this.chat) { this.chat.dispose(); this.chat = null; } });
  }

  // ---------- controls: view toggle, first-person input, touch ----------

  _bindControls() {
    this._onKey = (e) => {
      if (e.target?.tagName === "INPUT") return;
      if (e.code === "KeyV") this.toggleView();
      if (e.code === "KeyE") this.tryGrab();
      if (this.phase === MatchPhase.COMBAT) { const t = Object.keys(BOMB_TYPES).find((k) => BOMB_TYPES[k].key && `Digit${BOMB_TYPES[k].key}` === e.code); if (t) this.selectBomb(t); }
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
        onZoom: (dir) => (dir > 0 ? this.orbit.zoomIn() : this.orbit.zoomOut()),
        onChat: () => this.chat?.toggle(),
      });
      if (!this.chat) this.touch.chatBtn.hidden = true;
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
    if (mode !== "first") { this._cancelCharge(); if (this.phase === MatchPhase.BUILD) this._buildCamera(); else this._focusIsland(this.myIsland); }
    this.touch?.setContext({ phase: this.phase, mode });
    hud.setHint(this._hintFor(this.phase, mode));
  }

  /** Primary action: combat = charge & throw (first person / touch), build = place at crosshair. */
  primary(phase, fromTouch = false) {
    if (this.phase === MatchPhase.BUILD) {
      if (phase === "down") {
        // touch / first person: act at the screen centre; the REMOVE button toggles remove mode, PLACE then removes
        if (this.rig.mode === "first" || fromTouch) {
          if (this.rig.mode !== "first") this.build.updateCenterNear(); // touch: the centre often sits on a tree or wall, so look around it
          this.build.commit(this.build.mode === "remove" ? "remove" : "place");
        }
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

  /** My hero hit the water: splash, ask the server for a respawn (with a fallback so we never stay stuck). */
  _onHeroFell(pos) {
    this.effects.splash(new THREE.Vector3(pos.x, WATER_LEVEL, pos.z));
    sound.play("splash");
    hud.setHint("Splash! Swimming back to the beach…");
    this.net.send(Message.HERO_RESPAWN, { x: pos.x, z: pos.z });
    clearTimeout(this._respawnFallback);
    this._respawnFallback = setTimeout(() => {
      // server said no (cooldown / not knocked recently): stand back up where the server thinks we are
      const me = this.players.get(this.myKey);
      if (this.hero?.fallen && me) this.hero.teleport({ x: me.x, y: me.y, z: me.z, yaw: me.yaw });
    }, 1500);
  }

  _refreshBombBar() {
    const me = this.players.get(this.myKey);
    if (!me) return;
    hud.setBombState({ counts: me.bombs ?? {}, selected: me.selected ?? BombType.STANDARD });
  }

  /** SELECT_BOMB for a type (keys 1-4 or the bomb bar). Only types we hold can be chosen. */
  selectBomb(type) {
    const me = this.players.get(this.myKey);
    if (!BOMB_TYPES[type] || this.phase !== MatchPhase.COMBAT) return;
    if (type !== BombType.STANDARD && !(me?.bombs?.[type] > 0)) { sound.play("penalty", { volume: 0.3 }); return; }
    this.net.send(Message.SELECT_BOMB, type);
    sound.play("click");
  }

  _updateCrates() {
    const now = this.net.serverNow();
    for (const rec of this.crates.values()) {
      const fall = Math.min(1, Math.max(0, 1 - (rec.landsAt - now) / SUPPLY_DROP_FALL_MS));
      rec.view.update(rec.target, fall, rec.landed, this._time ?? 0);
      // walking over a landed crate on my island collects it
      if (rec.landed && rec.islandIndex === this.myIsland && this.hero && !this.hero.fallen && now - rec.lastTry > 400 && this.hero.pos.distanceTo(rec.target) <= CRATE_PICKUP_RADIUS) {
        rec.lastTry = now;
        this.net.send(Message.PICK_CRATE, rec.id);
      }
    }
  }

  /** Nearest landed crate on my island, or null. */
  _nearestCrate() {
    let best = null, bestD = Infinity;
    for (const rec of this.crates.values()) {
      if (!rec.landed || rec.islandIndex !== this.myIsland) continue;
      const d = Math.hypot(rec.target.x - this.hero.pos.x, rec.target.z - this.hero.pos.z);
      if (d < bestD) { best = rec; bestD = d; }
    }
    return best;
  }

  /** Grab the nearest live bomb resting on my island if the hero is close enough; otherwise walk to it. A crate counts too. */
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
    if (!best) {
      const crate = this._nearestCrate();
      if (!crate) return false;
      this.hero.moveTo(crate.target, () => this.net.send(Message.PICK_CRATE, crate.id));
      return true;
    }
    if (bestD <= BOMB_PICKUP_RADIUS) { this.net.send(Message.GRAB_BOMB, best.id); sound.play("grab"); return true; }
    this.hero.moveTo(best.target, () => { this.net.send(Message.GRAB_BOMB, best.id); sound.play("grab"); });
    return true;
  }

  _hintFor(phase, mode) {
    const move = isTouchDevice() ? "Joystick to walk, drag to look around, pinch or +/- to zoom." : "WASD to walk, drag to look around, V cycles 3RD / TOP / 1ST view, wheel or +/- zooms.";
    const team = this.mode === GameMode.TEAMS && phase === MatchPhase.COMBAT ? " Bombing your teammate's island earns nothing." : "";
    if (phase === MatchPhase.BUILD) return mode === "first"
      ? `Build: aim with the crosshair, click to place, right-click removes, wheel cycles pieces, R rotates. ${move}`
      : `Build: pick a piece, hover your island and click to place. R rotates, right-click or Remove deletes. ${move}`;
    const pick = isTouchDevice() ? "Tap the bomb bar to pick a bomb type." : "1-4 pick a bomb type.";
    if (phase === MatchPhase.COMBAT) return mode === "first"
      ? `Hold to charge, release to throw. ${isTouchDevice() ? "GRAB takes" : "E grabs"} a landed bomb or a supply crate. ${pick}${team} ${move}`
      : `Drag back from your bomb and release to lob it. Tap a landed bomb or a supply crate to run over and grab it. ${pick}${team} ${move}`;
    return "";
  }

  _buildCamera() {
    const c = this.islands[this.myIsland]?.center;
    if (!c) return;
    this.orbit.target.set(c.x, 5, c.z);
    this.orbit.setDistance(58);
    if (this.rig.mode !== "top") this.orbit.pitch = 0.78;
  }

  // ---------- combat ----------

  _bindCombat() {
    const { $ } = this.net;
    const state = this.room.state;

    $(state).bombs.onAdd((bomb, id) => {
      const view = new BombView(this.scene);
      const rec = { id, view, target: new THREE.Vector3(bomb.x, bomb.y, bomb.z), status: bomb.status, holder: bomb.holder, armedAt: bomb.armedAt, islandIndex: bomb.islandIndex, owner: bomb.owner, type: bomb.type };
      view.setType(bomb.type);
      $(bomb).listen("type", (v) => { rec.type = v; view.setType(v); });
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

    $(state).crates.onAdd((c, id) => {
      const rec = { id, view: new CrateView(this.scene, c.type), target: new THREE.Vector3(c.x, c.y, c.z), landsAt: c.landsAt, landed: c.landed, islandIndex: c.islandIndex, type: c.type, lastTry: 0 };
      $(c).listen("landed", (v) => { rec.landed = v; if (v && rec.islandIndex === this.myIsland) sound.play("place", { volume: 0.6 }); });
      this.crates.set(id, rec);
    });
    $(state).crates.onRemove((_c, id) => {
      const rec = this.crates.get(id);
      if (!rec) return;
      if (rec.landed && rec.islandIndex === this.myIsland && this.hero && this.hero.pos.distanceTo(rec.target) < CRATE_PICKUP_RADIUS + 1.5) {
        hud.popText(this._toScreen(rec.target), `${BOMB_TYPES[rec.type]?.name.toUpperCase() ?? "BOMB"} BOMB!`, "#ffd23f");
        sound.play("coin");
      }
      rec.view.dispose();
      this.crates.delete(id);
    });
    this.room.onMessage(Message.SUPPLY_DROP, ({ islandIndex }) => { if (islandIndex === this.myIsland) { sound.play("phase", { volume: 0.4 }); hud.setHint("Supply drop incoming! Walk over the crate to grab its bomb."); setTimeout(() => this.phase === MatchPhase.COMBAT && hud.setHint(this._hintFor(this.phase, this.rig.mode)), 3500); } });
    this.room.onMessage(Message.HERO_FELL, ({ by, x, z }) => { if (by !== this.myKey) { this.effects.splash(new THREE.Vector3(x, WATER_LEVEL, z)); sound.play("splash", { volume: 0.5 }); } });
    this.room.onMessage(Message.HERO_RESPAWN, (pose) => {
      clearTimeout(this._respawnFallback);
      this.hero?.teleport(pose);
      hud.setHint(this._hintFor(this.phase, this.rig.mode));
      if (this.rig.mode !== "first") this._focusIsland(this.myIsland);
    });

    this.room.onMessage(Message.BOMB_EXPLODED, (m) => {
      const pos = new THREE.Vector3(m.x, m.y, m.z);
      this.effects.explosion(pos, m.radius);
      const mine = this.islands[this.myIsland]?.center ?? pos;
      const d = Math.hypot(pos.x - mine.x, pos.z - mine.z);
      this.orbit.addShake(d < 20 ? Math.min(1.2, 0.8 * (m.radius / 3)) : 0.25);
      // blast wave throws my hero (the server moves bots; humans animate their own flight)
      if (this.hero && !this.hero.fallen) {
        const v = blastKnockback(this.hero.pos, pos, m.radius);
        if (v) { this.hero.knockback(v); this._cancelCharge(); this._onAimCancel(); sound.play("throw", { volume: 0.5 }); }
      }
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
    this.orbit.isPointerClaimed = (id) => this.aim.pointerId === id;
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
    if (this.phase !== MatchPhase.COMBAT || this.rig.mode === "first") return false;
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
    else {
      // tap a landed crate on my island to run over and collect it
      for (const rec of this.crates.values()) {
        if (rec.landed && rec.islandIndex === this.myIsland && rec.target.distanceTo(hit) < 2) { this.hero?.moveTo(rec.target, () => this.net.send(Message.PICK_CRATE, rec.id)); break; }
      }
    }
    return false;
  }

  _onPull(pull, velocity) {
    if (!this.aiming) return;
    const len = pull.length();
    const k = len > 1.6 ? 1.6 / len : 1;
    this._pullOffset.copy(pull).multiplyScalar(-k);
    this.aiming.view.setPosition(_v.copy(this.aiming.target).add(this._pullOffset));
    this.preview.show(this.aiming.target, velocity, (x, y, z) => y < WATER_LEVEL - 0.5 || this.islands.some((isl) => isl?.isSolidAt(x, y, z)));
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
        cg.hideInviteButton();
        this._applyIslandSet(this.room.state.islandCount);
        sound.play("phase");
        cg.gameplayStart();
        if (this.rig.mode !== "first") this._buildCamera();
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
        hud.showBombBar({ types: Object.entries(BOMB_TYPES).filter(([, d]) => d.key).map(([type, d]) => ({ type, name: d.name, color: `#${d.color.toString(16).padStart(6, "0")}`, key: d.key })), onSelect: (t) => this.selectBomb(t) });
        this._refreshBombBar();
        if (this.rig.mode !== "first") this._focusIsland(this.myIsland);
        hud.setHint(this._hintFor(phase, this.rig.mode));
        this.touch?.setContext({ phase, mode: this.rig.mode });
        break;
      case MatchPhase.RESULTS: {
        const ranked = rankPlayers([...this.players.values()]);
        const won = this.mode === GameMode.TEAMS
          ? rankTeams(ranked, this.mode).find((t) => t.members.some((p) => p.key === this.myKey))?.rank === 1
          : ranked.find((p) => p.key === this.myKey)?.rank === 1;
        sound.play(won ? "win" : "lose");
        cg.gameplayStop();
        if (won) cg.happytime();
        this._cancelCharge();
        hud.hideBombBar();
        this.rig.setMode("third");
        this.touch?.setContext({ phase, mode: this.rig.mode });
        hud.setHint("");
        lobby.showResults({ ranked, myKey: this.myKey, mode: this.mode, nextRoundMs: this.room.state.phaseEndsAt - this.net.serverNow(), onLeave: () => this.onLeave?.() });
        // natural break between rounds: the only place a midgame ad is requested (the SDK enforces its own cooldown)
        cg.midgameAd({ onStart: () => sound.duck(true), onEnd: () => sound.duck(false) });
        break;
      }
    }
  }

  /**
   * The server reset the room for another round with the same people: rebuild the bay from the new seed,
   * put my hero back on its (possibly new) island and clear everything from the last match.
   */
  _newRound(seed) {
    this._cancelCharge();
    this._onAimCancel();
    for (const b of this.bombs.values()) b.view.dispose(); this.bombs.clear();
    for (const c of this.crates.values()) c.view.dispose(); this.crates.clear();
    for (const a of this.avatars.values()) a.dispose(); this.avatars.clear();
    for (const l of this.lanterns?.values() ?? []) l.dispose(); this.lanterns?.clear();
    for (const island of this.islands) island?.dispose();
    this.pieceCells.clear();
    this.dirty.clear();
    this.islands = Array.from({ length: ISLAND_COUNT }, (_, i) => {
      const c = islandCenter(i);
      return new Island(this.scene, { index: i, seed: seed + i, center: new THREE.Vector3(c.x, c.y, c.z) });
    });
    const me = this.room.state.players.get(this.myKey);
    if (me) {
      this.myIsland = me.islandIndex;
      this.hero?.teleport({ x: me.x, y: me.y, z: me.z, yaw: me.yaw });
      if (this.hero) this.hero.island = this.islands[me.islandIndex];
      this.build.island = this.islands[me.islandIndex];
    }
    this.build.setEnabled(false);
    hud.hideBombBar();
    hud.setFuse(null);
    this._playersChanged();
    this._focusIsland(this.myIsland);
  }

  /** The room decided how many islands are in play: drop the ones nobody uses (their bots, lanterns, meshes). */
  _applyIslandSet(count) {
    if (this.room.state.phase === MatchPhase.LOBBY) return; // decided at match start
    const keep = new Set(activeIslands(count));
    // the same state update may have re-seated me: follow the server before anything reads my old island
    const me = this.room.state.players.get(this.myKey);
    if (me && me.islandIndex !== this.myIsland) this._playerMoved(this.players.get(this.myKey) ?? { key: this.myKey, islandIndex: me.islandIndex }, this.myIsland, me);
    this.islands.forEach((island, i) => {
      if (!island || keep.has(i)) return;
      island.dispose();
      this.islands[i] = undefined;
      this.avatars.get(i)?.dispose(); this.avatars.delete(i);
      this.lanterns?.get(i)?.dispose(); this.lanterns?.delete(i);
    });
  }

  /** Display colour of an island: its own colour in free-for-all, the team colour in teams mode. */
  islandColor(islandIndex) {
    return this.mode === GameMode.TEAMS ? TEAM_COLORS[teamOf(islandIndex, this.mode)] : PLAYER_COLORS[islandIndex % PLAYER_COLORS.length];
  }

  /** A lobby team switch moved a player to another island: rebuild their avatar there (and my hero). */
  _playerMoved(snap, fromIsland, p) {
    const old = this.avatars.get(fromIsland);
    if (old) { old.dispose(); this.avatars.delete(fromIsland); }
    const lantern = this.lanterns?.get(fromIsland);
    if (lantern) { lantern.dispose(); this.lanterns.delete(fromIsland); }
    if (snap.key === this.myKey) {
      this._focusIsland(snap.islandIndex);
      if (this.hero) { this.hero.island = this.islands[snap.islandIndex]; this.hero.pos.set(p.x, p.y, p.z); this.hero.yaw = p.yaw; this.hero.auto = null; }
    }
  }

  _playersChanged() {
    for (const p of this.players.values()) {
      if (this.avatars.has(p.islandIndex) || !this.islands[p.islandIndex]) continue;
      const island = this.islands[p.islandIndex];
      const stand = new THREE.Vector3(p.x, p.y, p.z);
      const avatar = new PlayerAvatar(this.scene, { variant: p.islandIndex, teamColor: this.islandColor(p.islandIndex) });
      avatar.place(stand, island.center);
      this.avatars.set(p.islandIndex, avatar);
      const side = new THREE.Vector3().subVectors(island.center, stand).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(1.6);
      (this.lanterns ??= new Map()).set(p.islandIndex, new Lantern(this.scene, stand.clone().add(side)));
    }
    hud.setScoreboard([...this.players.values()], this.myKey, this.mode);
    if (this.phase === MatchPhase.LOBBY) this._showWaiting();
  }

  _showWaiting() {
    const state = this.room.state;
    // portal "invite" button while the room can still be joined
    if (state.players.size < 4 && state.code) cg.showInviteButton({ code: state.code }); else cg.hideInviteButton();
    lobby.showWaiting({
      players: [...this.players.values()].map((p) => ({ ...p, isHost: p.key === state.hostId })),
      myKey: this.myKey,
      mode: this.mode,
      durations: state.buildMs ? { buildMs: state.buildMs, combatMs: state.combatMs } : undefined,
      countdownMs: state.phaseEndsAt ? state.phaseEndsAt - this.net.serverNow() : null,
      onReady: (ready) => { this.net.send(Message.PLAYER_READY, ready); sound.play("click"); },
      onStartNow: () => { this.net.send(Message.START_NOW); sound.play("click"); },
      onJoinTeam: (team) => { this.net.send(Message.SWITCH_TEAM, { team }); sound.play("click"); },
      isHost: state.hostId === this.myKey,
      code: state.code,
      isPrivate: state.isPrivate,
      onLeave: () => this.onLeave?.(),
      settings: { bots: state.botCount, minutes: state.minutes },
      onSettings: (key, delta) => { // quick repeated clicks each move one step: count from the value we last sent until the server echoes it
        this._pendingSettings ??= {};
        const live = key === "bots" ? this.room.state.botCount : this.room.state.minutes;
        const next = (this._pendingSettings[key] ?? live) + delta;
        this._pendingSettings[key] = next;
        this.net.send(Message.LOBBY_SETTINGS, { [key]: next });
        sound.play("click");
      },
    });
  }

  _focusIsland(index) {
    this.myIsland = index;
    if (this.build) this.build.island = this.islands[index];
    const c = this.islands[index]?.center;
    if (!c) return;
    this.orbit.yaw = Math.atan2(c.x, c.z);
    if (this.rig?.mode === "top") {
      // straight down on your own island; zoom out to see the whole bay
      this.orbit.target.set(c.x, 3, c.z);
      this.orbit.setDistance(95);
    } else {
      // from behind your island towards the bay centre so all four islands are in frame
      this.orbit.target.set(c.x * 0.5, 3, c.z * 0.5);
      this.orbit.setDistance(125);
      this.orbit.pitch = 0.66;
    }
  }

  // ---------- loop ----------

  _frame(t) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (t - (this._last ?? t)) / 1000);
    this._last = t;

    for (const i of this.dirty) this.islands[i]?.rebuild();
    this.dirty.clear();

    const state = this.room.state;
    const remaining = state.phaseEndsAt ? state.phaseEndsAt - this.net.serverNow() : 0;
    hud.setPhase(state.phase, remaining);
    if (state.phase === MatchPhase.LOBBY && state.phaseEndsAt) lobby.setCountdown(remaining);
    if (state.phase === MatchPhase.RESULTS) lobby.setNextRound(remaining);

    this._time = (this._time ?? 0) + dt;
    this.governor.sample(dt);
    this._updateHeroes(dt);
    if ((this._frameNo = (this._frameNo ?? 0) + 1) % 3 === 0) this._updateLabels(); // DOM writes at ~20 Hz are plenty
    this._updateBombs(dt);
    this._updateCrates();
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
        this.preview.show(held.target, v, (x, y, z) => y < WATER_LEVEL - 0.5 || this.islands.some((isl) => isl?.isSolidAt(x, y, z)));
      }
    }
    this.effects.update(dt);
    this.clouds.update(dt);
    for (const island of this.islands) island?.update(dt, this._time);
    for (const a of this.avatars.values()) a.update(dt, this._time);
    this.aim.enabled = this.rig.mode !== "first" && this.phase === MatchPhase.COMBAT;
    for (const l of this.lanterns?.values() ?? []) l.update(dt, this._time);
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
      if (!island) continue;
      const p = byIsland.get(island.index);
      _v.copy(island.center).setY(11).project(this.orbit.camera);
      if (_v.z > 1) continue;
      labels.push({
        x: ((_v.x + 1) / 2) * window.innerWidth,
        y: ((1 - _v.y) / 2) * window.innerHeight,
        text: p ? `${p.name}${p.isBot ? " [bot]" : ""}${p.key === this.myKey ? " (you)" : this.mode === GameMode.TEAMS && sameTeam(island.index, this.myIsland, this.mode) ? " (team)" : ""}` : "Empty",
        color: hex(this.islandColor(island.index)),
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
    if (this.phase === MatchPhase.BUILD || this.phase === MatchPhase.COMBAT) cg.gameplayStop(); // leaving mid-match ends the gameplay session
    cg.hideInviteButton();
    window.removeEventListener("keydown", this._onChatKey);
    this.chat?.dispose();
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.detachCamera();
    for (const island of this.islands) island?.dispose();
    for (const a of this.avatars.values()) a.dispose();
    for (const b of this.bombs.values()) b.view.dispose();
    for (const c of this.crates.values()) c.view.dispose();
    clearTimeout(this._respawnFallback);
    hud.hideBombBar();
    for (const l of this.lanterns?.values() ?? []) l.dispose();
    this.build.dispose();
    this.hero?.dispose();
    this.touch?.dispose();
    this.rig.setMode("third");
    this.rig.dispose();
    this.aim.dispose();
    window.removeEventListener("keydown", this._onKey);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    this.canvas.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("wheel", this._onWheel);
    hud.setCharge(null);
    hud.setView("third");
    hud.hideBuildBar();
    this.clouds.dispose();
    this.effects.dispose();
    this._anchorBomb?.dispose();
    this._anchorCrate?.dispose();
    this.scene.dispose?.();
    this.aim.enabled = false;
    hud.setLabels([]);
    hud.setScoreboard([], null);
  }
}
