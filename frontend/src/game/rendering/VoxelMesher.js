import * as THREE from "three";
import { Block } from "@kaboom-bay/shared";
import { getAtlas, TILE_COUNT, TILE_PX } from "./atlas.js";
import { cellShade, grassTint, tilesFor } from "./palette.js";

/**
 * Builds one textured mesh per island from a VoxelGrid: visible faces only, atlas UVs per face,
 * and per-vertex ambient occlusion baked into vertex colours (the classic block-world technique).
 * AO is what gives creases, cliffs and overhangs their soft shading in the reference art.
 */

// face: normal, 4 corners (CCW from outside), tangent axes used for AO, uv corners
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], side: 1 },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], side: 1 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], side: 0 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], side: 2 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], side: 1 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], side: 1 },
];
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVELS = [0.42, 0.62, 0.8, 1.0];
const FACE_SHADE = [0.92, 0.92, 1.0, 0.55, 0.9, 0.9];

let sharedMaterial = null;
function material() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ map: getAtlas().texture, vertexColors: true });
  }
  return sharedMaterial;
}

const _c = new THREE.Color();
const _tint = new THREE.Color();

export class VoxelMesher {
  constructor(scene, origin) {
    this.scene = scene;
    this.origin = origin.clone();
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, material());
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.copy(this.origin);
    this.visibleCount = 0;
    scene.add(this.mesh);
  }

  rebuild(grid) {
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    let vertexCount = 0, faces = 0;
    const solid = (x, y, z) => (y < 0 ? true : grid.isSolid(x, y, z));
    const uStep = 1 / TILE_COUNT;
    const inset = 0.5 / (TILE_COUNT * TILE_PX);
    const insetV = 0.5 / TILE_PX;

    grid.forEachSolid((x, y, z, block) => {
      const tiles = tilesFor(block);
      const shade = cellShade(x, y, z);
      const isGrass = block === Block.GRASS;
      if (isGrass) grassTint(x, z, _tint);

      for (let f = 0; f < 6; f++) {
        const face = FACES[f];
        const [nx, ny, nz] = face.n;
        if (solid(x + nx, y + ny, z + nz)) continue;

        const tile = tiles[face.side];
        const u0 = tile * uStep + inset, u1 = (tile + 1) * uStep - inset;
        const v0 = insetV, v1 = 1 - insetV;
        const ao = [];

        for (let i = 0; i < 4; i++) {
          const [cx, cy, cz] = face.v[i];
          positions.push(x + cx, y + cy, z + cz);
          normals.push(nx, ny, nz);
          uvs.push(UV[i][0] ? u1 : u0, UV[i][1] ? v1 : v0);

          // AO: the two edge neighbours and the corner neighbour on the face plane, outside the block.
          const ox = x + nx, oy = y + ny, oz = z + nz;
          const dx = nx !== 0 ? 0 : cx ? 1 : -1;
          const dy = ny !== 0 ? 0 : cy ? 1 : -1;
          const dz = nz !== 0 ? 0 : cz ? 1 : -1;
          let s1, s2, corner;
          if (nx !== 0) { s1 = solid(ox, oy + dy, oz); s2 = solid(ox, oy, oz + dz); corner = solid(ox, oy + dy, oz + dz); }
          else if (ny !== 0) { s1 = solid(ox + dx, oy, oz); s2 = solid(ox, oy, oz + dz); corner = solid(ox + dx, oy, oz + dz); }
          else { s1 = solid(ox + dx, oy, oz); s2 = solid(ox, oy + dy, oz); corner = solid(ox + dx, oy + dy, oz); }
          const level = s1 && s2 ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (corner ? 1 : 0));
          ao.push(level);

          const k = AO_LEVELS[level] * FACE_SHADE[f] * shade;
          if (isGrass && face.side !== 2) _c.copy(_tint).multiplyScalar(k);
          else _c.setScalar(k);
          colors.push(_c.r, _c.g, _c.b);
        }

        // Flip the quad diagonal so AO interpolates without the classic anisotropy artefact.
        const b = vertexCount;
        if (ao[0] + ao[2] > ao[1] + ao[3]) indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
        else indices.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
        vertexCount += 4;
        faces++;
      }
    });

    const g = this.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeBoundingSphere();
    this.visibleCount = faces;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
  }
}
