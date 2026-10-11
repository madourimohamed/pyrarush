import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core';
import { glowTexture } from './textures';

/** Ambiance « fin d'après-midi dorée ». */
export const PALETTE = {
  skyTop: new THREE.Color(0x3d63b8),
  skyMid: new THREE.Color(0xf4a582),
  horizon: new THREE.Color(0xffd7a3),
  sun: new THREE.Color(0xfff1d0),
  sunLight: 0xffd6a5,
  hemiSky: 0xa9c1ff,
  hemiGround: 0xe39d68,
  sand: 0xf0b878,
  sandDark: 0xd48a52,
  mesa: 0xc8775a,
  water: 0x2cc3d6,
  grass: 0x7fb24a,
  palmTrunk: 0x9a6a43,
  palmLeaf: 0x3f9e4d,
};

/** Direction du soleil : bas sur l'horizon, côté sud-ouest, pour de longues ombres. */
export const SUN_DIR = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();

export interface Environment {
  update(dt: number): void;
}

/** Ciel, soleil, nuages, mesas, dunes, oasis, palmiers et poussière dorée. */
export function buildEnvironment(scene: THREE.Scene, groundHalf: number, pyramidHeight: number, seed: number, lowQuality: boolean): Environment {
  const rng = new Rng(seed ^ 0xa11ce);
  scene.fog = new THREE.Fog(PALETTE.horizon, 170, 520);

  scene.add(buildSky());
  const clouds = buildClouds(rng);
  scene.add(clouds);
  scene.add(buildMesas(rng));
  scene.add(buildDunes(groundHalf, lowQuality));
  buildOasis(scene, rng, groundHalf);
  const dust = buildDust(rng, groundHalf, pyramidHeight);
  scene.add(dust);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      clouds.rotation.y += dt * 0.004;
      dust.rotation.y += dt * 0.02;
      dust.position.y = Math.sin(time * 0.4) * 0.6;
    },
  };
}

function buildSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: PALETTE.skyTop },
      mid: { value: PALETTE.skyMid },
      horizon: { value: PALETTE.horizon },
      sunColor: { value: PALETTE.sun },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, mid, horizon, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
        col = mix(col, top, smoothstep(0.12, 0.75, h));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(d, 6.0) * 0.35 + pow(d, 60.0) * 0.6);
        col += sunColor * smoothstep(0.9990, 0.9994, d) * 3.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

function buildClouds(rng: Rng): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = 170 + rng.next() * 160;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = 55 + rng.next() * 60;
    const puffs = 4 + rng.int(0, 3);
    for (let j = 0; j < puffs; j++) {
      const r = 6 + rng.next() * 8;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1.4, 0.75, 1);
      g.translate(cx + (j - puffs / 2) * r * 1.3, cy + rng.next() * 4, cz + (rng.next() - 0.5) * 10);
      parts.push(g);
    }
  }
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffc9a8, emissiveIntensity: 0.35, flatShading: true });
  return new THREE.Mesh(mergeGeometries(parts), material);
}

function buildMesas(rng: Rng): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + rng.next() * 0.3;
    const dist = 260 + rng.next() * 90;
    const r = 18 + rng.next() * 30;
    const h = 18 + rng.next() * 40;
    const g = new THREE.CylinderGeometry(r * 0.7, r, h, 7, 1);
    g.translate(Math.cos(angle) * dist, h / 2 - 2, Math.sin(angle) * dist);
    parts.push(g);
  }
  return new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: PALETTE.mesa, flatShading: true }));
}

/** Dunes basses-poly, aplaties autour de l'aire de jeu. */
function buildDunes(groundHalf: number, lowQuality: boolean): THREE.Mesh {
  const segments = lowQuality ? 90 : 140;
  const geometry = new THREE.PlaneGeometry(900, 900, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color(PALETTE.sand);
  const dark = new THREE.Color(PALETTE.sandDark);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const k = THREE.MathUtils.smoothstep(edge, groundHalf + 3, groundHalf + 45);
    const h =
      Math.sin(x * 0.035 + Math.sin(z * 0.02) * 2) * 3.2 +
      Math.sin(z * 0.05 + x * 0.012) * 2.2 +
      Math.sin((x + z) * 0.11) * 0.6;
    const y = (h + 4) * k - 0.03;
    pos.setY(i, y);
    c.copy(dark).lerp(light, THREE.MathUtils.clamp((h + 5) / 10, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const dunes = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  dunes.receiveShadow = true;
  return dunes;
}

function buildOasis(scene: THREE.Scene, rng: Rng, groundHalf: number): void {
  const center = new THREE.Vector3(-groundHalf - 26, 0, groundHalf + 8);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(16, 9), new THREE.MeshLambertMaterial({ color: PALETTE.grass, flatShading: true }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(center.x, 0.05, center.z);
  grass.receiveShadow = true;
  scene.add(grass);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(10, 9),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, specular: 0xffffff, shininess: 90, emissive: 0x0b4a63 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(center.x, 0.1, center.z);
  scene.add(water);

  const spots: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.next() * 0.4;
    spots.push([center.x + Math.cos(a) * 13, center.z + Math.sin(a) * 13, 5 + rng.next() * 3]);
  }
  // Quelques palmiers isolés autour de l'esplanade.
  for (const [sx, sz] of [
    [1, -1],
    [1, 1],
    [-1, -1],
  ]) {
    spots.push([sx * (groundHalf + 6 + rng.next() * 4), sz * (groundHalf + 5 + rng.next() * 6), 5 + rng.next() * 2]);
  }
  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (const [x, z, height] of spots) buildPalm(rng, x, z, height, trunks, leaves);
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk, flatShading: true }));
  const leafMesh = new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf, flatShading: true, side: THREE.DoubleSide }));
  trunkMesh.castShadow = leafMesh.castShadow = true;
  scene.add(trunkMesh, leafMesh);
}

function buildPalm(rng: Rng, x: number, z: number, height: number, trunks: THREE.BufferGeometry[], leaves: THREE.BufferGeometry[]): void {
  const lean = new THREE.Vector3(rng.next() - 0.5, 0, rng.next() - 0.5).normalize().multiplyScalar(0.12);
  const segments = 6;
  const segH = height / segments;
  const p = new THREE.Vector3(x, 0, z);
  for (let i = 0; i < segments; i++) {
    const g = new THREE.CylinderGeometry(0.28 - i * 0.025, 0.34 - i * 0.025, segH * 1.05, 6);
    g.translate(p.x, p.y + segH / 2, p.z);
    trunks.push(g);
    p.y += segH;
    p.addScaledVector(lean, segH * (1 + i * 0.4));
  }
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng.next() * 0.3;
    const g = new THREE.ConeGeometry(0.7, 4.2, 3, 1);
    g.scale(1, 1, 0.2);
    g.translate(0, 2.1, 0);
    g.rotateX(Math.PI / 2 + 0.55);
    g.rotateY(a);
    g.translate(p.x, p.y, p.z);
    leaves.push(g);
  }
}

/** Poussière dorée qui flotte autour de la pyramide. */
function buildDust(rng: Rng, groundHalf: number, height: number): THREE.Points {
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 6 + rng.next() * (groundHalf + 25);
    positions.set([Math.cos(a) * r, 0.5 + rng.next() * (height + 10), Math.sin(a) * r], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.35,
    map: glowTexture(),
    color: new THREE.Color(1.6, 1.25, 0.8),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}
