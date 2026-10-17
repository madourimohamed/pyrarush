import {
  BOOTS_MS,
  CLOUD_MS,
  emptyReserve,
  Game,
  IMMUNITY_MS,
  mineSpotValid,
  mineTriggered,
  MINE_ARM_MS,
  MINE_LIFETIME_MS,
  MINE_MAX_ACTIVE,
  cloudTarget,
  pickPower,
  rideMs,
  rideTarget,
  powerSpotCount,
  rankPlayers,
  POWER_RESPAWN_MS,
  randomSeed,
  standing,
  TRAP_FX,
  TRAP_SCENE_MULTI_MS,
  TURBO_MS,
  type GameEvent,
  type Level,
  type PowerDensity,
  type PowerId,
  type PowerReserve,
  type Vec3,
} from '../src/core';
import {
  arrivalsToFinish,
  COUNTDOWN_MS,
  FINISH_GRACE_MS,
  KICK_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ClientMessage,
  type PlayerResult,
  type RoomPlayer,
  type ServerMessage,
  type Vec3Tuple,
} from '../src/net/protocol';
import { LIMITS, RateLimiter } from './security';

/** Un joueur connecté (une connexion WebSocket, ou un faux joueur dans les tests). */
export interface Peer {
  readonly id: string;
  /** Nom affiché, celui du compte (jamais fourni par le navigateur). */
  name: string;
  /** Compte du joueur (exclusions temporaires, limites) ; absent dans certains tests. */
  readonly userId?: string;
  /** Adresse IP (limite des codes de salle erronés) ; absente dans certains tests. */
  readonly ip?: string;
  send(message: ServerMessage): void;
}

/** Horloge et minuteries injectables (tests déterministes). */
export interface Clock {
  now(): number;
  later(ms: number, fn: () => void): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  later: (ms, fn) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

type RoomState = 'waiting' | 'countdown' | 'racing' | 'finished';

/** État multijoueur d'un participant, tenu par le serveur (fait foi). */
interface Fighter {
  name: string;
  /** A quitté la partie en cours de route (il reste au classement, en dernier). */
  left: boolean;
  powers: PowerReserve;
  turboUntil: number;
  bootsUntil: number;
  immuneUntil: number;
  /** Fin de la scène de piège en cours (gant, momie) : pas de mine pendant ce temps. */
  sceneUntil: number;
  /** Dernière position reçue (pieds), pour les mines. */
  pos: Vec3 | null;
  /** Dernière action traitée (renvoyée dans `self`). */
  seq: number;
  /** Positions reçues dans la seconde en cours (limite de débit relayé aux autres). */
  posSecond: number;
  posCount: number;
}

interface Mine {
  id: number;
  owner: string;
  p: Vec3;
  armedAt: number;
  cancel: () => void;
}

/**
 * Une salle multijoueur : de MIN_PLAYERS à MAX_PLAYERS joueurs, une pyramide, une course. Le serveur rejoue les actions
 * de chacun sur sa propre partie (le même moteur que le navigateur) et fait autorité : pouvoirs, mines, sceaux, coups,
 * arrivées et classement. Aucune règle ne suppose un nombre de joueurs.
 */
export class Room {
  /** Joueurs connectés à la salle ; le premier est l'hôte (il lance la partie). */
  readonly peers: Peer[] = [];
  state: RoomState = 'waiting';
  private game: Game | null = null;
  private startAt = 0;
  private rematch = new Set<string>();
  private cancelStart: (() => void) | null = null;
  private cancelGrace: (() => void) | null = null;
  /** Participants de la course en cours (ordre de départ), même ceux qui sont partis depuis. */
  private fighters = new Map<string, Fighter>();
  /** Arrivées au sommet, dans l'ordre. */
  private arrivals: string[] = [];
  private mines = new Map<number, Mine>();
  private nextMine = 1;
  /** Portes vides qui cachent un pouvoir en ce moment (secret : jamais envoyé aux navigateurs). */
  readonly hidden = new Set<string>();
  private respawns: (() => void)[] = [];
  /** Joueurs exclus par l'hôte, jusqu'à quand (exclusion temporaire, oubliée avec la salle). */
  private readonly excluded = new Map<string, number>();

