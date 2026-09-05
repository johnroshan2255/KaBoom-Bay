import { Block, GameMap, normalizeMap } from "@kaboom-bay/shared";

/**
 * Client-side look of each map. The generator reuses the same block ids everywhere (see islandGen.js), so
 * a map is mostly a palette: what the atlas paints per block, sky / fog / lights, the "water" plane (sea,
 * lava, frozen sea, the void), mist, clouds and the backdrop. `setTheme()` runs once per match before the
 * scene is built; everything that draws terrain reads `theme()`.
 *
 * Terrain palette keys (used by atlas.js): grass, grassLight, grassDark, grassCap, grassCapEdge, dirt,
 * dirtDark, stone, stoneDark, stoneSeam, stoneSeam2, moss, carved, carvedDark, mushroom, mushroomSpot,
 * stem, stemEdge, sand, sandDark, woodSide, woodSideDark, woodTop, woodTopDark, leaf, leafLight, leafDark,
 * autumn, autumnLight, autumnDark, autumnHi.
 */
const ISLAND = {
  id: GameMap.ISLAND,
  sky: 0x1fbde6, fog: { color: 0x1fbde6, density: 0.0028 },
  hemi: { sky: 0xa9e6ff, ground: 0x9a8a5a, intensity: 1.15 },
  sun: { color: 0xfff0d2, intensity: 2.6 }, fill: { color: 0x8fd8ff, intensity: 0.35 },
  water: { color: 0x17a6d6, flat: 0x179fce, deep: [0.07, 0.62, 0.80], shallow: [0.12, 0.72, 0.88], sparkle: [0.08, 0.08, 0.08], waveAmp: 0.09, opacity: 0.96, emissive: 0x000000 },
  splash: 0xcdf3ff,
  mist: 0xe6f8ff,
  moss: 0x6fc45a, mossMix: 0x9fb3a8,
  flowers: [0xffffff, 0xff8fc2, 0xffe36b],
  grassTint: { from: [0.85, 1.0, 0.8], to: [1.1, 1.0, 0.95] },
  clouds: { color: 0xffffff, opacity: 0.9, count: 11 },
  waterfall: { a: [0.62, 0.9, 1.0], b: [1, 1, 1], splash: 0xeaf9ff },
  backdrop: null,
  palette: {
    grass: 0x6cd15a, grassLight: 0x83de6c, grassDark: 0x5ec24f, grassCap: 0x6cd15a, grassCapEdge: 0x57b64b,
    dirt: 0x8f5f38, dirtDark: 0x7d5030,
    stone: 0x86a892, stoneDark: 0x789a84, stoneSeam: 0x6a8a76, stoneSeam2: 0x759680, moss: 0x66c65a,
    carved: 0x86a892, carvedDark: 0x668a74,
    mushroom: 0xe04a3a, mushroomSpot: 0xfff3e6, stem: 0xf1e4c8, stemEdge: 0xd9c9a6,
    sand: 0xf1d48e, sandDark: 0xe6c47a,
    woodSide: 0x8c5a2e, woodSideDark: 0x734a25, woodTop: 0xa9743f, woodTopDark: 0x8c5a2e,
    leaf: 0x4cb955, leafLight: 0x6fd36a, leafDark: 0x3a9a47,
    autumn: 0xb8622a, autumnLight: 0xd47a35, autumnDark: 0x9a4d1f, autumnHi: 0xe89a4a,
  },
  blocks: { [Block.ROCK]: 0x86a892, [Block.SAND]: 0xf1d48e, [Block.GRASS]: 0x5ec44c, [Block.DIRT]: 0x8a5a34, [Block.WOOD]: 0x8c5a2e, [Block.LEAF]: 0x4cb955, [Block.LEAF_AUTUMN]: 0xb8622a, [Block.MUSHROOM]: 0xe04a3a, [Block.STEM]: 0xf1e4c8, [Block.CARVED]: 0x86a892 },
};

