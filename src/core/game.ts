import { generateLayout } from './layout';
import { doorFront, INTERACT_RANGE, type Vec3 } from './geometry';
import { getMechanic } from './mechanics/registry';
import { wall } from './mechanics/basic';
import { summitFloor, type Door, type GameEvent, type Layout, type PlayerState, type PyramidConfig } from './types';

/**
 * État et règles d'une partie, sans rendu ni réseau.
 * En V1 le navigateur l'appelle directement ; en V2 un serveur appellera exactement ces mêmes méthodes,
 * et un robot enverra les mêmes actions qu'un joueur humain.
 * Le temps (`now`, en ms de jeu) est toujours fourni par l'appelant.
 */
export class Game {
  readonly layout: Layout;
  readonly config: PyramidConfig;
  readonly players = new Map<string, PlayerState>();
  readonly doorsById = new Map<string, Door>();
  /** Révélations publiques en cours : doorId → fin. */
  readonly reveals = new Map<string, number>();
  winner?: string;

  constructor(config: PyramidConfig, seed: number) {
    this.config = config;
    this.layout = generateLayout(config, seed);
    for (const door of this.layout.doors) this.doorsById.set(door.id, door);
  }

  addPlayer(id: string): PlayerState {
    const player: PlayerState = {
      id,
      floor: 1,
      bestFloor: 1,
      knownPassages: new Set(),
      usedDoors: new Set(),
      tried: new Map(),
      falls: 0,
      doorsTested: 0,
    };
    this.players.set(id, player);
    return player;
  }

  /**
   * Un joueur interagit avec une porte. `position` (pieds du joueur) permet de valider la distance,
   * ce que fera le serveur en multijoueur.
   */
  interact(playerId: string, doorId: string, now: number, position?: Vec3): GameEvent[] {
    const player = this.players.get(playerId);
    const door = this.doorsById.get(doorId);
    if (!player || !door || player.finishedAt !== undefined) return [];
    if (door.floor !== player.floor) return [];
    if (position) {
      const front = doorFront(this.config, door);
      if (Math.hypot(front.x - position.x, front.z - position.z) > INTERACT_RANGE + 0.5) return [];
    }

    let mechanic = getMechanic(door.mechanic);
    if (mechanic.oncePerPlayer && player.usedDoors.has(door.id)) mechanic = wall;
    const outcome = mechanic.resolve({ door, layout: this.layout, player });
    const from = player.floor;
    const to = this.clampFloor(from, outcome.delta);
    player.doorsTested++;
    if (mechanic.oncePerPlayer) player.usedDoors.add(door.id);
    if (mechanic.rememberAsPassage && to > from) player.knownPassages.add(door.id);
    player.tried.set(door.id, to > from ? 'up' : to < from || outcome.fx !== 'wall' ? 'trap' : 'wall');

    const events: GameEvent[] = [
      {
        type: 'doorResult',
        playerId,
        doorId,
        mechanic: mechanic.id,
        fx: outcome.fx,
        from,
        to,
        hint: outcome.hint,
        message: outcome.message,
      },
    ];
    if (mechanic.revealPublicly && to > from) {
      const until = now + this.config.publicRevealMs;
      this.reveals.set(door.id, until);
      events.push({ type: 'publicReveal', doorId, until });
    }
    events.push(...this.moveTo(player, to, 'door', now));
    return events;
  }

  /** Le client signale l'étage où se trouve physiquement le joueur (chute d'une terrasse, trou…). */
  reportFloor(playerId: string, floor: number, now: number): GameEvent[] {
    const player = this.players.get(playerId);
    if (!player || player.finishedAt !== undefined || floor === player.floor) return [];
    // On ne monte jamais physiquement : seules les portes font monter.
    if (floor > player.floor) return [];
    return this.moveTo(player, floor, 'fall', now);
  }

  update(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    for (const [doorId, until] of this.reveals) {
      if (now >= until) {
        this.reveals.delete(doorId);
        events.push({ type: 'revealEnd', doorId });
      }
    }
    return events;
  }

  /** Borne une variation d'étage selon la configuration de la pyramide. */
  private clampFloor(from: number, delta: number): number {
    const c = this.config;
    if (delta < 0) return Math.max(1, from - Math.min(-delta, c.maxFloorsLost));
    if (delta === 1) return Math.min(summitFloor(c), from + 1);
    if (delta > 1) {
      const ceiling = c.floors - c.protectedTopFloors;
      return Math.max(from, Math.min(from + Math.min(delta, c.maxFloorsGained), ceiling));
    }
    return from;
  }

  private moveTo(player: PlayerState, to: number, cause: 'door' | 'fall', now: number): GameEvent[] {
    const from = player.floor;
    if (to === from) return [];
    player.floor = to;
    if (to < from) player.falls++;
    player.bestFloor = Math.max(player.bestFloor, to);
    const events: GameEvent[] = [{ type: 'floorChanged', playerId: player.id, from, to, cause }];
    if (to === summitFloor(this.config)) {
      player.finishedAt = now;
      this.winner ??= player.id;
      events.push({ type: 'victory', playerId: player.id, time: now });
    }
    return events;
  }
}
