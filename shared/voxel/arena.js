import { VoxelGrid, Block } from "./VoxelGrid.js";
import { ARENA_INDEX, ARENA_ORIGIN, ARENA_SIZE_X, ARENA_SIZE_Z, BRIDGE_DECK_Y, ISLAND_GRID_HEIGHT, islandOrigin } from "../constants.js";

/** Bridge x columns per island: the two west islands use x -20 / -19, the east ones 19 / 20 (4 blocks off the island's centre line, so the beach is always reached). */
export const bridgeColumns = (islandIndex) => (islandIndex % 2 === 0 ? [-20, -19] : [19, 20]);

/**
 * Capture-the-flag arena: a carved-stone hub bar between the island rows (x -21..20, z -2..2), a 9x9 plaza
 * around the flag at the origin, and a two-wide plank bridge from the hub to each island in play. A bridge
 * runs along z until it meets the first solid column of its island (the beach), so it always touches land
 * whatever the island's outline. `owner[cell]` is the island a bridge cell belongs to (255 for the hub).
 * Deterministic: client and server build the same arena from the same islands and island set.
 */
export function generateArena({ islands, active }) {
  const grid = new VoxelGrid(ARENA_SIZE_X, ISLAND_GRID_HEIGHT, ARENA_SIZE_Z);
  const owner = new Uint8Array(grid.length).fill(255);
  const o = ARENA_ORIGIN;
  const set = (wx, wz, block, own = 255) => {
    const gx = wx - o.x, gz = wz - o.z;
    if (grid.set(gx, BRIDGE_DECK_Y, gz, block)) owner[grid.index(gx, BRIDGE_DECK_Y, gz)] = own;
  };
  for (let x = -21; x <= 20; x++) for (let z = -2; z <= 2; z++) set(x, z, Block.CARVED);
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) set(x, z, Block.CARVED);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) grid.set(x - o.x, BRIDGE_DECK_Y + 1, z - o.z, Block.CARVED); // corner posts
  const bridges = {};
  for (const i of active) {
    const isl = islands[i];
    if (!isl) continue;
    const io = islandOrigin(i);
    const xs = bridgeColumns(i);
    const dir = i < 2 ? -1 : 1; // north islands lie at negative z
    const cells = [];
    for (let z = dir * 3; Math.abs(z) < ARENA_SIZE_Z / 2; z += dir) {
      if (xs.every((x) => isl.grid.inBounds(x - io.x, 0, z - io.z) && isl.grid.columnTop(x - io.x, z - io.z) >= 0)) break; // reached the beach
      for (const x of xs) { set(x, z, Block.PLANK, i); cells.push(grid.index(x - o.x, BRIDGE_DECK_Y, z - o.z)); }
    }
    bridges[i] = cells; // ordered from the hub outwards
  }
  return { index: ARENA_INDEX, grid, owner, bridges, origin: { ...o }, center: { x: 0, y: 0, z: 0 } };
}

/** World position of the flag's home spot: the middle of the plaza, standing on the deck. */
export const flagHome = () => ({ x: 0.5, y: BRIDGE_DECK_Y + 1, z: 0.5 });
