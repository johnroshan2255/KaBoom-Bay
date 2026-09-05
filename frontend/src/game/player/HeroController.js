import * as THREE from "three";
import { GRAVITY, HERO_JUMP_SPEED, HERO_SPEED, MOVE_SEND_HZ, Message, WATER_LEVEL } from "@kaboom-bay/shared";

// physical key codes: the same keys move on QWERTY (WASD) and AZERTY (ZQSD); arrows always work
const KEYS = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };

/**
 * Moves the local hero over their island's voxel terrain: WASD / arrows / virtual joystick relative
 * to the camera, one-block step-ups, a steerable jump (Space / JUMP) that clears two blocks, no walking
 * off the island. Sends MOVE to the server at 15 Hz. `moveTo()` auto-runs to a point (tap-to-grab).
 */
export class HeroController {
  constructor({ island, net, start }) {
    this.island = island;
    this.net = net;
    this.pos = new THREE.Vector3(start.x, start.y, start.z);
    this.yaw = start.yaw ?? 0;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.auto = null;
    this.moving = false;
    this._lastSent = 0;
    this._sent = { x: Infinity, y: Infinity, z: Infinity, yaw: Infinity }; // Infinity, not NaN: NaN never compares "changed"
    this.enabled = true;
    this.vel = new THREE.Vector3(); // knockback / jump velocity while airborne
    this.airborne = false;
    this.jumping = false; // airborne by choice: still steerable, lands on the first ledge within a step
    this.dead = false; // bombed: no input until the server respawns us
    this.extraGrids = []; // capture the flag: the arena and the other islands are walkable too
    this.tether = null; // { x, z, r }: holding a contested flag keeps us within r of the other holders
    this.fallen = false; // in the water, waiting for the server to respawn us
    this.onFall = null; // (pos) => void

    this._down = (e) => { if (e.target?.tagName === "INPUT") return; const k = KEYS[e.code]; if (k) { this.keys.add(k); this.auto = null; } };
    this._up = (e) => { const k = KEYS[e.code]; if (k) this.keys.delete(k); };
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    this._blur = () => this.keys.clear();
    window.addEventListener("blur", this._blur);
  }

  setJoystick(x, y) {
    this.joy.x = x;
    this.joy.y = y;
    if (x || y) this.auto = null;
  }

  /** Auto-run to a world point along walkable cells (palms, cliffs and walls are routed around); onArrive within 0.6 units. */
  moveTo(target, onArrive) {
    const path = this._path(target);
    if (!path) return false;
    this.auto = { target: target.clone(), onArrive, path, stuck: 0 };
    return true;
  }

