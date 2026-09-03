import * as THREE from "three";
import { mulberry32 } from "@kaboom-bay/shared";

/**
 * Procedural 16x16 pixel-art tiles drawn once into a canvas atlas at startup.
 * Nearest filtering keeps the texels crisp, giving every block sub-voxel detail
 * (grass tufts, moss, cracks, planks) without shipping any image files.
 */
export const TILE = Object.freeze({
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, STONE_MOSS: 4, SAND: 5, WOOD_SIDE: 6, WOOD_TOP: 7,
  LEAF: 8, PLANK: 9, BEAM: 10, WALL: 11, ROOF: 12, FLOOR: 13, DOOR: 14, WINDOW: 15,
});
export const TILE_COUNT = 16;
export const TILE_PX = 16;

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;

function painter(ctx, ox, rand) {
  const px = (x, y, color) => { ctx.fillStyle = css(color); ctx.fillRect(ox + x, y, 1, 1); };
  const fill = (base, jitter) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const j = (rand() - 0.5) * 2 * jitter;
      px(x, y, base.map((v) => v + v * j));
    }
  };
  const speckle = (color, count) => { for (let i = 0; i < count; i++) px((rand() * 16) | 0, (rand() * 16) | 0, color); };
  return { px, fill, speckle };
}

const drawers = {
  [TILE.GRASS_TOP](p, rand) {
    p.fill(hex(0x5ec44c), 0.07);
    p.speckle(hex(0x8de56a), 22); p.speckle(hex(0x46a63e), 14); p.speckle(hex(0xb6f08a), 4);
  },
  [TILE.GRASS_SIDE](p, rand) {
    p.fill(hex(0x8a5a34), 0.09);
    p.speckle(hex(0x6e4325), 10);
    for (let x = 0; x < 16; x++) {
      const depth = 3 + ((rand() * 3) | 0);
      for (let y = 0; y < depth; y++) p.px(x, y, mix(hex(0x5ec44c), hex(0x46a63e), y / depth + (rand() - 0.5) * 0.3));
      if (rand() < 0.3) p.px(x, depth, hex(0x3f8f36));
    }
  },
  [TILE.DIRT](p) { p.fill(hex(0x8a5a34), 0.09); p.speckle(hex(0x6e4325), 12); p.speckle(hex(0xa8734a), 8); },
  [TILE.STONE](p, rand) {
    p.fill(hex(0x7d938a), 0.06);
    p.speckle(hex(0x69807a), 18); p.speckle(hex(0x93a89f), 10);
    // cracks
    for (let i = 0; i < 2; i++) { let x = (rand() * 16) | 0, y = (rand() * 16) | 0; for (let k = 0; k < 6; k++) { p.px(x & 15, y & 15, hex(0x55695f)); rand() < 0.5 ? x++ : y++; } }
    // mortar-ish edge
    for (let x = 0; x < 16; x++) if (rand() < 0.6) p.px(x, 15, hex(0x5e7369));
  },
  [TILE.STONE_MOSS](p, rand) {
    drawers[TILE.STONE](p, rand);
    for (let i = 0; i < 5; i++) { const cx = rand() * 16, cy = rand() * 16, r = 1.5 + rand() * 2.5; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) < r) p.px(x, y, mix(hex(0x5aa84a), hex(0x7bcf5a), rand())); }
  },
  [TILE.SAND](p) { p.fill(hex(0xf1d48e), 0.05); p.speckle(hex(0xe0bd72), 14); p.speckle(hex(0xfff0bd), 10); },
  [TILE.WOOD_SIDE](p, rand) {
    p.fill(hex(0x8c5a2e), 0.05);
    for (let x = 0; x < 16; x += 2 + ((rand() * 2) | 0)) for (let y = 0; y < 16; y++) if (rand() < 0.85) p.px(x, y, hex(0x6d4320));
    p.speckle(hex(0xa9743f), 6);
  },
  [TILE.WOOD_TOP](p, rand) {
    p.fill(hex(0xa9743f), 0.05);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (((d * 1.6) | 0) % 2 === 0) p.px(x, y, hex(0x8c5a2e)); }
  },
  [TILE.LEAF](p) { p.fill(hex(0x3aa64a), 0.09); p.speckle(hex(0x2b7f3a), 26); p.speckle(hex(0x6fd15e), 18); p.speckle(hex(0x1f5f2c), 6); },
  [TILE.PLANK](p, rand) {
    p.fill(hex(0xd19a5a), 0.05);
    for (let y = 0; y < 16; y += 4) { for (let x = 0; x < 16; x++) p.px(x, y, hex(0x9c6a35)); p.px((rand() * 16) | 0, y + 2, hex(0x9c6a35)); }
    p.speckle(hex(0xe2b078), 8);
  },
  [TILE.BEAM](p) { p.fill(hex(0x7a4a24), 0.06); for (let y = 0; y < 16; y++) { p.px(0, y, hex(0x5a3417)); p.px(15, y, hex(0x5a3417)); } p.speckle(hex(0x93602f), 8); },
  [TILE.WALL](p, rand) {
    p.fill(hex(0xd9d3c4), 0.04);
    for (let row = 0; row < 16; row += 5) { for (let x = 0; x < 16; x++) p.px(x, row, hex(0xb5ada0)); const off = (row / 5) % 2 ? 8 : 0; for (let y = row; y < row + 5 && y < 16; y++) p.px((off + 3) & 15, y, hex(0xb5ada0)), p.px((off + 11) & 15, y, hex(0xb5ada0)); }
    p.speckle(hex(0xece7da), 10);
  },
  [TILE.ROOF](p, rand) {
    p.fill(hex(0xd94f3d), 0.05);
    for (let row = 0; row < 16; row += 4) { for (let x = 0; x < 16; x++) p.px(x, row, hex(0x9e2f22)); const off = (row / 4) % 2 ? 4 : 0; for (let x = off; x < 16; x += 8) for (let y = row + 1; y < row + 4; y++) p.px(x & 15, y, hex(0xb23a2b)); for (let x = 0; x < 16; x++) if (rand() < 0.35) p.px(x, row + 1, hex(0xf07a62)); }
  },
  [TILE.FLOOR](p, rand) { p.fill(hex(0xe0b078), 0.04); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.px(x, y, hex(0xb6864c)); p.speckle(hex(0xf0c58e), 8); },
  [TILE.DOOR](p) { p.fill(hex(0x6b3f1f), 0.05); for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) p.px(x, y, hex(0x4e2b12)); for (let y = 0; y < 16; y++) { p.px(0, y, hex(0x3c2010)); p.px(15, y, hex(0x3c2010)); } p.px(11, 8, hex(0xf2c94c)); p.px(12, 8, hex(0xf2c94c)); },
  [TILE.WINDOW](p) {
    p.fill(hex(0x9fe3ff), 0.03);
    for (let i = 0; i < 16; i++) { p.px(i, 0, hex(0xf2e9d8)); p.px(i, 15, hex(0xf2e9d8)); p.px(0, i, hex(0xf2e9d8)); p.px(15, i, hex(0xf2e9d8)); p.px(7, i, hex(0xf2e9d8)); p.px(i, 7, hex(0xf2e9d8)); }
    for (let i = 2; i < 6; i++) p.px(i, 7 - i + 2, hex(0xe6fbff));
  },
};

let cached = null;
export function getAtlas() {
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX * TILE_COUNT;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < TILE_COUNT; i++) drawers[i]?.(painter(ctx, i * TILE_PX, mulberry32(1000 + i)), mulberry32(2000 + i));
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  cached = { texture, canvas };
  return cached;
}