const VOLCANO = {
  id: GameMap.VOLCANO,
  sky: 0x3a1d24, fog: { color: 0x5a2c2c, density: 0.0030 },
  hemi: { sky: 0xb08078, ground: 0xff8a40, intensity: 1.3 },
  sun: { color: 0xffd8b0, intensity: 2.7 }, fill: { color: 0xff7a3a, intensity: 0.5 },
  water: { color: 0xd8431a, flat: 0xd8431a, deep: [0.72, 0.22, 0.05], shallow: [0.95, 0.48, 0.10], sparkle: [0.30, 0.20, 0.05], waveAmp: 0.05, opacity: 1, emissive: 0x4a1204 },
  splash: 0xff8a3a,
  mist: 0x4a3a3a,
  moss: 0xe0522a, mossMix: 0x6a4a48,
  flowers: [0xff9a3a, 0xffd23f, 0xff6a2a],
  grassTint: { from: [0.9, 0.85, 0.85], to: [1.1, 0.95, 0.9] },
  clouds: { color: 0x4a3a3e, opacity: 0.85, count: 9 },
  waterfall: { a: [1.0, 0.45, 0.08], b: [1.0, 0.85, 0.3], splash: 0xffa040 },
  backdrop: "volcano",
  palette: {
    grass: 0x8a6656, grassLight: 0x9c7866, grassDark: 0x74544a, grassCap: 0x8a6656, grassCapEdge: 0x6b4a40,
    dirt: 0x5e3e30, dirtDark: 0x4c3126,
    stone: 0x6b5c62, stoneDark: 0x5a4c52, stoneSeam: 0x3e3238, stoneSeam2: 0x4a3c42, moss: 0xe0522a,
    carved: 0x7a6a70, carvedDark: 0x4a3c42,
    mushroom: 0xff7a1a, mushroomSpot: 0xffe066, stem: 0x241c20, stemEdge: 0x140e10,
    sand: 0x4a4245, sandDark: 0x3d3639,
    woodSide: 0x4e3a30, woodSideDark: 0x3a2a22, woodTop: 0x5e463a, woodTopDark: 0x4e3a30,
    leaf: 0x4a3a34, leafLight: 0x5c4a42, leafDark: 0x3a2c26,
    autumn: 0xd0561e, autumnLight: 0xf07a2a, autumnDark: 0xa03a12, autumnHi: 0xffb040,
  },
  blocks: { [Block.ROCK]: 0x6b5c62, [Block.SAND]: 0x4a4245, [Block.GRASS]: 0x8a6656, [Block.DIRT]: 0x5e3e30, [Block.WOOD]: 0x4e3a30, [Block.LEAF]: 0x4a3a34, [Block.LEAF_AUTUMN]: 0xd0561e, [Block.MUSHROOM]: 0xff7a1a, [Block.STEM]: 0x241c20, [Block.CARVED]: 0x7a6a70 },
};

const ICE = {
  id: GameMap.ICE,
  sky: 0xbfe3f5, fog: { color: 0xd6ecf7, density: 0.0030 },
  hemi: { sky: 0xdff3ff, ground: 0x9fb8c8, intensity: 1.25 },
  sun: { color: 0xfff8ee, intensity: 2.4 }, fill: { color: 0xa8d8ff, intensity: 0.45 },
  water: { color: 0xbfe3f2, flat: 0xb9dff0, deep: [0.66, 0.85, 0.93], shallow: [0.86, 0.95, 0.99], sparkle: [0.12, 0.12, 0.14], waveAmp: 0.0, opacity: 1, emissive: 0x000000 },
  splash: 0xf4fbff,
  mist: 0xffffff,
  moss: 0xf4fbff, mossMix: 0xcfe6f2,
  flowers: [0xffffff, 0xcfefff, 0x9fd8ff],
  grassTint: { from: [0.94, 0.97, 1.0], to: [1.0, 1.0, 1.0] },
  clouds: { color: 0xffffff, opacity: 0.95, count: 12 },
  waterfall: null,
  backdrop: "ice",
  palette: {
    grass: 0xf2f8ff, grassLight: 0xffffff, grassDark: 0xdbe9f5, grassCap: 0xf2f8ff, grassCapEdge: 0xc9dbe8,
    dirt: 0x6f7d8c, dirtDark: 0x5c6976,
    stone: 0x7e9ab0, stoneDark: 0x6e8aa0, stoneSeam: 0x5c7890, stoneSeam2: 0x688498, moss: 0xf4fbff,
    carved: 0x8aa8bd, carvedDark: 0x62808f,
    mushroom: 0x9fe8ff, mushroomSpot: 0xffffff, stem: 0xcaf2ff, stemEdge: 0xa6dcf0,
    sand: 0xbfe6f5, sandDark: 0xa6d8ec,
    woodSide: 0x5a4030, woodSideDark: 0x46301f, woodTop: 0x6e5040, woodTopDark: 0x5a4030,
    leaf: 0x2f6b4f, leafLight: 0xeaf7ff, leafDark: 0x235540,
    autumn: 0x8fc8d8, autumnLight: 0xb8e4f0, autumnDark: 0x6aa8bc, autumnHi: 0xffffff,
  },
  blocks: { [Block.ROCK]: 0x7e9ab0, [Block.SAND]: 0xbfe6f5, [Block.GRASS]: 0xf2f8ff, [Block.DIRT]: 0x6f7d8c, [Block.WOOD]: 0x5a4030, [Block.LEAF]: 0x2f6b4f, [Block.LEAF_AUTUMN]: 0x8fc8d8, [Block.MUSHROOM]: 0x9fe8ff, [Block.STEM]: 0xcaf2ff, [Block.CARVED]: 0x8aa8bd },
};

