/**
 * Socle visuel d'un niveau : uniquement des données (aucune dépendance 3D). Les thèmes eux-mêmes sont des fichiers
 * (content/themes/*.json, voir themeFile.ts).
 *
 * Un thème = une PALETTE (ciel, lumière, pierres, portes, interface, musique)
 *          + une liste de COMPOSANTS de décor (ce qu'on pose, et avec quelles options).
 * Le client possède un registre de composants (client/scene/components) : changer de design d'un niveau
 * à l'autre revient à changer cette liste, sans toucher au moteur ni aux autres niveaux.
 * Les couleurs HDR (> 1) déclenchent la lueur (bloom).
 */

import { choice, choices, color, cssColor, cssColors, defaultsOf, group, hdrColor, int, num, numbers, text, vector, type Schema } from './schema';

export type HDR = [number, number, number];

/**
 * Un composant de décor : son nom dans le registre (`use`), ses options, et un identifiant optionnel
 * (`id`) quand le même composant apparaît plusieurs fois (ex. plusieurs groupes de modèles « props »).
 */
export interface ComponentSpec {
  use: string;
  id?: string;
  [option: string]: unknown;
}

export interface Theme {
  sky: { top: number; mid: number; horizon: number; sun: number };
  sun: { color: number; intensity: number; dir: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  fog: { near: number; far: number };
  exposure: number;
  ground: { light: number; dark: number };
  paving: string;
  border: number;
  /** Pierres des parois (deux teintes alternées) et dalles des terrasses. */
  stone: [string, string];
  top: string;
  /** Métal des liserés, linteaux et ornements. */
  trim: { color: number; emissive: number };
  /** Portes : panneau, encadrement et hiéroglyphe lumineux (HDR). */
  door: { panel: number; frame: number; glyph: HDR };
  /** Dégradé des boutons de l'interface. */
  accent: [string, string];
  /** Musique générée pour ce thème (voir client/audio/music.ts). */
  music: MusicStyle;
  /** Gardiens qui surgissent des portes piégées (apparence seulement) ; chaque porte en reçoit un, toujours le même. */
  trapStyles: TrapStyle[];
  /** Décor, construit dans l'ordre de la liste. */
  components: ComponentSpec[];
}

/** Gardiens de piège disponibles (voir client/scene/guardians.ts). */
export type TrapStyle = 'glove' | 'mummy';

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

/**
 * Palette d'un thème (tout sauf les composants de décor) : type, valeur par défaut et limites de chaque réglage.
 * Les valeurs par défaut sont celles du Temple des Sables (niveau 1), d'après les maquettes.
 */
export const PALETTE_SCHEMA = {
  // Maquette : ciel bleu franc, horizon doré ; soleil de fin d'après-midi (ombres longues) ; ombres bleutées.
  sky: group({ top: color(0x2f6fd0), mid: color(0x8fbcea), horizon: color(0xffd9a6), sun: color(0xfff1cc) }),
  sun: group({
    color: color(0xffc47c),
    intensity: num(4.4, { min: 0, max: 10, step: 0.1 }),
    dir: vector([-0.62, 0.42, 0.66], { min: -1, max: 1, step: 0.01, help: 'Direction de la lumière (x, y, z)' }),
  }),
  hemi: group({ sky: color(0x8fb4f0), ground: color(0xa8764a), intensity: num(0.95, { min: 0, max: 5, step: 0.05 }) }),
  fog: group({ near: num(240, { min: 0 }), far: num(700, { min: 0 }) }),
  exposure: num(1.0, { min: 0.1, max: 3, step: 0.01 }),
  ground: group({ light: color(0xeeb46a), dark: color(0xc98446) }),
  paving: cssColor('#cf9c5c'),
  border: color(0xa8703c),
  stone: cssColors(['#d4924c', '#c88644']),
  top: cssColor('#dcae70'),
  trim: group({ color: color(0xf2b93b), emissive: color(0x5a3500) }),
  door: group({ panel: color(0x2e1d10), frame: color(0x1a0f07), glyph: hdrColor([1.9, 1.3, 0.35]) }),
  accent: cssColors(['#ffd84a', '#f59a00']),
  music: group({
    scale: numbers([0, 1, 4, 5, 7, 8, 10], { min: 0, max: 11, help: 'Gamme, en demi-tons depuis la tonique' }),
    root: int(62, { min: 24, max: 96, help: 'Tonique (note MIDI)' }),
    tempo: int(100, { min: 40, max: 220 }),
    lead: choice('triangle', ['sine', 'square', 'sawtooth', 'triangle']),
    drums: text('t..t..t.t..t.t..', { help: '16 pas : k grosse caisse, s caisse claire, h charleston, t darbouka, . silence' }),
  }),
  trapStyles: choices(['glove', 'mummy'], ['glove', 'mummy']),
} satisfies Schema;

/** Palette par défaut (Temple des Sables) : point de départ des thèmes qui n'en héritent pas d'un autre. */
export const BASE_PALETTE: Omit<Theme, 'components'> = defaultsOf(PALETTE_SCHEMA);

/** Surcharge d'un thème : chaque groupe (sky, sun, door…) peut n'être redéfini qu'en partie. */
export type ThemeOverrides = {
  [K in keyof Theme]?: Theme[K] extends readonly unknown[] ? Theme[K] : Theme[K] extends object ? Partial<Theme[K]> : Theme[K];
};

const isGroup = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Crée un thème à partir d'un thème de base en ne déclarant que ce qui change.
 * Fusion sur un niveau de profondeur : { sky: { top } } ne remplace que la couleur du haut du ciel.
 * La liste `components` est remplacée en entier : pour l'ajuster, voir editComponents.
 */
export function defineTheme(overrides: ThemeOverrides, base: Theme): Theme {
  const theme: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = theme[key];
    theme[key] = isGroup(value) && isGroup(current) ? { ...current, ...value } : value;
  }
  return theme as unknown as Theme;
}

/**
 * Ajuste une liste de composants sans la réécrire : options fusionnées par identifiant (`id`, sinon `use`),
 * `null` pour retirer un composant, et les noms absents de la liste sont ajoutés à la fin.
 *   editComponents(themes.sables.components, { banners: { cloth: '#7a2a2a' }, statues: null })
 */
export function editComponents(list: ComponentSpec[], edits: Record<string, Omit<ComponentSpec, 'use'> | null>): ComponentSpec[] {
  const key = (c: ComponentSpec) => c.id ?? c.use;
  const result = list.filter((c) => edits[key(c)] !== null).map((c) => (edits[key(c)] ? { ...c, ...edits[key(c)] } : c));
  for (const [name, options] of Object.entries(edits)) {
    // Nouvelle entrée : « use » peut être donné explicitement (avec un id), sinon c'est le nom de la clé.
    if (options && !list.some((c) => key(c) === name)) result.push({ use: name, ...options } as ComponentSpec);
  }
  return result;
}
