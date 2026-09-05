import * as THREE from "three";
import { WATER_LEVEL } from "@kaboom-bay/shared";
import { quality } from "./quality.js";
import { theme } from "./theme.js";

/**
 * The plane the islands float in: sea, lava, frozen sea or the void, depending on the map's theme. A
 * Lambert material (keeps cloud shadows and fog) with a small shader patch that adds rolling waves in the
 * vertex stage and, on capable devices, a two-octave shimmer / caustic pattern in the fragment stage.
 * The lowest tier keeps the waves and a flat tint: the noise is the expensive part.
 * Lava glows through its emissive colour; ice and the void are still (no waves). The void (`stars`) swaps the
 * shimmer for a field of tiny twinkling star points so it reads as open space below the asteroids.
 */
export function createWater() {
  const w = theme().water;
  const uniforms = {
    uTime: { value: 0 },
    uWave: { value: w.waveAmp },
    uDeep: { value: new THREE.Color().setRGB(...w.deep) },
    uShallow: { value: new THREE.Color().setRGB(...w.shallow) },
    uSparkle: { value: new THREE.Color().setRGB(...w.sparkle) },
    uStars: { value: w.stars ? 1 : 0 },
  };
  const { waterSegments, waterDetail } = quality.settings;
  const material = new THREE.MeshLambertMaterial({ color: waterDetail ? w.color : w.flat, transparent: w.opacity < 1, opacity: w.opacity, emissive: w.emissive });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWave;\nvarying vec2 vWorldXZ;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        transformed.z += (sin(wp.x * 0.28 + uTime * 1.1) + sin(wp.z * 0.23 - uTime * 0.9)) * uWave;`);
    if (!waterDetail) return;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSparkle;
        uniform float uStars;
        varying vec2 vWorldXZ;
        float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
        float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (uStars > 0.5) {
          // the void: a faint slow nebula wash plus sparse, tiny, twinkling stars (one per 0.3-unit cell, 1.5% of cells)
          float neb = vnoise(vWorldXZ * 0.05 + vec2(uTime * 0.01, 0.0));
          diffuseColor.rgb = mix(uDeep, uShallow, neb);
          vec2 g = vWorldXZ * 3.3;
          vec2 cell = floor(g);
          float h = hash21(cell);
          vec2 f = fract(g) - 0.5 + (vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5) * 0.6;
          float star = step(0.985, h) * smoothstep(0.22, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 60.0));
          diffuseColor.rgb += star * uSparkle;
        } else {
          float n1 = vnoise(vWorldXZ * 0.35 + vec2(uTime * 0.06, -uTime * 0.04));
          float n2 = vnoise(vWorldXZ * 0.9 - vec2(uTime * 0.1, uTime * 0.07));
          float shimmer = smoothstep(0.35, 0.75, n1 * 0.55 + n2 * 0.45);
          diffuseColor.rgb = mix(uDeep, uShallow, shimmer * 0.5);
          float sparkle = smoothstep(0.9, 0.98, n2 * n1 * 1.5 + 0.1 * sin(uTime * 3.0 + vWorldXZ.x));
          diffuseColor.rgb += sparkle * uSparkle;
        }`);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, waterSegments, waterSegments), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;
  mesh.update = (dt) => { uniforms.uTime.value += dt; };
  return mesh;
}
