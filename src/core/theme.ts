/**
 * Socle visuel d'un niveau : uniquement des données (aucune dépendance 3D).
 * Le client sait afficher n'importe quel thème ; un niveau ne fait que le décrire.
 */

export type HDR = [number, number, number];

/**
 * Thème visuel d'un niveau : tout ce qui change d'un niveau à l'autre (ciel, lumière, matériaux, décor, interface).
 * Les couleurs de gameplay (passage révélé, indice doré, pièges) restent identiques partout pour rester lisibles.
 * Les couleurs HDR (> 1) déclenchent la lueur (bloom).
 */
export interface Theme {
  sky: { top: number; mid: number; horizon: number; sun: number; stars?: boolean };
  sun: { color: number; intensity: number; dir: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  fog: { near: number; far: number };
  exposure: number;
  ground: { light: number; dark: number };
  paving: string;
  border: number;
  mountains: { color: number; shape: 'mesa' | 'peaks' };
  clouds: { color: number; emissive: number; intensity: number };
  stone: [string, string];
  top: string;
  trim: { color: number; emissive: number };
  door: { panel: number; frame: number; glyph: HDR };
  flame: HDR;
  particles: { color: HDR; size: number; count: number; motion: 'float' | 'snow' | 'embers' };
  pool: { color: number; emissive: number; glow?: boolean };
  vegetation: 'palms' | 'lush' | 'pines' | 'rocks' | 'crystals';
  foliage: { trunk: number; leaf: number };
  /** Dégradé des boutons de l'interface. */
  accent: [string, string];
  /** Musique générée pour ce thème (voir audio/music.ts). */
  music: MusicStyle;
}

export interface MusicStyle {
  /** Gamme, en demi-tons depuis la tonique. */
  scale: number[];
  /** Tonique (note MIDI). */
  root: number;
  tempo: number;
  lead: OscillatorType;
  /** Motif de percussions sur 16 pas : k = grosse caisse, s = caisse claire, h = charleston, t = darbouka, . = silence. */
  drums: string;
}

/** Thème de base (le temple des sables). */
export const BASE_THEME: Theme = {
  sky: { top: 0x3d63b8, mid: 0xf4a582, horizon: 0xffd7a3, sun: 0xfff1d0 },
  sun: { color: 0xffd6a5, intensity: 3.2, dir: [-0.72, 0.42, 0.55] },
  hemi: { sky: 0xa9c1ff, ground: 0xe39d68, intensity: 1.5 },
  fog: { near: 170, far: 520 },
  exposure: 0.95,
  ground: { light: 0xf0b878, dark: 0xd48a52 },
  paving: '#e9c48c',
  border: 0xc28a52,
  mountains: { color: 0xc8775a, shape: 'mesa' },
  clouds: { color: 0xffffff, emissive: 0xffc9a8, intensity: 0.35 },
  stone: ['#e3b071', '#d9a465'],
  top: '#f1d29c',
  trim: { color: 0xf2c14e, emissive: 0x5a3a00 },
  door: { panel: 0x16737a, frame: 0x2a1c14, glyph: [1.6, 1.05, 0.45] },
  flame: [3.2, 1.3, 0.25],
  particles: { color: [1.6, 1.25, 0.8], size: 0.35, count: 420, motion: 'float' },
  pool: { color: 0x2cc3d6, emissive: 0x0b4a63 },
  vegetation: 'palms',
  foliage: { trunk: 0x9a6a43, leaf: 0x3f9e4d },
  accent: ['#ffb13b', '#ff4f7b'],
  music: { scale: [0, 1, 4, 5, 7, 8, 10], root: 62, tempo: 100, lead: 'triangle', drums: 't..t..t.t..t.t..' },
};

/** Un thème ne déclare que ce qui diffère du thème de base. */
export function defineTheme(overrides: Partial<Theme> = {}): Theme {
  return { ...BASE_THEME, ...overrides };
}
