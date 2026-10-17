import { Rng } from '../rng';
import type { Door } from '../types';
import type { Mechanic } from './mechanic';

/**
 * Porte trésor : une petite récompense immédiate, tirée à la génération (fixe pour la partie), une seule fois par joueur
 * (ensuite elle se comporte comme une porte indice). Jamais indispensable pour gagner.
 * - shards : éclats d'or (monnaie gardée dans la progression, pour les objets cosmétiques à venir) ;
 * - hourglass : quelques secondes retirées au chronomètre (solo ; en multijoueur, des éclats à la place) ;
 * - shield : le Bouclier d'Anubis (annule la prochaine chute ; des éclats à la place si on l'a déjà).
 */
export const TREASURE_IDS = ['shards', 'hourglass', 'shield'] as const;
export type TreasureId = (typeof TREASURE_IDS)[number];

/** Chances de chaque récompense (sur 100), secondes du sablier, éclats donnés à la place d'un sablier ou d'un bouclier. */
const WEIGHTS: Record<TreasureId, number> = { shards: 60, hourglass: 25, shield: 15 };
export const TREASURE_HOURGLASS_MS = 3000;
export const TREASURE_FALLBACK_SHARDS = 5;

export const treasure: Mechanic = {
  id: 'treasure',
  label: 'Trésor',
  oncePerPlayer: true,
  resolve: ({ door }) => {
    const reward = TREASURE_IDS[door.params.reward] ?? 'shards';
    return { delta: 0, fx: 'treasure', message: 'Trésor !', treasure: { reward, amount: door.params.amount ?? 0 } };
  },
};

/**
 * Change une part des portes « indice » (murs) de chaque étage en trésors. Tirage séparé de celui de la pyramide :
 * passages, pièges et trous restent exactement aux mêmes places pour une même graine.
 */
export function placeTreasures(doorsByFloor: Door[][], share: number, seed: number): void {
  const rng = new Rng((seed ^ 0x7ea5e7) >>> 0);
  for (const doors of doorsByFloor) {
    const walls = doors.filter((d) => d.mechanic === 'wall');
    const count = Math.round(walls.length * Math.min(1, Math.max(0, share)));
    for (const door of rng.shuffle([...walls]).slice(0, count)) {
      let roll = rng.next() * 100;
      const reward = TREASURE_IDS.findIndex((id) => (roll -= WEIGHTS[id]) < 0);
      door.mechanic = 'treasure';
      // Plus d'éclats en montant : récompense l'audace.
      door.params = { reward: Math.max(0, reward), amount: 2 + door.floor + rng.int(0, 3) };
    }
  }
}
