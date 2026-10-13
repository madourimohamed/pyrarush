import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildColliders, doorTangent, floorY, holeTangent, sideFrame, wallHalf, FLOOR_HEIGHT, HOLE_WIDTH, Rng, type Layout } from '../../../core';
import { instancedModel } from '../models';
import { canvasTexture, defineComponent, place } from './component';
import { onSide, sideRotation } from './slots';

/**
 * Maçonnerie : de vrais blocs de pierre (modèles 3D d'un kit, ex. art/temple/build_kit.py) posés sur les parois.
 * Les parois du monde restent la structure (collisions, ombres portées) ; les blocs les habillent, en léger relief.
 * Calcul en deux temps :
 * - masonryLayout : où poser chaque bloc (pur calcul, testé) — suit exactement les faces visibles des parois,
 *   s'arrête aux trous, laisse libres les encadrements de portes, croise les blocs aux angles ;
 * - le composant : une InstancedMesh par variante du kit (un appel de dessin chacune, quel que soit le nombre de blocs),
 *   teinte de chaque bloc tirée de la palette du thème (pierres alternées par étage) avec de légères variations.
 * Changer de kit (glace, lave…) = changer `kit` dans le thème ; les modèles suivent la fiche du § 7.3 (origine au centre
 * de la base, face visible vers +Z).
 */

export interface MasonryOptions {
  /** Hauteurs des assises d'un étage (ramenées à la hauteur d'un étage) : la dernière passe au-dessus des portes. */
  courses: number[];
  /** Relief des blocs devant la paroi (m). Les décors accrochés aux parois se décalent d'autant. */
  relief: number;
  /** Joint entre deux blocs (m). */
  joint: number;
  /** Zone laissée libre autour de chaque porte : demi-largeur et hauteur (m). */
  doorClear: [number, number];
  /** Variation de teinte d'un bloc à l'autre (0 = uniforme). */
  tint: number;
}

export interface BlockPlacement {
  floor: number;
  side: number;
  /** Centre du bloc le long de la face, base de l'assise, largeur et hauteur visées (m). */
  tangent: number;
  y: number;
  width: number;
  height: number;
  /** Indice de la variante (dans la liste des largeurs fournies). */
  variant: number;
}

const EPS = 1e-6;
/** Largeur minimale d'un bloc (m). */
const MIN_PIECE = 0.25;

/** Intervalles [début, fin] le long de chaque face de chaque étage, là où la paroi est visible de l'extérieur. */
function wallFaces(layout: Layout): Map<string, [number, number][]> {
  const { config } = layout;
  const faces = new Map<string, [number, number][]>();
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
    const merged: [number, number][] = [];
    for (const [lo, hi] of list) {
      const last = merged[merged.length - 1];
      if (last && lo <= last[1] + EPS) last[1] = Math.max(last[1], hi);
      else merged.push([lo, hi]);
    }
    faces.set(key, merged);
  }
  return faces;
}

/** Retire des intervalles les zones [lo, hi] données. */
function subtract(intervals: [number, number][], cuts: [number, number][]): [number, number][] {
  let result = intervals;
  for (const [cLo, cHi] of cuts) {
    result = result.flatMap(([lo, hi]): [number, number][] => {
      if (cHi <= lo || cLo >= hi) return [[lo, hi]];
      return [...(cLo > lo ? [[lo, cLo] as [number, number]] : []), ...(cHi < hi ? [[cHi, hi] as [number, number]] : [])];
    });
  }
  return result;
}

/**
 * Position de chaque bloc. `widths` : largeurs des variantes du kit (m). Déterministe pour une graine donnée.
 * Les blocs d'un intervalle sont tirés au hasard puis le dernier est ajusté pour finir pile au bord.
 */
export function masonryLayout(layout: Layout, widths: number[], o: Pick<MasonryOptions, 'courses' | 'relief' | 'joint' | 'doorClear'>, rng: Rng): BlockPlacement[] {
  const { config } = layout;
  const total = o.courses.reduce((s, h) => s + h, 0);
  const heights = o.courses.map((h) => (h / total) * FLOOR_HEIGHT);
  const minWidth = Math.min(...widths) * 0.6;
  const blocks: BlockPlacement[] = [];
  for (const [key, faces] of wallFaces(layout)) {
    const [floor, side] = key.split(':').map(Number);
    const a = wallHalf(config, floor);
    const doors = layout.doors.filter((d) => d.floor === floor && d.side === side).map((d) => doorTangent(config, floor, d.slot));
    let y = floorY(floor);
    heights.forEach((height, course) => {
      const nearDoor = y < floorY(floor) + o.doorClear[1] - EPS;
      const cuts = nearDoor ? doors.map((t): [number, number] => [t - o.doorClear[0], t + o.doorClear[0]]) : [];
      // Angles croisés : une assise sur deux, la face déborde du relief pour couvrir l'arête (sud/nord, puis est/ouest).
      const cross = (course + side) % 2 === 0 ? o.relief : 0;
      const extended = faces.map(([lo, hi]): [number, number] => [lo <= -a + EPS ? lo - cross : lo, hi >= a - EPS ? hi + cross : hi]);
      for (const [lo, hi] of subtract(extended, cuts)) {
        let x = lo;
        // Les éclats de paroi trop étroits (entre un encadrement et un trou) restent nus : cachés par les piliers.
        while (hi - x > MIN_PIECE) {
          const left = hi - x;
          let variant = rng.int(0, widths.length - 1);
          let width = widths[variant] * (0.92 + rng.next() * 0.16);
          // Fin d'intervalle : un seul bloc ajusté plutôt qu'un éclat trop étroit.
          if (left - width < minWidth) {
            width = left;
            variant = widths.reduce((best, w, i) => (Math.abs(w - left) < Math.abs(widths[best] - left) ? i : best), 0);
          }
          blocks.push({ floor, side, tangent: x + width / 2, y, width: width - o.joint, height: height - o.joint, variant });
          x += width;
        }
      }
      y += height;
    });
  }
  return blocks;
}

