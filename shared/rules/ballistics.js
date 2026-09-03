import {
  BOMB_FULL_POWER_DRAG,
  BOMB_LAUNCH_ELEVATION,
  BOMB_MAX_THROW_POWER,
  GRAVITY,
} from "../constants.js";

/**
 * Converts a slingshot pull (vector from current pointer to the anchor, on the ground plane)
 * into a launch velocity. Pull further = faster. Direction is *opposite* the pull.
 *
 * @param {number} pullX  anchor.x - pointer.x
 * @param {number} pullZ  anchor.z - pointer.z
 * @returns {{ vx:number, vy:number, vz:number, power:number }}  power is 0..1
 */
export function pullToVelocity(pullX, pullZ) {
  const len = Math.hypot(pullX, pullZ);
  const power = Math.min(1, len / BOMB_FULL_POWER_DRAG);
  if (len < 1e-6) return { vx: 0, vy: 0, vz: 0, power: 0 };
  const speed = power * BOMB_MAX_THROW_POWER;
  const horiz = Math.cos(BOMB_LAUNCH_ELEVATION) * speed;
  return {
    vx: (pullX / len) * horiz,
    vy: Math.sin(BOMB_LAUNCH_ELEVATION) * speed,
    vz: (pullZ / len) * horiz,
    power,
  };
}

/**
 * Samples a drag-free ballistic arc until `stop(x, y, z)` returns true or maxTime elapses.
 * Used for the aim preview on the client. The server uses Rapier for the real flight.
 */
export function sampleTrajectory(px, py, pz, vx, vy, vz, { dt = 1 / 30, maxTime = 6, stop } = {}) {
  const points = [];
  for (let t = 0; t <= maxTime; t += dt) {
    const x = px + vx * t;
    const y = py + vy * t + 0.5 * GRAVITY * t * t;
    const z = pz + vz * t;
    points.push(x, y, z);
    if (stop && stop(x, y, z)) break;
  }
  return points;
}
