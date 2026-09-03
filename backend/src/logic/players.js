import { ISLAND_SIZE, MOVE_MAX_STEP, islandCenter, islandOrigin, padSpot } from "@kaboom-bay/shared";

/** Where island `i`'s hero starts: on the beach pad, facing the island centre. */
export function spawnPose(room, i) {
  const island = room.islands[i];
  island.pad ??= padSpot(island.grid, island.palms);
  const o = islandOrigin(i), c = islandCenter(i);
  const x = o.x + island.pad[0] + 0.5, z = o.z + island.pad[2] + 0.5, y = o.y + island.pad[1];
  return { x, y, z, yaw: Math.atan2(c.x - x, c.z - z) };
}

export function placeAtSpawn(room, player) {
  Object.assign(player, spawnPose(room, player.islandIndex));
}

/** Ground height (feet y) at a world x/z on the player's island, or null if not walkable. */
export function groundAt(room, islandIndex, x, z) {
  const island = room.islands[islandIndex];
  const o = islandOrigin(islandIndex);
  const gx = Math.floor(x - o.x), gz = Math.floor(z - o.z);
  if (gx < 0 || gz < 0 || gx >= ISLAND_SIZE || gz >= ISLAND_SIZE) return null;
  const top = island.grid.columnTop(gx, gz);
  return top >= 0 ? o.y + top + 1 : null;
}

/** MOVE intent: keep the hero on their own island's solid ground and reject teleports. */
export function handleMove(room, player, msg) {
  if (!player || !msg || ![msg.x, msg.z, msg.yaw].every(Number.isFinite)) return false;
  const y = groundAt(room, player.islandIndex, msg.x, msg.z);
  if (y === null) return false;
  if (Math.hypot(msg.x - player.x, msg.z - player.z) > MOVE_MAX_STEP) return false;
  player.x = msg.x;
  player.z = msg.z;
  player.y = y;
  player.yaw = msg.yaw;
  return true;
}
