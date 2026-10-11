import type { Box, Vec3 } from '../core';

export const BODY_RADIUS = 0.35;
export const BODY_HEIGHT = 1.5;
const EPS = 1e-4;

const SPEED = 6.2;
const GROUND_ACCEL = 60;
const AIR_ACCEL = 25;
const GRAVITY = 32;
const FALL_GRAVITY_FACTOR = 1.35;
const JUMP_SPEED = 11;
const MAX_FALL_SPEED = 28;
/** Tolérances qui rendent le saut agréable au tactile. */
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.15;

export interface MoveIntent {
  /** Direction horizontale souhaitée dans le monde, de norme <= 1. */
  x: number;
  z: number;
  jumpPressed: boolean;
}

/**
 * Contrôleur de personnage cinématique contre des boîtes alignées sur les axes.
 * Le monde n'étant fait que de blocs, cela suffit et reste déterministe.
 */
export class CharacterBody {
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  grounded = false;
  /** Vient de toucher le sol à ce pas (avec la vitesse d'impact). */
  landedSpeed = 0;
  jumped = false;
  private coyote = 0;
  private jumpBuffer = 0;

  constructor(
    private readonly boxes: Box[],
    start: Vec3,
  ) {
    this.pos = { ...start };
  }

  teleport(p: Vec3): void {
    this.pos = { ...p };
    this.vel = { x: 0, y: 0, z: 0 };
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  step(dt: number, intent: MoveIntent): void {
    this.landedSpeed = 0;
    this.jumped = false;

    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    this.vel.x = approach(this.vel.x, intent.x * SPEED, accel * dt);
    this.vel.z = approach(this.vel.z, intent.z * SPEED, accel * dt);

    this.coyote = this.grounded ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = intent.jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.jumped = true;
    }

    const g = this.vel.y < 0 ? GRAVITY * FALL_GRAVITY_FACTOR : GRAVITY;
    this.vel.y = Math.max(-MAX_FALL_SPEED, this.vel.y - g * dt);

    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    const vy = this.vel.y;
    const hitY = this.moveAxis('y', vy * dt);
    const wasGrounded = this.grounded;
    this.grounded = hitY && vy < 0;
    if (hitY) this.vel.y = 0;
    if (this.grounded && !wasGrounded) this.landedSpeed = -vy;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', d: number): boolean {
    if (d === 0) return false;
    this.pos[axis] += d;
    let hit = false;
    const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    for (const box of this.boxes) {
      if (box.off || !this.overlaps(box)) continue;
      hit = true;
      if (axis === 'y') {
        this.pos.y = d > 0 ? box.min[1] - BODY_HEIGHT - EPS : box.max[1] + EPS;
      } else {
        this.pos[axis] = d > 0 ? box.min[i] - BODY_RADIUS - EPS : box.max[i] + BODY_RADIUS + EPS;
      }
    }
    return hit;
  }

  private overlaps(box: Box): boolean {
    const p = this.pos;
    return (
      p.x + BODY_RADIUS > box.min[0] &&
      p.x - BODY_RADIUS < box.max[0] &&
      p.y + BODY_HEIGHT > box.min[1] &&
      p.y < box.max[1] &&
      p.z + BODY_RADIUS > box.min[2] &&
      p.z - BODY_RADIUS < box.max[2]
    );
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  return value < target ? Math.min(target, value + maxDelta) : Math.max(target, value - maxDelta);
}
