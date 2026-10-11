import { defineLevel, defineTheme } from '../core';
import { tenFloorBands } from './shared';

export default defineLevel({
  name: 'La Cité Céleste',
  tagline: 'Le défi ultime, sous les étoiles : −5, +4, paris ±3.',
  rules: {
    floors: 10,
    maxFloorsLost: 5,
    maxFloorsGained: 4,
    protectedTopFloors: 2,
    bands: tenFloorBands({ riskyDoor: [0, 1] }),
    limits: { teleportUp: 2, riskyDoor: 3 },
    settings: { teleportUp: { min: 3, max: 4 }, teleportDown: { min: 2, max: 3 }, riskyDoor: { amount: 3 } },
  },
  theme: defineTheme({
    sky: { top: 0x050a24, mid: 0x1a2a6a, horizon: 0x4a3a8a, sun: 0xdfe8ff, stars: true },
    sun: { color: 0x9ab4ff, intensity: 1.9, dir: [0.45, 0.55, 0.7] },
    hemi: { sky: 0x4a5aaa, ground: 0x2a1a4a, intensity: 1.4 },
    fog: { near: 140, far: 460 },
    exposure: 1.1,
    ground: { light: 0x2e2e62, dark: 0x1a1a3a },
    paving: '#3c3c6e',
    border: 0x2a2a50,
    mountains: { color: 0x1a1a40, shape: 'mesa' },
    clouds: { color: 0x3a3a7a, emissive: 0x2a2a6a, intensity: 0.4 },
    stone: ['#5c5c9e', '#505092'],
    top: '#7c7cbc',
    trim: { color: 0xffd76a, emissive: 0x6a4a00 },
    door: { panel: 0x3a1a5a, frame: 0x120a20, glyph: [2.6, 2.2, 0.9] },
    flame: [1.0, 1.6, 3.5],
    particles: { color: [1.2, 2.4, 3.0], size: 0.45, count: 360, motion: 'float' },
    pool: { color: 0x7a5aff, emissive: 0x5a3aff, glow: true },
    vegetation: 'crystals',
    foliage: { trunk: 0x3a2a5a, leaf: 0x8a6aff },
    accent: ['#a07aff', '#ff7ad9'],
    music: { scale: [0, 2, 4, 6, 8, 10], root: 67, tempo: 76, lead: 'triangle', drums: 'k.....h.....s...' },
  }),
});
