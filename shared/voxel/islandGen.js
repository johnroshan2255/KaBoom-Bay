import { VoxelGrid, Block } from "./VoxelGrid.js";
import { ISLAND_SIZE, ISLAND_GRID_HEIGHT } from "../constants.js";
import { DEFAULT_MAP, GameMap, normalizeMap } from "../rules/maps.js";

/** Small, fast, seedable PRNG (mulberry32). Same seed -> same island on client and server. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a tropical voxel island in the style of the art reference: a floating mossy-rock chunk with
 * a sandy beach, a grass plateau and two higher stepped tiers (every step is one block, so heroes can
 * walk everywhere), a carved-stone ruin with pillars and a low broken wall around the upper tier,
 * round trees, palms near the beach, bushes, mushrooms, and a spot for a waterfall over the cliff.
 *
 * Column layout (y): 0..3 rock (the lowest layers taper inward), then
 *   beach   : 4 = sand
 *   plateau : 4 = dirt, 5 = grass
 *   tier 2  : 5 = dirt, 6 = grass       (+ carved wall blocks at 7 along its edge, with gaps)
 *   tier 3  : 6 = dirt, 7 = grass
 * Props sit on top; everything above is free build space. `decor` is purely visual (client only).
 *
 * `map` (GameMap) changes the dressing only, never the rules: the same block ids are reused and the
 * client's theme paints them (SAND is black sand / ice shelf / regolith, GRASS is ash / snow / alien turf,
 * MUSHROOM is lava / ice crystal / spore pod, STEM is obsidian / ice / crystal, ...). Every map keeps a
 * SAND beach (spawn pads) and GRASS / SAND / DIRT tops (supply crates).
 *   volcano : a lava-filled crater with a broken rim on the top tier, dead ember trees, vents, obsidian shards
 *   ice     : snow pines, ice spikes, snow mounds and ice-crystal clusters; no waterfall (frozen)
 *   space   : crystal trees and spires on an asteroid, spore pods; no waterfall
 */
