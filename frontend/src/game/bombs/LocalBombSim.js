import RAPIER from "@dimforge/rapier3d-compat";
import { BOMB_RADIUS, GRAVITY, PHYSICS_STEP, buildTerrainColliders } from "@kaboom-bay/shared";

/**
 * Client-side Rapier world for the offline sandbox (and later: aim preview / cosmetic debris).
 * Terrain is one fixed body with a cuboid collider per contiguous solid run in each voxel column,
 * which is exact for craters, overhangs and buildings and cheap to rebuild after a blast.
 */
export class LocalBombSim {
  static async create() {
    await RAPIER.init();
    return new LocalBombSim();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.terrainBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.terrainColliders = [];
    this.accumulator = 0;
  }

  /** Rebuilds all terrain colliders from the grid (shared with the server). */
  setTerrain(grid, origin) {
    this.terrainColliders = buildTerrainColliders(RAPIER, this.world, this.terrainBody, grid, origin, this.terrainColliders);
  }

  spawnBomb(position, velocity) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setAngvel({ x: velocity.z * 0.5, y: 0, z: -velocity.x * 0.5 })
      .setLinearDamping(0) // pure ballistic flight: matches the aim preview and bot lob maths
      .setAngularDamping(0.8)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(BOMB_RADIUS).setRestitution(0.35).setFriction(0.9).setDensity(2.5);
    this.world.createCollider(colliderDesc, body);
    return body;
  }

  removeBomb(body) {
    this.world.removeRigidBody(body);
  }

  /** Push nearby dynamic bodies away from a blast. */
  applyBlastImpulse(center, radius, strength, bodies) {
    for (const body of bodies) {
      const p = body.translation();
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius * 2 || d < 1e-3) continue;
      const k = (strength * (1 - d / (radius * 2))) / d;
      body.applyImpulse({ x: dx * k, y: Math.abs(dy) * k + strength * 0.4, z: dz * k }, true);
    }
  }

  step(dt) {
    this.world.forEachRigidBody?.((b) => { if (b.isDynamic()) { const v = b.linvel(); b.setLinearDamping(Math.abs(v.y) < 0.6 && Math.hypot(v.x, v.y, v.z) < 6 ? 2.2 : 0); } });
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * 5);
    while (this.accumulator >= PHYSICS_STEP) {
      this.world.step();
      this.accumulator -= PHYSICS_STEP;
    }
  }
}
