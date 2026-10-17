import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildColliders,
  doorTangent,
  floorY,
  holeTangent,
  sideFrame,
  terraceOuterHalf,
  wallHalf,
  FLOOR_HEIGHT,
  HOLE_WIDTH,
  Rng,
  choice,
  color,
  cssColor,
  models,
  num,
  numbers,
  vector,
  type Layout,
} from '../../../core';
import { instancedModel } from '../models';
import { canvasTexture, defineComponent, place, type SceneContext } from './component';
import { onSide, sideRotation } from './slots';

/**
 * Maçonnerie : de vraies pierres (modèles 3D d'un kit, ex. art/temple/build_kit.py) posées sur la pyramide.
 * - `masonry` : blocs sur les parois (moyens, grands, et blocs doubles qui couvrent deux assises) ;
 * - `flagstones` : dalles sur les terrasses et l'esplanade, à la place du carrelage.
 * Le monde reste la structure (collisions, ombres portées) ; les pierres l'habillent, en léger relief.
 * Calcul en deux temps : où poser chaque pierre (pur calcul, testé : suit les surfaces visibles, s'arrête aux trous,
 * laisse libres les encadrements de portes), puis une InstancedMesh par modèle du kit (un appel de dessin chacune,
 * quel que soit le nombre de pierres), teinte tirée de la palette du thème avec de légères variations.
 * Changer de kit (glace, lave…) = changer `kit` dans le thème ; les modèles suivent la fiche du § 7.3
 * (origine au centre de la base ; blocs : face visible vers +Z ; dalles : dessus vers +Y).
 */

const EPS = 1e-6;
/** Largeur minimale d'une pierre (m) : les éclats plus étroits (entre un encadrement et un trou) restent nus. */
const MIN_PIECE = 0.25;

type Interval = [number, number];

/** Une pièce du kit, vue par le calcul de placement : sa largeur, et si elle couvre deux assises. */
export interface KitPiece {
  width: number;
  tall?: boolean;
}

export interface Piece {
  /** Centre le long de l'intervalle, largeur visée (joint déduit), indice de la pièce du kit. */
  center: number;
  width: number;
  variant: number;
}

/**
 * Remplit un intervalle de pièces tirées au hasard parmi `variants` ; la dernière est ajustée pour finir pile au bord
 * (un seul morceau ajusté plutôt qu'un éclat trop étroit). Partagé par les blocs et les dalles.
 */
export function fillInterval(lo: number, hi: number, pieces: KitPiece[], variants: number[], joint: number, rng: Rng): Piece[] {
  const out: Piece[] = [];
  if (!variants.length) return out;
  const minWidth = Math.min(...variants.map((v) => pieces[v].width)) * 0.6;
  let x = lo;
  while (hi - x > MIN_PIECE) {
    const left = hi - x;
    let variant = variants[rng.int(0, variants.length - 1)];
    let width = pieces[variant].width * (0.92 + rng.next() * 0.16);
    if (left - width < minWidth) {
      width = left;
      variant = variants.reduce((best, v) => (Math.abs(pieces[v].width - left) < Math.abs(pieces[best].width - left) ? v : best));
    }
    out.push({ center: x + width / 2, width: width - joint, variant });
    x += width;
  }
  return out;
}

/** Retire des intervalles les zones données. */
function subtract(intervals: Interval[], cuts: Interval[]): Interval[] {
  let result = intervals;
  for (const [cLo, cHi] of cuts) {
    result = result.flatMap(([lo, hi]): Interval[] => {
      if (cHi <= lo || cLo >= hi) return [[lo, hi]];
      return [...(cLo > lo ? [[lo, cLo] as Interval] : []), ...(cHi < hi ? [[cHi, hi] as Interval] : [])];
    });
  }
  return result;
}

// ---------- Parois ----------

export interface MasonryOptions {
  /** Hauteurs des assises d'un étage (ramenées à la hauteur d'un étage) : la dernière passe au-dessus des portes. */
  courses: number[];
  /** Part des blocs doubles (couvrant deux assises) là où c'est possible. */
  tall: number;
  /** Relief des blocs devant la paroi (m). Les décors accrochés aux parois se décalent d'autant. */
  relief: number;
  /** Joint entre deux blocs (m). */
  joint: number;
  /** Zone laissée libre autour de chaque porte : demi-largeur et hauteur (m). */
  doorClear: [number, number];
}

export interface BlockPlacement extends Piece {
  floor: number;
  side: number;
  /** Base du bloc et hauteur visée (m). */
  y: number;
  height: number;
}

