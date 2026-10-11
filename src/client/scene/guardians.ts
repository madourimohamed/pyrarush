import * as THREE from 'three';
import type { TrapStyle } from '../../core';
import type { SfxName } from '../audio/sfx';
import { easeOutCubic, type Tweens } from './fx';

/**
 * Gardien d'un piège : il surgit d'une porte et frappe le joueur. Les règles du piège ne changent pas,
 * seule l'apparence varie (le thème choisit les gardiens possibles, voir Theme.trapStyles).
 */
export interface TrapGuardian {
  readonly root: THREE.Object3D;
  /** Son joué quand le gardien surgit. */
  readonly cue: SfxName;
  /** Titre du message affiché (sinon celui de la mécanique). */
  readonly title?: string;
  /** `doorObject` donne la position et l'orientation de la porte (z local = vers l'extérieur) ; `onHit` est appelé à l'impact. */
  strike(tweens: Tweens, doorObject: THREE.Object3D, big: boolean, onHit: () => void): void;
}

/** Gant de boxe monté sur un ressort : il jaillit de la porte. Un seul gant, déplacé à la demande. */
export class BoxingGlove implements TrapGuardian {
  readonly root = new THREE.Group();
  readonly cue = 'spring' as const;
  private readonly glove = new THREE.Group();
  private readonly spring: THREE.Mesh;
  private readonly pow: THREE.Sprite;

  constructor() {
    const red = new THREE.MeshStandardMaterial({ color: 0xe8262c, roughness: 0.35, metalness: 0.05, emissive: 0x400000 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.6 });
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), red);
    fist.scale.set(1, 0.9, 1.1);
    fist.castShadow = true;
    this.glove.add(fist);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), red);
    thumb.position.set(0.34, 0.08, -0.05);
    thumb.scale.set(1, 1.3, 1.1);
    this.glove.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 14), white);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = -0.42;
    this.glove.add(cuff);
    this.root.add(this.glove);

    // Ressort : un hélice tubulaire, étirée selon z.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2 * 7;
      points.push(new THREE.Vector3(Math.cos(a) * 0.14, Math.sin(a) * 0.14, i / 120));
    }
    this.spring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 240, 0.025, 5),
      new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.8, roughness: 0.3 }),
    );
    this.root.add(this.spring);

    this.pow = new THREE.Sprite(new THREE.SpriteMaterial({ map: comicTexture('POW!', '#ffd400', '#e8262c', '#7a0d10'), transparent: true, depthTest: false }));
    this.pow.renderOrder = 10;
    this.pow.visible = false;
    this.root.add(this.pow);
    this.root.visible = false;
  }

  strike(tweens: Tweens, doorObject: THREE.Object3D, big: boolean, onHit: () => void): void {
    this.root.visible = true;
    this.root.position.copy(doorObject.position);
    this.root.position.y -= 0.05;
    this.root.quaternion.copy(doorObject.quaternion);
    const reach = big ? 1.9 : 1.5;
    this.glove.scale.setScalar(big ? 1.35 : 1);
    let hit = false;
    const set = (extension: number) => {
      const len = Math.max(0.05, extension);
      this.spring.scale.set(1, 1, len);
      this.glove.position.z = len + 0.4;
    };
    set(0);
    tweens.add(
      0.75,
      (t) => {
        // Sortie éclair, petite pause, puis retour.
        const ext = t < 0.15 ? easeOutCubic(t / 0.15) : t < 0.4 ? 1 : 1 - easeOutCubic((t - 0.4) / 0.6);
        set(ext * reach);
        this.glove.rotation.z = t < 0.4 ? Math.sin(t * 40) * 0.08 : 0;
        if (!hit && t >= 0.13) {
          hit = true;
          onHit();
          this.pow.visible = true;
          this.pow.position.set(0.6, 0.9, reach + 0.6);
        }
        if (hit) {
          const k = Math.min(1, (t - 0.13) / 0.12);
          const fade = t > 0.55 ? 1 - (t - 0.55) / 0.2 : 1;
          this.pow.scale.setScalar((big ? 2.2 : 1.7) * easeOutCubic(k) * Math.max(0, fade));
        }
      },
      () => {
        this.root.visible = false;
        this.pow.visible = false;
      },
    );
  }
}

