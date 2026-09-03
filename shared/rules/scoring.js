import { isPiece } from "../voxel/VoxelGrid.js";
import {
  COINS_BOMB_RETURNED,
  COINS_PER_PIECE_DESTROYED,
  COINS_PER_TERRAIN_BLOCK,
  COINS_SELF_DESTRUCT_PENALTY,
} from "../constants.js";

/** Coins earned by the attacker for a list of removed blocks. */
export function coinsForRemoved(removed) {
  let coins = 0;
  for (const { block } of removed) coins += isPiece(block) ? COINS_PER_PIECE_DESTROYED : COINS_PER_TERRAIN_BLOCK;
  return coins;
}

export const bombReturnedBonus = () => COINS_BOMB_RETURNED;
export const selfDestructPenalty = () => COINS_SELF_DESTRUCT_PENALTY;

/**
 * Ranks players by coins (desc). Ties share a rank.
 * @param {Array<{ coins:number }>} players
 * @returns {Array<{ rank:number } & typeof players[0]>}
 */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.coins - a.coins);
  let rank = 0, prev = null;
  return sorted.map((p, i) => {
    if (prev === null || p.coins < prev) rank = i + 1;
    prev = p.coins;
    return { ...p, rank };
  });
}
