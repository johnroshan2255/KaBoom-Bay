import { BOMB_MAX_THROW_POWER, GRAVITY } from "../constants.js";

/** Server-side sanity clamp for a client-supplied throw. Returns null if unusable. */
export function clampThrowVelocity(v) {
  if (!v || ![v.vx, v.vy, v.vz].every(Number.isFinite)) return null;
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  if (speed < 0.5) return null;
  const k = speed > BOMB_MAX_THROW_POWER ? BOMB_MAX_THROW_POWER / speed : 1;
  return { vx: v.vx * k, vy: Math.max(0, v.vy * k), vz: v.vz * k };
}

/** 45-degree launch velocity that lands `range` units away in direction (dx, dz). Used by bots. */
export function lobVelocity(dx, dz, range) {
  const len = Math.hypot(dx, dz) || 1;
  const speed = Math.min(BOMB_MAX_THROW_POWER, Math.sqrt(range * -GRAVITY));
  const h = speed * Math.SQRT1_2;
  return { vx: (dx / len) * h, vy: h, vz: (dz / len) * h };
}
