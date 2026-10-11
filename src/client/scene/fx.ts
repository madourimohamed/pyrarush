import * as THREE from 'three';

interface Tween {
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  done?: () => void;
}

/** Mini gestionnaire d'animations : suffisant pour des animations courtes et lisibles. */
export class Tweens {
  private list: Tween[] = [];

  add(duration: number, update: (t: number) => void, done?: () => void): void {
    this.list.push({ elapsed: 0, duration, update, done });
  }

  update(dt: number): void {
    const finished: Tween[] = [];
    for (const tween of this.list) {
      tween.elapsed += dt;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(t);
      if (t >= 1) finished.push(tween);
    }
    if (finished.length === 0) return;
    this.list = this.list.filter((t) => !finished.includes(t));
    for (const tween of finished) tween.done?.();
  }

  clear(): void {
    this.list = [];
  }
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const puffGeometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);

/** Petits cubes qui s'éparpillent (atterrissage, téléportation, victoire). */
export function burst(
  scene: THREE.Scene,
  tweens: Tweens,
  at: THREE.Vector3,
  color: number,
  count = 10,
  speed = 3,
  rise = 1.5,
): void {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true });
  const cubes: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const mesh = new THREE.Mesh(puffGeometry, material);
    mesh.position.copy(at);
    scene.add(mesh);
    cubes.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, rise + Math.random() * rise, Math.sin(a) * speed) });
  }
  let last = 0;
  tweens.add(
    0.7,
    (t) => {
      const dt = (t - last) * 0.7;
      last = t;
      for (const c of cubes) {
        c.v.y -= 9 * dt;
        c.mesh.position.addScaledVector(c.v, dt);
        c.mesh.rotation.x += dt * 8;
        c.mesh.scale.setScalar(1 - t * 0.7);
      }
      material.opacity = 1 - t;
    },
    () => {
      for (const c of cubes) scene.remove(c.mesh);
      material.dispose();
    },
  );
}

/** Texture d'un symbole (ex. « ? ») pour les portes reconnaissables. */
export function symbolTexture(symbol: string, color = '#ffffff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Bulle dorée du Bouclier d'Anubis, à accrocher à un personnage (le sien ou celui de l'adversaire). */
export function shieldBubble(): THREE.Mesh {
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  bubble.position.y = 1;
  bubble.visible = false;
  return bubble;
}

const trailGeometry = new THREE.PlaneGeometry(0.5, 0.5);

/**
 * Traînée légère (Turbo) : quelques bouffées lumineuses laissées derrière le personnage, qui s'estompent.
 * Réserve fixe de sprites réutilisés : aucun objet créé pendant la course.
 */
export class Trail {
  private readonly puffs: { mesh: THREE.Mesh; life: number }[] = [];
  private next = 0;
  private timer = 0;

  constructor(scene: THREE.Scene, color: number, count = 18) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(trailGeometry, material.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.puffs.push({ mesh, life: 0 });
    }
  }

  /** `at` = pieds du personnage ; `active` = turbo en cours (sinon les bouffées finissent de s'estomper). */
  update(dt: number, at: THREE.Vector3, active: boolean, camera: THREE.Camera): void {
    this.timer -= dt;
    if (active && this.timer <= 0) {
      this.timer = 0.045;
      const puff = this.puffs[this.next];
      this.next = (this.next + 1) % this.puffs.length;
      puff.life = 1;
      puff.mesh.position.set(at.x + (Math.random() - 0.5) * 0.3, at.y + 0.4 + Math.random() * 0.6, at.z + (Math.random() - 0.5) * 0.3);
      puff.mesh.visible = true;
    }
    for (const puff of this.puffs) {
      if (puff.life <= 0) continue;
      puff.life -= dt / 0.4;
      puff.mesh.visible = puff.life > 0;
      puff.mesh.quaternion.copy(camera.quaternion);
      puff.mesh.scale.setScalar(0.4 + puff.life * 0.8);
      (puff.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, puff.life) * 0.7;
    }
  }
}

