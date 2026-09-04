import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Block, VoxelGrid, generateIsland, MatchPhase,
  PIECES, PIECE_TYPES, pieceCells, rotateOffset,
  canPlace, applyPlacement, clearCells, groundLevel, PlaceError,
  coinsForRemoved, rankPlayers, COINS_PER_PIECE_DESTROYED,
  startMatch, advancePhase, matchOver, scaledDurations, DEFAULT_DURATIONS, nextPhase,
  pullToVelocity, BOMB_MAX_THROW_POWER,
  GameMode, normalizeMode, teamOf, sameTeam, pickIsland, rankTeams,
  BombType, BOMB_TYPES, DROP_TYPES, blastKnockback, knockbackLanding, GRAVITY, KNOCKBACK_RADIUS_SCALE,
  matchDurations, activeIslands, MIN_MATCH_MINUTES, MAX_MATCH_MINUTES,
  sanitizeChat, filterProfanity, CHAT_MAX_LEN,
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
  // a flat 3x3 patch of open grass (the island now has tiers, props and a ruin)
  let x = 12, z = 12;
  outer: for (let cz = 4; cz < 20; cz++) for (let cx = 4; cx < 20; cx++) {
    const t = grid.columnTop(cx, cz);
    if (grid.get(cx, t, cz) !== Block.GRASS) continue;
    let flat = true;
    for (let ox = -1; ox <= 1 && flat; ox++) for (let oz = -1; oz <= 1 && flat; oz++) flat = grid.columnTop(cx + ox, cz + oz) === t && grid.get(cx + ox, t, cz + oz) === Block.GRASS && grid.get(cx + ox, t + 1, cz + oz) === Block.AIR && grid.get(cx + ox, t + 4, cz + oz) === Block.AIR;
    if (flat) { x = cx; z = cz; break outer; }
  }
  const y = groundLevel(grid, x, z);
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
  assert.deepEqual(scaledDurations(1), DEFAULT_DURATIONS);
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

test("teams: island -> team mapping and seat picking", () => {
  assert.equal(normalizeMode("teams"), GameMode.TEAMS);
  assert.equal(normalizeMode("bogus"), GameMode.FFA);
  // free-for-all: everyone is their own team
  for (let i = 0; i < 4; i++) assert.equal(teamOf(i, GameMode.FFA), i);
  assert.equal(sameTeam(0, 1, GameMode.FFA), false);
  // teams: north row vs south row
  assert.deepEqual([0, 1, 2, 3].map((i) => teamOf(i, GameMode.TEAMS)), [0, 0, 1, 1]);
  assert.equal(sameTeam(0, 1, GameMode.TEAMS), true);
  assert.equal(sameTeam(1, 2, GameMode.TEAMS), false);
  // seats fill in order for FFA, and fill one team first in teams mode so friends pair up
  assert.equal(pickIsland([], GameMode.FFA), 0);
  assert.equal(pickIsland([0, 2], GameMode.FFA), 1);
  assert.equal(pickIsland([0, 1, 2, 3], GameMode.FFA), -1);
  assert.equal(pickIsland([], GameMode.TEAMS), 0);
  assert.equal(pickIsland([0], GameMode.TEAMS), 1);
  assert.equal(pickIsland([0, 1], GameMode.TEAMS), 2);
  assert.equal(pickIsland([0, 2], GameMode.TEAMS), 1);
  assert.equal(pickIsland([0, 1, 2, 3], GameMode.TEAMS), -1);
});

test("teams: standings sum coins per team and share tied ranks", () => {
  const players = [
    { islandIndex: 0, coins: 10 }, { islandIndex: 1, coins: 5 },
    { islandIndex: 2, coins: 20 }, { islandIndex: 3, coins: -5 },
  ];
  const t = rankTeams(players, GameMode.TEAMS);
  assert.deepEqual(t.map((x) => [x.team, x.coins, x.rank]), [[0, 15, 1], [1, 15, 1]]);
  assert.equal(t[0].members.length, 2);
  const ffa = rankTeams(players, GameMode.FFA);
  assert.deepEqual(ffa.map((x) => [x.team, x.rank]), [[2, 1], [0, 2], [1, 3], [3, 4]]);
});

test("bomb types: every type is tuned, drops are special only", () => {
  for (const t of Object.values(BombType)) { assert.ok(BOMB_TYPES[t], t); assert.ok(BOMB_TYPES[t].radius > 0); }
  assert.ok(BOMB_TYPES[BombType.MEGA].radius > BOMB_TYPES[BombType.STANDARD].radius);
  assert.equal(BOMB_TYPES[BombType.IMPACT].impact, true);
  assert.ok(BOMB_TYPES[BombType.CLUSTER].cluster >= 2);
  assert.ok(!DROP_TYPES.includes(BombType.STANDARD) && DROP_TYPES.every((t) => BOMB_TYPES[t].drop));
});

