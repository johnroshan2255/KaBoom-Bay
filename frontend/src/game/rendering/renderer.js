import * as THREE from "three";

const cache = new WeakMap();

/**
 * WebGL 2 renderer. Filmic tone mapping and soft shadows give the warm, rounded
 * look of a MagicaVoxel render; textures stay crisp through nearest filtering in the atlas.
 */
export function createRenderer(canvas) {
  if (cache.has(canvas)) return cache.get(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  cache.set(canvas, renderer);
  return renderer;
}