/** Grain du grès (fines taches claires et sombres), répété sur les blocs : se multiplie aux couleurs des sommets. */
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
        ctx.fillStyle = light ? `rgba(255,255,255,${0.25 + rng.next() * 0.3})` : `rgba(90,60,40,${0.08 + rng.next() * 0.14})`;
        const s = 1 + rng.next() * (light ? 2 : 3.5);
        ctx.fillRect(rng.next() * 256, rng.next() * 256, s, s);
      }
      // Quelques creux (piqûres de la pierre).
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(70,40,20,${0.12 + rng.next() * 0.12})`;
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

/** Dimensions des modèles du kit, mesurées une fois. */
const sizes = new Map<string, THREE.Vector3>();
function modelSize(name: string): THREE.Vector3 {
  let size = sizes.get(name);
  if (!size) {
    const box = new THREE.Box3();
    const probe = instancedModel(name, [new THREE.Matrix4()], {}, false);
    for (const mesh of probe.children as THREE.InstancedMesh[]) {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!);
      (mesh.material as THREE.Material).dispose();
    }
    size = box.getSize(new THREE.Vector3());
    // Profondeur : distance de l'origine à la face avant (le relief se mesure depuis la face avant).
    size.z = box.max.z;
    sizes.set(name, size);
  }
  return size;
}

const KIT_TEMPLE = ['a', 'b', 'c', 'd', 'e', 'f'].map((v) => `temple/block_${v}`);

export const masonry = defineComponent(
  {
    /** Modèles du kit (version détaillée) ; la version `_lo` est utilisée en qualité réduite. */
    kit: KIT_TEMPLE,
    courses: [0.8, 0.8, 0.8, 0.6],
    relief: 0.06,
    joint: 0.025,
    doorClear: [1.1, 2.4] as [number, number],
    tint: 0.07,
  },
  (ctx, o) => {
    const { layout, theme, lowQuality, scene } = ctx;
    ctx.anchors.wallRelief = o.relief;
    const names = o.kit.map((name) => (lowQuality ? `${name}_lo` : name));
    const measured = names.map(modelSize);
    const rng = new Rng(layout.seed ^ 0x5701e);
    const blocks = masonryLayout(layout, measured.map((s) => s.x), o, rng);

    const stone = theme.stone.map((c) => new THREE.Color(c));
    const grain = grainTexture();
    const color = new THREE.Color();
    names.forEach((name, variant) => {
      const own = blocks.filter((b) => b.variant === variant);
      const size = measured[variant];
      const matrices = own.map((b) =>
        place(onSide(b.side, wallHalf(layout.config, b.floor) + o.relief - size.z, b.tangent, b.y), sideRotation(b.side), new THREE.Vector3(b.width / size.x, b.height / size.y, 1)),
      );
      const group = instancedModel(name, matrices, {}, false);
      for (const mesh of group.children as THREE.InstancedMesh[]) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.set(0xffffff);
        material.map = grain;
        material.roughness = 0.88;
        own.forEach((b, i) => {
          // Teinte de l'étage (pierres alternées) + variation propre à chaque bloc (clarté, très légère dominante).
          color.copy(stone[b.floor % stone.length]).offsetHSL((rng.next() - 0.5) * o.tint * 0.15, (rng.next() - 0.5) * o.tint, (rng.next() - 0.5) * o.tint);
          mesh.setColorAt(i, color);
        });
      }
      scene.add(group);
    });
  },
  (o) => o.kit.flatMap((name) => [name, `${name}_lo`]),
);


/**
 * Ombres de contact au pied des parois (occlusion ambiante simulée) : une bande dégradée posée sur chaque terrasse,
 * interrompue au-dessus des trous. Un seul appel de dessin, aucun calcul de lumière.
 */
export const wallShadows = defineComponent({ width: 1.1, strength: 0.45, color: 0x3a1d10 }, (ctx, o) => {
  const { layout } = ctx;
  const { config } = layout;
  const relief = ctx.anchors.wallRelief ?? 0;
  const parts: THREE.BufferGeometry[] = [];
  for (let floor = 1; floor <= config.floors; floor++) {
    const a = wallHalf(config, floor) + relief;
    const y = floorY(floor) + 0.012;
    for (let side = 0; side < 4; side++) {
      // Sud et nord couvrent les angles.
      const reach = side % 2 === 0 ? a + o.width : a;
      const holes = layout.holes
        .filter((h) => h.floor === floor && h.side === side)
        .map((h): [number, number] => [holeTangent(config, h) - HOLE_WIDTH / 2, holeTangent(config, h) + HOLE_WIDTH / 2]);
      for (const [lo, hi] of subtract([[-reach, reach]], holes)) {
        const g = new THREE.PlaneGeometry(hi - lo, o.width);
        // v = 1 contre la paroi, 0 au bord de la bande.
        g.rotateX(-Math.PI / 2);
        g.translate((lo + hi) / 2, 0, o.width / 2);
        g.applyMatrix4(place(onSide(side, a, 0, y), sideRotation(side)));
        parts.push(g);
      }
    }
  }
  if (!parts.length) return;
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
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.renderOrder = 1;
  ctx.scene.add(mesh);
});
