import * as THREE from "three";
import { WATER_LEVEL } from "@kaboom-bay/shared";

/**
 * Low-lying mist hugging an island's cliffs: a ring of soft camera-facing sprites that drift,
 * bob and breathe. Cheap enough for four islands on a phone, and reads as volumetric from
 * the game's fixed camera distance.
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

export class MistRing {
  constructor(scene, center, radius, { count = 20, seed = 1 } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.puffs = [];
    let r = seed >>> 0;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture(),
        color: 0xe6f8ff,
        transparent: true,
        opacity: 0.38 + rand() * 0.22,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const size = 7 + rand() * 6;
      sprite.scale.set(size, size * 0.7, 1);
      this.puffs.push({
        sprite,
        angle: (i / count) * Math.PI * 2 + rand() * 0.4,
        speed: (0.03 + rand() * 0.04) * (rand() < 0.5 ? 1 : -1),
        radius: radius - 1 + rand() * 4.5,
        y: WATER_LEVEL + 0.4 + rand() * 2.2,
        bob: rand() * Math.PI * 2,
        baseOpacity: mat.opacity,
      });
      this.group.add(sprite);
    }
    this.group.position.set(center.x, 0, center.z);
    scene.add(this.group);
  }

  update(dt, time) {
    for (const p of this.puffs) {
      p.angle += p.speed * dt;
      p.sprite.position.set(Math.cos(p.angle) * p.radius, p.y + Math.sin(time * 0.6 + p.bob) * 0.25, Math.sin(p.angle) * p.radius);
      p.sprite.material.opacity = p.baseOpacity * (0.8 + 0.2 * Math.sin(time * 0.4 + p.bob));
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const p of this.puffs) p.sprite.material.dispose();
  }
}
