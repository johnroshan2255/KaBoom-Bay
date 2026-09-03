import { Block } from "../voxel/VoxelGrid.js";
import { MAX_PIECES_PER_ISLAND } from "../constants.js";
import { PIECES, pieceCells } from "./pieces.js";

export const PlaceError = Object.freeze({
  UNKNOWN_PIECE: "unknown_piece",
  BUDGET: "budget",
  OUT_OF_BOUNDS: "out_of_bounds",
  OCCUPIED: "occupied",
  UNSUPPORTED: "unsupported",
});

const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Validates a free-form placement. Rules:
 *  - known piece, island piece budget not exhausted
 *  - every cell inside the grid and currently AIR
 *  - at least one cell touches an existing solid block (terrain or another piece)
 *    so nothing floats in mid-air or over open water.
 *
 * @returns {{ ok: true, cells: number[][] } | { ok: false, reason: string }}
 */
export function canPlace(grid, type, x, y, z, rot = 0, { pieceCount = 0, maxPieces = MAX_PIECES_PER_ISLAND } = {}) {
  if (!PIECES[type]) return { ok: false, reason: PlaceError.UNKNOWN_PIECE };
  if (pieceCount >= maxPieces) return { ok: false, reason: PlaceError.BUDGET };

  const cells = pieceCells(type, x, y, z, rot);
  const own = new Set();
  for (const [cx, cy, cz] of cells) {
    if (!grid.inBounds(cx, cy, cz)) return { ok: false, reason: PlaceError.OUT_OF_BOUNDS };
    if (grid.get(cx, cy, cz) !== Block.AIR) return { ok: false, reason: PlaceError.OCCUPIED };
    own.add(grid.index(cx, cy, cz));
  }

  let supported = false;
  outer: for (const [cx, cy, cz] of cells) {
    for (const [nx, ny, nz] of NEIGHBOURS) {
      const ax = cx + nx, ay = cy + ny, az = cz + nz;
      if (!grid.inBounds(ax, ay, az)) continue;
      if (own.has(grid.index(ax, ay, az))) continue;
      if (grid.get(ax, ay, az) !== Block.AIR) { supported = true; break outer; }
    }
  }
  if (!supported) return { ok: false, reason: PlaceError.UNSUPPORTED };
  return { ok: true, cells };
}

/** Writes a piece's block id into the grid cells returned by canPlace(). */
export function applyPlacement(grid, type, cells) {
  for (const [x, y, z] of cells) grid.set(x, y, z, type);
}

/** Clears cells back to AIR (piece removed or destroyed). */
export function clearCells(grid, cells) {
  for (const [x, y, z] of cells) grid.set(x, y, z, Block.AIR);
}

/** Convenience: highest solid cell in a column + 1, i.e. where a piece would sit on the ground. */
export function groundLevel(grid, x, z) {
  return grid.columnTop(x, z) + 1;
}
