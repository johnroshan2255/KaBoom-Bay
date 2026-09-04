import * as THREE from "three";
import { Block } from "@kaboom-bay/shared";
import { getAtlas, TILE, TILE_COUNT, TILE_PX } from "./atlas.js";
import { FLOWER_COLORS, cellShade, faceHash, grassTint, tilesFor } from "./palette.js";
import { quality } from "./quality.js";

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
const AO_LEVELS = [0.38, 0.6, 0.8, 1.0];
const FACE_SHADE = [0.9, 0.9, 1.0, 0.5, 0.88, 0.88];
const EDGE_SHADE = 0.86; // vertices on an exposed silhouette edge darken: reads as a bevelled voxel edge
const MOSS = new THREE.Color(0x6fc45a);
const _moss = new THREE.Color();
const MOSSY = new Set([Block.ROCK, Block.DIRT, Block.CARVED]);
const CANOPY = new Set([Block.LEAF, Block.LEAF_AUTUMN]);

let sharedMaterial = null;
function material() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ map: getAtlas().texture, vertexColors: true });
  }
  return sharedMaterial;
}

const _c = new THREE.Color();
const _tint = new THREE.Color();
const _ao = [0, 0, 0, 0];

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
    this.capacity = 0; // faces the current buffers can hold
    scene.add(this.mesh);
  }

  /** (Re)allocates the vertex buffers for `faces` quads. Buffers are reused between rebuilds until they overflow. */
  _ensureCapacity(faces) {
    if (faces <= this.capacity) return;
    this.capacity = Math.ceil(faces * 1.25);
    const v = this.capacity * 4;
    const g = this.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(v * 2), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.capacity * 6), 1).setUsage(THREE.DynamicDrawUsage));
  }

  /**
   * Rebuilds the island mesh. `decor.flowers` ([x, topY, z, kind]) become small flat quads on grass tops
   * that are still there; the quality tier decides how many are drawn.
   */
  rebuild(grid, decor = null) {
    const flowers = quality.settings.decals ? (decor?.flowers ?? []).filter(([x, y, z]) => grid.get(x, y, z) === Block.GRASS && grid.get(x, y + 1, z) === Block.AIR) : [];
    // Count visible faces first so the typed arrays are sized once, then fill them in place.
    let faces = 0;
    grid.forEachSolid((x, y, z) => {
      for (let f = 0; f < 6; f++) {
        const [nx, ny, nz] = FACES[f].n;
        if (!(y + ny < 0 || grid.isSolid(x + nx, y + ny, z + nz))) faces++;
      }
    });
    this._ensureCapacity(faces + flowers.length);
    const g = this.geometry;
    const positions = g.attributes.position.array, normals = g.attributes.normal.array, uvs = g.attributes.uv.array, colors = g.attributes.color.array, indices = g.index.array;
    let pi = 0, ui = 0, ci = 0, ii = 0;
    let vertexCount = 0;
    faces = 0;
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
        // sparse moss on stone and dirt sides (not undersides), like the reference's mossy ruins
        const mossy = MOSSY.has(block) && f !== 3 && y >= 2 && faceHash(x, y, z, f) < (f === 2 ? 0.4 : 0.16);
        // moss is a soft tint over the block's own tile, strongest on top faces (the reference's mossy ruins)
        if (mossy) _moss.copy(MOSS).lerp(_c.setHex(0x9fb3a8), f === 2 ? 0.25 : 0.5);

        let tile = tiles[face.side];
        if (tile === TILE.STONE && face.side === 1) {
          // 2x2 brick pattern: a seamed tile on alternate rows/columns, and an engraved motif on some cliff faces
          const along = nx !== 0 ? z : x;
          if (faceHash(x, y, z, 11) < 0.12 && y >= 2 && y <= 6) tile = TILE.CARVED;
          else if (((y & 1) === 0) !== ((along & 1) === 0)) tile = TILE.STONE_SEAM;
        }
        const u0 = tile * uStep + inset, u1 = (tile + 1) * uStep - inset;
        const v0 = insetV, v1 = 1 - insetV;
        const ao = _ao;

        for (let i = 0; i < 4; i++) {
          const [cx, cy, cz] = face.v[i];
          positions[pi] = x + cx; positions[pi + 1] = y + cy; positions[pi + 2] = z + cz;
          normals[pi] = nx; normals[pi + 1] = ny; normals[pi + 2] = nz;
          uvs[ui++] = UV[i][0] ? u1 : u0; uvs[ui++] = UV[i][1] ? v1 : v0;

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
          ao[i] = level;

          // bevel: the vertex lies on an outer edge when the block beside it (in the face plane, same layer) is air
          let edges = 0;
          if (nx !== 0) { if (!solid(x, y + dy, z)) edges++; if (!solid(x, y, z + dz)) edges++; }
          else if (ny !== 0) { if (!solid(x + dx, y, z)) edges++; if (!solid(x, y, z + dz)) edges++; }
          else { if (!solid(x + dx, y, z)) edges++; if (!solid(x, y + dy, z)) edges++; }
          let k = AO_LEVELS[level] * FACE_SHADE[f] * shade * (edges ? EDGE_SHADE ** edges : 1);
          if (CANOPY.has(block)) k *= 0.78 + 0.22 * Math.min(1, (y - 6) / 6); // canopies darken toward the bottom, rounding them out
          if (mossy) _c.copy(_moss).multiplyScalar(k);
          else if (isGrass && face.side !== 2) _c.copy(_tint).multiplyScalar(k);
          else _c.setScalar(k);
          colors[ci++] = _c.r; colors[ci++] = _c.g; colors[ci++] = _c.b;
          pi += 3;
        }

        // Flip the quad diagonal so AO interpolates without the classic anisotropy artefact.
        const b = vertexCount;
        if (ao[0] + ao[2] > ao[1] + ao[3]) { indices[ii++] = b; indices[ii++] = b + 1; indices[ii++] = b + 2; indices[ii++] = b; indices[ii++] = b + 2; indices[ii++] = b + 3; }
        else { indices[ii++] = b + 1; indices[ii++] = b + 2; indices[ii++] = b + 3; indices[ii++] = b + 1; indices[ii++] = b + 3; indices[ii++] = b; }
        vertexCount += 4;
        faces++;
      }
    });

    // flower decals: small flat quads a hair above the grass, coloured through the vertex colour
    {
      const tile = TILE.PLAIN, u0 = tile * uStep + inset, u1 = (tile + 1) * uStep - inset, v0 = insetV, v1 = 1 - insetV;
      for (const [fx, fy, fz, kind] of flowers) {
        const col = _c.setHex(FLOWER_COLORS[kind % FLOWER_COLORS.length]);
        const h = faceHash(fx, fy, fz, 7), ox = 0.2 + h * 0.5, oz = 0.2 + ((h * 7919) % 1) * 0.5, sz = 0.16 + h * 0.1;
        const cx = fx + ox, cz = fz + oz, top = fy + 1.02;
        const corners = [[cx - sz, cz + sz], [cx + sz, cz + sz], [cx + sz, cz - sz], [cx - sz, cz - sz]];
        for (let i = 0; i < 4; i++) {
          positions[pi] = corners[i][0]; positions[pi + 1] = top; positions[pi + 2] = corners[i][1];
          normals[pi] = 0; normals[pi + 1] = 1; normals[pi + 2] = 0;
          uvs[ui++] = UV[i][0] ? u1 : u0; uvs[ui++] = UV[i][1] ? v1 : v0;
          colors[ci++] = col.r; colors[ci++] = col.g; colors[ci++] = col.b;
          pi += 3;
        }
        const b = vertexCount;
        indices[ii++] = b; indices[ii++] = b + 1; indices[ii++] = b + 2; indices[ii++] = b; indices[ii++] = b + 2; indices[ii++] = b + 3;
        vertexCount += 4;
        faces++;
      }
    }

    for (const a of [g.attributes.position, g.attributes.normal, g.attributes.uv, g.attributes.color, g.index]) a.needsUpdate = true;
    g.setDrawRange(0, faces * 6);
    // Fixed bounds: the island grid never moves, and a full-grid sphere is cheaper than recomputing one per rebuild.
    if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(grid.sizeX / 2, grid.sizeY / 2, grid.sizeZ / 2), Math.hypot(grid.sizeX, grid.sizeY, grid.sizeZ) / 2);
    this.visibleCount = faces;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
  }
}
