import { Block } from "../voxel/VoxelGrid.js";

/**
 * Building piece catalog. Each piece is a set of voxel cells relative to its anchor at rotation 0.
 * Players combine these freely; there are no house templates.
 */
export const PIECES = Object.freeze({
  [Block.PLANK]: { block: Block.PLANK, key: "plank", name: "Plank", cells: [[0, 0, 0], [0, 0, 1], [0, 0, 2]] },
  [Block.BEAM]: { block: Block.BEAM, key: "beam", name: "Beam", cells: [[0, 0, 0], [0, 1, 0], [0, 2, 0]] },
  [Block.WALL]: { block: Block.WALL, key: "wall", name: "Wall", cells: box(3, 3, 1) },
  [Block.FLOOR]: { block: Block.FLOOR, key: "floor", name: "Floor", cells: box(3, 1, 3) },
  [Block.ROOF]: { block: Block.ROOF, key: "roof", name: "Roof", cells: [...box(3, 1, 3), [1, 1, 0], [1, 1, 1], [1, 1, 2]] },
  [Block.DOOR]: { block: Block.DOOR, key: "door", name: "Door", cells: [[0, 0, 0], [0, 1, 0]] },
  [Block.WINDOW]: { block: Block.WINDOW, key: "window", name: "Window", cells: [[0, 0, 0]] },
});

export const PIECE_TYPES = Object.freeze(Object.keys(PIECES).map(Number));

function box(sx, sy, sz) {
  const cells = [];
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) cells.push([x, y, z]);
  return cells;
}

/** Rotates a relative cell offset by rot * 90 degrees around the Y axis. */
export function rotateOffset([dx, dy, dz], rot) {
  switch (rot & 3) {
    case 1: return [-dz, dy, dx];
    case 2: return [-dx, dy, -dz];
    case 3: return [dz, dy, -dx];
    default: return [dx, dy, dz];
  }
}

/** Absolute grid cells a piece would occupy. Returns null for unknown piece types. */
export function pieceCells(type, x, y, z, rot = 0) {
  const def = PIECES[type];
  if (!def) return null;
  return def.cells.map((c) => {
    const [dx, dy, dz] = rotateOffset(c, rot);
    return [x + dx, y + dy, z + dz];
  });
}
