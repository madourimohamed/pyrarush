import { describe, expect, it } from 'vitest';
import { doorFront, duelConfig, floorY, Game, landingPoint, mineSpotValid, MINE_ARM_MS, IMMUNITY_MS, SEAL_MS, type Level, type Vec3 } from '../src/core';
import { levels } from '../src/levels';
import { DUEL_COUNTDOWN_MS, type ServerMessage } from '../src/net/protocol';
import { Lobby, type Clock, type Peer } from './rooms';

/** Horloge manuelle : le temps n'avance que quand le test le décide. */
function manualClock() {
  let now = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = {
    now: () => now,
    later: (ms, fn) => {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => (timers = timers.filter((t) => t !== timer));
    },
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    due.forEach((t) => t.fn());
  };
  return { clock, advance };
}

function peer(id: string): Peer & { inbox: ServerMessage[]; last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined } {
  const inbox: ServerMessage[] = [];
  return {
    id,
    name: id,
    inbox,
    send: (m) => inbox.push(m),
    last: <T extends ServerMessage['t']>(t: T) => inbox.filter((m) => m.t === t).pop() as Extract<ServerMessage, { t: T }> | undefined,
  };
}

function duel(level: Level = levels[0]) {
  const { clock, advance } = manualClock();
  const lobby = new Lobby(levels, clock, () => 0.5);
  const a = peer('a');
  const b = peer('b');
  lobby.handle(a, { t: 'create', level: level.number, name: 'Alice' });
  const code = a.last('room')!.code;
  lobby.handle(b, { t: 'join', code: code.toLowerCase(), name: 'Bob' });
  return { lobby, a, b, code, advance };
}

