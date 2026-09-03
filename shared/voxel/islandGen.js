import { VoxelGrid, Block } from "./VoxelGrid.js";
import { ISLAND_SIZE, ISLAND_GRID_HEIGHT } from "../constants.js";

/** Small, fast, seedable PRNG (mulberry32). Same seed -> same island on client and server. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a tropical voxel island shaped like a floating stone chunk:
 * tapered mossy-rock underside, a sandy beach step, a raised grass plateau with a dirt cliff,
 * a small hill, boulders and destructible voxel palms.
 *
 * Column layout (y): 0..3 rock (radius shrinks on the lowest layers), then
 *   beach   : 4 = sand
 *   plateau : 4 = dirt, 5 = grass
 *   hill    : 4..5 = dirt, 6 = grass
 * Everything above is free build space.
 */
export function generateIsland({ seed = 1, size = ISLAND_SIZE, height = ISLAND_GRID_HEIGHT } = {}) {
  const rand = mulberry32(seed);
  const grid = new VoxelGrid(size, height, size);
  const c = (size - 1) / 2;
  const baseRadius = size / 2 - 1.5;

  const wobbles = Array.from({ length: 3 }, () => ({
    amp: 0.5 + rand() * 0.8,
    freq: 2 + Math.floor(rand() * 3),
    phase: rand() * Math.PI * 2,
  }));
  const radiusAt = (angle) =>
    baseRadius + wobbles.reduce((s, w) => s + w.amp * Math.sin(w.freq * angle + w.phase), 0);

  const hillAngle = rand() * Math.PI * 2;
  const hillOffset = 0.12 + rand() * 0.15;
  const hillCx = c + Math.cos(hillAngle) * hillOffset * baseRadius;
  const hillCz = c + Math.sin(hillAngle) * hillOffset * baseRadius;

  const shore = new Float32Array(size * size).fill(-1);
  const beach = [];
  const interior = [];

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dz = z - c;
      const dist = Math.hypot(dx, dz);
      const d = dist / radiusAt(Math.atan2(dz, dx));
      if (d > 1) continue;
      shore[z * size + x] = d;

      // Rock body; the two lowest layers taper inward so the island reads as a floating chunk.
      if (d < 0.72) grid.set(x, 0, z, Block.ROCK);
      if (d < 0.88) grid.set(x, 1, z, Block.ROCK);
      grid.set(x, 2, z, Block.ROCK);
      grid.set(x, 3, z, Block.ROCK);

      if (d > 0.74) {
        grid.set(x, 4, z, Block.SAND); // beach step
        beach.push([x, z]);
      } else {
        grid.set(x, 4, z, Block.DIRT);
        grid.set(x, 5, z, Block.GRASS); // plateau
        interior.push([x, z, d]);
      }

      const hd = Math.hypot(x - hillCx, z - hillCz) / (baseRadius * 0.36);
      if (hd < 1 && d < 0.66) {
        grid.set(x, 5, z, Block.DIRT);
        grid.set(x, 6, z, Block.GRASS);
      }
    }
  }

  // Boulders on the beach.
  const boulderCount = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < boulderCount && beach.length; i++) {
    const [x, z] = beach[Math.floor(rand() * beach.length)];
    grid.set(x, grid.columnTop(x, z) + 1, z, Block.ROCK);
  }

  // Palm trees on the plateau, spaced apart, with a fuller crown.
  const palms = [];
  const candidates = interior.filter(([, , d]) => d > 0.38 && d < 0.7);
  const wanted = 3 + Math.floor(rand() * 2);
  let guard = 0;
  while (palms.length < wanted && candidates.length && guard++ < 200) {
    const [x, z] = candidates[Math.floor(rand() * candidates.length)];
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
    const base = grid.columnTop(x, z);
    if (grid.get(x, base, z) !== Block.GRASS) continue;
    const trunk = 3 + Math.floor(rand() * 2);
    for (let y = 1; y <= trunk; y++) grid.set(x, base + y, z, Block.WOOD);
    const crown = base + trunk + 1;
    grid.set(x, crown, z, Block.LEAF);
    grid.set(x, crown + 1, z, Block.LEAF);
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      grid.set(x + ox, crown, z + oz, Block.LEAF);
      grid.set(x + ox * 2, crown, z + oz * 2, Block.LEAF);
      grid.set(x + ox * 2, crown - 1, z + oz * 2, Block.LEAF);
    }
    for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      grid.set(x + ox, crown, z + oz, Block.LEAF);
      grid.set(x + ox * 2, crown - 1, z + oz * 2, Block.LEAF);
    }
    palms.push({ x, z, height: trunk });
  }

  return { grid, palms, shore, seed, size };
}
