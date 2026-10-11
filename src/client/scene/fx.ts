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
