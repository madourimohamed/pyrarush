import * as THREE from 'three';
import { defineComponent, merged } from './component';

const waterMaterial = (color: number, emissive: number, glow: boolean) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: glow ? 1.6 : 0.6, roughness: glow ? 0.6 : 0.08, metalness: 0.1 });

/** Douves : la pyramide se dresse sur une île (le terrain doit être aplati sur au moins `width` mètres). */
export const moat = defineComponent({ color: 0x22b8d0, emissive: 0x0a4a60, width: 5 }, (ctx, o) => {
  const material = waterMaterial(o.color, o.emissive, false);
  const inner = ctx.groundHalf + 0.6;
  for (let side = 0; side < 4; side++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry((inner + o.width) * 2, o.width), material);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = (side * Math.PI) / 2;
    const a = (side * Math.PI) / 2;
    strip.position.set(Math.sin(a) * (inner + o.width / 2), 0.04, Math.cos(a) * (inner + o.width / 2));
    strip.receiveShadow = true;
    ctx.scene.add(strip);
  }
  ctx.anchors.moatWidth = o.width;
});

/** Étang (eau, glace, lave ou lumière) à côté de l'esplanade ; il sert de repère à la végétation. */
export const pond = defineComponent({ color: 0x2cc3d6, emissive: 0x0b4a63, glow: false, lilies: false, rim: 0x7fb24a }, (ctx, o) => {
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
