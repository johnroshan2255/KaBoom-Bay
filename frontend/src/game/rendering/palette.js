import * as THREE from "three";
import { Block } from "@kaboom-bay/shared";
import { TILE } from "./atlas.js";
import { theme } from "./theme.js";

/**
 * Average colour per block id - used for debris and anything that isn't textured. Terrain colours come
 * from the current map's theme (see blockColor()); building pieces are the same on every map.
 */
export const BLOCK_COLORS = {
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

const cache = new Map(); // "mapId:block" -> Color
export function blockColor(block) {
  const t = theme();
  const key = `${t.id}:${block}`;
  let c = cache.get(key);
  if (!c) {
    c = new THREE.Color(t.blocks[block] ?? BLOCK_COLORS[block] ?? 0xff00ff);
    cache.set(key, c);
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
/** Flower decal colours of the current map (glowing spores in space, embers on the volcano). */
export const flowerColors = () => theme().flowers;

/** Grass gets a per-cell hue drift (fresh vs mossy green on the island; the theme sets the two ends). */
export function grassTint(x, z, out) {
  let h = (x * 2654435761) ^ (z * 40503);
  h = ((h ^ (h >>> 15)) >>> 0) & 15;
  const t = h / 15;
  const { from, to } = theme().grassTint;
  return out.setRGB(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
}
