import { band, defineLevel } from '../core';

export default defineLevel({
  name: 'Le Stade Légendaire',
  tagline: '12 étages au cœur d’un stade en délire.',
  duration: '6–12 min',
  highlights: ['La pyramide-stade', '12 étages à gravir', 'Téléporteurs +3 et pièges −4', 'Atteins le ballon d’or !'],
  // Étoiles : sommet atteint ; moins de 10 min 00 s ; au plus 3 chutes. À ajuster après les tests.
  goals: { time: 600, maxFalls: 3 },
  rules: {
    floors: 12,
    // Base de la taille du niveau 6 (11 portes par face), pour ne pas allonger le premier étage.
    doorsPerSideAtBase: 11,
    maxFloorsLost: 4,
    maxFloorsGained: 3,
    protectedTopFloors: 2,
    bands: [
      band(1, 3, 4, { smallTrap: 4, teleportUp: [0, 1], riskyDoor: [0, 1] }, [1, 2]),
      band(4, 7, 3, { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1] }, [2, 3], [1, 2]),
      band(8, 10, 2, { smallTrap: 3, bigTrap: 2, teleportDown: [0, 1] }, [2, 3], 2),
      band(11, 12, 2, { smallTrap: 2, bigTrap: 2 }, [2, 3], 2),
    ],
    limits: { teleportUp: 2, riskyDoor: 2 },
    settings: { teleportUp: { min: 2, max: 3 }, teleportDown: { min: 2, max: 3 }, riskyDoor: { amount: 3 } },
  },
  theme: 'stade',
});
