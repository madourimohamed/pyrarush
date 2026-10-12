import * as THREE from 'three';
import { doorFront, doorTangent, landingPoint, sideFrame, type Door, type PyramidConfig, type Vec3 } from '../../core';
import type { SfxName } from '../audio/sfx';
import type { FollowCamera } from '../camera';
import type { Character } from './character';
import { burst, easeOutCubic, type Tweens } from './fx';
import { comicMaterial, popComic, type Mummy, type TrapGuardian } from './guardians';

/**
 * Scènes de piège cartoon (gant de boxe, momie) : animations entièrement scénarisées, sans physique.
 * Les règles (étage perdu, bouclier) sont déjà appliquées par le moteur et le serveur : la scène ne fait que montrer.
 *
 * Une scène est une chronologie en fractions de sa durée (3 s en solo, 2 s en multijoueur : mêmes temps forts).
 * Elle est jouée par le joueur touché (avec gros plan de caméra et sons) et rejouée à l'identique par les autres
 * joueurs sur son personnage (sans toucher à leur caméra). `finish()` amène toujours à l'état final
 * (personnage posé à l'arrivée, effets retirés, caméra rendue) : fin normale, fin de partie ou déconnexion.
 */
/** Cinématique (scène de piège, trajet en voiture…) : le joueur n'a pas la main, l'état final est garanti. */
export interface Cutscene {
  /** Avance la scène ; renvoie true quand elle est terminée. */
  update(dt: number): boolean;
  /** Termine la scène immédiatement dans son état final (sans danger si déjà terminée). */
  finish(): void;
}

export const TRAP_SCENE_SOLO_S = 3;

export interface TrapSceneContext {
  scene: THREE.Scene;
  tweens: Tweens;
  character: Character;
  guardian: TrapGuardian;
  /** Position et orientation de la porte (z local = vers l'extérieur). */
  door: THREE.Object3D;
  shakeDoor(): void;
  openDoor(): void;
  start: THREE.Vector3;
  target: Vec3;
  /** Gros piège (plusieurs étages perdus) : vol plus haut. */
  big: boolean;
  /** Durée totale (s). */
  duration: number;
  /** Joueur touché seulement : sa caméra (gros plan, secousses), les sons et la vibration. */
  camera?: FollowCamera;
  sound?(name: SfxName): void;
  vibrate?(pattern: number | number[]): void;
}

/** Point d'arrivée d'un joueur piégé : devant une porte de l'étage d'arrivée, ou repoussé en arrière s'il n'a pas changé d'étage. */
export function trapLanding(config: PyramidConfig, door: Door, from: number, to: number): Vec3 {
  if (to < from) return landingPoint(config, to, door.side, doorTangent(config, door.floor, door.slot));
  const c = doorFront(config, door);
  const f = sideFrame(door.side);
  return { x: c.x + f.outX * 4, y: c.y, z: c.z + f.outZ * 4 };
}

export function createTrapScene(ctx: TrapSceneContext): Cutscene {
  return ctx.guardian.style === 'mummy' ? new MummyScene(ctx) : new GloveScene(ctx);
}

const lerp = THREE.MathUtils.lerp;
const easeIn = (t: number) => t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Avancement (0 → 1) de `f` dans l'intervalle [a, b]. */
const span = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));

/** Base commune : horloge, temps forts déclenchés une seule fois, état final garanti. */
abstract class BaseScene implements Cutscene {
  protected t = 0;
  private fired = new Set<string>();
  private done = false;
  protected readonly target: THREE.Vector3;

  constructor(protected readonly ctx: TrapSceneContext) {
    this.target = new THREE.Vector3(ctx.target.x, ctx.target.y, ctx.target.z);
    ctx.character.panic = false;
    if (ctx.camera) ctx.camera.closeUp = 1;
  }

  protected get f(): number {
    return this.t / this.ctx.duration;
  }

  /** Exécute `action` une seule fois, dès que la scène atteint la fraction `at`. */
  protected once(key: string, at: number, action: () => void): void {
    if (this.f >= at && !this.fired.has(key)) {
      this.fired.add(key);
      action();
    }
  }

  protected play(name: SfxName): void {
    this.ctx.sound?.(name);
  }

  update(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    this.step(dt);
    if (this.t >= this.ctx.duration) {
      this.finish();
      return true;
    }
    return false;
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    const { character, camera } = this.ctx;
    character.panic = false;
    character.wrap(false);
    character.root.visible = true;
    character.root.scale.setScalar(1);
    character.root.position.copy(this.target);
    character.body.rotation.set(0, 0, 0);
    this.cleanup();
    if (camera) camera.closeUp = 0;
  }

