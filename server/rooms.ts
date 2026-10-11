import {
  duelConfig,
  emptyReserve,
  Game,
  IMMUNITY_MS,
  mineSpotValid,
  mineTriggered,
  MINE_ARM_MS,
  MINE_LIFETIME_MS,
  MINE_MAX_ACTIVE,
  pickPower,
  randomSeed,
  standing,
  TURBO_MS,
  type GameEvent,
  type Level,
  type PowerId,
  type PowerReserve,
  type Vec3,
} from '../src/core';
import {
  DUEL_COUNTDOWN_MS,
  DUEL_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ClientMessage,
  type DuelResult,
  type RoomPlayer,
  type ServerMessage,
  type Vec3Tuple,
} from '../src/net/protocol';

/** Un joueur connecté (une connexion WebSocket, ou un faux joueur dans les tests). */
export interface Peer {
  readonly id: string;
  name: string;
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

/** État de duel d'un joueur, tenu par le serveur (fait foi). */
interface Fighter {
  powers: PowerReserve;
  turboUntil: number;
  immuneUntil: number;
  /** Dernière position reçue (pieds), pour les mines. */
  pos: Vec3 | null;
  /** Dernière action traitée (renvoyée dans `self`). */
  seq: number;
}

interface Mine {
  id: number;
  owner: string;
  p: Vec3;
  armedAt: number;
  cancel: () => void;
}

/**
 * Une salle de duel : deux joueurs, une pyramide, une course. Le serveur rejoue les actions de chacun
 * sur sa propre partie (le même moteur que le navigateur) et fait autorité : pouvoirs, mines, sceaux, coups, vainqueur.
 */
export class Room {
  readonly peers: Peer[] = [];
  state: RoomState = 'waiting';
  private game: Game | null = null;
  private startAt = 0;
  private rematch = new Set<string>();
  private cancelStart: (() => void) | null = null;
  private fighters = new Map<string, Fighter>();
  private mines = new Map<number, Mine>();
  private nextMine = 1;

  constructor(
    readonly code: string,
    readonly level: Level,
    private readonly clock: Clock,
    private readonly seeds: () => number = randomSeed,
    private readonly random: () => number = Math.random,
  ) {}

  get full(): boolean {
    return this.peers.length >= DUEL_PLAYERS;
  }

  add(peer: Peer): void {
    this.peers.push(peer);
    this.broadcastRoom();
    if (this.full) this.start();
  }

  remove(peer: Peer): void {
    const index = this.peers.indexOf(peer);
    if (index < 0) return;
    this.peers.splice(index, 1);
    this.rematch.delete(peer.id);
    if ((this.state === 'countdown' || this.state === 'racing') && this.peers.length > 0) {
      this.finish(this.peers[0].id, 'forfeit', [...this.peers, peer]);
    } else if (this.state !== 'waiting') {
      this.state = 'waiting';
    }
    this.cancelStart?.();
    this.broadcastRoom();
  }

  handle(peer: Peer, message: ClientMessage): void {
    const game = this.game;
    const fighter = this.fighters.get(peer.id);
    if (game && this.state === 'racing') this.applyGlobal(game.update(this.raceTime()));
    switch (message.t) {
      case 'pos': {
        if (this.state !== 'racing' && this.state !== 'countdown') return;
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
      case 'rematch':
        if (this.state !== 'finished') return;
        this.rematch.add(peer.id);
        this.others(peer, { t: 'rematch', id: peer.id });
        if (this.full && this.peers.every((p) => this.rematch.has(p.id))) this.start();
        return;
      default:
        return;
    }
  }

  private start(): void {
    this.rematch.clear();
    this.clearMines();
    const seed = this.seeds();
    this.game = new Game(duelConfig(this.level.config), seed);
    this.fighters.clear();
    for (const peer of this.peers) {
      this.game.addPlayer(peer.id);
      this.fighters.set(peer.id, { powers: emptyReserve(), turboUntil: 0, immuneUntil: 0, pos: null, seq: 0 });
    }
    this.state = 'countdown';
    this.startAt = this.clock.now() + DUEL_COUNTDOWN_MS;
    this.broadcast({ t: 'start', seed, level: this.level.number, inMs: DUEL_COUNTDOWN_MS });
    this.cancelStart?.();
    this.cancelStart = this.clock.later(DUEL_COUNTDOWN_MS, () => {
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
    for (const mine of this.mines.values()) {
      if (mine.owner === peer.id || now < mine.armedAt || !mineTriggered(mine.p, from, to)) continue;
      this.removeMine(mine.id, false);
      const before = this.game!.players.get(peer.id)!.floor;
      const immune = now < fighter.immuneUntil;
      const events = immune ? [] : this.game!.knockDown(peer.id, now);
      const shielded = events.some((e) => e.type === 'shielded');
      const after = this.game!.players.get(peer.id)!.floor;
      if (!immune && !shielded) fighter.immuneUntil = now + IMMUNITY_MS;
      this.broadcast({ t: 'boom', mine: mine.id, target: peer.id, shielded: shielded || immune, from: before, to: after });
      this.apply(peer, events);
      this.sendSelf(peer);
      this.broadcastState(peer);
      return;
    }
  }

  /** Ce que l'adversaire doit savoir des événements d'un joueur ; le pouvoir des portes à pouvoir ; la victoire. */
  private apply(peer: Peer, events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'publicReveal') {
        this.others(peer, { t: 'reveal', id: peer.id, doorId: event.doorId, ms: event.until - this.raceTime() });
      } else if (event.type === 'floorChanged') {
        this.others(peer, { t: 'floor', id: peer.id, floor: event.to });
      } else if (event.type === 'doorResult' && event.fx === 'power') {
        this.grant(peer, event.doorId);
      } else if (event.type === 'shielded') {
        this.broadcastState(peer);
      } else if (event.type === 'victory') {
        this.finish(peer.id, 'summit', this.peers);
      }
    }
  }

  /** Événements qui concernent tout le monde (sceaux posés et levés). */
  private applyGlobal(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'sealed') this.broadcast({ t: 'seal', doorId: event.doorId, owner: event.owner, ms: event.until - this.raceTime() });
    }
  }

