import { Game, randomSeed, type GameEvent, type Level } from '../src/core';
import {
  DUEL_COUNTDOWN_MS,
  DUEL_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  duelBonusAllowed,
  normalizeRoomCode,
  type ClientMessage,
  type DuelResult,
  type RoomPlayer,
  type ServerMessage,
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

/**
 * Une salle de duel : deux joueurs, une pyramide, une course. Le serveur rejoue les actions de chacun
 * sur sa propre partie (le même moteur que le navigateur) : c'est elle qui fait foi pour la victoire.
 */
export class Room {
  readonly peers: Peer[] = [];
  state: RoomState = 'waiting';
  private game: Game | null = null;
  private startAt = 0;
  private rematch = new Set<string>();
  private cancelStart: (() => void) | null = null;

  constructor(
    readonly code: string,
    readonly level: Level,
    private readonly clock: Clock,
    private readonly seeds: () => number = randomSeed,
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
    switch (message.t) {
      case 'pos':
        if (this.state === 'racing' || this.state === 'countdown') this.others(peer, { t: 'pos', id: peer.id, p: message.p, ry: message.ry });
        return;
      case 'interact': {
        if (!game || this.state !== 'racing') return;
        const [x, y, z] = message.p;
        this.apply(peer, game.interact(peer.id, message.doorId, this.raceTime(), { x, y, z }));
        return;
      }
      case 'floor':
        if (game && this.state === 'racing') this.apply(peer, game.reportFloor(peer.id, message.floor, this.raceTime()));
        return;
      case 'bonus':
        if (game && this.state === 'racing' && duelBonusAllowed(this.level.number, message.bonus)) {
          this.apply(peer, game.useBonus(peer.id, message.bonus, this.raceTime()));
        }
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
    const seed = this.seeds();
    this.game = new Game(this.level.config, seed);
    for (const peer of this.peers) this.game.addPlayer(peer.id);
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

  /** Ce que l'adversaire doit savoir des événements d'un joueur ; la victoire termine la course. */
  private apply(peer: Peer, events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'publicReveal') {
        this.others(peer, { t: 'reveal', id: peer.id, doorId: event.doorId, ms: event.until - this.raceTime() });
      } else if (event.type === 'floorChanged') {
        this.others(peer, { t: 'floor', id: peer.id, floor: event.to });
      } else if (event.type === 'victory') {
        this.finish(peer.id, 'summit', this.peers);
      }
    }
  }

  private finish(winner: string, reason: 'summit' | 'forfeit', peers: Peer[]): void {
    this.state = 'finished';
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
        const created = new Room(this.newCode(), level, this.clock);
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
