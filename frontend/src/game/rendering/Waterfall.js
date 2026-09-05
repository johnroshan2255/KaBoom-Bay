import * as THREE from "three";
import { WATER_LEVEL } from "@kaboom-bay/shared";
import { theme } from "./theme.js";

let sharedMaterial = null;
function material() {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0.62, 0.9, 1.0) }, uColorB: { value: new THREE.Color(1, 1, 1) }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        // scrolling soft bands + a thin bright rim at each side, fading in at the top and frothing at the bottom
        float bands = 0.55 + 0.45 * sin((vUv.y * 9.0 - uTime * 2.2 + sin(vUv.x * 12.0) * 0.4) * 6.2831);
        float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float rim = 1.0 - side;
        float froth = smoothstep(0.35, 0.0, vUv.y) * (0.5 + 0.5 * sin(uTime * 7.0 + vUv.x * 20.0));
        vec3 col = mix(uColorA, uColorB, bands * 0.5 + rim * 0.6 + froth);
        float alpha = (0.55 + 0.35 * bands) * smoothstep(1.0, 0.9, vUv.y) * side + rim * 0.5 + froth * 0.4;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
        #include <fog_fragment>
      }`,
  });
  return sharedMaterial;
}

/**
 * A spring on the plateau cliff, a stream across the beach and a waterfall off the rim into the sea:
 * three quads and a splash disc, one shared animated shader across all islands. On the volcano the same
 * sheets carry lava (the theme's waterfall colours).
 */
export class Waterfall {
  constructor(scene, { origin, spot }) {
    this.scene = scene;
    const mat = material();
    const wf = theme().waterfall ?? { a: [0.62, 0.9, 1.0], b: [1, 1, 1], splash: 0xeaf9ff };
    mat.uniforms.uColorA.value.setRGB(...wf.a);
    mat.uniforms.uColorB.value.setRGB(...wf.b);
    const dir = new THREE.Vector3(Math.cos(spot.angle), 0, Math.sin(spot.angle));
    // spring on the cliff: a short sheet from the grass edge down onto the sand
    const cliffTop = origin.y + spot.y + 1 + 0.05, sandTop = origin.y + 5 + 0.04;
    const cx = origin.x + spot.x + 0.5 + dir.x * 0.52, cz = origin.z + spot.z + 0.5 + dir.z * 0.52;
    this.spring = new THREE.Mesh(new THREE.PlaneGeometry(1.1, cliffTop - sandTop + 0.2), mat);
    this.spring.position.set(cx, (cliffTop + sandTop) / 2, cz);
    this.spring.rotation.y = -spot.angle + Math.PI / 2;
    // stream across the beach to the rim, lying on the sand
    const rx = origin.x + spot.rimX + 0.5 + dir.x * 0.5, rz = origin.z + spot.rimZ + 0.5 + dir.z * 0.5;
    const len = Math.hypot(rx - cx, rz - cz);
    this.stream = new THREE.Mesh(new THREE.PlaneGeometry(1.0, Math.max(0.5, len)), mat);
    this.stream.position.set((cx + rx) / 2, sandTop, (cz + rz) / 2);
    this.stream.rotation.set(-Math.PI / 2, 0, -spot.angle + Math.PI / 2, "YXZ");
    // the fall: from the rim down into the sea
    const height = sandTop - WATER_LEVEL + 0.4;
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.4, height), mat);
    this.sheet.position.set(rx + dir.x * 0.15, sandTop - height / 2 + 0.1, rz + dir.z * 0.15);
    this.sheet.rotation.y = -spot.angle + Math.PI / 2;
    this.splash = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), new THREE.MeshBasicMaterial({ color: wf.splash, transparent: true, opacity: 0.55, depthWrite: false }));
    this.splash.rotation.x = -Math.PI / 2;
    this.splash.position.set(rx + dir.x * 0.6, WATER_LEVEL + 0.06, rz + dir.z * 0.6);
    for (const m of [this.spring, this.stream, this.sheet, this.splash]) { m.renderOrder = 3; scene.add(m); }
  }

  update(_dt, time) {
    material().uniforms.uTime.value = time;
    this.splash.scale.setScalar(1 + Math.sin(time * 3) * 0.06);
  }

  dispose() {
    for (const m of [this.spring, this.stream, this.sheet, this.splash]) { this.scene.remove(m); m.geometry.dispose(); }
    this.splash.material.dispose();
  }
}
