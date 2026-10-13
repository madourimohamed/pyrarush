import * as THREE from 'three';
import { texture } from '../images';
import { defineComponent } from './component';

/**
 * Bande d'horizon nette (image produite par art/panoramas/build_horizon.py : 4 vues de 90° empilées dans une texture),
 * posée sur un cylindre qui suit la caméra (comme un ciel : pas de parallaxe), devant le panorama de fond.
 * Le fond (composant `panorama`) reste flou et léger ; seule la bande où se trouve le paysage est en pleine résolution.
 * `zoom` agrandit le paysage (1 = taille réelle des vues, alignée sur le panorama de fond) ; le haut de la bande se fond
 * dans le ciel. `rotation` : la même que celle du panorama. `above` / `below` : rangées de la bande au-dessus et
 * au-dessous de l'horizon (valeurs du script), `viewWidth` : largeur d'une vue en pixels (90°).
 */
export const horizon = defineComponent(
  { image: '', rotation: 0, zoom: 1, above: 272, below: 112, viewWidth: 1536, radius: 350 },
  (ctx, o) => {
    const image = o.image ? texture(o.image) : null;
    if (!image) return;
    image.colorSpace = THREE.SRGBColorSpace;
    image.anisotropy = 8;
    image.wrapS = image.wrapT = THREE.ClampToEdgeWrapping;
    image.needsUpdate = true;

    // Angle couvert par un pixel des vues (90° pour toute la largeur), agrandi par `zoom`.
    const perPixel = (Math.PI / 2 / o.viewWidth) * o.zoom;
    const top = o.above * perPixel;
    const bottom = -o.below * perPixel;
    // Rangées de la bande (0 = haut) et opacité : le haut se fond dans le ciel du panorama.
    const rows = [0, 0.12, 0.25, 0.4, 0.7, 1];
    const alpha = (f: number) => THREE.MathUtils.smoothstep(f, 0, 0.4);
    const columns = 48; // par quart
    const half = 0.5 / (4 * (o.above + o.below));

    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (let q = 0; q < 4; q++) {
      const base = positions.length / 3;
      for (let i = 0; i <= columns; i++) {
        const u = (q + i / columns) / 4;
        // Même correspondance que le fond équirectangulaire : u = 0,5 regarde vers +X, puis rotation du thème.
        const azimuth = (u - 0.5) * Math.PI * 2 - o.rotation;
        const x = Math.cos(azimuth) * o.radius;
        const z = Math.sin(azimuth) * o.radius;
        for (const f of rows) {
          const elevation = top + (bottom - top) * f;
          positions.push(x, Math.tan(elevation) * o.radius, z);
          // Quart q de l'atlas : rangées [q/4, (q+1)/4] depuis le haut (v = 1 en haut de l'image).
          uvs.push(i / columns, THREE.MathUtils.clamp(1 - (q + f) / 4, 1 - (q + 1) / 4 + half, 1 - q / 4 - half));
          colors.push(1, 1, 1, alpha(f));
        }
      }
      const n = rows.length;
      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < n - 1; j++) {
          const a = base + i * n + j;
          const b = base + (i + 1) * n + j;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);

    const band = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: image,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        fog: false,
        // Comme le fond (image sRGB) : pas de tone mapping, les couleurs restent celles de l'image.
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    band.frustumCulled = false;
    band.renderOrder = -1;
    // Centrée sur la caméra à chaque image : l'horizon reste à l'infini, comme le ciel.
    band.onBeforeRender = (_renderer, _scene, camera) => {
      band.position.setFromMatrixPosition(camera.matrixWorld);
      band.updateMatrixWorld();
    };
    ctx.scene.add(band);
  },
  undefined,
  (o) => (o.image ? [o.image] : []),
);
