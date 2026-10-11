import * as THREE from 'three';
import type { Theme } from '../../core';

/** Utilitaires d'affichage des thèmes (les thèmes eux-mêmes sont des données, dans chaque niveau). */

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function sunDirection(theme: Theme): THREE.Vector3 {
  return new THREE.Vector3(...theme.sun.dir).normalize();
}