describe('duel : salles', () => {
  it('crée une salle avec un code, le second joueur la rejoint et le départ est donné aux deux avec la même graine', () => {
    const { a, b, code } = duel();
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    expect(a.last('room')!.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    const startA = a.last('start')!;
    expect(startA).toEqual(b.last('start'));
    expect(startA.inMs).toBe(DUEL_COUNTDOWN_MS);
  });

  it('refuse un code inconnu et une salle complète', () => {
    const { lobby, code } = duel();
    const c = peer('c');
    lobby.handle(c, { t: 'join', code: 'ZZZZ', name: 'C' });
    expect(c.last('error')?.message).toMatch(/Aucune salle/);
    lobby.handle(c, { t: 'join', code, name: 'C' });
    expect(c.last('error')?.message).toMatch(/complète/);
  });

  it('ignore les actions pendant le compte à rebours, relaie les passages et désigne le premier au sommet', () => {
    const { lobby, a, b, advance } = duel();
    const level = levels[0];
    const seed = a.last('start')!.seed;
    // Le serveur et les clients génèrent la même pyramide à partir de la graine.
    const mirror = new Game(duelConfig(level.config), seed);
    const passage = (floor: number) => mirror.layout.doorsByFloor[floor].find((d) => d.mechanic === 'passage')!;
    const front = (floor: number) => {
      const p = doorFront(level.config, passage(floor));
      return [p.x, p.y, p.z] as [number, number, number];
    };

    lobby.handle(a, { t: 'interact', seq: 1, doorId: passage(1).id, p: front(1) });
    expect(b.last('floor')).toBeUndefined();
    advance(DUEL_COUNTDOWN_MS);

    for (let f = 1; f <= level.config.floors; f++) lobby.handle(a, { t: 'interact', seq: 1, doorId: passage(f).id, p: front(f) });
    expect(b.last('floor')).toEqual({ t: 'floor', id: 'a', floor: level.config.floors + 1 });
    expect(b.inbox.some((m) => m.t === 'reveal' && m.id === 'a')).toBe(true);
    const finish = b.last('finish')!;
    expect(finish.winner).toBe('a');
    expect(finish.reason).toBe('summit');
    expect(finish.results.find((r) => r.id === 'a')!.time).toBeGreaterThanOrEqual(0);
  });

  it('une porte trop loin du joueur est refusée (anti-triche)', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const mirror = new Game(duelConfig(levels[0].config), a.last('start')!.seed);
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    lobby.handle(a, { t: 'interact', seq: 1, doorId: door.id, p: [500, 0, 500] });
    expect(b.last('floor')).toBeUndefined();
  });

  it('un départ pendant la course donne la victoire par forfait', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    lobby.handle(b, { t: 'leave' });
    expect(a.last('finish')).toMatchObject({ winner: 'a', reason: 'forfeit' });
  });

  it('la revanche ne repart que quand les deux joueurs la demandent, avec une nouvelle course', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const mirror = new Game(duelConfig(levels[0].config), a.last('start')!.seed);
    for (let f = 1; f <= levels[0].config.floors; f++) {
      const door = mirror.layout.doorsByFloor[f].find((d) => d.mechanic === 'passage')!;
      const p = doorFront(levels[0].config, door);
      lobby.handle(b, { t: 'interact', seq: 1, doorId: door.id, p: [p.x, p.y, p.z] });
    }
    expect(a.last('finish')?.winner).toBe('b');
    const starts = () => a.inbox.filter((m) => m.t === 'start').length;
    lobby.handle(a, { t: 'rematch' });
    expect(b.last('rematch')).toEqual({ t: 'rematch', id: 'a' });
    expect(starts()).toBe(1);
    lobby.handle(b, { t: 'rematch' });
    expect(starts()).toBe(2);
  });

  it('une porte à pouvoir donne un pouvoir à celui qui l’ouvre, et le serveur tient la réserve', () => {
    const { lobby, a, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const mirror = new Game(duelConfig(levels[0].config), a.last('start')!.seed);
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'powerDoor')!;
    const p = doorFront(levels[0].config, door);
    lobby.handle(a, { t: 'interact', seq: 7, doorId: door.id, p: [p.x, p.y, p.z] });
    const gain = a.last('gain')!;
    expect(gain.doorId).toBe(door.id);
    const self = a.last('self')!;
    expect(self.seq).toBe(7);
    expect(self.powers[gain.power]).toBe(1);
  });

  it('un pouvoir que l’on ne possède pas est refusé ; un pouvoir inutilisable n’est pas consommé', () => {
    const { lobby, a, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    lobby.handle(a, { t: 'power', seq: 1, power: 'turbo', p: [0, 0, 0] });
    expect(a.last('self')!.turboMs).toBe(0);
    give(lobby, a, 'seal');
    lobby.handle(a, { t: 'power', seq: 2, power: 'seal', p: [0, 0, 0] }); // aucune porte franchie
    expect(a.last('self')!.powers.seal).toBe(1);
  });

  it('turbo et bouclier sont visibles par l’adversaire ; un second bouclier n’est pas consommé', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    give(lobby, a, 'turbo');
    give(lobby, a, 'shield');
    give(lobby, a, 'shield');
    lobby.handle(a, { t: 'power', seq: 1, power: 'turbo', p: [0, 0, 0] });
    expect(b.last('state')).toMatchObject({ id: 'a', turboMs: 10000 });
    lobby.handle(a, { t: 'power', seq: 2, power: 'shield', p: [0, 0, 0] });
    lobby.handle(a, { t: 'power', seq: 3, power: 'shield', p: [0, 0, 0] });
    expect(b.last('state')).toMatchObject({ id: 'a', shield: true });
    expect(a.last('self')!.powers.shield).toBe(1);
  });

  it('une mine armée explose sous l’adversaire : il perd un étage, puis il est immunisé ; le bouclier l’absorbe', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const config = duelConfig(levels[0].config);
    const mirror = new Game(config, a.last('start')!.seed);
    // b monte à l'étage 2 ; a y pose des mines au milieu de la terrasse.
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    const front = doorFront(config, door);
    lobby.handle(b, { t: 'interact', seq: 1, doorId: door.id, p: [front.x, front.y, front.z] });
    const spot = findMineSpot(mirror, 2);
    const at: [number, number, number] = [spot.x, spot.y, spot.z];
    give(lobby, a, 'mine');
    give(lobby, a, 'mine');
    lobby.handle(a, { t: 'pos', p: at, ry: 0 });
    lobby.handle(a, { t: 'power', seq: 1, power: 'mine', p: at });
    expect(b.last('mine')).toMatchObject({ owner: 'a' });
    const walk = (dx: number) => {
      lobby.handle(b, { t: 'pos', p: [spot.x - dx, spot.y, spot.z - dx], ry: 0 });
      lobby.handle(b, { t: 'pos', p: [spot.x + dx, spot.y, spot.z + dx], ry: 0 });
    };
    walk(0.5); // pas encore armée
    expect(b.last('boom')).toBeUndefined();
    advance(MINE_ARM_MS);
    walk(0.5);
    expect(b.last('boom')).toMatchObject({ target: 'b', shielded: false, from: 2, to: 1 });
    expect(b.last('self')).toMatchObject({ floor: 1, immuneMs: IMMUNITY_MS });
    expect(a.last('floor')).toEqual({ t: 'floor', id: 'b', floor: 1 });
    // Une mine ne se déclenche jamais sous son propriétaire.
    lobby.handle(a, { t: 'power', seq: 2, power: 'mine', p: at });
    advance(MINE_ARM_MS);
    lobby.handle(a, { t: 'pos', p: [spot.x + 0.4, spot.y, spot.z], ry: 0 });
    expect(a.inbox.filter((m) => m.t === 'boom')).toHaveLength(1);
  });

  it('une mine ne se pose pas devant une porte (pouvoir conservé)', () => {
    const { lobby, a, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const config = duelConfig(levels[0].config);
    const mirror = new Game(config, a.last('start')!.seed);
    const p = doorFront(config, mirror.layout.doorsByFloor[1][0]);
    give(lobby, a, 'mine');
    lobby.handle(a, { t: 'power', seq: 1, power: 'mine', p: [p.x, p.y, p.z] });
    expect(a.last('self')!.powers.mine).toBe(1);
    expect(a.last('mine')).toBeUndefined();
  });

  it('le sceau est annoncé aux deux joueurs et bloque la porte pour l’adversaire', () => {
    const { lobby, a, b, advance } = duel();
    advance(DUEL_COUNTDOWN_MS);
    const config = duelConfig(levels[0].config);
    const mirror = new Game(config, a.last('start')!.seed);
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    const front = doorFront(config, door);
    const p: [number, number, number] = [front.x, front.y, front.z];
    lobby.handle(a, { t: 'interact', seq: 1, doorId: door.id, p });
    give(lobby, a, 'seal');
    lobby.handle(a, { t: 'power', seq: 2, power: 'seal', p });
    expect(b.last('seal')).toEqual({ t: 'seal', doorId: door.id, owner: 'a', ms: SEAL_MS });
    lobby.handle(b, { t: 'interact', seq: 1, doorId: door.id, p });
    expect(b.last('self')!.floor).toBe(1);
    advance(SEAL_MS);
    lobby.handle(b, { t: 'interact', seq: 2, doorId: door.id, p });
    expect(b.last('self')!.floor).toBe(2);
  });

});

/** Raccourci de test : ajoute directement un pouvoir à la réserve d'un joueur (normalement gagné derrière une porte à pouvoir). */
function give(lobby: Lobby, who: Peer, power: 'turbo' | 'shield' | 'seal' | 'mine') {
  const room = [...lobby.rooms.values()][0] as unknown as { fighters: Map<string, { powers: Record<string, number> }> };
  room.fighters.get(who.id)!.powers[power]++;
}

/** Un point de la terrasse `floor` où l'on peut poser une mine. */
function findMineSpot(game: Game, floor: number): Vec3 {
  for (let side = 0; side < 4; side++) {
    const base = landingPoint(game.config, floor, side, 0);
    for (const dx of [0, 1.5, -1.5, 3, -3, 4.5, -4.5]) {
      const p = { x: base.x + (side % 2 === 0 ? dx : 0), y: floorY(floor), z: base.z + (side % 2 === 0 ? 0 : dx) };
      if (mineSpotValid(game.layout, p)) return p;
    }
  }
  throw new Error('aucun emplacement de mine');
}

