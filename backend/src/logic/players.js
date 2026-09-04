import { HERO_RESPAWN_COOLDOWN_MS, ISLAND_SIZE, KNOCKBACK_MOVE_GRACE_MS, MOVE_MAX_STEP, Message, islandCenter, islandOrigin, padSpot } from "@kaboom-bay/shared";

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

/**
 * Feet height at a world x/z on the player's island, or null if not standable. `fromY` is the feet height
 * the hero steps from (one block up is allowed; canopies and ruin roofs overhead are ignored); pass
 * Infinity for something landing from the sky.
 */
export function groundAt(room, islandIndex, x, z, fromY = Infinity) {
  const island = room.islands[islandIndex];
  const o = islandOrigin(islandIndex);
  const gx = Math.floor(x - o.x), gz = Math.floor(z - o.z);
  if (gx < 0 || gz < 0 || gx >= ISLAND_SIZE || gz >= ISLAND_SIZE) return null;
  const feet = island.grid.surfaceAt(gx, gz, Math.min(island.grid.sizeY - 1, Math.floor(fromY - o.y + 1e-3)));
  return feet >= 0 ? o.y + feet : null;
}

/**
 * MOVE intent: keep the hero on their own island's solid ground and reject teleports. Right after a
 * blast knocked this hero, much larger steps are accepted (the client is animating the flight).
 */
export function handleMove(room, player, msg, sessionId) {
  if (!player || !msg || ![msg.x, msg.z, msg.yaw].every(Number.isFinite)) return false;
  const knocked = sessionId && Date.now() - (room.knockedAt.get(sessionId) ?? -Infinity) < KNOCKBACK_MOVE_GRACE_MS;
  const y = groundAt(room, player.islandIndex, msg.x, msg.z, knocked ? Infinity : player.y); // a thrown hero may land anywhere
  if (y === null) return false;
  if (Math.hypot(msg.x - player.x, msg.z - player.z) > MOVE_MAX_STEP * (knocked ? 5 : 1)) return false;
  player.x = msg.x;
  player.z = msg.z;
  player.y = y;
  player.yaw = msg.yaw;
  return true;
}

/**
 * HERO_RESPAWN: the client's hero was thrown off the island and hit the water. Only honoured shortly
 * after a knockback and not more often than the cooldown; everyone gets a splash, the faller a new pose.
 */
export function heroRespawn(room, client, msg) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return false;
  const now = Date.now();
  if (now - (room.knockedAt.get(client.sessionId) ?? -Infinity) > 8000) return false;
  if (now - (room.respawnedAt.get(client.sessionId) ?? -Infinity) < HERO_RESPAWN_COOLDOWN_MS) return false;
  room.respawnedAt.set(client.sessionId, now);
  const sx = Number.isFinite(msg?.x) ? msg.x : player.x, sz = Number.isFinite(msg?.z) ? msg.z : player.z;
  room.broadcast(Message.HERO_FELL, { by: client.sessionId, x: sx, z: sz });
  placeAtSpawn(room, player);
  client.send(Message.HERO_RESPAWN, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
  return true;
}
