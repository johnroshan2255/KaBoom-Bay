import {
  BOMB_BLAST_RADIUS,
  BOMB_FUSE_MS,
  BOMB_PAD_OFFSET,
  BOMB_RADIUS,
  BOMB_RESPAWN_MS,
  BOMB_REST_SPEED,
  BOMB_REST_TIME_MS,
  BombStatus,
  Message,
  WATER_LEVEL,
  ISLAND_SIZE,
  bombReturnedBonus,
  canFight,
  clampThrowVelocity,
  coinsForRemoved,
  islandCenter,
  islandIndexAt,
  islandOrigin,
  padSpot,
  resolveBlast,
  selfDestructPenalty,
} from "@kaboom-bay/shared";
import { BombState } from "../schema/BayState.js";
import { encodeDiff } from "./islands.js";
import { BOMB_PICKUP_RADIUS as PICKUP } from "@kaboom-bay/shared";

/** World position where island `i`'s bomb waits (in front of the hero on the beach). */
export function bombPadPosition(room, i) {
  const island = room.islands[i];
  island.pad ??= padSpot(island.grid, island.palms);
  const o = islandOrigin(i), c = islandCenter(i);
  const stand = { x: o.x + island.pad[0] + 0.5, y: o.y + island.pad[1], z: o.z + island.pad[2] + 0.5 };
  const dx = c.x - stand.x, dz = c.z - stand.z, len = Math.hypot(dx, dz) || 1;
  return { x: stand.x + (dx / len) * BOMB_PAD_OFFSET, y: stand.y + BOMB_RADIUS, z: stand.z + (dz / len) * BOMB_PAD_OFFSET };
}

/** A held bomb sits just in front of the hero at chest height. */
export function heldPosition(player) {
  return { x: player.x + Math.sin(player.yaw) * 0.8, y: player.y + 1.0, z: player.z + Math.cos(player.yaw) * 0.8 };
}

const holding = (room, sessionId) => [...room.state.bombs.entries()].find(([, b]) => b.holder === sessionId);

/** Puts a fresh, unarmed bomb in a player's hands. */
export function giveBomb(room, sessionId) {
  const player = room.state.players.get(sessionId);
  if (!player || !canFight(room.state.phase) || holding(room, sessionId)) return null;
  const id = `b${room.nextBombId++}`;
  const p = heldPosition(player);
  room.state.bombs.set(id, new BombState({ owner: player.islandIndex, x: p.x, y: p.y, z: p.z, status: BombStatus.HELD, holder: sessionId, islandIndex: player.islandIndex }));
  room.bombRecords.set(id, { thrower: null, restSince: 0 });
  return id;
}

export function armBomb(room, sessionId) {
  const held = holding(room, sessionId);
  if (held && !held[1].armedAt) held[1].armedAt = Date.now();
}

export function throwBomb(room, sessionId, msg) {
  if (!canFight(room.state.phase)) return false;
  const held = holding(room, sessionId);
  const vel = clampThrowVelocity(msg);
  if (!held || !vel) return false;
  const [id, bomb] = held;
  bomb.armedAt ||= Date.now();
  bomb.status = BombStatus.FLYING;
  bomb.holder = "";
  bomb.islandIndex = -1;
  room.physics.spawnBomb(id, { x: bomb.x, y: bomb.y, z: bomb.z }, vel);
  const rec = room.bombRecords.get(id);
  rec.thrower = sessionId;
  rec.restSince = 0;
  const player = room.state.players.get(sessionId);
  if (player && bomb.owner === player.islandIndex) room.respawnAt.set(sessionId, Date.now() + BOMB_RESPAWN_MS);
  room.broadcast(Message.THROW_BOMB, { id, by: sessionId });
  return true;
}

/** A defender picks up a live bomb resting on their island. */
export function grabBomb(room, sessionId, id) {
  if (!canFight(room.state.phase) || typeof id !== "string") return false;
  const player = room.state.players.get(sessionId);
  const bomb = room.state.bombs.get(id);
  if (!player || !bomb || bomb.status !== BombStatus.RESTING || bomb.islandIndex !== player.islandIndex) return false;
  if (Math.hypot(bomb.x - player.x, bomb.z - player.z) > PICKUP + 0.5) return false;
  const held = holding(room, sessionId);
  if (held) {
    // drop an unarmed bomb of your own to save the island; it comes back after the usual delay
    const [heldId, heldBomb] = held;
    if (heldBomb.armedAt || heldBomb.owner !== player.islandIndex) return false;
    removeBomb(room, heldId);
    room.respawnAt.set(sessionId, Date.now() + BOMB_RESPAWN_MS);
  }
  const body = room.physics.bodies.get(id);
  if (body) {
    const p = body.translation();
    bomb.x = p.x; bomb.y = p.y; bomb.z = p.z;
  }
  room.physics.removeBomb(id);
  bomb.status = BombStatus.HELD;
  bomb.holder = sessionId;
  return true;
}

function removeBomb(room, id) {
  room.physics.removeBomb(id);
  room.state.bombs.delete(id);
  room.bombRecords.delete(id);
}

