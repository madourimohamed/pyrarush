import * as THREE from 'three';
import {
  Game,
  doorCenter,
  doorFront,
  doorTangent,
  floorAtY,
  landingPoint,
  sideCoords,
  terraceDistance,
  spawnPoint,
  summitFloor,
  INTERACT_RANGE,
  FLOOR_HEIGHT,
  MINE_MAX_ACTIVE,
  rideTarget,
  TRAP_FX,
  TRAP_SCENE_MULTI_MS,
  mineSpotValid,
  SEAL_WINDOW_MS,
  TURBO_SPEED,
  TURBO_MS,
  BOOTS_MS,
  BOOTS_JUMP,
  type PowerId,
  type BonusId,
  type Door,
  type GameEvent,
  type PyramidConfig,
  type Theme,
  type Vec3,
} from '../core';
import type { SfxName } from './audio/sfx';
import { Opponent } from './multiplayer/opponent';
import type { Vec3Tuple } from '../net/protocol';
import { FollowCamera, menuCamera, type ZoomLevel } from './camera';
import type { Input } from './input/input';
import { CharacterBody } from './physics';
import { Character } from './scene/character';
import { burst, easeInOut, shieldBubble, Trail, Tweens } from './scene/fx';
import { Mines } from './scene/mines';
import { createTrapScene, trapLanding, TRAP_SCENE_SOLO_S, type Cutscene } from './scene/trapScenes';
import { RideScene } from './scene/rideScene';
import { releaseScarab } from './scene/props';
import { HINT_COLORS, World } from './scene/world';
import { BONUS_INFO } from './ui/bonus';
import type { Hud, ToastKind } from './ui/hud';

export const PLAYER_ID = 'local';

/** Sortie sonore minimale dont la session a besoin (permet de jouer sans son, ex. dans les tests). */
export interface SoundPlayer {
  play(name: SfxName): void;
  /** Intensité de la musique (0 à 1). */
  setIntensity?(level: number): void;
}
/**
 * Liaison réseau d'une partie multijoueur (absente en solo) : la session applique ses actions localement, tout de suite,
 * et les transmet au serveur qui les rejoue sur sa partie.
 */
export interface NetLink {
  interact(doorId: string, p: Vec3): void;
  floor(floor: number): void;
  pos(p: Vec3, ry: number): void;
}
/** Fréquence d'envoi de la position en multijoueur. */
const POS_INTERVAL = 1 / 15;

