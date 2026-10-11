import * as THREE from 'three';
import type { Vec3Tuple } from '../../net/protocol';
import { Character } from '../scene/character';
import { shieldBubble, Trail } from '../scene/fx';

/** Écharpe de l'adversaire (le joueur local garde la bleue). */
export const RIVAL_COLOR = 0xd8402e;
const RIVAL_TRAIL = 0xff8a6a;

/**
 * L'adversaire d'un duel : un explorateur d'une autre couleur, avec son nom au-dessus de la tête.
 * Les positions reçues (~15 par seconde) sont lissées ; l'animation de course est déduite du mouvement.
 */
export class Rival {
  readonly character = new Character(RIVAL_COLOR);
  private readonly target = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private heading = 0;
  private seen = false;
  private readonly bubble = shieldBubble();
  private readonly trail: Trail;
  /** Turbo et immunité restants (s), d'après le serveur. */
  private turbo = 0;
  private immune = 0;
  private time = 0;

  constructor(name: string, scene: THREE.Scene) {
    this.trail = new Trail(scene, RIVAL_TRAIL);
    this.character.root.add(this.bubble);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name), transparent: true, depthTest: false }));
    label.renderOrder = 9;
    label.scale.set(2.4, 0.6, 1);
    label.position.y = 2.35;
    this.character.root.add(label);
    this.character.root.visible = false;
  }

  moveTo(p: Vec3Tuple, ry: number): void {
    this.target.set(p[0], p[1], p[2]);
    this.heading = ry;
    if (!this.seen) {
      this.seen = true;
      this.character.root.position.copy(this.target);
      this.character.root.visible = true;
    }
  }

  /** Ce qu'on voit de l'adversaire : bouclier, turbo, immunité (durées en ms). */
  setState(shield: boolean, turboMs: number, immuneMs: number): void {
    this.bubble.visible = shield;
    this.turbo = turboMs / 1000;
    this.immune = immuneMs / 1000;
  }

  update(dt: number, zoom: number, camera: THREE.Camera): void {
    this.turbo = Math.max(0, this.turbo - dt);
    this.immune = Math.max(0, this.immune - dt);
    this.time += dt;
    this.trail.update(dt, this.character.root.position, this.seen && this.turbo > 0, camera);
    if (!this.seen) return;
    this.character.body.visible = this.immune <= 0 || this.time % 0.2 < 0.12;
    if (this.bubble.visible) this.bubble.scale.setScalar(1 + Math.sin(this.time * 5.5) * 0.04);
    const root = this.character.root;
    const before = root.position.clone();
    // Téléportation (piège, passage) : on saute directement à la nouvelle position.
    if (root.position.distanceTo(this.target) > 6) root.position.copy(this.target);
    else root.position.lerp(this.target, 1 - Math.exp(-12 * dt));
    this.velocity.copy(root.position).sub(before).divideScalar(Math.max(dt, 1e-3));
    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.5;
    if (!moving) this.character.faceTowards(Math.sin(this.heading), Math.cos(this.heading));
    this.character.animate(dt, this.velocity.x, this.velocity.z, this.velocity.y, Math.abs(this.velocity.y) < 1.5);
    this.character.setMarker(zoom);
  }
}

function nameTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 30px "Fredoka Variable", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(248, ctx.measureText(name).width + 28);
  ctx.fillStyle = 'rgba(30, 14, 8, 0.7)';
  ctx.beginPath();
  ctx.roundRect(128 - width / 2, 10, width, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#ffb8a8';
  ctx.fillText(name, 128, 33);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
