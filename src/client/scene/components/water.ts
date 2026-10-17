import * as THREE from 'three';
import { num, bool, color } from '../../../core';
import { defineComponent, merged } from './component';

const waterMaterial = (color: number, emissive: number, glow: boolean) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: glow ? 1.6 : 0.6, roughness: glow ? 0.6 : 0.08, metalness: 0.1 });

/**
 * Relief de vaguelettes (carte de normales 256 × 256, raccordable) : somme de vagues dont les fréquences sont des
 * entiers, pour que la texture se répète sans couture. Calculée une fois, sans fichier.
 */
let rippleNormals: THREE.DataTexture | null = null;
function rippleTexture(): THREE.DataTexture {
  if (rippleNormals) return rippleNormals;
  const size = 256;
  const waves = Array.from({ length: 14 }, (_, i) => {
    const angle = i * 2.399 + 0.3;
    const freq = 2 + (i % 5) * 2 + Math.floor(i / 5);
    return { kx: Math.round(Math.cos(angle) * freq), ky: Math.round(Math.sin(angle) * freq), amp: 1 / (1 + freq * 0.35), phase: i * 1.7 };
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.phase) * w.amp;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const n = new THREE.Vector3(-dx * 0.06, -dy * 0.06, 1).normalize();
      const i = (y * size + x) * 4;
      data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], i);
    }
  }
  rippleNormals = new THREE.DataTexture(data, size, size);
  rippleNormals.wrapS = rippleNormals.wrapT = THREE.RepeatWrapping;
  rippleNormals.generateMipmaps = true;
  rippleNormals.minFilter = THREE.LinearMipmapLinearFilter;
  rippleNormals.magFilter = THREE.LinearFilter;
  rippleNormals.needsUpdate = true;
  return rippleNormals;
}

/**
 * Eau réaliste et animée : couleur claire près des berges et profonde au centre (attribut `shore` : 0 au milieu,
 * 1 sur la rive), reflets du ciel (carte d'environnement de la scène), deux couches de vaguelettes qui glissent
 * dans des directions différentes, liseré d'écume qui ondule le long des rives. `tile` : taille d'un motif (mètres).
 * Reflets du soleil volontairement doux : surface pas trop lisse, et luminosité plafonnée sous le seuil de la lueur
 * (bloom) pour ne jamais éblouir.
 */
function animatedWater(color: number, tile: number, extent: [number, number], time: { value: number }): THREE.MeshStandardMaterial {
  const normalMap = rippleTexture().clone();
  normalMap.repeat.set(extent[0] / tile, extent[1] / tile);
  normalMap.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    metalness: 0.0,
    normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    envMapIntensity: 0.9,
  });
  const deep = new THREE.Color(color).multiplyScalar(0.32);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = time;
    shader.uniforms.waterDeep = { value: deep };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shore;\nvarying float vShore;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = shore;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float waterTime;\nuniform vec3 waterDeep;\nvarying float vShore;')
      // Couleur : profonde au centre, claire sur les rives.
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(waterDeep, diffuseColor.rgb, smoothstep(0.15, 0.95, vShore));')
      // Deux couches de vaguelettes en mouvement (au lieu d'une lecture fixe de la carte de normales).
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(0.021, 0.013) * waterTime).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.83 + vec2(-0.017, 0.024) * waterTime).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`,
      )
      // Écume : fin liseré sur les rives, découpé par les vaguelettes.
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        float foamWave = texture2D(normalMap, vNormalMapUv * 0.7 + vec2(0.01, -0.02) * waterTime).x;
        float foam = smoothstep(0.86, 0.97, vShore + (foamWave - 0.5) * 0.18 + sin(waterTime * 1.6) * 0.015);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 0.95), foam * 0.8);`,
      )
      .replace('#include <opaque_fragment>', 'outgoingLight = min(outgoingLight, vec3(0.8));\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'animated-water';
  return material;
}