  constructor(
    readonly code: string,
    readonly level: Level,
    readonly density: PowerDensity,
    private readonly clock: Clock,
    private readonly seeds: () => number = randomSeed,
    private readonly random: () => number = Math.random,
  ) {}

  get full(): boolean {
    return this.peers.length >= MAX_PLAYERS;
  }

  /** On rejoint une salle en attente, ou entre deux courses (on participera à la revanche). */
  get joinable(): boolean {
    return !this.full && (this.state === 'waiting' || this.state === 'finished');
  }

  get host(): Peer | undefined {
    return this.peers[0];
  }

  /** Temps restant (ms) avant que ce joueur exclu puisse revenir, ou 0. */
  exclusionLeft(peer: Peer): number {
    return Math.max(0, (this.excluded.get(peer.userId ?? peer.id) ?? 0) - this.clock.now());
  }

  /** L'hôte exclut un joueur : il quitte la salle et ne peut pas revenir pendant KICK_MS. */
  exclude(peer: Peer): void {
    this.excluded.set(peer.userId ?? peer.id, this.clock.now() + KICK_MS);
  }

  add(peer: Peer): void {
    this.peers.push(peer);
    this.broadcastRoom();
    // Salle pleine : la partie part toute seule.
    if (this.full && this.state === 'waiting') this.start();
  }

  remove(peer: Peer): void {
    const index = this.peers.indexOf(peer);
    if (index < 0) return;
    this.peers.splice(index, 1);
    this.rematch.delete(peer.id);
    const fighter = this.fighters.get(peer.id);
    if (fighter && (this.state === 'countdown' || this.state === 'racing')) {
      fighter.left = true;
      for (const mine of [...this.mines.values()]) if (mine.owner === peer.id) this.removeMine(mine.id);
      this.checkFinish();
    }
    this.broadcastRoom();
  }

  handle(peer: Peer, message: ClientMessage): void {
    const game = this.game;
    const fighter = this.fighters.get(peer.id);
    if (game && this.state === 'racing') this.applyGlobal(game.update(this.raceTime()));
    switch (message.t) {
      case 'pos': {
        if (this.state !== 'racing' && this.state !== 'countdown') return;
        if (fighter && !this.positionAllowed(fighter)) return;
        this.others(peer, { t: 'pos', id: peer.id, p: message.p, ry: message.ry });
        if (!fighter) return;
        const [x, y, z] = message.p;
        const to = { x, y, z };
        if (this.state === 'racing' && fighter.pos) this.checkMines(peer, fighter, fighter.pos, to);
        fighter.pos = to;
        return;
      }
      case 'interact': {
        if (!game || !fighter || this.state !== 'racing') return;
        fighter.seq = message.seq;
        const [x, y, z] = message.p;
        this.apply(peer, game.interact(peer.id, message.doorId, this.raceTime(), { x, y, z }));
        this.sendSelf(peer);
        return;
      }
      case 'floor':
        if (!game || !fighter || this.state !== 'racing') return;
        fighter.seq = message.seq;
        this.apply(peer, game.reportFloor(peer.id, message.floor, this.raceTime()));
        this.sendSelf(peer);
        return;
      case 'power':
        if (!game || !fighter || this.state !== 'racing') return;
        fighter.seq = message.seq;
        if (fighter.powers[message.power] > 0 && this.usePower(peer, fighter, message.power, message.p)) fighter.powers[message.power]--;
        this.sendSelf(peer);
        return;
      case 'launch':
        if (peer === this.host && this.state === 'waiting' && this.peers.length >= MIN_PLAYERS) this.start();
        return;
      case 'rematch':
        if (this.state !== 'finished') return;
        this.rematch.add(peer.id);
        this.others(peer, { t: 'rematch', id: peer.id });
        if (this.peers.length >= MIN_PLAYERS && this.peers.every((p) => this.rematch.has(p.id))) this.start();
        return;
      default:
        return;
    }
  }

  /** Pas plus de LIMITS.positionsPerSecond positions par seconde et par joueur (protège la bande passante des autres). */
  private positionAllowed(fighter: Fighter): boolean {
    const second = Math.floor(this.clock.now() / 1000);
    if (second !== fighter.posSecond) {
      fighter.posSecond = second;
      fighter.posCount = 0;
    }
    return ++fighter.posCount <= LIMITS.positionsPerSecond;
  }

