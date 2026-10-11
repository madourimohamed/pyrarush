import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, type Theme } from '../../core';
import { glowTexture } from './textures';
import { sunDirection } from './themes';

export interface Environment {
  update(dt: number): void;
}

/** Ciel, nuages, montagnes, sol, plan d'eau (ou de lave…), végétation et particules, selon le thème du niveau. */
export function buildEnvironment(
  scene: THREE.Scene,
  theme: Theme,
  groundHalf: number,
  pyramidHeight: number,
  seed: number,
  lowQuality: boolean,
): Environment {
  const rng = new Rng(seed ^ 0xa11ce);
  scene.fog = new THREE.Fog(theme.sky.horizon, theme.fog.near, theme.fog.far);

  scene.add(buildSky(theme));
  if (theme.sky.stars) scene.add(buildStars(rng));
  const clouds = buildClouds(theme, rng);
  scene.add(clouds);
  scene.add(buildMountains(theme, rng));
  scene.add(buildGround(theme, groundHalf, lowQuality));
  const pool = buildPoolAndVegetation(scene, theme, rng, groundHalf);
  const particles = buildParticles(theme, rng, groundHalf, pyramidHeight);
  scene.add(particles.points);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      clouds.rotation.y += dt * 0.004;
      particles.update(dt, time);
      if (pool && theme.pool.glow) {
        (pool.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(time * 1.5) * 0.4;
      }
    },
  };
}

function buildSky(theme: Theme): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.sky.top) },
      mid: { value: new THREE.Color(theme.sky.mid) },
      horizon: { value: new THREE.Color(theme.sky.horizon) },
      sunColor: { value: new THREE.Color(theme.sky.sun) },
      sunDir: { value: sunDirection(theme) },
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

function buildStars(rng: Rng): THREE.Points {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const y = 0.08 + rng.next() * 0.92;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(a) * r * 440, y * 440, Math.sin(a) * r * 440], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: new THREE.Color(1.6, 1.6, 2), fog: false, transparent: true, depthWrite: false }),
  );
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  return stars;
}

function buildClouds(theme: Theme, rng: Rng): THREE.Mesh {
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
  const { color, emissive, intensity } = theme.clouds;
  const material = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true });
  return new THREE.Mesh(mergeGeometries(parts), material);
}

function buildMountains(theme: Theme, rng: Rng): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const peaks = theme.mountains.shape === 'peaks';
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + rng.next() * 0.3;
    const dist = 260 + rng.next() * 90;
    const r = 18 + rng.next() * 30;
    const h = peaks ? 40 + rng.next() * 60 : 18 + rng.next() * 40;
    const g = peaks ? new THREE.ConeGeometry(r * 1.2, h, 6, 1) : new THREE.CylinderGeometry(r * 0.7, r, h, 7, 1);
    g.translate(Math.cos(angle) * dist, h / 2 - 2, Math.sin(angle) * dist);
    parts.push(g);
  }
  return new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: theme.mountains.color, flatShading: true }));
}

