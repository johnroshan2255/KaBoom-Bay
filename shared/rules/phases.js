import {
  BUILD_PHASE_DURATION,
  COMBAT_PHASE_DURATION,
  DEFAULT_MATCH_MINUTES,
  LOBBY_COUNTDOWN,
  LOBBY_SOLO_WAIT,
  MatchPhase,
  RESULTS_DURATION,
  matchDurations,
} from "../constants.js";

export const PHASE_ORDER = Object.freeze([MatchPhase.LOBBY, MatchPhase.BUILD, MatchPhase.COMBAT, MatchPhase.RESULTS]);

export const DEFAULT_DURATIONS = Object.freeze({
  lobby: LOBBY_COUNTDOWN,
  soloWait: LOBBY_SOLO_WAIT,
  [MatchPhase.BUILD]: BUILD_PHASE_DURATION,
  [MatchPhase.COMBAT]: COMBAT_PHASE_DURATION,
  [MatchPhase.RESULTS]: RESULTS_DURATION,
});

/**
 * Phase durations for a match of `minutes`, optionally scaled for local testing
 * (KABOOM_PHASE_SCALE env on the server). Results stays readable.
 */
export function scaledDurations(scale = 1, minutes = DEFAULT_MATCH_MINUTES) {
  const k = scale > 0 ? scale : 1;
  const { buildMs, combatMs } = matchDurations(minutes);
  return {
    lobby: Math.round(LOBBY_COUNTDOWN * k),
    soloWait: Math.round(LOBBY_SOLO_WAIT * k),
    [MatchPhase.BUILD]: Math.round(buildMs * k),
    [MatchPhase.COMBAT]: Math.round(combatMs * k),
    [MatchPhase.RESULTS]: Math.max(3000, Math.round(RESULTS_DURATION * k)),
  };
}

export function nextPhase(phase) {
  const i = PHASE_ORDER.indexOf(phase);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
}

/** LOBBY -> BUILD. `state` is any object with `phase` and `phaseEndsAt` (e.g. the Colyseus schema). */
export function startMatch(state, now, durations = DEFAULT_DURATIONS) {
  state.phase = MatchPhase.BUILD;
  state.phaseEndsAt = now + durations[MatchPhase.BUILD];
  return state.phase;
}

/**
 * Advances BUILD -> COMBAT -> RESULTS when the timer runs out.
 * @returns the new phase, or null if nothing changed.
 */
export function advancePhase(state, now, durations = DEFAULT_DURATIONS) {
  if (state.phase === MatchPhase.LOBBY || state.phase === MatchPhase.RESULTS) return null;
  if (now < state.phaseEndsAt) return null;
  const next = nextPhase(state.phase);
  if (!next) return null;
  state.phase = next;
  state.phaseEndsAt = now + durations[next];
  return next;
}

/** True once the results timer has elapsed and the room can be disposed. */
export function matchOver(state, now) {
  return state.phase === MatchPhase.RESULTS && now >= state.phaseEndsAt;
}

export const canBuild = (phase) => phase === MatchPhase.BUILD;
export const canFight = (phase) => phase === MatchPhase.COMBAT;