  private start(): void {
    this.rematch.clear();
    this.clearTimers();
    const seed = this.seeds();
    this.game = new Game(this.level.config, seed);
    // Le classement suit l'horloge du serveur : le sablier des trésors y est remplacé par des éclats.
    this.game.timeBonuses = false;
    this.hidePowers(this.game);
    this.fighters.clear();
    this.arrivals = [];
    for (const peer of this.peers) {
      this.game.addPlayer(peer.id);
      this.fighters.set(peer.id, { name: peer.name, left: false, powers: emptyReserve(), turboUntil: 0, bootsUntil: 0, immuneUntil: 0, sceneUntil: 0, pos: null, seq: 0, posSecond: 0, posCount: 0 });
    }
    this.state = 'countdown';
    this.startAt = this.clock.now() + COUNTDOWN_MS;
    this.broadcast({ t: 'start', seed, level: this.level.id, inMs: COUNTDOWN_MS, order: this.peers.map((p) => p.id) });
    this.cancelStart?.();
    this.cancelStart = this.clock.later(COUNTDOWN_MS, () => {
      if (this.state === 'countdown') this.state = 'racing';
    });
  }

  private raceTime(): number {
    return Math.max(0, this.clock.now() - this.startAt);
  }

  /** Applique un pouvoir ; renvoie false s'il ne peut pas servir maintenant (il n'est alors pas consommé). */
  private usePower(peer: Peer, fighter: Fighter, power: PowerId, [x, y, z]: Vec3Tuple): boolean {
    const game = this.game!;
    const now = this.raceTime();
    switch (power) {
      case 'turbo':
        if (fighter.turboUntil > now) return false;
        fighter.turboUntil = now + TURBO_MS;
        this.broadcastState(peer);
        return true;
      case 'boots':
        if (fighter.bootsUntil > now) return false;
        fighter.bootsUntil = now + BOOTS_MS;
        this.broadcastState(peer);
        return true;
      case 'cloud': {
        // Le joueur juste devant (ou le deuxième si l'on est en tête), parmi ceux encore en course.
        const others = this.racing().filter((p) => p !== peer);
        const contenders = others.map((p) => ({ id: p.id, floor: game.players.get(p.id)!.floor }));
        const targetId = cloudTarget(game.players.get(peer.id)!.floor, contenders, this.random());
        const target = others.find((p) => p.id === targetId);
        if (!target) return false;
        target.send({ t: 'cloud', from: peer.id, ms: CLOUD_MS });
        return true;
      }
      case 'car': {
        // Le serveur choisit le passage (le plus proche, en évitant les portes scellées par un autre) et la durée.
        const player = game.players.get(peer.id)!;
        if (player.floor > game.config.floors || now < fighter.sceneUntil) return false;
        const sealedByOther = (door: { id: string }) => {
          const seal = game.seals.get(door.id);
          return !!seal && seal.active && seal.owner !== peer.id && now < seal.until;
        };
        const ride = rideTarget(game.layout, { x, y, z }, player.floor, sealedByOther);
        if (!ride) return false;
        const ms = rideMs(ride.distance);
        fighter.sceneUntil = now + ms;
        this.broadcast({ t: 'ride', id: peer.id, doorId: ride.door.id, dir: ride.dir, ms });
        return true;
      }
      case 'shield':
        if (game.useBonus(peer.id, 'shield', now).length === 0) return false;
        this.broadcastState(peer);
        return true;
      case 'seal': {
        const sealed = game.sealDoor(peer.id, now);
        this.applyGlobal(sealed);
        return sealed.length > 0;
      }
      case 'mine': {
        const p = { x, y, z };
        const near = fighter.pos === null || Math.hypot(fighter.pos.x - x, fighter.pos.z - z) < 3;
        const mine = [...this.mines.values()].filter((m) => m.owner === peer.id).length < MINE_MAX_ACTIVE;
        if (!near || !mine || !mineSpotValid(game.layout, p)) return false;
        const id = this.nextMine++;
        const cancel = this.clock.later(MINE_LIFETIME_MS, () => this.removeMine(id));
        this.mines.set(id, { id, owner: peer.id, p, armedAt: now + MINE_ARM_MS, cancel });
        this.broadcast({ t: 'mine', id, owner: peer.id, p: [x, y, z] });
        return true;
      }
    }
  }

