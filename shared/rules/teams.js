import { GameMode, MAX_PLAYERS, TEAM_COUNT, TEAM_SIZE } from "../constants.js";

/** Normalises a client-supplied mode to a known GameMode. */
export const normalizeMode = (mode) => (Object.values(GameMode).includes(mode) ? mode : GameMode.FFA);

/**
 * Team of an island. Free-for-all: every island is its own team (team id = island index).
 * Teams: islands 0 and 1 share the north row (team 0), islands 2 and 3 the south row (team 1).
 */
export function teamOf(islandIndex, mode) {
  return mode === GameMode.TEAMS ? Math.floor(islandIndex / TEAM_SIZE) : islandIndex;
}

export const sameTeam = (islandA, islandB, mode) => teamOf(islandA, mode) === teamOf(islandB, mode);

/** Islands belonging to `team` in teams mode. */
export function teamIslands(team) {
  return Array.from({ length: TEAM_SIZE }, (_, i) => team * TEAM_SIZE + i).filter((i) => i < MAX_PLAYERS);
}

/**
 * Where a newly joined player sits. Free-for-all: the lowest free island. Teams: the lowest free island on
 * the fullest team that still has room, so people who arrive together become teammates first and later
 * arrivals fill the other side.
 */
export function pickIsland(takenIslands, mode) {
  const taken = new Set(takenIslands);
  if (mode !== GameMode.TEAMS) {
    for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
    return -1;
  }
  let best = -1, bestCount = -1;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const islands = teamIslands(team);
    const free = islands.filter((i) => !taken.has(i));
    const count = islands.length - free.length;
    if (free.length && count > bestCount) { best = free[0]; bestCount = count; }
  }
  return best;
}

/**
 * Team standings: summed coins per team, ranked like rankPlayers (ties share a rank).
 * @param {Array<{ islandIndex:number, coins:number }>} players
 * @returns {Array<{ team:number, coins:number, members:Array, rank:number }>}
 */
export function rankTeams(players, mode) {
  const byTeam = new Map();
  for (const p of players) {
    const team = teamOf(p.islandIndex, mode);
    const t = byTeam.get(team) ?? { team, coins: 0, members: [] };
    t.coins += p.coins;
    t.members.push(p);
    byTeam.set(team, t);
  }
  const sorted = [...byTeam.values()].sort((a, b) => b.coins - a.coins || a.team - b.team);
  let rank = 0, prev = null;
  return sorted.map((t, i) => {
    if (prev === null || t.coins < prev) rank = i + 1;
    prev = t.coins;
    t.members.sort((a, b) => b.coins - a.coins || a.islandIndex - b.islandIndex);
    return { ...t, rank };
  });
}