const STEP = 1 / 60;
const GOLD = 0xffd34a;

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
  /** Le bouclier vient d'être consommé (pour mettre à jour le bouton du bonus). */
  onShieldEnd?: () => void;
  private attractTime = 0;
  /** Étage le plus haut déjà atteint dans cette partie (pour la bannière de nouvel étage). */
  private highest = 1;
  /** Multijoueur : liaison au serveur, adversaires affichés (par identifiant), minuterie d'envoi de la position. */
  net: NetLink | null = null;
  private readonly opponents = new Map<string, Opponent>();
  private posTimer = 0;
  private mines: Mines | null = null;
  private trail: Trail | null = null;
  /** Fin du turbo et de l'immunité (horloge de la partie), d'après le serveur. */
  private turboUntil = 0;
  private bootsUntil = 0;
  private immuneUntil = 0;
  /** Étage imposé par le serveur pendant une animation : appliqué dès qu'elle se termine. */
  private pendingFloor: number | null = null;
  /** Cinématique en cours (scène de piège, trajet en voiture) et point d'arrivée du joueur à la fin. */
  private cutscene: { scene: Cutscene; target: Vec3 } | null = null;
  /** Mines posées par le joueur (pour la limite). */
  private ownMines = new Set<number>();
  /** Démo de prise en main : observe les gestes du joueur (déplacement, saut, portes). */
  guide: {
    move(x: number, dt: number): void;
    jump(): void;
    door(e: Extract<GameEvent, { type: 'doorResult' }>): void;
  } | null = null;
  /** Ouvrir les portes est-il permis ? (la démo l'interdit avant sa dernière étape) */
  canInteract = true;
  /** En multijoueur, l'introduction sert de compte à rebours : on ne peut pas la passer. */
  introSkippable = true;
  /** Passage montré par l'Œil de Râ, jusqu'à `until` (ms de jeu). */
  private eyeReveal: { doorId: string; until: number } | null = null;
  /** Bulle dorée autour du personnage tant que le Bouclier d'Anubis est actif. */
  private readonly shieldBubble = shieldBubble();

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
    this.character.root.add(this.shieldBubble);
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

  get shieldActive(): boolean {
    return this.player.shield;
  }

  /** Utilise un bonus ; renvoie false s'il ne peut pas servir maintenant (il reste alors en réserve). */
  useBonus(bonus: BonusId): boolean {
    if (this.attract || this.paused || this.intro > 0 || this.locked || this.finished) return false;
    const events = this.game.useBonus(PLAYER_ID, bonus, this.clock);
    this.handle(events);
    return events.length > 0;
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
      this.playIntro(dt, this.introSkippable && (frame.jump || frame.interact || Math.hypot(frame.moveX, frame.moveY) > 0.3));
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
      this.guide?.move(frame.moveX, dt);
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.body.step(STEP, intent);
        if (this.body.landedSpeed > 4) this.character.land(this.body.landedSpeed);
        if (this.body.jumped) {
          this.sound.play(this.body.jumpScale > 1 ? 'boing' : 'jump');
          this.guide?.jump();
        }
        if (this.body.landedSpeed > 9) this.sound.play('land');
        intent.jumpPressed = false;
        this.accumulator -= STEP;
        steps++;
      }
      if (this.body.pos.y < -10) this.body.teleport(spawnPoint(this.config));
      this.world.fragile.update(dt, this.body, (name) => this.sound.play(name));

      if (this.body.grounded && !this.finished) {
        const floor = floorAtY(this.config, this.body.pos.y);
        const events = this.game.reportFloor(PLAYER_ID, floor, this.clock);
        if (events.length) this.net?.floor(floor);
        this.handle(events);
      }
      this.updateNearestDoor();
      if (frame.interact && this.nearestDoor && this.body.grounded && this.canInteract) {
        const door = this.nearestDoor;
        const events = this.game.interact(PLAYER_ID, door.id, this.clock, this.body.pos);
        if (events.length) this.net?.interact(door.id, this.body.pos);
        this.handle(events);
      }
    }

    this.handle(this.game.update(this.clock));
    if (this.cutscene?.scene.update(dt)) this.endCutscene();
    if (this.eyeReveal && this.clock >= this.eyeReveal.until) {
      if (!this.game.reveals.has(this.eyeReveal.doorId)) this.world.setReveal(this.eyeReveal.doorId, false);
      this.eyeReveal = null;
    }
    this.shieldBubble.visible = this.player.shield;
    if (this.player.shield) this.shieldBubble.scale.setScalar(1 + Math.sin(this.clock / 180) * 0.04);
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
    this.updateMultiplayer(dt);
  }

  // ---------- Multijoueur ----------

  /** Chaque joueur part à sa place, à côté du point de départ (x en mètres), pour ne pas apparaître l'un dans l'autre. */
  shiftStart(x: number): void {
    const p = spawnPoint(this.config);
    this.body.teleport({ ...p, x: p.x + x });
    this.syncCharacter();
  }

  /** Prépare les effets des pouvoirs (mines, traînée du turbo et des bottes). */
  enableMultiplayer(): void {
    this.mines ??= new Mines(this.world.scene, this.tweens, this.world.theme.top);
    this.trail ??= new Trail(this.world.scene, 0x9ad8ff);
  }

  /** Affiche un adversaire, avec la couleur de son écharpe. */
  addOpponent(id: string, name: string, color: number): void {
    const opponent = new Opponent(name, color, this.world.scene);
    this.opponents.set(id, opponent);
    this.world.scene.add(opponent.character.root);
  }

  /** Un adversaire a quitté la partie. */
  removeOpponent(id: string): void {
    const opponent = this.opponents.get(id);
    if (!opponent) return;
    opponent.stopScene();
    this.world.scene.remove(opponent.character.root);
    this.opponents.delete(id);
  }

  setOpponentState(id: string, shield: boolean, turboMs: number, bootsMs: number, immuneMs: number): void {
    this.opponents.get(id)?.setState(shield, turboMs, bootsMs, immuneMs);
  }

  /** Effets en cours, en fraction du temps restant (anneaux de la barre de pouvoirs) ; le bouclier reste plein tant qu'il tient. */
  powerTimers(): Partial<Record<PowerId, number>> {
    return {
      turbo: Math.max(0, this.turboUntil - this.clock) / TURBO_MS,
      boots: Math.max(0, this.bootsUntil - this.clock) / BOOTS_MS,
      shield: this.player.shield ? 1 : 0,
    };
  }

  /** Position à l'écran (pixels) du devant d'une porte, pour faire s'envoler l'icône d'un pouvoir gagné. */
  doorScreenPoint(doorId: string): { x: number; y: number } | null {
    const door = this.game.doorsById.get(doorId);
    if (!door) return null;
    const front = doorFront(this.config, door);
    const p = new THREE.Vector3(front.x, front.y + 1.4, front.z).project(this.camera.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  /** Démo : la bonne porte la plus proche du départ, signalée par le repère doré (on est sûr de réussir). */
  showGuideDoor(): string | null {
    const spawn = spawnPoint(this.config);
    // Un passage de la face de départ si possible (en vue), sinon le plus proche.
    const all = this.game.layout.doorsByFloor[1].filter((d) => d.mechanic === 'passage');
    const facing = all.filter((d) => d.side === sideCoords(spawn).side);
    const passages = facing.length ? facing : all;
    const nearest = passages.sort((a, b) => {
      const fa = doorFront(this.config, a);
      const fb = doorFront(this.config, b);
      return Math.hypot(fa.x - spawn.x, fa.z - spawn.z) - Math.hypot(fb.x - spawn.x, fb.z - spawn.z);
    })[0];
    if (!nearest) return null;
    // Repère doré + faisceau lumineux, visible de loin même si la porte est hors champ.
    this.world.setPrivateHints(new Set([nearest.id]), 1);
    this.world.setReveal(nearest.id, true);
    return nearest.id;
  }

  /** Position des pieds (pour poser une mine). */
  get feet(): Vec3 {
    return { ...this.body.pos };
  }

  /**
   * Un pouvoir peut-il servir maintenant ? Renvoie la raison sinon (le pouvoir n'est alors pas envoyé ni consommé).
   * Le serveur refait les mêmes vérifications.
   */
  powerBlocker(power: PowerId): string | null {
    if (this.intro > 0 || this.finished) return 'Pas maintenant';
    switch (power) {
      case 'turbo':
        return this.clock < this.turboUntil ? 'Turbo déjà actif' : null;
      case 'boots':
        return this.clock < this.bootsUntil ? 'Bottes déjà actives' : null;
      case 'cloud':
        return this.opponents.size > 0 ? null : 'Pas d’adversaire';
      case 'shield':
        return this.player.shield ? 'Bouclier déjà actif' : null;
      case 'seal': {
        const last = this.player.lastPassage;
        if (!last || this.clock - last.at > SEAL_WINDOW_MS) return 'Franchis d’abord une bonne porte';
        return this.game.seals.has(last.doorId) ? 'Porte déjà scellée' : null;
      }
      case 'car': {
        if (this.locked || this.player.floor > this.config.floors) return 'Pas maintenant';
        return rideTarget(this.game.layout, this.body.pos, this.player.floor) ? null : 'Tu es déjà devant la bonne porte';
      }
      case 'mine':
        if (this.ownMines.size >= MINE_MAX_ACTIVE) return `${MINE_MAX_ACTIVE} mines déjà posées`;
        if (this.locked || !this.body.grounded || !mineSpotValid(this.game.layout, this.body.pos)) return 'Pas ici (trop près d’une porte ou d’un trou)';
        return null;
    }
  }

  /**
   * État de référence envoyé par le serveur. Turbo et immunité s'appliquent toujours ; l'étage et le bouclier
   * seulement si le client n'attend plus de réponse (`reconcile`), sinon une réponse plus récente arrivera.
   */
  applyServerState(s: { floor: number; shield: boolean; turboMs: number; bootsMs: number; immuneMs: number }, reconcile: boolean): void {
    const turboWasOff = this.clock >= this.turboUntil;
    const bootsWereOff = this.clock >= this.bootsUntil;
    this.turboUntil = this.clock + s.turboMs;
    this.bootsUntil = this.clock + s.bootsMs;
    if (bootsWereOff && s.bootsMs > 0) {
      this.sound.play('boing');
      this.hud.showToast('Bottes rebondissantes !', 'good', 1.5, 'Saut renforcé pendant 8 s');
    }
    this.immuneUntil = this.clock + s.immuneMs;
    if (turboWasOff && s.turboMs > 0) {
      this.sound.play('turbo');
      this.hud.showToast('Turbo !', 'good', 1.5, 'Vitesse ×2 pendant 10 s');
    }
    if (!reconcile) return;
    if (s.shield && !this.player.shield) {
      this.sound.play('bonus');
      this.hud.showToast("Bouclier d'Anubis", 'good', 1.8, 'Il absorbe le prochain coup');
    }
    this.player.shield = s.shield;
    if (s.floor !== this.player.floor) this.pendingFloor = s.floor;
  }

  /** Pouvoir trouvé derrière une porte vide : la porte s'ouvre, gerbe violette, et la porte garde la marque « coffre vidé ». */
  powerGained(name: string, doorId: string): void {
    const door = this.game.doorsById.get(doorId);
    this.world.doors.markTried(doorId, 'power');
    this.world.openDoor(doorId, 0.5);
    this.world.flashDoor(doorId, 0xc58cff, 0.8);
    const front = door ? doorFront(this.config, door) : this.body.pos;
    const at = new THREE.Vector3(front.x, front.y + 1.4, front.z);
    burst(this.world.scene, this.tweens, at, 0xc58cff, 18, 3, 2.5);
    this.sound.play('pickup');
    this.hud.showToast(`${name} !`, 'good', 1.8, 'Ajouté à ta réserve');
  }

  addMine(id: number, p: Vec3, own: boolean): void {
    this.mines?.add(id, p, own);
    if (own) {
      this.ownMines.add(id);
      this.sound.play('mine');
    }
  }

  removeMine(id: number): void {
    this.ownMines.delete(id);
    this.mines?.remove(id);
  }

  /** Une mine a explosé ; si c'est sous le joueur, il est projeté (ou protégé). */
  mineExploded(id: number, onMe: boolean, result: 'knocked' | 'shielded' | 'immune', at: Vec3): void {
    this.ownMines.delete(id);
    this.mines?.explode(id, at);
    this.sound.play('boom');
    if (!onMe) return;
    navigator.vibrate?.([60, 30, 120]);
    if (result === 'immune') return;
    if (result === 'shielded') {
      this.player.shield = true; // le moteur consomme le bouclier et produit l'événement « shielded »
      this.handle(this.game.knockDown(PLAYER_ID, this.clock));
      return;
    }
    this.player.shield = false;
    this.handle(this.game.knockDown(PLAYER_ID, this.clock));
  }

  /** Sceau annoncé par le serveur (le sien ou celui d'un adversaire, `owner`). */
  applySeal(doorId: string, own: boolean, owner: string, ms: number): void {
    this.handle(this.game.applySeal(doorId, own ? PLAYER_ID : owner, this.clock + ms));
    if (own) this.hud.showToast('Porte scellée !', 'good', 1.8, 'Bloquée 10 s pour tes adversaires');
  }

  opponentMoved(id: string, p: Vec3Tuple, ry: number): void {
    this.opponents.get(id)?.moveTo(p, ry);
  }

  /** L'adversaire a trouvé un passage : on le voit aussi, quelques secondes (entraide indirecte). */
  opponentReveal(doorId: string, ms: number, name: string): void {
    if (!this.game.doorsById.has(doorId) || ms <= 0) return;
    this.game.reveals.set(doorId, this.clock + ms);
    this.world.setReveal(doorId, true);
    const door = this.game.doorsById.get(doorId)!;
    if (door.floor === this.player.floor) this.hud.showToast(`${name} a trouvé un passage !`, 'info', 2.2, 'Vite, il brille encore à ton étage');
  }

  /** Recalage sur l'étage du serveur (rare : une action locale a croisé un coup ou un sceau). */
  private correctFloor(floor: number): void {
    this.pendingFloor = null;
    if (floor === this.player.floor) return;
    this.player.floor = floor;
    const { side, tangent } = sideCoords(this.body.pos);
    this.body.teleport(landingPoint(this.config, floor, side, tangent));
    this.syncCharacter();
    this.hud.setFloor(floor, this.player.bestFloor);
    this.world.setPrivateHints(this.player.knownPassages, floor);
    this.onAltitude(floor);
  }

  /** Fin de la partie décidée par le serveur : elle s'arrête pour tout le monde. */
  endRace(): void {
    this.finished = true;
    if (this.cutscene) {
      this.cutscene.scene.finish();
      this.cutscene = null;
    }
    this.lock();
  }

  private updateMultiplayer(dt: number): void {
    for (const opponent of this.opponents.values()) opponent.update(dt, this.camera.zoomSmooth, this.camera.camera);
    if (this.trail) {
      const turbo = this.clock < this.turboUntil;
      const boots = this.clock < this.bootsUntil;
      this.body.speedScale = turbo ? TURBO_SPEED : 1;
      this.body.jumpScale = boots ? BOOTS_JUMP : 1;
      this.trail?.update(dt, this.character.root.position, turbo || (boots && !this.body.grounded), this.camera.camera);
      this.character.body.visible = this.clock >= this.immuneUntil || this.clock % 200 < 120;
      this.mines?.update(dt);
      if (this.pendingFloor !== null && !this.locked) this.correctFloor(this.pendingFloor);
    }
    if (!this.net) return;
    this.posTimer -= dt;
    if (this.posTimer > 0) return;
    this.posTimer = POS_INTERVAL;
    const root = this.character.root;
    this.net.pos(root.position, root.rotation.y);
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
    const shielded = events.some((e) => e.type === 'shielded');
    for (const event of events) {
      switch (event.type) {
        case 'doorResult':
          this.onDoorResult(event, shielded);
          this.guide?.door(event);
          break;
        case 'bonusUsed':
          this.onBonusUsed(event.bonus, event.timeBonusMs);
          break;
        case 'privateReveal':
          this.eyeReveal = { doorId: event.doorId, until: event.until };
          this.world.setReveal(event.doorId, true);
          this.world.flashDoor(event.doorId, GOLD, (event.until - this.clock) / 1000);
          break;
        case 'shielded':
          this.onShielded(event.cause, event.floor);
          break;
        case 'knocked':
          this.onKnocked(event.from, event.to);
          break;
        case 'sealed':
          this.world.doors.setSealed(event.doorId, true);
          this.sound.play('seal');
          break;
        case 'unsealed':
          this.world.doors.setSealed(event.doorId, false);
          break;
        case 'doorSealed':
          this.world.shakeDoor(event.doorId);
          this.character.react('bump');
          this.sound.play('wall');
          this.hud.showToast('Porte scellée !', 'bad', 1.8, 'Ton adversaire l’a bloquée… patiente ou cherche ailleurs');
          break;
        case 'publicReveal':
          this.world.setReveal(event.doorId, true);
          break;
        case 'revealEnd':
          this.world.setReveal(event.doorId, false);
          break;
        case 'floorChanged':
          this.onAltitude(event.to);
          if (event.to > this.highest) this.onNewFloor(event.to);
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

  /** Lumière et musique suivent la hauteur atteinte. */
  private onAltitude(floor: number): void {
    const ratio = (floor - 1) / this.config.floors;
    this.world.setAltitude(ratio);
    this.sound.setIntensity?.(ratio);
  }

  /** Premier passage à un étage dans la partie : bannière, son, vibration et gerbe dorée à l'arrivée. */
  private onNewFloor(floor: number): void {
    this.highest = floor;
    if (floor > this.config.floors) return; // le sommet a sa propre célébration
    const last = floor === this.config.floors;
    this.hud.showFloorBanner(last ? 'Dernier étage !' : `Étage ${floor}`, last ? 'Le sommet est juste au-dessus' : `${this.config.floors - floor + 1} étages avant le sommet`);
    this.sound.play('ascend');
    navigator.vibrate?.([25, 40, 25]);
    // La gerbe attend que le personnage soit arrivé (animation de passage ou de téléportation).
    this.tweens.add(0.9, () => {}, () => {
      const at = this.character.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      burst(this.world.scene, this.tweens, at, GOLD, 24, 3.5, 2.2);
    });
  }

  /** Coup reçu (mine) : projeté, puis atterrit devant une porte de l'étage `to` (au plus un de moins). */
  private onKnocked(from: number, to: number): void {
    const { side, tangent } = sideCoords(this.body.pos);
    this.hud.showToast('BOUM !', 'bad', 2, to < from ? 'Une mine ! Tu redescends d’un étage' : 'Une mine ! Tu es repoussé');
    this.playKnockback(landingPoint(this.config, to, side, tangent), false);
  }

  private onBonusUsed(bonus: BonusId, timeBonusMs = 0): void {
    const info = BONUS_INFO[bonus];
    this.sound.play('bonus');
    this.clock = Math.max(0, this.clock - timeBonusMs);
    const root = this.character.root;
    burst(this.world.scene, this.tweens, root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), GOLD, 16, 3, 2);
    this.hud.showToast(info.name, 'good', 2.2, bonus === 'shield' ? 'Bouclier actif : ta prochaine chute sera annulée' : info.effect);
  }

  /** Le bouclier a annulé une chute : après une chute physique, on remonte le joueur sur sa terrasse. */
  private onShielded(cause: 'door' | 'fall' | 'attack', floor: number): void {
    this.sound.play('shield');
    navigator.vibrate?.(40);
    this.hud.showToast("Bouclier d'Anubis !", 'good', 2, { door: 'Le piège est annulé', fall: 'Ta chute est annulée', attack: 'La mine est neutralisée' }[cause]);
    const root = this.character.root;
    burst(this.world.scene, this.tweens, root.position.clone().add(new THREE.Vector3(0, 1, 0)), GOLD, 22, 4, 2.5);
    if (cause === 'fall') {
      const { side, tangent } = sideCoords(this.body.pos);
      this.playTeleport(landingPoint(this.config, floor, side, tangent), floor, GOLD);
    }
    this.onShieldEnd?.();
  }

  private onDoorResult(e: Extract<GameEvent, { type: 'doorResult' }>, shielded = false): void {
    const door = this.game.doorsById.get(e.doorId)!;
    const kind: ToastKind =
      e.to > e.from ? 'good' : e.to < e.from ? 'bad' : e.hint?.type === 'hotCold' ? e.hint.level : e.hint ? 'scarab' : 'info';
    const scarab = e.hint?.type === 'scarab' ? this.scarabCourse(door, e.hint) : null;
    const [title, sub] = toastText(e, scarab?.words);
    const tried = this.player.tried.get(door.id);
    if (tried) this.world.doors.markTried(door.id, tried);
    // Piège : le titre peut venir du gardien qui surgit (« Le gardien surgit ! »).
    const trap = TRAP_FX.includes(e.fx);
    const trapTitle = e.fx !== 'riskyLose' && trap ? this.world.guardianFor(door).title : undefined;
    this.hud.showToast(trapTitle ?? title, trap ? 'bad' : kind, 1.8, sub);
    this.hud.setPrompt(false);
    this.nearestDoor = null;
    this.world.setHighlight(null);

    if (shielded) {
      // Le bouclier a absorbé le piège : la porte tremble, le joueur ne bouge pas.
      this.world.shakeDoor(door.id);
      this.world.flashDoor(door.id, GOLD, 0.8);
      this.character.react('bump');
      return;
    }
    if (e.to === e.from && trap) {
      // Déjà tout en bas : le gardien frappe quand même et repousse le joueur en arrière (perte de temps).
      this.startTrapScene(door, e.from, e.to);
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
        // Pièges et pari perdu : le gardien de la porte surgit et envoie le joueur en contrebas.
        if (e.fx === 'riskyLose') this.sound.play('riskyLose');
        this.startTrapScene(door, e.from, e.to);
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

  /**
   * Scène de piège cartoon (voir cutscenes.ts) : 3 s en solo, 2 s en multijoueur, gros plan de la caméra du joueur touché.
   * Le moteur a déjà appliqué les conséquences ; la scène ne fait que les montrer, puis rend les commandes.
   */
  private startTrapScene(door: Door, from: number, to: number): void {
    this.lock();
    this.world.flashDoor(door.id, 0xff2a1a, 0.6);
    const target = trapLanding(this.config, door, from, to);
    const scene = this.makeTrapScene(door, this.character, target, from - to > 1, true);
    if (!scene) return this.unlock(target, this.player.floor);
    this.cutscene = { scene, target };
  }

  /** Construit une scène de piège pour un personnage (le sien, ou un adversaire qui la rejoue sans caméra ni son). */
  private makeTrapScene(door: Door, character: Character, target: Vec3, big: boolean, local: boolean): Cutscene | null {
    const transform = this.world.doors.transform(door.id);
    if (!transform) return null;
    const guardian = this.world.borrowGuardian(door);
    this.world.openDoor(door.id, 0.6);
    const scene = createTrapScene({
      scene: this.world.scene,
      tweens: this.tweens,
      character,
      guardian,
      door: transform,
      shakeDoor: () => this.world.shakeDoor(door.id),
      openDoor: () => this.world.openDoor(door.id, 0.5),
      start: character.root.position.clone(),
      target,
      big,
      duration: this.net ? TRAP_SCENE_MULTI_MS / 1000 : TRAP_SCENE_SOLO_S,
      ...(local && {
        camera: this.camera,
        sound: (name: SfxName) => this.sound.play(name),
        vibrate: (pattern: number | number[]) => navigator.vibrate?.(pattern),
      }),
    });
    // Le gardien est rendu à la fin de la scène, quelle qu'elle soit.
    const finish = scene.finish.bind(scene);
    scene.finish = () => {
      finish();
      this.world.releaseGuardian(guardian);
    };
    return scene;
  }

  /** Fin de la cinématique (normale ou forcée) : personnage posé à l'arrivée, commandes et caméra rendues. */
  private endCutscene(): void {
    const current = this.cutscene;
    if (!current) return;
    this.cutscene = null;
    current.scene.finish();
    this.unlock(current.target, this.player.floor);
  }

  /** Voiture (pouvoir) : trajet décidé par le serveur, jusqu'au passage `doorId` ; le joueur arrive devant la porte. */
  startRide(doorId: string, dir: 1 | -1, ms: number): void {
    const door = this.game.doorsById.get(doorId);
    if (!door || this.cutscene) return;
    this.lock();
    const scene = this.makeRide(door, this.character, dir, ms, true);
    const front = doorFront(this.config, door);
    this.cutscene = { scene, target: front };
    this.hud.showToast('Voiture !', 'good', 2, 'Direction : le passage le plus proche');
  }

  /** Un adversaire part en voiture : on rejoue son trajet sur son personnage. */
  opponentRide(id: string, doorId: string, dir: 1 | -1, ms: number): void {
    const opponent = this.opponents.get(id);
    const door = this.game.doorsById.get(doorId);
    if (opponent && door) opponent.playScene(this.makeRide(door, opponent.character, dir, ms, false));
  }

  private makeRide(door: Door, character: Character, dir: 1 | -1, ms: number, local: boolean): Cutscene {
    const ride = new RideScene({
      scene: this.world.scene,
      tweens: this.tweens,
      config: this.config,
      character,
      door,
      dir,
      duration: ms / 1000,
      view: this.camera.camera,
      ...(local && { camera: this.camera, sound: (name: SfxName) => this.sound.play(name) }),
    });
    if (!local) return ride;
    // À l'arrivée, la bonne porte brille un instant : il n'y a plus qu'à l'ouvrir.
    const finish = ride.finish.bind(ride);
    ride.finish = () => {
      finish();
      this.world.flashDoor(door.id, GOLD, 2);
    };
    return ride;
  }

  /** Un adversaire a été piégé : on rejoue la même scène sur son personnage (sans toucher à notre caméra). */
  opponentTrapped(id: string, doorId: string, from: number, to: number): void {
    const opponent = this.opponents.get(id);
    const door = this.game.doorsById.get(doorId);
    if (!opponent || !door) return;
    const scene = this.makeTrapScene(door, opponent.character, trapLanding(this.config, door, from, to), from - to > 1, false);
    if (scene) opponent.playScene(scene);
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
    // Une cinématique garde la main jusqu'à sa fin (endCutscene la retire avant de rendre les commandes).
    if (this.cutscene) return;
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
    this.updateMultiplayer(dt);
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
    this.cutscene?.scene.finish();
    this.cutscene = null;
    for (const opponent of this.opponents.values()) opponent.stopScene();
    this.tweens.clear();
    this.world.dispose();
  }
}
