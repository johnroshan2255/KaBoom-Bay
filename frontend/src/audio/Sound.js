/**
 * All game audio is synthesized with WebAudio at runtime: zero download, PEGI-friendly cartoon
 * sounds, and no asset pipeline. The context is created lazily on the first user gesture
 * (browser autoplay rules). `sound.play(name)` is safe to call before that - it's a no-op.
 */
class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = this._load();
    this.ambient = null;
    this._unlock = () => this.unlock();
    window.addEventListener("pointerdown", this._unlock, { once: true });
    window.addEventListener("keydown", this._unlock, { once: true });
  }

  _load() {
    try { return localStorage.getItem("kaboom.sound") !== "off"; } catch { return true; }
  }

  unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  /** Silence during ads without changing the player's preference. */
  duck(on) {
    if (this.master) this.master.gain.setTargetAtTime(on ? 0 : (this.enabled ? 0.8 : 0), this.ctx.currentTime, 0.05);
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem("kaboom.sound", on ? "on" : "off"); } catch { /* private mode */ }
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  // ---------- building blocks ----------

  _noise(duration) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  _env(gainNode, t0, attack, decay, peak = 1) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _tone(type, f0, f1, duration, peak = 0.4, when = 0) {
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + duration);
    const g = ctx.createGain();
    this._env(g, t0, 0.005, duration, peak);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _burst(duration, filterType, freq, peak = 0.5, when = 0, q = 1) {
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const src = this._noise(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t0, 0.005, duration, peak);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    return filter;
  }

  _startAmbient() {
    // soft surf: looping filtered noise with a slow swell
    const ctx = this.ctx;
    const src = this._noise(4);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.ambient = { src, lfo };
  }

  // ---------- named sounds ----------

  play(name, { volume = 1 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const v = volume;
    switch (name) {
      case "throw": {
        const f = this._burst(0.35, "bandpass", 900, 0.35 * v, 0, 0.8);
        f.frequency.exponentialRampToValueAtTime(2200, this.ctx.currentTime + 0.3);
        break;
      }
      case "boom": {
        this._tone("sine", 160, 35, 0.6, 0.9 * v);
        this._burst(0.7, "lowpass", 900, 0.8 * v);
        this._burst(0.25, "highpass", 2500, 0.25 * v);
        break;
      }
      case "tick": this._tone("square", 1800, 1200, 0.05, 0.12 * v); break;
      case "coin": this._tone("square", 988, 988, 0.08, 0.2 * v); this._tone("square", 1319, 1319, 0.16, 0.2 * v, 0.08); break;
      case "penalty": this._tone("sawtooth", 300, 90, 0.4, 0.25 * v); break;
      case "splash": { const f = this._burst(0.5, "lowpass", 1400, 0.4 * v); f.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.45); break; }
      case "clash": this._tone("triangle", 2400, 1600, 0.12, 0.3 * v); this._burst(0.08, "highpass", 4000, 0.2 * v); break;
      case "place": this._tone("triangle", 220, 140, 0.12, 0.35 * v); this._burst(0.06, "lowpass", 800, 0.2 * v); break;
      case "remove": this._tone("triangle", 140, 220, 0.12, 0.3 * v); break;
      case "error": this._tone("square", 200, 160, 0.12, 0.15 * v); break;
      case "click": this._tone("square", 700, 500, 0.05, 0.15 * v); break;
      case "grab": this._tone("triangle", 400, 800, 0.1, 0.3 * v); break;
      case "phase": this._tone("square", 523, 523, 0.12, 0.25 * v); this._tone("square", 659, 659, 0.12, 0.25 * v, 0.13); this._tone("square", 784, 784, 0.25, 0.25 * v, 0.26); break;
      case "win": for (let i = 0; i < 5; i++) this._tone("square", [523, 659, 784, 1047, 1319][i], [523, 659, 784, 1047, 1319][i], 0.18, 0.25 * v, i * 0.12); break;
      case "lose": this._tone("sawtooth", 400, 200, 0.5, 0.2 * v); this._tone("sawtooth", 300, 150, 0.6, 0.2 * v, 0.2); break;
    }
  }
}

export const sound = new Sound();
