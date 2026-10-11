import * as THREE from 'three';
import {
  Game,
  doorCenter,
  doorFront,
  doorTangent,
  floorAtY,
  landingPoint,
  sideFrame,
  terraceDistance,
  spawnPoint,
  summitFloor,
  INTERACT_RANGE,
  FLOOR_HEIGHT,
  type Door,
  type GameEvent,
  type PyramidConfig,
  type Theme,
  type Vec3,
} from '../core';
import type { SfxName } from './audio/sfx';
import { FollowCamera, menuCamera, type ZoomLevel } from './camera';
import type { Input } from './input/input';
import { CharacterBody } from './physics';
import { Character } from './scene/character';
import { burst, easeInOut, Tweens } from './scene/fx';
import { releaseScarab } from './scene/props';
import { HINT_COLORS, World } from './scene/world';
import type { Hud, ToastKind } from './ui/hud';

export const PLAYER_ID = 'local';

/** Sortie sonore minimale dont la session a besoin (permet de jouer sans son, ex. dans les tests). */
export interface SoundPlayer {
  play(name: SfxName): void;
}
const TRAP_FX = new Set(['smallTrap', 'bigTrap', 'riskyLose']);
const STEP = 1 / 60;

export interface SessionResult {
  config: PyramidConfig;
  seed: number;
  time: number;
  falls: number;
  doorsTested: number;
}

/** Titre et sous-titre du message affiché après l'ouverture d'une porte. */
function toastText(e: Extract<GameEvent, { type: 'doorResult' }>, scarabWords?: string): [string, string] {
  const change = e.to - e.from;
  const floors = (n: number) => `${n} étage${Math.abs(n) > 1 ? 's' : ''}`;
  const delta = change > 0 ? `+${floors(change)}` : change < 0 ? `−${floors(-change)}` : '';
  if (e.fx === 'passage') return ['Passage trouvé !', delta];
  if (e.hint?.type === 'hotCold') return ['Mur', { chaud: 'Chaud !', tiede: 'Tiède…', froid: 'Froid.' }[e.hint.level]];
  if (e.hint?.type === 'scarab') return ['Mur', scarabWords ?? 'Suis le scarabée !'];
  if (e.fx === 'wall') return ['Mur', 'Rien ici…'];
  return [e.message, delta || 'Bing ! Tu recules…'];
}

/** Une partie en cours côté navigateur : relie le moteur de règles, la physique, le rendu et les commandes. */
export class GameSession {
  readonly game: Game;
  readonly world: World;
  readonly camera: FollowCamera;
  private readonly tweens = new Tweens();
  private readonly body: CharacterBody;
  private readonly character = new Character();
  private clock = 0;
  private accumulator = 0;
  private locked = false;
  private finished = false;
  private nearestDoor: Door | null = null;
  private extraCamDistance = 0;
  paused = false;
  /** Écran d'accueil : la caméra tourne autour de la pyramide, le jeu ne démarre pas. */
  attract = false;
  /** Introduction du niveau (s restantes) : vue large, puis zoom vers la vue de jeu ; chronomètre arrêté. */
  private intro = 0;
  private introZoom: ZoomLevel = 1;
  /** Temps passé à marcher (s), pour le tutoriel de déplacement. */
  movedTime = 0;
  onIntroEnd?: () => void;
  private attractTime = 0;

  constructor(
    config: PyramidConfig,
    theme: Theme,
    readonly seed: number,
    private readonly input: Input,
    private readonly hud: Hud,
    lowQuality: boolean,
    aspect: number,
    private readonly onVictory: (result: SessionResult) => void,
    private readonly sound: SoundPlayer = { play: () => {} },
  ) {
    this.game = new Game(config, seed);
    this.game.addPlayer(PLAYER_ID);
    this.world = new World(this.game.layout, theme, this.tweens, lowQuality);
    this.camera = new FollowCamera(aspect);
    this.body = new CharacterBody(this.world.colliders, spawnPoint(config));
    this.world.scene.add(this.character.root);
    this.character.faceTowards(0, -1);
    this.syncCharacter();

    hud.setup(config.floors);
    hud.setFloor(1, 1);
    hud.setTime(0);
    hud.setPrompt(false);
    hud.showToast(config.name, 'info', 2.5, 'Trouve les passages secrets !');
  }

  private get player() {
    return this.game.players.get(PLAYER_ID)!;
  }

  private get config() {
    return this.game.config;
  }

