/**
 * Rapier colliders for a voxel island: one cuboid per contiguous solid run in each column.
 * Exact for craters, overhangs and buildings; ~400 colliders per island, rebuilt in a few ms.
 * Shared by the client sandbox and the authoritative server (each passes its own RAPIER module).
 */
export function buildTerrainColliders(RAPIER, world, body, grid, origin, existing = []) {
  for (const c of existing) world.removeCollider(c, false);
  const colliders = [];
  for (let z = 0; z < grid.sizeZ; z++) {
    for (let x = 0; x < grid.sizeX; x++) {
      for (const [y0, y1] of grid.columnRuns(x, z)) {
        const h = y1 - y0;
        const desc = RAPIER.ColliderDesc.cuboid(0.5, h / 2, 0.5)
          .setTranslation(origin.x + x + 0.5, origin.y + y0 + h / 2, origin.z + z + 0.5)
          .setFriction(0.9)
          .setRestitution(0.25);
        colliders.push(world.createCollider(desc, body));
      }
    }
  }
  return colliders;
}