/** Intervalles le long de chaque face de chaque étage, là où la paroi est visible de l'extérieur. */
function wallFaces(layout: Layout): Map<string, Interval[]> {
  const { config } = layout;
  const faces = new Map<string, Interval[]>();
  for (const box of buildColliders(layout)) {
    if (box.kind !== 'block') continue;
    const a = wallHalf(config, box.floor!);
    for (let side = 0; side < 4; side++) {
      const f = sideFrame(side);
      // La face de la boîte tournée vers l'extérieur de ce côté doit être sur le parement (distance a du centre).
      const radial = f.outX > 0 ? box.max[0] : f.outX < 0 ? -box.min[0] : f.outZ > 0 ? box.max[2] : -box.min[2];
      if (Math.abs(radial - a) > EPS) continue;
      const ends = f.tanX !== 0 ? [box.min[0] * f.tanX, box.max[0] * f.tanX] : [box.min[2] * f.tanZ, box.max[2] * f.tanZ];
      const key = `${box.floor}:${side}`;
      faces.set(key, [...(faces.get(key) ?? []), [Math.min(...ends), Math.max(...ends)]]);
    }
  }
  // Morceaux contigus fusionnés (les découpes des trous restent des interruptions).
  for (const [key, list] of faces) {
    list.sort((p, q) => p[0] - q[0]);
    const merged: Interval[] = [];
    for (const [lo, hi] of list) {
      const last = merged[merged.length - 1];
      if (last && lo <= last[1] + EPS) last[1] = Math.max(last[1], hi);
      else merged.push([lo, hi]);
    }
    faces.set(key, merged);
  }
  return faces;
}

/** Position de chaque bloc de paroi. Déterministe pour une graine donnée. */
export function masonryLayout(layout: Layout, pieces: KitPiece[], o: Omit<MasonryOptions, 'tall'> & { tall?: number }, rng: Rng): BlockPlacement[] {
  const { config } = layout;
  const total = o.courses.reduce((s, h) => s + h, 0);
  const heights = o.courses.map((h) => (h / total) * FLOOR_HEIGHT);
  const singles = pieces.map((_, i) => i).filter((i) => !pieces[i].tall);
  const talls = pieces.map((_, i) => i).filter((i) => pieces[i].tall);
  const blocks: BlockPlacement[] = [];
  for (const [key, faces] of wallFaces(layout)) {
    const [floor, side] = key.split(':').map(Number);
    const a = wallHalf(config, floor);
    const y0 = floorY(floor);
    const doors = layout.doors.filter((d) => d.floor === floor && d.side === side).map((d) => doorTangent(config, floor, d.slot));
    const nearDoor = (course: number) => y0 + heights.slice(0, course).reduce((s, h) => s + h, 0) < y0 + o.doorClear[1] - EPS;
    // Zones de l'assise suivante déjà occupées par un bloc double.
    let reserved: Interval[] = [];
    let y = y0;
    heights.forEach((height, course) => {
      const cuts = nearDoor(course) ? doors.map((t): Interval => [t - o.doorClear[0], t + o.doorClear[0]]) : [];
      // Un bloc double n'est possible que si l'assise suivante a exactement les mêmes découpes.
      const canDouble = talls.length > 0 && course + 1 < heights.length && nearDoor(course) === nearDoor(course + 1);
      // Angles croisés : une assise sur deux, la face déborde du relief pour couvrir l'arête (sud/nord, puis est/ouest).
      const cross = (course + side) % 2 === 0 ? o.relief : 0;
      const extended = faces.map(([lo, hi]): Interval => [lo <= -a + EPS ? lo - cross : lo, hi >= a - EPS ? hi + cross : hi]);
      const next: Interval[] = [];
      for (const [lo, hi] of subtract(subtract(extended, cuts), reserved)) {
        for (const piece of fillInterval(lo, hi, pieces, singles, o.joint, rng)) {
          const double = canDouble && rng.next() < (o.tall ?? 0);
          if (double) {
            const variant = talls.reduce((best, v) => (Math.abs(pieces[v].width - piece.width) < Math.abs(pieces[best].width - piece.width) ? v : best));
            blocks.push({ ...piece, variant, floor, side, y, height: height + heights[course + 1] - o.joint });
            next.push([piece.center - piece.width / 2 - o.joint / 2, piece.center + piece.width / 2 + o.joint / 2]);
          } else {
            blocks.push({ ...piece, floor, side, y, height: height - o.joint });
          }
        }
      }
      reserved = next;
      y += height;
    });
  }
  return blocks;
}

// ---------- Sols ----------

