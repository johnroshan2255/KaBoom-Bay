import * as THREE from "three";
import { BOMB_TYPES, BombType } from "@kaboom-bay/shared";

const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const bandGeo = new THREE.BoxGeometry(0.94, 0.26, 0.94);
const chuteGeo = new THREE.ConeGeometry(1.1, 1.0, 8, 1, true);
const gemGeo = new THREE.OctahedronGeometry(0.22);
let woodMat = null, chuteMat = null;
const wood = () => (woodMat ??= new THREE.MeshLambertMaterial({ color: 0x9a6a33, flatShading: true }));
const chute = () => (chuteMat ??= new THREE.MeshLambertMaterial({ color: 0xfff3d6, side: THREE.DoubleSide }));
export const CRATE_FALL_HEIGHT = 16;

/**
 * Supply crate: wooden box with a band in the bomb type's colour, a parachute while it falls and a
 * spinning gem above it once landed so it reads as a pickup from across the bay.
 */
export class CrateView {
  constructor(scene, type) {
    this.scene = scene;
    const def = BOMB_TYPES[type] ?? BOMB_TYPES[BombType.MEGA];
    this.group = new THREE.Group();
    this.group.name = "crate";
    this.box = new THREE.Mesh(boxGeo, wood());
    this.box.castShadow = true;
    this.box.position.y = 0.45;
    this.band = new THREE.Mesh(bandGeo, new THREE.MeshLambertMaterial({ color: def.color }));
    this.box.add(this.band);
    this.chute = new THREE.Mesh(chuteGeo, chute());
    this.chute.position.y = 1.9;
    this.box.add(this.chute);
    this.gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: def.color, toneMapped: false }));
    this.gem.position.y = 1.5;
    this.gem.visible = false;
    this.group.add(this.box, this.gem);
    scene.add(this.group);
  }

  /** fall: 0..1 progress from the sky to the ground; once landed the crate settles and shows its gem. */
  update(target, fall, landed, time) {
    const y = landed ? target.y : target.y + (1 - fall) * CRATE_FALL_HEIGHT;
    this.group.position.set(target.x, y, target.z);
    this.chute.visible = !landed;
    this.gem.visible = landed;
    if (!landed) { this.box.rotation.z = Math.sin(time * 2) * 0.12; this.box.rotation.x = Math.cos(time * 1.6) * 0.1; }
    else { this.box.rotation.set(0, 0, 0); this.gem.rotation.y = time * 2.5; this.gem.position.y = 1.5 + Math.sin(time * 3) * 0.12; }
  }

  dispose() {
    this.scene.remove(this.group);
    this.band.material.dispose();
    this.gem.material.dispose();
  }
}
