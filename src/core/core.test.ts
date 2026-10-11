import { describe, expect, it } from 'vitest';
import { getMechanic, Game, generateLayout, walkTerrace, doorTangent, terraceMidHalf, pyramids, pyramid1, buildColliders, landingPoint, holeTangent, HOLE_WIDTH, sideFrame, doorsPerSide } from './index';

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1);

describe('génération', () => {
  it.each(pyramids.map((p) => [p.id, p] as const))('%s est toujours terminable et valide', (_id, config) => {
    for (const seed of SEEDS) {
      const layout = generateLayout(config, seed);
      for (let f = 1; f <= config.floors; f++) {
        const doors = layout.doorsByFloor[f];
        expect(doors.length).toBe(doorsPerSide(config, f) * 4);
        expect(doors.some((d) => d.mechanic === 'passage')).toBe(true);
      }
      for (const [id, max] of Object.entries(config.limits ?? {})) {
        expect(layout.doors.filter((d) => d.mechanic === id).length).toBeLessThanOrEqual(max);
      }
    }
  });

  it('une même graine donne la même pyramide', () => {
    expect(generateLayout(pyramid1, 42)).toEqual(generateLayout(pyramid1, 42));
  });

  it('la pyramide 1 ne contient que des mécaniques simples', () => {
    for (const seed of SEEDS) {
      const ids = new Set(generateLayout(pyramid1, seed).doors.map((d) => d.mechanic));
      for (const id of ids) expect(['passage', 'wall', 'smallTrap', 'riskyDoor']).toContain(id);
    }
  });

  it('pyramide 1 : une porte risquée ±2, à l’étage 3 seulement, qui mène au 5 ou au 1', () => {
    expect(pyramid1.floors).toBe(6);
    for (const seed of SEEDS) {
      const layout = generateLayout(pyramid1, seed);
      const risky = layout.doors.filter((d) => d.mechanic === 'riskyDoor');
      expect(risky.length).toBe(1);
      expect(risky[0].floor).toBe(3);
      const game = new Game(pyramid1, seed);
      const p = game.addPlayer('a');
      p.floor = 3;
      game.interact('a', risky[0].id, 0);
      expect(p.floor).toBe(risky[0].params.delta > 0 ? 5 : 1);
    }
    expect(getMechanic('riskyDoor').appearance?.symbol(pyramid1)).toBe('±2');
  });

  it('pyramide 1 : un piège ne fait jamais perdre plus d’un étage', () => {
    const game = new Game(pyramid1, 5);
    const p = game.addPlayer('a');
    for (const door of game.layout.doors.filter((d) => d.mechanic === 'smallTrap')) {
      p.floor = door.floor;
      game.interact('a', door.id, 0);
      expect(p.floor).toBe(Math.max(1, door.floor - 1));
    }
  });
});

