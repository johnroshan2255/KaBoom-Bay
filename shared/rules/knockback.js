import { KNOCKBACK_LIFT, KNOCKBACK_RADIUS_SCALE, KNOCKBACK_SPEED } from "../constants.js";

/**
 * Launch velocity for a hero standing at `hero` when a bomb of `blastRadius` explodes at `blast`, or
 * null when out of range. Strength fades linearly with distance; straight-up blasts pick a random
 * horizontal direction so the hero never stays glued to the crater.
 */
export function blastKnockback(hero, blast, blastRadius, rand = Math.random) {
  const reach = blastRadius * KNOCKBACK_RADIUS_SCALE;
  let dx = hero.x - blast.x, dz = hero.z - blast.z;
  const d = Math.hypot(dx, dz);
  if (d > reach) return null;
  if (d < 1e-3) { const a = rand() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); }
  else { dx /= d; dz /= d; }
  const k = 1 - (d / reach) * 0.7; // 1 at the centre, 0.3 at the edge
  return { vx: dx * KNOCKBACK_SPEED * k, vy: KNOCKBACK_LIFT * k, vz: dz * KNOCKBACK_SPEED * k };
}

/**
 * Where a knocked hero lands if nothing stops them: simple ballistic flight from `pos` with velocity `v`
 * back down to the take-off height (the server uses this for bots; clients animate the real arc).
 */
export function knockbackLanding(pos, v, gravity) {
  const t = (2 * v.vy) / -gravity;
  return { x: pos.x + v.vx * t, z: pos.z + v.vz * t, t };
}
