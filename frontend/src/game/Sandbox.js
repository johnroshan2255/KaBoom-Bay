import * as THREE from "three";
import {
  BOMB_BLAST_RADIUS,
  BOMB_FUSE_MS,
  BOMB_RADIUS,
  BOMB_RESPAWN_MS,
  COINS_SELF_DESTRUCT_PENALTY,
  WATER_LEVEL,
} from "@kaboom-bay/shared";
import { createRenderer } from "./rendering/renderer.js";
import { createScene } from "./rendering/scene.js";
import { OrbitCamera } from "./rendering/camera.js";
import { Effects } from "./rendering/effects.js";
import { Island } from "./islands/Island.js";
import { LocalBombSim } from "./bombs/LocalBombSim.js";
import { AimController } from "./bombs/AimController.js";
import { BombView } from "./bombs/BombView.js";
import { CrateView } from "./bombs/CrateView.js";
import { TrajectoryPreview } from "./bombs/TrajectoryPreview.js";
import { hud } from "../ui/hud.js";
import { PlayerAvatar } from "./characters/CharacterFactory.js";
import { Clouds } from "./rendering/Clouds.js";
import { sound } from "../audio/Sound.js";
import { PLAYER_COLORS } from "@kaboom-bay/shared";

const MAX_VISUAL_PULL = 1.6; // how far the held bomb visibly slides back while aiming
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Phase 1 offline sandbox: one island, drag-to-aim bombs with a live 10s fuse,
 * blasts carve the voxel terrain. Pick a landed bomb back up by tapping it.
 */
export class Sandbox {
  static async create(canvas, { seed = Date.now() % 100000 } = {}) {
    const sim = await LocalBombSim.create();
    return new Sandbox(canvas, sim, seed);
  }

