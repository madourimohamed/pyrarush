import { describe, expect, it } from 'vitest';
import { levels } from '../levels';
import {
  doorFront,
  duelConfig,
  floorY,
  Game,
  generateLayout,
  landingPoint,
  mineSpotValid,
  mineTriggered,
  pickPower,
  POWER_DOORS_PER_FLOOR,
  POWER_IDS,
  SEAL_COOLDOWN_MS,
  SEAL_MS,
  SEAL_WINDOW_MS,
  standing,
} from './index';

const config = duelConfig(levels[0].config);

/** Fait monter un joueur d'un étage par la première bonne porte, à l'instant `now`. */
function climb(game: Game, id: string, now: number) {
  const floor = game.players.get(id)!.floor;
  const door = game.layout.doorsByFloor[floor].find((d) => d.mechanic === 'passage')!;
  game.interact(id, door.id, now);
  return door;
}

describe('duel : règles du socle', () => {
  it('chaque niveau en duel reste valide et terminable, avec ses portes à pouvoir à chaque étage', () => {
    for (const level of levels) {
      for (let seed = 1; seed <= 15; seed++) {
        const layout = generateLayout(duelConfig(level.config), seed);
        for (let f = 1; f <= level.config.floors; f++) {
          const count = layout.doorsByFloor[f].filter((d) => d.mechanic === 'powerDoor').length;
          expect(count).toBeGreaterThanOrEqual(1);
          expect(count).toBeLessThanOrEqual(POWER_DOORS_PER_FLOOR);
        }
      }
    }
    // Le solo n'a jamais de porte à pouvoir.
    expect(generateLayout(levels[0].config, 3).doors.some((d) => d.mechanic === 'powerDoor')).toBe(false);
  });

  it('une porte à pouvoir ne fait pas changer d’étage et ne sert qu’une fois par joueur, pour chacun des deux', () => {
    const game = new Game(config, 5);
    game.addPlayer('a');
    game.addPlayer('b');
    const door = game.layout.doorsByFloor[1].find((d) => d.mechanic === 'powerDoor')!;
    expect(game.interact('a', door.id, 0)[0]).toMatchObject({ fx: 'power', from: 1, to: 1 });
    expect(game.players.get('a')!.tried.get(door.id)).toBe('power');
    expect(game.interact('a', door.id, 0)[0]).toMatchObject({ mechanic: 'wall' });
    expect(game.interact('b', door.id, 0)[0]).toMatchObject({ fx: 'power' });
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
    expect(standing(2, 4)).toBe('behind');
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
});