test("knockback: fades with distance, out of range is null, landing is downrange", () => {
  const blast = { x: 0, z: 0 };
  const near = blastKnockback({ x: 1, z: 0 }, blast, 3);
  const far = blastKnockback({ x: 4.5, z: 0 }, blast, 3);
  assert.ok(near.vx > far.vx && far.vx > 0, `${near.vx} > ${far.vx}`);
  assert.equal(blastKnockback({ x: 3 * KNOCKBACK_RADIUS_SCALE + 0.1, z: 0 }, blast, 3), null);
  const centre = blastKnockback({ x: 0, z: 0 }, blast, 3, () => 0); // deterministic direction
  assert.ok(Math.hypot(centre.vx, centre.vz) > 0 && centre.vy > 0);
  const land = knockbackLanding({ x: 1, z: 0 }, near, GRAVITY);
  assert.ok(land.x > 1 && land.t > 0);
});

test("island: every seed keeps the beach, tiers, props and a walkable surface", () => {
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const { grid, palms, waterfall } = generateIsland({ seed });
    const tops = new Map();
    let sand = 0, grass6 = 0, carved = 0, trees = 0;
    for (let z = 0; z < grid.sizeZ; z++) for (let x = 0; x < grid.sizeX; x++) {
      const t = grid.columnTop(x, z);
      if (t < 0) continue;
      const b = grid.get(x, t, z);
      if (b === Block.SAND) sand++;
      if (b === Block.GRASS && t === 6) grass6++;
      if (b === Block.CARVED) carved++;
      if (b === Block.GRASS || b === Block.SAND || b === Block.DIRT || b === Block.CARVED) tops.set(z * grid.sizeX + x, t);
    }
    trees = palms.filter((p) => p.kind === "oak" || p.kind === "palm").length;
    assert.ok(sand > 40 && grass6 > 15 && carved > 10 && trees >= 3, `seed ${seed}: sand ${sand} tier2 ${grass6} carved ${carved} trees ${trees}`);
    assert.ok(waterfall, `seed ${seed}: waterfall spot`);
    // flood fill with the hero's ground rule (one block up, walk under overhangs) from a beach cell must reach most of the surface
    const start = [...tops.keys()].find((k) => grid.get(k % grid.sizeX, tops.get(k), Math.floor(k / grid.sizeX)) === Block.SAND);
    const feet = new Map([[start, tops.get(start) + 1]]); const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i], x = k % grid.sizeX, z = Math.floor(k / grid.sizeX), h = feet.get(k);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, nk = nz * grid.sizeX + nx;
        if (feet.has(nk)) continue;
        const nf = grid.surfaceAt(nx, nz, h);
        if (nf < 0) continue;
        feet.set(nk, nf); queue.push(nk);
      }
    }
    const walkable = [...tops.keys()].filter((k) => grid.surfaceAt(k % grid.sizeX, Math.floor(k / grid.sizeX), grid.sizeY - 1) >= 0).length;
    assert.ok(feet.size / walkable > 0.9, `seed ${seed}: only ${feet.size}/${walkable} standable cells reachable`);
  }
});

test("room size: match length is clamped and split, island sets stay balanced", () => {
  assert.deepEqual(matchDurations(3), { minutes: 3, buildMs: 45_000, combatMs: 135_000 });
  assert.equal(matchDurations(16).combatMs + matchDurations(16).buildMs, 16 * 60_000);
  assert.equal(matchDurations(1).minutes, MIN_MATCH_MINUTES);
  assert.equal(matchDurations(99).minutes, MAX_MATCH_MINUTES);
  assert.equal(matchDurations("abc").minutes, 3);
  assert.deepEqual(activeIslands(1), [0]);
  assert.deepEqual(activeIslands(2), [0, 3]); // diagonal: the bay stays centred
  assert.deepEqual(activeIslands(4), [0, 1, 2, 3]);
  assert.deepEqual(activeIslands(9), [0, 1, 2, 3]);
  assert.deepEqual(activeIslands(0), [0]);
  const d = scaledDurations(0.5, 4);
  assert.equal(d[MatchPhase.BUILD] + d[MatchPhase.COMBAT], 2 * 60_000);
});

test("chat: trimmed, capped, control characters stripped, profanity masked (with leet-speak)", () => {
  assert.equal(sanitizeChat("  hello   there \u0000 "), "hello there");
  assert.equal(sanitizeChat("x".repeat(500)).length, CHAT_MAX_LEN);
  assert.equal(sanitizeChat(42), "");
  assert.equal(filterProfanity("what the fuck"), "what the ****");
  assert.equal(filterProfanity("sh1t happens"), "**** happens");
  assert.equal(filterProfanity("nice shot, GG!"), "nice shot, GG!");
  assert.equal(filterProfanity("shiiiit!"), "********");
  assert.equal(filterProfanity("class assignment"), "class assignment"); // no false positive on 'ass' inside words
});
