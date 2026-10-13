import * as THREE from 'three';
import { sunDirection } from '../themes';
import { texture } from '../images';
import { canvasTexture, defineComponent, merged } from './component';

/** Ciel dégradé avec soleil (ou lune), brume, nuages basse-poly et étoiles optionnelles. */
export const sky = defineComponent({ clouds: 0xffffff, cloudGlow: 0xffc9a8, cloudCount: 14, stars: false }, (ctx, o) => {
  const { theme, scene, rng } = ctx;
  scene.fog = new THREE.Fog(theme.sky.horizon, theme.fog.near, theme.fog.far);
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
  const dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);

  if (o.stars) {
    const positions = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
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
    stars.frustumCulled = false;
    scene.add(stars);
  }

  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.cloudCount; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = 170 + rng.next() * 160;
    const cy = 55 + rng.next() * 60;
    const puffs = 4 + rng.int(0, 3);
    for (let j = 0; j < puffs; j++) {
      const r = 6 + rng.next() * 8;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1.4, 0.75, 1);
      g.translate(Math.cos(angle) * dist + (j - puffs / 2) * r * 1.3, cy + rng.next() * 4, Math.sin(angle) * dist + (rng.next() - 0.5) * 10);
      parts.push(g);
    }
  }
  const clouds = merged(parts, new THREE.MeshLambertMaterial({ color: o.clouds, emissive: o.cloudGlow, emissiveIntensity: 0.35, flatShading: true }), false);
  scene.add(clouds);
  return { update: (dt) => void (clouds.rotation.y += dt * 0.004) };
});

/**
 * Sol vallonné, aplati autour de l'aire de jeu sur `flat` mètres au-delà de l'esplanade.
 * Sans `detail` : basse-poly à facettes. Avec `detail` (ex. 'sand/ripples', voir art/textures/) : relief lissé,
 * texture de détail en nuances de gris (la couleur reste celle du thème) et son relief (<detail>-normal), répétés tous les `tile` mètres.
 */
export const terrain = defineComponent({ flat: 3, relief: 1, detail: '', tile: 15 }, (ctx, o) => {
  const { theme, groundHalf, lowQuality } = ctx;
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
    const k = THREE.MathUtils.smoothstep(edge, groundHalf + o.flat, groundHalf + o.flat + 42);
    const h = Math.sin(x * 0.035 + Math.sin(z * 0.02) * 2) * 3.2 + Math.sin(z * 0.05 + x * 0.012) * 2.2 + Math.sin((x + z) * 0.11) * 0.6;
    pos.setY(i, (h + 4) * k * o.relief - 0.03);
    c.copy(dark).lerp(light, THREE.MathUtils.clamp((h + 5) / 10, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.computeVertexNormals();
  const detail = o.detail ? texture(o.detail) : null;
  const normal = o.detail ? texture(`${o.detail}-normal`) : null;
  let material: THREE.Material;
  if (detail) {
    // La texture de détail a une moyenne de 0,8 : on éclaircit d'autant la couleur du thème.
    for (let i = 0; i < colors.length; i++) colors[i] /= 0.8;
    const repeat = 900 / o.tile;
    for (const t of [detail, normal]) {
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
    }
    detail.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.95,
    });
  } else {
    material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  ctx.scene.add(ground);
}, undefined, (o) => (o.detail ? [o.detail, `${o.detail}-normal`] : []));

/**
 * Panorama d'horizon (image 360° équirectangulaire, générée par art/panoramas/build_panorama.py) : ciel et paysage
 * lointain en une seule image. Il éclaire aussi la scène (reflets, lumière douce) et donne sa couleur à la brume,
 * pour que le sol 3D se fonde dans l'horizon. `rotation` (radians) tourne l'image autour de la verticale.
 * Sans l'image (introuvable), repli sur le ciel dégradé du thème.
 */
export const panorama = defineComponent({ image: '', rotation: 0, environment: 0.6 }, (ctx, o) => {
  const image = o.image ? texture(o.image) : null;
  if (!image) return sky.build(ctx, sky.defaults);
  image.mapping = THREE.EquirectangularReflectionMapping;
  image.colorSpace = THREE.SRGBColorSpace;
  const { scene, theme } = ctx;
  scene.background = image;
  scene.backgroundRotation.y = o.rotation;
  scene.fog = new THREE.Fog(horizonColor(image) ?? theme.sky.horizon, theme.fog.near, theme.fog.far);
  if (o.environment > 0) scene.userData.environment = { texture: image, intensity: o.environment, rotation: o.rotation };
}, undefined, (o) => (o.image ? [o.image] : []));

/** Couleur moyenne juste sous l'horizon du panorama (là où le sol 3D le rejoint), calculée une fois par image. */
function horizonColor(image: THREE.Texture): THREE.Color | null {
  if (image.userData.horizon) return image.userData.horizon as THREE.Color;
  const source = image.image as CanvasImageSource | undefined;
  if (!source) return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(source, 0, 0, 64, 64);
  const row = g.getImageData(0, 33, 64, 2).data;
  let r = 0;
  let gr = 0;
  let b = 0;
  for (let i = 0; i < row.length; i += 4) {
    r += row[i];
    gr += row[i + 1];
    b += row[i + 2];
  }
  const n = row.length / 4;
  const color = new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace);
  image.userData.horizon = color;
  return color;
}

