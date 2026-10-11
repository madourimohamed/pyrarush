import { Rng } from './rng';
import { doorsPerSide, holeTangents } from './geometry';
import { getMechanic } from './mechanics/registry';
import type { CountSpec, Door, FloorBand, Hole, Layout, PyramidConfig } from './types';

export function bandFor(config: PyramidConfig, floor: number): FloorBand {
  const band = config.bands.find((b) => floor >= b.floors[0] && floor <= b.floors[1]);
  if (!band) throw new Error(`${config.id} : aucune règle pour l'étage ${floor}`);
  return band;
}


function resolveCount(rng: Rng, spec: CountSpec): number {
  return typeof spec === 'number' ? spec : rng.int(spec[0], spec[1]);
}

/** Génère la disposition d'une partie. Une même graine donne toujours la même pyramide. */
export function generateLayout(config: PyramidConfig, seed: number): Layout {
  const rng = new Rng(seed);
  const used: Record<string, number> = {};
  const layout: Layout = { seed, config, doorsPerSide: [0], doors: [], doorsByFloor: [[]], holes: [] };

  for (let floor = 1; floor <= config.floors; floor++) {
    const band = bandFor(config, floor);
    const perSide = doorsPerSide(config, floor);
    const total = perSide * 4;

    const assignments: string[] = Array(Math.max(1, band.passages)).fill('passage');
    for (const [id, spec] of Object.entries(band.mechanics)) {
      const mechanic = getMechanic(id);
      if (mechanic.canPlace && !mechanic.canPlace(floor, config)) continue;
      const remaining = (config.limits?.[id] ?? Infinity) - (used[id] ?? 0);
      const count = Math.min(resolveCount(rng, spec), remaining);
      for (let i = 0; i < count; i++) assignments.push(id);
      used[id] = (used[id] ?? 0) + Math.max(0, count);
    }
    if (assignments.length > total) {
      throw new Error(`${config.id} : étage ${floor} a ${assignments.length} mécaniques pour ${total} portes`);
    }
    while (assignments.length < total) assignments.push('wall');
    rng.shuffle(assignments);

    const floorDoors: Door[] = assignments.map((mechanicId, ring) => {
      const side = Math.floor(ring / perSide);
      const slot = ring % perSide;
      const mechanic = getMechanic(mechanicId);
      return {
        id: `f${floor}-${side}-${slot}`,
        floor,
        side,
        slot,
        ring,
        mechanic: mechanicId,
        params: mechanic.generateParams?.(rng, floor, config) ?? {},
      };
    });
    layout.doorsPerSide.push(perSide);
    layout.doorsByFloor.push(floorDoors);
    layout.doors.push(...floorDoors);

    if (floor >= 2) {
      const candidates: Hole[] = [];
      const spots = holeTangents(config, floor).length;
      for (let side = 0; side < 4; side++) {
        for (let slot = 0; slot < spots; slot++) candidates.push({ floor, side, slot });
      }
      const count = Math.min(resolveCount(rng, band.holes), candidates.length);
      layout.holes.push(...rng.shuffle(candidates).slice(0, count));
    }
  }

  assertCompletable(layout);
  return layout;
}

/** Une pyramide est terminable si chaque étage possède au moins un passage (+1). */
export function assertCompletable(layout: Layout): void {
  for (let floor = 1; floor <= layout.config.floors; floor++) {
    if (!layout.doorsByFloor[floor]?.some((d) => d.mechanic === 'passage')) {
      throw new Error(`${layout.config.id} (graine ${layout.seed}) : aucun passage à l'étage ${floor}`);
    }
  }
}
