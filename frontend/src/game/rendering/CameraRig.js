import * as THREE from "three";
import { HERO_EYE_HEIGHT } from "@kaboom-bay/shared";

/**
 * Switches between the third-person orbit camera and a first-person view from the hero's eyes.
 * First person: mouse look with Pointer Lock on desktop, drag-to-look on touch (fed via look()).
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
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener("mousemove", (e) => { if (this.mode === "first" && this.locked) this.look(e.movementX, e.movementY); });
  }

  setMode(mode, heroYaw = this.yaw) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.orbit.enabled = mode === "third";
    if (mode === "first") { this.yaw = heroYaw; this.pitch = -0.1; }
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.onModeChange?.(mode);
  }

  toggle(heroYaw) { this.setMode(this.mode === "first" ? "third" : "first", heroYaw); }

  requestLock() {
    if (this.mode !== "first" || this.locked) return;
    try { this.canvas.requestPointerLock?.(); } catch { /* not available (iframe policy / headless) */ }
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
