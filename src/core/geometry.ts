import { doorsPerSide } from './layout';
import type { Door, Hole, Layout, PyramidConfig } from './types';

/**
 * Géométrie de la pyramide à degrés, en pur calcul (sans 3D) : partagée par le rendu,
 * la physique, et plus tard les robots et le serveur.
 *
 * Le joueur à l'étage f marche sur une terrasse en anneau et fait face à la paroi f,
 * percée de portes. La paroi f est un bloc de hauteur FLOOR_HEIGHT dont le dessus forme la terrasse f + 1.
 */
export const FLOOR_HEIGHT = 3;
export const TERRACE_DEPTH = 3;
/** Espacement des portes = 2 × profondeur de terrasse : les portes de deux parois successives s'intercalent. */
export const DOOR_SPACING = TERRACE_DEPTH * 2;
export const CORNER_MARGIN = 1;
export const DOOR_WIDTH = 1.4;
export const DOOR_HEIGHT = 2.2;
export const HOLE_WIDTH = 1.2;
/** Un trou est décalé d'un quart d'espacement par rapport à une porte : il ne bloque jamais une porte. */
export const HOLE_OFFSET = DOOR_SPACING / 4;
export const GROUND_DEPTH = 7;
export const INTERACT_RANGE = 1.8;

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
  kind: 'ground' | 'block' | 'boundary';
  /** Pour les blocs : numéro de la paroi (étage). */
  floor?: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Normale sortante et tangente (de gauche à droite vu de l'extérieur) de chaque face. */
const SIDES = [
  { out: [0, 1], tan: [1, 0] }, // sud (+z)
  { out: [1, 0], tan: [0, -1] }, // est (+x)
  { out: [0, -1], tan: [-1, 0] }, // nord (-z)
  { out: [-1, 0], tan: [0, 1] }, // ouest (-x)
] as const;

export function sideFrame(side: number) {
  const s = SIDES[side];
  return { outX: s.out[0], outZ: s.out[1], tanX: s.tan[0], tanZ: s.tan[1] };
}

/** Demi-largeur de la paroi de l'étage `floor`. */
export function wallHalf(config: PyramidConfig, floor: number): number {
  return (doorsPerSide(config, floor) * DOOR_SPACING + 2 * CORNER_MARGIN) / 2;
}

/** Demi-largeur extérieure de la terrasse de l'étage `floor`. */
export function terraceOuterHalf(config: PyramidConfig, floor: number): number {
  return floor <= 1 ? wallHalf(config, 1) + GROUND_DEPTH : wallHalf(config, floor - 1);
}

export function floorY(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT;
}

/** Étage correspondant à une hauteur de pieds (floors + 1 = sommet). */
export function floorAtY(config: PyramidConfig, y: number): number {
  return Math.max(1, Math.min(config.floors + 1, Math.round(y / FLOOR_HEIGHT) + 1));
}

export function doorTangent(config: PyramidConfig, floor: number, slot: number): number {
  return -wallHalf(config, floor) + CORNER_MARGIN + DOOR_SPACING * (slot + 0.5);
}

export function holeTangent(config: PyramidConfig, hole: Hole): number {
  return doorTangent(config, hole.floor, hole.slot) + HOLE_OFFSET;
}

function onSide(side: number, radius: number, tangent: number, y: number): Vec3 {
  const f = sideFrame(side);
  return { x: f.outX * radius + f.tanX * tangent, y, z: f.outZ * radius + f.tanZ * tangent };
}

/** Centre de la porte, sur la face de la paroi. */
export function doorCenter(config: PyramidConfig, door: Door): Vec3 {
  return onSide(door.side, wallHalf(config, door.floor), doorTangent(config, door.floor, door.slot), floorY(door.floor) + DOOR_HEIGHT / 2);
}

/** Point au sol devant la porte, d'où l'on interagit. */
export function doorFront(config: PyramidConfig, door: Door): Vec3 {
  return onSide(door.side, wallHalf(config, door.floor) + 0.9, doorTangent(config, door.floor, door.slot), floorY(door.floor));
}

/**
 * Point d'arrivée sûr sur une terrasse, sur la même face et au plus près de `tangent`.
 * Il est aligné sur la grille des portes : il tombe toujours à HOLE_OFFSET d'un trou, jamais dedans.
 */
export function landingPoint(config: PyramidConfig, floor: number, side: number, tangent: number): Vec3 {
  if (floor > config.floors) {
    const half = wallHalf(config, config.floors);
    return onSide(side, half * 0.45, Math.max(-half * 0.5, Math.min(half * 0.5, tangent)), floorY(floor));
  }
  const inner = wallHalf(config, floor);
  const grid0 = doorTangent(config, floor, 0);
  const step = DOOR_SPACING / 2;
  const limit = inner - CORNER_MARGIN - step / 2;
  const clamped = Math.max(-limit, Math.min(limit, tangent));
  const snapped = grid0 + Math.round((clamped - grid0) / step) * step;
  return onSide(side, terraceMidHalf(config, floor), snapped, floorY(floor));
}

/** Demi-largeur de la ligne médiane d'une terrasse (là où l'on marche). */
export function terraceMidHalf(config: PyramidConfig, floor: number): number {
  const inner = wallHalf(config, floor);
  const outer = floor === 1 ? inner + 3 : terraceOuterHalf(config, floor);
  return (inner + outer) / 2;
}

/**
 * Point situé à `distance` mètres le long de la ligne médiane d'une terrasse, en partant de (side, tangent),
 * en tournant aux coins. distance > 0 = sens des portes croissantes (même sens que Door.ring).
 */
export function walkTerrace(config: PyramidConfig, floor: number, side: number, tangent: number, distance: number): Vec3 {
  const r = terraceMidHalf(config, floor);
  let s = side;
  let t = Math.max(-r, Math.min(r, tangent));
  let d = distance;
  while (Math.abs(d) > 1e-6) {
    if (d > 0) {
      const room = r - t;
      if (d <= room) {
        t += d;
        d = 0;
      } else {
        d -= room;
        s = (s + 1) % 4;
        t = -r;
      }
    } else {
      const room = t + r;
      if (-d <= room) {
        t += d;
        d = 0;
      } else {
        d += room;
        s = (s + 3) % 4;
        t = r;
      }
    }
  }
  return onSide(s, r, t, floorY(floor));
}

/** Point de départ : étage 1, face sud, au centre. */
export function spawnPoint(config: PyramidConfig): Vec3 {
  return onSide(0, wallHalf(config, 1) + 3.5, 0, 0);
}

/** Toutes les boîtes de collision du monde (alignées sur les axes). */
export function buildColliders(layout: Layout): Box[] {
  const { config } = layout;
  const boxes: Box[] = [];
  const groundHalf = terraceOuterHalf(config, 1);

  boxes.push({ min: [-200, -1, -200], max: [200, 0, 200], kind: 'ground' });
  const t = 1;
  const h = 6;
  boxes.push({ min: [-groundHalf - t, 0, -groundHalf - t], max: [groundHalf + t, h, -groundHalf], kind: 'boundary' });
  boxes.push({ min: [-groundHalf - t, 0, groundHalf], max: [groundHalf + t, h, groundHalf + t], kind: 'boundary' });
  boxes.push({ min: [-groundHalf - t, 0, -groundHalf], max: [-groundHalf, h, groundHalf], kind: 'boundary' });
  boxes.push({ min: [groundHalf, 0, -groundHalf], max: [groundHalf + t, h, groundHalf], kind: 'boundary' });

  for (let floor = 1; floor <= config.floors; floor++) {
    const y0 = floorY(floor);
    const y1 = y0 + FLOOR_HEIGHT;
    const a = wallHalf(config, floor);
    if (floor === config.floors) {
      boxes.push({ min: [-a, y0, -a], max: [a, y1, a], kind: 'block', floor });
      continue;
    }
    // Noyau (sous la paroi suivante) + anneau découpé par les trous de la terrasse floor + 1.
    const b = wallHalf(config, floor + 1);
    boxes.push({ min: [-b, y0, -b], max: [b, y1, b], kind: 'block', floor });
    const holes = layout.holes.filter((hole) => hole.floor === floor + 1);
    for (let side = 0; side < 4; side++) {
      const f = sideFrame(side);
      const alongX = f.tanX !== 0;
      const range = side % 2 === 0 ? a : b; // sud/nord couvrent les coins
      const cuts = holes
        .filter((hole) => hole.side === side)
        .map((hole) => {
          const c = holeTangent(config, hole) * (alongX ? f.tanX : f.tanZ);
          return [c - HOLE_WIDTH / 2, c + HOLE_WIDTH / 2] as const;
        })
        .sort((p, q) => p[0] - q[0]);
      const pieces: [number, number][] = [];
      let start = -range;
      for (const [lo, hi] of cuts) {
        if (lo > start) pieces.push([start, lo]);
        start = Math.max(start, hi);
      }
      if (start < range) pieces.push([start, range]);
      const out = f.outX !== 0 ? f.outX : f.outZ;
      const r0 = out > 0 ? b : -a;
      const r1 = out > 0 ? a : -b;
      for (const [lo, hi] of pieces) {
        boxes.push(
          alongX
            ? { min: [lo, y0, r0], max: [hi, y1, r1], kind: 'block', floor }
            : { min: [r0, y0, lo], max: [r1, y1, hi], kind: 'block', floor },
        );
      }
    }
  }
  return boxes;
}
