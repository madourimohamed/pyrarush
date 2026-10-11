import { band, defineLevel } from '../core';
import { themes } from './themes';

export default defineLevel({
  name: 'La Pyramide de Glace',
  tagline: 'Nouveau : les téléporteurs piégés et la porte ±3.',
  duration: '4–9 min',
  highlights: ['Grimpe sous la neige', 'Évite les téléporteurs piégés', 'Ose la porte ±3', 'Atteins le sommet gelé !'],
  // Étoiles : sommet atteint ; moins de 5 min 30 s ; au plus 2 chutes. À ajuster après les tests.
  goals: { time: 330, maxFalls: 2 },
  rules: {
    floors: 8,
    maxFloorsLost: 3,
    maxFloorsGained: 3,
    protectedTopFloors: 2,
    bands: [
      band(1, 2, 3, { smallTrap: 3, teleportUp: [0, 1], riskyDoor: [0, 1] }, [1, 2]),
      band(3, 5, 2, { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1], riskyDoor: [0, 1] }, [2, 3]),
      band(6, 8, 1, { smallTrap: 3, bigTrap: 2, teleportDown: [0, 1] }, [2, 3]),
    ],
    limits: { teleportUp: 2, riskyDoor: 2 },
    settings: { teleportUp: { min: 2, max: 3 }, teleportDown: { min: 2, max: 2 }, riskyDoor: { amount: 3 } },
  },
  theme: themes.glace,
});
