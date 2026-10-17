import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { generateLayout } from './layout';
import { TREASURE_HOURGLASS_MS } from './mechanics/treasure';
import { levelConfigs } from '../levels';

const config = levelConfigs[0];

describe('portes trésor (plus de portes vides)', () => {
  it('une part des portes indice devient des trésors, sans déplacer passages, pièges ni trous', () => {
    for (const seed of [1, 42, 2026]) {
      const withTreasures = generateLayout(config, seed);
      const without = generateLayout({ ...config, treasureShare: 0 }, seed);
      expect(withTreasures.holes).toEqual(without.holes);
      withTreasures.doors.forEach((door, i) => {
        const before = without.doors[i];
        if (door.mechanic === 'treasure') expect(before.mechanic).toBe('wall');
        else expect(door).toEqual(before);
      });
      const treasures = withTreasures.doors.filter((d) => d.mechanic === 'treasure').length;
      const walls = without.doors.filter((d) => d.mechanic === 'wall').length;
      expect(treasures / walls).toBeGreaterThan(0.25);
      expect(treasures / walls).toBeLessThan(0.45);
      // Même graine, mêmes trésors.
      expect(generateLayout(config, seed).doors).toEqual(withTreasures.doors);
    }
  });

  /** Une partie dont la première porte est un trésor de la récompense voulue. */
  function gameWith(reward: number, amount = 7): { game: Game; doorId: string } {
    const game = new Game(config, 3);
    const door = game.layout.doorsByFloor[1].find((d) => d.mechanic === 'wall')!;
    door.mechanic = 'treasure';
    door.params = { reward, amount };
    game.addPlayer('a');
    return { game, doorId: door.id };
  }

  it('éclats : ajoutés au joueur, une seule fois (ensuite la porte donne un indice)', () => {
    const { game, doorId } = gameWith(0, 7);
    const events = game.interact('a', doorId, 0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'treasure', reward: 'shards', amount: 7 }));
    expect(game.players.get('a')!.shards).toBe(7);
    expect(game.players.get('a')!.tried.get(doorId)).toBe('treasure');
    const again = game.interact('a', doorId, 1000);
    expect(again.some((e) => e.type === 'treasure')).toBe(false);
    expect(game.players.get('a')!.shards).toBe(7);
  });

  it('sablier : du temps en moins en solo, des éclats à la place en multijoueur', () => {
    const solo = gameWith(1);
    expect(solo.game.interact('a', solo.doorId, 0)).toContainEqual(expect.objectContaining({ reward: 'hourglass', timeBonusMs: TREASURE_HOURGLASS_MS }));
    const multi = gameWith(1);
    multi.game.timeBonuses = false;
    expect(multi.game.interact('a', multi.doorId, 0)).toContainEqual(expect.objectContaining({ reward: 'shards' }));
    expect(multi.game.players.get('a')!.shards).toBeGreaterThan(0);
  });

  it('bouclier : actif tout de suite ; déjà actif, des éclats à la place', () => {
    const first = gameWith(2);
    first.game.interact('a', first.doorId, 0);
    expect(first.game.players.get('a')!.shield).toBe(true);
    const second = gameWith(2);
    second.game.players.get('a')!.shield = true;
    expect(second.game.interact('a', second.doorId, 0)).toContainEqual(expect.objectContaining({ reward: 'shards' }));
  });
});