  /** Le joueur s'est déplacé : a-t-il marché sur une mine adverse armée ? */
  private checkMines(peer: Peer, fighter: Fighter, from: Vec3, to: Vec3): void {
    const now = this.raceTime();
    if (this.game!.players.get(peer.id)!.finishedAt !== undefined || now < fighter.sceneUntil) return;
    for (const mine of this.mines.values()) {
      if (mine.owner === peer.id || now < mine.armedAt || !mineTriggered(mine.p, from, to)) continue;
      this.removeMine(mine.id, false);
      const before = this.game!.players.get(peer.id)!.floor;
      const immune = now < fighter.immuneUntil;
      const events = immune ? [] : this.game!.knockDown(peer.id, now);
      const shielded = events.some((e) => e.type === 'shielded');
      const after = this.game!.players.get(peer.id)!.floor;
      if (!immune && !shielded) fighter.immuneUntil = now + IMMUNITY_MS;
      const result = immune ? 'immune' : shielded ? 'shielded' : 'knocked';
      this.broadcast({ t: 'boom', mine: mine.id, owner: mine.owner, target: peer.id, result, p: [mine.p.x, mine.p.y, mine.p.z], from: before, to: after });
      this.apply(peer, events);
      this.sendSelf(peer);
      this.broadcastState(peer);
      return;
    }
  }

  /** Ce que les autres joueurs doivent savoir des événements d'un joueur ; les pouvoirs cachés ; les arrivées. */
  private apply(peer: Peer, events: GameEvent[]): void {
    const shielded = events.some((e) => e.type === 'shielded');
    for (const event of events) {
      if (event.type === 'doorResult' && TRAP_FX.includes(event.fx) && !shielded) {
        // Les autres rejouent la scène du piège ; pendant ce temps, pas de mine pour le joueur piégé.
        this.fighters.get(peer.id)!.sceneUntil = this.raceTime() + TRAP_SCENE_MULTI_MS;
        this.others(peer, { t: 'trapped', id: peer.id, doorId: event.doorId, from: event.from, to: event.to });
      }
      if (event.type === 'publicReveal') {
        this.others(peer, { t: 'reveal', id: peer.id, doorId: event.doorId, ms: event.until - this.raceTime() });
      } else if (event.type === 'floorChanged') {
        this.others(peer, { t: 'floor', id: peer.id, floor: event.to });
      } else if (event.type === 'doorResult' && event.mechanic === 'wall' && this.hidden.has(event.doorId)) {
        this.take(peer, event.doorId);
      } else if (event.type === 'shielded') {
        this.broadcastState(peer);
      } else if (event.type === 'victory') {
        this.arrive(peer, event.time);
      }
    }
  }

