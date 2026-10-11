import * as THREE from 'three';
import { walkTerrace, type PyramidConfig } from '../../core';
import { burst, easeOutCubic, type Tweens } from './fx';

/**
 * Scarabée doré : il sort du mur et détale le long de la terrasse vers le passage le plus proche,
 * puis s'enfouit. Proche du passage, il s'agite et brille davantage.
 */
export function releaseScarab(
  scene: THREE.Scene,
  tweens: Tweens,
  config: PyramidConfig,
  floor: number,
  side: number,
  tangent: number,
  dir: 1 | -1,
  near: boolean,
): void {
  const root = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffc23a,
    emissive: 0xff9d00,
    emissiveIntensity: near ? 2.2 : 0.9,
    metalness: 0.6,
    roughness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d3b2a, metalness: 0.4, roughness: 0.4 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), shellMat);
  shell.scale.set(0.85, 0.55, 1.2);
  shell.position.y = 0.16;
  root.add(shell);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), dark);
  head.position.set(0, 0.14, 0.3);
  root.add(head);
  const legs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.22, 0.03, 0.03);
  for (const z of [-0.12, 0.02, 0.16]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, dark);
      leg.position.set(s * 0.2, 0.06, z);
      legs.push(leg);
      root.add(leg);
    }
  }
  root.scale.setScalar(0);
  scene.add(root);

  const distance = near ? 4.5 : 8;
  const duration = near ? 2 : 1.7;
  const point = (s: number) => walkTerrace(config, floor, side, tangent, dir * s);
  const start = point(0);
  root.position.set(start.x, start.y, start.z);

  let sparkle = 0;
  let last = 0;
  tweens.add(
    duration,
    (t) => {
      const dt = (t - last) * duration;
      last = t;
      const appear = Math.min(1, t / 0.12);
      const vanish = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
      root.scale.setScalar(2 * easeOutCubic(appear) * vanish);
      const s = distance * easeOutCubic(Math.max(0, (t - 0.1) / 0.75));
      const p = point(s);
      const ahead = point(s + 0.2);
      const hop = near ? Math.abs(Math.sin(t * 28)) * 0.35 : 0;
      root.position.set(p.x, p.y + hop - (1 - vanish) * 0.3, p.z);
      root.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      for (let i = 0; i < legs.length; i++) legs[i].rotation.y = Math.sin(t * 60 + i * 1.7) * 0.5;
      sparkle += dt;
      if (sparkle > (near ? 0.08 : 0.16) && t < 0.85) {
        sparkle = 0;
        burst(scene, tweens, root.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 0xffd36b, near ? 4 : 2, 0.8, 0.6);
      }
    },
    () => {
      burst(scene, tweens, root.position.clone(), 0xe0b070, 8, 1.6, 1);
      scene.remove(root);
      root.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      shellMat.dispose();
      dark.dispose();
    },
  );
}

/** Gant de boxe monté sur un ressort : il jaillit de la porte. Un seul gant, déplacé à la demande. */
export class BoxingGlove {
  readonly root = new THREE.Group();
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

    this.pow = new THREE.Sprite(new THREE.SpriteMaterial({ map: powTexture(), transparent: true, depthTest: false }));
    this.pow.renderOrder = 10;
    this.pow.visible = false;
    this.root.add(this.pow);
    this.root.visible = false;
  }

  /**
   * Coup de poing depuis une porte. `doorObject` donne la position et l'orientation (z local = vers l'extérieur).
   * `onHit` est appelé au moment de l'impact.
   */
  punch(tweens: Tweens, doorObject: THREE.Object3D, big: boolean, onHit: () => void): void {
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

function powTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  // Éclat de bande dessinée.
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 === 0 ? 78 : 50;
    ctx.lineTo(128 + Math.cos(a) * r * 1.5, 80 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd400';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#e8262c';
  ctx.stroke();
  ctx.font = '900 62px "Fredoka Variable", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#7a0d10';
  ctx.strokeText('POW!', 128, 84);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('POW!', 128, 84);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
