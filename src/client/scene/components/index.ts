import type { ComponentSpec } from '../../../core';
import { environment, grade } from './ambience';
import type { Component, ComponentInstance, SceneContext } from './component';
import { esplanade, sandDrifts } from './ground';
import { flagstones, masonry, wallShadows } from './masonry';
import { cliffs, distantPyramids, mountains, obelisks, panorama, sky, terrain } from './landscape';
import { banners, braziers, capstone, doorFrames, jars, particles, statues } from './temple';
import { bushes, crystals, palms, pines, spires, terracePlants, vines } from './vegetation';
import { moat, pond } from './water';
import { props } from './props';
import { preloadModels } from '../models';
import { preloadTextures } from '../images';

/**
 * Registre des composants de décor. Un thème de niveau les cite par leur nom (`use`) avec ses options.
 * Ajouter un design = écrire un composant (defineComponent) et l'enregistrer ici.
 */
export const COMPONENTS: Record<string, Component<object>> = {
  environment,
  grade,
  sky,
  panorama,
  terrain,
  mountains,
  distantPyramids,
  obelisks,
  cliffs,
  moat,
  pond,
  palms,
  pines,
  spires,
  crystals,
  bushes,
  vines,
  terracePlants,
  masonry,
  flagstones,
  esplanade,
  sandDrifts,
  wallShadows,
  doorFrames,
  banners,
  braziers,
  statues,
  jars,
  capstone,
  particles,
  props,
} as Record<string, Component<object>>;

/** Précharge les modèles 3D et les images dont les composants d'un thème ont besoin (à attendre avant de construire le niveau). */
export function preloadComponents(specs: ComponentSpec[]): Promise<void> {
  const models: string[] = [];
  const textures: string[] = [];
  for (const { use, ...options } of specs) {
    const component = COMPONENTS[use];
    if (!component) continue;
    const resolved = { ...component.defaults, ...options };
    models.push(...(component.models?.(resolved) ?? []));
    textures.push(...(component.textures?.(resolved) ?? []));
  }
  return Promise.all([preloadModels(models), preloadTextures(textures)]).then(() => undefined);
}

/** Construit les composants d'un thème dans l'ordre ; renvoie la fonction de mise à jour de l'ensemble. */
export function buildComponents(ctx: SceneContext, specs: ComponentSpec[]): (dt: number, time: number) => void {
  const instances: ComponentInstance[] = [];
  for (const { use, id: _id, ...options } of specs) {
    const component = COMPONENTS[use];
    if (!component) {
      console.warn(`Composant de décor inconnu : « ${use} »`);
      continue;
    }
    const instance = component.build(ctx, { ...component.defaults, ...options });
    if (instance?.update) instances.push(instance);
  }
  return (dt, time) => {
    for (const instance of instances) instance.update!(dt, time);
  };
}
