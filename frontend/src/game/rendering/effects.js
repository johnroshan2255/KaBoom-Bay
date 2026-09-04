import * as THREE from "three";
import { GRAVITY, WATER_LEVEL } from "@kaboom-bay/shared";
import { blockColor } from "./palette.js";
import { quality } from "./quality.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c2 = new THREE.Color();
const _dark = new THREE.Color(0x3a1a10);
const _orange = new THREE.Color(0xff6a12);
const _ember = new THREE.Color(0x5a1e14);

/**
 * Cartoon destruction feedback, all client-side and PEGI-12 friendly:
 * tumbling voxel debris, white smoke puffs and a splash for bombs that hit the sea.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    this.maxDebris = 320;
    this.debris = [];
    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      this.maxDebris,
    );
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    scene.add(this.debrisMesh);

    this.puffGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.puffs = [];

    // glowing embers (fire) - unlit so they read as hot
    this.maxEmbers = 400;
    this.embers = [];
    this.emberMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      this.maxEmbers,
    );
    this.emberMesh.frustumCulled = false;
    this.emberMesh.count = 0;
    scene.add(this.emberMesh);
    // Per-instance colour buffers exist from the start: they change the shader variant, and creating
    // them lazily on the first blast would compile a second program mid-match.
    const white = new THREE.Color(0xffffff);
    this.debrisMesh.setColorAt(0, white);
    this.emberMesh.setColorAt(0, white);

    this.fireballs = [];
    this.rings = [];
    this.ringGeometry = new THREE.RingGeometry(0.75, 1, 40);

    // One persistent flash light, reused by every explosion. three.js bakes the number of *visible*
    // lights into every lit shader, so the light stays visible at intensity 0 when idle: a constant light
    // count means the shaders compile once. The lowest tier leaves the light out of the scene entirely.
    this.flash = new THREE.PointLight(0xffb060, 0, 30, 2);
    this.flashLife = 0;
    if (quality.settings.explosionLight) scene.add(this.flash);
    this._unsubscribe = quality.onChange(() => { if (!quality.settings.explosionLight) { this.scene.remove(this.flash); this.flash.intensity = 0; } });
  }

  /**
   * Compiles every effect shader once up front so the first explosion doesn't stall the frame.
   * three.js frees a shader program when the last material using it is disposed, so one hidden "anchor"
   * mesh per material variant stays in the scene for the effect's lifetime: puffs come and go, the
   * programs stay resident. `extra` objects (bomb views, aim preview) are compiled and hidden the same way.
   */
  prewarm(renderer, camera, extra = []) {
    const far = new THREE.Vector3(0, -50, 0);
    this.anchors = new THREE.Group();
    this.anchors.position.copy(far);
    this.anchors.scale.setScalar(0.001);
    for (const m of [
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, flatShading: true }), // smoke
      new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 1, toneMapped: false }), // fireball
      new THREE.MeshBasicMaterial({ color: 0xfffbe6, toneMapped: false }), // fireball core
      new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), // shockwave ring
    ]) this.anchors.add(new THREE.Mesh(this.puffGeometry, m));
    this.scene.add(this.anchors);
    for (const o of extra) this.scene.add(o);
    this.burstCell(far, 1); // one debris cube so the instanced debris (and its shadow variant) compiles now
    renderer.compile(this.scene, camera);
    // compile() skips the shadow pass; one real frame compiles the depth variants of every caster too
    for (const o of [this.anchors, ...extra]) o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    renderer.render(this.scene, camera);
    this.anchors.visible = false;
    for (const o of extra) o.visible = false;
  }

  _flash(center, intensity, distance, life) {
    if (!quality.settings.explosionLight || !this.flash.parent) return;
    this.flash.position.copy(center).add(new THREE.Vector3(0, 1.5, 0));
    this.flash.intensity = intensity;
    this.flash.distance = distance;
    this.flashLife = life;
  }

  /** Cartoon blast: flash, fireball, embers, shockwave ring, dark smoke turning grey. */
  explosion(center, radius = 3) {
    this._flash(center, 70, radius * 8, 0.35);

    const ball = new THREE.Mesh(this.puffGeometry, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 1, toneMapped: false }));
    ball.position.copy(center).add(new THREE.Vector3(0, 0.6, 0));
    ball.scale.setScalar(radius * 0.3);
    const core = new THREE.Mesh(this.puffGeometry, new THREE.MeshBasicMaterial({ color: 0xfffbe6, toneMapped: false }));
    core.scale.setScalar(0.55);
    ball.add(core);
    this.scene.add(ball);
    this.fireballs.push({ mesh: ball, age: 0, life: 0.7, radius });

    const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center).add(new THREE.Vector3(0, 0.25, 0));
    ring.scale.setScalar(radius * 0.4);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, age: 0, life: 0.5, radius });

    for (let i = 0; i < quality.settings.embers; i++) {
      if (this.embers.length >= this.maxEmbers) break;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      const speed = 5 + Math.random() * 9;
      this.embers.push({
        pos: center.clone().add(new THREE.Vector3(0, 0.5, 0)),
        vel: dir.multiplyScalar(speed),
        age: 0,
        life: 0.5 + Math.random() * 0.6,
        color: new THREE.Color().setHex([0xffe066, 0xffa030, 0xff6a2a, 0xffd23f][i % 4]),
      });
    }

    // dark smoke first, lighter puffs rising behind it
    const k = quality.settings.smokeScale;
    this.smoke(center.clone().add(new THREE.Vector3(0, 0.8, 0)), radius * 0.9, Math.max(2, Math.round(8 * k)), 0x3f3f47, { rise: 5, life: 1.5, delay: 0.05 });
    this.smoke(center.clone().add(new THREE.Vector3(0, 1.6, 0)), radius * 1.1, Math.max(2, Math.round(8 * k)), 0x9a9aa6, { rise: 3.5, life: 1.9, delay: 0.25 });
  }

  /** Two bombs hit in mid-air: short bright spray. */
  sparks(center) {
    for (let i = 0; i < 14; i++) {
      if (this.embers.length >= this.maxEmbers) break;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
      this.embers.push({ pos: center.clone(), vel: dir.multiplyScalar(4 + Math.random() * 6), age: 0, life: 0.35 + Math.random() * 0.3, color: new THREE.Color(i % 3 ? 0xfff6c0 : 0xffd23f) });
    }
    this._flash(center, 25, 10, 0.2);
  }

  /** One tumbling cube for a single destroyed voxel (online matches learn about damage cell by cell). */
  burstCell(pos, block) {
    if (this.debris.length >= this.maxDebris) return;
    this.debris.push({
      pos: pos.clone(),
      vel: new THREE.Vector3((Math.random() - 0.5) * 9, 6 + Math.random() * 7, (Math.random() - 0.5) * 9),
      rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
      life: 1.2 + Math.random() * 0.6,
      age: 0,
      color: blockColor(block),
    });
  }

  /** Spawn tumbling cubes for a subset of the removed blocks. */
  burst(center, removedBlocks, grid, origin) {
    const stride = Math.max(1, Math.ceil(removedBlocks.length / 40));
    for (let i = 0; i < removedBlocks.length; i += stride) {
      if (this.debris.length >= this.maxDebris) break;
      const { index, block } = removedBlocks[i];
      const [x, y, z] = grid.coords(index);
      const pos = new THREE.Vector3(origin.x + x + 0.5, origin.y + y + 0.5, origin.z + z + 0.5);
      const dir = pos.clone().sub(center);
      const dist = Math.max(0.5, dir.length());
      dir.normalize();
      const speed = 6 + 10 / dist + Math.random() * 3;
      this.debris.push({
        pos,
        vel: new THREE.Vector3(dir.x * speed, Math.abs(dir.y) * speed + 5 + Math.random() * 4, dir.z * speed),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
        life: 1.4 + Math.random() * 0.6,
        age: 0,
        color: blockColor(block),
      });
    }
  }

  dispose() {
    this._unsubscribe();
    for (const f of this.fireballs) { this.scene.remove(f.mesh); f.mesh.material.dispose(); }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const p of this.puffs) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this.scene.remove(this.debrisMesh, this.emberMesh, this.flash);
    if (this.anchors) { this.scene.remove(this.anchors); for (const m of this.anchors.children) m.material.dispose(); }
    this.debrisMesh.dispose(); this.emberMesh.dispose();
    this.puffGeometry.dispose(); this.ringGeometry.dispose();
  }

  smoke(center, radius, count = 9, color = 0xf4f4f4, { rise = 2, life = 1.1, delay = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        this.puffGeometry,
        new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.95, flatShading: true }),
      );
      const off = new THREE.Vector3((Math.random() - 0.5) * radius, Math.random() * radius * 0.6, (Math.random() - 0.5) * radius);
      mesh.position.copy(center).add(off);
      const size = radius * (0.35 + Math.random() * 0.4);
      mesh.scale.setScalar(0.001);
      mesh.visible = delay <= 0;
      this.scene.add(mesh);
      this.puffs.push({
        mesh,
        target: size,
        vel: new THREE.Vector3(off.x * 1.5, rise + Math.random() * 2, off.z * 1.5),
        age: -delay * Math.random(),
        life: life * (0.8 + Math.random() * 0.4),
      });
    }
  }

  splash(position) {
    const p = position.clone();
    p.y = WATER_LEVEL;
    this.smoke(p, 1.6, Math.max(2, Math.round(6 * quality.settings.smokeScale)), 0xcdf3ff);
  }

  update(dt) {
    // debris
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.age >= d.life || d.pos.y < WATER_LEVEL - 2) {
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.y += GRAVITY * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.rot.addScaledVector(d.spin, dt);
      const k = 1 - Math.pow(d.age / d.life, 3);
      _e.set(d.rot.x, d.rot.y, d.rot.z);
      _q.setFromEuler(_e);
      _s.setScalar(k);
      _m.compose(d.pos, _q, _s);
      this.debrisMesh.setMatrixAt(n, _m);
      this.debrisMesh.setColorAt(n, d.color);
      n++;
    }
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;

    // embers
    let e = 0;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const em = this.embers[i];
      em.age += dt;
      if (em.age >= em.life) { this.embers.splice(i, 1); continue; }
      em.vel.y += GRAVITY * 0.35 * dt;
      em.vel.multiplyScalar(1 - dt * 1.5);
      em.pos.addScaledVector(em.vel, dt);
      const k = 1 - em.age / em.life;
      _s.setScalar(0.4 + k);
      _q.identity();
      _m.compose(em.pos, _q, _s);
      this.emberMesh.setMatrixAt(e, _m);
      _c2.copy(em.color).lerp(_dark, 1 - k);
      this.emberMesh.setColorAt(e, _c2);
      e++;
    }
    this.emberMesh.count = e;
    this.emberMesh.instanceMatrix.needsUpdate = true;
    if (this.emberMesh.instanceColor) this.emberMesh.instanceColor.needsUpdate = true;

    // fireballs
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.fireballs.splice(i, 1); continue; }
      const grow = t < 0.35 ? t / 0.35 : 1;
      f.mesh.scale.setScalar(f.radius * (0.3 + 1.0 * grow) * (1 - Math.max(0, t - 0.6) * 1.2));
      f.mesh.material.color.setHex(0xffe14a).lerp(_orange, Math.min(1, t * 1.8)).lerp(_ember, Math.max(0, t - 0.45) * 1.8);
      f.mesh.material.opacity = 1 - Math.max(0, t - 0.5) * 2;
      f.mesh.rotation.y += dt * 3;
    }

    // shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); continue; }
      r.mesh.scale.setScalar(r.radius * (0.4 + 2.2 * t));
      r.mesh.material.opacity = 0.8 * (1 - t);
    }

    // flash light
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity *= Math.exp(-dt * 12);
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }

    // smoke
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age < 0) continue;
      p.mesh.visible = true;
      const t = p.age / p.life;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 3);
      const grow = Math.min(1, t * 4);
      p.mesh.scale.setScalar(p.target * (0.3 + 0.7 * grow) * (1 - t * 0.3));
      p.mesh.material.opacity = 0.95 * (1 - t * t);
    }
  }
}
