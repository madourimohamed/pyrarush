import { defineLevel } from '../core';
import { themes } from './themes';
import { tenFloorBands } from './shared';

export default defineLevel({
  name: 'Le Sanctuaire de Lave',
  tagline: '10 étages. Les pièges brûlent : jusqu’à −4 étages.',
  duration: '5–10 min',
  highlights: ['10 étages brûlants', "Pièges jusqu'à −4", 'Téléporteurs +3', "Survis jusqu'au sommet !"],
  // Étoiles : sommet atteint ; moins de 8 min 00 s ; au plus 3 chutes. À ajuster après les tests.
  goals: { time: 480, maxFalls: 3 },
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
