import { BombType, GameMode, MAX_PLAYERS, MatchPhase, Message, activeIslands, advancePhase, matchOver, pickIsland, startMatch, teamOf } from "@kaboom-bay/shared";
import { placeAtSpawn } from "./players.js";
import { createIslands } from "./islands.js";
import { MatchPhysics } from "./physics.js";
import { fillBots, stepBots } from "./bots.js";
import { clearBombs, giveBomb, stepBombs } from "./bombs.js";
import { clearCrates, stepSupply } from "./supply.js";
import { SERVER_TICK_MS } from "@kaboom-bay/shared";

const humans = (room) => [...room.state.players.values()].filter((p) => !p.isBot && p.connected);

/** Runs one server tick: lobby countdown, phase timers, bots. Bomb physics arrives in Phase 5. */
export function stepMatch(room) {
  const now = Date.now();
  const { state } = room;

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
  if (state.phase === MatchPhase.COMBAT) { stepBombs(room, now, SERVER_TICK_MS / 1000); stepSupply(room, now); }
  stepBots(room, now);
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
  room.lock();
  startMatch(room.state, now, room.durations);
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
  for (const island of room.islands) { island.pieces.clear(); island.pieceCount = 0; }
  state.seed = (Math.random() * 0xffffffff) >>> 0;
  room.islands = createIslands(state.seed);
  room.physics.free();
  room.physics = new MatchPhysics(room.islands);
  room.bombRecords.clear(); room.respawnAt.clear(); room.knockedAt.clear(); room.respawnedAt.clear();
  room.nextDropAt = 0; room.dropTurn = undefined;
  const taken = [];
  for (const p of [...state.players.values()].sort((a, b) => a.islandIndex - b.islandIndex)) {
    const i = pickIsland(taken, state.mode);
    taken.push(i);
    p.islandIndex = i; p.team = teamOf(i, state.mode);
    p.coins = 0; p.ready = false; p.selected = BombType.STANDARD; p.bombs.clear();
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
