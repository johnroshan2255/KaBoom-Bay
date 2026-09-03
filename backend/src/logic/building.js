import { applyPlacement, canPlace, clearCells, canBuild } from "@kaboom-bay/shared";
import { PieceState } from "../schema/BayState.js";

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * Validates and applies a PLACE_PIECE intent for `player`.
 * @returns {string|null} new piece id, or null if rejected.
 */
export function placePiece(room, player, msg) {
  if (!canBuild(room.state.phase) || !player || !msg) return null;
  const { type, x, y, z, rot = 0 } = msg;
  if (![type, x, y, z, rot].every((v) => isInt(v, 0, 255))) return null;

  const island = room.islands[player.islandIndex];
  const res = canPlace(island.grid, type, x, y, z, rot, { pieceCount: island.pieceCount });
  if (!res.ok) return null;

  applyPlacement(island.grid, type, res.cells);
  const id = `${player.islandIndex}-${room.nextPieceId++}`;
  room.state.pieces.set(id, new PieceState({ owner: player.islandIndex, type, x, y, z, rot }));
  island.pieces.set(id, res.cells);
  island.pieceCount++;
  return id;
}

/** Validates and applies a REMOVE_PIECE intent. Only the owner, only during BUILD. */
export function removePiece(room, player, id) {
  if (!canBuild(room.state.phase) || !player || typeof id !== "string") return false;
  const piece = room.state.pieces.get(id);
  if (!piece || piece.owner !== player.islandIndex) return false;
  const island = room.islands[player.islandIndex];
  clearCells(island.grid, island.pieces.get(id));
  island.pieces.delete(id);
  island.pieceCount--;
  room.state.pieces.delete(id);
  return true;
}
