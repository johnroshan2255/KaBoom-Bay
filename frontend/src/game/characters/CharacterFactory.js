import * as THREE from "three";
import { buildVoxelGeometry, voxelModelMaterial } from "../rendering/VoxelModel.js";

/**
 * Procedural chibi voxel heroes in the style of the reference art: oversized head, tiny body,
 * team-coloured outfit and one distinctive accessory per island seat. 8 voxels wide, ~16 tall,
 * 1/8 block per voxel, so a hero stands about two blocks tall.
 */
export const VOXEL = 1 / 8;
const W = 8, D = 7; // width (x), depth (z); front face is z = D-1

const darken = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const lighten = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();

const SKIN = [0xf6c9a0, 0xe4ad7c, 0xffd9b8, 0xc98a5a];
const HAIR = [0x3b2a20, 0xf2d35a, 0x1f1a1a, 0x5b3a8a]; // contrasts with each team colour
const BOOTS = 0x3a2f2a, PANTS = 0x2f4a6b, EYE = 0x1e1e26, MOUTH = 0x9a4a3a, CHEEK = 0xf29a9a, GOLD = 0xf2c94c;

export function buildCharacterVoxels({ variant = 0, teamColor = 0xff5c5c } = {}) {
  const v = new Map();
  const set = (x, y, z, c) => v.set(`${x},${y},${z}`, c);
  const box = (x0, y0, z0, x1, y1, z1, c) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, typeof c === "function" ? c(x, y, z) : c);
  };
  const skin = SKIN[variant % 4], hair = HAIR[variant % 4];
  const team = teamColor, teamDark = darken(team, 0.65), teamLight = lighten(team, 0.25);

  // legs + boots
  box(1, 0, 2, 2, 2, 3, (x, y) => (y === 0 ? BOOTS : PANTS));
  box(5, 0, 2, 6, 2, 3, (x, y) => (y === 0 ? BOOTS : PANTS));
  // torso with belt, small logo stripe on the front
  box(1, 3, 1, 6, 6, 4, (x, y, z) => (y === 3 ? teamDark : z === 4 && y === 5 && x >= 3 && x <= 4 ? teamLight : team));
  // arms with hands
  box(0, 3, 2, 0, 6, 3, (x, y) => (y === 3 ? skin : team));
  box(7, 3, 2, 7, 6, 3, (x, y) => (y === 3 ? skin : team));
  // head
  box(0, 7, 0, W - 1, 13, D - 1, skin);
  // hair: top, back and sides, fringe
  box(0, 13, 0, W - 1, 13, D - 1, hair);
  box(0, 9, 0, W - 1, 13, 1, hair);
  box(0, 11, 0, 0, 13, D - 1, hair);
  box(W - 1, 11, 0, W - 1, 13, D - 1, hair);
  for (const x of [0, 1, 3, 6, 7]) set(x, 12, D - 1, hair);
  // face
  set(2, 10, D - 1, EYE); set(5, 10, D - 1, EYE);
  set(2, 11, D - 1, 0xffffff); set(5, 11, D - 1, 0xffffff);
  set(3, 8, D - 1, MOUTH); set(4, 8, D - 1, MOUTH);
  set(1, 9, D - 1, CHEEK); set(6, 9, D - 1, CHEEK);

  switch (variant % 4) {
    case 0: // bandana
      box(0, 12, 0, W - 1, 12, 0, team); box(0, 12, D - 1, W - 1, 12, D - 1, team);
      box(0, 12, 0, 0, 12, D - 1, team); box(W - 1, 12, 0, W - 1, 12, D - 1, team);
      set(3, 12, -1, team); set(4, 11, -1, teamDark); set(3, 10, -1, team);
      break;
    case 1: // captain's hat
      box(0, 14, 0, W - 1, 15, D - 1, 0x1f2a44);
      box(-1, 14, -1, W, 14, D, (x, y, z) => (x < 0 || x >= W || z < 0 || z >= D ? 0x16203a : 0x1f2a44));
      box(2, 14, D - 1, 5, 14, D - 1, GOLD);
      set(3, 15, D - 1, GOLD);
      break;
    case 2: // pirate scarf + eye patch
      box(0, 13, 0, W - 1, 13, D - 1, team);
      box(0, 12, 0, W - 1, 12, 0, team); box(0, 12, D - 1, W - 1, 12, D - 1, team);
      set(5, 10, D - 1, EYE); set(5, 11, D - 1, EYE);
      for (let x = 0; x < W; x++) set(x, 11, D - 1, x === 2 ? 0xffffff : x === 5 ? EYE : EYE);
      set(6, 12, -1, team); set(7, 11, -1, team);
      break;
    default: // flower crown
      for (let x = 0; x < W; x += 2) set(x, 14, 0, 0x62d26f), set(x + 1, 14, D - 1, 0x62d26f);
      set(0, 14, 3, 0x62d26f); set(W - 1, 14, 3, 0x62d26f);
      set(2, 14, D - 1, 0xff7ab8); set(2, 15, D - 1, 0xffd0e6);
      break;
  }
  return v;
}

