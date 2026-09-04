import * as THREE from "three";
import { generateIsland, resolveBlast, Block } from "@kaboom-bay/shared";
import { VoxelMesher } from "../rendering/VoxelMesher.js";
import { MistRing } from "../rendering/Mist.js";
import { Waterfall } from "../rendering/Waterfall.js";
import { quality } from "../rendering/quality.js";

/**
 * One player's island: voxel grid + world placement + mesh.
 * `origin` is the world position of the grid's (0,0,0) corner.
 */
export class Island {
  constructor(scene, { index = 0, seed = 1, center = new THREE.Vector3() } = {}) {
    this.index = index;
    const gen = generateIsland({ seed });
    this.grid = gen.grid;
    this.palms = gen.palms; // every trunk / prop base (spawn pad avoidance)
    this.decor = gen.decor;
    this.center = center.clone();
    this.origin = new THREE.Vector3(center.x - this.grid.sizeX / 2, 0, center.z - this.grid.sizeZ / 2);
    this.mesher = new VoxelMesher(scene, this.origin);
    this.mesher.rebuild(this.grid, this.decor);
    this.mist = new MistRing(scene, this.center, this.grid.sizeX / 2 - 1, { seed: seed * 7 + 3 });
    this.waterfall = gen.waterfall && quality.settings.waterfall ? new Waterfall(scene, { origin: this.origin, spot: gen.waterfall }) : null;
    this._unsubscribe = quality.onChange(() => this.mesher.rebuild(this.grid, this.decor)); // decal budget changed
  }

  /** Re-mesh after terrain or building changes (keeps the flower decals that survived). */
  rebuild() {
    this.mesher.rebuild(this.grid, this.decor);
  }

  update(dt, time) {
    this.mist.update(dt, time);
    this.waterfall?.update(dt, time);
  }

  dispose() {
    this._unsubscribe();
    this.mesher.dispose();
    this.mist.dispose();
    this.waterfall?.dispose();
  }

  /** Beach spot whose nearest palm is furthest away - where the player stands and throws from. */
  padSpot() {
    let best = null, bestScore = -1;
    for (let i = 0; i < 24; i++) {
      const spot = this.beachSpot((i / 24) * Math.PI * 2);
      let nearest = Infinity;
      for (const palm of this.palms) {
        const w = this.gridToWorld(palm.x, 0, palm.z);
        nearest = Math.min(nearest, Math.hypot(w.x - spot.x, w.z - spot.z));
      }
      if (nearest > bestScore) { bestScore = nearest; best = spot; }
    }
    return best;
  }

  worldToGrid(p, out = new THREE.Vector3()) {
    return out.set(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z);
  }

  gridToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(this.origin.x + x + 0.5, this.origin.y + y + 0.5, this.origin.z + z + 0.5);
  }

  /** Is the world-space point inside a solid voxel of this island? */
  isSolidAt(wx, wy, wz) {
    return this.grid.isSolid(Math.floor(wx - this.origin.x), Math.floor(wy - this.origin.y), Math.floor(wz - this.origin.z));
  }

  /** World position of a spot on the beach at the given angle, one block above the sand. */
  beachSpot(angle) {
    const cx = this.grid.sizeX / 2, cz = this.grid.sizeZ / 2;
    for (let r = this.grid.sizeX / 2; r > 0; r -= 0.5) {
      const x = Math.floor(cx + Math.cos(angle) * r);
      const z = Math.floor(cz + Math.sin(angle) * r);
      const top = this.grid.columnTop(x, z);
      if (top >= 0 && this.grid.get(x, top, z) === Block.SAND) {
        return this.gridToWorld(x, top + 1, z);
      }
    }
    return this.gridToWorld(cx, this.grid.columnTop(cx, cz) + 1, cz);
  }

  /** Applies a blast at a world position. Returns { removed, coins }. */
  blast(worldPos, radius) {
    const g = this.worldToGrid(worldPos);
    const result = resolveBlast(this.grid, g.x, g.y, g.z, radius);
    if (result.removed.length) this.rebuild();
    return result;
  }
}
