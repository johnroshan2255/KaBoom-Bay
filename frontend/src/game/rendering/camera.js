import * as THREE from "three";

/**
 * Orbit camera around a target with screen shake. Right-drag / two-finger drag rotates,
 * wheel or pinch zooms. Left button is left free for aiming.
 */
export class OrbitCamera {
  constructor(aspect, target = new THREE.Vector3()) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 600); // narrow FOV = near-isometric voxel look
    this.target = target.clone();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.65;
    this.distance = 40;
    this.shake = 0;
    this.enabled = true; // false while the first-person rig drives the camera
    this._shakeOffset = new THREE.Vector3();
    this.update(0);
  }

  update(dt) {
    const { camera, target } = this;
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
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, 0.3, 1.2);
  }

  zoom(factor) {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, 25, 200);
  }

  addShake(amount) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Right mouse drag, two-finger drag and wheel. Returns a detach function. */
  attach(canvas) {
    const pointers = new Map();
    let lastPinch = 0;

    const down = (e) => {
      if (!this.enabled) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e) => {
      if (!this.enabled) return;
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const twoFinger = pointers.size === 2 && e.pointerType === "touch";
      if (p.button === 2 || twoFinger) {
        this.rotate(-dx * 0.006, dy * 0.004);
      }
      if (twoFinger) {
        const [a, b] = [...pointers.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch > 0) this.zoom(lastPinch / pinch);
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
      if (e.key === "q" || e.key === "ArrowLeft") this.rotate(0.12, 0);
      if (e.key === "e" || e.key === "ArrowRight") this.rotate(-0.12, 0);
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    };
  }
}