  /**
   * Breadth-first search over the island grid from the hero's cell to the cell under `target`.
   * A step is walkable when it climbs at most one block (any drop is fine). Returns world-space
   * waypoints (cell centres, start cell excluded) or null when the target can't be reached.
   */
  _path(target) {
    const { grid, origin } = this.island;
    const sx = Math.floor(this.pos.x - origin.x), sz = Math.floor(this.pos.z - origin.z);
    const tx = Math.floor(target.x - origin.x), tz = Math.floor(target.z - origin.z);
    const inside = (x, z) => x >= 0 && z >= 0 && x < grid.sizeX && z < grid.sizeZ;
    if (!inside(sx, sz) || !inside(tx, tz)) return null;
    if (sx === tx && sz === tz) return [];
    const W = grid.sizeX, key = (x, z) => z * W + x;
    const prev = new Int32Array(W * grid.sizeZ).fill(-1);
    const feet = new Int16Array(W * grid.sizeZ);
    prev[key(sx, sz)] = key(sx, sz);
    feet[key(sx, sz)] = Math.floor(this.pos.y - origin.y + 1e-3);
    const queue = [[sx, sz]];
    for (let qi = 0; qi < queue.length; qi++) {
      const [x, z] = queue[qi];
      if (x === tx && z === tz) break;
      const h = feet[key(x, z)];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inside(nx, nz) || prev[key(nx, nz)] !== -1) continue;
        const nf = grid.surfaceAt(nx, nz, h); // one block up at most, walking under overhangs is fine
        if (nf < 0) continue;
        prev[key(nx, nz)] = key(x, z);
        feet[key(nx, nz)] = nf;
        queue.push([nx, nz]);
      }
    }
    if (prev[key(tx, tz)] === -1) return null;
    const cells = [];
    for (let k = key(tx, tz); k !== key(sx, sz); k = prev[k]) cells.push(k);
    cells.reverse();
    return cells.map((k) => new THREE.Vector3(origin.x + (k % W) + 0.5, 0, origin.z + Math.floor(k / W) + 0.5));
  }

  /** A blast throws the hero: ballistic flight, no ground clamping until they land (or splash). */
  knockback({ vx, vy, vz }) {
    if (this.fallen) return;
    this.vel.set(vx, vy, vz);
    this.airborne = true;
    this.jumping = false;
    this.auto = null;
  }

  /** Space / JUMP: hop about two blocks high; walking input keeps steering in the air. Returns false when already airborne. */
  jump() {
    if (!this.enabled || this.fallen || this.dead || this.airborne) return false;
    this.vel.set(0, HERO_JUMP_SPEED, 0);
    this.airborne = true;
    this.jumping = true;
    this.auto = null;
    return true;
  }

  /** Start falling (walked off an edge, or the ground was blown away). Steerable like a jump; a splash ends it. */
  _fall() {
    this.vel.set(0, 0, 0);
    this.airborne = true;
    this.jumping = true;
    this.auto = null;
  }

  /** May we stand at (nx, nz)? Beyond the tug-of-war tether only if it brings us back in. */
  _tetherOk(nx, nz) {
    const t = this.tether;
    if (!t) return true;
    const dNew = Math.hypot(nx - t.x, nz - t.z), dOld = Math.hypot(this.pos.x - t.x, this.pos.z - t.z);
    return dNew <= t.r || dNew <= dOld;
  }

  /** Walking direction from keys + joystick, camera-relative; [0, 0] when idle. */
  _inputDir(cameraYaw) {
    if (!this.enabled) return [0, 0];
    let ix = this.joy.x, iz = this.joy.y;
    if (this.keys.has("f")) iz += 1;
    if (this.keys.has("b")) iz -= 1;
    if (this.keys.has("l")) ix -= 1;
    if (this.keys.has("r")) ix += 1;
    if (!ix && !iz) return [0, 0];
    const f = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
    const r = { x: -Math.cos(cameraYaw), z: Math.sin(cameraYaw) }; // forward x up (Y-up, right-handed): screen right
    let wx = f.x * iz + r.x * ix, wz = f.z * iz + r.z * ix;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    return [wx, wz];
  }

  /** Server put us back on the beach after a fall. */
  teleport({ x, y, z, yaw }) {
    this.pos.set(x, y, z);
    if (Number.isFinite(yaw)) this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.airborne = false;
    this.jumping = false;
    this.fallen = false;
    this.dead = false;
    this.enabled = true;
    this._sent = { x: Infinity, y: Infinity, z: Infinity, yaw: Infinity };
  }

  /** Grids the hero may stand on: their island first, then (capture the flag) the arena and rival islands. */
  _grids() { return this.extraGrids.length ? [this.island, ...this.extraGrids] : [this.island]; }

  /** Feet height where something falling from the sky lands at (nx, nz), or null over open water. */
  groundRaw(nx, nz) {
    for (const { grid, origin } of this._grids()) {
      const gx = Math.floor(nx - origin.x), gz = Math.floor(nz - origin.z);
      if (!grid.inBounds(gx, 0, gz)) continue;
      const feet = grid.surfaceAt(gx, gz, grid.sizeY - 1);
      if (feet >= 0) return origin.y + feet;
    }
    return null;
  }

  /** Feet height if (nx, nz) is walkable from the current height (one block up, canopies overhead ignored), else null. */
  groundAt(nx, nz) {
    for (const { grid, origin } of this._grids()) {
      const gx = Math.floor(nx - origin.x), gz = Math.floor(nz - origin.z);
      if (!grid.inBounds(gx, 0, gz)) continue;
      const feet = grid.surfaceAt(gx, gz, Math.floor(this.pos.y - origin.y + 1e-3));
      if (feet >= 0) return origin.y + feet;
    }
    return null;
  }

  update(dt, cameraYaw, faceYaw = null) {
    if (this.dead) return;
    if (this.airborne) {
      if (this.jumping) {
        // steer in the air; a column counts as passable when it has a surface no higher than a step above our current height,
        // so the top of a two-block wall opens up near the apex
        const [wx, wz] = this._inputDir(cameraYaw);
        if (wx || wz) {
          const step = HERO_SPEED * dt;
          const nx = this.pos.x + wx * step, nz = this.pos.z + wz * step;
          // in the air a column is passable when it has a surface within a step, or nothing at all (we keep falling over it)
          if ((this.groundAt(nx, this.pos.z) !== null || this.groundRaw(nx, this.pos.z) === null) && this._tetherOk(nx, this.pos.z)) this.pos.x = nx;
          if ((this.groundAt(this.pos.x, nz) !== null || this.groundRaw(this.pos.x, nz) === null) && this._tetherOk(this.pos.x, nz)) this.pos.z = nz;
          if (faceYaw === null) this.yaw = Math.atan2(wx, wz);
        }
      }
      this.vel.y += GRAVITY * dt;
      this.pos.addScaledVector(this.vel, dt);
      const g = this.jumping ? this.groundAt(this.pos.x, this.pos.z) : this.groundRaw(this.pos.x, this.pos.z);
      if (this.vel.y <= 0 && g !== null && this.pos.y <= g) {
        this.pos.y = g; // landed (a jump also "grabs" a ledge up to one step above)
        this.airborne = false;
        this.jumping = false;
        this.vel.set(0, 0, 0);
      } else if (this.pos.y < WATER_LEVEL - 0.4) {
        this.airborne = false;
        this.jumping = false;
        this.fallen = true;
        this.enabled = false;
        this.onFall?.(this.pos.clone());
      }
      if (faceYaw !== null) this.yaw = faceYaw;
      this.moving = true;
      this._send();
      return;
    }
    if (this.fallen) return;
    const [ix, iz] = this._inputDir(cameraYaw);
    let wx = 0, wz = 0;
    if (this.auto) {
      const d = Math.hypot(this.auto.target.x - this.pos.x, this.auto.target.z - this.pos.z);
      if (d < 0.6) { const cb = this.auto.onArrive; this.auto = null; cb?.(); }
      else {
        const path = this.auto.path;
        while (path.length > 1 && Math.hypot(path[0].x - this.pos.x, path[0].z - this.pos.z) < 0.35) path.shift();
        const wp = path[0] ?? this.auto.target;
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, wd = Math.hypot(dx, dz) || 1;
        wx = dx / wd; wz = dz / wd;
      }
    } else if (ix || iz) {
      wx = ix; wz = iz; // _inputDir is already camera-relative and normalised
    }

    this.moving = !!(wx || wz);
    const before = this.auto ? { x: this.pos.x, z: this.pos.z } : null;
    if (this.moving) {
      const step = HERO_SPEED * dt;
      const nx = this.pos.x + wx * step;
      let y = this.groundAt(nx, this.pos.z);
      if (y !== null && this._tetherOk(nx, this.pos.z)) { this.pos.x = nx; this.pos.y = y; }
      else if (y === null && this.groundRaw(nx, this.pos.z) === null && this._tetherOk(nx, this.pos.z)) { this.pos.x = nx; this._fall(); } // off the edge
      const nz = this.pos.z + wz * step;
      y = this.groundAt(this.pos.x, nz);
      if (y !== null && this._tetherOk(this.pos.x, nz)) { this.pos.z = nz; this.pos.y = y; }
      else if (y === null && this.groundRaw(this.pos.x, nz) === null && this._tetherOk(this.pos.x, nz)) { this.pos.z = nz; this._fall(); }
      if (faceYaw === null) this.yaw = Math.atan2(wx, wz);
    } else {
      // terrain may have been blasted from under us: step down, or fall if nothing is left
      const y = this.groundAt(this.pos.x, this.pos.z);
      if (y !== null) this.pos.y = y;
      else if (this.groundRaw(this.pos.x, this.pos.z) === null) this._fall();
    }
    if (faceYaw !== null) this.yaw = faceYaw;
    if (this.auto && before) {
      // Terrain changed under the route (blast, new wall): re-plan once, give up if there is no way.
      const progressed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) > HERO_SPEED * dt * 0.2;
      this.auto.stuck = progressed ? 0 : this.auto.stuck + dt;
      if (this.auto.stuck > 0.4) {
        const path = this._path(this.auto.target);
        if (!path || this.auto.replanned) this.auto = null;
        else { this.auto.path = path; this.auto.stuck = 0; this.auto.replanned = true; }
      }
    }
    this._send();
  }

  _send() {
    const now = performance.now();
    if (now - this._lastSent >= 1000 / MOVE_SEND_HZ) {
      const s = this._sent;
      if (Math.abs(s.x - this.pos.x) > 1e-3 || Math.abs(s.y - this.pos.y) > 1e-3 || Math.abs(s.z - this.pos.z) > 1e-3 || Math.abs(s.yaw - this.yaw) > 1e-2) {
        this.net.send(Message.MOVE, { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw });
        s.x = this.pos.x; s.y = this.pos.y; s.z = this.pos.z; s.yaw = this.yaw;
        this._lastSent = now;
      }
    }
  }

  dispose() {
    window.removeEventListener("keydown", this._down);
    window.removeEventListener("keyup", this._up);
    window.removeEventListener("blur", this._blur);
  }
}