/** One player's hero standing on their island, idling and facing the bay. */
export class PlayerAvatar {
  constructor(scene, { variant = 0, teamColor = 0xff5c5c } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    const geometry = buildVoxelGeometry(buildCharacterVoxels({ variant, teamColor }), VOXEL, { x: -W / 2, y: 0, z: -(D - 1) / 2 });
    this.mesh = new THREE.Mesh(geometry, voxelModelMaterial());
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.phase = Math.random() * Math.PI * 2;
    scene.add(this.group);
  }

  /** Place feet at `position` and turn to face `target` (yaw only). */
  place(position, target) {
    this.group.position.copy(position);
    this.group.rotation.y = Math.atan2(target.x - position.x, target.z - position.z);
    this.baseY = position.y;
  }

  /** Quick wind-up and lunge when this player throws. */
  throwPose() {
    this.throwT = 0.45;
  }

  update(dt, time) {
    const t = time * 2.2 + this.phase;
    let bob = Math.max(0, Math.sin(t)) * 0.06;
    let lean = 0;
    let s = 1 + Math.sin(t * 0.5) * 0.02;
    if (this.throwT > 0) {
      this.throwT -= dt;
      const k = 1 - this.throwT / 0.45; // 0 -> 1
      lean = k < 0.3 ? -k * 1.2 : 0.6 - (k - 0.3) * 0.9; // lean back, then whip forward
      bob += Math.sin(k * Math.PI) * 0.35;
      s = 1 + Math.sin(k * Math.PI) * 0.12;
    }
    this.mesh.position.y = bob;
    this.mesh.rotation.x = lean;
    this.mesh.scale.set(1 / s, s, 1 / s);
  }

  dispose() {
    this.scene.remove(this.group);
    this.mesh.geometry.dispose();
  }
}

/** Small voxel lantern post that stands beside the hero's pad. */
export function buildLanternVoxels() {
  const v = new Map();
  const set = (x, y, z, c) => v.set(`${x},${y},${z}`, c);
  for (let y = 0; y < 9; y++) set(1, y, 1, 0x6d4320);           // post
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) { set(x, 9, z, 0x3a2f2a); set(x, 13, z, 0x3a2f2a); } // cage top/bottom
  for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]]) for (let y = 10; y < 13; y++) set(x, y, z, 0x3a2f2a);
  for (let y = 10; y < 13; y++) set(1, y, 1, 0xffd23f);           // glowing core
  set(1, 14, 1, 0x3a2f2a);
  return v;
}

let glowMaterial = null;
function lanternGlow() {
  if (glowMaterial) return glowMaterial;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255,225,120,0.9)");
  g.addColorStop(0.4, "rgba(255,193,74,0.35)");
  g.addColorStop(1, "rgba(255,193,74,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowMaterial = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  return glowMaterial;
}

/**
 * Small voxel lantern post beside the hero's pad. The glow is an additive sprite rather than a point
 * light: four extra point lights cost every lit pixel on screen and forced shader variants per light count.
 */
export class Lantern {
  constructor(scene, position) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(buildVoxelGeometry(buildLanternVoxels(), VOXEL, { x: -1.5, y: 0, z: -1.5 }), voxelModelMaterial());
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);
    this.glow = new THREE.Sprite(lanternGlow());
    this.glow.position.set(0, 11.5 * VOXEL, 0);
    this.glow.scale.setScalar(1.6);
    this.mesh.add(this.glow);
    this.phase = Math.random() * 6;
    scene.add(this.mesh);
  }
  update(_dt, time) { this.glow.scale.setScalar(1.5 + Math.sin(time * 7 + this.phase) * 0.15); }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
