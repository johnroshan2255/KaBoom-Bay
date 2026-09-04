import {
  BOMB_BLAST_RADIUS,
  BOMB_FUSE_MS,
  BOMB_TYPES,
  BombType,
  CLUSTERLET_FUSE_MS,
  CLUSTERLET_SPEED,
  GRAVITY,
  blastKnockback,
  knockbackLanding,
  BOMB_PAD_OFFSET,
  BOMB_RADIUS,
  BOMB_RESPAWN_MS,
  BOMB_REST_SPEED,
  BOMB_REST_TIME_MS,
  BombStatus,
  Message,
  WATER_LEVEL,
  ISLAND_SIZE,
  activeIslands,
  bombReturnedBonus,
  canFight,
  clampThrowVelocity,
  coinsForRemoved,
  islandCenter,
  islandIndexAt,
  islandOrigin,
  padSpot,
  resolveBlast,
  sameTeam,
  selfDestructPenalty,
} from "@kaboom-bay/shared";
import { BombState } from "../schema/BayState.js";
import { encodeDiff } from "./islands.js";
import { groundAt, placeAtSpawn } from "./players.js";
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

/** [id, bomb] held by `sessionId`, without materialising the whole map every call (runs per player per tick). */
function holding(room, sessionId) {
  for (const [id, b] of room.state.bombs.entries()) if (b.holder === sessionId) return [id, b];
  return undefined;
}

/** Takes one special bomb of the player's selected type out of their inventory, or falls back to standard. */
function takeSelectedType(player) {
  const type = player.selected;
  if (type && type !== BombType.STANDARD && BOMB_TYPES[type]) {
    const n = player.bombs.get(type) ?? 0;
    if (n > 0) {
      if (n === 1) { player.bombs.delete(type); player.selected = BombType.STANDARD; } else player.bombs.set(type, n - 1);
      return type;
    }
  }
  player.selected = BombType.STANDARD;
  return BombType.STANDARD;
}

/** Puts a fresh, unarmed bomb of the player's selected type in their hands. */
export function giveBomb(room, sessionId) {
  const player = room.state.players.get(sessionId);
  if (!player || !canFight(room.state.phase) || holding(room, sessionId)) return null;
  const id = `b${room.nextBombId++}`;
  const p = heldPosition(player);
  const type = takeSelectedType(player);
  room.state.bombs.set(id, new BombState({ type, owner: player.islandIndex, x: p.x, y: p.y, z: p.z, status: BombStatus.HELD, holder: sessionId, islandIndex: player.islandIndex }));
  room.bombRecords.set(id, { thrower: null, restSince: 0, thrownAt: 0 });
  return id;
}

/**
 * SELECT_BOMB: choose the type for the next bomb. An unarmed bomb already in hand is swapped to the new
 * type right away (its previous special type goes back into the inventory).
 */
export function selectBomb(room, sessionId, type) {
  const player = room.state.players.get(sessionId);
  if (!player || !BOMB_TYPES[type] || type === BombType.CLUSTERLET) return false;
  if (type !== BombType.STANDARD && !(player.bombs.get(type) > 0)) return false;
  player.selected = type;
  const held = holding(room, sessionId);
  if (held && !held[1].armedAt && held[1].owner === player.islandIndex && held[1].type !== type) {
    const prev = held[1].type;
    if (prev !== BombType.STANDARD) player.bombs.set(prev, (player.bombs.get(prev) ?? 0) + 1);
    held[1].type = takeSelectedType(player);
    player.selected = held[1].type; // shows what is in hand
  }
  return true;
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
  rec.thrownAt = Date.now();
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
  const impacts = new Set();
  physics.step(dt, (a, b, point) => room.broadcast(Message.BOMB_CLASH, point), (id) => impacts.add(id));
  for (const id of impacts) {
    const bomb = state.bombs.get(id), rec = room.bombRecords.get(id);
    // impact bombs blow on their first touch after leaving the thrower's hands (a short grace so they clear the hero)
    if (bomb && BOMB_TYPES[bomb.type]?.impact && bomb.status !== BombStatus.HELD && now - (rec?.thrownAt ?? 0) > 250) explode(room, id, bomb, now);
  }

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

  // Everyone in play always has a bomb coming: empty hands (own bomb thrown, blown up in hand, or an
  // enemy bomb hurled back) schedule a respawn, and a pending respawn waits while something else is held.
  for (const [sessionId, p] of state.players) {
    if (!(p.connected || p.isBot) || room.respawnAt.has(sessionId) || holding(room, sessionId)) continue;
    room.respawnAt.set(sessionId, now + BOMB_RESPAWN_MS);
  }
  for (const [sessionId, t] of room.respawnAt) {
    if (now < t) continue;
    const p = state.players.get(sessionId);
    if (!p) { room.respawnAt.delete(sessionId); continue; }
    if (holding(room, sessionId)) continue; // hands full (e.g. grabbed an enemy bomb): keep waiting
    room.respawnAt.delete(sessionId);
    if (p.connected || p.isBot) giveBomb(room, sessionId);
  }
}

