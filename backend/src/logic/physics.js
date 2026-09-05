import RAPIER from "@dimforge/rapier3d-compat";
import { BOMB_RADIUS, GRAVITY, PHYSICS_STEP, buildTerrainColliders, islandOrigin } from "@kaboom-bay/shared";

const HERO_CAPSULE_RADIUS = 0.38, HERO_CAPSULE_HALF = 0.55, HERO_CAPSULE_CENTER = HERO_CAPSULE_HALF + HERO_CAPSULE_RADIUS; // ~1.9 units tall

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
    this.heroes = new Map(); // sessionId -> kinematic RigidBody (capsule) so bombs bounce off heroes
    this.accumulator = 0;
    for (let i = 0; i < islands.length; i++) this.rebuildIsland(i);
  }

  /** A grid added after construction (the capture-the-flag arena, ARENA_INDEX): colliders like any island. */
  addIsland(i) {
    this.terrain[i] = [];
    this.disabled?.delete(i);
    this.rebuildIsland(i);
  }

  /** An island that is not in play: no colliders, so bombs fly through where it would have been. */
  disableIsland(i) {
    for (const c of this.terrain[i]) this.world.removeCollider(c, false);
    this.terrain[i] = [];
    this.disabled = (this.disabled ?? new Set()).add(i);
  }

  rebuildIsland(i) {
    if (this.disabled?.has(i)) return;
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

  /** Mirrors every player's hero as a kinematic capsule (feet at player.y). Call once per tick. */
  syncHeroes(players) {
    for (const [key, p] of players) {
      let body = this.heroes.get(key);
      if (!body) {
        body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + HERO_CAPSULE_CENTER, p.z));
        const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(HERO_CAPSULE_HALF, HERO_CAPSULE_RADIUS).setFriction(0.6).setRestitution(0.3), body);
        collider.heroId = key;
        this.heroes.set(key, body);
      }
      body.setNextKinematicTranslation({ x: p.x, y: p.y + HERO_CAPSULE_CENTER, z: p.z });
    }
    for (const [key, body] of this.heroes) {
      if (!players.has(key)) { this.world.removeRigidBody(body); this.heroes.delete(key); }
    }
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

  /**
   * Steps the world. onClash(idA, idB, point) when two bombs touch; onImpact(bombId, heroId|null) when a
   * bomb hits terrain or a hero (impact bombs explode on that).
   */
  step(dt, onClash, onImpact) {
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * 6);
    while (this.accumulator >= PHYSICS_STEP) {
      this.world.step(this.events);
      this.accumulator -= PHYSICS_STEP;
      this.events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const a = this.world.getCollider(h1), b = this.world.getCollider(h2);
        if (!a || !b) return;
        if (a.bombId && b.bombId) {
          if (!onClash) return;
          const pa = a.parent().translation(), pb = b.parent().translation();
          onClash(a.bombId, b.bombId, { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 });
        } else if (onImpact && (a.bombId || b.bombId)) {
          const bomb = a.bombId ? a : b, other = a.bombId ? b : a;
          onImpact(bomb.bombId, other.heroId ?? null);
        }
      });
    }
  }

  free() {
    this.world.free();
  }
}
