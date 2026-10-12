import * as THREE from 'three';
import type { Vec3 } from '../../core';
import { burst, type Tweens } from './fx';
import { comicMaterial, popComic } from './guardians';

interface MineView {
  root: THREE.Group;
  light: THREE.Mesh;
  own: boolean;
  age: number;
}

/**
 * Mines du duel. Celles du joueur sont bien visibles (voyant rouge qui clignote) ;
 * celles de l'adversaire sont presque invisibles : un disque au ras du sol et un bref scintillement de temps en temps,
 * pour qu'un joueur attentif puisse les repérer et sauter par-dessus.
 */
export class Mines {
  private readonly views = new Map<number, MineView>();
  private readonly disc = new THREE.CylinderGeometry(0.32, 0.36, 0.08, 16);
  private readonly bulb = new THREE.SphereGeometry(0.08, 10, 8);
  private readonly ownMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.6, metalness: 0.4 });
  private readonly hiddenMaterial: THREE.MeshStandardMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    floorColor: string,
  ) {
    this.hiddenMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(floorColor).multiplyScalar(0.82), roughness: 0.95 });
  }

  add(id: number, p: Vec3, own: boolean): void {
    const root = new THREE.Group();
    root.position.set(p.x, p.y + 0.02, p.z);
    root.add(new THREE.Mesh(this.disc, own ? this.ownMaterial : this.hiddenMaterial));
    const light = new THREE.Mesh(this.bulb, new THREE.MeshBasicMaterial({ color: own ? new THREE.Color(2.2, 0.25, 0.15) : new THREE.Color(1.6, 1.5, 1.2) }));
    light.position.y = 0.07;
    light.visible = own;
    root.add(light);
    this.scene.add(root);
    this.views.set(id, { root, light, own, age: 0 });
  }

  remove(id: number): THREE.Vector3 | null {
    const view = this.views.get(id);
    if (!view) return null;
    this.scene.remove(view.root);
    (view.light.material as THREE.Material).dispose();
    this.views.delete(id);
    return view.root.position.clone();
  }

  /** Explosion : gerbe, onomatopée « BOUM ! », puis la mine disparaît. */
  explode(id: number, fallback: Vec3): void {
    const at = this.remove(id) ?? new THREE.Vector3(fallback.x, fallback.y, fallback.z);
    burst(this.scene, this.tweens, at.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xff7a2a, 22, 5, 3);
    burst(this.scene, this.tweens, at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x4a3a30, 12, 3, 2);
    popComic(this.scene, this.tweens, comicMaterial('BOUM!', '#ff8a2a', '#7a1d0a', '#4a0d04'), at.clone().add(new THREE.Vector3(0, 1.6, 0)), 2.4);
  }

  update(dt: number): void {
    for (const view of this.views.values()) {
      view.age += dt;
      if (view.own) {
        view.light.visible = view.age % 0.8 < 0.4;
      } else {
        // Bref scintillement toutes les 2,5 s : un indice pour l'œil attentif.
        const phase = view.age % 2.5;
        view.light.visible = phase < 0.15;
        view.light.scale.setScalar(1 + phase * 6);
      }
    }
  }

  clear(): void {
    for (const id of [...this.views.keys()]) this.remove(id);
  }
}