  /** Événements qui concernent tout le monde (sceaux posés et levés). */
  private applyGlobal(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'sealed') this.broadcast({ t: 'seal', doorId: event.doorId, owner: event.owner, ms: event.until - this.raceTime() });
    }
  }

  /** Cache les pouvoirs du départ : derrière des portes vides au hasard, selon la quantité choisie pour la salle. */
  private hidePowers(game: Game): void {
    this.hidden.clear();
    for (let floor = 1; floor <= game.config.floors; floor++) {
      const doors = game.layout.doorsByFloor[floor];
      const walls = doors.filter((d) => d.mechanic === 'wall');
      for (let i = powerSpotCount(doors.length, walls.length, this.density); i > 0; i--) this.hideOne(floor);
    }
  }

  /** Cache un pouvoir derrière une porte vide libre de l'étage (si possible pas `avoid`, la porte qu'on vient de vider). */
  private hideOne(floor: number, avoid?: string): void {
    const free = this.game!.layout.doorsByFloor[floor].filter((d) => d.mechanic === 'wall' && !this.hidden.has(d.id));
    const choices = free.length > 1 ? free.filter((d) => d.id !== avoid) : free;
    if (choices.length) this.hidden.add(choices[Math.floor(this.random() * choices.length)].id);
  }

  /** Pouvoir ramassé : il disparaît, puis réapparaît POWER_RESPAWN_MS plus tard derrière une autre porte vide du même étage. */
  private take(peer: Peer, doorId: string): void {
    this.hidden.delete(doorId);
    const floor = this.game!.doorsById.get(doorId)!.floor;
    this.respawns.push(this.clock.later(POWER_RESPAWN_MS, () => this.state === 'racing' && this.hideOne(floor, doorId)));
    this.grant(peer, doorId);
  }

  /** Tirage du pouvoir selon le classement (le dernier reçoit plutôt de quoi revenir, le premier de quoi gêner). */
  private grant(peer: Peer, doorId: string): void {
    const fighter = this.fighters.get(peer.id)!;
    const game = this.game!;
    const others = this.racing().filter((p) => p !== peer).map((p) => game.players.get(p.id)!.floor);
    const power = pickPower(standing(game.players.get(peer.id)!.floor, others), this.random());
    fighter.powers[power]++;
    peer.send({ t: 'gain', power, doorId });
  }

  private sendSelf(peer: Peer): void {
    const fighter = this.fighters.get(peer.id);
    const player = this.game?.players.get(peer.id);
    if (!fighter || !player) return;
    const now = this.raceTime();
    peer.send({
      t: 'self',
      seq: fighter.seq,
      floor: player.floor,
      shield: player.shield,
      powers: { ...fighter.powers },
      turboMs: Math.max(0, fighter.turboUntil - now),
      bootsMs: Math.max(0, fighter.bootsUntil - now),
      immuneMs: Math.max(0, fighter.immuneUntil - now),
    });
  }

  private broadcastState(peer: Peer): void {
    const fighter = this.fighters.get(peer.id);
    const player = this.game?.players.get(peer.id);
    if (!fighter || !player) return;
    const now = this.raceTime();
    this.broadcast({
      t: 'state',
      id: peer.id,
      shield: player.shield,
      turboMs: Math.max(0, fighter.turboUntil - now),
      bootsMs: Math.max(0, fighter.bootsUntil - now),
      immuneMs: Math.max(0, fighter.immuneUntil - now),
    });
  }

  private removeMine(id: number, notify = true): void {
    const mine = this.mines.get(id);
    if (!mine) return;
    mine.cancel();
    this.mines.delete(id);
    if (notify) this.broadcast({ t: 'mineGone', id });
  }

  /** Participants encore en course : connectés, pas encore arrivés au sommet. */
  private racing(): Peer[] {
    return this.peers.filter((p) => this.fighters.has(p.id) && this.game?.players.get(p.id)?.finishedAt === undefined);
  }

  /** Un joueur atteint le sommet : sa place est annoncée ; la première arrivée lance le délai de fin. */
  private arrive(peer: Peer, time: number): void {
    this.arrivals.push(peer.id);
    this.broadcast({ t: 'arrived', id: peer.id, rank: this.arrivals.length, time });
    if (this.arrivals.length === 1) this.cancelGrace = this.clock.later(FINISH_GRACE_MS, () => this.finish('time'));
    this.checkFinish();
  }

  /** Fin de partie : podium atteint, ou plus personne (ou plus qu'un joueur) pour disputer une place. */
  private checkFinish(): void {
    if (this.state !== 'countdown' && this.state !== 'racing') return;
    const stillRacing = this.racing().length;
    if (this.arrivals.length >= arrivalsToFinish(this.fighters.size)) this.finish('podium');
    else if (stillRacing <= 1) this.finish(this.arrivals.length === 0 ? 'forfeit' : 'podium');
  }

  /** Mines posées, réapparitions de pouvoirs, départ et délai de fin en attente. */
  private clearTimers(): void {
    this.cancelStart?.();
    this.cancelGrace?.();
    this.cancelStart = this.cancelGrace = null;
    for (const mine of this.mines.values()) mine.cancel();
    this.mines.clear();
    this.respawns.forEach((cancel) => cancel());
    this.respawns = [];
  }

  /** Classement final de tous les participants (ceux partis en cours de route en dernier). */
  private finish(reason: 'podium' | 'time' | 'forfeit'): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.clearTimers();
    const results = [...this.fighters].map(([id, fighter]) => {
      const player = this.game?.players.get(id);
      return {
        id,
        name: fighter.name,
        floor: player?.floor ?? 1,
        falls: player?.falls ?? 0,
        doorsTested: player?.doorsTested ?? 0,
        ...(player?.finishedAt !== undefined && { time: player.finishedAt }),
        ...(fighter.left && { left: true }),
      };
    });
    const ranking: PlayerResult[] = rankPlayers(results).map((r, i) => ({ ...r, rank: i + 1 }));
    this.broadcast({ t: 'finish', reason, ranking });
  }

  private broadcastRoom(): void {
    const players: RoomPlayer[] = this.peers.map((p) => ({ id: p.id, name: p.name }));
    const host = this.host?.id ?? '';
    for (const peer of this.peers) {
      peer.send({ t: 'room', code: this.code, level: this.level.id, powers: this.density, you: peer.id, host, max: MAX_PLAYERS, players });
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const peer of this.peers) peer.send(message);
  }

  private others(from: Peer, message: ServerMessage): void {
    for (const peer of this.peers) if (peer !== from) peer.send(message);
  }
}

