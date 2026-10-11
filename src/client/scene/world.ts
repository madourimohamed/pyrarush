import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildColliders, terraceOuterHalf, wallHalf, FLOOR_HEIGHT, Rng, type Box, type Layout, type Theme } from '../../core';
import { buildComponents } from './components';
import { DoorsView } from './doors';
import type { Tweens } from './fx';
import { BoxingGlove } from './props';
import { applyWorldUVs, stoneTexture, tileTexture } from './textures';
import { sunDirection } from './themes';

export const HINT_COLORS = { chaud: 0xff3b1f, tiede: 0xffa21f, froid: 0x3d9bff } as const;

/**
 * Représentation 3D d'une pyramide. Ne contient aucune règle : elle affiche ce que le moteur décide.
 * - structure liée au jeu (blocs, terrasses, portes) : construite ici, aux couleurs de la palette du thème ;
 * - tout le reste (ciel, eau, végétation, statues, braseros…) : composants listés par le thème du niveau.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly colliders: Box[];
  readonly pyramidHalf: number;
  readonly groundHalf: number;
  readonly doors: DoorsView;
  private readonly glove = new BoxingGlove();
  private readonly updateComponents: (dt: number, time: number) => void;
  private time = 0;

  constructor(
    readonly layout: Layout,
    readonly theme: Theme,
    private readonly tweens: Tweens,
    lowQuality: boolean,
  ) {
    const { config } = layout;
    this.colliders = buildColliders(layout);
    this.pyramidHalf = wallHalf(config, 1);
    this.groundHalf = terraceOuterHalf(config, 1);

    this.addLights(lowQuality);
    this.buildPaving();
    this.buildBlocks();
    this.buildTrims();
    this.doors = new DoorsView(layout, theme, tweens);
    this.scene.add(this.doors.group, this.glove.root);

    this.updateComponents = buildComponents(
      {
        scene: this.scene,
        layout,
        theme,
        rng: new Rng(layout.seed ^ 0xa11ce),
        lowQuality,
        groundHalf: this.groundHalf,
        pyramidHeight: config.floors * FLOOR_HEIGHT,
        anchors: {},
      },
      theme.components,
    );
  }

  private addLights(lowQuality: boolean): void {
    const { theme } = this;
    this.scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
    const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
    sun.position.copy(sunDirection(theme)).multiplyScalar(this.groundHalf * 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(lowQuality ? 1024 : 2048);
    const s = this.groundHalf * 1.3;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: this.groundHalf * 5 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
  }

  private buildPaving(): void {
    const half = this.groundHalf;
    const tiles = tileTexture(this.theme.paving, 3);
    tiles.repeat.set((half * 2) / 3, (half * 2) / 3);
    const paving = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 }));
    paving.rotation.x = -Math.PI / 2;
    paving.position.y = 0.01;
    paving.receiveShadow = true;
    this.scene.add(paving);

    const parts: THREE.BufferGeometry[] = [];
    const len = half * 2 + 1.2;
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BoxGeometry(len, 0.55, 0.6);
      const angle = (i * Math.PI) / 2;
      g.rotateY(angle);
      g.translate(Math.sin(angle) * (half + 0.3), 0.27, Math.cos(angle) * (half + 0.3));
      parts.push(g);
    }
    const border = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: this.theme.border, roughness: 0.8 }));
    border.castShadow = border.receiveShadow = true;
    this.scene.add(border);
  }

  private buildBlocks(): void {
    const stone = this.theme.stone.map((c, i) => new THREE.MeshStandardMaterial({ map: stoneTexture(c, 11 + i), roughness: 0.92 }));
    const top = new THREE.MeshStandardMaterial({ map: tileTexture(this.theme.top, 7), roughness: 0.9 });
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

  /** Liseré sur le bord extérieur de chaque terrasse : beau, et lisible pour ne pas tomber. */
  private buildTrims(): void {
    const { config } = this.layout;
    const parts: THREE.BufferGeometry[] = [];
    const t = 0.16;
    const eq = (v: number, w: number) => Math.abs(v - w) < 1e-6;
    for (const box of this.colliders) {
      if (box.kind !== 'block') continue;
      const a = wallHalf(config, box.floor!);
      const y = box.max[1] + 0.03;
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
    const { trim } = this.theme;
    this.scene.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: trim.color, metalness: 0.5, roughness: 0.35, emissive: trim.emissive })));
  }

  // ---------- Effets sur les portes (délégués) ----------

  setHighlight(doorId: string | null): void {
    this.doors.setHighlight(doorId);
  }

  setPrivateHints(known: Set<string>, playerFloor: number): void {
    this.doors.setPrivateHints(known, playerFloor);
  }

  setReveal(doorId: string, on: boolean): void {
    this.doors.setReveal(doorId, on);
  }

  flashDoor(doorId: string, color: number, duration = 1.4): void {
    this.doors.flash(doorId, color, duration);
  }

  shakeDoor(doorId: string): void {
    this.doors.shake(doorId);
  }

  openDoor(doorId: string, holdSeconds = 0.9): void {
    this.doors.open(doorId, holdSeconds);
  }

  /** Piège : la porte s'ouvre et un gant de boxe jaillit. `onHit` est appelé à l'impact. */
  punchDoor(doorId: string, big: boolean, onHit: () => void): void {
    const transform = this.doors.transform(doorId);
    if (!transform) return onHit();
    this.doors.open(doorId, 0.6);
    this.glove.punch(this.tweens, transform, big, onHit);
  }

  update(dt: number): void {
    this.time += dt;
    this.doors.update(dt);
    this.updateComponents(dt, this.time);
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
