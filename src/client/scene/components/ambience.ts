import * as THREE from 'three';
import { num, vector } from '../../../core';
import { defineComponent } from './component';

/**
 * Ambiance de l'image, sans géométrie dans le niveau : le composant dépose une demande sur la scène
 * (scene.userData), que le moteur de rendu (client/render.ts) applique une seule fois par scène.
 * Ainsi chaque thème règle sa lumière d'environnement et son étalonnage par des données.
 */

export interface EnvironmentRequest {
  /** Petite scène (ciel dégradé + sol) dont on tire la carte d'environnement (reflets de l'or, lumière douce)… */
  scene?: THREE.Scene;
  /** … ou un panorama équirectangulaire (composant panorama), tourné de `rotation` radians autour de la verticale. */
  texture?: THREE.Texture;
  rotation?: number;
  intensity: number;
}

export interface GradeRequest {
  saturation: number;
  contrast: number;
  /** Teinte ajoutée aux ombres et aux hautes lumières (RVB, petites valeurs, ex. ombres bleutées / lumières dorées). */
  shadows: [number, number, number];
  highlights: [number, number, number];
  vignette: number;
}

/**
 * Carte d'environnement tirée des couleurs du ciel du thème : l'or et les métaux reflètent le ciel,
 * et les faces à l'ombre reçoivent une lumière douce (complément de la lumière d'hémisphère).
 */
export const environment = defineComponent({ intensity: num(0.5, { min: 0, max: 3, step: 0.05 }) }, (ctx, o) => {
  const { theme } = ctx;
  const geometry = new THREE.SphereGeometry(10, 32, 16);
  const colors: number[] = [];
  const position = geometry.getAttribute('position');
  const top = new THREE.Color(theme.sky.top);
  const mid = new THREE.Color(theme.sky.mid);
  const horizon = new THREE.Color(theme.sky.horizon);
  const ground = new THREE.Color(theme.ground.dark);
  const sun = new THREE.Color(theme.sky.sun).multiplyScalar(4);
  const sunDir = new THREE.Vector3(...theme.sun.dir).normalize();
  const c = new THREE.Color();
  const dir = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const h = dir.y;
    if (h < 0) c.copy(horizon).lerp(ground, THREE.MathUtils.smoothstep(-h, 0, 0.25));
    else c.copy(horizon).lerp(mid, THREE.MathUtils.smoothstep(h, 0, 0.2)).lerp(top, THREE.MathUtils.smoothstep(h, 0.15, 0.75));
    c.lerp(sun, Math.pow(Math.max(0, dir.dot(sunDir)), 24) * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  ctx.scene.userData.environment = { scene, intensity: o.intensity } satisfies EnvironmentRequest;
});

/** Étalonnage de l'image (après le tone mapping) : saturation, contraste, teintes des ombres et des lumières, vignette. */
export const grade = defineComponent(
  {
    saturation: num(1.08, { min: 0, max: 2, step: 0.01 }),
    contrast: num(1.06, { min: 0, max: 2, step: 0.01 }),
    /** Teinte ajoutée aux ombres et aux hautes lumières (r, g, b). */
    shadows: vector([-0.012, 0.0, 0.03], { step: 0.005 }),
    highlights: vector([0.025, 0.012, -0.02], { step: 0.005 }),
    vignette: num(0.22, { min: 0, max: 1, step: 0.01 }),
  },
  (ctx, o) => {
    ctx.scene.userData.grade = { ...o } satisfies GradeRequest;
  },
);
