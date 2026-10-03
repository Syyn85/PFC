import { readFlag, writeFlag } from './sfx.js';
import { seededRandom } from '../core/random.js';

/**
 * Musique d'ambiance générée en temps réel : pentatonique de ré mineur façon
 * koto, nappes douces et basse, sur la grille Rém – Si♭ – Fa – Do.
 * En match, une rythmique légère s'ajoute (intensité 1).
 */

const BPM = 84;
const STEP = 60 / BPM / 2; // croches
const STEPS_PER_BAR = 8;
const LOOKAHEAD = 0.15;
const MUSIC_VOLUME = 0.3;

const CHORDS = [
  { bass: 38, pad: [62, 65, 69] }, // Rém
  { bass: 34, pad: [58, 62, 65] }, // Si♭
  { bass: 41, pad: [57, 60, 65] }, // Fa
  { bass: 36, pad: [55, 60, 64] }, // Do
];
const SCALE = [62, 65, 67, 69, 72, 74, 77]; // ré fa sol la do ré fa

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.muted = readFlag('pfc:music-muted');
    this.intensity = 0;
    this.gain = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.melody = [];
    this.rand = seededRandom(7);
  }

  /** Démarre la boucle (une fois le contexte audio débloqué). */
  start() {
    const { ctx, output } = this.sfx;
    if (!ctx || this.timer) return;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(output);
    this.gain.gain.setTargetAtTime(this.muted ? 0 : MUSIC_VOLUME, ctx.currentTime, 1.2);
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.#schedule(), 25);
  }

  setMuted(muted) {
    this.muted = muted;
    writeFlag('pfc:music-muted', muted);
    if (this.gain) {
      this.gain.gain.setTargetAtTime(muted ? 0 : MUSIC_VOLUME, this.sfx.ctx.currentTime, 0.3);
    }
  }

  setIntensity(level) {
    this.intensity = level;
  }

  #schedule() {
    const ctx = this.sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Après une longue pause (onglet masqué), on se recale au lieu de rattraper
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.#playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (STEPS_PER_BAR * CHORDS.length);
      this.nextTime += STEP;
    }
  }

  #playStep(step, time) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const beat = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    if (step === 0) this.#composeMelody();

    if (beat === 0) for (const note of chord.pad) this.#pad(freq(note), time, STEP * STEPS_PER_BAR);
    if (beat === 0 || beat === 4 || (beat === 6 && bar % 2 === 1)) {
      this.#bass(freq(chord.bass), time);
    }
    const note = this.melody[step];
    if (note) this.#pluck(freq(note), time);

    if (this.intensity > 0) {
      if (beat === 0 || beat === 4) this.#kick(time);
      if (beat % 2 === 1) this.#hat(time, beat === 3 || beat === 7 ? 0.05 : 0.03);
    }
  }

  /** Nouvelle phrase à chaque tour de grille : notes des accords sur les temps forts. */
  #composeMelody() {
    const r = this.rand;
    this.melody = [];
    let index = Math.floor(r() * SCALE.length);
    for (let step = 0; step < STEPS_PER_BAR * CHORDS.length; step++) {
      const beat = step % STEPS_PER_BAR;
      const chord = CHORDS[Math.floor(step / STEPS_PER_BAR)];
      const strong = beat === 0 || beat === 4;
      if (r() > (strong ? 0.75 : 0.38)) {
        this.melody.push(null);
        continue;
      }
      index = Math.max(0, Math.min(SCALE.length - 1, index + Math.round((r() - 0.5) * 3)));
      let note = SCALE[index];
      if (strong) {
        // Se poser sur la note de l'accord la plus proche
        note = chord.pad
          .map((n) => n + 12 * Math.round((note - n) / 12))
          .sort((a, b) => Math.abs(a - note) - Math.abs(b - note))[0];
      }
      this.melody.push(note);
    }
  }

  #envelope(time, attack, peak, decay) {
    const g = this.sfx.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    g.connect(this.gain);
    return g;
  }

  #osc(type, frequency, time, duration, destination, detune = 0) {
    const osc = this.sfx.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    osc.detune.value = detune;
    osc.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.1);
    return osc;
  }

  #pluck(frequency, time) {
    const ctx = this.sfx.ctx;
    const env = this.#envelope(time, 0.004, 0.16, 0.9);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, time);
    filter.frequency.exponentialRampToValueAtTime(700, time + 0.6);
    filter.connect(env);
    const osc = this.#osc('triangle', frequency, time, 1, filter);
    osc.frequency.setValueAtTime(frequency * 1.012, time);
    osc.frequency.exponentialRampToValueAtTime(frequency, time + 0.05);
    this.#osc('sine', frequency * 2, time, 0.4, this.#envelope(time, 0.003, 0.04, 0.3));
  }

  #pad(frequency, time, duration) {
    const ctx = this.sfx.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.03, time + 0.8);
    g.gain.setValueAtTime(0.03, time + duration - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.connect(g).connect(this.gain);
    this.#osc('triangle', frequency, time, duration + 0.4, filter, -7);
    this.#osc('triangle', frequency, time, duration + 0.4, filter, 7);
  }

  #bass(frequency, time) {
    this.#osc('sine', frequency, time, 0.5, this.#envelope(time, 0.01, 0.22, 0.45));
  }

  #kick(time) {
    const env = this.#envelope(time, 0.003, 0.3, 0.2);
    const osc = this.#osc('sine', 110, time, 0.25, env);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.18);
  }

  #hat(time, peak) {
    const ctx = this.sfx.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    src.connect(filter).connect(this.#envelope(time, 0.002, peak, 0.05));
    src.start(time, Math.random() * 0.5);
    src.stop(time + 0.1);
  }
}