  /** Atterrissage comique : écrasement, poussière, étoiles, « boing ». */
  protected land(): void {
    const { character, scene, tweens, camera } = this.ctx;
    character.root.position.copy(this.target);
    character.body.rotation.set(0, 0, 0);
    character.panic = false;
    character.land(18);
    character.daze(this.ctx.duration * 0.3 + 0.6);
    burst(scene, tweens, this.target.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xd9b77a, 16, 3.5, 1.2);
    camera?.shake(0.35);
    this.ctx.vibrate?.(80);
    this.play('land');
    this.play('boing');
  }

  protected abstract step(dt: number): void;
  protected cleanup(): void {}
}

/**
 * Gant de boxe : le ressort se détend (« POW ! »), le joueur est propulsé très haut en vrille, bras qui moulinent,
 * reste suspendu un instant (« AAAH ! »), retombe à l'arrivée dans un nuage de poussière, étoiles autour de la tête.
 */
class GloveScene extends BaseScene {
  private readonly apex: THREE.Vector3;
  private scream: THREE.Sprite | null = null;

  constructor(ctx: TrapSceneContext) {
    super(ctx);
    const top = Math.max(ctx.start.y, ctx.target.y) + (ctx.big ? 10 : 8);
    this.apex = ctx.start.clone().lerp(this.target, 0.5).setY(top);
  }

  protected step(dt: number): void {
    const { character, tweens, guardian, door, camera } = this.ctx;
    const root = character.root;
    const f = this.f;
    this.once('strike', 0, () => {
      this.play(guardian.cue);
      guardian.strike(tweens, door, this.ctx.big, () => {
        this.play('pow');
        camera?.shake(0.4);
        this.ctx.vibrate?.(this.ctx.big ? [80, 40, 120] : 90);
      });
    });
    this.once('launch', 0.1, () => {
      character.panic = true;
      this.play('fall');
    });
    this.once('scream', 0.38, () => {
      this.scream = new THREE.Sprite(comicMaterial('AAAH!', '#ffffff', '#3a6ad0', '#13264a'));
      this.scream.renderOrder = 10;
      this.scream.position.set(0.6, 2.3, 0);
      this.scream.scale.setScalar(1.3);
      root.add(this.scream);
    });
    this.once('fall', 0.57, () => this.removeScream());
    this.once('land', 0.8, () => this.land());

    const start = this.ctx.start;
    if (f < 0.1) {
      // Le gant frappe : petit recul.
      root.position.copy(start);
    } else if (f < 0.4) {
      const u = span(f, 0.1, 0.4);
      root.position.set(lerp(start.x, this.apex.x, u), lerp(start.y, this.apex.y, easeOutCubic(u)), lerp(start.z, this.apex.z, u));
      character.body.rotation.x = -u * Math.PI * 2;
      character.body.rotation.y += dt * 14;
    } else if (f < 0.57) {
      // Suspendu en l'air, au ralenti.
      const u = span(f, 0.4, 0.57);
      root.position.copy(this.apex).add(new THREE.Vector3(0, Math.sin(u * Math.PI) * 0.4, 0));
      character.body.rotation.x = 0;
      character.body.rotation.y += dt * 4;
    } else if (f < 0.8) {
      const u = span(f, 0.57, 0.8);
      root.position.set(lerp(this.apex.x, this.target.x, u), lerp(this.apex.y, this.target.y, easeIn(u)), lerp(this.apex.z, this.target.z, u));
      character.body.rotation.y += dt * 16;
      character.body.rotation.z = Math.sin(u * Math.PI * 4) * 0.4;
    }
    character.animate(dt, 0, 0, f < 0.57 ? 8 : -8, f >= 0.8);
  }

  private removeScream(): void {
    this.scream?.removeFromParent();
    this.scream = null;
  }

  protected cleanup(): void {
    this.removeScream();
  }
}

const BRAWL_WORDS: [string, string, string, string][] = [
  ['BIM!', '#ffd84a', '#c0420a', '#4a1a04'],
  ['POF!', '#c9f26b', '#4a2a6a', '#2a1240'],
  ['BAM!', '#ff8a5a', '#7a1d0a', '#4a0d04'],
  ['PAF!', '#7ad8ff', '#1a4a8a', '#0a2040'],
];

