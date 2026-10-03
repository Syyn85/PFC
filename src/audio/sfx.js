import { safeStorage } from '../core/storage.js';

const SFX_VOLUME = 0.55;

/**
 * Effets sonores synthétisés en temps réel (Web Audio) : aucun fichier audio.
 * Possède le contexte audio, partagé avec la musique.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.output = null;
    this.muted = readFlag('pfc:muted');
    this.onUnlock = null;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  /** Doit être appelé suite à un geste utilisateur (politique autoplay). */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.output = this.ctx.createDynamicsCompressor();
      this.output.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : SFX_VOLUME;
      this.master.connect(this.output);
      this.noiseBuffer = this.#createNoise();
      this.onUnlock?.(this);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    writeFlag('pfc:muted', muted);
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : SFX_VOLUME, this.ctx.currentTime, 0.02);
    }
  }

  #createNoise() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  #ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  #tone({
    type = 'sine',
    freq = 440,
    to = null,
    start = 0,
    duration = 0.15,
    gain = 0.3,
    attack = 0.005,
  }) {
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  #noise({
    start = 0,
    duration = 0.2,
    gain = 0.3,
    freq = 1200,
    to = null,
    q = 1,
    type = 'bandpass',
  }) {
    const t = this.ctx.currentTime + start;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  click() {
    if (!this.#ready()) return;
    this.#tone({ type: 'triangle', freq: 880, to: 620, duration: 0.07, gain: 0.25 });
  }

  hover() {
    if (!this.#ready()) return;
    this.#tone({ type: 'sine', freq: 1320, duration: 0.04, gain: 0.06 });
  }

  whoosh() {
    if (!this.#ready()) return;
    this.#noise({ duration: 0.18, gain: 0.22, freq: 500, to: 2400, q: 1.2 });
  }

  thump(pitch = 1) {
    if (!this.#ready()) return;
    this.#tone({ type: 'sine', freq: 150 * pitch, to: 55, duration: 0.18, gain: 0.55 });
    this.#noise({ duration: 0.06, gain: 0.18, freq: 2500, type: 'highpass' });
  }

  impact() {
    if (!this.#ready()) return;
    this.#tone({ type: 'sine', freq: 190, to: 40, duration: 0.4, gain: 0.7 });
    this.#tone({ type: 'square', freq: 95, to: 50, duration: 0.15, gain: 0.12 });
    this.#noise({ duration: 0.45, gain: 0.35, freq: 3000, to: 400, q: 0.7 });
  }

  win() {
    if (!this.#ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.#tone({ type: 'square', freq: f, start: i * 0.08, duration: 0.22, gain: 0.12 }),
    );
    this.#tone({ type: 'triangle', freq: 1046.5, start: 0.32, duration: 0.5, gain: 0.2 });
  }

  lose() {
    if (!this.#ready()) return;
    [392, 349.23, 293.66].forEach((f, i) =>
      this.#tone({
        type: 'sawtooth',
        freq: f,
        to: f * 0.97,
        start: i * 0.14,
        duration: 0.3,
        gain: 0.08,
      }),
    );
    this.#tone({ type: 'triangle', freq: 220, to: 180, start: 0.42, duration: 0.6, gain: 0.18 });
  }

  draw() {
    if (!this.#ready()) return;
    this.#tone({ type: 'triangle', freq: 523.25, duration: 0.15, gain: 0.18 });
    this.#tone({ type: 'triangle', freq: 523.25, start: 0.14, duration: 0.25, gain: 0.15 });
  }

  coin(delay = 0) {
    if (!this.#ready()) return;
    this.#tone({ type: 'square', freq: 987.77, start: delay, duration: 0.08, gain: 0.08 });
    this.#tone({ type: 'square', freq: 1318.51, start: delay + 0.07, duration: 0.3, gain: 0.08 });
  }

  thunder() {
    if (!this.#ready()) return;
    this.#noise({ duration: 1.8, gain: 0.35, freq: 400, to: 60, q: 0.5, type: 'lowpass' });
    this.#noise({ start: 0.05, duration: 0.25, gain: 0.25, freq: 2500, type: 'highpass' });
  }

  shield() {
    if (!this.#ready()) return;
    this.#tone({ type: 'triangle', freq: 1567.98, to: 1400, duration: 0.6, gain: 0.18 });
    this.#tone({ type: 'sine', freq: 783.99, duration: 0.8, gain: 0.2 });
    this.#noise({ duration: 0.3, gain: 0.12, freq: 6000, type: 'highpass' });
  }

  boost() {
    if (!this.#ready()) return;
    this.#tone({ type: 'square', freq: 660, to: 1320, duration: 0.18, gain: 0.08 });
    this.#tone({ type: 'triangle', freq: 1320, start: 0.08, duration: 0.25, gain: 0.12 });
  }

  spy() {
    if (!this.#ready()) return;
    this.#noise({ duration: 0.5, gain: 0.12, freq: 300, to: 3000, q: 3 });
    [880, 1108.73, 1318.51].forEach((f, i) =>
      this.#tone({ type: 'sine', freq: f, start: 0.1 + i * 0.07, duration: 0.35, gain: 0.08 }),
    );
  }

  tick(urgent = false) {
    if (!this.#ready()) return;
    this.#tone({ type: 'square', freq: urgent ? 1760 : 1200, duration: 0.05, gain: 0.06 });
  }

  swoosh() {
    if (!this.#ready()) return;
    this.#noise({ duration: 0.45, gain: 0.25, freq: 2400, to: 300, q: 0.9 });
  }

  fanfare() {
    if (!this.#ready()) return;
    const notes = [523.25, 523.25, 523.25, 698.46, 880, 783.99, 1046.5];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.96];
    notes.forEach((f, i) =>
      this.#tone({
        type: 'square',
        freq: f,
        start: times[i],
        duration: i === 6 ? 0.8 : 0.16,
        gain: 0.11,
      }),
    );
    notes.forEach((f, i) =>
      this.#tone({ type: 'triangle', freq: f / 2, start: times[i], duration: 0.2, gain: 0.15 }),
    );
  }
}

export function readFlag(key) {
  try {
    return safeStorage()?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key, value) {
  try {
    safeStorage()?.setItem(key, value ? '1' : '0');
  } catch {
    /* stockage indisponible : la préférence reste en mémoire */
  }
}