const SPACE = {
  id: GameMap.SPACE,
  // deep space: near-black sky, hard white sun, grey moon rock and bioluminescent turf; the void below is a starry black
  sky: 0x04030c, fog: { color: 0x0a0718, density: 0.0011 },
  hemi: { sky: 0x5a4a90, ground: 0x1a1030, intensity: 0.9 },
  sun: { color: 0xffffff, intensity: 2.9 }, fill: { color: 0x3ee6d6, intensity: 0.4 },
  water: { color: 0x07051a, flat: 0x040310, deep: [0.004, 0.003, 0.012], shallow: [0.03, 0.015, 0.07], sparkle: [0.9, 0.9, 1.0], waveAmp: 0.0, opacity: 1, emissive: 0x000000, stars: true },
  splash: 0x9a7cff,
  mist: 0x6ad0ff,
  moss: 0x3ee6d6, mossMix: 0x7a7890,
  flowers: [0x3ee6d6, 0xff6fd8, 0xfff2a8],
  grassTint: { from: [0.85, 1.0, 0.95], to: [1.0, 1.0, 1.1] },
  clouds: null,
  waterfall: null,
  backdrop: "space",
  palette: {
    grass: 0x35c9a8, grassLight: 0x8fffe0, grassDark: 0x2a9a82, grassCap: 0x35c9a8, grassCapEdge: 0x238a74,
    dirt: 0x565270, dirtDark: 0x45415c,
    stone: 0x7a7890, stoneDark: 0x66647c, stoneSeam: 0x4c4a60, stoneSeam2: 0x585670, moss: 0x3ee6d6,
    carved: 0x8480a0, carvedDark: 0x3ee6d6,
    mushroom: 0xff6fd8, mushroomSpot: 0xffffff, stem: 0xe8e0ff, stemEdge: 0xc4b8f0,
    sand: 0xb0aeb8, sandDark: 0x9c9aa6,
    woodSide: 0x3a3050, woodSideDark: 0x2a2240, woodTop: 0x4a3e66, woodTopDark: 0x3a3050,
    leaf: 0xc84ad8, leafLight: 0xe88af0, leafDark: 0x9a2ea8,
    autumn: 0x4ad8e8, autumnLight: 0x8ff0fa, autumnDark: 0x2aa8b8, autumnHi: 0xffffff,
  },
  blocks: { [Block.ROCK]: 0x7a7890, [Block.SAND]: 0xb0aeb8, [Block.GRASS]: 0x35c9a8, [Block.DIRT]: 0x565270, [Block.WOOD]: 0x3a3050, [Block.LEAF]: 0xc84ad8, [Block.LEAF_AUTUMN]: 0x4ad8e8, [Block.MUSHROOM]: 0xff6fd8, [Block.STEM]: 0xe8e0ff, [Block.CARVED]: 0x8480a0 },
};

export const THEMES = Object.freeze({ [GameMap.ISLAND]: ISLAND, [GameMap.VOLCANO]: VOLCANO, [GameMap.ICE]: ICE, [GameMap.SPACE]: SPACE });

let current = ISLAND;
/** Selects the map the next scene draws. Call before building islands, water or effects. */
export function setTheme(map) {
  current = THEMES[normalizeMap(map)];
  // anything the canvas doesn't cover (safe areas, a browser toolbar animating away) shows the map's sky, not the island's cyan
  if (typeof document !== "undefined") document.documentElement.style.backgroundColor = `#${current.sky.toString(16).padStart(6, "0")}`;
  return current;
}
export const theme = () => current;
export const themeFor = (map) => THEMES[normalizeMap(map)];