/** Toutes les salles ouvertes, et la salle de chaque joueur. */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<Peer, Room>();
  private readonly creations: RateLimiter;
  private readonly joinFailures: RateLimiter;

  constructor(
    private readonly levels: Level[],
    private readonly clock: Clock = realClock,
    private readonly random: () => number = Math.random,
  ) {
    this.creations = new RateLimiter(LIMITS.roomsPerAccount.max, LIMITS.roomsPerAccount.windowMs, () => clock.now());
    this.joinFailures = new RateLimiter(LIMITS.joinFailuresPerIp.max, LIMITS.joinFailuresPerIp.windowMs, () => clock.now());
  }

  handle(peer: Peer, message: ClientMessage): void {
    const room = this.roomOf.get(peer);
    switch (message.t) {
      case 'create': {
        const level = this.levels.find((l) => l.id === message.level);
        if (!level) return peer.send({ t: 'error', message: 'Niveau inconnu : recharge la page pour mettre le jeu à jour.' });
        if (!this.creations.hit(peer.userId ?? peer.id)) return peer.send({ t: 'error', message: 'Trop de salles créées : patiente quelques minutes.' });
        this.leave(peer);
        const created = new Room(this.newCode(), level, message.powers, this.clock, randomSeed, this.random);
        this.rooms.set(created.code, created);
        this.enter(peer, created);
        return;
      }
      case 'join': {
        // Contre la recherche de codes au hasard : après quelques codes erronés, les essais sont bloqués un moment.
        const key = peer.ip ?? peer.userId ?? peer.id;
        if (this.joinFailures.blocked(key)) return peer.send({ t: 'error', message: 'Trop de codes incorrects : réessaie dans une minute.' });
        const target = this.rooms.get(normalizeRoomCode(message.code));
        if (!target) {
          this.joinFailures.hit(key);
          return peer.send({ t: 'error', message: 'Aucune salle avec ce code.' });
        }
        if (target === room) return;
        if (target.full) return peer.send({ t: 'error', message: 'Cette salle est déjà complète.' });
        if (!target.joinable) return peer.send({ t: 'error', message: 'La partie a déjà commencé : attends la fin de la course.' });
        const excluded = target.exclusionLeft(peer);
        if (excluded > 0) return peer.send({ t: 'error', message: `Tu as été exclu de cette salle : réessaie dans ${Math.ceil(excluded / 60000)} min.` });
        this.leave(peer);
        this.enter(peer, target);
        return;
      }
      case 'kick': {
        // Seul l'hôte exclut, jamais lui-même ; le joueur exclu quitte la salle (en pleine course : il est classé parti).
        const target = room?.peers.find((p) => p.id === message.id);
        if (!room || peer !== room.host || !target || target === peer) return;
        room.exclude(target);
        this.leave(target);
        target.send({ t: 'kicked' });
        return;
      }
      case 'leave':
        this.leave(peer);
        return;
      default:
        room?.handle(peer, message);
    }
  }

  /** Départ volontaire ou déconnexion. Une salle vide est supprimée. */
  leave(peer: Peer): void {
    const room = this.roomOf.get(peer);
    if (!room) return;
    this.roomOf.delete(peer);
    room.remove(peer);
    if (room.peers.length === 0) this.rooms.delete(room.code);
  }

  private enter(peer: Peer, room: Room): void {
    this.roomOf.set(peer, room);
    room.add(peer);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}