  /** Porte à pouvoir : tirage selon le classement (le joueur en retard reçoit plutôt de quoi revenir). */
  private grant(peer: Peer, doorId: string): void {
    const fighter = this.fighters.get(peer.id)!;
    const me = this.game!.players.get(peer.id)!.floor;
    const rival = this.peers.find((p) => p !== peer);
    const rivalFloor = rival ? (this.game!.players.get(rival.id)?.floor ?? me) : me;
    const power = pickPower(standing(me, rivalFloor), this.random());
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
      immuneMs: Math.max(0, fighter.immuneUntil - now),
    });
  }

  private broadcastState(peer: Peer): void {
    const fighter = this.fighters.get(peer.id);
    const player = this.game?.players.get(peer.id);
    if (!fighter || !player) return;
    const now = this.raceTime();
    this.broadcast({ t: 'state', id: peer.id, shield: player.shield, turboMs: Math.max(0, fighter.turboUntil - now), immuneMs: Math.max(0, fighter.immuneUntil - now) });
  }

  private removeMine(id: number, notify = true): void {
    const mine = this.mines.get(id);
    if (!mine) return;
    mine.cancel();
    this.mines.delete(id);
    if (notify) this.broadcast({ t: 'mineGone', id });
  }

  private clearMines(): void {
    for (const mine of this.mines.values()) mine.cancel();
    this.mines.clear();
  }

  private finish(winner: string, reason: 'summit' | 'forfeit', peers: Peer[]): void {
    this.state = 'finished';
    this.clearMines();
    const results: DuelResult[] = peers.map((p) => {
      const player = this.game?.players.get(p.id);
      return {
        id: p.id,
        name: p.name,
        floor: player?.floor ?? 1,
        falls: player?.falls ?? 0,
        doorsTested: player?.doorsTested ?? 0,
        ...(player?.finishedAt !== undefined && { time: player.finishedAt }),
      };
    });
    this.broadcast({ t: 'finish', winner, reason, results });
  }

  private broadcastRoom(): void {
    const players: RoomPlayer[] = this.peers.map((p) => ({ id: p.id, name: p.name }));
    for (const peer of this.peers) peer.send({ t: 'room', code: this.code, level: this.level.number, you: peer.id, players });
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

  constructor(
    private readonly levels: Level[],
    private readonly clock: Clock = realClock,
    private readonly random: () => number = Math.random,
  ) {}

  handle(peer: Peer, message: ClientMessage): void {
    const room = this.roomOf.get(peer);
    switch (message.t) {
      case 'create': {
        const level = this.levels[Math.round(message.level) - 1];
        if (!level) return peer.send({ t: 'error', message: 'Niveau inconnu.' });
        this.leave(peer);
        peer.name = cleanName(message.name);
        const created = new Room(this.newCode(), level, this.clock, randomSeed, this.random);
        this.rooms.set(created.code, created);
        this.enter(peer, created);
        return;
      }
      case 'join': {
        const target = this.rooms.get(normalizeRoomCode(message.code));
        if (!target) return peer.send({ t: 'error', message: 'Aucune salle avec ce code.' });
        if (target === room) return;
        if (target.full) return peer.send({ t: 'error', message: 'Cette salle est déjà complète.' });
        this.leave(peer);
        peer.name = cleanName(message.name);
        this.enter(peer, target);
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

const cleanName = (name: string) => name.replace(/[<>]/g, '').trim().slice(0, 16) || 'Explorateur';
