/**
 * Maps. Every map is the same 2x2 bay of voxel islands with the same rules; what changes is the
 * terrain generator's dressing (trees, crater, ice spikes, crystals) and the client's theme (sky,
 * "water", block palette, backdrop). Rooms never mix maps: the map is part of the room filter.
 */
export const GameMap = Object.freeze({ ISLAND: "island", VOLCANO: "volcano", ICE: "ice", SPACE: "space" });
export const DEFAULT_MAP = GameMap.ISLAND;
export const MAP_LIST = Object.freeze([GameMap.ISLAND, GameMap.VOLCANO, GameMap.ICE, GameMap.SPACE]);

/** Menu / lobby copy per map. `sky`, `ground` and `ink` (text) are CSS colours for the picker cards. */
export const MAPS = Object.freeze({
  [GameMap.ISLAND]:  { name: "Island Bay",   tagline: "Palms, sand and sea",     sea: "sea",   sky: "#1fbde6", ground: "#5ec44c", ink: "#ffffff" },
  [GameMap.VOLCANO]: { name: "Volcano",      tagline: "Ash, embers and lava",    sea: "lava",  sky: "#3a1d24", ground: "#8a6656", ink: "#ffffff" },
  [GameMap.ICE]:     { name: "Ice Floe",     tagline: "Snow, pines and ice",     sea: "ice",   sky: "#bfe3f5", ground: "#f2f8ff", ink: "#0f3446" },
  [GameMap.SPACE]:   { name: "Deep Space",   tagline: "Asteroids and crystals",  sea: "void",  sky: "#04030c", ground: "#35c9a8", ink: "#ffffff" },
});

export const normalizeMap = (map) => (MAP_LIST.includes(map) ? map : DEFAULT_MAP);
export const mapName = (map) => MAPS[normalizeMap(map)].name;
