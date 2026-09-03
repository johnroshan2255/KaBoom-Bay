import { test } from "node:test";
import assert from "node:assert/strict";
import { VoxelGrid, Block, generateIsland, resolveBlast, ISLAND_SIZE, BEDROCK_LAYERS } from "../index.js";

test("index/coords round-trip", () => {
  const g = new VoxelGrid(5, 7, 9);
  for (const [x, y, z] of [[0, 0, 0], [4, 6, 8], [2, 3, 5]]) {
    assert.deepEqual(g.coords(g.index(x, y, z)), [x, y, z]);
  }
  assert.equal(g.get(-1, 0, 0), Block.AIR, "out of bounds reads as air");
  assert.equal(g.set(9, 9, 9, Block.ROCK), false);
});

test("column runs and top", () => {
  const g = new VoxelGrid(1, 8, 1);
  g.set(0, 0, 0, Block.ROCK); g.set(0, 1, 0, Block.SAND); g.set(0, 4, 0, Block.WOOD);
  assert.deepEqual(g.columnRuns(0, 0), [[0, 2], [4, 5]]);
  assert.equal(g.columnTop(0, 0), 4);
  assert.equal(new VoxelGrid(1, 2, 1).columnTop(0, 0), -1);
});

test("island generation is deterministic and well-formed", () => {
  const a = generateIsland({ seed: 99 });
  const b = generateIsland({ seed: 99 });
  assert.deepEqual([...a.grid.data], [...b.grid.data]);
  assert.notDeepEqual([...a.grid.data], [...generateIsland({ seed: 100 }).grid.data]);
  assert.equal(a.grid.sizeX, ISLAND_SIZE);
  assert.ok(a.palms.length >= 3);
  const c = ISLAND_SIZE / 2;
  assert.equal(a.grid.get(c, 0, c), Block.ROCK, "centre column starts with rock");
  assert.ok(a.grid.countSolid() > 1000);
});

test("blast removes a sphere but never bedrock, and pays coins", () => {
  const { grid } = generateIsland({ seed: 5 });
  const c = ISLAND_SIZE / 2;
  const before = grid.countSolid();
  const { removed, coins } = resolveBlast(grid, c, 3.5, c, 3);
  assert.ok(removed.length > 20);
  assert.equal(before - removed.length, grid.countSolid());
  assert.equal(coins, removed.length, "terrain blocks are worth 1 coin each");
  for (let y = 0; y < BEDROCK_LAYERS; y++) assert.equal(grid.get(c, y, c), Block.ROCK);
  assert.equal(resolveBlast(grid, -50, 0, -50, 2).removed.length, 0, "blast off-grid does nothing");
});
