import { describe, expect, it } from 'vitest';
import { levels } from '../levels';
import {
  doorFront,
  floorY,
  Game,
  generateLayout,
  landingPoint,
  mineSpotValid,
  mineTriggered,
  cloudTarget,
  CAR_MAX_MS,
  CAR_MIN_DISTANCE,
  CAR_MIN_MS,
  pickPower,
  rideMs,
  rideTarget,
  POWER_IDS,
  rankPlayers,
  startOffsets,
  powerSpotCount,
  SEAL_COOLDOWN_MS,
  SEAL_MS,
  SEAL_WINDOW_MS,
  standing,
} from './index';

const config = levels[0].config;

/** Fait monter un joueur d'un étage par la première bonne porte, à l'instant `now`. */
function climb(game: Game, id: string, now: number) {
  const floor = game.players.get(id)!.floor;
  const door = game.layout.doorsByFloor[floor].find((d) => d.mechanic === 'passage')!;
  game.interact(id, door.id, now);
  return door;
}

describe('multijoueur : règles du socle', () => {
  it('le nombre de pouvoirs cachés dépend du réglage et du nombre de portes de l’étage', () => {
    expect(powerSpotCount(16, 10, 'few')).toBe(1);
    expect(powerSpotCount(16, 10, 'many')).toBe(3);
    expect(powerSpotCount(28, 20, 'many')).toBe(6);
    expect(powerSpotCount(8, 4, 'few')).toBe(1); // jamais aucun
    expect(powerSpotCount(8, 1, 'many')).toBe(1); // jamais plus que de portes vides
  });

  it('le Sceau bloque la dernière bonne porte franchie pour l’adversaire seulement, puis se lève tout seul', () => {
    const game = new Game(config, 5);
    game.addPlayer('a');
    game.addPlayer('b');
    expect(game.sealDoor('a', 0)).toEqual([]); // aucune porte franchie
    const door = climb(game, 'a', 1000);
    expect(game.sealDoor('a', 1000 + SEAL_WINDOW_MS + 1)).toEqual([]); // trop tard
    const sealed = game.sealDoor('a', 2000);
    expect(sealed).toEqual([{ type: 'sealed', doorId: door.id, owner: 'a', until: 2000 + SEAL_MS }]);
    expect(game.interact('b', door.id, 3000)).toEqual([{ type: 'doorSealed', playerId: 'b', doorId: door.id }]);
    expect(game.players.get('b')!.floor).toBe(1);
    expect(game.update(2000 + SEAL_MS)).toContainEqual({ type: 'unsealed', doorId: door.id });
    expect(game.interact('b', door.id, 2000 + SEAL_MS)[0]).toMatchObject({ fx: 'passage' });
  });

  it('une porte ne peut pas être rescellée pendant son repos, et un seul sceau actif par joueur', () => {
    const game = new Game(config, 5);
    game.addPlayer('a');
    game.addPlayer('b');
    climb(game, 'a', 0);
    climb(game, 'b', 0);
    expect(game.sealDoor('a', 0)).toHaveLength(1);
    expect(game.sealDoor('b', 0)).toEqual([]); // même porte, déjà scellée
    climb(game, 'a', 100);
    expect(game.sealDoor('a', 100)).toEqual([]); // le premier sceau est encore actif
    game.update(SEAL_MS);
    expect(game.sealDoor('b', SEAL_MS)).toEqual([]); // trop tard pour b, et porte au repos
    game.update(SEAL_MS + SEAL_COOLDOWN_MS);
    expect(game.seals.size).toBe(0);
  });

  it('une attaque fait perdre au plus un étage ; le bouclier l’absorbe ; au premier étage on est seulement repoussé', () => {
    const game = new Game(config, 5);
    const p = game.addPlayer('a');
    expect(game.knockDown('a', 0)).toEqual([{ type: 'knocked', playerId: 'a', from: 1, to: 1 }]);
    p.floor = 4;
    game.knockDown('a', 0);
    expect(p.floor).toBe(3);
    p.shield = true;
    expect(game.knockDown('a', 0)).toEqual([{ type: 'shielded', playerId: 'a', cause: 'attack', floor: 3 }]);
    expect(p.floor).toBe(3);
  });

  it('les portes à pouvoir avantagent le joueur en retard (turbo, bouclier) et le joueur en tête (sceau, mine)', () => {
    expect(standing(2, [4])).toBe('behind');
    // À plusieurs : seul en tête, seul dernier, ou au milieu.
    expect(standing(5, [2, 3, 4])).toBe('ahead');
    expect(standing(1, [2, 3, 4])).toBe('behind');
    expect(standing(3, [2, 4, 5])).toBe('tied');
    const count = (s: 'behind' | 'ahead') => {
      const c = Object.fromEntries(POWER_IDS.map((id) => [id, 0])) as Record<string, number>;
      for (let i = 0; i < 1000; i++) c[pickPower(s, i / 1000)]++;
      return c;
    };
    const behind = count('behind');
    const ahead = count('ahead');
    expect(behind.turbo + behind.shield).toBeGreaterThan(ahead.turbo + ahead.shield);
    expect(ahead.mine + ahead.seal).toBeGreaterThan(behind.mine + behind.seal);
  });

  it('une mine se pose sur une terrasse loin des portes et se déclenche au passage, sauf en sautant', () => {
    const layout = generateLayout(config, 5);
    const door = layout.doorsByFloor[2][0];
    expect(mineSpotValid(layout, doorFront(config, door))).toBe(false);
    // Point de la terrasse 2 à mi-chemin entre deux portes.
    const spot = landingPoint(config, 2, 0, 0);
    const mid = { ...spot, x: spot.x + 2.9 };
    const valid = [spot, mid].find((p) => mineSpotValid(layout, p));
    expect(valid).toBeDefined();
    expect(mineSpotValid(layout, { ...valid!, y: floorY(2) + 1.5 })).toBe(false); // en l'air

    const mine = { x: 0, y: floorY(2), z: 10 };
    expect(mineTriggered(mine, { x: -3, y: mine.y, z: 10 }, { x: 3, y: mine.y, z: 10 })).toBe(true); // traversée rapide
    expect(mineTriggered(mine, { x: -3, y: mine.y + 1.2, z: 10 }, { x: 3, y: mine.y + 1.2, z: 10 })).toBe(false); // saut
    expect(mineTriggered(mine, { x: -3, y: mine.y, z: 11.5 }, { x: 3, y: mine.y, z: 11.5 })).toBe(false); // à côté
  });

  it('le Nuage vise le joueur juste devant ; en tête, il vise le deuxième', () => {
    const others = [
      { id: 'b', floor: 2 },
      { id: 'c', floor: 5 },
      { id: 'd', floor: 3 },
    ];
    expect(cloudTarget(1, others, 0)).toBe('b');
    expect(cloudTarget(4, others, 0)).toBe('c');
    expect(cloudTarget(6, others, 0)).toBe('c');
    expect(cloudTarget(1, [], 0)).toBeNull();
  });

  it('les places de départ sont centrées et ne se chevauchent pas, quel que soit le nombre de joueurs', () => {
    expect(startOffsets(2)).toEqual([-0.7, 0.7]);
    for (const n of [1, 3, 4, 8]) {
      const offsets = startOffsets(n);
      expect(offsets).toHaveLength(n);
      expect(offsets.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    }
  });

  it('classement : arrivés par temps, puis par étage et chutes, ceux partis en dernier', () => {
    const ranking = rankPlayers([
      { id: 'parti', floor: 6, falls: 0, left: true },
      { id: 'lent', time: 90000, floor: 7, falls: 3 },
      { id: 'haut', floor: 5, falls: 4 },
      { id: 'rapide', time: 60000, floor: 7, falls: 1 },
      { id: 'haut-prudent', floor: 5, falls: 1 },
    ]);
    expect(ranking.map((r) => r.id)).toEqual(['rapide', 'lent', 'haut-prudent', 'haut', 'parti']);
  });

  it('la Voiture vise le passage le plus proche le long de la terrasse, évite une porte scellée, et ne sert à rien si on y est déjà', () => {
    const layout = generateLayout(config, 5);
    const floor = 2;
    const passages = layout.doorsByFloor[floor].filter((d) => d.mechanic === 'passage');
    const start = landingPoint(config, floor, (passages[0].side + 2) % 4, 0); // face opposée
    const ride = rideTarget(layout, start, floor)!;
    expect(ride.door.mechanic).toBe('passage');
    expect(ride.distance).toBeGreaterThan(CAR_MIN_DISTANCE);
    expect(rideMs(ride.distance)).toBeGreaterThanOrEqual(CAR_MIN_MS);
    expect(rideMs(ride.distance)).toBeLessThanOrEqual(CAR_MAX_MS);
    if (passages.length > 1) expect(rideTarget(layout, start, floor, (d) => d.id === ride.door.id)!.door.id).not.toBe(ride.door.id);
    expect(rideTarget(layout, doorFront(config, ride.door), floor)).toBeNull();
  });
});