/** Montagnes à l'horizon : mesas ou pics. */
export const mountains = defineComponent({ color: 0xc8775a, shape: 'mesa' as 'mesa' | 'peaks', count: 18 }, (ctx, o) => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.count; i++) {
    const angle = (i / o.count) * Math.PI * 2 + ctx.rng.next() * 0.3;
    const dist = 260 + ctx.rng.next() * 90;
    const r = 18 + ctx.rng.next() * 30;
    const peaks = o.shape === 'peaks';
    const h = peaks ? 40 + ctx.rng.next() * 60 : 18 + ctx.rng.next() * 40;
    const g = peaks ? new THREE.ConeGeometry(r * 1.2, h, 6, 1) : new THREE.CylinderGeometry(r * 0.7, r, h, 7, 1);
    g.translate(Math.cos(angle) * dist, h / 2 - 2, Math.sin(angle) * dist);
    parts.push(g);
  }
  ctx.scene.add(merged(parts, new THREE.MeshLambertMaterial({ color: o.color, flatShading: true }), false));
});

/** Pyramides à l'horizon. */
export const distantPyramids = defineComponent({ color: 0xd09a62, count: 6 }, (ctx, o) => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.count; i++) {
    const angle = (i / o.count) * Math.PI * 2 + ctx.rng.next() * 0.6;
    const dist = 140 + ctx.rng.next() * 100;
    const h = 30 + ctx.rng.next() * 40;
    const g = new THREE.ConeGeometry(h * 0.95, h, 4);
    g.rotateY(Math.PI / 4 + ctx.rng.next() * 0.3);
    g.translate(Math.cos(angle) * dist, h / 2 - 1, Math.sin(angle) * dist);
    parts.push(g);
  }
  ctx.scene.add(merged(parts, new THREE.MeshLambertMaterial({ color: o.color, flatShading: true }), false));
});

/** Obélisques et colonnes en ruine autour de l'esplanade. */
export const obelisks = defineComponent({ color: 0xc8925a, count: 8 }, (ctx, o) => {
  const parts: THREE.BufferGeometry[] = [];
  const { rng, groundHalf } = ctx;
  for (let i = 0; i < o.count; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = groundHalf + 18 + rng.next() * 40;
    const h = 8 + rng.next() * 7;
    const shaft = new THREE.CylinderGeometry(0.45, 0.75, h, 4);
    shaft.rotateY(Math.PI / 4);
    shaft.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(0.5, 1.2, 4);
    tip.rotateY(Math.PI / 4);
    tip.translate(0, h + 0.6, 0);
    for (const g of [shaft, tip]) {
      g.translate(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      parts.push(g);
    }
  }
  for (let i = 0; i < Math.ceil(o.count / 2); i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist = groundHalf + 14 + rng.next() * 30;
    for (let c = 0; c < 3; c++) {
      const h = 2 + rng.next() * 3.5;
      const col = new THREE.CylinderGeometry(0.45, 0.5, h, 8);
      col.translate(Math.cos(angle) * dist + c * 1.8 * Math.sin(angle), h / 2, Math.sin(angle) * dist - c * 1.8 * Math.cos(angle));
      parts.push(col);
    }
  }
  ctx.scene.add(merged(parts, new THREE.MeshLambertMaterial({ color: o.color, flatShading: true })));
});

/** Falaises autour de l'esplanade, avec cascades animées en option. */
export const cliffs = defineComponent({ color: 0x9aa68a, count: 8, waterfalls: false }, (ctx, o) => {
  const { rng, groundHalf } = ctx;
  const rocks: THREE.BufferGeometry[] = [];
  const falls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.count; i++) {
    const angle = (i / o.count) * Math.PI * 2 + rng.next() * 0.4;
    const dist = groundHalf + 40 + rng.next() * 40;
    const h = 16 + rng.next() * 18;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const cliff = new THREE.BoxGeometry(12 + rng.next() * 10, h, 10);
    cliff.rotateY(-angle + Math.PI / 2);
    cliff.translate(x, h / 2 - 1, z);
    rocks.push(cliff);
    const fall = new THREE.PlaneGeometry(3 + rng.next() * 3, h);
    fall.rotateY(-angle - Math.PI / 2);
    fall.translate(x - Math.cos(angle) * 5.2, h / 2 - 1, z - Math.sin(angle) * 5.2);
    falls.push(fall);
  }
  ctx.scene.add(merged(rocks, new THREE.MeshLambertMaterial({ color: o.color, flatShading: true })));
  if (!o.waterfalls) return;
  const texture = waterTexture();
  texture.repeat.set(1, 3);
  const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.1, 1.5, 1.7), transparent: true, opacity: 0.9, depthWrite: false });
  ctx.scene.add(merged(falls, material, false));
  return { update: (dt) => void (texture.offset.y += dt * 1.2) };
});

/** Eau qui ruisselle : bandes claires verticales (texture qui défile). Partagée avec les cascades de la pyramide. */
export function waterTexture(): THREE.CanvasTexture {
  return canvasTexture(
    64,
    128,
    (g) => {
      g.fillStyle = '#5fd0e8';
      g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * 64, Math.random() * 128, 2 + Math.random() * 4, 10 + Math.random() * 30);
      }
    },
    true,
  );
}