  frame(dt: number): void {
    if (this.attract) {
      dt = Math.min(dt, 0.1);
      this.attractTime += dt;
      this.input.consume();
      this.tweens.update(dt);
      this.world.update(dt);
      const height = this.config.floors * FLOOR_HEIGHT;
      menuCamera(this.camera.camera, this.attractTime, this.world.groundHalf, height);
      return;
    }
    if (this.paused) {
      this.input.consume();
      return;
    }
    dt = Math.min(dt, 0.1);
    const frame = this.input.consume();
    if (this.intro > 0) {
      this.playIntro(dt, frame.jump || frame.interact || Math.hypot(frame.moveX, frame.moveY) > 0.3);
      return;
    }
    this.camera.addUserInput(frame.camDX, frame.camDY, frame.camActive);

    if (!this.finished) this.clock += dt * 1000;
    this.hud.setTime(this.finished ? (this.player.finishedAt ?? this.clock) : this.clock);

    if (!this.locked) {
      // Les commandes sont relatives à la caméra : « avant » = vers la pyramide.
      const yaw = this.camera.viewYaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const intent = {
        x: fx * frame.moveY + Math.cos(yaw) * frame.moveX,
        z: fz * frame.moveY - Math.sin(yaw) * frame.moveX,
        jumpPressed: frame.jump,
      };
      if (Math.hypot(frame.moveX, frame.moveY) > 0.3) this.movedTime += dt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.body.step(STEP, intent);
        if (this.body.landedSpeed > 4) this.character.land(this.body.landedSpeed);
        if (this.body.jumped) this.sound.play('jump');
        if (this.body.landedSpeed > 9) this.sound.play('land');
        intent.jumpPressed = false;
        this.accumulator -= STEP;
        steps++;
      }
      if (this.body.pos.y < -10) this.body.teleport(spawnPoint(this.config));

      if (this.body.grounded && !this.finished) {
        this.handle(this.game.reportFloor(PLAYER_ID, floorAtY(this.config, this.body.pos.y), this.clock));
      }
      this.updateNearestDoor();
      if (frame.interact && this.nearestDoor && this.body.grounded) {
        const door = this.nearestDoor;
        this.handle(this.game.interact(PLAYER_ID, door.id, this.clock, this.body.pos));
      }
    }

