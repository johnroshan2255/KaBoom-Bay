import * as THREE from "three";
import { ARENA_INDEX, Block, resolveBlast } from "@kaboom-bay/shared";
import { VoxelMesher } from "../rendering/VoxelMesher.js";
import { blockColor } from "../rendering/palette.js";

const GROW_MS = 380;
const _s = new THREE.Vector3();

/**
 * Capture-the-flag arena in the scene: the hub, the plaza and the bridges as one voxel mesh with the same
 * surface as an Island (grid, origin, rebuild, isSolidAt...) so Match can treat it as island ARENA_INDEX.
 * Blown cells that the server puts back are regrown: each plank rises and scales up in place over GROW_MS
 * before it joins the mesh, so a bridge visibly knits itself back together instead of popping in.
 */
export class ArenaView {
  constructor(scene, arena) {
    this.index = ARENA_INDEX;
    this.scene = scene;
    this.grid = arena.grid;
    this.original = arena.grid.data.slice(); // what a blown cell grows back into
    this.owner = arena.owner;
    this.palms = [];
    this.decor = null;
    this.origin = new THREE.Vector3(arena.origin.x, arena.origin.y, arena.origin.z);
    this.center = new THREE.Vector3(arena.center.x, arena.center.y, arena.center.z);
    this.mesher = new VoxelMesher(scene, this.origin);
    this.mesher.rebuild(this.grid);
    this.growing = []; // [{ mesh, cell, block, age }]
    this.growGeo = new THREE.BoxGeometry(1, 1, 1);
    this.waterfall = null;
  }

  rebuild() { this.mesher.rebuild(this.grid); }

  /** A cell the server restored: animate it back, then write it into the grid and re-mesh. */
  regrow(cell, block = this.original[cell]) {
    if (!block || this.grid.data[cell] !== Block.AIR || this.growing.some((g) => g.cell === cell)) return;
    const [x, y, z] = this.grid.coords(cell);
    const mesh = new THREE.Mesh(this.growGeo, new THREE.MeshLambertMaterial({ color: blockColor(block).getHex() }));
    mesh.position.set(this.origin.x + x + 0.5, this.origin.y + y + 0.5, this.origin.z + z + 0.5);
    mesh.scale.setScalar(0.05);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.growing.push({ mesh, cell, block, age: 0 });
  }

  update(dt) {
    if (!this.growing.length) return;
    let done = false;
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      g.age += dt * 1000;
      const t = Math.min(1, g.age / GROW_MS);
      const s = 0.05 + 0.95 * (1 - (1 - t) * (1 - t)); // ease out
      g.mesh.scale.set(s, s, s);
      g.mesh.position.y = this.origin.y + this.grid.coords(g.cell)[1] + 0.5 - (1 - t) * 0.6; // rises out of the water
      if (t >= 1) {
        this.scene.remove(g.mesh); g.mesh.material.dispose();
        this.grid.data[g.cell] = g.block;
        this.growing.splice(i, 1);
        done = true;
      }
    }
    if (done) this.rebuild();
  }

  worldToGrid(p, out = new THREE.Vector3()) { return out.set(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z); }
  gridToWorld(x, y, z, out = new THREE.Vector3()) { return out.set(this.origin.x + x + 0.5, this.origin.y + y + 0.5, this.origin.z + z + 0.5); }
  isSolidAt(wx, wy, wz) { return this.grid.isSolid(Math.floor(wx - this.origin.x), Math.floor(wy - this.origin.y), Math.floor(wz - this.origin.z)); }
  blast(worldPos, radius) {
    const g = this.worldToGrid(worldPos, _s);
    const result = resolveBlast(this.grid, g.x, g.y, g.z, radius);
    if (result.removed.length) this.rebuild();
    return result;
  }

  dispose() {
    for (const g of this.growing) { this.scene.remove(g.mesh); g.mesh.material.dispose(); }
    this.growing.length = 0;
    this.growGeo.dispose();
    this.mesher.dispose();
  }
}
