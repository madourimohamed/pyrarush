import type { Mechanic } from './mechanic';
import { setting } from './mechanic';

/** Pyramides 2+ : fait perdre plusieurs étages, d'autant plus que l'étage est haut. */
export const bigTrap: Mechanic = {
  id: 'bigTrap',
  label: 'Gros piège',
  canPlace: (floor) => floor >= 3,
  generateParams: (rng, floor, config) => {
    const max = Math.min(config.maxFloorsLost, floor - 1);
    // Les étages hauts tirent vers le haut de l'intervalle.
    const bias = Math.round(((floor - 1) / config.floors) * (max - 2));
    return { floorsLost: Math.max(2, Math.min(max, 2 + bias + rng.int(0, 1))) };
  },
  resolve: ({ door }) => ({
    delta: -door.params.floorsLost,
    fx: 'bigTrap',
    message: 'Gros piège !',
  }),
};

/** Rattrapage : rare, seulement dans la moitié basse, une fois par joueur. */
export const teleportUp: Mechanic = {
  id: 'teleportUp',
  label: 'Téléporteur',
  revealPublicly: true,
  oncePerPlayer: true,
  canPlace: (floor, config) =>
    floor <= Math.ceil(config.floors / 2) &&
    floor + setting(config, 'teleportUp', 'min', 2) <= config.floors - config.protectedTopFloors,
  generateParams: (rng, _floor, config) => ({
    floorsGained: rng.int(setting(config, 'teleportUp', 'min', 2), setting(config, 'teleportUp', 'max', 2)),
  }),
  resolve: ({ door }) => ({
    delta: door.params.floorsGained,
    fx: 'teleportUp',
    message: 'Téléporteur !',
  }),
};

export const teleportDown: Mechanic = {
  id: 'teleportDown',
  label: 'Téléporteur piégé',
  canPlace: (floor) => floor >= 3,
  generateParams: (rng, floor, config) => ({
    floorsLost: Math.min(
      floor - 1,
      rng.int(setting(config, 'teleportDown', 'min', 2), setting(config, 'teleportDown', 'max', 3)),
    ),
  }),
  resolve: ({ door }) => ({
    delta: -door.params.floorsLost,
    fx: 'teleportDown',
    message: 'Téléporteur piégé !',
  }),
};

/**
 * Porte à double effet, visible : un pari assumé (+N ou −N, N réglable par pyramide).
 * Le résultat est fixé pour la partie ; un seul essai par joueur.
 */
export const riskyDoor: Mechanic = {
  id: 'riskyDoor',
  label: 'Porte risquée',
  appearance: { color: 0xf0b429, symbol: (config) => `±${setting(config, 'riskyDoor', 'amount', 3)}` },
  revealPublicly: true,
  oncePerPlayer: true,
  canPlace: (floor) => floor >= 2,
  generateParams: (rng, _floor, config) => {
    const amount = setting(config, 'riskyDoor', 'amount', 3);
    return { delta: rng.next() < 0.5 ? amount : -amount };
  },
  resolve: ({ door }) =>
    door.params.delta > 0
      ? { delta: door.params.delta, fx: 'riskyWin', message: 'Pari gagné !' }
      : { delta: door.params.delta, fx: 'riskyLose', message: 'Pari perdu !' },
};
