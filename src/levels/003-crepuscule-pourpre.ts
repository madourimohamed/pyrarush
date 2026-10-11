import { band, defineLevel } from '../core';
import { themes } from './themes';

export default defineLevel({
  name: 'Le Crépuscule Pourpre',
  tagline: '8 étages. Nouveau : les téléporteurs (+2) pour revenir dans la course.',
  duration: '3–8 min',
  highlights: ['8 étages sous un ciel rose', 'Utilise les téléporteurs', "Gants géants : jusqu'à −3", 'Atteins le sommet au crépuscule !'],
  // Étoiles : sommet atteint ; moins de 5 min 00 s ; au plus 2 chutes. À ajuster après les tests.
  goals: { time: 300, maxFalls: 2 },
  rules: {
    floors: 8,
    maxFloorsLost: 3,
    maxFloorsGained: 2,
    protectedTopFloors: 2,
    bands: [
      band(1, 2, 3, { smallTrap: 3, teleportUp: [0, 1] }, [0, 2]),
      band(3, 4, 2, { smallTrap: 3, bigTrap: [1, 2], teleportUp: [0, 1], riskyDoor: 1 }, 2),
      band(5, 6, 2, { smallTrap: 3, bigTrap: 2 }, [2, 3]),
      band(7, 8, 1, { smallTrap: 3, bigTrap: 2 }, [2, 3]),
    ],
    limits: { teleportUp: 2, riskyDoor: 1 },
    settings: { teleportUp: { min: 2, max: 2 }, riskyDoor: { amount: 2 } },
  },
  theme: themes.crepuscule,
});
