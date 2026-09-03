/**
 * VoxelGrid - a fixed-size 3D grid of block ids stored in a flat Uint8Array.
 * Pure data structure, no rendering. Used by client and server alike.
 *
 * Layout: index = (y * sizeZ + z) * sizeX + x  (y-major so whole layers are contiguous).
 */

export const Block = Object.freeze({
  AIR: 0,
  // terrain (1..15)
  ROCK: 1,
  SAND: 2,
  GRASS: 3,
  DIRT: 4,
  WOOD: 5,
  LEAF: 6,
  // building pieces (16..)
  PLANK: 16,
  BEAM: 17,
  WALL: 18,
  ROOF: 19,
  FLOOR: 20,
  DOOR: 21,
  WINDOW: 22,
});

export const isTerrain = (b) => b > Block.AIR && b < Block.PLANK;
export const isPiece = (b) => b >= Block.PLANK;

export class VoxelGrid {
  constructor(sizeX, sizeY, sizeZ, data) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.data = data ?? new Uint8Array(sizeX * sizeY * sizeZ);
    if (this.data.length !== sizeX * sizeY * sizeZ) throw new Error("VoxelGrid: data length mismatch");
  }

  get length() {
    return this.data.length;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ;
  }

  index(x, y, z) {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  /** Inverse of index(). Returns [x, y, z]. */
  coords(i) {
    const x = i % this.sizeX;
    const t = (i - x) / this.sizeX;
    const z = t % this.sizeZ;
    const y = (t - z) / this.sizeZ;
    return [x, y, z];
  }

  get(x, y, z) {
    return this.inBounds(x, y, z) ? this.data[this.index(x, y, z)] : Block.AIR;
  }

  set(x, y, z, block) {
    if (!this.inBounds(x, y, z)) return false;
    this.data[this.index(x, y, z)] = block;
    return true;
  }

  isSolid(x, y, z) {
    return this.get(x, y, z) !== Block.AIR;
  }

  /** Highest solid y in a column, or -1 if the column is empty. */
  columnTop(x, z) {
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (this.data[this.index(x, y, z)] !== Block.AIR) return y;
    }
    return -1;
  }

  /** Contiguous solid runs in a column as [yStart, yEndExclusive] pairs. */
  columnRuns(x, z) {
    const runs = [];
    let start = -1;
    for (let y = 0; y <= this.sizeY; y++) {
      const solid = y < this.sizeY && this.data[this.index(x, y, z)] !== Block.AIR;
      if (solid && start < 0) start = y;
      if (!solid && start >= 0) {
        runs.push([start, y]);
        start = -1;
      }
    }
    return runs;
  }

  forEachSolid(fn) {
    const { sizeX, sizeY, sizeZ, data } = this;
    let i = 0;
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++, i++) {
          const b = data[i];
          if (b !== Block.AIR) fn(x, y, z, b, i);
        }
      }
    }
  }

  countSolid() {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== Block.AIR) n++;
    return n;
  }

  clone() {
    return new VoxelGrid(this.sizeX, this.sizeY, this.sizeZ, this.data.slice());
  }
}
