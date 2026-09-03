import * as THREE from "three";
import { BOMB_MIN_POWER, pullToVelocity } from "@kaboom-bay/shared";

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

/**
 * Angry-Birds style slingshot aiming with pointer events (mouse + touch).
 * Pointer down on the canvas starts a pull; the pull vector is measured on a horizontal plane
 * at the bomb's height so it behaves identically from any camera angle.
 *
 * callbacks: onStart(hitPoint) -> boolean (return false to ignore this pointer),
 *            onPull({ pull, velocity, power }), onRelease({ velocity, power }), onCancel()
 */
export class AimController {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.cb = callbacks;
    this.pointerId = null;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.anchor = new THREE.Vector3();
    this.start = new THREE.Vector3();
    this.pull = new THREE.Vector3();
    this.enabled = true;

    canvas.addEventListener("pointerdown", (e) => this._down(e));
    canvas.addEventListener("pointermove", (e) => this._move(e));
    canvas.addEventListener("pointerup", (e) => this._up(e));
    canvas.addEventListener("pointercancel", () => this._cancel());
  }

  /** The world point the slingshot pulls back from. */
  setAnchor(position) {
    this.anchor.copy(position);
    this.plane.constant = -position.y;
  }

  _project(e, out) {
    const r = this.canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    return _ray.ray.intersectPlane(this.plane, out);
  }

  _down(e) {
    if (!this.enabled) return;
    if (this.pointerId !== null) {
      // second finger = camera gesture; abort the throw
      this._cancel();
      return;
    }
    if (e.button !== 0) return;
    if (!this._project(e, _hit)) return;
    if (this.cb.onStart && this.cb.onStart(_hit.clone(), e) === false) return;
    this.pointerId = e.pointerId;
    this.start.copy(_hit);
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    if (!this._project(e, _hit)) return;
    this.pull.subVectors(this.start, _hit);
    this.pull.y = 0;
    const v = pullToVelocity(this.pull.x, this.pull.z);
    this.cb.onPull?.({ pull: this.pull, velocity: new THREE.Vector3(v.vx, v.vy, v.vz), power: v.power });
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const v = pullToVelocity(this.pull.x, this.pull.z);
    if (v.power < BOMB_MIN_POWER) {
      this.cb.onCancel?.();
    } else {
      this.cb.onRelease?.({ velocity: new THREE.Vector3(v.vx, v.vy, v.vz), power: v.power });
    }
    this.pull.set(0, 0, 0);
  }

  _cancel() {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.pull.set(0, 0, 0);
    this.cb.onCancel?.();
  }
}