/** Sol basse-poly vallonné, aplati autour de l'aire de jeu. */
function buildGround(theme: Theme, groundHalf: number, lowQuality: boolean): THREE.Mesh {
  const segments = lowQuality ? 90 : 140;
  const geometry = new THREE.PlaneGeometry(900, 900, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color(theme.ground.light);
  const dark = new THREE.Color(theme.ground.dark);
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
    pos.setY(i, (h + 4) * k - 0.03);
    c.copy(dark).lerp(light, THREE.MathUtils.clamp((h + 5) / 10, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  return ground;
}

/** Plan d'eau (ou de glace, de lave, de lumière) entouré de végétation adaptée au thème. */
function buildPoolAndVegetation(scene: THREE.Scene, theme: Theme, rng: Rng, groundHalf: number): THREE.Mesh {
  const center = new THREE.Vector3(-groundHalf - 26, 0, groundHalf + 8);
  const rim = new THREE.Mesh(
    new THREE.CircleGeometry(16, 9),
    new THREE.MeshLambertMaterial({ color: theme.vegetation === 'lush' || theme.vegetation === 'palms' ? 0x7fb24a : theme.ground.dark, flatShading: true }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(center.x, 0.05, center.z);
  rim.receiveShadow = true;
  scene.add(rim);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(10, 9),
    new THREE.MeshStandardMaterial({
      color: theme.pool.color,
      emissive: theme.pool.emissive,
      emissiveIntensity: theme.pool.glow ? 1.6 : 0.6,
      roughness: theme.pool.glow ? 0.6 : 0.08,
      metalness: 0.1,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(center.x, 0.1, center.z);
  scene.add(pool);

  const spots: [number, number, number][] = [];
  const around = theme.vegetation === 'lush' ? 12 : 7;
  for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2 + rng.next() * 0.4;
    const r = 12.5 + rng.next() * 2;
    spots.push([center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, 5 + rng.next() * 3]);
  }
  const scattered = theme.vegetation === 'lush' ? 14 : 6;
  for (let i = 0; i < scattered; i++) {
    const sx = rng.next() < 0.5 ? -1 : 1;
    const sz = rng.next() < 0.5 ? -1 : 1;
    spots.push([sx * (groundHalf + 5 + rng.next() * 14), sz * (groundHalf * rng.next() + 4), 4 + rng.next() * 3]);
  }

  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (const [x, z, height] of spots) {
    switch (theme.vegetation) {
      case 'pines':
        buildPine(rng, x, z, height, trunks, leaves);
        break;
      case 'rocks':
        buildSpire(rng, x, z, height, leaves);
        break;
      case 'crystals':
        buildCrystal(rng, x, z, height, leaves);
        break;
      default:
        buildPalm(rng, x, z, height, trunks, leaves);
    }
  }
  if (trunks.length) {
    const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshLambertMaterial({ color: theme.foliage.trunk, flatShading: true }));
    trunkMesh.castShadow = true;
    scene.add(trunkMesh);
  }
  const glowing = theme.vegetation === 'crystals';
  const leafMat = glowing
    ? new THREE.MeshStandardMaterial({ color: theme.foliage.leaf, emissive: theme.foliage.leaf, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true })
    : new THREE.MeshLambertMaterial({ color: theme.foliage.leaf, flatShading: true, side: THREE.DoubleSide });
  const leafMesh = new THREE.Mesh(mergeGeometries(leaves), leafMat);
  leafMesh.castShadow = true;
  scene.add(leafMesh);
  return pool;
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
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.next() * 0.3;
    const g = new THREE.ConeGeometry(0.7, 4.2, 3, 1);
    g.scale(1, 1, 0.2);
    g.translate(0, 2.1, 0);
    g.rotateX(Math.PI / 2 + 0.55);
    g.rotateY(a);
    g.translate(p.x, p.y, p.z);
    leaves.push(g);
  }
}

function buildPine(rng: Rng, x: number, z: number, height: number, trunks: THREE.BufferGeometry[], leaves: THREE.BufferGeometry[]): void {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, height * 0.3, 6);
  trunk.translate(x, height * 0.15, z);
  trunks.push(trunk);
  for (let i = 0; i < 3; i++) {
    const r = (1.9 - i * 0.5) * (0.9 + rng.next() * 0.2);
    const g = new THREE.ConeGeometry(r, height * 0.42, 7);
    g.translate(x, height * (0.38 + i * 0.22), z);
    leaves.push(g);
  }
}

function buildSpire(rng: Rng, x: number, z: number, height: number, out: THREE.BufferGeometry[]): void {
  for (let i = 0; i < 3; i++) {
    const h = height * (0.5 + rng.next() * 0.7);
    const g = new THREE.ConeGeometry(0.6 + rng.next() * 0.8, h, 5);
    g.rotateZ((rng.next() - 0.5) * 0.4);
    g.translate(x + (rng.next() - 0.5) * 2, h / 2, z + (rng.next() - 0.5) * 2);
    out.push(g);
  }
}

function buildCrystal(rng: Rng, x: number, z: number, height: number, out: THREE.BufferGeometry[]): void {
  for (let i = 0; i < 3; i++) {
    const h = height * (0.35 + rng.next() * 0.5);
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.5 + rng.next() * 0.4, h / 2, 0.5 + rng.next() * 0.4);
    g.rotateZ((rng.next() - 0.5) * 0.5);
    g.translate(x + (rng.next() - 0.5) * 2.5, h / 2, z + (rng.next() - 0.5) * 2.5);
    out.push(g);
  }
}

/** Particules d'ambiance : poussière/pollen qui flotte, neige qui tombe, braises qui montent. */
function buildParticles(theme: Theme, rng: Rng, groundHalf: number, height: number) {
  const { count, motion, size, color } = theme.particles;
  const top = height + 14;
  const positions = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 4 + rng.next() * (groundHalf + 28);
    positions.set([Math.cos(a) * r, 0.5 + rng.next() * top, Math.sin(a) * r], i * 3);
    phase[i] = rng.next() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(positions, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      map: glowTexture(),
      color: new THREE.Color(...color),
      transparent: true,
      opacity: motion === 'snow' ? 0.9 : 0.75,
      depthWrite: false,
      blending: motion === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  const speed = motion === 'snow' ? -1.6 : motion === 'embers' ? 1.4 : 0;

  return {
    points,
    update(dt: number, time: number) {
      if (motion === 'float') {
        points.rotation.y += dt * 0.02;
        points.position.y = Math.sin(time * 0.4) * 0.6;
        return;
      }
      for (let i = 0; i < count; i++) {
        let y = positions[i * 3 + 1] + speed * dt * (0.7 + (phase[i] % 1));
        if (y < 0) y += top;
        if (y > top) y -= top;
        positions[i * 3 + 1] = y;
        positions[i * 3] += Math.sin(time * 0.8 + phase[i]) * dt * 0.4;
      }
      attr.needsUpdate = true;
    },
  };
}