export interface SlabPlacement extends Piece {
  floor: number;
  /** Centre de la dalle dans le plan et hauteur du sol (m) ; `alongX` : la longueur suit l'axe x. */
  x: number;
  z: number;
  y: number;
  depth: number;
  alongX: boolean;
}

interface Surface {
  floor: number;
  y: number;
  min: [number, number];
  max: [number, number];
}

/** Où poser les dalles : partout, ou seulement sur la pyramide (terrasses et sommet, l'esplanade restant du sable). */
const PAVING_AREAS = ['all', 'terraces'] as const;
export type PavingArea = (typeof PAVING_AREAS)[number];

/** Surfaces où l'on marche : esplanade autour de la pyramide (selon `where`), terrasses (hors trous), sommet. */
function walkSurfaces(layout: Layout, where: PavingArea): Surface[] {
  const { config } = layout;
  const a = wallHalf(config, 1);
  const g = terraceOuterHalf(config, 1);
  const surfaces: Surface[] =
    where === 'all'
      ? [
          { floor: 1, y: 0, min: [-g, a], max: [g, g] },
          { floor: 1, y: 0, min: [-g, -g], max: [g, -a] },
          { floor: 1, y: 0, min: [a, -a], max: [g, a] },
          { floor: 1, y: 0, min: [-g, -a], max: [-a, a] },
        ]
      : [];
  for (const box of buildColliders(layout)) {
    if (box.kind !== 'block') continue;
    const floor = box.floor!;
    // Le noyau d'un étage est entièrement couvert par la paroi de l'étage suivant.
    if (floor < config.floors) {
      const b = wallHalf(config, floor + 1);
      if (Math.abs(box.min[0] + b) < EPS && Math.abs(box.max[0] - b) < EPS && Math.abs(box.min[2] + b) < EPS && Math.abs(box.max[2] - b) < EPS) continue;
    }
    surfaces.push({ floor: floor + 1, y: box.max[1], min: [box.min[0], box.min[2]], max: [box.max[0], box.max[2]] });
  }
  return surfaces;
}

/** Position de chaque dalle : rangées parallèles au grand côté de chaque surface, de profondeurs variées. */
export function pavingLayout(
  layout: Layout,
  pieces: KitPiece[],
  o: { rows: [number, number]; joint: number; where?: PavingArea },
  rng: Rng,
): SlabPlacement[] {
  const all = pieces.map((_, i) => i);
  const slabs: SlabPlacement[] = [];
  for (const s of walkSurfaces(layout, o.where ?? 'all')) {
    const alongX = s.max[0] - s.min[0] >= s.max[1] - s.min[1];
    const [l0, l1] = alongX ? [s.min[0], s.max[0]] : [s.min[1], s.max[1]];
    const [d0, d1] = alongX ? [s.min[1], s.max[1]] : [s.min[0], s.max[0]];
    let d = d0;
    while (d1 - d > EPS) {
      let depth = o.rows[0] + rng.next() * (o.rows[1] - o.rows[0]);
      if (d1 - d - depth < o.rows[0] * 0.6) depth = d1 - d;
      const across = d + depth / 2;
      for (const piece of fillInterval(l0, l1, pieces, all, o.joint, rng)) {
        slabs.push({ ...piece, floor: s.floor, y: s.y, depth: depth - o.joint, alongX, x: alongX ? piece.center : across, z: alongX ? across : piece.center });
      }
      d += depth;
    }
  }
  return slabs;
}

// ---------- Rendu ----------

