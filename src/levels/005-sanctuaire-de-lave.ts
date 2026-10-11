import { defineLevel } from '../core';
import { themes } from './themes';
import { tenFloorBands } from './shared';

export default defineLevel({
  name: 'Le Sanctuaire de Lave',
  tagline: '10 étages. Les pièges brûlent : jusqu’à −4 étages.',
  duration: '5–10 min',
  highlights: ['10 étages brûlants', "Pièges jusqu'à −4", 'Téléporteurs +3', "Survis jusqu'au sommet !"],
  rules: {
    floors: 10,
    maxFloorsLost: 4,
    maxFloorsGained: 3,
    protectedTopFloors: 2,
    bands: tenFloorBands(),
    limits: { teleportUp: 2 },
    settings: { teleportUp: { min: 3, max: 3 }, teleportDown: { min: 2, max: 3 } },
  },
  theme: themes.lave,
});
