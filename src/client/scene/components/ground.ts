import * as THREE from 'three';
import { Rng, num, cssColor, image } from '../../../core';
import { texture } from '../images';
import { canvasTexture, defineComponent } from './component';
import { footBands } from './masonry';

/**
 * Sols meubles autour et sur la pyramide :
 * - `esplanade` : sable (ou terre, neige… selon la couleur du thème) sur l'esplanade, à la place du dallage ;
 * - `sandDrifts` : sable accumulé au pied des parois des terrasses (bord irrégulier), qui casse la rencontre
 *   mur / dalles et lie la pyramide au désert.
 * Texture de détail optionnelle (`detail`, ex. 'sand/ripples', la même que le terrain) : nuances de gris teintées
 * par la couleur du thème, et son relief (<detail>-normal).
 */

/** Matériau de sable : couleur du thème × texture de détail (copie propre, pour régler sa répétition). */
function sandMaterial(color: THREE.ColorRepresentation, detail: string, repeat: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const source = detail ? texture(detail) : null;
  const normalSource = detail ? texture(`${detail}-normal`) : null;
  const prepare = (t: THREE.Texture | null, srgb: boolean) => {
    if (!t) return null;
    const copy = t.clone();
    copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
    copy.repeat.set(repeat, repeat);
    copy.anisotropy = 8;
    if (srgb) copy.colorSpace = THREE.SRGBColorSpace;
    copy.needsUpdate = true;
    return copy;
  };
  const map = prepare(source, true);
  // La texture de détail a une moyenne de 0,8 : on éclaircit d'autant la couleur.
  const tint = new THREE.Color(color).multiplyScalar(map ? 1 / 0.8 : 1);
  return new THREE.MeshStandardMaterial({
    color: tint,
    map,
    normalMap: prepare(normalSource, false),
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.95,
    ...extra,
  });
}

const detailTextures = (o: { detail: string }) => (o.detail ? [o.detail, `${o.detail}-normal`] : []);

/** Sable sur l'esplanade (au pied de la pyramide), un seul plan. `tile` : une répétition de la texture tous les N mètres. */
export const esplanade = defineComponent(
  { color: cssColor(''), detail: image(''), tile: num(15, { min: 0.1 }) },
  (ctx, o) => {
    const half = ctx.groundHalf;
    const geometry = new THREE.PlaneGeometry(half * 2, half * 2);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, sandMaterial(o.color || ctx.theme.ground.light, o.detail, (half * 2) / o.tile));
    mesh.position.y = 0.015;
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
  },
  undefined,
  detailTextures,
);

/** Bord irrégulier d'une congère (masque répétable : opaque contre la paroi, bord ondulé et poudré vers l'extérieur). */
function driftMask(): THREE.CanvasTexture {
  const rng = new Rng(0xd21f7);
  const w = 256;
  const h = 64;
  const texture = canvasTexture(
    w,
    h,
    (c) => {
      // Profondeur de la congère le long de la paroi : ondulations douces qui bouclent sur la largeur de la texture.
      const reach = (x: number) => {
        const t = (x / w) * Math.PI * 2;
        return 0.5 + 0.22 * Math.sin(t) + 0.12 * Math.sin(t * 3 + 1.3) + 0.06 * Math.sin(t * 7 + 0.4);
      };
      const image = c.createImageData(w, h);
      for (let x = 0; x < w; x++) {
        const r = reach(x);
        for (let y = 0; y < h; y++) {
          // y = 0 : contre la paroi (haut de l'image, v = 1).
          const d = y / h;
          const a = 1 - THREE.MathUtils.smoothstep(d, r * 0.55, r);
          const i = (y * w + x) * 4;
          image.data.set([255, 255, 255, Math.round(255 * Math.min(1, a * (0.85 + rng.next() * 0.15)))], i);
        }
      }
      c.putImageData(image, 0, 0);
    },
    true,
  );
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Sable accumulé au pied des parois, sur les terrasses (pas sur l'esplanade, déjà en sable). */
export const sandDrifts = defineComponent(
  { color: cssColor(''), detail: image(''), width: num(1.0, { min: 0, step: 0.05 }), tile: num(7, { min: 0.1 }), opacity: num(0.95, { min: 0, max: 1, step: 0.01 }) },
  (ctx, o) => {
    const geometry = footBands(ctx, o.width, 0.012, 2, o.tile);
    if (!geometry) return;
    const material = sandMaterial(o.color || ctx.theme.ground.light, o.detail, 1, {
      alphaMap: driftMask(),
      transparent: true,
      opacity: o.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    // UV de la bande : u en « tuiles » de `tile` mètres, v sur la largeur ; le détail du sable se répète tous les ~4 m.
    for (const t of [material.map, material.normalMap]) t?.repeat.set(o.tile / 4, o.width / 4);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    ctx.scene.add(mesh);
  },
  undefined,
  detailTextures,
);
