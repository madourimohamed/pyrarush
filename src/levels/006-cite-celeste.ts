import { defineLevel } from '../core';
import { themes } from './themes';
import { tenFloorBands } from './shared';

export default defineLevel({
  name: 'La Cité Céleste',
  tagline: 'Le défi ultime, sous les étoiles : −5, +4, paris ±3.',
  duration: '6–12 min',
  highlights: ['Le défi ultime', "Pièges jusqu'à −5", 'Paris ±3 et téléporteurs +4', 'Atteins la cité des étoiles !'],
  // Étoiles : sommet atteint ; moins de 9 min 00 s ; au plus 3 chutes. À ajuster après les tests.
  goals: { time: 540, maxFalls: 3 },
  rules: {
    floors: 10,
    maxFloorsLost: 5,
    maxFloorsGained: 4,
    protectedTopFloors: 2,
    bands: tenFloorBands({ riskyDoor: [0, 1] }),
    limits: { teleportUp: 2, riskyDoor: 3 },
    settings: { teleportUp: { min: 3, max: 4 }, teleportDown: { min: 2, max: 3 }, riskyDoor: { amount: 3 } },
  },
  theme: themes.celeste,
  // Identifiant d'avant le 2026-10-13 (rangé par position) : la progression déjà enregistrée suit le niveau.
  formerIds: ['level-6'],
});
