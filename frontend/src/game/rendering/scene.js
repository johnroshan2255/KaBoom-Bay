import * as THREE from "three";
import { createWater } from "./Water.js";

/**
 * Saturated cyan sky, one warm key light from the upper left with soft shadows,
 * and a cool sky / warm ground hemisphere for bounce - the studio-render lighting of the reference.
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1fbde6);
  scene.fog = new THREE.FogExp2(0x1fbde6, 0.0028); // distance haze; the per-island mist sprites do the rest

  scene.add(new THREE.HemisphereLight(0xa9e6ff, 0x9a8a5a, 1.15));

  const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
  sun.position.set(-34, 52, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 70;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);

  // faint cool fill from the opposite side so shaded cliffs don't go black
  const fill = new THREE.DirectionalLight(0x8fd8ff, 0.35);
  fill.position.set(30, 20, -30);
  scene.add(fill);

  const water = createWater();
  scene.add(water);

  return { scene, sun, water };
}
