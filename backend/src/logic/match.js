import { ARENA_INDEX, BOMB_PICKUP_RADIUS, BRIDGE_REBUILD_MS, COINS_PER_KILL, CTF_HOLD_TO_WIN_MS, HERO_RESPAWN_MS, RESULTS_DURATION, BRIDGE_REBUILD_STEP_MS, BombStatus, BombType, COINS_PER_CAPTURE, FLAG_PICKUP_RADIUS, FLAG_RETURN_MS, GameMode, GameType, HERO_MAX_HP, MAX_PLAYERS, MatchPhase, Message, activeIslands, advancePhase, flagHome, generateArena, islandIndexAt, matchOver, pickIsland, sameTeam, startMatch, teamOf } from "@kaboom-bay/shared";
import { encodeDiff } from "./islands.js";
import { groundAt, placeAtSpawn } from "./players.js";
import { createIslands } from "./islands.js";
import { MatchPhysics } from "./physics.js";
import { fillBots, stepBots } from "./bots.js";
import { clearBombs, giveBomb, grabBomb, removeBomb, stepBombs } from "./bombs.js";
import { clearCrates, stepSupply } from "./supply.js";
import { SERVER_TICK_MS } from "@kaboom-bay/shared";

const humans = (room) => [...room.state.players.values()].filter((p) => !p.isBot && p.connected);

/**
 * A human quit during BUILD / COMBAT: their island leaves with them. The seat is deleted (no bot takes it),
 * their buildings, resting bombs and crates go, the terrain colliders are dropped and the island is listed
 * in state.leftIslands so every client removes it from the bay.
 */
export function removeIsland(room, key, player) {
  const { state } = room;
  const i = player.islandIndex;
  state.players.delete(key);
  for (const [id, piece] of [...state.pieces.entries()]) if (piece.owner === i) state.pieces.delete(id);
  if (room.islands[i]) { room.islands[i].pieces.clear(); room.islands[i].pieceCount = 0; }
  for (const [id, bomb] of [...state.bombs.entries()]) if (bomb.holder === key || (bomb.status !== BombStatus.FLYING && bomb.islandIndex === i)) removeBomb(room, id);
  for (const [id, crate] of [...state.crates.entries()]) if (crate.islandIndex === i) state.crates.delete(id);
  room.respawnAt.delete(key); room.knockedAt.delete(key); room.respawnedAt.delete(key); room.deadUntil.delete(key);
  if (holdsFlag(room, key)) dropFlag(room, player, Date.now());
  room.physics.disableIsland(i);
  if (!state.leftIslands.includes(i)) state.leftIslands.push(i);
}

/** Runs one server tick: lobby countdown, phase timers, bots. Bomb physics arrives in Phase 5. */
export function stepMatch(room) {
  const now = Date.now();
  const { state } = room;
  room.tickDt = room.lastTick ? Math.min(250, now - room.lastTick) : SERVER_TICK_MS;
  room.lastTick = now;

  if (state.phase === MatchPhase.LOBBY) {
    const present = humans(room);
    // public lobbies count down once enough humans are in, or after a short solo wait (bots fill the rest)
    const soloReady = present.length >= 1 && now - (room.lobbyOpenedAt ?? now) >= room.durations.soloWait;
    if (!state.isPrivate && (present.length >= room.minPlayers || soloReady)) {
      if (!room.countdownEndsAt) {
        room.countdownEndsAt = now + room.durations.lobby;
        state.phaseEndsAt = room.countdownEndsAt;
      }
      const allReady = present.every((p) => p.ready);
      if (now >= room.countdownEndsAt || allReady) beginMatch(room, now);
    } else if (room.countdownEndsAt) {
      room.countdownEndsAt = 0;
      state.phaseEndsAt = 0;
    }
    return;
  }

  const next = advancePhase(state, now, room.durations);
  if (next) {
    room.broadcast(Message.PHASE_CHANGED, { phase: next, endsAt: state.phaseEndsAt, now });
    if (next === MatchPhase.COMBAT) for (const key of state.players.keys()) giveBomb(room, key);
    if (next === MatchPhase.RESULTS) { clearBombs(room); clearCrates(room); }
  }
  if (matchOver(state, now)) {
    // round continuity: the same people carry on in the same room with a fresh bay
    if (humans(room).length) resetRound(room, now); else room.disconnect();
    return;
  }
  room.physics.syncHeroes(state.players);
  stepRespawns(room, now);
  if (state.phase === MatchPhase.COMBAT) { stepBombs(room, now, SERVER_TICK_MS / 1000); stepSupply(room, now); autoPickup(room); }
  if (state.game === GameType.CTF) { stepBridges(room, now); if (state.phase === MatchPhase.COMBAT) stepFlag(room, now); }
  stepBots(room, now);
}

