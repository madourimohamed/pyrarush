import * as THREE from 'three';
import {
  doorCenter,
  doorTangents,
  floorY,
  gapTangents,
  sideFrame,
  terraceOuterHalf,
  wallHalf,
  FLOOR_HEIGHT,
  type Door,
  type Layout,
  type Rng,
} from '../../../core';

/**
 * Emplacements génériques de la pyramide, partagés par tous les composants de décor.
 * Un composant choisit où se poser (entre les portes, au bord des terrasses…) sans connaître la géométrie détaillée.
 * Tous les emplacements respectent le jeu : jamais devant une porte, jamais dans un trou.
 */

export interface Slot {
  floor: number;
  side: number;
  position: THREE.Vector3;
  /** Rotation autour de la verticale : l'axe +z local pointe vers l'extérieur de la pyramide. */
  rotationY: number;
}

export interface DoorSlot extends Slot {
  door: Door;
}

const sideRotation = (side: number) => {
  const f = sideFrame(side);
  return Math.atan2(f.outX, f.outZ);
};

/** Point sur une face : distance au centre (radius) et position le long de la face (tangent). */
export function onSide(side: number, radius: number, tangent: number, y: number): THREE.Vector3 {
  const f = sideFrame(side);
  return new THREE.Vector3(f.outX * radius + f.tanX * tangent, y, f.outZ * radius + f.tanZ * tangent);
}

/** Centre de chaque porte, sur la face de la paroi. */
export function doorSlots(layout: Layout): DoorSlot[] {
  return layout.doors.map((door) => {
    const c = doorCenter(layout.config, door);
    return { door, floor: door.floor, side: door.side, position: new THREE.Vector3(c.x, c.y, c.z), rotationY: sideRotation(door.side) };
  });
}

/**
 * Entre deux portes, sur la face de la paroi, au niveau du haut du mur (pour suspendre bannières, lianes…).
 * `every` : un emplacement sur N ; `offset` : décale le motif (ex. bannières sur les pairs, lianes sur les impairs).
 */
export function wallGapSlots(layout: Layout, every = 1, offset = 0): Slot[] {
  const slots: Slot[] = [];
  const { config } = layout;
  for (let floor = 1; floor <= config.floors; floor++) {
    const a = wallHalf(config, floor);
    const top = floorY(floor) + FLOOR_HEIGHT;
    const gaps = gapTangents(config, floor);
    for (let side = 0; side < 4; side++) {
      gaps.forEach((t, i) => {
        if ((i + offset) % every === 0) slots.push({ floor, side, position: onSide(side, a + 0.04, t, top), rotationY: sideRotation(side) });
      });
    }
  }
  return slots;
}

/** Au sol de la terrasse, contre la paroi, entre deux portes. */
export function wallFootSlots(layout: Layout, every = 1, offset = 0): Slot[] {
  return wallGapSlots(layout, every, offset).map((s) => {
    const f = sideFrame(s.side);
    return { ...s, position: new THREE.Vector3(s.position.x + f.outX * 0.45, floorY(s.floor), s.position.z + f.outZ * 0.45) };
  });
}

/**
 * Au bord extérieur de chaque terrasse, en face des intervalles entre portes (donc loin des trous).
 * À l'étage 1, le long de la bordure de l'esplanade.
 */
export function terraceEdgeSlots(layout: Layout, every = 1): Slot[] {
  const slots: Slot[] = [];
  const { config } = layout;
  for (let floor = 1; floor <= config.floors; floor++) {
    const radius = terraceOuterHalf(config, floor) - (floor === 1 ? 1.1 : 0.45);
    const doors = doorTangents(config, floor);
    const half = doors.length > 1 ? (doors[1] - doors[0]) / 2 : radius / 2;
    // Avant la première porte, entre les portes, après la dernière : jamais sur un emplacement de trou.
    const tangents = [doors[0] - half, ...gapTangents(config, floor), doors[doors.length - 1] + half].filter((t) => Math.abs(t) < radius - 0.5);
    for (let side = 0; side < 4; side++) {
      tangents.forEach((t, i) => {
        if (i % every === 0) slots.push({ floor, side, position: onSide(side, radius, t, floorY(floor)), rotationY: sideRotation(side) });
      });
    }
  }
  return slots;
}

/** Les quatre coins extérieurs de chaque terrasse. */
export function terraceCornerSlots(layout: Layout, inset = 0.75): Slot[] {
  const slots: Slot[] = [];
  const { config } = layout;
  for (let floor = 1; floor <= config.floors; floor++) {
    const r = terraceOuterHalf(config, floor) - (floor === 1 ? inset * 2 : inset);
    for (let side = 0; side < 4; side++) {
      slots.push({ floor, side, position: onSide(side, r, r, floorY(floor)), rotationY: sideRotation(side) });
    }
  }
  return slots;
}

/** Au centre de chaque façade, au pied de l'étage 1 (entrées principales : statues, escaliers d'apparat…). */
export function facadeSlots(layout: Layout): Slot[] {
  const a = wallHalf(layout.config, 1);
  return [0, 1, 2, 3].map((side) => ({ floor: 1, side, position: onSide(side, a, 0, 0), rotationY: sideRotation(side) }));
}

/** Point au hasard dans l'anneau carré [inner, outer] autour de la pyramide (décor extérieur). */
export function ringPoint(rng: Rng, inner: number, outer: number): THREE.Vector3 {
  const side = rng.int(0, 3);
  const radius = inner + rng.next() * (outer - inner);
  const tangent = (rng.next() * 2 - 1) * radius;
  return onSide(side, radius, tangent, 0);
}