/** Bandelettes : tissu clair enroulé en diagonale, un peu sali. */
function bandageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6d9b8';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 256; i += 14) {
    ctx.strokeStyle = i % 28 === 0 ? 'rgba(120, 95, 60, 0.55)' : 'rgba(255, 250, 235, 0.6)';
    ctx.lineWidth = i % 28 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i + 40);
    ctx.stroke();
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = 'rgba(110, 80, 40, 0.12)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Momie gardienne : elle sort de la porte, bras tendus, et repousse le joueur (« BOUH ! »). */
export class Mummy implements TrapGuardian {
  readonly root = new THREE.Group();
  readonly cue = 'groan' as const;
  readonly title = 'Le gardien surgit !';
  private readonly body = new THREE.Group();
  private readonly arms: THREE.Group[] = [];
  private readonly boo: THREE.Sprite;

  constructor() {
    const cloth = new THREE.MeshStandardMaterial({ map: bandageTexture(), roughness: 0.95 });
    const part = (geometry: THREE.BufferGeometry, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(geometry, cloth);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    // Origine aux pieds ; la porte est 1,1 m plus haut (centre de la porte).
    this.body.add(part(new THREE.CylinderGeometry(0.27, 0.33, 0.95, 12), 0, 0.95));
    for (const x of [-0.13, 0.13]) this.body.add(part(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 8), x, 0.28));
    const head = part(new THREE.SphereGeometry(0.25, 14, 10), 0, 1.62);
    head.scale.set(1, 1.1, 1);
    this.body.add(head);
    const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 0.35) });
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyes);
      eye.position.set(x, 1.66, 0.22);
      this.body.add(eye);
    }
    for (const x of [-0.24, 0.24]) {
      const arm = new THREE.Group();
      arm.position.set(x, 1.3, 0);
      const limb = part(new THREE.CylinderGeometry(0.075, 0.085, 0.62, 8), 0, 0, 0.31);
      limb.rotation.x = Math.PI / 2;
      arm.add(limb);
      // Bout de bandelette qui pend.
      const strip = part(new THREE.BoxGeometry(0.06, 0.32, 0.01), 0, -0.16, 0.45);
      arm.add(strip);
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.root.add(this.body);

    this.boo = new THREE.Sprite(new THREE.SpriteMaterial({ map: comicTexture('BOUH!', '#c9f26b', '#4a2a6a', '#2a1240'), transparent: true, depthTest: false }));
    this.boo.renderOrder = 10;
    this.boo.visible = false;
    this.root.add(this.boo);
    this.root.visible = false;
  }

  strike(tweens: Tweens, doorObject: THREE.Object3D, big: boolean, onHit: () => void): void {
    this.root.visible = true;
    this.root.position.copy(doorObject.position);
    this.root.quaternion.copy(doorObject.quaternion);
    this.body.position.y = -1.1;
    this.body.scale.setScalar(big ? 1.25 : 1);
    const reach = big ? 1.4 : 1.1;
    let hit = false;
    tweens.add(
      1,
      (t) => {
        // Surgit en titubant, frappe, reste un instant menaçante puis rentre dans la porte.
        const out = t < 0.3 ? easeOutCubic(t / 0.3) : t < 0.6 ? 1 : 1 - easeOutCubic((t - 0.6) / 0.4);
        this.body.position.z = -0.5 + out * (reach + 0.5);
        this.body.rotation.z = Math.sin(t * 22) * 0.07 * out;
        this.arms.forEach((arm, i) => (arm.rotation.x = -0.25 + Math.sin(t * 30 + i * 2) * 0.12 - out * 0.15));
        if (!hit && t >= 0.27) {
          hit = true;
          onHit();
          this.boo.visible = true;
          this.boo.position.set(-0.5, 1.2, reach + 0.7);
        }
        if (hit) {
          const k = Math.min(1, (t - 0.27) / 0.12);
          const fade = t > 0.6 ? 1 - (t - 0.6) / 0.2 : 1;
          this.boo.scale.setScalar((big ? 2.2 : 1.8) * easeOutCubic(k) * Math.max(0, fade));
        }
      },
      () => {
        this.root.visible = false;
        this.boo.visible = false;
      },
    );
  }
}

/** Un gardien de chaque sorte, créés à la demande et partagés par toutes les portes de la pyramide. */
export const GUARDIANS: Record<TrapStyle, () => TrapGuardian> = {
  glove: () => new BoxingGlove(),
  mummy: () => new Mummy(),
};

/** Onomatopée de bande dessinée (éclat coloré + texte), affichée au moment de l'impact. */
export function comicTexture(text: string, fill: string, edge: string, ink: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 === 0 ? 78 : 50;
    ctx.lineTo(128 + Math.cos(a) * r * 1.5, 80 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.font = `900 ${text.length > 4 ? 52 : 62}px "Fredoka Variable", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = ink;
  ctx.strokeText(text, 128, 84);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 84);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