    this.handle(this.game.update(this.clock));
    this.tweens.update(dt);
    this.world.update(dt);
    this.syncCharacter();
    if (!this.locked) {
      this.character.animate(dt, this.body.vel.x, this.body.vel.z, this.body.vel.y, this.body.grounded);
    }
    this.extraCamDistance += ((this.finished ? 5 : 0) - this.extraCamDistance) * (1 - Math.exp(-2 * dt));
    this.camera.update(
      dt,
      this.character.root.position,
      this.world.pyramidHalf,
      this.config.floors * FLOOR_HEIGHT,
      this.extraCamDistance,
    );
    // De loin, une flèche au-dessus du personnage aide à le repérer.
    this.character.setMarker(this.camera.zoomSmooth);
  }

  private syncCharacter(): void {
    if (this.locked) return;
    const p = this.body.pos;
    this.character.root.position.set(p.x, p.y, p.z);
  }

  private updateNearestDoor(): void {
    let best: Door | null = null;
    if (this.body.grounded && !this.finished) {
      let bestDist = INTERACT_RANGE;
      const floor = this.player.floor;
      for (const door of this.game.layout.doorsByFloor[floor] ?? []) {
        const f = doorFront(this.config, door);
        const d = Math.hypot(f.x - this.body.pos.x, f.z - this.body.pos.z);
        if (d < bestDist && Math.abs(f.y - this.body.pos.y) < 0.5) {
          bestDist = d;
          best = door;
        }
      }
    }
    if (best !== this.nearestDoor) {
      this.nearestDoor = best;
      this.world.setHighlight(best?.id ?? null);
      this.hud.setPrompt(best !== null);
    }
  }

  private handle(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'doorResult':
          this.onDoorResult(event);
          break;
        case 'publicReveal':
          this.world.setReveal(event.doorId, true);
          break;
        case 'revealEnd':
          this.world.setReveal(event.doorId, false);
          break;
        case 'floorChanged':
          this.hud.setFloor(event.to, this.player.bestFloor);
          this.world.setPrivateHints(this.player.knownPassages, event.to);
          if (event.cause === 'fall') {
            this.hud.showToast('Chute !', 'bad', 1.8, `Retour à l'étage ${event.to}`);
            navigator.vibrate?.(60);
            this.sound.play('fall');
          }
          break;
        case 'victory':
          this.finished = true;
          break;
      }
    }
  }

  private onDoorResult(e: Extract<GameEvent, { type: 'doorResult' }>): void {
    const door = this.game.doorsById.get(e.doorId)!;
    const kind: ToastKind =
      e.to > e.from ? 'good' : e.to < e.from ? 'bad' : e.hint?.type === 'hotCold' ? e.hint.level : e.hint ? 'scarab' : 'info';
    const scarab = e.hint?.type === 'scarab' ? this.scarabCourse(door, e.hint) : null;
    const [title, sub] = toastText(e, scarab?.words);
    const tried = this.player.tried.get(door.id);
    if (tried) this.world.doors.markTried(door.id, tried);
    this.hud.showToast(title, TRAP_FX.has(e.fx) ? 'bad' : kind, 1.8, sub);
    this.hud.setPrompt(false);
    this.nearestDoor = null;
    this.world.setHighlight(null);

    if (e.to === e.from && TRAP_FX.has(e.fx)) {
      // Déjà tout en bas : le gant frappe quand même et repousse le joueur en arrière (perte de temps).
      const c = doorFront(this.config, door);
      const f = sideFrame(door.side);
      const target = { x: c.x + f.outX * 4, y: c.y, z: c.z + f.outZ * 4 };
      this.punch(door, target, false);
      return;
    }
    if (e.to === e.from) {
      this.world.shakeDoor(door.id);
      this.character.react('bump');
      this.sound.play('wall');
      if (e.hint?.type === 'hotCold') this.world.flashDoor(door.id, HINT_COLORS[e.hint.level]);
      else this.world.flashDoor(door.id, 0x555555, 0.5);
      if (e.hint?.type === 'scarab' && scarab) {
        const tangent = doorTangent(this.config, door.floor, door.slot);
        releaseScarab(this.world.scene, this.tweens, this.config, door.floor, door.side, tangent, e.hint.dir, scarab.near, scarab.run);
        this.sound.play(scarab.near ? 'scarabExcited' : 'scarab');
      }
      return;
    }

    const target = landingPoint(this.config, e.to, door.side, doorTangent(this.config, door.floor, door.slot));
    switch (e.fx) {
      case 'passage':
        this.sound.play('door');
        this.sound.play('passage');
        this.world.openDoor(door.id);
        this.playPassage(door, target, e.to);
        break;
      case 'teleportUp':
      case 'teleportDown':
      case 'riskyWin': {
        const color = e.fx === 'riskyWin' ? 0xffc23a : e.fx === 'teleportUp' ? 0xb04dff : 0x5a1a8a;
        this.world.flashDoor(door.id, color, 1);
        this.sound.play(e.fx === 'riskyWin' ? 'riskyWin' : 'teleport');
        this.playTeleport(target, e.to, color);
        break;
      }
      default:
        // Pièges et pari perdu : un gant de boxe jaillit et envoie le joueur en contrebas.
        if (e.fx === 'riskyLose') this.sound.play('riskyLose');
        this.punch(door, target, e.from - e.to > 1);
    }
  }

  /**
   * Course du scarabée : il parcourt environ 60 % du chemin jusqu'au passage le plus proche (entre 2,5 et 16 m),
   * ce qui donne la direction et la distance sans désigner la porte. Deux murs testés suffisent à trianguler.
   */
  private scarabCourse(door: Door, hint: { dir: 1 | -1; target: string }): { run: number; near: boolean; words: string } {
    const target = this.game.doorsById.get(hint.target)!;
    const path = terraceDistance(
      this.config,
      door.floor,
      { side: door.side, tangent: doorTangent(this.config, door.floor, door.slot) },
      { side: target.side, tangent: doorTangent(this.config, target.floor, target.slot) },
      hint.dir,
    );
    const near = path <= 8;
    const words = near ? 'Le scarabée s’agite : tout près !' : path <= 18 ? 'Pas très loin… suis le scarabée' : 'Loin d’ici… suis le scarabée';
    return { run: Math.max(2.5, Math.min(16, path * 0.6)), near, words };
  }

  private punch(door: Door, target: Vec3, big: boolean): void {
    this.lock();
    this.world.flashDoor(door.id, 0xff2a1a, 0.6);
    this.sound.play('spring');
    this.world.punchDoor(door.id, big, () => {
      navigator.vibrate?.(big ? [80, 40, 120] : 90);
      this.sound.play('pow');
      this.sound.play('fall');
      this.playKnockback(target, big);
    });
  }

  /** Le personnage entre dans la porte et ressort sur la terrasse supérieure. */
  private playPassage(door: Door, target: Vec3, to: number): void {
    this.lock();
    const root = this.character.root;
    const start = root.position.clone();
    const c = doorCenter(this.config, door);
    const inside = new THREE.Vector3(c.x, start.y, c.z);
    this.character.faceTowards(c.x - start.x, c.z - start.z);
    this.character.body.rotation.set(0, 0, 0);
    this.tweens.add(
      0.35,
      (t) => {
        root.position.lerpVectors(start, inside, easeInOut(t));
        root.scale.setScalar(1 - t * 0.6);
      },
      () => {
        root.position.set(target.x, target.y, target.z);
        this.character.faceTowards(-target.x, -target.z);
        this.character.root.rotation.y = Math.atan2(-target.x, -target.z);
        burst(this.world.scene, this.tweens, root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x3ce0ff, 12);
        this.tweens.add(
          0.25,
          (t) => root.scale.setScalar(0.4 + 0.6 * t + Math.sin(t * Math.PI) * 0.25),
          () => this.unlock(target, to),
        );
      },
    );
  }

  private playTeleport(target: Vec3, to: number, color: number): void {
    this.lock();
    const root = this.character.root;
    this.tweens.add(
      0.4,
      (t) => {
        root.scale.setScalar(1 - t);
        root.rotation.y += 0.5;
      },
      () => {
        root.position.set(target.x, target.y, target.z);
        burst(this.world.scene, this.tweens, root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), color, 16, 3.5, 2);
        this.tweens.add(
          0.3,
          (t) => root.scale.setScalar(t),
          () => this.unlock(target, to),
        );
      },
    );
  }

  /** Éjection en arc vers une terrasse inférieure, en roulé-boulé. */
  private playKnockback(target: Vec3, big: boolean): void {
    this.lock();
    const root = this.character.root;
    const start = root.position.clone();
    const end = new THREE.Vector3(target.x, target.y, target.z);
    const peak = Math.max(start.y, end.y) + (big ? 3.5 : 2);
    const duration = big ? 1.15 : 0.75;
    this.tweens.add(
      duration,
      (t) => {
        root.position.x = start.x + (end.x - start.x) * t;
        root.position.z = start.z + (end.z - start.z) * t;
        const a = 1 - t;
        root.position.y = a * a * start.y + 2 * a * t * peak + t * t * end.y;
        this.character.body.rotation.x = -t * Math.PI * (big ? 4 : 2);
      },
      () => {
        this.character.body.rotation.set(0, 0, 0);
        this.character.land(14);
        burst(this.world.scene, this.tweens, end.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xd9b77a, 10, 3, 1);
        this.unlock(target, this.player.floor);
      },
    );
  }

  private lock(): void {
    this.locked = true;
    this.body.vel = { x: 0, y: 0, z: 0 };
  }

  private unlock(at: Vec3, floor: number): void {
    this.character.root.scale.setScalar(1);
    this.body.teleport(at);
    this.locked = false;
    this.accumulator = 0;
    if (floor === summitFloor(this.config) && this.player.finishedAt !== undefined) this.celebrate();
  }

  private celebrate(): void {
    this.sound.play('victory');
    const root = this.character.root;
    const colors = [0xff6b5a, 0xffc93c, 0x3ce0ff, 0x7ddc5a, 0xb04dff];
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        burst(this.world.scene, this.tweens, root.position.clone().add(new THREE.Vector3(0, 2.5, 0)), colors[i], 18, 4, 3);
      }, i * 250);
    }
    this.lock();
    const base = root.position.y;
    this.tweens.add(1.6, (t) => {
      root.position.y = base + Math.abs(Math.sin(t * Math.PI * 3)) * 1.2;
      root.rotation.y += 0.15;
    });
    const p = this.player;
    setTimeout(() => {
      this.onVictory({
        config: this.config,
        seed: this.seed,
        time: p.finishedAt ?? this.clock,
        falls: p.falls,
        doorsTested: p.doorsTested,
      });
    }, 1700);
  }

  /**
   * Introduction du niveau : la caméra montre toute la pyramide, puis zoome vers la vue de jeu choisie.
   * Le chronomètre ne démarre qu'à la fin ; toucher l'écran ou bouger la passe.
   */
  startIntro(targetZoom: ZoomLevel, seconds = 2.6): void {
    this.intro = seconds;
    this.introZoom = targetZoom;
    this.camera.zoom = 2;
  }

  private playIntro(dt: number, skip: boolean): void {
    this.intro = skip ? 0 : this.intro - dt;
    if (this.intro < 1.3) this.camera.zoom = this.introZoom;
    if (this.intro <= 0) this.onIntroEnd?.();
    this.tweens.update(dt);
    this.world.update(dt);
    this.character.animate(dt, 0, 0, 0, true);
    this.camera.update(dt, this.character.root.position, this.world.pyramidHalf, this.config.floors * FLOOR_HEIGHT, 0);
  }

  /**
   * Outil de mesure (vues de référence) : place le joueur sur un étage, devant la porte la plus proche du centre
   * de la face donnée, sans passer par les règles du jeu.
   */
  debugPlace(floor: number, side = 0): void {
    this.intro = 0;
    const target = landingPoint(this.config, floor, side, 0);
    this.player.floor = floor;
    this.body.teleport(target);
    this.character.faceTowards(-target.x, -target.z);
    this.hud.setFloor(floor, Math.max(floor, this.player.bestFloor));
    this.world.setPrivateHints(this.player.knownPassages, floor);
  }

  dispose(): void {
    this.tweens.clear();
    this.world.dispose();
  }
}
