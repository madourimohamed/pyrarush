import { band, type FloorBand } from '../core';

/** Briques de règles réutilisables par plusieurs niveaux. */

/** Pyramide de 10 étages des niveaux de fin de jeu ; `extra` ajoute des portes aux deux premières tranches. */
export const tenFloorBands = (extra: FloorBand['mechanics'] = {}): FloorBand[] => [
  band(1, 3, 4, { smallTrap: 4, teleportUp: [0, 1], ...extra }, [1, 2]),
  band(4, 7, 3, { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1], ...extra }, [2, 3]),
  band(8, 10, 2, { smallTrap: 2, bigTrap: 2, teleportDown: [0, 1] }, [2, 3]),
];
