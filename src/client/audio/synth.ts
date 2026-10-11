/** Briques de synthèse Web Audio : tout le son du jeu est généré, aucun fichier audio. */

export const midiToFreq = (note: number) => 440 * 2 ** ((note - 69) / 12);

export interface ToneOptions {
  type?: OscillatorType;
  /** Fréquence d'arrivée (glissando). */
  to?: number;
  gain?: number;
  attack?: number;
  /** Vibrato : profondeur (Hz) et vitesse (Hz). */
  vibrato?: [number, number];
  /** Filtre passe-bas (Hz). */
  lowpass?: number;
}

/** Note synthétisée avec enveloppe, glissando et vibrato optionnels. */
export function tone(ctx: AudioContext, out: AudioNode, when: number, freq: number, duration: number, opts: ToneOptions = {}): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, when);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), when + duration);
  if (opts.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = opts.vibrato[1];
    depth.gain.value = opts.vibrato[0];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(when);
    lfo.stop(when + duration + 0.05);
  }
  const peak = opts.gain ?? 0.3;
  const attack = opts.attack ?? 0.008;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  let node: AudioNode = osc;
  if (opts.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.lowpass;
    node = osc.connect(filter);
  }
  node.connect(env).connect(out);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

/** Bruit blanc filtré : souffles, impacts, percussions. */
export function noise(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  duration: number,
  opts: { gain?: number; filter?: BiquadFilterType; freq?: number; to?: number; q?: number } = {},
): void {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 1000, when);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, when + duration);
  filter.Q.value = opts.q ?? 1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(opts.gain ?? 0.3, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(filter).connect(env).connect(out);
  src.start(when);
  src.stop(when + duration + 0.05);
}
