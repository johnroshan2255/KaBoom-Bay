/**
 * Graphics quality tiers. Picked once at boot (URL `?quality=low|medium|high`, then the tier saved by a
 * previous auto-downgrade, then a device heuristic) and lowered at runtime by Match when the frame rate
 * stays poor. Everything that costs GPU time reads its budget from here.
 */
const TIERS = ["low", "medium", "high"];
const KEY = "kaboom.quality";

/**
 * `pixelBudget` is the render target size in megapixels: the pixel ratio is whatever fills that budget on the
 * current screen (capped at the device's own ratio). A phone's small, dense screen therefore renders at 2-3x
 * and stays crisp, while a 1080p desktop lands at ~1.5x on high; the GPU cost is the same either way.
 */
const SETTINGS = {
  high:   { pixelBudget: 4.5, antialias: true,  shadows: true,  shadowMapSize: 2048, cloudShadows: true,  waterSegments: 80, waterDetail: true,  mistPuffs: 16, explosionLight: true,  smokeScale: 1,   embers: 34, decals: true,  waterfall: true },
  medium: { pixelBudget: 2.6, antialias: false, shadows: true,  shadowMapSize: 1024, cloudShadows: false, waterSegments: 40, waterDetail: true,  mistPuffs: 10, explosionLight: true,  smokeScale: 0.6, embers: 20, decals: true,  waterfall: true },
  low:    { pixelBudget: 1.3, antialias: false, shadows: false, shadowMapSize: 512,  cloudShadows: false, waterSegments: 24, waterDetail: false, mistPuffs: 6,  explosionLight: false, smokeScale: 0.4, embers: 12, decals: false, waterfall: true },
};

/** Pixel ratio that spends the current tier's budget on a `width` x `height` CSS-pixel viewport. */
export function pixelRatioFor(width = window.innerWidth, height = window.innerHeight) {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.sqrt((quality.settings.pixelBudget * 1e6) / Math.max(1, width * height));
  return Math.max(0.6, Math.min(dpr, fit));
}

/** Returns [tier, locked]. A tier forced through the URL is never auto-downgraded. */
function detect() {
  try {
    const url = new URLSearchParams(location.search).get("quality");
    if (TIERS.includes(url)) return [url, true];
    const saved = localStorage.getItem(KEY);
    if (TIERS.includes(saved)) return [saved, false];
  } catch { /* no storage */ }
  return [detectFromDevice(), false];
}

function detectFromDevice() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 8; // GB, Chromium only
  if (coarse && (cores <= 4 || memory <= 3)) return "low";
  if (coarse || cores <= 4 || memory <= 4) return "medium";
  return "high";
}

class Quality {
  constructor() {
    [this.tier, this.locked] = detect();
    this.listeners = new Set();
  }
  get settings() { return SETTINGS[this.tier]; }
  get isLowest() { return this.tier === "low"; }
  /** Called with the new tier whenever it changes at runtime. Returns an unsubscribe function. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(tier) {
    if (!TIERS.includes(tier) || tier === this.tier) return;
    this.tier = tier;
    try { localStorage.setItem(KEY, tier); } catch { /* private mode */ }
    for (const fn of this.listeners) fn(tier);
  }
  /** One tier down; returns false when already at the bottom. */
  downgrade() {
    const i = TIERS.indexOf(this.tier);
    if (i === 0 || this.locked) return false;
    console.info(`[KaBoom Bay] frame rate low, switching graphics to "${TIERS[i - 1]}"`);
    this.set(TIERS[i - 1]);
    return true;
  }
}

export const quality = new Quality();

/**
 * Watches the frame interval and downgrades the tier when the game runs below ~34 fps for a few seconds.
 * Call `sample(dt)` once per frame. The first seconds after a start are ignored (shader compiles, loading).
 */
export class FrameGovernor {
  constructor({ warmup = 6, window = 3, threshold = 1 / 34 } = {}) {
    this.warmup = warmup;
    this.window = window;
    this.threshold = threshold;
    this.elapsed = 0;
    this.slowFor = 0;
    this.ema = 1 / 60;
  }
  sample(dt) {
    if (quality.locked || quality.isLowest || document.hidden || dt <= 0) return;
    this.elapsed += dt;
    this.ema += (Math.min(dt, 0.25) - this.ema) * 0.1;
    if (this.elapsed < this.warmup) return;
    this.slowFor = this.ema > this.threshold ? this.slowFor + dt : 0;
    if (this.slowFor >= this.window) {
      this.slowFor = 0;
      this.elapsed = 0; // give the new tier a warmup before judging again
      quality.downgrade();
    }
  }
}
