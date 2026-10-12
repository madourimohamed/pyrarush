import { describe, expect, it } from 'vitest';
import { BOOTS_MS, CLOUD_MS, TRAP_SCENE_MULTI_MS, doorFront, floorY, Game, POWER_RESPAWN_MS, landingPoint, mineSpotValid, MINE_ARM_MS, IMMUNITY_MS, SEAL_MS, type Level, type PowerId, type Vec3 } from '../src/core';
import { levels } from '../src/levels';
import { COUNTDOWN_MS, FINISH_GRACE_MS, MAX_PLAYERS, type ServerMessage } from '../src/net/protocol';
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

const NAMES = ['Alice', 'Bob', 'Chloé', 'Dina', 'Eli', 'Fanny', 'Gus', 'Hugo'];

/**
 * Une salle de `count` joueurs (a, b, c…) : a la crée, les autres la rejoignent, puis a lance la partie
 * (si la salle n'est pas déjà partie toute seule en étant pleine).
 */
function room(count = 2, { launch = true, level = levels[0] as Level } = {}) {
  const { clock, advance } = manualClock();
  const lobby = new Lobby(levels, clock, () => 0.5);
  const peers = NAMES.slice(0, count).map((name) => peer(name[0].toLowerCase()));
  const [a, b, c, d] = peers;
  lobby.handle(a, { t: 'create', level: level.number, name: NAMES[0], powers: 'many' });
  const code = a.last('room')!.code;
  peers.slice(1).forEach((p, i) => lobby.handle(p, { t: 'join', code: code.toLowerCase(), name: NAMES[i + 1] }));
  if (launch && !a.last('start')) lobby.handle(a, { t: 'launch' });
  return { lobby, peers, a, b, c, d, code, advance };
}

/** Fait monter un joueur au sommet par les bonnes portes (avec la même graine que le serveur). */
function climbAll(lobby: Lobby, who: Peer & { last: ReturnType<typeof peer>['last'] }, floors = levels[0].config.floors) {
  const mirror = new Game(levels[0].config, who.last('start')!.seed);
  for (let f = 1; f <= floors; f++) {
    const door = mirror.layout.doorsByFloor[f].find((x) => x.mechanic === 'passage')!;
    const p = doorFront(levels[0].config, door);
    lobby.handle(who, { t: 'interact', seq: f, doorId: door.id, p: [p.x, p.y, p.z] });
  }
}

