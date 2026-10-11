import { band, defineLevel } from '../core';
import { themes } from './themes';

export default defineLevel({
  name: "L'Oasis Émeraude",
  tagline: 'Nouveau : le gant géant fait perdre 2 étages.',
  duration: '3–6 min',
  highlights: ['Explore une oasis luxuriante', 'Méfie-toi du gant géant', 'Tente la porte mystère', "Atteins le sommet de l'oasis !"],
  // Étoiles : sommet atteint ; moins de 3 min 30 s ; au plus 1 chute. À ajuster après les tests.
  goals: { time: 210, maxFalls: 1 },
  rules: {
    floors: 6,
    maxFloorsLost: 2,
    maxFloorsGained: 2,
    protectedTopFloors: 1,
    bands: [
      band(1, 1, 2, { smallTrap: 3 }, 0),
      band(2, 2, 2, { smallTrap: 3 }, 2, 1),
      band(3, 3, 2, { smallTrap: 3, bigTrap: 1, riskyDoor: 1 }, 2, 1),
      band(4, 4, 2, { smallTrap: 3, bigTrap: 1 }, 2, 1),
      band(5, 6, 1, { smallTrap: 3, bigTrap: 1 }, [2, 3], [1, 2]),
    ],
    settings: { riskyDoor: { amount: 2 } },
  },
  theme: themes.oasis,
});
