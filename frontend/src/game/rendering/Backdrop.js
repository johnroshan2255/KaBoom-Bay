import * as THREE from "three";
import { mulberry32 } from "@kaboom-bay/shared";
import { theme } from "./theme.js";

/**
 * Far scenery that sells a map at a glance and costs a handful of draw calls: a starfield with a ringed
 * planet in space, a smoking volcano cone on the horizon, icebergs around the ice floe. The island bay has
 * none (its clouds and mist carry the look). Everything sits well outside the play area.
 */
export class Backdrop {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.disposables = [];
    this.spin = [];
    const kind = theme().backdrop;
    if (kind === "space") this._space();
    else if (kind === "volcano") this._volcano();
    else if (kind === "ice") this._ice();
  }

  _add(mesh) { this.scene.add(mesh); this.objects.push(mesh); this.disposables.push(mesh.geometry, mesh.material); return mesh; }

  _space() {
    // twinkling stars on a far dome: one Points draw, per-star size / phase, unlit, ignores the fog
    const rand = mulberry32(77);
    const n = 1600;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 440 + rand() * 40;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * r; pos[i * 3 + 1] = Math.abs(u) * r * 0.95 - 40; pos[i * 3 + 2] = Math.sin(a) * s * r;
      const big = rand() < 0.08;
      c.setHSL(rand() < 0.7 ? 0.58 + rand() * 0.1 : rand() * 0.15, 0.35, big ? 0.95 : 0.7 + rand() * 0.3);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = big ? 3.2 + rand() * 1.6 : 1.2 + rand() * 1.4;
      phase[i] = rand() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: window.devicePixelRatio || 1 } },
      transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uScale; varying vec3 vColor; varying float vTwinkle;
        void main() { vColor = color; vTwinkle = 0.65 + 0.35 * sin(uTime * (1.5 + aPhase) + aPhase * 7.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale * (0.8 + 0.4 * vTwinkle); }`,
      fragmentShader: `varying vec3 vColor; varying float vTwinkle;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor, vTwinkle * smoothstep(0.5, 0.15, d)); }`,
      vertexColors: true,
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false;
    this._add(stars);
    this.spin.push({ mesh: stars, rate: 0.003 });

    // nebulae: soft additive sprites in magenta, blue and teal, far out on the dome
    const nebula = new THREE.CanvasTexture((() => { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d"); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.4, "rgba(255,255,255,.18)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return cv; })());
    this.disposables.push(nebula);
    for (const [x, y, z, sc, color] of [[-300, 120, -260, 420, 0x7a3ad8], [280, 60, -320, 360, 0x2a6ae0], [60, 200, 380, 300, 0xd83aa8], [-360, 40, 200, 260, 0x2ab8b0]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebula, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(x, y, z); sp.scale.setScalar(sc);
      this.scene.add(sp); this.objects.push(sp); this.disposables.push(sp.material);
    }

    // a ringed gas giant, a small blue world and a moon
    const planet = this._add(new THREE.Mesh(new THREE.SphereGeometry(70, 28, 20), new THREE.MeshLambertMaterial({ color: 0xb06ad0, emissive: 0x2a1450, fog: false })));
    planet.position.set(-260, 110, -340);
    const ring = this._add(new THREE.Mesh(new THREE.RingGeometry(92, 130, 56), new THREE.MeshBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: false })));
    ring.position.copy(planet.position); ring.rotation.set(1.2, 0.35, 0.2);
    const blue = this._add(new THREE.Mesh(new THREE.SphereGeometry(22, 20, 14), new THREE.MeshLambertMaterial({ color: 0x3a8ae0, emissive: 0x0a2a60, fog: false })));
    blue.position.set(300, 150, -280);
    const moon = this._add(new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), new THREE.MeshLambertMaterial({ color: 0xd8d0f0, fog: false })));
    moon.position.set(330, 120, -240);

    // asteroid belt drifting slowly around the bay
    const rocks = 48;
    this.belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8a8898, flatShading: true }), rocks);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
    for (let i = 0; i < rocks; i++) {
      const a = rand() * Math.PI * 2, r = 150 + rand() * 120, y = -15 + rand() * 70, sz = 1.5 + rand() * 5.5;
      v.set(Math.cos(a) * r, y, Math.sin(a) * r);
      q.setFromEuler(e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28));
      sv.set(sz, sz * (0.6 + rand() * 0.6), sz * (0.6 + rand() * 0.8));
      this.belt.setMatrixAt(i, m.compose(v, q, sv));
    }
    this.belt.frustumCulled = false;
    this._add(this.belt);
    this.spin.push({ mesh: this.belt, rate: 0.012 });

    // shooting stars: one streak at a time, launched every few seconds
    this.streak = this._add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })));
    this.streak.visible = false;
    this.streakState = { next: 2 + rand() * 3, age: 0, life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), rand };
  }

  _updateStreak(dt, time) {
    const s = this.streakState;
    if (!s) return;
    if (!this.streak.visible) {
      s.next -= dt;
      if (s.next > 0) return;
      const a = s.rand() * Math.PI * 2;
      s.from.set(Math.cos(a) * 380, 120 + s.rand() * 160, Math.sin(a) * 380);
      s.dir.set(-Math.sin(a) + (s.rand() - 0.5), -0.35 - s.rand() * 0.3, Math.cos(a) + (s.rand() - 0.5)).normalize();
      s.age = 0; s.life = 0.9 + s.rand() * 0.5;
      this.streak.visible = true;
    }
    s.age += dt;
    const t = s.age / s.life;
    if (t >= 1) { this.streak.visible = false; s.next = 3 + s.rand() * 5; return; }
    this.streak.position.copy(s.from).addScaledVector(s.dir, t * 260);
    this.streak.lookAt(this.streak.position.clone().add(s.dir));
    this.streak.scale.set(0.5, 0.5, 26);
    this.streak.material.opacity = Math.sin(t * Math.PI) * 0.9;
  }

  _volcano() {
    // the big cone on the horizon with a glowing crater and a smoke column
    const cone = this._add(new THREE.Mesh(new THREE.ConeGeometry(120, 150, 9), new THREE.MeshLambertMaterial({ color: 0x2a2226, flatShading: true })));
    cone.position.set(40, 60, -330);
    const glow = this._add(new THREE.Mesh(new THREE.CylinderGeometry(14, 22, 8, 9), new THREE.MeshBasicMaterial({ color: 0xff6a12, toneMapped: false })));
    glow.position.set(40, 132, -330);
    const smoke = new THREE.MeshLambertMaterial({ color: 0x4a3a3e, transparent: true, opacity: 0.8, flatShading: true });
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    this.disposables.push(puffGeo, smoke);
    this.puffs = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(puffGeo, smoke);
      m.position.set(40 + (i - 2.5) * 6, 150 + i * 16, -330 - i * 5);
      m.scale.setScalar(16 + i * 5);
      this.scene.add(m); this.objects.push(m);
      this.puffs.push({ mesh: m, phase: i * 1.3 });
    }
    // smaller companion cones so the horizon isn't one lonely triangle
    for (const [x, z, r, h] of [[-260, -240, 60, 70], [300, -150, 50, 60], [-320, 120, 45, 50]]) {
      const c = this._add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshLambertMaterial({ color: 0x33292c, flatShading: true })));
      c.position.set(x, h / 2 - 8, z);
    }
  }

  _ice() {
    // icebergs: stacked flat-shaded blocks drifting far out on the frozen sea
    const rand = mulberry32(31);
    const mat = new THREE.MeshLambertMaterial({ color: 0xeaf7ff, flatShading: true });
    this.disposables.push(mat);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.5, d = 190 + rand() * 120;
      const g = new THREE.Group();
      const parts = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < parts; p++) {
        const w = 14 + rand() * 22, h = 6 + rand() * 14, dd = 12 + rand() * 18;
        const geo = new THREE.BoxGeometry(w, h, dd);
        this.disposables.push(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set((rand() - 0.5) * 16, h / 2 - 1 + p * 3, (rand() - 0.5) * 12);
        m.rotation.y = rand() * 0.6;
        g.add(m);
      }
      g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      this.scene.add(g); this.objects.push(g);
    }
  }

  update(dt, time) {
    for (const s of this.spin) s.mesh.rotation.y += s.rate * dt;
    if (this.starMat) this.starMat.uniforms.uTime.value = time;
    this._updateStreak(dt, time);
    if (this.puffs) for (const p of this.puffs) { const k = 1 + Math.sin(time * 0.5 + p.phase) * 0.08; p.mesh.scale.setScalar(p.mesh.userData.base ??= p.mesh.scale.x); p.mesh.scale.multiplyScalar(k); }
  }

  dispose() {
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose?.();
    this.objects.length = 0;
  }
}
