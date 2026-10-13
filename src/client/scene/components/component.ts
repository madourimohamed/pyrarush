import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Layout, Rng, Theme } from '../../../core';

/** Tout ce qu'un composant de décor peut lire pour se construire. */
export interface SceneContext {
  scene: THREE.Scene;
  layout: Layout;
  theme: Theme;
  rng: Rng;
  lowQuality: boolean;
  /** Demi-largeur de l'esplanade (étage 1) et hauteur de la pyramide. */
  groundHalf: number;
  pyramidHeight: number;
  /** Repères partagés entre composants, remplis dans l'ordre de la liste (ex. le centre de l'étang pour les palmiers). */
  anchors: { pond?: THREE.Vector3; moatWidth?: number; wallRelief?: number };
}

export interface ComponentInstance {
  update?(dt: number, time: number): void;
}

/**
 * Un composant de décor : des options par défaut et une fonction de construction.
 * Les options déclarées dans le thème du niveau remplacent les valeurs par défaut (les autres sont ignorées).
 */
export interface Component<O extends object = object> {
  defaults: O;
  build(ctx: SceneContext, options: O): ComponentInstance | void;
  /** Modèles 3D à précharger avant la construction (voir scene/models.ts). */
  models?(options: O): string[];
  /** Images à précharger avant la construction (voir scene/images.ts). */
  textures?(options: O): string[];
}

export const defineComponent = <O extends object>(
  defaults: O,
  build: (ctx: SceneContext, options: O) => ComponentInstance | void,
  models?: (options: O) => string[],
  textures?: (options: O) => string[],
): Component<O> => ({ defaults, build, models, textures });

// ---------- Utilitaires partagés par les composants ----------

/** Une seule InstancedMesh pour N objets identiques : un seul appel de dessin. */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  { shadow = false, receive = true } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Matrice position + rotation autour de la verticale + échelle. */
export function place(position: THREE.Vector3, rotationY = 0, scale: number | THREE.Vector3 = 1): THREE.Matrix4 {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(UP, rotationY), s);
}

/** Fusionne des géométries déjà positionnées en un seul mesh. */
export function merged(parts: THREE.BufferGeometry[], material: THREE.Material, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const hdr = (value: [number, number, number]) => new THREE.Color(...value);
