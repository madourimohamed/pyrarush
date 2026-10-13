import * as THREE from 'three';
import type { Layout } from '../../../core';
import { instancedModel, isModelReady, modelHeight } from '../models';
import { defineComponent, place, type SceneContext } from './component';
import { cornerInsetSlots, facadeFlankSlots, ringPoint, terraceEdgeSlots, wallFootSlots, type Slot } from './slots';

/** Où poser les objets : sur la rive, autour de l'étang, au pied des parois, aux coins ou au bord des terrasses, de part et d'autre des entrées. */
export type Placement = 'shore' | 'pondside' | 'wallFoot' | 'terraceCorner' | 'terraceEdge' | 'facade';

interface Spot {
  position: THREE.Vector3;
  rotationY: number;
}

/**
 * Modèles 3D posés en nombre (palmiers, buissons, statues, pots…). Un seul composant pour tous les objets :
 * le thème choisit les modèles (variantes tirées au hasard), l'emplacement, la taille et les couleurs.
 *   { use: 'props', id: 'palmiers', models: ['tree_palm', 'tree_palmBend'], place: 'shore', count: 30, height: [6, 9] }
 */
export const props = defineComponent(
  {
    models: [] as string[],
    place: 'shore' as Placement,
    /** Nombre d'objets (emplacements aléatoires : shore, pondside). */
    count: 10,
    /** Un emplacement sur N, et décalage du motif (emplacements fixes). */
    every: 1,
    offset: 0,
    /** Hauteur visée en mètres, tirée entre min et max. */
    height: [1, 1] as [number, number],
    /** Écart de part et d'autre de l'entrée (facade) ou vers l'intérieur du coin (terraceCorner). */
    spacing: 1.75,
    /** Recoloration par nom de matériau (ex. { leafs: 0x3f9e4d }). */
    colors: {} as Record<string, number>,
    /** Rotation aléatoire autour de la verticale (sinon : orienté comme l'emplacement). */
    randomRotation: true,
    /** Balancement au vent (0 = immobile) : déplacement du sommet, en fraction de la hauteur (ex. 0.03 pour un palmier). */
    sway: 0,
  },
  (ctx, o) => {
    const models = o.models.filter(isModelReady);
    if (!models.length) return;
    const byModel = new Map<string, THREE.Matrix4[]>();
    for (const spot of spots(ctx, o)) {
      const name = models[ctx.rng.int(0, models.length - 1)];
      const height = o.height[0] + ctx.rng.next() * (o.height[1] - o.height[0]);
      const rotation = o.randomRotation ? ctx.rng.next() * Math.PI * 2 : spot.rotationY;
      if (!byModel.has(name)) byModel.set(name, []);
      byModel.get(name)!.push(place(spot.position, rotation, height / modelHeight(name)));
    }
    const time = { value: 0 };
    for (const [name, matrices] of byModel) {
      const group = instancedModel(name, matrices, o.colors);
      if (o.sway > 0) group.traverse((obj) => obj instanceof THREE.Mesh && addSway(obj.material as THREE.Material, modelHeight(name), o.sway, time));
      ctx.scene.add(group);
    }
    if (o.sway > 0) return { update: (_dt, t) => void (time.value = t) };
  },
  (o) => o.models,
);

/**
 * Balancement au vent dans le vertex shader : le haut du modèle oscille (amplitude croissante avec la hauteur),
 * chaque exemplaire avec sa propre phase (tirée de sa position) ; les feuilles frémissent en plus.
 */
function addSway(material: THREE.Material, height: number, amount: number, time: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.swayTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float swayTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          float h = clamp(transformed.y / ${height.toFixed(3)}, 0.0, 1.0);
          float bend = h * h * ${(amount * height).toFixed(4)};
          vec2 seed = instanceMatrix[3].xz;
          float phase = seed.x * 0.37 + seed.y * 0.23;
          float gust = 0.6 + 0.4 * sin(swayTime * 0.35 + phase * 0.5);
          transformed.x += bend * gust * (sin(swayTime * 1.3 + phase) + 0.35 * sin(swayTime * 2.9 + phase * 1.7));
          transformed.z += bend * gust * 0.6 * cos(swayTime * 1.1 + phase * 1.3);
          transformed.y += bend * 0.15 * h * sin(swayTime * 5.0 + transformed.x * 2.0 + transformed.z * 1.7 + phase);
        }`,
      );
  };
  material.customProgramCacheKey = () => `sway:${height.toFixed(3)}:${amount}`;
}

/** Emplacements sur la pyramide (calculés depuis la géométrie du jeu) ; null pour les emplacements extérieurs. */
export function propSlots(layout: Layout, o: Pick<typeof props.defaults, 'place' | 'every' | 'offset' | 'spacing'>): Slot[] | null {
  switch (o.place) {
    case 'wallFoot':
      return wallFootSlots(layout, o.every, o.offset);
    case 'terraceEdge':
      return terraceEdgeSlots(layout, o.every);
    case 'terraceCorner':
      return cornerInsetSlots(layout, o.spacing);
    case 'facade':
      return facadeFlankSlots(layout, o.spacing);
    default:
      return null;
  }
}

function spots(ctx: SceneContext, o: typeof props.defaults): Spot[] {
  const { rng } = ctx;
  const onPyramid = propSlots(ctx.layout, o);
  if (onPyramid) return onPyramid.map((s) => ({ position: s.position.clone(), rotationY: s.rotationY }));
  switch (o.place) {
    case 'pondside': {
      const pond = ctx.anchors.pond;
      if (!pond) return [];
      return Array.from({ length: o.count }, () => {
        const a = rng.next() * Math.PI * 2;
        const r = 11 + rng.next() * 4;
        return { position: new THREE.Vector3(pond.x + Math.cos(a) * r, 0, pond.z + Math.sin(a) * r), rotationY: 0 };
      });
    }
    default: {
      const inner = ctx.groundHalf + (ctx.anchors.moatWidth ? ctx.anchors.moatWidth + 1.8 : 4);
      return Array.from({ length: o.count }, () => ({ position: ringPoint(rng, inner, inner + 26), rotationY: 0 }));
    }
  }
}
