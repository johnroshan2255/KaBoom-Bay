import * as THREE from "three";
import { quality } from "./quality.js";

const cache = new WeakMap();

/**
 * WebGL 2 renderer. Filmic tone mapping and shadows give the warm, rounded look of a MagicaVoxel
 * render; textures stay crisp through nearest filtering in the atlas. Pixel ratio and shadows follow
 * the quality tier (antialiasing is fixed at creation, so it follows the tier chosen at boot).
 */
export function createRenderer(canvas) {
  if (cache.has(canvas)) return cache.get(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.settings.antialias,
    powerPreference: "high-performance",
    stencil: false,
  });
  const applyTier = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.settings.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
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