export function clearBombs(room) {
  for (const id of [...room.state.bombs.keys()]) removeBomb(room, id);
  room.respawnAt.clear();
}

/** Per-tick bomb simulation: physics, rest detection, splashes, fuses, respawns. */
export function stepBombs(room, now, dt) {
  const { state, physics } = room;
  physics.step(dt, (a, b, point) => room.broadcast(Message.BOMB_CLASH, point));

  for (const [id, bomb] of [...state.bombs.entries()]) {
    const rec = room.bombRecords.get(id);
    const body = physics.bodies.get(id);
    if (bomb.status === BombStatus.HELD) {
      const holder = state.players.get(bomb.holder);
      if (holder) { const p = heldPosition(holder); bomb.x = p.x; bomb.y = p.y; bomb.z = p.z; }
    }
    if (body) {
      const p = body.translation();
      bomb.x = p.x; bomb.y = p.y; bomb.z = p.z;
      if (p.y < WATER_LEVEL - 0.6) {
        room.broadcast(Message.BOMB_SPLASH, { x: p.x, y: WATER_LEVEL, z: p.z });
        removeBomb(room, id);
        continue;
      }
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      // no drag in the air (keeps the preview honest); rolling friction once it's on the ground
      body.setLinearDamping(Math.abs(v.y) < 0.6 && speed < 6 ? 2.2 : 0);
      if (speed < BOMB_REST_SPEED) {
        rec.restSince ||= now;
        if (bomb.status === BombStatus.FLYING && now - rec.restSince >= BOMB_REST_TIME_MS) {
          bomb.status = BombStatus.RESTING;
          bomb.islandIndex = islandIndexAt(p.x, p.z);
        }
      } else {
        rec.restSince = 0;
        if (bomb.status === BombStatus.RESTING && speed > BOMB_REST_SPEED * 4) {
          bomb.status = BombStatus.FLYING;
          bomb.islandIndex = -1;
        }
      }
    }
    if (bomb.armedAt && now - bomb.armedAt >= BOMB_FUSE_MS) explode(room, id, bomb, now);
  }

  for (const [sessionId, t] of room.respawnAt) {
    if (now < t) continue;
    room.respawnAt.delete(sessionId);
    const p = state.players.get(sessionId);
    if (p && (p.connected || p.isBot)) giveBomb(room, sessionId);
  }
}

function explode(room, id, bomb, now) {
  const { state } = room;
  const rec = room.bombRecords.get(id);
  const pos = { x: bomb.x, y: bomb.y, z: bomb.z };
  const wasHeld = bomb.status === BombStatus.HELD;
  const holder = bomb.holder;
  const thrower = rec?.thrower;
  removeBomb(room, id);

  const hitIslands = [];
  const coinsBy = {};
  const half = ISLAND_SIZE / 2 + BOMB_BLAST_RADIUS;
  for (const island of room.islands) {
    const c = islandCenter(island.index);
    if (Math.abs(pos.x - c.x) > half || Math.abs(pos.z - c.z) > half) continue;
    const o = islandOrigin(island.index);
    const { removed } = resolveBlast(island.grid, pos.x - o.x, pos.y - o.y, pos.z - o.z, BOMB_BLAST_RADIUS);
    if (!removed.length) continue;
    hitIslands.push(island.index);
    for (const { index } of removed) state.terrainDiffs.push(encodeDiff(island.index, index));
    console.log(`[blast] island ${island.index}: ${removed.length} blocks, ${state.terrainDiffs.length} diffs total`);
    // pieces with no cells left are gone
    for (const [pieceId, cells] of island.pieces) {
      if (cells.every(([x, y, z]) => !island.grid.isSolid(x, y, z))) {
        island.pieces.delete(pieceId);
        island.pieceCount--;
        state.pieces.delete(pieceId);
      }
    }
    room.physics.rebuildIsland(island.index);

    // attacker earns coins for damage to islands that aren't their own
    const attacker = thrower && state.players.get(thrower);
    if (attacker && attacker.islandIndex !== island.index) {
      const coins = coinsForRemoved(removed);
      attacker.coins += coins;
      coinsBy[thrower] = (coinsBy[thrower] ?? 0) + coins;
    }
  }

  if (wasHeld && holder) {
    const p = state.players.get(holder);
    if (p) { p.coins += selfDestructPenalty(); coinsBy[holder] = (coinsBy[holder] ?? 0) + selfDestructPenalty(); }
  } else if (thrower) {
    // defender threw someone else's bomb away and it didn't blow up their own island: bonus
    const t = state.players.get(thrower);
    if (t && bomb.owner !== t.islandIndex && !hitIslands.includes(t.islandIndex)) {
      t.coins += bombReturnedBonus();
      coinsBy[thrower] = (coinsBy[thrower] ?? 0) + bombReturnedBonus();
    }
  }

  room.physics.applyBlastImpulse(pos, BOMB_BLAST_RADIUS, 40);
  room.broadcast(Message.BOMB_EXPLODED, { ...pos, radius: BOMB_BLAST_RADIUS, islands: hitIslands, coinsBy });
}
