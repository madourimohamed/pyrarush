import { describe, expect, it } from 'vitest';
import { doorFront, Game, type Level } from '../src/core';
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
    const mirror = new Game(level.config, seed);
    const passage = (floor: number) => mirror.layout.doorsByFloor[floor].find((d) => d.mechanic === 'passage')!;
    const front = (floor: number) => {
      const p = doorFront(level.config, passage(floor));
      return [p.x, p.y, p.z] as [number, number, number];
    };

    lobby.handle(a, { t: 'interact', doorId: passage(1).id, p: front(1) });
    expect(b.last('floor')).toBeUndefined();
    advance(DUEL_COUNTDOWN_MS);

    for (let f = 1; f <= level.config.floors; f++) lobby.handle(a, { t: 'interact', doorId: passage(f).id, p: front(f) });
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
    const mirror = new Game(levels[0].config, a.last('start')!.seed);
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    lobby.handle(a, { t: 'interact', doorId: door.id, p: [500, 0, 500] });
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
    const mirror = new Game(levels[0].config, a.last('start')!.seed);
    for (let f = 1; f <= levels[0].config.floors; f++) {
      const door = mirror.layout.doorsByFloor[f].find((d) => d.mechanic === 'passage')!;
      const p = doorFront(levels[0].config, door);
      lobby.handle(b, { t: 'interact', doorId: door.id, p: [p.x, p.y, p.z] });
    }
    expect(a.last('finish')?.winner).toBe('b');
    const starts = () => a.inbox.filter((m) => m.t === 'start').length;
    lobby.handle(a, { t: 'rematch' });
    expect(b.last('rematch')).toEqual({ t: 'rematch', id: 'a' });
    expect(starts()).toBe(1);
    lobby.handle(b, { t: 'rematch' });
    expect(starts()).toBe(2);
  });

  it('les bonus ne sont acceptés en duel qu’à partir du niveau 2, et jamais le Sablier', async () => {
    const { duelBonusAllowed } = await import('../src/net/protocol');
    expect(duelBonusAllowed(1, 'shield')).toBe(false);
    expect(duelBonusAllowed(2, 'shield')).toBe(true);
    expect(duelBonusAllowed(3, 'hourglass')).toBe(false);
  });
});
