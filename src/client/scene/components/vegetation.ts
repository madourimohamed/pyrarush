import * as THREE from 'three';
import { Rng } from '../../../core';
import { canvasTexture, defineComponent, instanced, merged, place, type SceneContext } from './component';
import { ringPoint, wallFootSlots, wallGapSlots } from './slots';

/** Emplacement extérieur : autour de l'étang si demandé (et présent), sinon sur la rive autour de l'île / de l'esplanade. */
function outdoorSpot(ctx: SceneContext, aroundPond: boolean): THREE.Vector3 {
  const pond = ctx.anchors.pond;
  if (aroundPond && pond) {
    const a = ctx.rng.next() * Math.PI * 2;
    const r = 12.5 + ctx.rng.next() * 2.5;
    return new THREE.Vector3(pond.x + Math.cos(a) * r, 0, pond.z + Math.sin(a) * r);
  }
  const inner = ctx.groundHalf + (ctx.anchors.moatWidth ? ctx.anchors.moatWidth + 1.8 : 4);
  return ringPoint(ctx.rng, inner, inner + 24);
}

/** Construit `count` objets fusionnés en deux matériaux (tronc / feuillage) avec une fonction de forme. */
function forest(
  ctx: SceneContext,
  count: number,
  aroundPond: boolean,
  materials: { trunk?: THREE.Material; leaf: THREE.Material },
  shape: (rng: Rng, at: THREE.Vector3, trunks: THREE.BufferGeometry[], leaves: THREE.BufferGeometry[]) => void,
): void {
  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) shape(ctx.rng, outdoorSpot(ctx, aroundPond), trunks, leaves);
  if (trunks.length && materials.trunk) ctx.scene.add(merged(trunks, materials.trunk));
  if (leaves.length) ctx.scene.add(merged(leaves, materials.leaf));
}

export const palms = defineComponent({ count: 20, trunk: 0x9a6a43, leaf: 0x3f9e4d, aroundPond: false }, (ctx, o) => {
  const trunk = new THREE.MeshLambertMaterial({ color: o.trunk, flatShading: true });
  const leaf = new THREE.MeshLambertMaterial({ color: o.leaf, flatShading: true, side: THREE.DoubleSide });
  forest(ctx, o.count, o.aroundPond, { trunk, leaf }, (rng, at, trunks, leaves) => {
    const height = 5 + rng.next() * 4;
    const lean = new THREE.Vector3(rng.next() - 0.5, 0, rng.next() - 0.5).normalize().multiplyScalar(0.12);
    const segH = height / 6;
    const p = at.clone();
    for (let i = 0; i < 6; i++) {
      const g = new THREE.CylinderGeometry(0.28 - i * 0.025, 0.34 - i * 0.025, segH * 1.05, 6);
      g.translate(p.x, p.y + segH / 2, p.z);
      trunks.push(g);
      p.y += segH;
      p.addScaledVector(lean, segH * (1 + i * 0.4));
    }
    for (let i = 0; i < 8; i++) {
      const g = new THREE.ConeGeometry(0.75, 4.4, 3, 1);
      g.scale(1, 1, 0.2);
      g.translate(0, 2.2, 0);
      g.rotateX(Math.PI / 2 + 0.5 + rng.next() * 0.2);
      g.rotateY((i / 8) * Math.PI * 2 + rng.next() * 0.3);
      g.translate(p.x, p.y, p.z);
      leaves.push(g);
    }
  });
});

export const pines = defineComponent({ count: 14, trunk: 0x5a4a3a, leaf: 0x2f6a5a, aroundPond: false }, (ctx, o) => {
  const trunk = new THREE.MeshLambertMaterial({ color: o.trunk, flatShading: true });
  const leaf = new THREE.MeshLambertMaterial({ color: o.leaf, flatShading: true });
  forest(ctx, o.count, o.aroundPond, { trunk, leaf }, (rng, at, trunks, leaves) => {
    const height = 4 + rng.next() * 3;
    const t = new THREE.CylinderGeometry(0.2, 0.3, height * 0.3, 6);
    t.translate(at.x, height * 0.15, at.z);
    trunks.push(t);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry((1.9 - i * 0.5) * (0.9 + rng.next() * 0.2), height * 0.42, 7);
      g.translate(at.x, height * (0.38 + i * 0.22), at.z);
      leaves.push(g);
    }
  });
});

