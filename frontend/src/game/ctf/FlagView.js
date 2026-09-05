import * as THREE from "three";

/**
 * The capture-the-flag flag: a pole with a waving pixel banner. Neutral gold at home or dropped; the
 * holder's colour while carried (it floats above their head). A soft glow disc marks it on the ground.
 */
export class FlagView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), new THREE.MeshLambertMaterial({ color: 0xd8c39a }));
    this.pole.position.y = 1.6;
    this.pole.castShadow = true;
    this.clothMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, side: THREE.DoubleSide, emissive: 0x332800 });
    this.cloth = new THREE.Group();
    // three strips so the banner can ripple
    this.strips = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9 - i * 0.05, 0.08), this.clothMat);
      m.position.set(0.08 + 0.21 + i * 0.42, 2.7, 0);
      m.castShadow = true;
      this.cloth.add(m);
      return m;
    });
    this.top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.top.position.y = 3.3;
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.06;
    this.group.add(this.pole, this.cloth, this.top, this.glow);
    scene.add(this.group);
    this.held = false;
  }

  /** `status`: home | held | dropped; `color` (hex) tints the banner while held. */
  set(pos, status, color = 0xffd23f) {
    this.group.position.set(pos.x, pos.y, pos.z);
    this.held = status === "held";
    this.clothMat.color.setHex(this.held ? color : 0xffd23f);
    this.top.material.color.setHex(this.held ? color : 0xffd23f);
    this.glow.visible = !this.held;
    this.group.scale.setScalar(this.held ? 0.55 : 1); // carried: a short staff in the hand
    this.group.rotation.z = this.held ? -0.35 : 0;
  }

  update(dt, time) {
    this.strips.forEach((m, i) => { m.position.y = 2.7 + Math.sin(time * 6 + i * 1.1) * 0.05 * (i + 1); m.rotation.z = Math.sin(time * 6 + i * 1.1) * 0.08 * (i + 1); });
    this.cloth.rotation.y = Math.sin(time * 1.3) * 0.25;
    if (!this.held) this.glow.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
  }

  dispose() {
    this.scene.remove(this.group);
    this.pole.geometry.dispose(); this.pole.material.dispose();
    for (const m of this.strips) m.geometry.dispose();
    this.clothMat.dispose();
    this.top.geometry.dispose(); this.top.material.dispose();
    this.glow.geometry.dispose(); this.glow.material.dispose();
  }
}