/**
 * Momie : elle surgit, attrape le joueur et le tire dans la porte ; la porte tremble, bruits de bagarre et onomatopées ;
 * elle ressort le joueur emmailloté de bandelettes et l'expédie à l'arrivée, où le cocon éclate.
 */
class MummyScene extends BaseScene {
  private readonly inside: THREE.Vector3;
  private readonly front: THREE.Vector3;
  private readonly out: THREE.Vector3;
  private nextBrawl = 0;
  private brawlIndex = 0;

  constructor(ctx: TrapSceneContext) {
    super(ctx);
    this.out = new THREE.Vector3(0, 0, 1).applyQuaternion(ctx.door.quaternion).setY(0).normalize();
    const feet = ctx.door.position.clone().setY(ctx.start.y);
    this.inside = feet.clone().addScaledVector(this.out, -0.4);
    // Le cocon est tenu bras tendus, devant la momie (elle avance de 1,3 m hors de la porte).
    this.front = feet.clone().addScaledVector(this.out, 2);
  }

  private get mummy(): Mummy {
    return this.ctx.guardian as Mummy;
  }

  protected step(dt: number): void {
    const { character, scene, tweens, door, camera } = this.ctx;
    const root = character.root;
    const D = this.ctx.duration;
    const f = this.f;
    this.once('grab', 0, () => {
      this.play('groan');
      this.mummy.lunge(tweens, door, D * 0.3, 1.1);
    });
    this.once('pulled', 0.08, () => {
      character.panic = true;
      this.play('pow');
      camera?.shake(0.25);
      this.ctx.vibrate?.(60);
    });
    this.once('hidden', 0.17, () => (root.visible = false));
    this.once('release', 0.5, () => {
      this.ctx.openDoor();
      this.mummy.lunge(tweens, door, D * 0.3, 1.3);
      root.visible = true;
      character.panic = false;
      character.wrap(true);
      this.play('groan');
    });
    this.once('throw', 0.63, () => this.play('fall'));
    this.once('land', 0.87, () => {
      character.wrap(false);
      // Le cocon éclate en lambeaux de bandelettes.
      burst(scene, tweens, this.target.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xe6d9b8, 20, 4, 2);
      this.land();
    });

    if (f < 0.08) {
      root.position.copy(this.ctx.start);
    } else if (f < 0.17) {
      // Tiré dans la porte, en rapetissant.
      const u = span(f, 0.08, 0.17);
      root.position.lerpVectors(this.ctx.start, this.inside, easeIn(u));
      root.scale.setScalar(1 - u * 0.35);
    } else if (f < 0.5) {
      // Bagarre derrière la porte : elle tremble, poussière et onomatopées.
      root.position.copy(this.inside);
      if (this.t >= this.nextBrawl) {
        this.nextBrawl = this.t + D * 0.055;
        this.ctx.shakeDoor();
        const [text, fill, edge, ink] = BRAWL_WORDS[this.brawlIndex++ % BRAWL_WORDS.length];
        const at = door.position.clone().addScaledVector(this.out, 0.7).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 1.2, 0));
        popComic(scene, tweens, comicMaterial(text, fill, edge, ink), at, 1.2, D * 0.12);
        if (this.brawlIndex % 2) burst(scene, tweens, door.position.clone().addScaledVector(this.out, 0.5), 0xc9a774, 5, 2, 1);
        this.play(this.brawlIndex % 3 === 0 ? 'wall' : 'pow');
        camera?.shake(0.12);
      }
    } else if (f < 0.63) {
      // Ressort de la porte, emmailloté, tenu par la momie.
      const u = span(f, 0.5, 0.63);
      root.scale.setScalar(1);
      root.position.lerpVectors(this.inside, this.front, easeOutCubic(u));
    } else if (f < 0.87) {
      // Expédié à l'arrivée, le cocon tourne sur lui-même.
      const u = span(f, 0.63, 0.87);
      const top = Math.max(this.front.y, this.target.y) + (this.ctx.big ? 6 : 4);
      root.position.set(lerp(this.front.x, this.target.x, u), lerp(this.front.y, this.target.y, u) + Math.sin(u * Math.PI) * (top - Math.max(this.front.y, this.target.y)), lerp(this.front.z, this.target.z, u));
      character.body.rotation.x = -u * Math.PI * 3;
      character.body.rotation.y += dt * 8;
    }
    character.animate(dt, 0, 0, 0, f >= 0.87);
  }
}
