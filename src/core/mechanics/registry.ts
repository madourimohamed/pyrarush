import type { Mechanic } from './mechanic';
import { passage, wall, smallTrap } from './basic';
import { bigTrap, teleportUp, teleportDown, riskyDoor } from './advanced';
import { treasure } from './treasure';

const mechanics = new Map<string, Mechanic>();

export function registerMechanic(mechanic: Mechanic): void {
  mechanics.set(mechanic.id, mechanic);
}

export function getMechanic(id: string): Mechanic {
  const mechanic = mechanics.get(id);
  if (!mechanic) throw new Error(`Mécanique inconnue : ${id}`);
  return mechanic;
}

for (const m of [passage, wall, smallTrap, bigTrap, teleportUp, teleportDown, riskyDoor, treasure]) {
  registerMechanic(m);
}
