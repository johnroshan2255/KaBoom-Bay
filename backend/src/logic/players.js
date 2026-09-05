import { dropFlag } from "./match.js";
import { ARENA_INDEX, FLAG_TETHER, GameType, HERO_JUMP_MAX_RISE, HERO_RESPAWN_COOLDOWN_MS, KNOCKBACK_MOVE_GRACE_MS, MOVE_MAX_STEP, Message, activeIslands, islandCenter, islandOrigin, padSpot } from "@kaboom-bay/shared";

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

/** Feet height on one grid (island or arena) at a world x/z, or null. */
function groundOn(island, x, z, fromY) {
  if (!island) return null;
  const o = islandOrigin(island.index);
  const gx = Math.floor(x - o.x), gz = Math.floor(z - o.z);
  if (!island.grid.inBounds(gx, 0, gz)) return null;
  const feet = island.grid.surfaceAt(gx, gz, Math.min(island.grid.sizeY - 1, Math.floor(fromY - o.y + 1e-3)));
  return feet >= 0 ? o.y + feet : null;
}

/** Grids a hero on island `islandIndex` may stand on: their own island; in capture the flag also the arena and the other islands in play. */
export function walkableGrids(room, islandIndex) {
  const own = room.islands[islandIndex];
  if (room.state.game !== GameType.CTF || !room.islands[ARENA_INDEX]) return [own];
  const others = activeIslands(room.state.islandCount).filter((i) => i !== islandIndex).map((i) => room.islands[i]);
  return [own, room.islands[ARENA_INDEX], ...others];
}

/**
 * Feet height at a world x/z the player may stand on, or null if not standable. `fromY` is the feet height
 * the hero steps from (one block up is allowed; canopies and ruin roofs overhead are ignored); pass
 * Infinity for something landing from the sky. Classic: their own island. Capture the flag: also the
 * bridges, the hub and rival islands.
 */
export function groundAt(room, islandIndex, x, z, fromY = Infinity) {
  for (const island of walkableGrids(room, islandIndex)) {
    const y = groundOn(island, x, z, fromY);
    if (y !== null) return y;
  }
  return null;
}

/**
 * MOVE intent: keep the hero on their own island's solid ground and reject teleports. `msg.y` is the client's
 * feet height: a jump may report up to HERO_JUMP_MAX_RISE above the last accepted height, which also lets the
 * hero land on ledges that high (the ground search starts from that height). Right after a blast knocked this
 * hero, much larger steps are accepted (the client is animating the flight).
 */
export function handleMove(room, player, msg, sessionId) {
  if (!player || player.dead || !msg || ![msg.x, msg.z, msg.yaw].every(Number.isFinite)) return false;
  const knocked = sessionId && Date.now() - (room.knockedAt.get(sessionId) ?? -Infinity) < KNOCKBACK_MOVE_GRACE_MS;
  const reported = Number.isFinite(msg.y) ? msg.y : player.y;
  const fromY = knocked ? Infinity : Math.max(player.y, Math.min(reported, player.y + HERO_JUMP_MAX_RISE)); // a thrown hero may land anywhere
  const y = groundAt(room, player.islandIndex, msg.x, msg.z, fromY);
  if (y === null) return false;
  if (Math.hypot(msg.x - player.x, msg.z - player.z) > MOVE_MAX_STEP * (knocked ? 5 : 1)) return false;
  // tug of war: a contested flag keeps its holders within FLAG_TETHER of each other; a step that pulls further away is refused
  const f = room.state.flag;
  if (f && f.holders.length > 1 && f.holders.includes(sessionId)) {
    let cx = 0, cz = 0, n = 0;
    for (const k of f.holders) { if (k === sessionId) continue; const o = room.state.players.get(k); if (o) { cx += o.x; cz += o.z; n++; } }
    if (n) {
      cx /= n; cz /= n;
      const dNew = Math.hypot(msg.x - cx, msg.z - cz), dOld = Math.hypot(player.x - cx, player.z - cz);
      if (dNew > FLAG_TETHER && dNew > dOld) return false;
    }
  }
  player.x = msg.x;
  player.z = msg.z;
  player.y = reported >= y - 0.05 && reported <= y + HERO_JUMP_MAX_RISE + 0.5 ? reported : y; // in the air over that ground, or on it
  player.yaw = msg.yaw;
  return true;
}

/**
 * HERO_RESPAWN: the client's hero was thrown off the island and hit the water. Only honoured shortly
 * after a knockback and not more often than the cooldown; everyone gets a splash, the faller a new pose.
 */
export function heroRespawn(room, client, msg) {
  const player = room.state.players.get(client.sessionId);
  if (!player || player.dead) return false;
  const now = Date.now();
  // walking off a bridge or a cliff is a fall too (no knockback needed); only the cooldown guards against spamming
  if (now - (room.respawnedAt.get(client.sessionId) ?? -Infinity) < HERO_RESPAWN_COOLDOWN_MS) return false;
  room.respawnedAt.set(client.sessionId, now);
  const sx = Number.isFinite(msg?.x) ? msg.x : player.x, sz = Number.isFinite(msg?.z) ? msg.z : player.z;
  room.broadcast(Message.HERO_FELL, { by: client.sessionId, x: sx, z: sz });
  for (const [id, b] of [...room.state.bombs.entries()]) if (b.holder === client.sessionId && b.armedAt) { room.state.bombs.delete(id); room.bombRecords.delete(id); } // a lit bomb goes down with you
  if (room.state.flag?.holders.includes(client.sessionId)) dropFlag(room, player, now);
  placeAtSpawn(room, player);
  client.send(Message.HERO_RESPAWN, { x: player.x, y: player.y, z: player.z, yaw: player.yaw });
  return true;
}