describe('multijoueur : salles', () => {
  it('crée une salle avec un code que les autres rejoignent ; à deux, on attend le lancement', () => {
    const { a, b, code } = room(2, { launch: false });
    expect(b.last('room')).toMatchObject({ code, host: 'a', you: 'b' });
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    expect(a.last('room')).toMatchObject({ host: 'a', max: MAX_PLAYERS });
    expect(a.last('room')!.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(a.last('start')).toBeUndefined(); // à deux, on attend le lancement
  });

  it('seul le créateur lance, à partir de deux joueurs ; une salle pleine part toute seule', () => {
    const { lobby, a, b } = room(2, { launch: false });
    lobby.handle(b, { t: 'launch' });
    expect(a.last('start')).toBeUndefined();
    lobby.handle(a, { t: 'launch' });
    const start = a.last('start')!;
    expect(start).toEqual(b.last('start'));
    expect(start).toMatchObject({ inMs: COUNTDOWN_MS, order: ['a', 'b'] });

    const full = room(MAX_PLAYERS, { launch: false });
    expect(full.a.last('start')?.order).toHaveLength(MAX_PLAYERS);

    const alone = room(1, { launch: false });
    alone.lobby.handle(alone.a, { t: 'launch' });
    expect(alone.a.last('start')).toBeUndefined();
  });

  it('refuse un code inconnu, une salle complète et une partie déjà commencée', () => {
    const { lobby, code } = room(MAX_PLAYERS);
    const extra = peer('x');
    lobby.handle(extra, { t: 'join', code: 'ZZZZ', name: 'X' });
    expect(extra.last('error')?.message).toMatch(/Aucune salle/);
    lobby.handle(extra, { t: 'join', code, name: 'X' });
    expect(extra.last('error')?.message).toMatch(/complète/);
    const started = room(2);
    started.lobby.handle(extra, { t: 'join', code: started.code, name: 'X' });
    expect(extra.last('error')?.message).toMatch(/déjà commencé/);
  });

  it('ignore les actions pendant le compte à rebours, relaie les passages et désigne le premier au sommet', () => {
    const { lobby, a, b, advance } = room();
    const level = levels[0];
    const seed = a.last('start')!.seed;
    // Le serveur et les clients génèrent la même pyramide à partir de la graine.
    const mirror = new Game(level.config, seed);
    const passage = (floor: number) => mirror.layout.doorsByFloor[floor].find((d) => d.mechanic === 'passage')!;
    const front = (floor: number) => {
      const p = doorFront(level.config, passage(floor));
      return [p.x, p.y, p.z] as [number, number, number];
    };

    lobby.handle(a, { t: 'interact', seq: 1, doorId: passage(1).id, p: front(1) });
    expect(b.last('floor')).toBeUndefined();
    advance(COUNTDOWN_MS);

    for (let f = 1; f <= level.config.floors; f++) lobby.handle(a, { t: 'interact', seq: 1, doorId: passage(f).id, p: front(f) });
    expect(b.last('floor')).toEqual({ t: 'floor', id: 'a', floor: level.config.floors + 1 });
    expect(b.inbox.some((m) => m.t === 'reveal' && m.id === 'a')).toBe(true);
    // À deux, la première arrivée termine la partie.
    expect(b.last('arrived')).toMatchObject({ id: 'a', rank: 1 });
    const finish = b.last('finish')!;
    expect(finish.reason).toBe('podium');
    expect(finish.ranking.map((r) => [r.id, r.rank])).toEqual([['a', 1], ['b', 2]]);
    expect(finish.ranking[0].time).toBeGreaterThanOrEqual(0);
  });

  it('une porte trop loin du joueur est refusée (anti-triche)', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const mirror = new Game(levels[0].config, a.last('start')!.seed);
    const door = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    lobby.handle(a, { t: 'interact', seq: 1, doorId: door.id, p: [500, 0, 500] });
    expect(b.last('floor')).toBeUndefined();
  });

  it('à deux, un départ pendant la course donne la victoire par forfait', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    lobby.handle(b, { t: 'leave' });
    const finish = a.last('finish')!;
    expect(finish.reason).toBe('forfeit');
    expect(finish.ranking.map((r) => [r.id, r.left ?? false])).toEqual([['a', false], ['b', true]]);
  });

  it('à trois, la course continue après le premier arrivé et s’arrête au podium (tous sauf un)', () => {
    const { lobby, a, b, c, advance } = room(3);
    advance(COUNTDOWN_MS);
    climbAll(lobby, b);
    expect(a.last('arrived')).toMatchObject({ id: 'b', rank: 1 });
    expect(a.last('finish')).toBeUndefined();
    climbAll(lobby, a, 2); // a monte de deux étages : il est devant c au classement
    climbAll(lobby, c, 1);
    advance(1000);
    // c ne finit pas : a termine 2e en arrivant au sommet
    const mirror = new Game(levels[0].config, a.last('start')!.seed);
    for (let f = 3; f <= levels[0].config.floors; f++) {
      const door = mirror.layout.doorsByFloor[f].find((x) => x.mechanic === 'passage')!;
      const p = doorFront(levels[0].config, door);
      lobby.handle(a, { t: 'interact', seq: 10 + f, doorId: door.id, p: [p.x, p.y, p.z] });
    }
    const finish = c.last('finish')!;
    expect(finish.reason).toBe('podium');
    expect(finish.ranking.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('à quatre, la partie se termine 45 s après la première arrivée ; les autres sont classés par étage', () => {
    const { lobby, a, b, c, d, advance } = room(4);
    advance(COUNTDOWN_MS);
    climbAll(lobby, d);
    climbAll(lobby, b, 3);
    climbAll(lobby, a, 1);
    advance(FINISH_GRACE_MS - 1);
    expect(a.last('finish')).toBeUndefined();
    advance(1);
    const finish = c.last('finish')!;
    expect(finish.reason).toBe('time');
    expect(finish.ranking.map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('à trois, un joueur qui part ne termine pas la partie ; il est classé dernier', () => {
    const { lobby, a, b, c, advance } = room(3);
    advance(COUNTDOWN_MS);
    lobby.handle(b, { t: 'leave' });
    expect(a.last('finish')).toBeUndefined();
    expect(a.last('room')!.players.map((p) => p.id)).toEqual(['a', 'c']);
    climbAll(lobby, c);
    const finish = a.last('finish')!;
    expect(finish.ranking.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(finish.ranking[2].left).toBe(true);
  });

  it('le Nuage vise le joueur juste devant, ou le deuxième si l’on est en tête', () => {
    const { lobby, a, b, c, advance } = room(3);
    advance(COUNTDOWN_MS);
    climbAll(lobby, b, 1); // b étage 2
    climbAll(lobby, c, 3); // c étage 4
    give(lobby, a, 'cloud');
    lobby.handle(a, { t: 'power', seq: 1, power: 'cloud', p: [0, 0, 0] });
    expect(b.last('cloud')).toMatchObject({ from: 'a' });
    expect(c.last('cloud')).toBeUndefined();
    give(lobby, c, 'cloud');
    lobby.handle(c, { t: 'power', seq: 9, power: 'cloud', p: [0, 0, 0] });
    expect(b.inbox.filter((m) => m.t === 'cloud')).toHaveLength(2);
  });

  it('la revanche ne repart que quand tous les joueurs la demandent, avec une nouvelle course', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const mirror = new Game(levels[0].config, a.last('start')!.seed);
    for (let f = 1; f <= levels[0].config.floors; f++) {
      const door = mirror.layout.doorsByFloor[f].find((d) => d.mechanic === 'passage')!;
      const p = doorFront(levels[0].config, door);
      lobby.handle(b, { t: 'interact', seq: 1, doorId: door.id, p: [p.x, p.y, p.z] });
    }
    expect(a.last('finish')?.ranking[0].id).toBe('b');
    const starts = () => a.inbox.filter((m) => m.t === 'start').length;
    lobby.handle(a, { t: 'rematch' });
    expect(b.last('rematch')).toEqual({ t: 'rematch', id: 'a' });
    expect(starts()).toBe(1);
    lobby.handle(b, { t: 'rematch' });
    expect(starts()).toBe(2);
  });

  it('un pouvoir caché derrière une porte vide revient à celui qui l’ouvre, puis réapparaît ailleurs 15 s plus tard', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const server = [...lobby.rooms.values()][0];
    const config = levels[0].config;
    const mirror = new Game(config, a.last('start')!.seed);
    const hiddenOn = (floor: number) => [...server.hidden].filter((id) => mirror.doorsById.get(id)!.floor === floor);
    // « Beaucoup » : 3 pouvoirs à l'étage 1 (16 portes), toujours derrière des portes vides.
    expect(hiddenOn(1)).toHaveLength(3);
    expect([...server.hidden].every((id) => mirror.doorsById.get(id)!.mechanic === 'wall')).toBe(true);
    const doorId = hiddenOn(1)[0];
    const p = doorFront(config, mirror.doorsById.get(doorId)!);
    lobby.handle(a, { t: 'interact', seq: 7, doorId, p: [p.x, p.y, p.z] });
    const gain = a.last('gain')!;
    expect(gain.doorId).toBe(doorId);
    expect(a.last('self')).toMatchObject({ seq: 7, powers: { [gain.power]: 1 } });
    // Le pouvoir a disparu : l'autre joueur ne trouve rien derrière la même porte.
    lobby.handle(b, { t: 'interact', seq: 1, doorId, p: [p.x, p.y, p.z] });
    expect(b.last('gain')).toBeUndefined();
    expect(hiddenOn(1)).toHaveLength(2);
    advance(POWER_RESPAWN_MS);
    expect(hiddenOn(1)).toHaveLength(3);
    expect(server.hidden.has(doorId)).toBe(false);
  });

  it('« peu de pouvoirs » en cache moins, et jamais aucun à un étage', () => {
    const { clock, advance } = manualClock();
    const lobby = new Lobby(levels, clock, () => 0.5);
    const a = peer('a');
    const b = peer('b');
    lobby.handle(a, { t: 'create', level: 1, name: 'A', powers: 'few' });
    lobby.handle(b, { t: 'join', code: a.last('room')!.code, name: 'B' });
    lobby.handle(a, { t: 'launch' });
    advance(COUNTDOWN_MS);
    const server = [...lobby.rooms.values()][0];
    expect(a.last('room')!.powers).toBe('few');
    expect(server.hidden.size).toBe(levels[0].config.floors); // un par étage au niveau 1
  });

  it('un pouvoir que l’on ne possède pas est refusé ; un pouvoir inutilisable n’est pas consommé', () => {
    const { lobby, a, advance } = room();
    advance(COUNTDOWN_MS);
    lobby.handle(a, { t: 'power', seq: 1, power: 'turbo', p: [0, 0, 0] });
    expect(a.last('self')!.turboMs).toBe(0);
    give(lobby, a, 'seal');
    lobby.handle(a, { t: 'power', seq: 2, power: 'seal', p: [0, 0, 0] }); // aucune porte franchie
    expect(a.last('self')!.powers.seal).toBe(1);
  });

  it('turbo et bouclier sont visibles par l’adversaire ; un second bouclier n’est pas consommé', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
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
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const config = levels[0].config;
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
    expect(b.last('boom')).toMatchObject({ target: 'b', result: 'knocked', from: 2, to: 1 });
    expect(b.last('self')).toMatchObject({ floor: 1, immuneMs: IMMUNITY_MS });
    expect(a.last('floor')).toEqual({ t: 'floor', id: 'b', floor: 1 });
    // Une mine ne se déclenche jamais sous son propriétaire.
    lobby.handle(a, { t: 'power', seq: 2, power: 'mine', p: at });
    advance(MINE_ARM_MS);
    lobby.handle(a, { t: 'pos', p: [spot.x + 0.4, spot.y, spot.z], ry: 0 });
    expect(a.inbox.filter((m) => m.t === 'boom')).toHaveLength(1);
  });

  it('le nuage de confusion arrive chez l’adversaire ; les bottes sont visibles et pas consommées deux fois', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    give(lobby, a, 'cloud');
    lobby.handle(a, { t: 'power', seq: 1, power: 'cloud', p: [0, 0, 0] });
    expect(b.last('cloud')).toEqual({ t: 'cloud', from: 'a', ms: CLOUD_MS });
    expect(a.last('cloud')).toBeUndefined();
    give(lobby, a, 'boots');
    give(lobby, a, 'boots');
    lobby.handle(a, { t: 'power', seq: 2, power: 'boots', p: [0, 0, 0] });
    lobby.handle(a, { t: 'power', seq: 3, power: 'boots', p: [0, 0, 0] });
    expect(b.last('state')).toMatchObject({ id: 'a', bootsMs: BOOTS_MS });
    expect(a.last('self')).toMatchObject({ bootsMs: BOOTS_MS, powers: { boots: 1, cloud: 0 } });
  });

  it('un piège est relayé aux autres (ils rejouent la scène) ; pendant la scène, pas de mine', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const config = levels[0].config;
    const mirror = new Game(config, a.last('start')!.seed);
    // b monte à l'étage 2, puis ouvre un piège : il redescend à l'étage 1.
    const passage = mirror.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    const pf = doorFront(config, passage);
    lobby.handle(b, { t: 'interact', seq: 1, doorId: passage.id, p: [pf.x, pf.y, pf.z] });
    const trap = mirror.layout.doorsByFloor[2].find((d) => d.mechanic === 'smallTrap')!;
    const tf = doorFront(config, trap);
    lobby.handle(b, { t: 'interact', seq: 2, doorId: trap.id, p: [tf.x, tf.y, tf.z] });
    expect(a.last('trapped')).toEqual({ t: 'trapped', id: 'b', doorId: trap.id, from: 2, to: 1 });
    // Une mine de a, armée, sur le trajet de b pendant sa scène : rien ne se passe.
    const spot = findMineSpot(mirror, 1);
    const at: [number, number, number] = [spot.x, spot.y, spot.z];
    give(lobby, a, 'mine');
    lobby.handle(a, { t: 'pos', p: at, ry: 0 });
    lobby.handle(a, { t: 'power', seq: 1, power: 'mine', p: at });
    advance(MINE_ARM_MS);
    lobby.handle(b, { t: 'pos', p: [spot.x - 0.5, spot.y, spot.z], ry: 0 });
    lobby.handle(b, { t: 'pos', p: [spot.x + 0.5, spot.y, spot.z], ry: 0 });
    expect(b.last('boom')).toBeUndefined();
    // Une fois la scène finie, la mine fonctionne de nouveau.
    advance(TRAP_SCENE_MULTI_MS);
    lobby.handle(b, { t: 'pos', p: [spot.x - 0.5, spot.y, spot.z], ry: 0 });
    expect(b.last('boom')).toMatchObject({ target: 'b', owner: 'a' });
  });

  it('une mine ne se pose pas devant une porte (pouvoir conservé)', () => {
    const { lobby, a, advance } = room();
    advance(COUNTDOWN_MS);
    const config = levels[0].config;
    const mirror = new Game(config, a.last('start')!.seed);
    const p = doorFront(config, mirror.layout.doorsByFloor[1][0]);
    give(lobby, a, 'mine');
    lobby.handle(a, { t: 'power', seq: 1, power: 'mine', p: [p.x, p.y, p.z] });
    expect(a.last('self')!.powers.mine).toBe(1);
    expect(a.last('mine')).toBeUndefined();
  });

  it('le sceau est annoncé aux deux joueurs et bloque la porte pour l’adversaire', () => {
    const { lobby, a, b, advance } = room();
    advance(COUNTDOWN_MS);
    const config = levels[0].config;
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
function give(lobby: Lobby, who: Peer, power: PowerId) {
  const server = [...lobby.rooms.values()][0] as unknown as { fighters: Map<string, { powers: Record<string, number> }> };
  server.fighters.get(who.id)!.powers[power]++;
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

