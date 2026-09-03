import { Block } from "./VoxelGrid.js";

/** Grid cell [x, y, z] on the beach at `angle`, one above the sand; falls back to the centre. */
export function beachSpot(grid, angle) {
  const cx = grid.sizeX / 2, cz = grid.sizeZ / 2;
  for (let r = grid.sizeX / 2; r > 0; r -= 0.5) {
    const x = Math.floor(cx + Math.cos(angle) * r);
    const z = Math.floor(cz + Math.sin(angle) * r);
    const top = grid.columnTop(x, z);
    if (top >= 0 && grid.get(x, top, z) === Block.SAND) return [x, top + 1, z];
  }
  return [cx | 0, grid.columnTop(cx | 0, cz | 0) + 1, cz | 0];
}

/** Beach cell whose nearest palm is furthest away: where the hero stands and throws from. */
export function padSpot(grid, palms) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 24; i++) {
    const spot = beachSpot(grid, (i / 24) * Math.PI * 2);
    let nearest = Infinity;
    for (const p of palms) nearest = Math.min(nearest, Math.hypot(p.x - spot[0], p.z - spot[2]));
    if (nearest > bestScore) { bestScore = nearest; best = spot; }
  }
  return best;
}
