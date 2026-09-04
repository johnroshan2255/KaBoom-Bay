import * as THREE from "three";
import { WATER_LEVEL } from "@kaboom-bay/shared";
import { quality } from "./quality.js";

/**
 * Sea plane: a Lambert material (keeps cloud shadows and fog) with a small shader patch that adds
 * rolling waves in the vertex stage and, on capable devices, a two-octave shimmer / caustic pattern
 * in the fragment stage. The lowest tier keeps the waves and a flat tint: the noise is the expensive part.
 */
export function createWater() {
  const uniforms = { uTime: { value: 0 } };
  const { waterSegments, waterDetail } = quality.settings;
  const material = new THREE.MeshLambertMaterial({ color: waterDetail ? 0x17a6d6 : 0x179fce, transparent: true, opacity: 0.96 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vWorldXZ;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        transformed.z += sin(wp.x * 0.28 + uTime * 1.1) * 0.09 + sin(wp.z * 0.23 - uTime * 0.9) * 0.09;`);
    if (!waterDetail) return;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        varying vec2 vWorldXZ;
        float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
        float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float n1 = vnoise(vWorldXZ * 0.35 + vec2(uTime * 0.06, -uTime * 0.04));
        float n2 = vnoise(vWorldXZ * 0.9 - vec2(uTime * 0.1, uTime * 0.07));
        float shimmer = smoothstep(0.35, 0.75, n1 * 0.55 + n2 * 0.45);
        diffuseColor.rgb = mix(vec3(0.07, 0.62, 0.80), vec3(0.12, 0.72, 0.88), shimmer * 0.5);
        float sparkle = smoothstep(0.9, 0.98, n2 * n1 * 1.5 + 0.1 * sin(uTime * 3.0 + vWorldXZ.x));
        diffuseColor.rgb += sparkle * 0.08;`);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, waterSegments, waterSegments), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;
  mesh.update = (dt) => { uniforms.uTime.value += dt; };
  return mesh;
}
