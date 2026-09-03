import * as THREE from "three";

/**
 * Meshes a small colour-voxel model (characters, props) with visible faces only and
 * baked per-vertex ambient occlusion - the same treatment as the terrain, minus the atlas.
 * `voxels` is a Map of "x,y,z" -> colour (hex int). `scale` is world units per voxel.
 */
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO_LEVELS = [0.55, 0.72, 0.86, 1.0];
const FACE_SHADE = [0.93, 0.93, 1.0, 0.6, 0.95, 0.9];

let sharedMaterial = null;
export function voxelModelMaterial() {
  if (!sharedMaterial) sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  return sharedMaterial;
}

const _c = new THREE.Color();

export function buildVoxelGeometry(voxels, scale = 1, offset = { x: 0, y: 0, z: 0 }) {
  const positions = [], normals = [], colors = [], indices = [];
  const solid = (x, y, z) => voxels.has(`${x},${y},${z}`);
  let vc = 0;

  for (const [key, colour] of voxels) {
    const [x, y, z] = key.split(",").map(Number);
    for (let f = 0; f < 6; f++) {
      const { n, v } = FACES[f];
      const [nx, ny, nz] = n;
      if (solid(x + nx, y + ny, z + nz)) continue;
      const ao = [];
      for (let i = 0; i < 4; i++) {
        const [cx, cy, cz] = v[i];
        positions.push((x + cx + offset.x) * scale, (y + cy + offset.y) * scale, (z + cz + offset.z) * scale);
        normals.push(nx, ny, nz);
        const ox = x + nx, oy = y + ny, oz = z + nz;
        const dx = nx !== 0 ? 0 : cx ? 1 : -1, dy = ny !== 0 ? 0 : cy ? 1 : -1, dz = nz !== 0 ? 0 : cz ? 1 : -1;
        let s1, s2, corner;
        if (nx !== 0) { s1 = solid(ox, oy + dy, oz); s2 = solid(ox, oy, oz + dz); corner = solid(ox, oy + dy, oz + dz); }
        else if (ny !== 0) { s1 = solid(ox + dx, oy, oz); s2 = solid(ox, oy, oz + dz); corner = solid(ox + dx, oy, oz + dz); }
        else { s1 = solid(ox + dx, oy, oz); s2 = solid(ox, oy + dy, oz); corner = solid(ox + dx, oy + dy, oz); }
        const level = s1 && s2 ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (corner ? 1 : 0));
        ao.push(level);
        _c.setHex(colour).multiplyScalar(AO_LEVELS[level] * FACE_SHADE[f]);
        colors.push(_c.r, _c.g, _c.b);
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) indices.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      else indices.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
      vc += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
