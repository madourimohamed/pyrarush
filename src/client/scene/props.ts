import * as THREE from 'three';
import { walkTerrace, type PyramidConfig } from '../../core';
import { burst, easeOutCubic, type Tweens } from './fx';

/**
 * Scarabée doré : il sort du mur et détale le long de la terrasse vers le passage le plus proche, puis s'enfouit.
 * La longueur de sa course indique la distance (il s'arrête avant la porte, sans la désigner) ;
 * proche du passage, il s'agite et brille davantage.
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
  run: number,
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

  const distance = run;
  const duration = 1.3 + run * 0.07;
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
