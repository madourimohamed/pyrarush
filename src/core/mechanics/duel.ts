import type { Mechanic } from './mechanic';

/**
 * Porte à pouvoir (duel uniquement) : identique aux autres portes avant d'être ouverte.
 * Elle ne fait ni monter ni descendre ; le serveur donne le pouvoir (selon le classement, voir core/duel.ts).
 * Chaque joueur peut l'ouvrir une fois : les deux joueurs ont les mêmes portes à leur disposition.
 */
export const powerDoor: Mechanic = {
  id: 'powerDoor',
  label: 'Porte à pouvoir',
  oncePerPlayer: true,
  fillsWalls: true,
  resolve: () => ({ delta: 0, fx: 'power', message: 'Porte mystère !' }),
};
