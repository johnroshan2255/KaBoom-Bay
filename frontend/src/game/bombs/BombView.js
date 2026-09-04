import * as THREE from "three";
import { BOMB_FUSE_MS, BOMB_RADIUS, BOMB_TYPES, BombType } from "@kaboom-bay/shared";

const bodyGeo = new THREE.SphereGeometry(BOMB_RADIUS, 10, 8);
const fuseGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 5);
const capGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8);
const sparkGeo = new THREE.OctahedronGeometry(0.11);
const GREEN = new THREE.Color(0x5df26a);
const YELLOW = new THREE.Color(0xffd23f);
const RED = new THREE.Color(0xff4b3e);
const RING_SEGMENTS = 32;

/**
 * Visual for one bomb: chunky black sphere, fuse with a spark, and a camera-facing
 * fuse ring that empties over BOMB_FUSE_MS and turns red near the end.
 */
export class BombView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "bomb";

    this.body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x23272f, flatShading: true }));
    this.body.castShadow = true;
    this.group.add(this.body);

    const cap = new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({ color: 0x8a8f9c }));
    cap.position.y = BOMB_RADIUS;
    this.body.add(cap);
    const fuse = new THREE.Mesh(fuseGeo, new THREE.MeshLambertMaterial({ color: 0xd8c39a }));
    fuse.position.y = BOMB_RADIUS + 0.22;
    fuse.rotation.z = 0.35;
    this.body.add(fuse);
    this.spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    this.spark.position.set(-0.07, BOMB_RADIUS + 0.42, 0);
    this.spark.visible = false;
    this.body.add(this.spark);

    this.ringMat = new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, RING_SEGMENTS, 1, Math.PI / 2), this.ringMat);
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.group.add(this.ring);
    this._ringFraction = -1;

    scene.add(this.group);
  }

  /** Colour and size for a BombType (mega is big and red, cluster green, impact amber, bomblets small). */
  setType(type) {
    const def = BOMB_TYPES[type] ?? BOMB_TYPES[BombType.STANDARD];
    this.type = type;
    this.baseColor = def.color;
    this.body.material.color.setHex(def.color);
    this.body.scale.setScalar(def.scale);
  }

  setPosition(p) {
    this.group.position.copy(p);
  }

  setRotation(q) {
    this.body.quaternion.copy(q);
  }

  /** fraction 0..1 of fuse remaining, or null when unarmed. */
  updateFuse(fraction, camera, timeSec) {
    if (fraction === null) {
      this.ring.visible = false;
      this.spark.visible = false;
      this.body.material.color.setHex(this.baseColor ?? 0x23272f);
      return;
    }
    this.ring.visible = true;
    this.spark.visible = true;
    this.spark.scale.setScalar(0.8 + 0.5 * Math.abs(Math.sin(timeSec * 25)));

    if (Math.abs(fraction - this._ringFraction) > 0.02) {
      // RingGeometry indices run along the arc, so a draw range shortens the ring without rebuilding it.
      this._ringFraction = fraction;
      this.ring.geometry.setDrawRange(0, Math.max(1, Math.round(fraction * RING_SEGMENTS)) * 6);
    }
    this.ringMat.color.copy(fraction > 0.5 ? GREEN : YELLOW).lerp(fraction > 0.5 ? YELLOW : RED, fraction > 0.5 ? (1 - fraction) * 2 : 1 - fraction * 2);
    this.ring.quaternion.copy(camera.quaternion);
    this.ring.position.y = BOMB_RADIUS + 0.9;

    // last 3 seconds: pulse the body red
    const remainingMs = fraction * BOMB_FUSE_MS;
    if (remainingMs < 3000) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * (remainingMs < 1000 ? 40 : 18));
      this.body.material.color.setHex(this.baseColor ?? 0x23272f).lerp(RED, pulse * 0.8);
    } else {
      this.body.material.color.setHex(this.baseColor ?? 0x23272f);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.body.material.dispose();
  }
}
