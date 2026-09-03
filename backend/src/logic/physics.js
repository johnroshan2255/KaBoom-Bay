import RAPIER from "@dimforge/rapier3d-compat";
import { BOMB_RADIUS, GRAVITY, PHYSICS_STEP, buildTerrainColliders, islandOrigin } from "@kaboom-bay/shared";

let ready = null;
/** Loads the Rapier WASM once per process. Call before creating rooms. */
export function initPhysics() {
  return (ready ??= RAPIER.init());
}

/** Authoritative Rapier world for one match: four islands as fixed colliders, bombs as dynamic balls. */
export class MatchPhysics {
  constructor(islands) {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.events = new RAPIER.EventQueue(true);
    this.terrainBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.islands = islands;
    this.terrain = islands.map(() => []);
    this.bodies = new Map(); // bombId -> RigidBody
    this.accumulator = 0;
    for (let i = 0; i < islands.length; i++) this.rebuildIsland(i);
  }

  rebuildIsland(i) {
    this.terrain[i] = buildTerrainColliders(RAPIER, this.world, this.terrainBody, this.islands[i].grid, islandOrigin(i), this.terrain[i]);
  }

  spawnBomb(id, pos, vel) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(vel.vx, vel.vy, vel.vz)
        .setAngvel({ x: vel.vz * 0.5, y: 0, z: -vel.vx * 0.5 })
        .setLinearDamping(0) // pure ballistic flight: matches the aim preview and bot lob maths
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BOMB_RADIUS).setRestitution(0.35).setFriction(0.9).setDensity(2.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    collider.bombId = id;
    this.bodies.set(id, body);
    return body;
  }

  removeBomb(id) {
    const body = this.bodies.get(id);
    if (body) this.world.removeRigidBody(body);
    this.bodies.delete(id);
  }

  applyBlastImpulse(center, radius, strength) {
    for (const body of this.bodies.values()) {
      const p = body.translation();
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius * 2 || d < 1e-3) continue;
      const k = (strength * (1 - d / (radius * 2))) / d;
      body.applyImpulse({ x: dx * k, y: Math.abs(dy) * k + strength * 0.4, z: dz * k }, true);
    }
  }

  /** Steps the world; calls onClash(idA, idB, point) when two bombs touch. */
  step(dt, onClash) {
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * 6);
    while (this.accumulator >= PHYSICS_STEP) {
      this.world.step(this.events);
      this.accumulator -= PHYSICS_STEP;
      this.events.drainCollisionEvents((h1, h2, started) => {
        if (!started || !onClash) return;
        const a = this.world.getCollider(h1), b = this.world.getCollider(h2);
        if (a?.bombId && b?.bombId) {
          const pa = a.parent().translation(), pb = b.parent().translation();
          onClash(a.bombId, b.bombId, { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 });
        }
      });
    }
  }

  free() {
    this.world.free();
  }
}
