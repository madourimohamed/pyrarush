import { midiToFreq, noise, tone } from './synth';

/**
 * Effets sonores, volontairement cartoon. Chaque effet est une recette de synthèse.
 * Ajouter un effet = ajouter une entrée ; le jouer = audio.play('nom').
 */
type Recipe = (ctx: AudioContext, out: AudioNode, t: number) => void;

export const SFX = {
  /** Petit « boing » de saut. */
  jump: (ctx, out, t) => tone(ctx, out, t, 260, 0.18, { type: 'square', to: 620, gain: 0.07, lowpass: 2200 }),
  land: (ctx, out, t) => {
    tone(ctx, out, t, 140, 0.12, { to: 60, gain: 0.25 });
    noise(ctx, out, t, 0.08, { freq: 400, gain: 0.08 });
  },
  /** La porte s'ouvre : souffle de pierre. */
  door: (ctx, out, t) => {
    noise(ctx, out, t, 0.4, { filter: 'lowpass', freq: 300, to: 1500, gain: 0.18 });
    tone(ctx, out, t, 70, 0.4, { gain: 0.15 });
  },
  /** Passage trouvé : arpège brillant. */
  passage: (ctx, out, t) => {
    [72, 76, 79, 84, 88].forEach((n, i) => tone(ctx, out, t + i * 0.06, midiToFreq(n), 0.35, { type: 'triangle', gain: 0.14 }));
  },
  /** Mur : « toc » sourd. */
  wall: (ctx, out, t) => {
    tone(ctx, out, t, 180, 0.15, { to: 70, gain: 0.3 });
    noise(ctx, out, t, 0.06, { freq: 900, gain: 0.12 });
  },
  /** Scarabée : petit grésillement de pattes. */
  scarab: (ctx, out, t) => {
    for (let i = 0; i < 9; i++) tone(ctx, out, t + i * 0.035, 2400 + Math.random() * 1400, 0.03, { type: 'square', gain: 0.025 });
  },
  scarabExcited: (ctx, out, t) => {
    for (let i = 0; i < 16; i++) tone(ctx, out, t + i * 0.03, 2800 + Math.random() * 1800, 0.025, { type: 'square', gain: 0.03 });
    [84, 88, 91].forEach((n, i) => tone(ctx, out, t + 0.1 + i * 0.07, midiToFreq(n), 0.2, { type: 'sine', gain: 0.08 }));
  },
  /** Gant de boxe : ressort qui se détend. */
  spring: (ctx, out, t) => tone(ctx, out, t, 180, 0.35, { type: 'sine', to: 520, gain: 0.22, vibrato: [60, 28] }),
  /** Impact « POW ! ». */
  pow: (ctx, out, t) => {
    noise(ctx, out, t, 0.25, { filter: 'lowpass', freq: 2500, to: 200, gain: 0.45 });
    tone(ctx, out, t, 110, 0.25, { to: 45, gain: 0.45 });
  },
  /** Chute : sifflet à coulisse qui descend. */
  fall: (ctx, out, t) => tone(ctx, out, t, 1400, 0.8, { type: 'sine', to: 180, gain: 0.12, vibrato: [8, 7] }),
  /** Téléporteur : montée tourbillonnante. */
  teleport: (ctx, out, t) => {
    tone(ctx, out, t, 200, 0.55, { type: 'sawtooth', to: 1600, gain: 0.08, lowpass: 3000, vibrato: [40, 18] });
    tone(ctx, out, t + 0.05, 400, 0.5, { type: 'sine', to: 2400, gain: 0.08 });
  },
  /** Pari gagné : jackpot. */
  riskyWin: (ctx, out, t) => {
    [76, 79, 84, 79, 84, 88, 91].forEach((n, i) => tone(ctx, out, t + i * 0.07, midiToFreq(n), 0.25, { type: 'square', gain: 0.06, lowpass: 4000 }));
  },
  /** Pari perdu : trombone triste « wah wah wah waaah ». */
  riskyLose: (ctx, out, t) => {
    const notes = [58, 57, 56];
    notes.forEach((n, i) => tone(ctx, out, t + i * 0.32, midiToFreq(n), 0.3, { type: 'sawtooth', gain: 0.12, lowpass: 900 }));
    tone(ctx, out, t + 0.96, midiToFreq(55), 0.9, { type: 'sawtooth', to: midiToFreq(54), gain: 0.12, lowpass: 900, vibrato: [4, 6] });
  },
  victory: (ctx, out, t) => {
    [60, 64, 67, 72, 67, 72, 76, 79].forEach((n, i) => tone(ctx, out, t + i * 0.11, midiToFreq(n), 0.3, { type: 'square', gain: 0.07, lowpass: 3500 }));
    [72, 76, 79, 84].forEach((n) => tone(ctx, out, t + 0.95, midiToFreq(n), 1.4, { type: 'triangle', gain: 0.09 }));
  },
  unlock: (ctx, out, t) => {
    [79, 84, 88, 91, 96].forEach((n, i) => tone(ctx, out, t + i * 0.05, midiToFreq(n), 0.5, { type: 'sine', gain: 0.1 }));
  },
  /** Étoiles de la victoire : trois carillons de plus en plus aigus. */
  star1: (ctx, out, t) => [84, 91].forEach((n, i) => tone(ctx, out, t + i * 0.06, midiToFreq(n), 0.5, { type: 'triangle', gain: 0.12 })),
  star2: (ctx, out, t) => [88, 95].forEach((n, i) => tone(ctx, out, t + i * 0.06, midiToFreq(n), 0.5, { type: 'triangle', gain: 0.12 })),
  star3: (ctx, out, t) => [91, 98, 103].forEach((n, i) => tone(ctx, out, t + i * 0.06, midiToFreq(n), 0.7, { type: 'triangle', gain: 0.13 })),
  /** Dalle fragile qui se fend : craquement sec. */
  crack: (ctx, out, t) => {
    noise(ctx, out, t, 0.08, { freq: 2200, gain: 0.2 });
    noise(ctx, out, t + 0.09, 0.06, { freq: 1600, gain: 0.16 });
    tone(ctx, out, t, 300, 0.12, { to: 120, gain: 0.1 });
  },
  /** Dalle qui s'effondre : éboulement sourd. */
  crumble: (ctx, out, t) => {
    noise(ctx, out, t, 0.6, { filter: 'lowpass', freq: 900, to: 150, gain: 0.35 });
    tone(ctx, out, t, 90, 0.5, { to: 40, gain: 0.25 });
  },
  /** Coffre : grincement du couvercle puis étincelles. */
  chest: (ctx, out, t) => {
    tone(ctx, out, t, 220, 0.3, { type: 'sawtooth', to: 140, gain: 0.06, lowpass: 900, vibrato: [30, 12] });
    [84, 88, 91, 96].forEach((n, i) => tone(ctx, out, t + 0.25 + i * 0.05, midiToFreq(n), 0.4, { type: 'triangle', gain: 0.1 }));
  },
  /** Bonus utilisé : scintillement magique. */
  bonus: (ctx, out, t) => {
    tone(ctx, out, t, 500, 0.5, { type: 'sine', to: 1500, gain: 0.08, vibrato: [20, 10] });
    [79, 86, 91].forEach((n, i) => tone(ctx, out, t + 0.1 + i * 0.08, midiToFreq(n), 0.5, { type: 'triangle', gain: 0.08 }));
  },
  /** Le bouclier absorbe une chute : « dong » cristallin. */
  shield: (ctx, out, t) => {
    tone(ctx, out, t, midiToFreq(76), 0.9, { type: 'sine', gain: 0.18, vibrato: [5, 5] });
    tone(ctx, out, t, midiToFreq(88), 0.6, { type: 'triangle', gain: 0.08 });
    noise(ctx, out, t, 0.12, { freq: 3000, gain: 0.05 });
  },
  click: (ctx, out, t) => tone(ctx, out, t, 880, 0.06, { type: 'triangle', gain: 0.08 }),
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof SFX;
