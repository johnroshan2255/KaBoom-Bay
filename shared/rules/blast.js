import { Block } from "../voxel/VoxelGrid.js";
import { BEDROCK_LAYERS } from "../constants.js";
import { coinsForRemoved } from "./scoring.js";

/**
 * Removes every block whose centre lies within `radius` of the blast centre.
 * Mutates `grid`. Coordinates are island-local (grid) units, floats allowed.
 * Bedrock layers are never removed so an island can't be erased completely.
 *
 * @returns {{ removed: Array<{ index: number, block: number }>, coins: number }}
 */
export function resolveBlast(grid, cx, cy, cz, radius) {
  const removed = [];
  const r2 = radius * radius;

  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(grid.sizeX - 1, Math.ceil(cx + radius));
  const y0 = Math.max(BEDROCK_LAYERS, Math.floor(cy - radius));
  const y1 = Math.min(grid.sizeY - 1, Math.ceil(cy + radius));
  const z0 = Math.max(0, Math.floor(cz - radius));
  const z1 = Math.min(grid.sizeZ - 1, Math.ceil(cz + radius));

  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let z = z0; z <= z1; z++) {
      const dz = z + 0.5 - cz;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        const i = grid.index(x, y, z);
        const block = grid.data[i];
        if (block === Block.AIR) continue;
        grid.data[i] = Block.AIR;
        removed.push({ index: i, block });
      }
    }
  }
  return { removed, coins: coinsForRemoved(removed) };
}