function explode(room, id, bomb, now) {
  const { state } = room;
  const rec = room.bombRecords.get(id);
  const pos = { x: bomb.x, y: bomb.y, z: bomb.z };
  const wasHeld = bomb.status === BombStatus.HELD;
  const holder = bomb.holder;
  const thrower = rec?.thrower;
  const type = BOMB_TYPES[bomb.type] ?? BOMB_TYPES[BombType.STANDARD];
  const radius = type.radius;
  const owner = bomb.owner;
  if (state.bombs.get(id) !== bomb) return; // already gone (e.g. impact + fuse in the same tick)
  removeBomb(room, id);

  const hitIslands = [];
  const coinsBy = {};
  const half = ISLAND_SIZE / 2 + radius;
  const inPlay = new Set(activeIslands(state.islandCount));
  for (const island of room.islands) {
    if (!inPlay.has(island.index)) continue;
    const c = islandCenter(island.index);
    if (Math.abs(pos.x - c.x) > half || Math.abs(pos.z - c.z) > half) continue;
    const o = islandOrigin(island.index);
    const { removed } = resolveBlast(island.grid, pos.x - o.x, pos.y - o.y, pos.z - o.z, radius);
    if (!removed.length) continue;
    hitIslands.push(island.index);
    for (const { index } of removed) state.terrainDiffs.push(encodeDiff(island.index, index));
    // pieces with no cells left are gone
    for (const [pieceId, cells] of island.pieces) {
      if (cells.every(([x, y, z]) => !island.grid.isSolid(x, y, z))) {
        island.pieces.delete(pieceId);
        island.pieceCount--;
        state.pieces.delete(pieceId);
      }
    }
    room.physics.rebuildIsland(island.index);

    // attacker earns coins for damage to enemy islands (never their own or a teammate's)
    const attacker = thrower && state.players.get(thrower);
    if (attacker && !sameTeam(attacker.islandIndex, island.index, state.mode)) {
      const coins = coinsForRemoved(removed);
      attacker.coins += coins;
      coinsBy[thrower] = (coinsBy[thrower] ?? 0) + coins;
    }
  }

  if (wasHeld && holder) {
    const p = state.players.get(holder);
    if (p) { p.coins += selfDestructPenalty(); coinsBy[holder] = (coinsBy[holder] ?? 0) + selfDestructPenalty(); }
  } else if (thrower) {
    // defender threw an enemy bomb away and it didn't blow up their own team's islands: bonus
    const t = state.players.get(thrower);
    if (t && !sameTeam(bomb.owner, t.islandIndex, state.mode) && !hitIslands.some((i) => sameTeam(i, t.islandIndex, state.mode))) {
      t.coins += bombReturnedBonus();
      coinsBy[thrower] = (coinsBy[thrower] ?? 0) + bombReturnedBonus();
    }
  }

  room.physics.applyBlastImpulse(pos, radius, 40);
  knockHeroes(room, pos, radius, now);
  room.broadcast(Message.BOMB_EXPLODED, { ...pos, radius, type: bomb.type, islands: hitIslands, coinsBy });

  // cluster bombs split into bomblets that pop a moment later
  if (type.cluster > 0) {
    for (let i = 0; i < type.cluster; i++) {
      const a = (i / type.cluster) * Math.PI * 2 + Math.random() * 0.6;
      const cid = `b${room.nextBombId++}`;
      const start = { x: pos.x + Math.cos(a) * 0.6, y: pos.y + 0.8, z: pos.z + Math.sin(a) * 0.6 };
      state.bombs.set(cid, new BombState({ type: BombType.CLUSTERLET, owner, x: start.x, y: start.y, z: start.z, status: BombStatus.FLYING, armedAt: now - (BOMB_FUSE_MS - CLUSTERLET_FUSE_MS) }));
      room.bombRecords.set(cid, { thrower, restSince: 0, thrownAt: now });
      room.physics.spawnBomb(cid, start, { vx: Math.cos(a) * CLUSTERLET_SPEED, vy: 6 + Math.random() * 3, vz: Math.sin(a) * CLUSTERLET_SPEED });
    }
  }
}

/**
 * Heroes near the blast are thrown. Humans animate their own flight client-side (they own their MOVE
 * stream) and report a fall with HERO_RESPAWN; here we record the knock so big MOVE steps are accepted,
 * and move bots (and disconnected players) straight to where they would land, or back to their spawn
 * if that is in the water.
 */
function knockHeroes(room, pos, radius, now) {
  for (const [key, p] of room.state.players) {
    const v = blastKnockback(p, pos, radius);
    if (!v) continue;
    room.knockedAt.set(key, now);
    if (p.isBot || !p.connected) {
      const land = knockbackLanding(p, v, GRAVITY);
      const y = groundAt(room, p.islandIndex, land.x, land.z);
      if (y === null) {
        room.broadcast(Message.HERO_FELL, { by: key, x: land.x, z: land.z });
        placeAtSpawn(room, p);
      } else { p.x = land.x; p.z = land.z; p.y = y; }
    }
  }
}
