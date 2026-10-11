import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildColliders,
  doorCenter,
  getMechanic,
  terraceOuterHalf,
  wallHalf,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  FLOOR_HEIGHT,
  type Box,
  type Door,
  type Layout,
} from '../../core';
import { buildEnvironment, PALETTE, SUN_DIR, type Environment } from './environment';
import { symbolTexture, type Tweens } from './fx';
import { BoxingGlove } from './props';
import { applyWorldUVs, glowTexture, glyphTextures, stoneTexture, tileTexture } from './textures';

const COLORS = {
  doorPanel: 0x16737a,
  doorFrame: 0x2a1c14,
  gold: 0xf2c14e,
  hint: 0xffc93c,
  reveal: 0x3ce0ff,
  highlight: 0x7ff6ff,
  paving: '#e9c48c',
  stone: ['#e3b071', '#d9a465'],
  top: '#f1d29c',
};

/** Couleurs « HDR » (> 1) : elles déclenchent la lueur (bloom). */
const GLYPH_IDLE = new THREE.Color(1.6, 1.05, 0.45);
const GLYPH_BRIGHT = new THREE.Color(3.2, 2.4, 1.1);

export const HINT_COLORS = { chaud: 0xff3b1f, tiede: 0xffa21f, froid: 0x3d9bff } as const;

interface DoorView {
  door: Door;
  group: THREE.Group;
  panel: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  glyph: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  marker: THREE.Mesh;
  beam: THREE.Mesh;
  highlighted: boolean;
  privateHint: boolean;
  revealed: boolean;
  flashColor: THREE.Color | null;
  flashUntil: number;
}

/** Représentation 3D d'une pyramide. Ne contient aucune règle : elle affiche ce que le moteur décide. */
export class World {
  readonly scene = new THREE.Scene();
  readonly colliders: Box[];
  readonly pyramidHalf: number;
  readonly groundHalf: number;
  readonly doors = new Map<string, DoorView>();
  private readonly tweens: Tweens;
  private readonly environment: Environment;
  private readonly capstone: THREE.Mesh;
  private readonly flames: THREE.Mesh[] = [];
  private readonly glove = new BoxingGlove();
  private time = 0;

