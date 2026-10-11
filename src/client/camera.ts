import * as THREE from 'three';

const USER_RETURN_DELAY = 1.8;

export type ZoomLevel = 0 | 1 | 2;
export const ZOOM_LABELS = ['Proche', 'Moyen', 'Large'] as const;

/**
 * Niveaux de zoom : proche (le personnage), moyen, large (toute la pyramide).
 * dist : distance en mètres, ou multiple de la demi-largeur de la pyramide pour le plan large.
 * focus : part du cadrage tirée vers le centre de la pyramide plutôt que vers le joueur.
 */
const ZOOMS = [
  { dist: (_half: number) => 12.5, pitch: 0.55, focus: 0 },
  { dist: (half: number) => Math.max(20, half * 1.05), pitch: 0.62, focus: 0.2 },
  { dist: (half: number) => half * 2.5, pitch: 0.78, focus: 0.7 },
];

/**
 * Caméra automatique : toujours à l'extérieur de la pyramide, face à la paroi la plus proche,
 * elle tourne autour quand le joueur longe une terrasse. Le glissement ne sert qu'à ajuster ponctuellement.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  private userYaw = 0;
  private userPitch = 0;
  private sinceUserInput = Infinity;
  private target = new THREE.Vector3();
  private initialized = false;
  /** Niveau de zoom choisi, et valeur lissée (0 → 2) pour des transitions douces. */
  zoom: ZoomLevel = 0;
  zoomSmooth = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 400);
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  /** Lacet total utilisé pour orienter les commandes (avant = vers la pyramide). */
  get viewYaw(): number {
    return this.yaw + this.userYaw;
  }

  addUserInput(dx: number, dy: number, active: boolean): void {
    if (dx || dy || active) this.sinceUserInput = 0;
    this.userYaw -= dx * 0.006;
    this.userPitch = THREE.MathUtils.clamp(this.userPitch + dy * 0.004, -0.3, 0.75);
  }

  update(dt: number, player: THREE.Vector3, pyramidHalf: number, pyramidHeight: number, extraDistance = 0): void {
    // Normale « super-ellipse » : celle de la face la plus proche, avec un virage doux aux coins.
    const nx = Math.sign(player.x) * Math.abs(player.x / pyramidHalf) ** 6;
    const nz = Math.sign(player.z) * Math.abs(player.z / pyramidHalf) ** 6;
    const desiredYaw = nx === 0 && nz === 0 ? this.yaw : Math.atan2(nx, nz);

    if (!this.initialized) this.zoomSmooth = this.zoom;
    this.zoomSmooth += (this.zoom - this.zoomSmooth) * (1 - Math.exp(-5 * dt));
    const z = sampleZoom(this.zoomSmooth, pyramidHalf);

    const desiredTarget = player
      .clone()
      .add(new THREE.Vector3(0, 1.3, 0))
      .lerp(new THREE.Vector3(0, pyramidHeight * 0.4, 0), z.focus);
    if (!this.initialized) {
      this.yaw = desiredYaw;
      this.target.copy(desiredTarget);
      this.initialized = true;
    }
    this.yaw += angleDelta(this.yaw, desiredYaw) * (1 - Math.exp(-3.5 * dt));
    this.target.lerp(desiredTarget, 1 - Math.exp(-10 * dt));

    this.sinceUserInput += dt;
    if (this.sinceUserInput > USER_RETURN_DELAY) {
      const k = 1 - Math.exp(-1.5 * dt);
      this.userYaw += angleDelta(this.userYaw, 0) * k;
      this.userPitch -= this.userPitch * k;
    }

    const portrait = this.camera.aspect < 1;
    const dist = z.dist * (portrait ? 1.3 : 1) + extraDistance;
    const yaw = this.viewYaw;
    const pitch = Math.min(1.35, z.pitch + this.userPitch);
    this.camera.position.set(
      this.target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      this.target.y + Math.sin(pitch) * dist,
      this.target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(this.target);
  }
}

/** Interpole les réglages entre deux niveaux de zoom. */
function sampleZoom(value: number, half: number) {
  const i = Math.min(1, Math.floor(value));
  const t = value - i;
  const a = ZOOMS[i];
  const b = ZOOMS[i + 1];
  return {
    dist: THREE.MathUtils.lerp(a.dist(half), b.dist(half), t),
    pitch: THREE.MathUtils.lerp(a.pitch, b.pitch, t),
    focus: THREE.MathUtils.lerp(a.focus, b.focus, t),
  };
}

/** Plan large qui tourne lentement autour de la pyramide (écran d'accueil). */
export function orbitCamera(camera: THREE.PerspectiveCamera, time: number, radius: number, height: number, lookY: number): void {
  const a = time * 0.08 + 0.6;
  camera.position.set(Math.sin(a) * radius, height, Math.cos(a) * radius);
  camera.lookAt(0, lookY, 0);
}

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
