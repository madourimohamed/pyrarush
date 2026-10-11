import { defineLevel, defineTheme } from '../core';
import { tenFloorBands } from './shared';

export default defineLevel({
  name: 'Le Sanctuaire de Lave',
  tagline: '10 étages. Les pièges brûlent : jusqu’à −4 étages.',
  rules: {
    floors: 10,
    maxFloorsLost: 4,
    maxFloorsGained: 3,
    protectedTopFloors: 2,
    bands: tenFloorBands(),
    limits: { teleportUp: 2 },
    settings: { teleportUp: { min: 3, max: 3 }, teleportDown: { min: 2, max: 3 } },
  },
  theme: defineTheme({
    sky: { top: 0x140808, mid: 0x5e1a10, horizon: 0xff6a2a, sun: 0xff7a3a },
    sun: { color: 0xff8a5a, intensity: 2.3, dir: [0.6, 0.35, -0.72] },
    hemi: { sky: 0x6a3030, ground: 0xff5a1a, intensity: 1.3 },
    fog: { near: 110, far: 380 },
    exposure: 1.0,
    ground: { light: 0x4e3e3a, dark: 0x241a1a },
    paving: '#5a4a48',
    border: 0x3a2a28,
    mountains: { color: 0x2a1a18, shape: 'peaks' },
    clouds: { color: 0x4a3a3a, emissive: 0x6a1a00, intensity: 0.5 },
    stone: ['#4e423f', '#423835'],
    top: '#6e5e5a',
    trim: { color: 0xff7a1a, emissive: 0xff4a00 },
    door: { panel: 0x1e1616, frame: 0x0e0a0a, glyph: [3.2, 1.2, 0.2] },
    flame: [3.5, 1.2, 0.2],
    particles: { color: [3.0, 1.2, 0.3], size: 0.3, count: 520, motion: 'embers' },
    pool: { color: 0xff4a00, emissive: 0xff3a00, glow: true },
    vegetation: 'rocks',
    foliage: { trunk: 0x2a2020, leaf: 0x3a2a2a },
    accent: ['#ff8a2a', '#ff2a2a'],
    music: { scale: [0, 1, 3, 5, 7, 8, 10], root: 52, tempo: 128, lead: 'sawtooth', drums: 'k.hkshk.k.hks.hs' },
  }),
});
