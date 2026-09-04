import * as THREE from "three";

/**
 * Orbit camera around a target with screen shake. Any mouse-button drag or one-finger drag rotates,
 * wheel or pinch zooms. A drag that starts on the bomb is claimed by the slingshot instead.
 */
export class OrbitCamera {
  constructor(aspect, target = new THREE.Vector3()) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 600); // narrow FOV = near-isometric voxel look
    this.target = target.clone();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.65;
    this.distance = 40;
    this.targetDistance = 40;
    this.minPitch = 0.3;
    this.maxPitch = 1.2;
    this.shake = 0;
    this.enabled = true; // false while the first-person rig drives the camera
    this.isPointerClaimed = null; // (pointerId) => boolean; true = another controller owns this drag
    this._shakeOffset = new THREE.Vector3();
    this.update(0);
  }

  update(dt) {
    const { camera, target } = this;
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);
    const cp = Math.cos(this.pitch);
    camera.position.set(
      target.x + Math.sin(this.yaw) * cp * this.distance,
      target.y + Math.sin(this.pitch) * this.distance,
      target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    if (this.shake > 0.001) {
      this._shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake);
      camera.position.add(this._shakeOffset);
      this.shake *= Math.exp(-dt * 9);
    } else {
      this.shake = 0;
    }
    camera.lookAt(target);
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, this.minPitch, this.maxPitch);
  }

  zoom(factor) {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, 22, 200);
  }

  zoomIn() { this.zoom(0.8); }
  zoomOut() { this.zoom(1.25); }

  /** Jump to a distance without the smoothing (phase changes). */
  setDistance(d) { this.distance = this.targetDistance = d; }

  addShake(amount) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Drag with any mouse button or one finger to rotate (a few pixels of dead zone keep clicks and taps
   * from nudging the view), two fingers to rotate + pinch-zoom, wheel to zoom. Returns a detach function.
   * Set `isPointerClaimed(pointerId)` to hand a pointer to another controller (e.g. the slingshot).
   */
  attach(canvas) {
    const pointers = new Map();
    const DEAD_ZONE = 4;
    let lastPinch = 0;

    const down = (e) => {
      if (!this.enabled) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, dragging: e.button === 2 });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* keep the drag alive when the mouse leaves the canvas */ }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
        for (const q of pointers.values()) q.dragging = true;
      }
    };
    const move = (e) => {
      if (!this.enabled) return;
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (this.isPointerClaimed?.(e.pointerId)) { pointers.delete(e.pointerId); return; }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.dragging) {
        if (Math.hypot(dx, dy) < DEAD_ZONE) return; // still a click / tap
        p.dragging = true;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      const twoFinger = pointers.size === 2 && p.type === "touch";
      if (pointers.size === 1 || twoFinger) {
        this.rotate(-dx * 0.006, dy * 0.004);
      }
      if (twoFinger) {
        const [a, b] = [...pointers.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch > 0 && pinch > 0) this.zoom(lastPinch / pinch);
        lastPinch = pinch;
      }
    };
    const up = (e) => {
      pointers.delete(e.pointerId);
      lastPinch = 0;
    };
    const wheel = (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this.zoom(Math.exp(e.deltaY * 0.001));
    };
    const key = (e) => {
      if (!this.enabled || e.target?.tagName === "INPUT") return;
      if (e.code === "KeyZ") this.rotate(0.12, 0);  // physical keys (layout independent); E is "grab", so camera rotate lives on Z / C
      if (e.code === "KeyC") this.rotate(-0.12, 0);
      if (e.key === "+" || e.key === "=") this.zoomIn();
      if (e.key === "-" || e.key === "_") this.zoomOut();
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    const contextmenu = (e) => e.preventDefault();
    canvas.addEventListener("contextmenu", contextmenu);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("contextmenu", contextmenu);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    };
  }
}
