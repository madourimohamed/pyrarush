import type { PyramidConfig } from '../types';

/**
 * Configurations des pyramides. Tout l'équilibrage se règle ici, sans toucher au moteur.
 * Nombre de portes par étage = 4 faces × (doorsPerSideAtTop + étages au-dessus).
 */

export const pyramid1: PyramidConfig = {
  id: 'p1',
  name: 'Pyramide 1',
  difficulty: 'Facile',
  floors: 6, // 28, 24, 20, 16, 12, 8 portes
  doorsPerSideAtTop: 2,
  // Les pièges font perdre 1 étage ; seule la porte risquée (visible, choisie) peut faire perdre ou gagner 2 étages.
  maxFloorsLost: 2,
  maxFloorsGained: 2,
  // Un bonus ne dépose jamais sur le dernier étage : depuis l'étage 3, la porte ±2 mène au 5 au mieux.
  protectedTopFloors: 1,
  publicRevealMs: 4000,
  hints: 'scarab',
  bands: [
    { floors: [1, 1], passages: 2, mechanics: { smallTrap: 2 }, holes: 0 },
    { floors: [2, 2], passages: 2, mechanics: { smallTrap: 3 }, holes: [1, 2] },
    // Porte risquée ±2 uniquement à l'étage 3 : +2 → étage 5, −2 → étage 1.
    { floors: [3, 3], passages: 2, mechanics: { smallTrap: 3, riskyDoor: 1 }, holes: [1, 2] },
    { floors: [4, 4], passages: 2, mechanics: { smallTrap: 3 }, holes: 2 },
    // Un seul passage en haut : le sommet se mérite.
    { floors: [5, 6], passages: 1, mechanics: { smallTrap: 3 }, holes: 2 },
  ],
  settings: { riskyDoor: { amount: 2 } },
};

/** Prête pour les tests (?pyramide=2), pas encore ouverte aux joueurs en V1. */
export const pyramid2: PyramidConfig = {
  id: 'p2',
  name: 'Pyramide 2',
  difficulty: 'Intermédiaire',
  floors: 8, // 36 → 8 portes
  doorsPerSideAtTop: 2,
  maxFloorsLost: 3,
  maxFloorsGained: 2,
  protectedTopFloors: 2,
  publicRevealMs: 4000,
  hints: 'scarab',
  bands: [
    { floors: [1, 2], passages: 3, mechanics: { smallTrap: 3, teleportUp: [0, 1] }, holes: [0, 2] },
    { floors: [3, 5], passages: 2, mechanics: { smallTrap: 3, bigTrap: [1, 2], teleportUp: [0, 1] }, holes: 2 },
    { floors: [6, 8], passages: 2, mechanics: { smallTrap: 2, bigTrap: 2 }, holes: [2, 3] },
  ],
  limits: { teleportUp: 2 },
  settings: { teleportUp: { min: 2, max: 2 } },
};

/** Prête pour les tests (?pyramide=3), pas encore ouverte aux joueurs en V1. */
export const pyramid3: PyramidConfig = {
  id: 'p3',
  name: 'Pyramide 3',
  difficulty: 'Difficile',
  floors: 10, // 44 → 8 portes
  doorsPerSideAtTop: 2,
  maxFloorsLost: 5,
  maxFloorsGained: 4,
  protectedTopFloors: 2,
  publicRevealMs: 4000,
  hints: 'scarab',
  bands: [
    { floors: [1, 3], passages: 4, mechanics: { smallTrap: 4, teleportUp: [0, 1], riskyDoor: [0, 1] }, holes: [1, 2] },
    {
      floors: [4, 7],
      passages: 3,
      mechanics: { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1], riskyDoor: [0, 1] },
      holes: [2, 3],
    },
    { floors: [8, 10], passages: 2, mechanics: { smallTrap: 2, bigTrap: 2, teleportDown: [0, 1] }, holes: [2, 3] },
  ],
  limits: { teleportUp: 2, riskyDoor: 3 },
  settings: { teleportUp: { min: 3, max: 4 }, teleportDown: { min: 2, max: 3 }, riskyDoor: { amount: 3 } },
};

export const pyramids: PyramidConfig[] = [pyramid1, pyramid2, pyramid3];