/** Grain du grès (fines taches claires et sombres), répété sur les pierres : se multiplie aux couleurs des sommets. */
function grainTexture(): THREE.CanvasTexture {
  const rng = new Rng(0x9a1e);
  const texture = canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const light = rng.next() < 0.45;
        ctx.fillStyle = light ? `rgba(255,255,255,${0.25 + rng.next() * 0.3})` : `rgba(90,60,40,${0.04 + rng.next() * 0.07})`;
        const s = 1 + rng.next() * (light ? 2 : 2.5);
        ctx.fillRect(rng.next() * 256, rng.next() * 256, s, s);
      }
      // Quelques creux (piqûres de la pierre).
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(70,40,20,${0.06 + rng.next() * 0.08})`;
        ctx.beginPath();
        ctx.arc(rng.next() * 256, rng.next() * 256, 1.5 + rng.next() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    true,
  );
  // Les UV du kit sont en mètres : une répétition tous les 1,6 m.
  texture.repeat.set(1 / 1.6, 1 / 1.6);
  return texture;
}

/** Boîte englobante des modèles du kit, mesurée une fois. */
const boxes = new Map<string, THREE.Box3>();
function modelBox(name: string): THREE.Box3 {
  let box = boxes.get(name);
  if (!box) {
    box = new THREE.Box3();
    const probe = instancedModel(name, [new THREE.Matrix4()], {}, false);
    for (const mesh of probe.children as THREE.InstancedMesh[]) {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!);
      (mesh.material as THREE.Material).dispose();
    }
    boxes.set(name, box);
  }
  return box;
}
const modelSize = (name: string) => modelBox(name).getSize(new THREE.Vector3());

/** Modèles à utiliser selon la qualité (version `_lo` sur les appareils modestes) et à précharger (les deux). */
const kitNames = (kit: string[], lowQuality: boolean) => kit.map((name) => (lowQuality ? `${name}_lo` : name));
const kitPreload = (kit: string[]) => kit.flatMap((name) => [name, `${name}_lo`]);

/**
 * Pose les pierres : une InstancedMesh par modèle, teinte de chaque pierre = couleur donnée × légère variation
 * (clarté, saturation, une pointe de teinte).
 */
function addStones<P extends { variant: number }>(
  scene: THREE.Scene,
  names: string[],
  stones: P[],
  matrix: (stone: P, box: THREE.Box3, size: THREE.Vector3) => THREE.Matrix4,
  tintOf: (stone: P) => THREE.Color,
  tint: number,
  rng: Rng,
): void {
  const grain = grainTexture();
  const color = new THREE.Color();
  names.forEach((name, variant) => {
    const own = stones.filter((s) => s.variant === variant);
    if (!own.length) return;
    const box = modelBox(name);
    const size = box.getSize(new THREE.Vector3());
    const group = instancedModel(name, own.map((s) => matrix(s, box, size)), {}, false);
    for (const mesh of group.children as THREE.InstancedMesh[]) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(0xffffff);
      material.map = grain;
      material.roughness = 0.88;
      own.forEach((s, i) => {
        color.copy(tintOf(s)).offsetHSL((rng.next() - 0.5) * tint * 0.15, (rng.next() - 0.5) * tint, (rng.next() - 0.5) * tint);
        mesh.setColorAt(i, color);
      });
    }
    scene.add(group);
  });
}

const BLOCKS_TEMPLE = ['m1', 'm2', 'l1', 'l2', 't1', 't2'].map((v) => `temple/block_${v}`);
const SLABS_TEMPLE = ['a', 'b', 'c', 'd'].map((v) => `temple/slab_${v}`);

/** Blocs de pierre sur les parois. Un modèle plus haut que les autres (×1,5) est un bloc double. */
export const masonry = defineComponent(
  {
    kit: models(BLOCKS_TEMPLE),
    /** Hauteur de chaque assise d'un étage, de bas en haut (m). */
    courses: numbers([1.2, 1.2, 0.6], { min: 0.1 }),
    tall: num(0.22, { min: 0, max: 1, step: 0.01 }),
    relief: num(0.06, { min: 0, step: 0.01 }),
    joint: num(0.03, { min: 0, step: 0.005 }),
    doorClear: vector([1.1, 2.4], { min: 0, step: 0.05 }),
    tint: num(0.07, { min: 0, max: 1, step: 0.01 }),
  },
  (ctx, o) => {
    const { layout, theme, scene } = ctx;
    ctx.anchors.wallRelief = o.relief;
    const names = kitNames(o.kit, ctx.lowQuality);
    const sizes = names.map(modelSize);
    const unit = Math.min(...sizes.map((s) => s.y));
    const pieces = sizes.map((s) => ({ width: s.x, tall: s.y > unit * 1.5 }));
    const rng = new Rng(layout.seed ^ 0x5701e);
    const stone = theme.stone.map((c) => new THREE.Color(c));
    addStones(
      scene,
      names,
      masonryLayout(layout, pieces, o, rng),
      // La face avant du modèle (box.max.z) affleure à `relief` devant la paroi.
      (b, box, size) =>
        place(onSide(b.side, wallHalf(layout.config, b.floor) + o.relief - box.max.z, b.center, b.y), sideRotation(b.side), new THREE.Vector3(b.width / size.x, b.height / size.y, 1)),
      // Pierres alternées d'un étage à l'autre (palette du thème).
      (b) => stone[b.floor % stone.length],
      o.tint,
      rng,
    );
  },
  (o) => kitPreload(o.kit),
);

/**
 * Dalles de pierre sur les terrasses (et l'esplanade si `where: 'all'`), légèrement au-dessus du sol.
 * `size` agrandit les dalles du kit ; `color` remplace la teinte du thème (vide : theme.top / theme.paving) —
 * des dalles plus claires et plus grandes que les blocs des murs distinguent bien le sol où l'on marche.
 */
export const flagstones = defineComponent(
  {
    kit: models(SLABS_TEMPLE),
    where: choice('all', PAVING_AREAS),
    size: num(1, { min: 0.1, step: 0.05 }),
    color: cssColor(''),
    /** Profondeur des rangées (min, max) en mètres. */
    rows: vector([0.9, 1.4], { min: 0.1, step: 0.05 }),
    joint: num(0.035, { min: 0, step: 0.005 }),
    raise: num(0.03, { min: 0, step: 0.005 }),
    tint: num(0.08, { min: 0, max: 1, step: 0.01 }),
  },
  (ctx, o) => {
    const { layout, theme, scene } = ctx;
    ctx.anchors.floorRaise = o.raise;
    const names = kitNames(o.kit, ctx.lowQuality);
    const pieces = names.map((name) => ({ width: modelSize(name).x * o.size }));
    const rng = new Rng(layout.seed ^ 0xf1a65);
    const esplanade = new THREE.Color(o.color || theme.paving);
    const terraces = new THREE.Color(o.color || theme.top);
    const turn = new THREE.Quaternion();
    addStones(
      scene,
      names,
      pavingLayout(layout, pieces, o, rng),
      (s, _box, size) => {
        // Modèle : longueur sur x, largeur sur z ; tourné d'un quart de tour quand la rangée suit l'axe z.
        turn.setFromAxisAngle(UP, s.alongX ? 0 : Math.PI / 2);
        const scale = new THREE.Vector3(s.width / size.x, 1, s.depth / size.z);
        return new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + o.raise - size.y, s.z), turn, scale);
      },
      (s) => (s.floor === 1 ? esplanade : terraces),
      o.tint,
      rng,
    );
  },
  (o) => kitPreload(o.kit),
);

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Bandes posées sur le sol au pied des parois (une par face et par étage, interrompues au-dessus des trous),
 * fusionnées en une géométrie. UV : u en mètres le long de la paroi / `tile`, v = 1 contre la paroi, 0 au bord.
 */
export function footBands(ctx: SceneContext, width: number, lift: number, fromFloor = 1, tile = 0): THREE.BufferGeometry | null {
  const { layout } = ctx;
  const { config } = layout;
  const relief = ctx.anchors.wallRelief ?? 0;
  const parts: THREE.BufferGeometry[] = [];
  for (let floor = fromFloor; floor <= config.floors; floor++) {
    const a = wallHalf(config, floor) + relief;
    const y = floorY(floor) + (ctx.anchors.floorRaise ?? 0) + lift;
    for (let side = 0; side < 4; side++) {
      // Sud et nord couvrent les angles.
      const reach = side % 2 === 0 ? a + width : a;
      const holes = layout.holes
        .filter((h) => h.floor === floor && h.side === side)
        .map((h): Interval => [holeTangent(config, h) - HOLE_WIDTH / 2, holeTangent(config, h) + HOLE_WIDTH / 2]);
      for (const [lo, hi] of subtract([[-reach, reach]], holes)) {
        const g = new THREE.PlaneGeometry(hi - lo, width);
        if (tile > 0) {
          const uv = g.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) uv.setX(i, (lo + uv.getX(i) * (hi - lo)) / tile);
        }
        g.rotateX(-Math.PI / 2);
        g.translate((lo + hi) / 2, 0, width / 2);
        g.applyMatrix4(place(onSide(side, a, 0, y), sideRotation(side)));
        parts.push(g);
      }
    }
  }
  return parts.length ? mergeGeometries(parts) : null;
}

/**
 * Ombres de contact au pied des parois (occlusion ambiante simulée) : une bande dégradée posée sur chaque terrasse,
 * interrompue au-dessus des trous. Un seul appel de dessin, aucun calcul de lumière.
 */
export const wallShadows = defineComponent({ width: num(1.1, { min: 0, step: 0.05 }), strength: num(0.45, { min: 0, max: 1, step: 0.01 }), color: color(0x3a1d10) }, (ctx, o) => {
  const geometry = footBands(ctx, o.width, 0.02);
  if (!geometry) return;
  const texture = canvasTexture(4, 64, (c) => {
    const gradient = c.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 4, 64);
  });
  const material = new THREE.MeshBasicMaterial({
    color: o.color,
    alphaMap: texture,
    transparent: true,
    opacity: o.strength,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  ctx.scene.add(mesh);
});
