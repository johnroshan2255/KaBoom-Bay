import * as THREE from "three";
import { sampleTrajectory } from "@kaboom-bay/shared";

const _m = new THREE.Matrix4();
const MAX_DOTS = 200;

/** Dotted arc showing where a pull would send the bomb. Stops at terrain or water. */
export class TrajectoryPreview {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
      MAX_DOTS,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  show(origin, velocity, stop) {
    const pts = sampleTrajectory(origin.x, origin.y, origin.z, velocity.x, velocity.y, velocity.z, { dt: 1 / 24, stop });
    const n = Math.min(MAX_DOTS, pts.length / 3);
    for (let i = 0; i < n; i++) {
      _m.makeTranslation(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide() {
    this.mesh.count = 0;
  }
}