  constructor(
    readonly layout: Layout,
    tweens: Tweens,
    lowQuality: boolean,
  ) {
    this.tweens = tweens;
    const { config } = layout;
    this.colliders = buildColliders(layout);
    this.pyramidHalf = wallHalf(config, 1);
    this.groundHalf = terraceOuterHalf(config, 1);
    const height = config.floors * FLOOR_HEIGHT;

    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.5));
    const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(this.groundHalf * 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(lowQuality ? 1024 : 2048);
    const s = this.groundHalf * 1.3;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: this.groundHalf * 5 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);

    this.environment = buildEnvironment(this.scene, this.groundHalf, height, layout.seed, lowQuality);
    this.buildPaving();
    this.buildBlocks();
    this.buildTrims();
    const glyphs = glyphTextures();
    for (const door of layout.doors) this.buildDoor(door, glyphs);
    this.buildBraziers();
    this.capstone = this.buildCapstone(height);
    this.scene.add(this.glove.root);
  }

  private buildPaving(): void {
    const half = this.groundHalf;
    const tiles = tileTexture(COLORS.paving, 3);
    tiles.repeat.set((half * 2) / 3, (half * 2) / 3);
    const paving = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, half * 2),
      new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 }),
    );
    paving.rotation.x = -Math.PI / 2;
    paving.position.y = 0.01;
    paving.receiveShadow = true;
    this.scene.add(paving);

    const border = new THREE.MeshStandardMaterial({ color: 0xc28a52, roughness: 0.8 });
    const len = half * 2 + 1.2;
    for (let i = 0; i < 4; i++) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 0.6), border);
      const angle = (i * Math.PI) / 2;
      wall.position.set(Math.sin(angle) * (half + 0.3), 0.27, Math.cos(angle) * (half + 0.3));
      wall.rotation.y = angle;
      wall.castShadow = wall.receiveShadow = true;
      this.scene.add(wall);
    }
  }

  private buildBlocks(): void {
    const stone = COLORS.stone.map((c, i) => {
      const map = stoneTexture(c, 11 + i);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
    });
    const top = new THREE.MeshStandardMaterial({ map: tileTexture(COLORS.top, 7), roughness: 0.9 });
    for (const box of this.colliders) {
      if (box.kind !== 'block') continue;
      const size = box.max.map((v, i) => v - box.min[i]);
      const center = new THREE.Vector3((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      applyWorldUVs(geometry, center, [3, 1.5], 3);
      const side = stone[box.floor! % 2];
      const mesh = new THREE.Mesh(geometry, [side, side, top, side, side, side]);
      mesh.position.copy(center);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  /** Liseré doré sur le bord extérieur de chaque terrasse : beau, et lisible pour ne pas tomber. */
  private buildTrims(): void {
    const { config } = this.layout;
    const parts: THREE.BufferGeometry[] = [];
    const t = 0.16;
    for (const box of this.colliders) {
      if (box.kind !== 'block') continue;
      const a = wallHalf(config, box.floor!);
      const y = box.max[1] + 0.03;
      const eq = (v: number, w: number) => Math.abs(v - w) < 1e-6;
      const push = (w: number, d: number, x: number, z: number) => {
        const g = new THREE.BoxGeometry(w, 0.08, d);
        g.translate(x, y, z);
        parts.push(g);
      };
      const w = box.max[0] - box.min[0];
      const d = box.max[2] - box.min[2];
      const cx = (box.min[0] + box.max[0]) / 2;
      const cz = (box.min[2] + box.max[2]) / 2;
      if (eq(box.max[2], a)) push(w, t, cx, a - t / 2);
      if (eq(box.min[2], -a)) push(w, t, cx, -a + t / 2);
      if (eq(box.max[0], a)) push(t, d, a - t / 2, cz);
      if (eq(box.min[0], -a)) push(t, d, -a + t / 2, cz);
    }
    const trims = new THREE.Mesh(
      mergeGeometries(parts),
      new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.5, roughness: 0.35, emissive: 0x5a3a00 }),
    );
    this.scene.add(trims);
  }

  private buildDoor(door: Door, glyphs: THREE.Texture[]): void {
    const { config } = this.layout;
    const mechanic = getMechanic(door.mechanic);
    const group = new THREE.Group();
    const c = doorCenter(config, door);
    group.position.set(c.x, c.y, c.z);
    const out = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ][door.side];
    group.rotation.y = Math.atan2(out[0], out[1]);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH + 0.5, DOOR_HEIGHT + 0.3, 0.12),
      new THREE.MeshStandardMaterial({ color: COLORS.doorFrame, roughness: 0.8 }),
    );
    frame.position.set(0, 0.08, 0.0);
    group.add(frame);
    const gold = new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.55, roughness: 0.3, emissive: 0x4a3000 });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH + 0.16, DOOR_HEIGHT + 0.1, 0.12), gold);
    inner.position.set(0, 0.03, 0.03);
    group.add(inner);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH + 1, 0.3, 0.34), gold);
    lintel.position.set(0, DOOR_HEIGHT / 2 + 0.3, 0.1);
    lintel.castShadow = true;
    group.add(lintel);

    const baseColor = new THREE.Color(mechanic.appearance?.color ?? COLORS.doorPanel);
    const material = new THREE.MeshStandardMaterial({ color: baseColor.clone(), roughness: 0.45, metalness: 0.15 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, 0.16), material);
    panel.position.z = 0.06;
    group.add(panel);

    const glyph = new THREE.MeshBasicMaterial({
      map: mechanic.appearance ? symbolTexture(mechanic.appearance.symbol(config), '#ffffff') : glyphs[door.ring % glyphs.length],
      color: mechanic.appearance ? new THREE.Color(0.35, 0.12, 0.02) : GLYPH_IDLE.clone(),
      transparent: true,
      depthWrite: false,
    });
    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), glyph);
    emblem.position.set(0, 0.25, 0.085);
    panel.add(emblem);

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.4) }),
    );
    marker.position.set(0, DOOR_HEIGHT / 2 + 1, 0.5);
    marker.visible = false;
    group.add(marker);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 18, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.6, 2.2, 2.6),
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.set(0, 9 - DOOR_HEIGHT / 2, 0.8);
    beam.visible = false;
    group.add(beam);

    this.scene.add(group);
    this.doors.set(door.id, {
      door,
      group,
      panel,
      material,
      glyph,
      baseColor,
      marker,
      beam,
      highlighted: false,
      privateHint: false,
      revealed: false,
      flashColor: null,
      flashUntil: 0,
    });
  }

  /** Braseros aux coins de chaque terrasse. */
  private buildBraziers(): void {
    const { config } = this.layout;
    const bowls: THREE.BufferGeometry[] = [];
    const flameGeo = new THREE.ConeGeometry(0.28, 0.9, 7);
    flameGeo.translate(0, 0.45, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.25) });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.8, 1.2) });
    const halo = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(0.9, 0.4, 0.1),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let floor = 1; floor <= config.floors; floor++) {
      const r = terraceOuterHalf(config, floor) - (floor === 1 ? 1.5 : 0.75);
      const y = (floor - 1) * FLOOR_HEIGHT;
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const x = sx * r;
        const z = sz * r;
        const stand = new THREE.CylinderGeometry(0.12, 0.2, 0.7, 6);
        stand.translate(x, y + 0.35, z);
        const bowl = new THREE.CylinderGeometry(0.42, 0.2, 0.3, 8);
        bowl.translate(x, y + 0.85, z);
        bowls.push(stand, bowl);
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(x, y + 0.95, z);
        const core = new THREE.Mesh(flameGeo, coreMat);
        core.scale.setScalar(0.5);
        flame.add(core);
        const glow = new THREE.Sprite(halo);
        glow.scale.setScalar(1.5);
        glow.position.y = 0.4;
        flame.add(glow);
        this.flames.push(flame);
        this.scene.add(flame);
      }
    }
    const stands = new THREE.Mesh(
      mergeGeometries(bowls),
      new THREE.MeshStandardMaterial({ color: 0x5a3a28, metalness: 0.3, roughness: 0.5 }),
    );
    stands.castShadow = true;
    this.scene.add(stands);
  }

  /** Pierre de faîte dorée : l'objectif, visible de partout grâce à son faisceau. */
  private buildCapstone(height: number): THREE.Mesh {
    const capstone = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.7, roughness: 0.25, emissive: 0xffa500, emissiveIntensity: 0.9 }),
    );
    capstone.position.y = height + 1.3;
    capstone.rotation.y = Math.PI / 4;
    capstone.castShadow = true;
    this.scene.add(capstone);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.4, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.4, 1.0, 0.4),
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = height + 31;
    this.scene.add(beam);
    return capstone;
  }

  setHighlight(doorId: string | null): void {
    for (const view of this.doors.values()) view.highlighted = view.door.id === doorId;
  }

  /** Indices privés : les passages connus du joueur, sur les étages qu'il doit encore (re)franchir. */
  setPrivateHints(known: Set<string>, playerFloor: number): void {
    for (const view of this.doors.values()) {
      view.privateHint = known.has(view.door.id) && view.door.floor >= playerFloor;
      view.marker.visible = view.privateHint;
    }
  }

  setReveal(doorId: string, on: boolean): void {
    const view = this.doors.get(doorId);
    if (!view) return;
    view.revealed = on;
    view.beam.visible = on;
  }

  flashDoor(doorId: string, color: number, duration = 1.4): void {
    const view = this.doors.get(doorId);
    if (!view) return;
    view.flashColor = new THREE.Color(color);
    view.flashUntil = this.time + duration;
  }

  shakeDoor(doorId: string): void {
    const view = this.doors.get(doorId);
    if (!view) return;
    this.tweens.add(0.35, (t) => (view.panel.position.x = Math.sin(t * Math.PI * 6) * 0.06 * (1 - t)));
  }

  /** Le panneau s'enfonce dans le sol puis remonte. */
  openDoor(doorId: string, holdSeconds = 0.9): void {
    const view = this.doors.get(doorId);
    if (!view) return;
    this.tweens.add(0.25, (t) => (view.panel.position.y = -t * (DOOR_HEIGHT - 0.05)));
    setTimeout(() => this.tweens.add(0.3, (t) => (view.panel.position.y = -(1 - t) * (DOOR_HEIGHT - 0.05))), holdSeconds * 1000);
  }

  /** Piège : la porte s'ouvre et un gant de boxe jaillit. `onHit` est appelé à l'impact. */
  punchDoor(doorId: string, big: boolean, onHit: () => void): void {
    const view = this.doors.get(doorId);
    if (!view) {
      onHit();
      return;
    }
    this.openDoor(doorId, 0.6);
    this.glove.punch(this.tweens, view.group, big, onHit);
  }

  /** Position de la porte dans le monde (pour orienter les effets). */
  doorObject(doorId: string): THREE.Object3D | undefined {
    return this.doors.get(doorId)?.group;
  }

  update(dt: number): void {
    this.time += dt;
    this.environment.update(dt);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    for (const view of this.doors.values()) {
      const m = view.material;
      let glyphBright = view.highlighted ? 0.6 + 0.4 * pulse : 0;
      if (view.flashColor && this.time < view.flashUntil) {
        m.color.copy(view.flashColor);
        m.emissive.copy(view.flashColor).multiplyScalar(0.9);
      } else if (view.revealed) {
        m.color.set(COLORS.reveal);
        m.emissive.set(COLORS.reveal).multiplyScalar(0.6 + 0.6 * pulse);
        glyphBright = 1;
      } else if (view.privateHint) {
        m.color.set(COLORS.hint);
        m.emissive.set(COLORS.hint).multiplyScalar(0.5 + (view.highlighted ? 0.4 * pulse : 0));
        glyphBright = 1;
      } else {
        m.color.copy(view.baseColor);
        if (view.highlighted) m.emissive.set(COLORS.highlight).multiplyScalar(0.25 + 0.25 * pulse);
        else m.emissive.setScalar(0);
      }
      if (!getMechanic(view.door.mechanic).appearance) view.glyph.color.copy(GLYPH_IDLE).lerp(GLYPH_BRIGHT, glyphBright);
      if (view.marker.visible) {
        view.marker.position.y = DOOR_HEIGHT / 2 + 1 + Math.sin(this.time * 3 + view.door.ring) * 0.12;
        view.marker.rotation.y += dt * 2;
      }
      if (view.beam.visible) (view.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.2 * pulse;
    }
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const k = Math.sin(this.time * 13 + i * 2.1) * 0.5 + Math.sin(this.time * 7.3 + i) * 0.5;
      f.scale.set(1 + k * 0.08, 1 + k * 0.22, 1 + k * 0.08);
      f.rotation.y += dt * 1.5;
    }
    this.capstone.rotation.y += dt * 0.6;
    this.capstone.position.y = this.layout.config.floors * FLOOR_HEIGHT + 1.3 + Math.sin(this.time * 2) * 0.15;
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
  }
}
