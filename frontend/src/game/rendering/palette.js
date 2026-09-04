import * as THREE from "three";
import { Block } from "@kaboom-bay/shared";
import { TILE } from "./atlas.js";

/** Average colour per block id - used for debris and anything that isn't textured. */
export const BLOCK_COLORS = {
  [Block.ROCK]: 0x86a892,
  [Block.SAND]: 0xf1d48e,
  [Block.GRASS]: 0x5ec44c,
  [Block.DIRT]: 0x8a5a34,
  [Block.WOOD]: 0x8c5a2e,
  [Block.LEAF]: 0x4cb955,
  [Block.LEAF_AUTUMN]: 0xb8622a,
  [Block.MUSHROOM]: 0xe04a3a,
  [Block.STEM]: 0xf1e4c8,
  [Block.CARVED]: 0x86a892,
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
  [Block.LEAF_AUTUMN]: [TILE.LEAF_AUTUMN, TILE.LEAF_AUTUMN, TILE.LEAF_AUTUMN],
  [Block.SAND]: [TILE.SAND, TILE.SAND, TILE.SAND],
  [Block.GRASS]: [TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.STONE],
  [Block.DIRT]: [TILE.DIRT, TILE.DIRT, TILE.DIRT],
  [Block.WOOD]: [TILE.WOOD_TOP, TILE.WOOD_SIDE, TILE.WOOD_TOP],
  [Block.LEAF]: [TILE.LEAF, TILE.LEAF, TILE.LEAF],
  [Block.MUSHROOM]: [TILE.MUSHROOM, TILE.MUSHROOM, TILE.STEM],
  [Block.STEM]: [TILE.STEM, TILE.STEM, TILE.STEM],
  [Block.CARVED]: [TILE.CARVED, TILE.CARVED, TILE.CARVED],
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

/** Deterministic per-cell shade (a MagicaVoxel-style palette drift) so rebuilding never makes voxels flicker. */
export function cellShade(x, y, z) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = (h ^ (h >>> 13)) & 7;
  return 1 + (h - 3.5) * 0.05;
}

/** 0..1 hash per cell + face, for sparse effects such as moss patches on stone. */
export function faceHash(x, y, z, f) {
  let h = (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647) ^ (f * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const FLOWER_COLORS = [0xffffff, 0xff8fc2, 0xffe36b];

/** Grass gets a stronger hue drift between fresh and mossy green. */
export function grassTint(x, z, out) {
  let h = (x * 2654435761) ^ (z * 40503);
  h = ((h ^ (h >>> 15)) >>> 0) & 15;
  const t = h / 15;
  return out.setRGB(0.85 + 0.25 * t, 1.0, 0.8 + 0.15 * (1 - t));
}