/** Bombed heroes come back on their own beach with full health once HERO_RESPAWN_MS has passed. */
function stepRespawns(room, now) {
  for (const [key, at] of room.deadUntil) {
    if (now < at) continue;
    room.deadUntil.delete(key);
    const p = room.state.players.get(key);
    if (!p) continue;
    p.dead = false;
    p.hp = HERO_MAX_HP;
    placeAtSpawn(room, p);
    room.clients.find((c) => c.sessionId === key)?.send(Message.HERO_RESPAWN, { x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    if (room.state.phase === MatchPhase.COMBAT && !holdsFlag(room, key)) giveBomb(room, key);
  }
}

/**
 * Capture the flag: the arena (hub + bridges) is a fifth grid built from the islands in play. Created at match
 * start on the server and, identically, on every client.
 */
function createArena(room, set) {
  const arena = generateArena({ islands: room.islands, active: set });
  room.islands[ARENA_INDEX] = { index: ARENA_INDEX, grid: arena.grid, owner: arena.owner, original: arena.grid.data.slice(), bridges: arena.bridges, pieces: new Map(), pieceCount: 0 };
  room.physics.addIsland(ARENA_INDEX);
  room.rebuild = [];
  returnFlag(room);
}

export function returnFlag(room) {
  const f = room.state.flag, h = flagHome();
  f.x = h.x; f.y = h.y; f.z = h.z; f.status = "home"; f.holder = ""; f.droppedAt = 0;
  f.holders.clear();
}

export const holdsFlag = (room, key) => room.state.flag.holders.includes(key);

/** Replace the holder list (dead / gone players filtered out). */
function setHolders(room, keys) {
  const f = room.state.flag;
  f.holders.clear();
  for (const k of keys) f.holders.push(k);
  f.holder = keys[0] ?? "";
}

/**
 * GRAB (capture the flag): standing next to the flag takes it, even while others hold it (everyone then tugs, see
 * handleMove); GRAB while holding lets go. A holder can't carry a bomb: the one in hand is dropped.
 */
export function grabFlag(room, key) {
  const { state } = room, f = state.flag;
  if (state.game !== GameType.CTF || state.phase !== MatchPhase.COMBAT) return false;
  const p = state.players.get(key);
  if (!p || p.dead) return false;
  if (f.holders.includes(key)) {
    const rest = [...f.holders].filter((k) => k !== key);
    setHolders(room, rest);
    if (!rest.length) restFlag(room, p);
    room.broadcast(Message.FLAG_EVENT, { type: rest.length ? "release" : "drop", by: key, name: p.name, holders: rest.length });
    giveBomb(room, key); // hands free again
    return true;
  }
  if (Math.hypot(p.x - f.x, p.z - f.z) > FLAG_PICKUP_RADIUS || Math.abs(p.y - f.y) > 2.5) return false;
  for (const [id, b] of [...state.bombs.entries()]) if (b.holder === key) removeBomb(room, id); // one thing in hand
  setHolders(room, [...f.holders, key]);
  f.status = "held"; f.droppedAt = 0;
  room.broadcast(Message.FLAG_EVENT, { type: "pickup", by: key, name: p.name, team: p.team, islandIndex: p.islandIndex, holders: f.holders.length });
  return true;
}

/** Combat: walking up to a landed bomb picks it up (no button). Flag holders and heroes already holding a bomb don't. */
function autoPickup(room) {
  const { state } = room;
  for (const [key, p] of state.players) {
    if (p.dead || !p.connected || holdsFlag(room, key)) continue;
    if ([...state.bombs.values()].some((b) => b.holder === key)) continue;
    let best = null, bestD = BOMB_PICKUP_RADIUS;
    for (const [id, b] of state.bombs) {
      if (b.status !== BombStatus.RESTING) continue;
      if (state.game !== GameType.CTF && b.islandIndex !== p.islandIndex) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bestD && Math.abs(b.y - p.y) < 2) { best = id; bestD = d; }
    }
    if (best) grabBomb(room, key, best, true);
  }
}

/**
 * The flag comes to rest where it is (or where its last holder stood, if that spot is gone): it never goes back to
 * the hub on its own. Whoever reaches it next picks up where the fight left off.
 */
function restFlag(room, holder) {
  const f = room.state.flag;
  const feet = (holder?.y ?? f.y) + 1; // search down from the holder's height: never land the flag on a canopy or roof above them
  let x = f.x, z = f.z, y = groundAt(room, holder?.islandIndex ?? 0, x, z, feet);
  if (y === null && holder) { x = holder.x; z = holder.z; y = groundAt(room, holder.islandIndex, x, z, feet); }
  f.x = x; f.z = z; f.y = y ?? f.y; f.status = "dropped"; f.droppedAt = Date.now();
}

/** A holder died, fell or left: they let go; with nobody left the flag lies where they were. */
export function dropFlag(room, holder, now) {
  const f = room.state.flag;
  const rest = [...f.holders].filter((k) => { const p = room.state.players.get(k); return p && !p.dead && p.connected && (!holder || p !== holder); });
  setHolders(room, rest);
  if (rest.length) return;
  restFlag(room, holder);
  room.broadcast(Message.FLAG_EVENT, { type: "drop", by: "", name: holder?.name ?? "" });
}

/** Someone held the flag long enough: straight to the results. */
function endMatch(room, now, winner) {
  const { state } = room;
  state.phase = MatchPhase.RESULTS;
  state.phaseEndsAt = now + RESULTS_DURATION;
  clearBombs(room); clearCrates(room);
  room.broadcast(Message.FLAG_EVENT, { type: "win", by: winner.key, name: winner.name, team: winner.team });
  room.broadcast(Message.PHASE_CHANGED, { phase: state.phase, endsAt: state.phaseEndsAt, now });
}

/**
 * Hold to win: the flag sits at hand height between its holders; a lone holder banks hold time every tick
 * (a contested flag banks nothing), and the first player - in teams, the first team's combined time - to
 * reach CTF_HOLD_TO_WIN_MS ends the match. Taking the flag is a GRAB (grabFlag), never automatic; a dropped
 * flag stays where it fell.
 */
function stepFlag(room, now) {
  const { state } = room, f = state.flag;
  if (!f.holders.length) return;
  const alive = [...f.holders].filter((k) => { const p = state.players.get(k); return p && !p.dead && p.connected; });
  if (alive.length !== f.holders.length) { dropFlag(room, null, now); if (!f.holders.length) return; }
  let cx = 0, cy = 0, cz = 0;
  for (const k of f.holders) { const p = state.players.get(k); cx += p.x; cy += p.y; cz += p.z; }
  const n = f.holders.length;
  f.x = cx / n; f.y = cy / n + 1.0; f.z = cz / n; f.status = "held";
  if (n !== 1) return; // tug of war: nobody gains
  const key = f.holders[0], h = state.players.get(key);
  h.holdMs = Math.min(0xffffffff, h.holdMs + (room.tickDt ?? SERVER_TICK_MS));
  const total = state.mode === GameMode.TEAMS
    ? [...state.players.values()].filter((p) => sameTeam(p.islandIndex, h.islandIndex, state.mode)).reduce((s, p) => s + p.holdMs, 0)
    : h.holdMs;
  if (total >= CTF_HOLD_TO_WIN_MS) endMatch(room, now, { key, name: h.name, team: h.team });
}

/**
 * Blown bridge / hub cells grow back: explode() queues them with staggered times so a hole closes from the
 * island side towards the hub; here the due cells are put back (the diff is removed, so clients regrow them).
 */
function stepBridges(room, now) {
  if (!room.rebuild.length) return;
  const arena = room.islands[ARENA_INDEX], state = room.state;
  let changed = false;
  for (let i = room.rebuild.length - 1; i >= 0; i--) {
    const r = room.rebuild[i];
    if (now < r.at) continue;
    room.rebuild.splice(i, 1);
    if (arena.grid.data[r.cell] !== 0) continue;
    arena.grid.data[r.cell] = r.block;
    const diff = encodeDiff(ARENA_INDEX, r.cell);
    const idx = state.terrainDiffs.indexOf(diff);
    if (idx >= 0) state.terrainDiffs.splice(idx, 1);
    changed = true;
  }
  if (changed) room.physics.rebuildIsland(ARENA_INDEX);
}

/** Queue removed arena cells for regrowth, ordered from the island end of a bridge towards the hub. */
export function queueBridgeRebuild(room, removed, now) {
  const arena = room.islands[ARENA_INDEX];
  const cells = removed.filter(({ index }) => arena.original[index] !== 0);
  const rank = new Map();
  for (const list of Object.values(arena.bridges)) list.forEach((c, i) => rank.set(c, list.length - i)); // island end first
  cells.sort((a, b) => (rank.get(b.index) ?? 0) - (rank.get(a.index) ?? 0));
  cells.forEach(({ index }, k) => room.rebuild.push({ cell: index, block: arena.original[index], at: now + BRIDGE_REBUILD_MS + k * BRIDGE_REBUILD_STEP_MS }));
}

/** A hero was bombed to death: hide them, drop the flag, credit the killer, schedule the respawn. */
export function killHero(room, key, victim, thrower, now) {
  const { state } = room;
  victim.dead = true;
  victim.hp = 0;
  room.deadUntil.set(key, now + HERO_RESPAWN_MS);
  for (const [id, b] of [...state.bombs.entries()]) if (b.holder === key) removeBomb(room, id);
  if (holdsFlag(room, key)) dropFlag(room, victim, now);
  const killer = thrower && thrower !== key ? state.players.get(thrower) : null;
  let coins = 0;
  if (killer && !sameTeam(killer.islandIndex, victim.islandIndex, state.mode)) { coins = COINS_PER_KILL; killer.coins += coins; }
  room.broadcast(Message.HERO_KILLED, { victim: key, by: killer ? thrower : "", name: victim.name, byName: killer?.name ?? "", x: victim.x, y: victim.y, z: victim.z, coins });
}


/**
 * LOBBY -> BUILD. The room sizes itself: islands in play = humans + requested bots (max 4; teams always 4),
 * humans are re-seated onto that island set, bots take the rest, unused islands lose their colliders,
 * and the room locks. Safe to call once; later calls are ignored.
 */
export function beginMatch(room, now) {
  const { state } = room;
  if (state.phase !== MatchPhase.LOBBY) return;
  const humansIn = [...state.players.values()].filter((p) => !p.isBot);
  const count = state.mode === GameMode.TEAMS ? MAX_PLAYERS : Math.min(MAX_PLAYERS, Math.max(1, humansIn.length + state.botCount));
  const set = activeIslands(count);
  state.islandCount = count;
  if (state.mode !== GameMode.TEAMS) {
    // keep everyone's relative order, but move them onto the active islands
    humansIn.sort((a, b) => a.islandIndex - b.islandIndex).forEach((p, i) => {
      if (p.islandIndex !== set[i]) { p.islandIndex = set[i]; p.team = teamOf(set[i], state.mode); placeAtSpawn(room, p); }
    });
  }
  for (let i = 0; i < MAX_PLAYERS; i++) if (!set.includes(i)) room.physics.disableIsland(i);
  fillBots(room, set);
  for (const p of state.players.values()) { p.hp = HERO_MAX_HP; p.dead = false; p.captures = 0; }
  room.deadUntil.clear();
  if (state.game === GameType.CTF) createArena(room, set);
  room.lock();
  startMatch(room.state, now, room.durations);
  if (state.game === GameType.CTF) {
    // capture the flag: no build phase and no clock; combat runs until someone has held the flag for CTF_HOLD_TO_WIN_MS
    state.phase = MatchPhase.COMBAT;
    state.phaseEndsAt = now + 1e10;
    for (const p of state.players.values()) p.holdMs = 0;
    for (const key of state.players.keys()) giveBomb(room, key);
  }
  room.broadcast(Message.PHASE_CHANGED, { phase: room.state.phase, endsAt: room.state.phaseEndsAt, now });
}

/**
 * RESULTS -> LOBBY in the same room: bots (and players who dropped) leave, the bay is regenerated from a new
 * seed with fresh physics, humans are re-seated with reset coins and inventories, and the room unlocks so
 * friends can join the next round.
 */
export function resetRound(room, now) {
  const { state } = room;
  for (const [key, p] of [...state.players.entries()]) if (p.isBot) { state.players.delete(key); room.bots.delete(key); }
  clearBombs(room);
  clearCrates(room);
  for (const id of [...state.pieces.keys()]) state.pieces.delete(id);
  state.terrainDiffs.clear();
  state.leftIslands.clear();
  room.rebuild = [];
  room.deadUntil.clear();
  returnFlag(room);
  for (const island of room.islands) { island.pieces.clear(); island.pieceCount = 0; }
  state.seed = (Math.random() * 0xffffffff) >>> 0;
  room.islands = createIslands(state.seed, state.map);
  room.physics.free();
  room.physics = new MatchPhysics(room.islands);
  room.bombRecords.clear(); room.respawnAt.clear(); room.knockedAt.clear(); room.respawnedAt.clear();
  room.nextDropAt = 0; room.dropTurn = undefined;
  const taken = [];
  for (const p of [...state.players.values()].sort((a, b) => a.islandIndex - b.islandIndex)) {
    const i = pickIsland(taken, state.mode);
    taken.push(i);
    p.islandIndex = i; p.team = teamOf(i, state.mode);
    p.coins = 0; p.ready = false; p.selected = BombType.STANDARD; p.bombs.clear(); p.hp = HERO_MAX_HP; p.dead = false; p.captures = 0; p.holdMs = 0;
    placeAtSpawn(room, p);
  }
  state.islandCount = MAX_PLAYERS;
  state.phase = MatchPhase.LOBBY;
  state.phaseEndsAt = 0;
  room.countdownEndsAt = 0;
  room.lobbyOpenedAt = now;
  room.unlock();
  room.broadcast(Message.PHASE_CHANGED, { phase: MatchPhase.LOBBY, endsAt: 0, now });
}
