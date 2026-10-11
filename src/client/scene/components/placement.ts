import {
  doorFront,
  holeTangent,
  sideCoords,
  terraceOuterHalf,
  wallHalf,
  HOLE_WIDTH,
  INTERACT_RANGE,
  Rng,
  type Layout,
  type Theme,
} from '../../../core';
import { propSlots } from './props';
import { cornerClusterSlots, facadeFlankSlots, terraceCornerSlots, terraceEdgeSlots, wallFootSlots, type Slot } from './slots';

/**
 * Contrôle des règles du gameplay pour le décor (bible graphique § 2) : aucun élément posé sur la pyramide
 * ne doit entrer dans la zone d'interaction d'une porte, dans la bande de marche d'une terrasse, ni aux abords
 * d'un trou. Les emprises sont calculées avec les mêmes fonctions de placement que les composants.
 */
export interface Footprint {
  source: string;
  slot: Slot;
  /** Rayon d'emprise au sol (m). */
  radius: number;
}

export interface Violation {
  source: string;
  floor: number;
  rule: 'zone de porte' | 'bande de marche' | 'abords de trou';
  detail: string;
}

/** Largeur minimale de la bande de marche et retrait autorisé contre la paroi / au bord (m). */
export const WALK_BAND = { width: 2, wallZone: 0.4, rimZone: 0.5, plazaStart: 1.6 } as const;
const HOLE_MARGIN = 0.5;

/** Emprises au sol des composants posés sur la pyramide (le décor extérieur à l'île n'est pas concerné). */
export function decorFootprints(layout: Layout, theme: Theme): Footprint[] {
  const footprints: Footprint[] = [];
  const add = (source: string, slots: Slot[], radius: number) => slots.forEach((slot) => footprints.push({ source, slot, radius }));
  for (const spec of theme.components) {
    const o = spec as Record<string, unknown>;
    const name = (spec.id as string) ?? spec.use;
    switch (spec.use) {
      case 'props': {
        const slots = propSlots(layout, {
          place: (o.place as never) ?? 'shore',
          every: (o.every as number) ?? 1,
          offset: (o.offset as number) ?? 0,
          spacing: (o.spacing as number) ?? 1.75,
        });
        if (slots) add(name, slots, 0.5);
        break;
      }
      case 'braziers':
        add(name, terraceEdgeSlots(layout, (o.every as number) ?? 1), 0.45);
        if (o.corners !== false) add(name, terraceCornerSlots(layout), 0.45);
        break;
      case 'statues':
        add(name, facadeFlankSlots(layout, (o.spacing as number) ?? 1.75), 0.62);
        break;
      case 'jars':
        add(name, cornerClusterSlots(layout, (o.perCorner as number) ?? 2, new Rng(layout.seed ^ 0xdec0)), 0.3);
        break;
      case 'terracePlants':
        add(name, wallFootSlots(layout, (o.every as number) ?? 2, (o.offset as number) ?? 1), 0.4);
        break;
    }
  }
  return footprints;
}

export function checkPlacement(layout: Layout, footprints: Footprint[]): Violation[] {
  const { config } = layout;
  const violations: Violation[] = [];
  for (const { source, slot, radius } of footprints) {
    const floor = slot.floor;
    const p = slot.position;
    const { side, radial, tangent } = sideCoords(p);
    const a = wallHalf(config, floor);
    const outer = terraceOuterHalf(config, floor);
    const push = (rule: Violation['rule'], detail: string) => violations.push({ source, floor, rule, detail });

    for (const door of layout.doorsByFloor[floor]) {
      const front = doorFront(config, door);
      const d = Math.hypot(front.x - p.x, front.z - p.z);
      if (d < INTERACT_RANGE + radius) push('zone de porte', `à ${d.toFixed(2)} m de la porte ${door.id} (minimum ${(INTERACT_RANGE + radius).toFixed(2)} m)`);
    }

    // Bande de marche : devant les parois (hors coins), entre la zone murale et la zone de rebord.
    if (Math.abs(tangent) <= a) {
      const start = a + (floor === 1 ? WALK_BAND.plazaStart : WALK_BAND.wallZone);
      const end = floor === 1 ? start + WALK_BAND.width : outer - WALK_BAND.rimZone;
      if (radial + radius > start && radial - radius < end) {
        push('bande de marche', `emprise ${(radial - radius - a).toFixed(2)}–${(radial + radius - a).toFixed(2)} m de la paroi (bande ${(start - a).toFixed(2)}–${(end - a).toFixed(2)} m)`);
      }
    }

    for (const hole of layout.holes) {
      if (hole.floor !== floor || hole.side !== side) continue;
      const gap = Math.abs(tangent - holeTangent(config, hole));
      if (gap < HOLE_WIDTH / 2 + HOLE_MARGIN + radius && radial > a && radial < outer) push('abords de trou', `à ${gap.toFixed(2)} m de l'axe du trou`);
    }
  }
  return violations;
}
