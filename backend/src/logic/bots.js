import { BombStatus, MAX_PLAYERS, MatchPhase, PIECE_TYPES, groundLevel, islandCenter, lobVelocity, mulberry32 } from "@kaboom-bay/shared";
import { PlayerState } from "../schema/BayState.js";
import { placePiece } from "./building.js";
import { armBomb, grabBomb, throwBomb } from "./bombs.js";
import { groundAt, placeAtSpawn } from "./players.js";

const BOT_NAMES = ["Coco", "Mango", "Kiwi", "Papaya", "Guava", "Lychee"];

/** Fills every empty island with a bot so a match always has 4 players. */
export function fillBots(room) {
  const taken = new Set([...room.state.players.values()].map((p) => p.islandIndex));
  const rand = mulberry32(room.state.seed);
  const names = [...BOT_NAMES].sort(() => rand() - 0.5); // deterministic shuffle, unique names
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (taken.has(i)) continue;
    const name = names.pop() ?? `Bot ${i}`;
    const bot = new PlayerState({ name, islandIndex: i, isBot: true, ready: true });
    placeAtSpawn(room, bot);
    room.state.players.set(`bot-${i}`, bot);
    room.bots.set(`bot-${i}`, { nextActionAt: 0, rand: mulberry32(room.state.seed + 100 + i) });
  }
}

/** Per-tick bot behaviour: build random valid pieces, then lob bombs at rivals during combat. */
export function stepBots(room, now) {
  if (room.state.phase === MatchPhase.COMBAT) return stepCombatBots(room, now);
  if (room.state.phase !== MatchPhase.BUILD) return;
  for (const [key, bot] of room.bots) {
    if (now < bot.nextActionAt) continue;
    const player = room.state.players.get(key);
    if (!player) continue;
    const grid = room.islands[player.islandIndex].grid;
    for (let attempt = 0; attempt < 12; attempt++) {
      const type = PIECE_TYPES[Math.floor(bot.rand() * PIECE_TYPES.length)];
      const x = 6 + Math.floor(bot.rand() * 11);
      const z = 6 + Math.floor(bot.rand() * 11);
      const y = groundLevel(grid, x, z);
      if (placePiece(room, player, { type, x, y, z, rot: Math.floor(bot.rand() * 4) })) break;
    }
    bot.nextActionAt = now + 700 + bot.rand() * 1300;
  }
}

function stepCombatBots(room, now) {
  const { state } = room;
  for (const [key, bot] of room.bots) {
    if (now < bot.nextActionAt) continue;
    const player = state.players.get(key);
    if (!player) continue;
    const held = [...state.bombs.entries()].find(([, b]) => b.holder === key);
    if (!held) {
      // grab a live bomb resting on our island, if any
      const resting = [...state.bombs.entries()].find(([, b]) => b.status === BombStatus.RESTING && b.islandIndex === player.islandIndex);
      if (resting && bot.rand() < 0.8) {
        const [, b] = resting;
        const d = Math.hypot(b.x - player.x, b.z - player.z);
        if (d > 2) { // walk toward it
          const k = Math.min(1, 3 / d);
          const nx = player.x + (b.x - player.x) * k, nz = player.z + (b.z - player.z) * k;
          const gy = groundAt(room, player.islandIndex, nx, nz);
          if (gy !== null) { player.x = nx; player.z = nz; player.y = gy; player.yaw = Math.atan2(b.x - player.x, b.z - player.z); }
        } else grabBomb(room, key, resting[0]);
      }
      bot.nextActionAt = now + 400 + bot.rand() * 600;
      continue;
    }
    const [, bomb] = held;
    if (!bomb.armedAt) {
      armBomb(room, key);
      bot.nextActionAt = now + 600 + bot.rand() * 900; // "aiming"
      continue;
    }
    const targets = [...state.players.values()].filter((p) => p.islandIndex !== player.islandIndex);
    const target = targets[Math.floor(bot.rand() * targets.length)];
    if (!target) { bot.nextActionAt = now + 1000; continue; }
    const c = islandCenter(target.islandIndex);
    const aimX = c.x + (bot.rand() - 0.5) * 12, aimZ = c.z + (bot.rand() - 0.5) * 12;
    const dx = aimX - bomb.x, dz = aimZ - bomb.z;
    const range = Math.hypot(dx, dz) * (0.92 + bot.rand() * 0.16);
    throwBomb(room, key, lobVelocity(dx, dz, range));
    bot.nextActionAt = now + 2500 + bot.rand() * 3000;
  }
}
