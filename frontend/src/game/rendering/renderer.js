import * as THREE from "three";
import { pixelRatioFor, quality } from "./quality.js";

const cache = new WeakMap();

/**
 * WebGL 2 renderer. Filmic tone mapping and shadows give the warm, rounded look of a MagicaVoxel
 * render; textures stay crisp through nearest filtering in the atlas. Pixel ratio (a per-tier pixel budget,
 * see quality.js) and shadows follow the quality tier; antialiasing is fixed at creation, so it follows the
 * tier chosen at boot. Call `renderer.fitViewport()` on resize so the ratio follows the new viewport too.
 */
export function createRenderer(canvas) {
  if (cache.has(canvas)) return cache.get(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.settings.antialias,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.fitViewport = () => {
    renderer.setPixelRatio(pixelRatioFor(window.innerWidth, window.innerHeight));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  const applyTier = () => {
    renderer.fitViewport();
    renderer.shadowMap.enabled = quality.settings.shadows;
  };
  applyTier();
  quality.onChange(applyTier);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  cache.set(canvas, renderer);
  return renderer;
}
