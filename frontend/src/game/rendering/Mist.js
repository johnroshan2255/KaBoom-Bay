import * as THREE from "three";
import { WATER_LEVEL } from "@kaboom-bay/shared";
import { quality } from "./quality.js";
import { theme } from "./theme.js";

/**
 * Low-lying mist hugging an island's cliffs: a ring of soft camera-facing puffs that drift, bob and
 * breathe. All puffs of an island are one geometry drawn with one shader call; the drift, bob and
 * opacity animation run in the vertex shader from a time uniform, so the CPU does nothing per frame.
 * The quality tier decides how many puffs are drawn (draw range), so downgrades apply instantly.
 */
let mistTexture = null;
function texture() {
  if (mistTexture) return mistTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  mistTexture = new THREE.CanvasTexture(c);
  mistTexture.colorSpace = THREE.SRGBColorSpace;
  return mistTexture;
}

let sharedMaterial = null;
function material() {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, map: { value: texture() }, uColor: { value: new THREE.Color(0xe6f8ff) }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: `
      uniform float uTime;
      attribute vec2 corner;      // quad corner -0.5..0.5
      attribute vec4 orbit;       // angle0, speed, radius, y
      attribute vec4 look;        // width, height, bobPhase, baseOpacity
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        float angle = orbit.x + orbit.y * uTime;
        vec3 center = vec3(cos(angle) * orbit.z, orbit.w + sin(uTime * 0.6 + look.z) * 0.25, sin(angle) * orbit.z);
        vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
        mvPosition.xy += corner * look.xy;          // billboard in view space
        gl_Position = projectionMatrix * mvPosition;
        vUv = corner + 0.5;
        vAlpha = look.w * (0.8 + 0.2 * sin(uTime * 0.4 + look.z));
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        vec4 tex = texture2D(map, vUv);
        gl_FragColor = vec4(uColor * tex.rgb, tex.a * vAlpha);
        #include <fog_fragment>
      }`,
  });
  return sharedMaterial;
}

const MAX_PUFFS = 20;
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

export class MistRing {
  constructor(scene, center, radius, { count = MAX_PUFFS, seed = 1 } = {}) {
    this.scene = scene;
    let r = seed >>> 0;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = Math.min(count, MAX_PUFFS);
    const corner = new Float32Array(n * 4 * 2), orbit = new Float32Array(n * 4 * 4), look = new Float32Array(n * 4 * 4);
    const index = [];
    for (let i = 0; i < n; i++) {
      const size = 7 + rand() * 6;
      const o = [(i / n) * Math.PI * 2 + rand() * 0.4, (0.03 + rand() * 0.04) * (rand() < 0.5 ? 1 : -1), radius - 1 + rand() * 4.5, WATER_LEVEL + 0.4 + rand() * 2.2];
      const l = [size, size * 0.7, rand() * Math.PI * 2, 0.38 + rand() * 0.22];
      for (let v = 0; v < 4; v++) {
        const vi = i * 4 + v;
        corner.set(CORNERS[v], vi * 2);
        orbit.set(o, vi * 4);
        look.set(l, vi * 4);
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)); // unused, keeps three happy
    this.geometry.setAttribute("corner", new THREE.BufferAttribute(corner, 2));
    this.geometry.setAttribute("orbit", new THREE.BufferAttribute(orbit, 4));
    this.geometry.setAttribute("look", new THREE.BufferAttribute(look, 4));
    this.geometry.setIndex(index);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), radius + 12);
    this.mesh = new THREE.Mesh(this.geometry, material());
    material().uniforms.uColor.value.setHex(theme().mist); // one match at a time: the shared material follows the current map
    this.mesh.position.set(center.x, 0, center.z);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.count = n;
    this._applyTier = () => this.geometry.setDrawRange(0, Math.min(this.count, quality.settings.mistPuffs) * 6);
    this._applyTier();
    this._unsubscribe = quality.onChange(this._applyTier);
  }

  update(_dt, time) {
    material().uniforms.uTime.value = time;
  }

  dispose() {
    this._unsubscribe();
    this.scene.remove(this.mesh);
    this.geometry.dispose();
  }
}