/** Aiguilles rocheuses (paysages volcaniques). */
export const spires = defineComponent({ count: 14, color: 0x3a2a2a, aroundPond: false }, (ctx, o) => {
  forest(ctx, o.count, o.aroundPond, { leaf: new THREE.MeshLambertMaterial({ color: o.color, flatShading: true }) }, (rng, at, _t, out) => {
    for (let i = 0; i < 3; i++) {
      const h = 3 + rng.next() * 5;
      const g = new THREE.ConeGeometry(0.6 + rng.next() * 0.8, h, 5);
      g.rotateZ((rng.next() - 0.5) * 0.4);
      g.translate(at.x + (rng.next() - 0.5) * 2, h / 2, at.z + (rng.next() - 0.5) * 2);
      out.push(g);
    }
  });
});

/** Cristaux lumineux (paysages célestes). */
export const crystals = defineComponent({ count: 14, color: 0x8a6aff, aroundPond: false }, (ctx, o) => {
  const leaf = new THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true });
  forest(ctx, o.count, o.aroundPond, { leaf }, (rng, at, _t, out) => {
    for (let i = 0; i < 3; i++) {
      const h = 2 + rng.next() * 3.5;
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.5 + rng.next() * 0.4, h / 2, 0.5 + rng.next() * 0.4);
      g.rotateZ((rng.next() - 0.5) * 0.5);
      g.translate(at.x + (rng.next() - 0.5) * 2.5, h / 2, at.z + (rng.next() - 0.5) * 2.5);
      out.push(g);
    }
  });
});

/** Buissons ronds basse-poly. */
export const bushes = defineComponent({ count: 40, color: 0x5aa046, aroundPond: false }, (ctx, o) => {
  const leaf = new THREE.MeshLambertMaterial({ color: o.color, flatShading: true });
  forest(ctx, o.count, o.aroundPond, { leaf }, (rng, at, _t, out) => {
    for (let i = 0; i < 3; i++) {
      const r = 0.6 + rng.next() * 0.7;
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.translate(at.x + (rng.next() - 0.5) * 1.6, r * 0.6, at.z + (rng.next() - 0.5) * 1.6);
      out.push(g);
    }
  });
});

/** Lianes suspendues aux parois, entre les portes. */
export const vines = defineComponent({ leaf: 0x2f9a4a, every: 2, offset: 1 }, (ctx, o) => {
  const rng = new Rng(ctx.layout.seed ^ 0x1f1e5);
  const matrices = wallGapSlots(ctx.layout, o.every, o.offset).map((s) =>
    place(s.position.clone().setY(s.position.y + 0.02), s.rotationY, new THREE.Vector3(0.8 + rng.next() * 0.6, 0.8 + rng.next() * 1.4, 1)),
  );
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.MeshStandardMaterial({ map: vineTexture(o.leaf), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  ctx.scene.add(instanced(geometry, material, matrices));
});

/** Plantes en pot sur les terrasses, contre la paroi entre deux portes. */
export const terracePlants = defineComponent({ leaf: 0x4f9e3e, pot: 0xb8643a, every: 2, offset: 1 }, (ctx, o) => {
  const rng = new Rng(ctx.layout.seed ^ 0x9a17);
  const slots = wallFootSlots(ctx.layout, o.every, o.offset);
  const pots = slots.map((s) => place(s.position, rng.next() * 6, 0.9 + rng.next() * 0.3));
  const potGeo = new THREE.CylinderGeometry(0.32, 0.24, 0.5, 10);
  potGeo.translate(0, 0.25, 0);
  ctx.scene.add(instanced(potGeo, new THREE.MeshStandardMaterial({ color: o.pot, roughness: 0.85 }), pots, { shadow: true }));
  const leafGeo = new THREE.IcosahedronGeometry(0.5, 0);
  leafGeo.scale(1, 1.1, 1);
  leafGeo.translate(0, 0.85, 0);
  ctx.scene.add(instanced(leafGeo, new THREE.MeshLambertMaterial({ color: o.leaf, flatShading: true }), pots, { shadow: true }));
});

function vineTexture(leaf: number): THREE.CanvasTexture {
  const color = new THREE.Color(leaf);
  const rng = new Rng(7);
  return canvasTexture(128, 256, (g) => {
    for (let strand = 0; strand < 3; strand++) {
      const x0 = 30 + strand * 34;
      g.strokeStyle = '#3a5a2a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, 0);
      for (let y = 0; y < 256; y += 16) g.lineTo(x0 + Math.sin(y * 0.05 + strand) * 8, y);
      g.stroke();
      for (let y = 8; y < 250 - strand * 30; y += 14) {
        const x = x0 + Math.sin(y * 0.05 + strand) * 8;
        g.fillStyle = `#${color.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.15).getHexString()}`;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.ellipse(x + s * 9, y, 9, 5, s * 0.6, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}
