import type { Layout, Door } from '../types';
import type { Mechanic } from './mechanic';

export const passage: Mechanic = {
  id: 'passage',
  label: 'Passage',
  revealPublicly: true,
  rememberAsPassage: true,
  resolve: () => ({ delta: 1, fx: 'passage', message: 'Passage trouvé !' }),
};

/** Porte indice (anciennement « mur ») : rien à gagner, mais une indication vers le passage le plus proche. */
export const wall: Mechanic = {
  id: 'wall',
  label: 'Indice',
  resolve: ({ door, layout }) => {
    const nearest = nearestPassage(layout, door);
    switch (layout.config.hints) {
      case 'hotCold': {
        const level = nearest.distance <= 1 ? 'chaud' : nearest.distance <= 3 ? 'tiede' : 'froid';
        const label = { chaud: 'Chaud !', tiede: 'Tiède…', froid: 'Froid.' }[level];
        return { delta: 0, fx: 'wall', hint: { type: 'hotCold', level }, message: `Indice : ${label}` };
      }
      case 'scarab': {
        const near = nearest.distance <= 2;
        return {
          delta: 0,
          fx: 'wall',
          hint: { type: 'scarab', dir: nearest.dir, near, doors: nearest.distance, target: nearest.target },
          message: near ? 'Le scarabée s’agite : c’est tout près !' : 'Indice : suis le scarabée !',
        };
      }
      default:
        return { delta: 0, fx: 'wall', message: 'Rien ici…' };
    }
  },
};

export const smallTrap: Mechanic = {
  id: 'smallTrap',
  label: 'Petit piège',
  resolve: () => ({ delta: -1, fx: 'smallTrap', message: 'Piège !' }),
};

/** Passage le plus proche du même étage : distance (en portes, autour de l'anneau) et sens pour y aller. */
export function nearestPassage(layout: Layout, door: Door): { distance: number; dir: 1 | -1; target: string } {
  const floorDoors = layout.doorsByFloor[door.floor];
  const ringSize = floorDoors.length;
  let best = { distance: Infinity, dir: 1 as 1 | -1, target: door.id };
  for (const other of floorDoors) {
    if (other.mechanic !== 'passage') continue;
    const forward = (other.ring - door.ring + ringSize) % ringSize;
    const backward = ringSize - forward;
    if (forward < best.distance) best = { distance: forward, dir: 1, target: other.id };
    if (backward < best.distance) best = { distance: backward, dir: -1, target: other.id };
  }
  return best;
}
