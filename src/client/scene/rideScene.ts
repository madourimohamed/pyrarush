import * as THREE from 'three';
import { doorFront, sideCoords, terraceDistance, walkTerrace, type Door, type PyramidConfig } from '../../core';
import type { SfxName } from '../audio/sfx';
import type { FollowCamera } from '../camera';
import type { Character } from './character';
import { burst, easeInOut, easeOutCubic, Trail, type Tweens } from './fx';
import { comicMaterial, popComic } from './guardians';
import type { Cutscene } from './trapScenes';

export interface RideContext {
  scene: THREE.Scene;
  tweens: Tweens;
  config: PyramidConfig;
  character: Character;
  /** Passage où la voiture dépose le joueur, et sens du trajet le long de la terrasse. */
  door: Door;
  dir: 1 | -1;
  /** Durée totale (s), décidée par le serveur (la même pour tous les joueurs). */
  duration: number;
  /** Caméra de la vue (orientation des bouffées de poussière). */
  view: THREE.Camera;
  /** Joueur transporté seulement : caméra et sons. */
  camera?: FollowCamera;
  sound?(name: SfxName): void;
}

/** Hauteur du joueur assis dans la voiture. */
const SEAT = 0.55;

/**
 * Voiture (pouvoir du multijoueur) : une petite voiture cartoon surgit (« VROUM ! », pouet-pouet), le joueur saute dedans,
 * elle file le long de la terrasse en prenant les virages, freine devant le passage, dépose le joueur et repart.
 * Animation scénarisée : le chemin est la ligne médiane de la terrasse (jamais à travers un mur).
 */
export class RideScene implements Cutscene {
  private t = 0;
  private done = false;
  private readonly car: THREE.Group;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly path: THREE.Vector3[];
  private readonly drop: THREE.Vector3;
  private readonly trail: Trail;
  private fired = new Set<string>();

  constructor(private readonly ctx: RideContext) {
    const { config, character, door, dir } = ctx;
    const start = character.root.position.clone();
    const from = sideCoords(start);
    const floor = door.floor;
    // Échantillonne la ligne médiane de la terrasse, de la position du joueur jusqu'au passage.
    const target = doorFront(config, door);
    const total = Math.max(0.1, terraceDistance(config, floor, from, sideCoords(target), dir));
    const steps = Math.max(8, Math.ceil(total / 0.75));
    this.path = Array.from({ length: steps + 1 }, (_, i) => {
      const p = walkTerrace(config, floor, from.side, from.tangent, (i / steps) * total * dir);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    this.drop = new THREE.Vector3(target.x, target.y, target.z);
    this.car = buildCar(this.wheels);
    this.car.position.copy(this.path[0]);
    this.car.visible = false;
    ctx.scene.add(this.car);
    this.trail = new Trail(ctx.scene, 0xd9b77a, 12);
    if (ctx.camera) ctx.camera.closeUp = 0.6;
  }

  private get f(): number {
    return this.t / this.ctx.duration;
  }

  private once(key: string, at: number, action: () => void): void {
    if (this.f >= at && !this.fired.has(key)) {
      this.fired.add(key);
      action();
    }
  }

  update(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    const { character, scene, tweens, camera } = this.ctx;
    const root = character.root;
    const f = this.f;
    this.once('appear', 0, () => {
      this.car.visible = true;
      popComic(scene, tweens, comicMaterial('VROUM!', '#ffd84a', '#c0420a', '#4a1a04'), this.path[0].clone().add(new THREE.Vector3(0, 2.2, 0)), 1.8, 0.9);
      burst(scene, tweens, this.path[0].clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffffff, 10, 3, 1.2);
      this.ctx.sound?.('honk');
    });
    this.once('go', 0.15, () => this.ctx.sound?.('vroom'));
    this.once('brake', 0.85, () => {
      this.ctx.sound?.('land');
      camera?.shake(0.15);
    });

    if (f < 0.15) {
      // La voiture apparaît en rebondissant, le joueur saute dedans.
      const u = f / 0.15;
      this.car.scale.setScalar(easeOutCubic(u));
      this.car.position.copy(this.path[0]);
      this.faceAlong(0);
      root.position.copy(this.path[0]).add(new THREE.Vector3(0, SEAT + Math.sin(u * Math.PI) * 1.2, 0));
    } else if (f < 0.85) {
      // Course le long de la terrasse (accélère puis freine), roues qui tournent, poussière.
      const u = easeInOut((f - 0.15) / 0.7);
      const index = u * (this.path.length - 1);
      const a = this.path[Math.floor(index)];
      const b = this.path[Math.min(this.path.length - 1, Math.floor(index) + 1)];
      this.car.scale.setScalar(1);
      this.car.position.lerpVectors(a, b, index - Math.floor(index));
      this.car.position.y += Math.abs(Math.sin(this.t * 22)) * 0.06;
      this.faceAlong(Math.floor(index));
      for (const wheel of this.wheels) wheel.rotation.y += dt * 30;
      root.position.copy(this.car.position).add(new THREE.Vector3(0, SEAT, 0));
    } else {
      // Dépose devant le passage ; la voiture repart et disparaît.
      const u = (f - 0.85) / 0.15;
      root.position.lerpVectors(this.car.position.clone().add(new THREE.Vector3(0, SEAT, 0)), this.drop, u);
      root.position.y += Math.sin(u * Math.PI) * 0.8;
      this.car.scale.setScalar(Math.max(0.01, 1 - u));
    }
    character.faceTowards(this.drop.x - root.position.x || 0.001, this.drop.z - root.position.z);
    character.animate(dt, 0, 0, 0, true);
    this.trail.update(dt, this.car.position, f >= 0.15 && f < 0.85, this.ctx.view);
    if (this.t >= this.ctx.duration) {
      this.finish();
      return true;
    }
    return false;
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    const { character, scene, tweens, camera } = this.ctx;
    character.root.position.copy(this.drop);
    burst(scene, tweens, this.car.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffffff, 8, 2.5, 1);
    this.car.removeFromParent();
    this.trail.dispose();
    this.car.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    if (camera) camera.closeUp = 0;
  }

  /** Oriente la voiture vers le point suivant du chemin. */
  private faceAlong(index: number): void {
    const a = this.path[index];
    const b = this.path[Math.min(this.path.length - 1, index + 1)];
    if (a.distanceToSquared(b) > 1e-6) this.car.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }
}

/** Petite voiture cartoon : caisse rouge arrondie, habitacle, phares lumineux, quatre roues (avant = +z). */
function buildCar(wheels: THREE.Mesh[]): THREE.Group {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe23a2a, roughness: 0.35, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xffd84a, roughness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1a1a, roughness: 0.8 });
  const lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, 1.2) });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 12), paint);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.15, 1, 0.7);
  body.position.y = 0.42;
  body.castShadow = true;
  car.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 1.5), trim);
  stripe.position.y = 0.72;
  car.add(stripe);
  for (const x of [-0.22, 0.22]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lights);
    light.position.set(x, 0.48, 0.86);
    car.add(light);
  }
  for (const [x, z] of [[-0.5, 0.45], [0.5, 0.45], [-0.5, -0.45], [0.5, -0.45]]) {
    // Pivot couché sur le côté ; la roue tourne autour de son propre axe (y local).
    const pivot = new THREE.Group();
    pivot.rotation.z = Math.PI / 2;
    pivot.position.set(x, 0.22, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), rubber);
    wheel.castShadow = true;
    pivot.add(wheel);
    wheels.push(wheel);
    car.add(pivot);
  }
  return car;
}
