import * as THREE from "three";
import { HERO_SPEED, HERO_STEP_HEIGHT, MOVE_SEND_HZ, Message } from "@kaboom-bay/shared";

const KEYS = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r" };

/**
 * Moves the local hero over their island's voxel terrain: WASD / arrows / virtual joystick relative
 * to the camera, one-block step-ups, no walking off the island. Sends MOVE to the server at 15 Hz.
 * `moveTo()` auto-runs to a point (tap-to-grab on touch / third person).
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
    this._sent = { x: Infinity, z: Infinity, yaw: Infinity }; // Infinity, not NaN: NaN never compares "changed"
    this.enabled = true;

    this._down = (e) => { if (e.target?.tagName === "INPUT") return; const k = KEYS[e.key.toLowerCase()]; if (k) { this.keys.add(k); this.auto = null; } };
    this._up = (e) => { const k = KEYS[e.key.toLowerCase()]; if (k) this.keys.delete(k); };
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    window.addEventListener("blur", () => this.keys.clear());
  }

  setJoystick(x, y) {
    this.joy.x = x;
    this.joy.y = y;
    if (x || y) this.auto = null;
  }

  /** Auto-run to a world point; calls onArrive when within 0.6 units. */
  moveTo(target, onArrive) {
    this.auto = { target: target.clone(), onArrive };
  }

  /** Feet height if (nx, nz) is walkable from the current height, else null. */
  groundAt(nx, nz) {
    const { grid, origin } = this.island;
    const gx = Math.floor(nx - origin.x), gz = Math.floor(nz - origin.z);
    if (gx < 0 || gz < 0 || gx >= grid.sizeX || gz >= grid.sizeZ) return null;
    const top = grid.columnTop(gx, gz);
    if (top < 0) return null;
    const ny = origin.y + top + 1;
    return ny - this.pos.y > HERO_STEP_HEIGHT ? null : ny;
  }

  update(dt, cameraYaw, faceYaw = null) {
    let ix = 0, iz = 0;
    if (this.enabled) {
      if (this.keys.has("f")) iz += 1;
      if (this.keys.has("b")) iz -= 1;
      if (this.keys.has("l")) ix -= 1;
      if (this.keys.has("r")) ix += 1;
      ix += this.joy.x;
      iz += this.joy.y;
    }
    let wx = 0, wz = 0;
    if (this.auto) {
      const dx = this.auto.target.x - this.pos.x, dz = this.auto.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) { const cb = this.auto.onArrive; this.auto = null; cb?.(); }
      else { wx = dx / d; wz = dz / d; }
    } else if (ix || iz) {
      const f = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
      const r = { x: Math.cos(cameraYaw), z: -Math.sin(cameraYaw) };
      wx = f.x * iz + r.x * ix;
      wz = f.z * iz + r.z * ix;
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
    }

    this.moving = !!(wx || wz);
    if (this.moving) {
      const step = HERO_SPEED * dt;
      const nx = this.pos.x + wx * step;
      let y = this.groundAt(nx, this.pos.z);
      if (y !== null) { this.pos.x = nx; this.pos.y = y; }
      const nz = this.pos.z + wz * step;
      y = this.groundAt(this.pos.x, nz);
      if (y !== null) { this.pos.z = nz; this.pos.y = y; }
      if (faceYaw === null) this.yaw = Math.atan2(wx, wz);
    } else {
      // terrain may have been blasted from under us
      const y = this.groundAt(this.pos.x, this.pos.z);
      if (y !== null) this.pos.y = y;
    }
    if (faceYaw !== null) this.yaw = faceYaw;

    const now = performance.now();
    if (now - this._lastSent >= 1000 / MOVE_SEND_HZ) {
      const s = this._sent;
      if (Math.abs(s.x - this.pos.x) > 1e-3 || Math.abs(s.z - this.pos.z) > 1e-3 || Math.abs(s.yaw - this.yaw) > 1e-2) {
        this.net.send(Message.MOVE, { x: this.pos.x, z: this.pos.z, yaw: this.yaw });
        s.x = this.pos.x; s.z = this.pos.z; s.yaw = this.yaw;
        this._lastSent = now;
      }
    }
  }

  dispose() {
    window.removeEventListener("keydown", this._down);
    window.removeEventListener("keyup", this._up);
  }
}
