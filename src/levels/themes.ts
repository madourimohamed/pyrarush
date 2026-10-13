import { BASE_THEME, defineTheme, editComponents } from '../core';

/**
 * Familles de thèmes, partagées entre les niveaux. Une famille = une palette + une liste de composants de décor.
 * Un niveau peut utiliser une famille telle quelle (theme: themes.glace) ou la varier :
 *   theme: defineTheme({ sky: { top: 0x123456 }, components: editComponents(themes.glace.components, { pines: { count: 60 } }) }, themes.glace)
 * Les composants disponibles sont listés dans client/scene/components/index.ts.
 */

/** Décor commun aux temples « simples » : le niveau 1 sans ses éléments propres (île, statues, pyramides lointaines…). */
const templeBase = editComponents(BASE_THEME.components, {
  distantPyramids: null,
  moat: null,
  palmiers: null,
  buissons: null,
  obelisques: null,
  ruines: null,
  rochers: null,
  fleurs: null,
  'plantes-terrasses': null,
  statues: null,
  // Étalonnage propre au niveau 1 (dominante chaude) : chaque famille garde ses couleurs.
  grade: null,
  terrain: { flat: 3 },
  doorFrames: { style: 'simple' },
  banners: { every: 2 },
});

export const themes = {
  // Niveau 1 : horizon en panorama 360° (art/panoramas/prepare_panorama.py) et sable texturé.
  sables: defineTheme(
    {
      components: editComponents(BASE_THEME.components, {
        sky: null,
        mountains: null,
        distantPyramids: null,
        terrain: { flat: 9, detail: 'sand/ripples' },
        // Eau animée (vaguelettes, reflets du ciel, écume) et palmiers réalistes qui se balancent (art/vegetation/).
        moat: { realistic: true, color: 0x2fb7c4 },
        palmiers: {
          models: ['vegetation/palm_a', 'vegetation/palm_b', 'vegetation/palm_c'],
          colors: { leafs: 0x5f9a3a, woodBark: 0x9a7650 },
          sway: 0.025,
        },
        // Image fournie (design/panoramique/), tournée pour que son soleil soit dans la direction de theme.sun.
        panorama: { image: 'panoramas/sables', rotation: -0.53 },
      }),
    },
    BASE_THEME,
  ),

  oasis: defineTheme({
    sky: { top: 0x1f8fd6, mid: 0x86d9ea, horizon: 0xe2f7e8, sun: 0xfffbe6 },
    sun: { color: 0xfff3d6, intensity: 3.0, dir: [0.55, 0.6, 0.58] },
    hemi: { sky: 0xbfe8ff, ground: 0x8fbf6a, intensity: 1.6 },
    fog: { near: 180, far: 540 },
    exposure: 0.95,
    ground: { light: 0x9fd16c, dark: 0x5c9a44 },
    paving: '#ddd2a6',
    border: 0x8a7a55,
    stone: ['#c4dcb4', '#b2cfa4'],
    top: '#eef0da',
    trim: { color: 0xf2c14e, emissive: 0x4a3200 },
    door: { panel: 0x0f3f3c, frame: 0x0a2422, glyph: [0.9, 2.6, 1.2] },
    accent: ['#3ee08a', '#11a9c9'],
    music: { scale: [0, 2, 4, 7, 9], root: 65, tempo: 112, lead: 'sine', drums: 'k..hs.h.k.khs.h.' },
    components: editComponents(templeBase, {
      sky: { clouds: 0xffffff, cloudGlow: 0xe6fff8 },
      terrain: { flat: 9 },
      mountains: { color: 0x5f9e6a },
      cliffs: { waterfalls: true },
      moat: { color: 0x1fc7c0, emissive: 0x0a4a48, width: 4 },
      pond: { color: 0x1fc7c0, emissive: 0x0a4a48, lilies: true },
      palms: { count: 40, trunk: 0x8a5a3a, leaf: 0x2f9a4a },
      vines: { leaf: 0x2f9a4a },
      banners: { cloth: '#13827a', emblem: '#f2c14e' },
      braziers: { flame: [1.0, 3.0, 1.1] },
      capstone: { style: 'crystal', color: 0x2fe08a, glow: [0.6, 2.6, 1.2] },
      particles: { color: [1.5, 1.7, 0.8], size: 0.3, count: 380 },
    }),
  }),

  crepuscule: defineTheme({
    sky: { top: 0x24185a, mid: 0xc2408f, horizon: 0xff9a6b, sun: 0xffc2a0 },
    sun: { color: 0xff9f8a, intensity: 2.7, dir: [-0.82, 0.24, 0.52] },
    hemi: { sky: 0x8a6bd6, ground: 0xc2607a, intensity: 1.5 },
    fog: { near: 150, far: 480 },
    ground: { light: 0xd98a8a, dark: 0xa05a78 },
    paving: '#d9a3a0',
    border: 0x8a4a5e,
    stone: ['#d99a8c', '#c98a84'],
    top: '#f0c4b8',
    trim: { color: 0xffcf7a, emissive: 0x5a2a00 },
    door: { panel: 0x26306b, frame: 0x1a1030, glyph: [2.4, 0.9, 1.8] },
    accent: ['#ff7ab0', '#8a5bff'],
    music: { scale: [0, 3, 5, 7, 10], root: 57, tempo: 92, lead: 'square', drums: 'k...s...k.k.s...' },
    components: editComponents(templeBase, {
      sky: { clouds: 0xffb3c8, cloudGlow: 0xff6aa0 },
      mountains: { color: 0x6a3468 },
      distantPyramids: { color: 0x8a4a6a },
      pond: { color: 0x6a5ad6, emissive: 0x2a1a6a },
      palms: { count: 10, trunk: 0x4a2a3a, leaf: 0x2f4a5a, aroundPond: true },
      banners: { cloth: '#7a2a8a', emblem: '#ffcf7a' },
      braziers: { flame: [3.0, 0.9, 1.6] },
      particles: { color: [1.8, 0.9, 1.5] },
    }),
  }),

  glace: defineTheme({
    sky: { top: 0x4f86d0, mid: 0xb8d8f2, horizon: 0xeef6ff, sun: 0xffffff },
    sun: { color: 0xeaf2ff, intensity: 2.6, dir: [-0.5, 0.55, 0.67] },
    hemi: { sky: 0xd6ecff, ground: 0xa8c4e0, intensity: 1.7 },
    fog: { near: 120, far: 420 },
    exposure: 0.88,
    ground: { light: 0xf6f9ff, dark: 0xc4d6ee },
    paving: '#dfe9f5',
    border: 0x9ab4d0,
    stone: ['#cfe3f5', '#bcd6ee'],
    top: '#f6faff',
    trim: { color: 0x9fe8ff, emissive: 0x1a4a6a },
    door: { panel: 0x1d3a6b, frame: 0x0f1a30, glyph: [0.6, 2.2, 3.0] },
    accent: ['#7fdcff', '#4a7bff'],
    music: { scale: [0, 2, 4, 6, 7, 9, 11], root: 64, tempo: 84, lead: 'sine', drums: 'k.......s.......' },
    components: editComponents(templeBase, {
      sky: { clouds: 0xffffff, cloudGlow: 0xdfefff },
      mountains: { color: 0xe4eeff, shape: 'peaks' },
      pond: { color: 0xbfefff, emissive: 0x3a6a8a },
      pines: { count: 14, trunk: 0x5a4a3a, leaf: 0x2f6a5a },
      banners: { cloth: '#1d4a8a', emblem: '#bff0ff' },
      braziers: { flame: [0.8, 2.0, 3.2] },
      particles: { color: [1.6, 1.7, 1.9], size: 0.32, count: 900, motion: 'snow' },
    }),
  }),

  lave: defineTheme({
    sky: { top: 0x140808, mid: 0x5e1a10, horizon: 0xff6a2a, sun: 0xff7a3a },
    sun: { color: 0xff8a5a, intensity: 2.3, dir: [0.6, 0.35, -0.72] },
    hemi: { sky: 0x6a3030, ground: 0xff5a1a, intensity: 1.3 },
    fog: { near: 110, far: 380 },
    ground: { light: 0x4e3e3a, dark: 0x241a1a },
    paving: '#5a4a48',
    border: 0x3a2a28,
    stone: ['#4e423f', '#423835'],
    top: '#6e5e5a',
    trim: { color: 0xff7a1a, emissive: 0xff4a00 },
    door: { panel: 0x1e1616, frame: 0x0e0a0a, glyph: [3.2, 1.2, 0.2] },
    accent: ['#ff8a2a', '#ff2a2a'],
    music: { scale: [0, 1, 3, 5, 7, 8, 10], root: 52, tempo: 128, lead: 'sawtooth', drums: 'k.hkshk.k.hks.hs' },
    components: editComponents(templeBase, {
      sky: { clouds: 0x4a3a3a, cloudGlow: 0x6a1a00 },
      mountains: { color: 0x2a1a18, shape: 'peaks' },
      pond: { color: 0xff4a00, emissive: 0xff3a00, glow: true },
      spires: { count: 14, color: 0x3a2a2a },
      banners: { cloth: '#5a1010', emblem: '#ff8a2a' },
      braziers: { flame: [3.5, 1.2, 0.2] },
      particles: { color: [3.0, 1.2, 0.3], size: 0.3, count: 520, motion: 'embers' },
    }),
  }),

  celeste: defineTheme({
    sky: { top: 0x050a24, mid: 0x1a2a6a, horizon: 0x4a3a8a, sun: 0xdfe8ff },
    sun: { color: 0x9ab4ff, intensity: 1.9, dir: [0.45, 0.55, 0.7] },
    hemi: { sky: 0x4a5aaa, ground: 0x2a1a4a, intensity: 1.4 },
    fog: { near: 140, far: 460 },
    exposure: 1.1,
    ground: { light: 0x2e2e62, dark: 0x1a1a3a },
    paving: '#3c3c6e',
    border: 0x2a2a50,
    stone: ['#5c5c9e', '#505092'],
    top: '#7c7cbc',
    trim: { color: 0xffd76a, emissive: 0x6a4a00 },
    door: { panel: 0x3a1a5a, frame: 0x120a20, glyph: [2.6, 2.2, 0.9] },
    accent: ['#a07aff', '#ff7ad9'],
    music: { scale: [0, 2, 4, 6, 8, 10], root: 67, tempo: 76, lead: 'triangle', drums: 'k.....h.....s...' },
    components: editComponents(templeBase, {
      sky: { clouds: 0x3a3a7a, cloudGlow: 0x2a2a6a, stars: true },
      mountains: { color: 0x1a1a40 },
      pond: { color: 0x7a5aff, emissive: 0x5a3aff, glow: true },
      crystals: { count: 14, color: 0x8a6aff },
      banners: { cloth: '#2a1a5a', emblem: '#ffd76a' },
      braziers: { flame: [1.0, 1.6, 3.5] },
      particles: { color: [1.2, 2.4, 3.0], size: 0.45, count: 360 },
    }),
  }),
};
