import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOOR_HEIGHT, DOOR_WIDTH, FLOOR_HEIGHT, Rng, type HDR } from '../../../core';
import { glowTexture } from '../textures';
import { canvasTexture, defineComponent, hdr, instanced, place, type SceneContext } from './component';
import { cornerClusterSlots, doorSlots, facadeFlankSlots, terraceCornerSlots, terraceEdgeSlots, wallGapSlots, type Slot } from './slots';

/** Matrices « emplacement × décalage local » : une pièce répétée sur chaque emplacement. */
function atSlots(slots: Slot[], local: THREE.Matrix4): THREE.Matrix4[] {
  return slots.map((s) => place(s.position, s.rotationY).multiply(local));
}

const offset = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/**
 * Encadrement des portes (partie fixe ; le battant et son symbole sont gérés par le jeu).
 * - simple : cadre sombre, liseré doré, linteau ;
 * - pillars : en plus, deux piliers à bandes colorées de part et d'autre (maquette du niveau 1).
 */
export const doorFrames = defineComponent({ style: 'pillars' as 'pillars' | 'simple', band: '#2f6fc0' }, (ctx, o) => {
  const { theme, scene, layout } = ctx;
  const slots = doorSlots(layout);
  const gold = new THREE.MeshStandardMaterial({ color: theme.trim.color, metalness: 0.55, roughness: 0.3, emissive: theme.trim.emissive });
  const recess = new THREE.BoxGeometry(DOOR_WIDTH + 0.36, DOOR_HEIGHT + 0.24, 0.12);
  scene.add(instanced(recess, new THREE.MeshStandardMaterial({ color: theme.door.frame, roughness: 0.8 }), atSlots(slots, offset(0, 0.06, 0))));
  const inner = new THREE.BoxGeometry(DOOR_WIDTH + 0.16, DOOR_HEIGHT + 0.1, 0.12);
  scene.add(instanced(inner, gold, atSlots(slots, offset(0, 0.03, 0.03))));
  const lintel = new THREE.BoxGeometry(DOOR_WIDTH + (o.style === 'pillars' ? 1.5 : 1), 0.32, 0.4);
  scene.add(instanced(lintel, gold, atSlots(slots, offset(0, DOOR_HEIGHT / 2 + 0.32, 0.14)), { shadow: true }));
  if (o.style !== 'pillars') return;
  const pillar = new THREE.BoxGeometry(0.36, DOOR_HEIGHT + 0.42, 0.36);
  const pillarMat = new THREE.MeshStandardMaterial({ map: pillarTexture(theme.stone[0], o.band, theme.trim.color), roughness: 0.75 });
  const x = DOOR_WIDTH / 2 + 0.38;
  scene.add(instanced(pillar, pillarMat, [...atSlots(slots, offset(-x, 0.1, 0.14)), ...atSlots(slots, offset(x, 0.1, 0.14))], { shadow: true }));
});

/** Bannières suspendues entre les portes. */
export const banners = defineComponent({ cloth: '#2f5fb0', emblem: '#f2c14e', every: 2, offset: 0 }, (ctx, o) => {
  const slots = wallGapSlots(ctx.layout, o.every, o.offset, ctx.anchors.wallRelief).map((s) => ({ ...s, position: s.position.clone().setY(s.position.y - 0.2) }));
  const matrices = atSlots(slots, new THREE.Matrix4());
  const cloth = new THREE.PlaneGeometry(0.8, 1.9);
  cloth.translate(0, -0.95, 0);
  const material = new THREE.MeshStandardMaterial({ map: bannerTexture(o.cloth, o.emblem), roughness: 0.8, transparent: true, alphaTest: 0.5 });
  ctx.scene.add(instanced(cloth, material, matrices));
  const rod = new THREE.BoxGeometry(0.95, 0.07, 0.09);
  ctx.scene.add(instanced(rod, new THREE.MeshStandardMaterial({ color: ctx.theme.trim.color, metalness: 0.6, roughness: 0.3, emissive: ctx.theme.trim.emissive }), matrices));
});

/**
 * Braseros allumés le long des terrasses (et de l'esplanade).
 * Les flammes vacillent dans le shader (une seule instance de dessin pour toutes).
 */
