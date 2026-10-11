import { defineLevel, defineTheme, band } from '../core';

export default defineLevel({
  name: 'Le Temple des Sables',
  tagline: 'Passages, murs et gants de boxe : apprends les bases.',
  rules: {
    floors: 6,
    // Les pièges font perdre 1 étage ; seule la porte risquée (visible, choisie) va jusqu'à ±2.
    maxFloorsLost: 2,
    maxFloorsGained: 2,
    // Un bonus ne dépose jamais sur le dernier étage : depuis l'étage 3, la porte ±2 mène au 5 au mieux.
    protectedTopFloors: 1,
    bands: [
      band(1, 1, 2, { smallTrap: 2 }, 0),
      band(2, 2, 2, { smallTrap: 3 }, [1, 2]),
      band(3, 3, 2, { smallTrap: 3, riskyDoor: 1 }, [1, 2]), // ±2 : vers l'étage 5 ou l'étage 1
      band(4, 4, 2, { smallTrap: 3 }, 2),
      band(5, 6, 1, { smallTrap: 3 }, 2), // un seul passage en haut : le sommet se mérite
    ],
    settings: { riskyDoor: { amount: 2 } },
  },
  // Thème de base : aucune différence à déclarer.
  theme: defineTheme(),
});
