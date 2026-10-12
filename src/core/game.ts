import { generateLayout } from './layout';
import { doorFront, INTERACT_RANGE, type Vec3 } from './geometry';
import { getMechanic } from './mechanics/registry';
import { wall } from './mechanics/basic';
import { SEAL_COOLDOWN_MS, SEAL_MS, SEAL_WINDOW_MS } from './multiplayer';
import { summitFloor, BONUS_EYE_MS, BONUS_HOURGLASS_MS, type BonusId, type Door, type GameEvent, type Layout, type PlayerState, type PyramidConfig } from './types';

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
  /**
   * Duel : portes scellées. `until` = fin du blocage ; `rest` = fin de la période pendant laquelle
   * la porte ne peut pas être rescellée (l'adversaire a toujours une fenêtre pour passer).
   */
  readonly seals = new Map<string, { owner: string; until: number; rest: number; active: boolean }>();
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
      shield: false,
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
    const seal = this.seals.get(door.id);
    if (seal?.active && seal.owner !== playerId && now < seal.until) return [{ type: 'doorSealed', playerId, doorId }];
    if (position) {
      const front = doorFront(this.config, door);
      if (Math.hypot(front.x - position.x, front.z - position.z) > INTERACT_RANGE + 0.5) return [];
    }

    let mechanic = getMechanic(door.mechanic);
    if (mechanic.oncePerPlayer && player.usedDoors.has(door.id)) mechanic = wall;
    const outcome = mechanic.resolve({ door, layout: this.layout, player });
    const from = player.floor;
    let to = this.clampFloor(from, outcome.delta);
    const shielded = to < from && player.shield;
    if (shielded) {
      player.shield = false;
      to = from;
    }
    player.doorsTested++;
    if (mechanic.oncePerPlayer) player.usedDoors.add(door.id);
    if (mechanic.rememberAsPassage && to > from) {
      player.knownPassages.add(door.id);
      player.lastPassage = { doorId: door.id, at: now };
    }
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
    if (shielded) events.push({ type: 'shielded', playerId, cause: 'door', floor: from });
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
    // Étage entier, au moins 1 ; on ne monte jamais physiquement : seules les portes font monter.
    if (!Number.isInteger(floor) || floor < 1 || floor > player.floor) return [];
    if (player.shield) {
      player.shield = false;
      return [{ type: 'shielded', playerId, cause: 'fall', floor: player.floor }];
    }
    return this.moveTo(player, floor, 'fall', now);
  }

  /** Utilise un bonus (gagné dans un coffre). Renvoie les événements correspondants, ou rien si sans effet. */
  useBonus(playerId: string, bonus: BonusId, now: number): GameEvent[] {
    const player = this.players.get(playerId);
    if (!player || player.finishedAt !== undefined) return [];
    switch (bonus) {
      case 'eye': {
        const doors = this.layout.doorsByFloor[player.floor] ?? [];
        const passages = doors.filter((d) => d.mechanic === 'passage');
        const target = passages.find((d) => !player.knownPassages.has(d.id)) ?? passages[0];
        if (!target) return [];
        return [
          { type: 'bonusUsed', playerId, bonus },
          { type: 'privateReveal', playerId, doorId: target.id, until: now + BONUS_EYE_MS },
        ];
      }
      case 'shield':
        if (player.shield) return [];
        player.shield = true;
        return [{ type: 'bonusUsed', playerId, bonus }];
      case 'hourglass':
        return [{ type: 'bonusUsed', playerId, bonus, timeBonusMs: BONUS_HOURGLASS_MS }];
    }
  }

  update(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    for (const [doorId, until] of this.reveals) {
      if (now >= until) {
        this.reveals.delete(doorId);
        events.push({ type: 'revealEnd', doorId });
      }
    }
    for (const [doorId, seal] of this.seals) {
      if (seal.active && now >= seal.until) {
        seal.active = false;
        events.push({ type: 'unsealed', doorId });
      }
      if (!seal.active && now >= seal.rest) this.seals.delete(doorId);
    }
    return events;
  }

  /**
   * Duel, Sceau magique : bloque derrière soi la dernière bonne porte franchie (dans les SEAL_WINDOW_MS qui suivent).
   * Refusé (rien renvoyé) si trop tard, si la porte est déjà scellée ou au repos, ou si le joueur a déjà un sceau actif.
   */
  sealDoor(playerId: string, now: number): GameEvent[] {
    const player = this.players.get(playerId);
    const last = player?.lastPassage;
    if (!player || player.finishedAt !== undefined || !last || now - last.at > SEAL_WINDOW_MS) return [];
    if (this.seals.has(last.doorId)) return [];
    if ([...this.seals.values()].some((s) => s.active && s.owner === playerId)) return [];
    return this.applySeal(last.doorId, playerId, now + SEAL_MS);
  }

  /** Pose un sceau décidé ailleurs (le navigateur recopie ceux annoncés par le serveur). */
  applySeal(doorId: string, owner: string, until: number): GameEvent[] {
    if (!this.doorsById.has(doorId)) return [];
    this.seals.set(doorId, { owner, until, rest: until + SEAL_COOLDOWN_MS, active: true });
    return [{ type: 'sealed', doorId, owner, until }];
  }

  /**
   * Duel : un joueur est touché par une attaque (mine). Le bouclier l'absorbe ; sinon le joueur est projeté
   * et perd au plus un étage (au premier étage, il est seulement repoussé).
   */
  knockDown(playerId: string, now: number): GameEvent[] {
    const player = this.players.get(playerId);
    if (!player || player.finishedAt !== undefined) return [];
    if (player.shield) {
      player.shield = false;
      return [{ type: 'shielded', playerId, cause: 'attack', floor: player.floor }];
    }
    const from = player.floor;
    const to = Math.max(1, from - 1);
    return [{ type: 'knocked', playerId, from, to }, ...this.moveTo(player, to, 'attack', now)];
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

  private moveTo(player: PlayerState, to: number, cause: 'door' | 'fall' | 'attack', now: number): GameEvent[] {
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