export const braziers = defineComponent({ flame: [3.2, 1.3, 0.25] as HDR, every: 1, corners: true }, (ctx, o) => {
  const { scene, layout } = ctx;
  const slots = [...terraceEdgeSlots(layout, o.every), ...(o.corners ? terraceCornerSlots(layout) : [])];
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3020, metalness: 0.4, roughness: 0.5 });
  const stand = new THREE.CylinderGeometry(0.1, 0.18, 0.7, 6);
  stand.translate(0, 0.35, 0);
  const bowl = new THREE.CylinderGeometry(0.4, 0.18, 0.28, 8);
  bowl.translate(0, 0.84, 0);
  const matrices = atSlots(slots, new THREE.Matrix4());
  scene.add(instanced(mergeGeometries([stand, bowl]), bronze, matrices, { shadow: true }));

  const time = { value: 0 };
  const flameColor = hdr(o.flame);
  const flame = (radius: number, height: number, colorValue: THREE.Color) => {
    const geometry = new THREE.ConeGeometry(radius, height, 7);
    geometry.translate(0, height / 2, 0);
    const material = new THREE.MeshBasicMaterial({ color: colorValue });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float phase = float(gl_InstanceID) * 2.1;
           float k = sin(uTime * 13.0 + phase) * 0.5 + sin(uTime * 7.3 + phase * 0.7) * 0.5;
           transformed.y *= 1.0 + k * 0.22;
           transformed.xz *= 1.0 + k * 0.08;`,
        );
    };
    return instanced(geometry, material, atSlots(slots, offset(0, 0.95, 0)), { receive: false });
  };
  scene.add(flame(0.26, 0.85, flameColor));
  scene.add(flame(0.13, 0.5, flameColor.clone().lerp(new THREE.Color(2.2, 1.8, 1.0), 0.5)));

  const positions = new Float32Array(slots.length * 3);
  slots.forEach((s, i) => positions.set([s.position.x, s.position.y + 1.3, s.position.z], i * 3));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(
    new THREE.Points(
      glowGeo,
      new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), color: flameColor.clone().multiplyScalar(0.18), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    ),
  );
  return { update: (_dt, t) => void (time.value = t) };
});

/** Statues gardiennes de part et d'autre de l'entrée centrale de chaque façade. */
export const statues = defineComponent({ model: 'anubis' as const, spacing: 1.75 }, (ctx, o) => {
  const parts = anubisParts();
  const matrices = atSlots(facadeFlankSlots(ctx.layout, o.spacing), new THREE.Matrix4());
  const stone = new THREE.MeshStandardMaterial({ color: ctx.theme.stone[1], roughness: 0.85 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.35, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: ctx.theme.trim.color, metalness: 0.7, roughness: 0.25, emissive: ctx.theme.trim.emissive });
  ctx.scene.add(instanced(parts.stone, stone, matrices, { shadow: true }));
  ctx.scene.add(instanced(parts.black, black, matrices, { shadow: true }));
  ctx.scene.add(instanced(parts.gold, gold, matrices, { shadow: true }));
});

/** Chacal assis sur son socle, en formes simples (z local = vers l'extérieur). */
function anubisParts(): Record<'stone' | 'black' | 'gold', THREE.BufferGeometry> {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  };
  const cone = (r: number, h: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.ConeGeometry(r, h, 4);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  };
  const staff = new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6);
  staff.translate(0.36, 1.25, 0.28);
  return {
    stone: box(0.95, 0.5, 1.15, 0, 0.25, 0),
    black: mergeGeometries([
      box(0.62, 0.55, 0.85, 0, 0.78, -0.08),
      box(0.5, 0.72, 0.42, 0, 1.25, 0.12, -0.15),
      box(0.12, 0.55, 0.12, -0.16, 0.78, 0.33),
      box(0.12, 0.55, 0.12, 0.16, 0.78, 0.33),
      box(0.34, 0.32, 0.42, 0, 1.78, 0.18),
      box(0.16, 0.14, 0.34, 0, 1.72, 0.47),
      cone(0.08, 0.4, -0.1, 2.1, 0.1),
      cone(0.08, 0.4, 0.1, 2.1, 0.1),
    ]),
    gold: mergeGeometries([
      box(0.56, 0.12, 0.46, 0, 1.53, 0.14),
      box(0.06, 0.04, 0.03, -0.08, 1.83, 0.39),
      box(0.06, 0.04, 0.03, 0.08, 1.83, 0.39),
      staff,
    ]),
  };
}

/** Jarres en terre cuite près des coins des terrasses. */
export const jars = defineComponent({ color: 0xb8643a, perCorner: 2 }, (ctx, o) => {
  const rng = new Rng(ctx.layout.seed ^ 0xdec0);
  const matrices = cornerClusterSlots(ctx.layout, o.perCorner, rng).map((s) => place(s.position, rng.next() * 6, 0.8 + rng.next() * 0.5));
  const profile = [
    [0, 0],
    [0.16, 0.02],
    [0.24, 0.16],
    [0.25, 0.3],
    [0.18, 0.46],
    [0.11, 0.52],
    [0.13, 0.58],
    [0, 0.58],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  ctx.scene.add(instanced(new THREE.LatheGeometry(profile, 10), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.85 }), matrices, { shadow: true }));
});

/** Pierre de faîte : l'objectif, visible de partout grâce à son faisceau. Pyramide dorée ou cristal. */
export const capstone = defineComponent({ style: 'pyramid' as 'pyramid' | 'crystal', color: 0xffc940, glow: [2.2, 1.5, 0.3] as HDR }, (ctx, o) => {
  const top = ctx.layout.config.floors * FLOOR_HEIGHT;
  const geometry = o.style === 'crystal' ? new THREE.OctahedronGeometry(1.3, 0) : new THREE.ConeGeometry(1.5, 2.4, 4);
  if (o.style === 'crystal') geometry.scale(0.9, 1.4, 0.9);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: o.color, metalness: o.style === 'crystal' ? 0.1 : 0.7, roughness: 0.25, emissive: hdr(o.glow).multiplyScalar(0.45) }),
  );
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  ctx.scene.add(mesh);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 1.4, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: hdr(o.glow).multiplyScalar(0.6), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = top + 31;
  ctx.scene.add(beam);
  return {
    update: (dt, time) => {
      mesh.rotation.y += dt * 0.6;
      mesh.position.y = top + 1.4 + Math.sin(time * 2) * 0.15;
    },
  };
});

/** Particules d'ambiance : poussière/pollen qui flotte, neige qui tombe, braises qui montent. */
export const particles = defineComponent(
  { color: [1.6, 1.25, 0.8] as HDR, size: 0.35, count: 420, motion: 'float' as 'float' | 'snow' | 'embers' },
  (ctx: SceneContext, o) => {
    const { rng, groundHalf, pyramidHeight } = ctx;
    const top = pyramidHeight + 14;
    const positions = new Float32Array(o.count * 3);
    const phase = new Float32Array(o.count);
    for (let i = 0; i < o.count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 4 + rng.next() * (groundHalf + 28);
      positions.set([Math.cos(a) * r, 0.5 + rng.next() * top, Math.sin(a) * r], i * 3);
      phase[i] = rng.next() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attr);
    const snow = o.motion === 'snow';
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: o.size,
        map: glowTexture(),
        color: hdr(o.color),
        transparent: true,
        opacity: snow ? 0.9 : 0.75,
        depthWrite: false,
        blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    points.frustumCulled = false;
    ctx.scene.add(points);
    const speed = snow ? -1.6 : o.motion === 'embers' ? 1.4 : 0;
    return {
      update(dt, time) {
        if (o.motion === 'float') {
          points.rotation.y += dt * 0.02;
          points.position.y = Math.sin(time * 0.4) * 0.6;
          return;
        }
        for (let i = 0; i < o.count; i++) {
          let y = positions[i * 3 + 1] + speed * dt * (0.7 + (phase[i] % 1));
          if (y < 0) y += top;
          if (y > top) y -= top;
          positions[i * 3 + 1] = y;
          positions[i * 3] += Math.sin(time * 0.8 + phase[i]) * dt * 0.4;
        }
        attr.needsUpdate = true;
      },
    };
  },
);

// ---------- Textures ----------

function bannerTexture(cloth: string, emblem: string): THREE.CanvasTexture {
  return canvasTexture(128, 300, (g) => {
    g.beginPath();
    g.moveTo(4, 0);
    g.lineTo(124, 0);
    g.lineTo(124, 260);
    g.lineTo(64, 296);
    g.lineTo(4, 260);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, cloth);
    grad.addColorStop(0.5, `#${new THREE.Color(cloth).offsetHSL(0, 0, 0.18).getHexString()}`);
    grad.addColorStop(1, cloth);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = emblem;
    g.lineWidth = 6;
    g.stroke();
    g.strokeRect(18, 14, 92, 230);
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.ellipse(64, 92, 16, 22, 0, 0, Math.PI * 2);
    g.moveTo(64, 114);
    g.lineTo(64, 196);
    g.moveTo(36, 130);
    g.lineTo(92, 130);
    g.stroke();
    g.fillStyle = emblem;
    g.beginPath();
    g.moveTo(64, 222);
    g.lineTo(76, 236);
    g.lineTo(64, 250);
    g.lineTo(52, 236);
    g.closePath();
    g.fill();
  });
}

/** Pilier de pierre à bandes colorées et liserés dorés. */
function pillarTexture(stone: string, band: string, trim: number): THREE.CanvasTexture {
  const gold = `#${new THREE.Color(trim).getHexString()}`;
  return canvasTexture(64, 256, (g) => {
    g.fillStyle = stone;
    g.fillRect(0, 0, 64, 256);
    const stripe = (y: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(0, y, 64, h);
    };
    for (const y of [18, 120, 222]) {
      stripe(y, 22, band);
      stripe(y - 5, 4, gold);
      stripe(y + 23, 4, gold);
    }
    g.fillStyle = gold;
    for (let y = 56; y < 110; y += 18) g.fillRect(28, y, 8, 8);
    for (let y = 158; y < 212; y += 18) g.fillRect(28, y, 8, 8);
  });
}