  constructor(canvas, sim, seed) {
    this.canvas = canvas;
    this.sim = sim;
    this.renderer = createRenderer(canvas);
    const { scene, water } = createScene();
    this.scene = scene;
    this.water = water;
    this.orbit = new OrbitCamera(window.innerWidth / window.innerHeight);
    this.orbit.attach(canvas);
    this.effects = new Effects(scene);
    this.clouds = new Clouds(scene);
    this.preview = new TrajectoryPreview(scene);

    this.island = new Island(scene, { seed });
    this.sim.setTerrain(this.island.grid, this.island.origin);

    // Hero stands on the beach as far from palms as possible; the bomb waits just in front of them.
    const stand = this.island.padSpot();
    stand.y -= 0.5; // beachSpot is a cell centre; feet go on the cell's top face
    this.avatar = new PlayerAvatar(scene, { variant: 0, teamColor: PLAYER_COLORS[0] });
    this.avatar.place(stand, this.island.center);
    const inward = new THREE.Vector3().subVectors(this.island.center, stand).setY(0).normalize();
    this.pad = stand.clone().addScaledVector(inward, 1.1).add(new THREE.Vector3(0, 0.5 + BOMB_RADIUS, 0));
    this.orbit.target.copy(this.island.center).setY(4);
    this.orbit.yaw = Math.atan2(this.pad.x - this.island.center.x, this.pad.z - this.island.center.z);
    this.orbit.setDistance(62);
    this.orbit.pitch = 0.6;

    this.bombs = []; // landed / flying: { view, body, armedAt }
    this.padBomb = null; // unarmed bomb waiting on the launch pad: { view, anchor }
    this.held = null; // bomb currently being aimed: { view, armedAt, anchor }
    this.coins = 0;
    this.time = 0;
    this.respawnAt = 0;

    this.aim = new AimController(canvas, this.orbit.camera, {
      onStart: (hit) => this._onAimStart(hit),
      onPull: ({ pull, velocity }) => this._onPull(pull, velocity),
      onRelease: ({ velocity }) => this._onRelease(velocity),
      onCancel: () => this._onCancel(),
    });
    this.orbit.isPointerClaimed = (id) => this.aim.pointerId === id;

    this._spawnPadBomb();
    if (import.meta.env.DEV) window.__sandbox = this; // debugging aid, dev builds only
    hud.setCoins(0);
    hud.setHint("Drag back from the bomb and release to throw. Tap a landed bomb to pick it up. Drag anywhere else to orbit, pinch or wheel to zoom.");

    window.addEventListener("resize", () => this._resize());
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
    this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- bombs ----------

  _spawnPadBomb() {
    // Pad sits on whatever is left of the beach column after blasts.
    const g = this.island.worldToGrid(this.pad);
    const top = this.island.grid.columnTop(Math.floor(g.x), Math.floor(g.z));
    if (top >= 0) this.pad.y = this.island.origin.y + top + 1 + BOMB_RADIUS;
    const view = new BombView(this.scene);
    view.setPosition(this.pad);
    this.padBomb = { view, anchor: this.pad.clone() };
    this.aim.setAnchor(this.pad); // aim plane at pad height until something else is grabbed
  }

  _onAimStart(hit) {
    if (this.held) return false; // already aiming with another pointer

    // Tap a landed bomb to pick it back up - its fuse keeps ticking.
    const grabbed = this._findBombNear(hit, 1.4);
    const padDist = this.padBomb ? hit.distanceTo(this.padBomb.anchor) : Infinity;
    if (grabbed && grabbed.view.group.position.distanceTo(hit) <= padDist) {
      this.sim.removeBomb(grabbed.body);
      this.bombs.splice(this.bombs.indexOf(grabbed), 1);
      const pos = grabbed.view.group.position.clone();
      this.held = { view: grabbed.view, armedAt: grabbed.armedAt, anchor: pos };
      this.aim.setAnchor(pos);
      return true;
    }

    // Otherwise pick up the bomb waiting on the pad; picking it up lights the fuse.
    if (!this.padBomb || padDist > 3.5) return false;
    this.held = { view: this.padBomb.view, armedAt: performance.now(), anchor: this.padBomb.anchor };
    this.padBomb = null;
    this.aim.setAnchor(this.held.anchor);
    this.respawnAt = performance.now() + BOMB_RESPAWN_MS;
    return true;
  }

  _onPull(pull, velocity) {
    if (!this.held) return;
    const len = pull.length();
    const k = len > MAX_VISUAL_PULL ? MAX_VISUAL_PULL / len : 1;
    _p.copy(this.held.anchor).addScaledVector(pull, -k);
    this.held.view.setPosition(_p);
    const island = this.island;
    this.preview.show(this.held.anchor, velocity, (x, y, z) => y < WATER_LEVEL - 0.5 || island.isSolidAt(x, y, z));
  }

  _onRelease(velocity) {
    if (!this.held) return;
    const { view, armedAt, anchor } = this.held;
    const body = this.sim.spawnBomb(anchor, velocity);
    this.bombs.push({ view, body, armedAt });
    this.avatar.throwPose();
    sound.play("throw");
    this.held = null;
    this.preview.hide();
    hud.setFuse(null);
  }

  _onCancel() {
    if (this.held) this.held.view.setPosition(this.held.anchor);
    this.preview.hide();
  }

  _findBombNear(point, radius) {
    let best = null, bestD = radius;
    for (const b of this.bombs) {
      const d = b.view.group.position.distanceTo(point);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  _explode(position, { self = false } = {}) {
    const { removed, coins } = this.island.blast(position, BOMB_BLAST_RADIUS);
    if (removed.length) {
      this.sim.setTerrain(this.island.grid, this.island.origin);
      this.effects.burst(position, removed, this.island.grid, this.island.origin);
    }
    this.effects.explosion(position, BOMB_BLAST_RADIUS);
    this.orbit.addShake(0.7);
    sound.play("boom");
    this.sim.applyBlastImpulse(position, BOMB_BLAST_RADIUS, 40, this.bombs.map((b) => b.body));

    const delta = self ? COINS_SELF_DESTRUCT_PENALTY : coins;
    this.coins += delta;
    hud.setCoins(this.coins);
    hud.popText(this._toScreen(position), delta >= 0 ? `+${delta}` : `${delta}`, delta >= 0 ? "#ffd23f" : "#ff4b3e");
  }

  _toScreen(worldPos) {
    _p.copy(worldPos).project(this.orbit.camera);
    return { x: ((_p.x + 1) / 2) * window.innerWidth, y: ((1 - _p.y) / 2) * window.innerHeight };
  }

  // ---------- loop ----------

  _update(dt, now) {
    this.sim.step(dt);
    const cam = this.orbit.camera;

    // flying / resting bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      const t = b.body.translation();
      _p.set(t.x, t.y, t.z);
      const r = b.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      b.view.setPosition(_p);
      b.view.setRotation(_q);

      if (t.y < WATER_LEVEL - 0.6) {
        this.effects.splash(_p);
        this.sim.removeBomb(b.body);
        b.view.dispose();
        this.bombs.splice(i, 1);
        continue;
      }
      const remaining = BOMB_FUSE_MS - (now - b.armedAt);
      if (remaining <= 0) {
        this.sim.removeBomb(b.body);
        b.view.dispose();
        this.bombs.splice(i, 1);
        this._explode(_p.clone());
        continue;
      }
      b.view.updateFuse(remaining / BOMB_FUSE_MS, cam, this.time);
    }

    // bomb being aimed: fuse is live, holding too long blows it up in your hands
    if (this.held) {
      const remaining = BOMB_FUSE_MS - (now - this.held.armedAt);
      hud.setFuse(remaining / BOMB_FUSE_MS);
      if (remaining <= 0) {
        const pos = this.held.view.group.position.clone();
        this.held.view.dispose();
        this.held = null;
        this.preview.hide();
        this.aim._cancel();
        this._explode(pos, { self: true });
        hud.setFuse(null);
      } else {
        this.held.view.updateFuse(remaining / BOMB_FUSE_MS, cam, this.time);
      }
    }

    // unarmed bomb waiting on the pad
    if (this.padBomb) {
      this.padBomb.view.updateFuse(null, cam, this.time);
    } else if (!this.held && now >= this.respawnAt) {
      this._spawnPadBomb();
    }

    this.effects.update(dt);
    this.clouds.update(dt);
    this.water.update(dt);
    this.island.update(dt, this.time);
    this.avatar.update(dt, this.time);
    this.orbit.update(dt);
  }

  _frame(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    this.time += dt;
    this._update(dt, t);
    this.renderer.render(this.scene, this.orbit.camera);
    requestAnimationFrame((n) => this._frame(n));
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.orbit.resize(w, h);
  }
}