describe('règles', () => {
  it('un passage fait monter, est mémorisé et révélé publiquement', () => {
    const game = new Game(pyramid1, 1);
    const p = game.addPlayer('a');
    const door = game.layout.doorsByFloor[1].find((d) => d.mechanic === 'passage')!;
    const events = game.interact('a', door.id, 1000);
    expect(p.floor).toBe(2);
    expect(p.knownPassages.has(door.id)).toBe(true);
    expect(events.some((e) => e.type === 'publicReveal')).toBe(true);
    expect(game.update(1000 + pyramid1.publicRevealMs)).toEqual([{ type: 'revealEnd', doorId: door.id }]);
  });

  it('on ne peut pas interagir avec une porte d’un autre étage', () => {
    const game = new Game(pyramid1, 1);
    game.addPlayer('a');
    const door = game.layout.doorsByFloor[2][0];
    expect(game.interact('a', door.id, 0)).toEqual([]);
  });

  it('les chutes sont bornées par la configuration et jamais sous l’étage 1', () => {
    for (const config of pyramids) {
      for (const seed of SEEDS.slice(0, 50)) {
        const game = new Game(config, seed);
        const p = game.addPlayer('a');
        for (const door of game.layout.doors) {
          if (door.mechanic === 'passage' || door.mechanic === 'wall') continue;
          p.floor = door.floor;
          p.usedDoors.clear();
          const before = p.floor;
          game.interact('a', door.id, 0);
          expect(p.floor).toBeGreaterThanOrEqual(1);
          expect(before - p.floor).toBeLessThanOrEqual(config.maxFloorsLost);
          if (p.floor > before) {
            expect(p.floor - before).toBeLessThanOrEqual(config.maxFloorsGained);
            expect(p.floor).toBeLessThanOrEqual(config.floors - config.protectedTopFloors);
          }
        }
      }
    }
  });

  it('un téléporteur ne sert qu’une fois par joueur', () => {
    const config = pyramids[2];
    const seed = SEEDS.find((s) => generateLayout(config, s).doors.some((d) => d.mechanic === 'teleportUp'))!;
    const game = new Game(config, seed);
    const p = game.addPlayer('a');
    const door = game.layout.doors.find((d) => d.mechanic === 'teleportUp')!;
    p.floor = door.floor;
    game.interact('a', door.id, 0);
    expect(p.floor).toBeGreaterThan(door.floor + 1);
    p.floor = door.floor;
    game.interact('a', door.id, 0);
    expect(p.floor).toBe(door.floor);
  });

  it('atteindre le sommet déclenche la victoire', () => {
    const game = new Game(pyramid1, 3);
    const p = game.addPlayer('a');
    for (let f = 1; f <= pyramid1.floors; f++) {
      const door = game.layout.doorsByFloor[f].find((d) => d.mechanic === 'passage')!;
      const events = game.interact('a', door.id, f * 1000);
      if (f === pyramid1.floors) expect(events.at(-1)).toEqual({ type: 'victory', playerId: 'a', time: f * 1000 });
    }
    expect(p.finishedAt).toBe(pyramid1.floors * 1000);
  });

  it('une chute physique compte comme une chute, mais on ne monte pas physiquement', () => {
    const game = new Game(pyramid1, 1);
    const p = game.addPlayer('a');
    p.floor = 3;
    game.reportFloor('a', 2, 0);
    expect(p.floor).toBe(2);
    expect(p.falls).toBe(1);
    game.reportFloor('a', 4, 0);
    expect(p.floor).toBe(2);
  });
});

describe('géométrie', () => {
  it('les points d’arrivée ne tombent jamais dans un trou', () => {
    for (const config of pyramids) {
      for (const seed of SEEDS.slice(0, 50)) {
        const layout = generateLayout(config, seed);
        expect(buildColliders(layout).length).toBeGreaterThan(0);
        for (const hole of layout.holes) {
          for (let t = -40; t <= 40; t += 0.7) {
            const p = landingPoint(config, hole.floor, hole.side, t);
            const f = sideFrame(hole.side);
            const tangent = p.x * f.tanX + p.z * f.tanZ;
            expect(Math.abs(tangent - holeTangent(config, hole))).toBeGreaterThan(HOLE_WIDTH / 2 + 0.3);
          }
        }
      }
    }
  });
});

describe('indices', () => {
  it('le scarabée part dans le sens du passage le plus proche', () => {
    const game = new Game(pyramid1, 9);
    game.addPlayer('a');
    const doors = game.layout.doorsByFloor[1];
    const n = doors.length;
    for (const door of doors.filter((d) => d.mechanic === 'wall')) {
      const events = game.interact('a', door.id, 0);
      const result = events[0];
      if (result.type !== 'doorResult' || result.hint?.type !== 'scarab') throw new Error('indice attendu');
      const { dir } = result.hint;
      let steps = 1;
      while (doors[(door.ring + dir * steps + n) % n].mechanic !== 'passage') steps++;
      let other = 1;
      while (doors[(door.ring - dir * other + n) % n].mechanic !== 'passage') other++;
      expect(steps).toBeLessThanOrEqual(other);
      expect(result.hint.near).toBe(steps <= 2);
    }
  });

  it('le mode chaud/froid et le mode sans indice restent disponibles', () => {
    for (const hints of ['hotCold', 'none'] as const) {
      const game = new Game({ ...pyramid1, hints }, 9);
      game.addPlayer('a');
      const wall = game.layout.doorsByFloor[1].find((d) => d.mechanic === 'wall')!;
      const result = game.interact('a', wall.id, 0)[0];
      if (result.type !== 'doorResult') throw new Error();
      expect(result.hint?.type).toBe(hints === 'none' ? undefined : 'hotCold');
    }
  });

  it('marcher le long d’une terrasse tourne aux coins sans saut', () => {
    const r = terraceMidHalf(pyramid1, 2);
    const t0 = doorTangent(pyramid1, 2, 0);
    let prev = walkTerrace(pyramid1, 2, 0, t0, 0);
    for (let d = 0.25; d <= 8 * r; d += 0.25) {
      const p = walkTerrace(pyramid1, 2, 0, t0, d);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.26);
      prev = p;
    }
  });
});
