import * as THREE from "three";
import { Block } from "@kaboom-bay/shared";
import { TILE } from "./atlas.js";

/** Average colour per block id - used for debris and anything that isn't textured. */
export const BLOCK_COLORS = {
  [Block.ROCK]: 0x7d938a,
  [Block.SAND]: 0xf1d48e,
  [Block.GRASS]: 0x5ec44c,
  [Block.DIRT]: 0x8a5a34,
  [Block.WOOD]: 0x8c5a2e,
  [Block.LEAF]: 0x3aa64a,
  [Block.PLANK]: 0xd19a5a,
  [Block.BEAM]: 0x7a4a24,
  [Block.WALL]: 0xd9d3c4,
  [Block.ROOF]: 0xd94f3d,
  [Block.FLOOR]: 0xe0b078,
  [Block.DOOR]: 0x6b3f1f,
  [Block.WINDOW]: 0x9fe3ff,
};

/** Atlas tiles per block face: [top, side, bottom]. */
const TILES = {
  [Block.ROCK]: [TILE.STONE_MOSS, TILE.STONE, TILE.STONE],
  [Block.SAND]: [TILE.SAND, TILE.SAND, TILE.SAND],
  [Block.GRASS]: [TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.DIRT],
  [Block.DIRT]: [TILE.DIRT, TILE.DIRT, TILE.DIRT],
  [Block.WOOD]: [TILE.WOOD_TOP, TILE.WOOD_SIDE, TILE.WOOD_TOP],
  [Block.LEAF]: [TILE.LEAF, TILE.LEAF, TILE.LEAF],
  [Block.PLANK]: [TILE.PLANK, TILE.PLANK, TILE.PLANK],
  [Block.BEAM]: [TILE.BEAM, TILE.BEAM, TILE.BEAM],
  [Block.WALL]: [TILE.WALL, TILE.WALL, TILE.WALL],
  [Block.ROOF]: [TILE.ROOF, TILE.ROOF, TILE.ROOF],
  [Block.FLOOR]: [TILE.FLOOR, TILE.PLANK, TILE.FLOOR],
  [Block.DOOR]: [TILE.BEAM, TILE.DOOR, TILE.BEAM],
  [Block.WINDOW]: [TILE.WINDOW, TILE.WINDOW, TILE.WINDOW],
};
export const tilesFor = (block) => TILES[block] ?? TILES[Block.ROCK];

const cache = new Map();
export function blockColor(block) {
  let c = cache.get(block);
  if (!c) {
    c = new THREE.Color(BLOCK_COLORS[block] ?? 0xff00ff);
    cache.set(block, c);
  }
  return c;
}

/** Deterministic per-cell shade so rebuilding the mesh never makes voxels flicker. */
export function cellShade(x, y, z) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = (h ^ (h >>> 13)) & 7;
  return 1 + (h - 3.5) * 0.035;
}

/** Grass gets a stronger hue drift between fresh and mossy green. */
export function grassTint(x, z, out) {
  let h = (x * 2654435761) ^ (z * 40503);
  h = ((h ^ (h >>> 15)) >>> 0) & 15;
  const t = h / 15;
  return out.setRGB(0.85 + 0.25 * t, 1.0, 0.8 + 0.15 * (1 - t));
}
