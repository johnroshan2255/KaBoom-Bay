import * as THREE from "three";
import { createWater } from "./Water.js";
import { quality } from "./quality.js";
import { theme } from "./theme.js";

/**
 * Sky, one warm key light from the upper left with shadows, and a cool sky / warm ground hemisphere for
 * bounce - the studio-render lighting of the reference. Colours and fog follow the current map's theme
 * (cyan bay, ash-red volcano, white-out ice, dark void). Shadow resolution follows the quality tier; a
 * downgrade turns the shadow pass off entirely.
 */
export function createScene() {
  const t = theme();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(t.sky);
  scene.fog = new THREE.FogExp2(t.fog.color, t.fog.density); // distance haze; the per-island mist does the rest

  scene.add(new THREE.HemisphereLight(t.hemi.sky, t.hemi.ground, t.hemi.intensity));

  const sun = new THREE.DirectionalLight(t.sun.color, t.sun.intensity);
  sun.position.set(-34, 52, 22);
  const size = quality.settings.shadowMapSize;
  sun.shadow.mapSize.set(size, size);
  const s = 70;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  // faint fill from the opposite side so shaded cliffs don't go black
  const fill = new THREE.DirectionalLight(t.fill.color, t.fill.intensity);
  fill.position.set(30, 20, -30);
  scene.add(fill);

  const water = createWater();
  scene.add(water);

  const applyTier = () => { sun.castShadow = quality.settings.shadows; };
  applyTier();
  const unsubscribe = quality.onChange(applyTier);
  scene.dispose = () => unsubscribe();

  return { scene, sun, water };
}
