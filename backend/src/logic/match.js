import { MIN_PLAYERS_TO_START, MatchPhase, Message, advancePhase, matchOver, startMatch } from "@kaboom-bay/shared";
import { fillBots, stepBots } from "./bots.js";
import { clearBombs, giveBomb, stepBombs } from "./bombs.js";
import { SERVER_TICK_MS } from "@kaboom-bay/shared";

const humans = (room) => [...room.state.players.values()].filter((p) => !p.isBot && p.connected);

/** Runs one server tick: lobby countdown, phase timers, bots. Bomb physics arrives in Phase 5. */
export function stepMatch(room) {
  const now = Date.now();
  const { state } = room;

  if (state.phase === MatchPhase.LOBBY) {
    const present = humans(room);
    if (present.length >= room.minPlayers) {
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
    if (next === MatchPhase.RESULTS) clearBombs(room);
  }
  if (matchOver(state, now)) {
    room.disconnect();
    return;
  }
  if (state.phase === MatchPhase.COMBAT) stepBombs(room, now, SERVER_TICK_MS / 1000);
  stepBots(room, now);
}

function beginMatch(room, now) {
  fillBots(room);
  room.lock();
  startMatch(room.state, now, room.durations);
  room.broadcast(Message.PHASE_CHANGED, { phase: room.state.phase, endsAt: room.state.phaseEndsAt, now });
}
