/** Instantané des commandes pour une image, quelle que soit la source (clavier, tactile, et plus tard un robot). */
export interface InputFrame {
  /** Joystick / touches : x = droite, y = avant, dans [-1, 1]. */
  moveX: number;
  moveY: number;
  jump: boolean;
  interact: boolean;
  /** Rotation manuelle de la caméra (pixels depuis la dernière image). */
  camDX: number;
  camDY: number;
  camActive: boolean;
}

const KEYS_FORWARD = ['KeyW', 'ArrowUp'];
const KEYS_BACK = ['KeyS', 'ArrowDown'];
const KEYS_LEFT = ['KeyA', 'ArrowLeft'];
const KEYS_RIGHT = ['KeyD', 'ArrowRight'];
const KEYS_JUMP = ['Space'];
const KEYS_INTERACT = ['KeyE', 'Enter'];

const JOY_RADIUS = 56;

/**
 * Regroupe clavier, souris et tactile. `event.code` désigne la position physique de la touche :
 * ZQSD (AZERTY) et WASD (QWERTY) fonctionnent donc sans configuration.
 */
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private interactQueued = false;
  private camDX = 0;
  private camDY = 0;
  private camPointer: number | null = null;
  private camLast = { x: 0, y: 0 };
  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joy = { x: 0, y: 0 };
  enabled = true;

  constructor(
    private readonly surface: HTMLElement,
    private readonly joyBase: HTMLElement,
    private readonly joyKnob: HTMLElement,
    jumpButton: HTMLElement,
    interactButton: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (KEYS_JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEYS_JUMP.includes(e.code)) this.jumpQueued = true;
      if (KEYS_INTERACT.includes(e.code)) this.interactQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    surface.addEventListener('pointerdown', (e) => this.onDown(e));
    surface.addEventListener('pointermove', (e) => this.onMove(e));
    surface.addEventListener('pointerup', (e) => this.onUp(e));
    surface.addEventListener('pointercancel', (e) => this.onUp(e));

    bindButton(jumpButton, () => (this.jumpQueued = true));
    bindButton(interactButton, () => (this.interactQueued = true));
  }

  consume(): InputFrame {
    const kx = (this.has(KEYS_RIGHT) ? 1 : 0) - (this.has(KEYS_LEFT) ? 1 : 0);
    const ky = (this.has(KEYS_FORWARD) ? 1 : 0) - (this.has(KEYS_BACK) ? 1 : 0);
    let moveX = kx + this.joy.x;
    let moveY = ky + this.joy.y;
    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    const frame: InputFrame = {
      moveX,
      moveY,
      jump: this.jumpQueued,
      interact: this.interactQueued,
      camDX: this.camDX,
      camDY: this.camDY,
      camActive: this.camPointer !== null,
    };
    this.jumpQueued = false;
    this.interactQueued = false;
    this.camDX = 0;
    this.camDY = 0;
    return frame;
  }

  reset(): void {
    this.keys.clear();
    this.jumpQueued = this.interactQueued = false;
    this.camPointer = null;
    this.endJoystick();
  }

  private has(codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    const isTouch = e.pointerType !== 'mouse';
    if (isTouch && this.joyPointer === null && e.clientX < window.innerWidth * 0.45) {
      this.joyPointer = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.classList.add('active');
      this.updateKnob(0, 0);
    } else if (this.camPointer === null) {
      this.camPointer = e.pointerId;
      this.camLast = { x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    this.surface.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.joy = { x: dx / JOY_RADIUS, y: -dy / JOY_RADIUS };
      this.updateKnob(dx, dy);
    } else if (e.pointerId === this.camPointer) {
      this.camDX += e.clientX - this.camLast.x;
      this.camDY += e.clientY - this.camLast.y;
      this.camLast = { x: e.clientX, y: e.clientY };
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) this.endJoystick();
    if (e.pointerId === this.camPointer) this.camPointer = null;
  }

  private endJoystick(): void {
    this.joyPointer = null;
    this.joy = { x: 0, y: 0 };
    this.joyBase.classList.remove('active');
  }

  private updateKnob(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

function bindButton(el: HTMLElement, onPress: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('pressed');
    onPress();
  });
  const release = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
}
