import { Rng, type MusicStyle } from '../../core';
import { midiToFreq, noise, tone } from './synth';

const STEPS = 16;
const BARS = 4;
const LOOKAHEAD = 0.12;

/**
 * Musique générée à partir du style du thème : une boucle de 4 mesures (basse, mélodie, percussions)
 * composée une fois à partir d'une graine, puis jouée par un séquenceur à anticipation.
 */
export class MusicPlayer {
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private melody: (number | null)[] = [];
  private bass: (number | null)[] = [];
  /**
   * Intensité (0 à 1), qui suit la hauteur atteinte : la boucle reste la même mais s'enrichit par couches
   * (charleston en croches, puis mélodie doublée à l'octave et basse plus active).
   */
  intensity = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly style: MusicStyle,
    seed: number,
  ) {
    this.compose(new Rng(seed));
  }

  start(): void {
    this.stop();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** Mélodie : promenade dans la gamme, phrases A A' B A pour qu'elle reste en tête. */
  private compose(rng: Rng): void {
    const { scale } = this.style;
    const degreeToMidi = (d: number) => this.style.root + 12 * Math.floor(d / scale.length) + scale[((d % scale.length) + scale.length) % scale.length];
    const phrase = (): (number | null)[] => {
      let d = scale.length + rng.int(0, 2);
      const notes: (number | null)[] = [];
      for (let i = 0; i < STEPS; i++) {
        if (i % 2 === 1 && rng.next() < 0.55) {
          notes.push(null);
          continue;
        }
        d += rng.pick([-2, -1, -1, 0, 1, 1, 2]);
        d = Math.max(scale.length - 2, Math.min(scale.length * 2 + 1, d));
        notes.push(rng.next() < 0.15 ? null : degreeToMidi(d));
      }
      return notes;
    };
    const a = phrase();
    const variant = a.map((n, i) => (i >= 12 ? (n === null ? null : n + scale[1]) : n));
    const b = phrase();
    this.melody = [...a, ...variant, ...b, ...a];
    // Basse : tonique et quinte (ou degré voisin) sur les temps forts.
    const roots = [0, 0, 3, 4].map((deg) => degreeToMidi(deg) - 24);
    this.bass = [];
    for (let bar = 0; bar < BARS; bar++) {
      for (let i = 0; i < STEPS; i++) this.bass.push(i % 8 === 0 ? roots[bar] : i % 8 === 4 && rng.next() < 0.6 ? roots[bar] + 7 : null);
    }
  }

  private schedule(): void {
    const stepDur = 60 / this.style.tempo / 4;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % (STEPS * BARS);
      this.nextTime += stepDur;
    }
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const { ctx, out } = this;
    const lead = this.melody[step];
    if (lead !== null) tone(ctx, out, t, midiToFreq(lead), stepDur * 1.8, { type: this.style.lead, gain: 0.07, lowpass: 2600 });
    const bass = this.bass[step];
    if (bass !== null) tone(ctx, out, t, midiToFreq(bass), stepDur * 3.5, { type: 'triangle', gain: 0.16 });
    if (this.intensity >= 0.66) {
      if (lead !== null) tone(ctx, out, t, midiToFreq(lead + 12), stepDur * 1.2, { type: 'sine', gain: 0.035 });
      const prev = this.bass[step - (step % 8)];
      if (bass === null && step % 4 === 2 && prev !== null && prev !== undefined) tone(ctx, out, t, midiToFreq(prev + 12), stepDur * 1.5, { type: 'triangle', gain: 0.08 });
    }
    const drum = this.style.drums[step % STEPS];
    if (this.intensity >= 0.33 && drum === '.' && step % 2 === 0) noise(ctx, out, t, 0.03, { filter: 'highpass', freq: 8000, gain: 0.035 });
    switch (drum) {
      case 'k':
        tone(ctx, out, t, 150, 0.18, { to: 45, gain: 0.32 });
        break;
      case 's':
        noise(ctx, out, t, 0.14, { freq: 1800, gain: 0.12, q: 0.8 });
        break;
      case 'h':
        noise(ctx, out, t, 0.04, { filter: 'highpass', freq: 7000, gain: 0.05 });
        break;
      case 't':
        tone(ctx, out, t, 320, 0.12, { to: 180, gain: 0.16 });
        noise(ctx, out, t, 0.03, { freq: 3000, gain: 0.05 });
        break;
    }
  }
}
