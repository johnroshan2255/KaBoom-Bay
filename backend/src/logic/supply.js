import { Block, CRATE_PICKUP_RADIUS, DROP_TYPES, ISLAND_SIZE, MatchPhase, Message, SUPPLY_DROP_FALL_MS, SUPPLY_DROP_INTERVAL_MS, SUPPLY_DROP_LIFETIME_MS, islandOrigin } from "@kaboom-bay/shared";
import { CrateState } from "../schema/BayState.js";
import { selectBomb } from "./bombs.js";

/**
 * Supply crates: during combat a crate carrying a special bomb type falls onto an occupied island every
 * SUPPLY_DROP_INTERVAL_MS (islands take turns). Once landed, a hero on that island walks up to it to
 * collect it; unclaimed crates disappear after a while.
 */
export function stepSupply(room, now) {
  const { state } = room;
  if (state.phase !== MatchPhase.COMBAT) return;
  room.nextDropAt ||= now + SUPPLY_DROP_INTERVAL_MS * 0.4; // first crate arrives early in combat
  if (now >= room.nextDropAt) {
    room.nextDropAt = now + SUPPLY_DROP_INTERVAL_MS;
    dropCrate(room, now);
  }
  for (const [id, crate] of [...state.crates.entries()]) {
    if (!crate.landed && now >= crate.landsAt) crate.landed = true;
    if (now >= crate.landsAt + SUPPLY_DROP_LIFETIME_MS) state.crates.delete(id);
  }
}

function dropCrate(room, now) {
  const { state } = room;
  const occupied = [...new Set([...state.players.values()].map((p) => p.islandIndex))].sort();
  if (!occupied.length) return;
  room.dropTurn = ((room.dropTurn ?? -1) + 1) % occupied.length;
  const islandIndex = occupied[room.dropTurn];
  const spot = crateSpot(room, islandIndex);
  if (!spot) return;
  const type = DROP_TYPES[Math.floor(Math.random() * DROP_TYPES.length)];
  const id = `c${room.nextCrateId = (room.nextCrateId ?? 0) + 1}`;
  state.crates.set(id, new CrateState({ type, islandIndex, ...spot, landsAt: now + SUPPLY_DROP_FALL_MS, landed: false }));
  room.broadcast(Message.SUPPLY_DROP, { id, islandIndex, type });
}

/** A flat spot on natural ground, away from palms and buildings: world position of the cell top. */
function crateSpot(room, islandIndex) {
  const island = room.islands[islandIndex];
  const o = islandOrigin(islandIndex);
  for (let attempt = 0; attempt < 30; attempt++) {
    const gx = 4 + Math.floor(Math.random() * (ISLAND_SIZE - 8)), gz = 4 + Math.floor(Math.random() * (ISLAND_SIZE - 8));
    const top = island.grid.columnTop(gx, gz);
    if (top < 0 || top > 9) continue;
    const block = island.grid.get(gx, top, gz);
    if (block !== Block.GRASS && block !== Block.SAND && block !== Block.DIRT) continue;
    return { x: o.x + gx + 0.5, y: o.y + top + 1, z: o.z + gz + 0.5 };
  }
  return null;
}

/** PICK_CRATE: the hero must stand next to a landed crate on their own island. */
export function pickCrate(room, sessionId, id) {
  const player = room.state.players.get(sessionId);
  const crate = typeof id === "string" ? room.state.crates.get(id) : null;
  if (!player || !crate || !crate.landed || crate.islandIndex !== player.islandIndex) return false;
  if (Math.hypot(crate.x - player.x, crate.z - player.z) > CRATE_PICKUP_RADIUS + 0.6) return false;
  room.state.crates.delete(id);
  player.bombs.set(crate.type, (player.bombs.get(crate.type) ?? 0) + 1);
  selectBomb(room, sessionId, crate.type); // the new bomb type is used right away, Bomb Squad style
  return true;
}

export function clearCrates(room) {
  for (const id of [...room.state.crates.keys()]) room.state.crates.delete(id);
  room.nextDropAt = 0;
}
