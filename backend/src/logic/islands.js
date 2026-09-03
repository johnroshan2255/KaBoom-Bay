import { generateIsland, ISLAND_COUNT } from "@kaboom-bay/shared";

/** Server-side voxel grids for all islands, derived from the match seed (clients do the same). */
export function createIslands(seed) {
  const islands = [];
  for (let i = 0; i < ISLAND_COUNT; i++) {
    const { grid, palms } = generateIsland({ seed: seed + i });
    islands.push({ index: i, grid, palms, pieces: new Map(), pieceCount: 0 });
  }
  return islands;
}

export const encodeDiff = (islandIndex, cellIndex) => ((islandIndex << 16) | cellIndex) >>> 0;