export function generateIsland({ seed = 1, size = ISLAND_SIZE, height = ISLAND_GRID_HEIGHT, map = DEFAULT_MAP } = {}) {
  map = normalizeMap(map);
  const volcano = map === GameMap.VOLCANO, ice = map === GameMap.ICE, space = map === GameMap.SPACE;
  const rand = mulberry32(seed);
  const grid = new VoxelGrid(size, height, size);
  const c = (size - 1) / 2;
  const baseRadius = size / 2 - 1.5;

  const wobbles = Array.from({ length: 3 }, () => ({ amp: 0.5 + rand() * 0.8, freq: 2 + Math.floor(rand() * 3), phase: rand() * Math.PI * 2 }));
  const radiusAt = (angle) => baseRadius + wobbles.reduce((s, w) => s + w.amp * Math.sin(w.freq * angle + w.phase), 0);

  // upper tiers: off-centre ellipses with their own wobble so the ledges read as natural rock shelves
  const tierAngle = rand() * Math.PI * 2;
  const t2 = { cx: c + Math.cos(tierAngle) * 0.14 * baseRadius, cz: c + Math.sin(tierAngle) * 0.14 * baseRadius, r: baseRadius * 0.56, amp: 0.6 + rand() * 0.5, freq: 3 + Math.floor(rand() * 2), phase: rand() * 6.28, sx: 0.9 + rand() * 0.3 };
  const t3 = { cx: t2.cx + Math.cos(tierAngle + 0.8) * 1.6, cz: t2.cz + Math.sin(tierAngle + 0.8) * 1.6, r: baseRadius * 0.3, amp: 0.4 + rand() * 0.4, freq: 2 + Math.floor(rand() * 2), phase: rand() * 6.28, sx: 1 };
  const inTier = (t, x, z) => {
    const dx = (x - t.cx) * t.sx, dz = z - t.cz;
    const a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) < t.r + t.amp * Math.sin(t.freq * a + t.phase);
  };

  const shore = new Float32Array(size * size).fill(-1);
  const beach = [], plateau = [], tier2 = [];

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dz = z - c;
      const d = Math.hypot(dx, dz) / radiusAt(Math.atan2(dz, dx));
      if (d > 1) continue;
      shore[z * size + x] = d;
      if (d < 0.72) grid.set(x, 0, z, Block.ROCK);
      if (d < 0.88) grid.set(x, 1, z, Block.ROCK);
      grid.set(x, 2, z, Block.ROCK);
      grid.set(x, 3, z, Block.ROCK);
      if (d > 0.74) { grid.set(x, 4, z, Block.SAND); beach.push([x, z]); continue; }
      grid.set(x, 4, z, Block.ROCK);
      grid.set(x, 5, z, Block.GRASS);
      plateau.push([x, z, d]);
      if (d < 0.66 && inTier(t2, x, z)) {
        grid.set(x, 5, z, Block.ROCK);
        grid.set(x, 6, z, Block.GRASS);
        tier2.push([x, z]);
        if (inTier(t3, x, z)) { grid.set(x, 6, z, Block.ROCK); grid.set(x, 7, z, Block.GRASS); }
      }
    }
  }

  // low carved wall on the tier-2 edge, two octants out of three so there are always ramps through
  const wallPhase = Math.floor(rand() * 3);
  for (const [x, z] of tier2) {
    if (grid.get(x, 7, z) !== Block.AIR) continue; // tier 3 cell
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => grid.get(x + ox, 6, z + oz) === Block.AIR && grid.get(x + ox, 5, z + oz) === Block.GRASS);
    if (!edge) continue;
    const octant = Math.floor((Math.atan2(z - t2.cz, x - t2.cx) + Math.PI) / (Math.PI / 4));
    if ((octant + wallPhase) % 3 === 0) continue; // gap
    grid.set(x, 7, z, Block.CARVED);
  }

  // volcano: the top tier is a crater. Its inside is a walkable lava pool (MUSHROOM, painted as lava), its
  // edge a one-block rock rim with gaps so heroes can still climb in and out.
  if (volcano) {
    const rimPhase = Math.floor(rand() * 3);
    const tier3 = [];
    for (const [x, z] of tier2) if (grid.get(x, 7, z) === Block.GRASS) tier3.push([x, z]);
    for (const [x, z] of tier3) {
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => grid.get(x + ox, 7, z + oz) === Block.AIR);
      if (!edge) { grid.set(x, 7, z, Block.MUSHROOM); continue; }
      const octant = Math.floor((Math.atan2(z - t3.cz, x - t3.cx) + Math.PI) / (Math.PI / 4));
      if ((octant + rimPhase) % 3 !== 0) grid.set(x, 8, z, Block.ROCK);
    }
  }

  // ruin: 5x5 carved platform with four pillars on the plateau side opposite the top tier
  const ruinAngle = tierAngle + Math.PI + (rand() - 0.5) * 0.8;
  const rx = Math.round(c + Math.cos(ruinAngle) * baseRadius * 0.36), rz = Math.round(c + Math.sin(ruinAngle) * baseRadius * 0.36);
  const ruin = [];
  if (grid.get(rx, 5, rz) === Block.GRASS || grid.get(rx, 6, rz) === Block.GRASS) {
    // the slab follows the ground (always a one-block step up from its surroundings); pillars on the corners
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
      const x = rx + ox, z = rz + oz;
      const top = grid.columnTop(x, z);
      if (top < 5 || grid.get(x, top, z) !== Block.GRASS) continue; // stay off the beach and other props
      grid.set(x, top + 1, z, Block.CARVED);
      ruin.push([x, z]);
      if (Math.abs(ox) === 2 && Math.abs(oz) === 2) for (let y = top + 2; y <= top + 4; y++) grid.set(x, y, z, Block.CARVED);
    }
  }
  const taken = (x, z) => ruin.some(([a, b]) => Math.abs(a - x) <= 1 && Math.abs(b - z) <= 1);
  const topIsGrass = (x, z) => { const t = grid.columnTop(x, z); return t >= 5 && grid.get(x, t, z) === Block.GRASS ? t : -1; };

  // boulders on the beach
  const boulderCount = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < boulderCount && beach.length; i++) {
    const [x, z] = beach[Math.floor(rand() * beach.length)];
    grid.set(x, grid.columnTop(x, z) + 1, z, Block.ROCK);
  }

  // trees: round oaks on the tiers, palms towards the beach. `palms` lists every trunk (spawn pad avoidance).
  const palms = [];
  const spaced = (x, z, min) => palms.every((p) => Math.hypot(p.x - x, p.z - z) >= min);
  const plant = (list, count, min, fn) => {
    let guard = 0;
    for (let n = 0; n < count && list.length && guard++ < 200;) {
      const [x, z] = list[Math.floor(rand() * list.length)];
      const top = topIsGrass(x, z);
      if (top < 0 || !spaced(x, z, min) || taken(x, z)) continue;
      fn(x, z, top); n++;
    }
  };
  // rounded canopy: a squashed sphere of leaf blocks (corners cut) like the reference's bulbous trees
  const canopy = (x, y, z, block) => {
    const layers = [[2, 3.4], [2, 4.2], [2, 4.2], [2, 3.2], [1, 1.6]]; // [radius, squared-distance cut]
    layers.forEach(([r, cut], dy) => { for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) if (ox * ox + oz * oz <= cut) grid.set(x + ox, y + dy, z + oz, block); });
  };
  const leafBlob = (x, y, z, r, block = Block.LEAF) => { for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) if (Math.abs(ox) + Math.abs(oz) <= r) grid.set(x + ox, y, z + oz, block); };
  const column = (x, z, top, h, block) => { for (let y = 1; y <= h; y++) grid.set(x, top + y, z, block); };
  const inner = plateau.filter(([, , d]) => d > 0.3 && d < 0.7), outer = plateau.filter(([, , d]) => d > 0.55);
  if (volcano) {
    // dead trees with a few glowing ember leaves, lava vents on the shore side, boulders and obsidian shards
    plant(inner, 2 + Math.floor(rand() * 2), 5, (x, z, top) => {
      const trunk = 3 + Math.floor(rand() * 2);
      column(x, z, top, trunk, Block.WOOD);
      leafBlob(x, top + trunk, z, 1, Block.LEAF_AUTUMN);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rand() < 0.5) grid.set(x + ox, top + trunk + 1, z + oz, Block.LEAF_AUTUMN);
      palms.push({ x, z, height: trunk, kind: "oak" });
    });
    plant(outer, 1 + Math.floor(rand() * 2), 4, (x, z, top) => {
      grid.set(x, top + 1, z, Block.STEM); grid.set(x, top + 2, z, Block.MUSHROOM);
      palms.push({ x, z, height: 2, kind: "vent" });
    });
    plant(plateau, 3, 3, (x, z, top) => { leafBlob(x, top + 1, z, 1, Block.ROCK); palms.push({ x, z, height: 1, kind: "bush" }); });
    plant(plateau, 2 + Math.floor(rand() * 2), 3, (x, z, top) => { column(x, z, top, 2 + Math.floor(rand() * 2), Block.STEM); palms.push({ x, z, height: 3, kind: "shard" }); });
  } else if (ice) {
    // snow pines (cone canopies), ice spikes towards the shore, snow mounds and ice-crystal clusters
    plant(inner, 2 + Math.floor(rand() * 2), 5, (x, z, top) => {
      const trunk = 3 + Math.floor(rand() * 2);
      column(x, z, top, trunk, Block.WOOD);
      leafBlob(x, top + trunk - 1, z, 2); leafBlob(x, top + trunk, z, 2); leafBlob(x, top + trunk + 1, z, 1); leafBlob(x, top + trunk + 2, z, 1); grid.set(x, top + trunk + 3, z, Block.LEAF);
      palms.push({ x, z, height: trunk, kind: "oak" });
    });
    plant(outer, 1 + Math.floor(rand() * 2), 4, (x, z, top) => { const h = 2 + Math.floor(rand() * 3); column(x, z, top, h, Block.STEM); palms.push({ x, z, height: h, kind: "spike" }); });
    plant(plateau, 3, 3, (x, z, top) => { leafBlob(x, top + 1, z, 1, Block.GRASS); palms.push({ x, z, height: 1, kind: "bush" }); });
    plant(plateau, 1 + Math.floor(rand() * 2), 3, (x, z, top) => {
      grid.set(x, top + 1, z, Block.STEM);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (Math.abs(ox) + Math.abs(oz) < 2) grid.set(x + ox, top + 2, z + oz, Block.MUSHROOM);
      grid.set(x, top + 3, z, Block.MUSHROOM);
      palms.push({ x, z, height: 2, kind: "crystal" });
    });
  } else if (space) {
    // crystal trees, tall crystal spires, rock clusters and glowing spore pods on the asteroid
    plant(inner, 2 + Math.floor(rand() * 2), 5, (x, z, top) => {
      const trunk = 2 + Math.floor(rand() * 2);
      column(x, z, top, trunk, Block.WOOD);
      leafBlob(x, top + trunk + 1, z, 2); leafBlob(x, top + trunk + 2, z, 1); grid.set(x, top + trunk + 3, z, Block.LEAF);
      palms.push({ x, z, height: trunk, kind: "oak" });
    });
    plant(outer, 1 + Math.floor(rand() * 2), 4, (x, z, top) => { const h = 3 + Math.floor(rand() * 3); column(x, z, top, h, Block.LEAF_AUTUMN); palms.push({ x, z, height: h, kind: "spire" }); });
    plant(plateau, 3, 3, (x, z, top) => { leafBlob(x, top + 1, z, 1, Block.ROCK); if (rand() < 0.5) grid.set(x, top + 2, z, Block.ROCK); palms.push({ x, z, height: 1, kind: "bush" }); });
    plant(plateau, 2 + Math.floor(rand() * 2), 3, (x, z, top) => {
      grid.set(x, top + 1, z, Block.STEM);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (Math.abs(ox) + Math.abs(oz) < 2) grid.set(x + ox, top + 2, z + oz, Block.MUSHROOM);
      palms.push({ x, z, height: 2, kind: "mushroom" });
    });
  } else {
    plant(plateau.filter(([, , d]) => d > 0.3 && d < 0.7), 2 + Math.floor(rand() * 2), 5, (x, z, top) => {
      const trunk = 4 + Math.floor(rand() * 2);
      for (let y = 1; y <= trunk; y++) grid.set(x, top + y, z, Block.WOOD);
      canopy(x, top + trunk - 1, z, rand() < 0.5 ? Block.LEAF_AUTUMN : Block.LEAF);
      palms.push({ x, z, height: trunk, kind: "oak" });
    });
    plant(plateau.filter(([, , d]) => d > 0.55), 1 + Math.floor(rand() * 2), 4, (x, z, top) => {
      const trunk = 4 + Math.floor(rand() * 2);
      for (let y = 1; y <= trunk; y++) grid.set(x, top + y, z, Block.WOOD);
      const crown = top + trunk + 1;
      grid.set(x, crown, z, Block.LEAF); grid.set(x, crown + 1, z, Block.LEAF);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { grid.set(x + ox, crown, z + oz, Block.LEAF); grid.set(x + ox * 2, crown, z + oz * 2, Block.LEAF); grid.set(x + ox * 2, crown - 1, z + oz * 2, Block.LEAF); }
      for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { grid.set(x + ox, crown, z + oz, Block.LEAF); grid.set(x + ox * 2, crown - 1, z + oz * 2, Block.LEAF); }
      palms.push({ x, z, height: trunk, kind: "palm" });
    });
    // bushes and mushrooms (small, walk-around props)
    plant(plateau, 3, 3, (x, z, top) => { leafBlob(x, top + 1, z, 1); if (rand() < 0.5) grid.set(x, top + 2, z, Block.LEAF); palms.push({ x, z, height: 1, kind: "bush" }); });
    plant(plateau, 2 + Math.floor(rand() * 2), 3, (x, z, top) => {
      grid.set(x, top + 1, z, Block.STEM);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (Math.abs(ox) + Math.abs(oz) < 2) grid.set(x + ox, top + 2, z + oz, Block.MUSHROOM);
      grid.set(x, top + 3, z, Block.MUSHROOM);
      palms.push({ x, z, height: 2, kind: "mushroom" });
    });
  }

  // waterfall: a spring at the plateau's cliff edge, a stream across the beach, and a fall off the rim into the sea
  let waterfall = null;
  const a0 = rand() * Math.PI * 2;
  for (let k = 0; k < 16 && !waterfall && !ice && !space; k++) { // try angles around the island until a clean cliff -> beach -> rim line exists
    const a = a0 + (k * Math.PI) / 8;
    let cliff = null, rim = null;
    for (let r = 0; r < size; r += 0.5) {
      const x = Math.floor(c + Math.cos(a) * r), z = Math.floor(c + Math.sin(a) * r);
      const top = grid.columnTop(x, z);
      if (top < 0) break;
      if (grid.get(x, 5, z) === Block.GRASS && top === 5) cliff = [x, z];
      if (cliff && top === 4 && grid.get(x, 4, z) === Block.SAND) rim = [x, z];
    }
    if (cliff && rim) waterfall = { x: cliff[0], z: cliff[1], y: 5, rimX: rim[0], rimZ: rim[1], angle: a };
  }

  // flowers: visual-only speckles on open grass (clients draw them; the server ignores them)
  const flowers = [];
  for (let i = 0; i < 60 && plateau.length; i++) {
    const [x, z] = plateau[Math.floor(rand() * plateau.length)];
    const top = topIsGrass(x, z);
    if (top >= 0 && grid.get(x, top + 1, z) === Block.AIR) flowers.push([x, top, z, Math.floor(rand() * 3)]);
  }

  return { grid, palms, shore, seed, size, map, waterfall, decor: { flowers } };
}
