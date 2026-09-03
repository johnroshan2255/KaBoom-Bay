import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Block, VoxelGrid, generateIsland, MatchPhase,
  PIECES, PIECE_TYPES, pieceCells, rotateOffset,
  canPlace, applyPlacement, clearCells, groundLevel, PlaceError,
  coinsForRemoved, rankPlayers, COINS_PER_PIECE_DESTROYED,
  startMatch, advancePhase, matchOver, scaledDurations, DEFAULT_DURATIONS, nextPhase,
  pullToVelocity, BOMB_MAX_THROW_POWER,
} from "../index.js";

test("piece catalog and rotation", () => {
  assert.ok(PIECE_TYPES.length >= 7);
  assert.equal(PIECES[Block.WALL].cells.length, 9);
  assert.equal(pieceCells(999, 0, 0, 0), null);
  // four quarter turns return to the start
  const c = [2, 1, 1];
  let r = c;
  for (let i = 0; i < 4; i++) r = rotateOffset(r, 1);
  assert.deepEqual(r, c);
  assert.deepEqual(rotateOffset(c, 2), [-2, 1, -1]);
  assert.equal(pieceCells(Block.PLANK, 5, 5, 5, 1).length, 3);
});

test("placement: on ground ok, floating/occupied/out of bounds rejected, budget", () => {
  const { grid } = generateIsland({ seed: 3 });
  const x = 12, z = 12, y = groundLevel(grid, x, z);
  const ok = canPlace(grid, Block.WALL, x, y, z, 0);
  assert.equal(ok.ok, true);
  assert.equal(ok.cells.length, 9);

  assert.equal(canPlace(grid, Block.WINDOW, x, y + 4, z).reason, PlaceError.UNSUPPORTED);
  assert.equal(canPlace(grid, Block.WINDOW, x, y - 1, z).reason, PlaceError.OCCUPIED);
  assert.equal(canPlace(grid, Block.BEAM, x, grid.sizeY - 1, z).reason, PlaceError.OUT_OF_BOUNDS);
  assert.equal(canPlace(grid, 123, x, y, z).reason, PlaceError.UNKNOWN_PIECE);
  assert.equal(canPlace(grid, Block.WINDOW, x, y, z, 0, { pieceCount: 5, maxPieces: 5 }).reason, PlaceError.BUDGET);

  applyPlacement(grid, Block.WALL, ok.cells);
  assert.equal(grid.get(x, y, z), Block.WALL);
  // stacking on the wall is supported, overlapping it is not
  assert.equal(canPlace(grid, Block.FLOOR, x, y + 3, z).ok, true);
  assert.equal(canPlace(grid, Block.WINDOW, x + 1, y + 1, z).reason, PlaceError.OCCUPIED);
  // attaching to the side of a piece (cantilever) is allowed
  assert.equal(canPlace(grid, Block.WINDOW, x, y + 2, z + 1).ok, true);
  clearCells(grid, ok.cells);
  assert.equal(grid.get(x, y, z), Block.AIR);
});

test("placement over open water is rejected", () => {
  const g = new VoxelGrid(8, 8, 8); // empty grid = all water
  assert.equal(canPlace(g, Block.FLOOR, 2, 1, 2).reason, PlaceError.UNSUPPORTED);
});

test("scoring", () => {
  assert.equal(coinsForRemoved([{ block: Block.SAND }, { block: Block.WALL }]), 1 + COINS_PER_PIECE_DESTROYED);
  const ranked = rankPlayers([{ name: "a", coins: 5 }, { name: "b", coins: 9 }, { name: "c", coins: 5 }]);
  assert.deepEqual(ranked.map((p) => [p.name, p.rank]), [["b", 1], ["a", 2], ["c", 2]]);
});

test("phase machine", () => {
  const d = scaledDurations(0.1);
  assert.ok(d[MatchPhase.BUILD] < DEFAULT_DURATIONS[MatchPhase.BUILD]);
  assert.equal(scaledDurations(1), DEFAULT_DURATIONS);
  const s = { phase: MatchPhase.LOBBY, phaseEndsAt: 0 };
  assert.equal(advancePhase(s, 10_000, d), null, "lobby never auto-advances");
  startMatch(s, 1000, d);
  assert.equal(s.phase, MatchPhase.BUILD);
  assert.equal(advancePhase(s, 1000 + d.build - 1, d), null);
  assert.equal(advancePhase(s, 1000 + d.build, d), MatchPhase.COMBAT);
  assert.equal(advancePhase(s, s.phaseEndsAt, d), MatchPhase.RESULTS);
  assert.equal(advancePhase(s, s.phaseEndsAt + 1, d), null);
  assert.equal(matchOver(s, s.phaseEndsAt - 1), false);
  assert.equal(matchOver(s, s.phaseEndsAt), true);
  assert.equal(nextPhase(MatchPhase.RESULTS), null);
});

test("ballistics clamps power", () => {
  const v = pullToVelocity(100, 0);
  assert.equal(v.power, 1);
  assert.ok(Math.abs(Math.hypot(v.vx, v.vy, v.vz) - BOMB_MAX_THROW_POWER) < 1e-9);
  assert.equal(pullToVelocity(0, 0).power, 0);
  assert.ok(pullToVelocity(-3, 0).vx < 0, "launches opposite to the pull");
});