/** Plan d'eau rectangulaire (largeur sur x, profondeur sur z), avec l'attribut `shore` en travers de sa largeur. */
function waterStrip(length: number, width: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(length, width, 1, 8);
  const uv = geometry.getAttribute('uv');
  const shore = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) shore[i] = Math.abs(uv.getY(i) * 2 - 1);
  geometry.setAttribute('shore', new THREE.BufferAttribute(shore, 1));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Douves : la pyramide se dresse sur une île (le terrain doit être aplati sur au moins `width` mètres).
 * `realistic` : eau animée (vaguelettes, reflets, écume) au lieu de la surface unie.
 */
export const moat = defineComponent({ color: color(0x22b8d0), emissive: color(0x0a4a60), width: num(5, { min: 0.5, step: 0.1 }), realistic: bool(false) }, (ctx, o) => {
  const inner = ctx.groundHalf + 0.6;
  const length = (inner + o.width) * 2;
  const time = { value: 0 };
  const material = o.realistic ? animatedWater(o.color, 11, [length, o.width], time) : waterMaterial(o.color, o.emissive, false);
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    // Bandes d'eau : les côtés pairs couvrent les coins, les impairs s'arrêtent aux coins (pas de recouvrement).
    const stripLength = side % 2 === 0 ? length : length - o.width * 2;
    const strip = o.realistic ? waterStrip(stripLength, o.width, material) : new THREE.Mesh(new THREE.PlaneGeometry(length, o.width), material);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = (side * Math.PI) / 2;
    strip.position.set(Math.sin(a) * (inner + o.width / 2), 0.04, Math.cos(a) * (inner + o.width / 2));
    strip.receiveShadow = true;
    ctx.scene.add(strip);
  }
  ctx.anchors.moatWidth = o.width;
  if (o.realistic) return { update: (_dt, t) => void (time.value = t) };
});

/** Étang (eau, glace, lave ou lumière) à côté de l'esplanade ; il sert de repère à la végétation. */
export const pond = defineComponent({ color: color(0x2cc3d6), emissive: color(0x0b4a63), glow: bool(false), lilies: bool(false), rim: color(0x7fb24a) }, (ctx, o) => {
  const { scene, rng, groundHalf } = ctx;
  const center = new THREE.Vector3(-groundHalf - 26 - (ctx.anchors.moatWidth ?? 0), 0, groundHalf + 8);
  ctx.anchors.pond = center;
  const rim = new THREE.Mesh(new THREE.CircleGeometry(16, 9), new THREE.MeshLambertMaterial({ color: o.rim, flatShading: true }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(center.x, 0.05, center.z);
  rim.receiveShadow = true;
  scene.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(10, 9), waterMaterial(o.color, o.emissive, o.glow));
  water.rotation.x = -Math.PI / 2;
  water.position.set(center.x, 0.1, center.z);
  scene.add(water);
  if (o.lilies) {
    const pads: THREE.BufferGeometry[] = [];
    const flowers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 2 + rng.next() * 7;
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const pad = new THREE.CylinderGeometry(0.6 + rng.next() * 0.4, 0.6, 0.05, 10, 1, false, 0.3, Math.PI * 1.8);
      pad.translate(x, 0.14, z);
      pads.push(pad);
      if (i % 3 === 0) {
        const flower = new THREE.ConeGeometry(0.22, 0.3, 6);
        flower.translate(x, 0.3, z);
        flowers.push(flower);
      }
    }
    scene.add(merged(pads, new THREE.MeshLambertMaterial({ color: 0x3f9a3a, flatShading: true }), false));
    scene.add(merged(flowers, new THREE.MeshLambertMaterial({ color: 0xff8ab0, emissive: 0x5a1a2a, flatShading: true }), false));
  }
  if (!o.glow) return;
  const material = water.material as THREE.MeshStandardMaterial;
  return { update: (_dt, time) => void (material.emissiveIntensity = 1.6 + Math.sin(time * 1.5) * 0.4) };
});
