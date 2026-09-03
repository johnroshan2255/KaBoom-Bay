import * as THREE from "three";
import { mulberry32 } from "@kaboom-bay/shared";

/** Blocky voxel clouds drifting high over the bay; they cast soft moving shadows on the islands. */
export class Clouds {
  constructor(scene, { count = 11, seed = 9 } = {}) {
    this.scene = scene;
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.clouds = [];
    const rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const parts = 3 + Math.floor(rand() * 4);
      const width = 5 + rand() * 7;
      for (let p = 0; p < parts; p++) {
        const m = new THREE.Mesh(this.geometry, this.material);
        const w = 2 + rand() * 4, h = 1 + rand() * 1.2, d = 2 + rand() * 3;
        m.scale.set(w, h, d);
        m.position.set((rand() - 0.5) * width, (rand() - 0.3) * 0.8, (rand() - 0.5) * 3);
        m.castShadow = true;
        group.add(m);
      }
      group.position.set(-170 + rand() * 340, 17 + rand() * 9, -110 + rand() * 220);
      scene.add(group);
      this.clouds.push({ group, speed: 0.6 + rand() * 0.9 });
    }
  }

  update(dt) {
    for (const c of this.clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 180) c.group.position.x = -180;
    }
  }

  dispose() {
    for (const c of this.clouds) this.scene.remove(c.group);
    this.geometry.dispose();
    this.material.dispose();
  }
}
