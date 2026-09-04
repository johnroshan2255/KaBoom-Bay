import * as THREE from "three";
import { HERO_EYE_HEIGHT } from "@kaboom-bay/shared";

/**
 * Switches between the third-person orbit camera and a first-person view from the hero's eyes.
 * First person: mouse look on desktop (Pointer Lock when the browser grants it, raw mouse movement over
 * the canvas otherwise, so the view follows the mouse immediately), drag-to-look on touch (fed via look()).
 */
export class CameraRig {
  constructor(orbit, canvas) {
    this.orbit = orbit;
    this.canvas = canvas;
    this.camera = orbit.camera;
    this.mode = "third";
    this.yaw = 0;
    this.pitch = -0.1;
    this.locked = false;
    this.onModeChange = null;
    this._onLockChange = () => { this.locked = document.pointerLockElement === canvas; };
    this._onMouseMove = (e) => {
      if (this.mode !== "first") return;
      // Locked or not: movementX/Y report the mouse delta while the cursor is over the canvas.
      this.look(e.movementX, e.movementY);
    };
    document.addEventListener("pointerlockchange", this._onLockChange);
    canvas.addEventListener("mousemove", this._onMouseMove);
  }

  dispose() {
    document.removeEventListener("pointerlockchange", this._onLockChange);
    this.canvas.removeEventListener("mousemove", this._onMouseMove);
  }

  static MODES = ["third", "top", "first"];

  setMode(mode, heroYaw = this.yaw) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.orbit.enabled = mode !== "first";
    if (mode === "first") { this.yaw = heroYaw; this.pitch = -0.1; this.requestLock(); }
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    if (mode === "top") { this.orbit.minPitch = 1.35; this.orbit.maxPitch = 1.52; this.orbit.pitch = 1.48; }
    else { this.orbit.minPitch = 0.3; this.orbit.maxPitch = 1.2; if (mode === "third" && this.orbit.pitch > 1.2) this.orbit.pitch = 0.66; }
    this.onModeChange?.(mode);
  }

  /** V / VIEW button: 3RD -> TOP -> 1ST -> 3RD */
  toggle(heroYaw) {
    const i = CameraRig.MODES.indexOf(this.mode);
    this.setMode(CameraRig.MODES[(i + 1) % CameraRig.MODES.length], heroYaw);
  }

  requestLock() {
    if (this.mode !== "first" || this.locked) return;
    // Not available in some iframes / headless browsers: fails synchronously or as a rejected promise, both harmless.
    try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* fall back to unlocked mouse look */ }
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.2, 1.25);
  }

  /** Yaw the hero moves relative to: where the camera looks. */
  forwardYaw() { return this.mode === "first" ? this.yaw : this.orbit.yaw + Math.PI; }

  /** Unit vector the first-person camera looks along. */
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  update(dt, heroPos) {
    if (this.mode === "first" && heroPos) {
      this.camera.position.set(heroPos.x, heroPos.y + HERO_EYE_HEIGHT, heroPos.z);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0);
      if (this.orbit.shake > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.orbit.shake * 0.4;
        this.camera.position.y += (Math.random() - 0.5) * this.orbit.shake * 0.4;
        this.orbit.shake *= Math.exp(-dt * 9);
      }
    } else {
      this.orbit.update(dt);
    }
  }
}
