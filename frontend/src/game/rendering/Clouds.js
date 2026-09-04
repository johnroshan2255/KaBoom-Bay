import * as THREE from "three";
import { mulberry32 } from "@kaboom-bay/shared";
import { quality } from "./quality.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Blocky voxel clouds drifting high over the bay. All cloud boxes live in one InstancedMesh, so the
 * whole sky is a single draw call (two with shadows). Cloud shadows are a high-tier luxury.
 */
export class Clouds {
  constructor(scene, { count = 11, seed = 9 } = {}) {
    this.scene = scene;
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.parts = []; // { cloud, offset: Vector3, scale: Vector3 }
    this.clouds = []; // { x, y, z, speed }
    const rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const cloud = { x: -170 + rand() * 340, y: 17 + rand() * 9, z: -110 + rand() * 220, speed: 0.6 + rand() * 0.9 };
      const parts = 3 + Math.floor(rand() * 4);
      const width = 5 + rand() * 7;
      for (let p = 0; p < parts; p++) {
        const w = 2 + rand() * 4, h = 1 + rand() * 1.2, d = 2 + rand() * 3;
        this.parts.push({ cloud, offset: new THREE.Vector3((rand() - 0.5) * width, (rand() - 0.3) * 0.8, (rand() - 0.5) * 3), scale: new THREE.Vector3(w, h, d) });
      }
      this.clouds.push(cloud);
    }
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.parts.length);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this._applyTier = () => { this.mesh.castShadow = quality.settings.cloudShadows; };
    this._applyTier();
    this._unsubscribe = quality.onChange(this._applyTier);
    this.update(0);
  }

  update(dt) {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 180) c.x = -180;
    }
    for (let i = 0; i < this.parts.length; i++) {
      const { cloud, offset, scale } = this.parts[i];
      _p.set(cloud.x + offset.x, cloud.y + offset.y, cloud.z + offset.z);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.copy(scale)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this._unsubscribe();
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
