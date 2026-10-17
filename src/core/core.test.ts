import { describe, expect, it } from 'vitest';
import { LEVEL_ID_PATTERN, starsFor, defineTheme, editComponents, terraceDistance, doorTangents, holeTangents, DOOR_WIDTH, getMechanic, Game, generateLayout, walkTerrace, doorTangent, terraceMidHalf, buildColliders, landingPoint, holeTangent, HOLE_WIDTH, sideFrame, doorsPerSide } from './index';
import { levelFiles, levels, levelConfigs } from '../levels';

const pyramid1 = levels[0].config;
const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 1);

describe('génération', () => {
  it.each(levelConfigs.map((p) => [p.id, p] as const))('%s est toujours terminable et valide', (_id, config) => {
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

  it('le niveau 1 ne contient que des mécaniques simples', () => {
    for (const seed of SEEDS) {
      const ids = new Set(generateLayout(pyramid1, seed).doors.map((d) => d.mechanic));
      for (const id of ids) expect(['passage', 'wall', 'treasure', 'smallTrap', 'riskyDoor']).toContain(id);
    }
  });

  it('niveau 1 : une porte risquée ±2, à l’étage 3 seulement, qui mène au 5 ou au 1', () => {
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

  it('niveau 1 : un piège ne fait jamais perdre plus d’un étage', () => {
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
    for (const config of levelConfigs) {
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
    const config = levelConfigs[5];
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
    for (const config of levelConfigs) {
      for (const seed of SEEDS.slice(0, 20)) {
        const layout = generateLayout(config, seed);
        expect(buildColliders(layout).length).toBeGreaterThan(0);
        // Des milliers de points : on cherche le pire, puis une seule vérification (un expect par point est très lent).
        let closest = Infinity;
        for (const hole of layout.holes) {
          const f = sideFrame(hole.side);
          const center = holeTangent(config, hole);
          for (let t = -40; t <= 40; t += 0.7) {
            const p = landingPoint(config, hole.floor, hole.side, t);
            closest = Math.min(closest, Math.abs(p.x * f.tanX + p.z * f.tanZ - center));
          }
        }
        expect(closest, `${config.id}, graine ${seed}`).toBeGreaterThan(HOLE_WIDTH / 2 + 0.3);
      }
    }
  }, 30000);
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
      const hint = result.hint;
      expect(hint.doors).toBe(steps);
      expect(doors.find((d) => d.id === hint.target)?.mechanic).toBe('passage');
    }
  }, 30_000); // toutes les pyramides et graines : lent quand tous les tests tournent en même temps

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

describe('niveaux', () => {
  it('les fichiers de niveau sont numérotés 1, 2, 3… sans trou ni doublon', () => {
    expect(levelFiles.map((f) => f.order)).toEqual(levelFiles.map((_, i) => i + 1));
  });

  it('sont numérotés de 1 à N, avec un thème complet et des identifiants uniques', () => {
    levels.forEach((level, i) => {
      expect(level.number).toBe(i + 1);
      expect(level.theme.music.scale.length).toBeGreaterThan(2);
      expect(level.theme.music.drums).toHaveLength(16);
    });
    expect(new Set(levels.map((l) => l.config.id)).size).toBe(levels.length);
  });

  it('ont un identifiant permanent (nom du fichier) ; un ancien nom ne désigne jamais un autre niveau', () => {
    levels.forEach((level, i) => {
      expect(level.id).toBe(levelFiles[i].id);
      expect(level.id).toMatch(LEVEL_ID_PATTERN);
      expect(level.config.id).toBe(level.id);
    });
    const all = levels.flatMap((l) => [l.id, ...l.formerIds]);
    expect(new Set(all).size).toBe(all.length);
    // Les identifiants d'avant le 2026-10-13 (par position) restent reconnus : les anciennes sauvegardes se relisent.
    expect(levels.slice(0, 6).map((l) => l.formerIds)).toEqual([1, 2, 3, 4, 5, 6].map((n) => [`level-${n}`]));
  });

  it('une porte risquée ne dépose jamais sur un étage protégé', () => {
    for (const config of levelConfigs) {
      for (const seed of SEEDS.slice(0, 100)) {
        for (const door of generateLayout(config, seed).doors.filter((d) => d.mechanic === 'riskyDoor')) {
          expect(door.floor).toBeGreaterThanOrEqual(2);
          expect(door.floor + Math.abs(door.params.delta)).toBeLessThanOrEqual(config.floors - config.protectedTopFloors);
        }
      }
    }
  });
});

describe('thèmes', () => {
  it('defineTheme ne remplace que ce qui est déclaré, sur un niveau de profondeur', () => {
    const base = levels[0].theme;
    const variant = defineTheme({ sky: { top: 0x123456 }, exposure: 2 }, base);
    expect(variant.sky.top).toBe(0x123456);
    expect(variant.sky.mid).toBe(base.sky.mid);
    expect(variant.exposure).toBe(2);
    expect(variant.door).toBe(base.door);
  });

  it('editComponents ajuste, retire et ajoute des composants sans réécrire la liste', () => {
    const list = [{ use: 'a', x: 1 }, { use: 'b' }];
    expect(editComponents(list, { a: { y: 2 }, b: null, c: { z: 3 } })).toEqual([
      { use: 'a', x: 1, y: 2 },
      { use: 'c', z: 3 },
    ]);
  });
});

describe('géométrie des portes et des trous', () => {
  it('un trou ne touche jamais une porte, ni de sa terrasse ni de la paroi du dessous', () => {
    for (const config of levelConfigs) {
      for (let floor = 2; floor <= config.floors; floor++) {
        const doors = [...doorTangents(config, floor), ...doorTangents(config, floor - 1)];
        for (const t of holeTangents(config, floor)) {
          for (const d of doors) expect(Math.abs(t - d)).toBeGreaterThanOrEqual((DOOR_WIDTH + HOLE_WIDTH) / 2);
        }
      }
    }
  });

  it('les portes tiennent dans leur paroi, sans se chevaucher', () => {
    for (const config of levelConfigs) {
      for (let floor = 1; floor <= config.floors; floor++) {
        const doors = doorTangents(config, floor);
        doors.slice(1).forEach((t, i) => expect(t - doors[i]).toBeGreaterThanOrEqual(DOOR_WIDTH + 1));
      }
    }
  });
});

describe('trace des portes essayées', () => {
  it('chaque porte essayée est mémorisée avec ce qu’elle cachait', () => {
    const game = new Game(pyramid1, 11);
    const p = game.addPlayer('a');
    const floorDoors = game.layout.doorsByFloor[1];
    const wallDoor = floorDoors.find((d) => d.mechanic === 'wall')!;
    const trap = floorDoors.find((d) => d.mechanic === 'smallTrap')!;
    game.interact('a', wallDoor.id, 0);
    game.interact('a', trap.id, 0); // étage 1 : le piège repousse sans faire descendre
    expect(p.tried.get(wallDoor.id)).toBe('wall');
    expect(p.tried.get(trap.id)).toBe('trap');
    const passage = floorDoors.find((d) => d.mechanic === 'passage')!;
    game.interact('a', passage.id, 0);
    expect(p.tried.get(passage.id)).toBe('up');
  });

  it('la distance le long d’une terrasse fait le tour dans le bon sens', () => {
    const r = terraceMidHalf(pyramid1, 2);
    expect(terraceDistance(pyramid1, 2, { side: 0, tangent: 0 }, { side: 0, tangent: 2 }, 1)).toBeCloseTo(2);
    expect(terraceDistance(pyramid1, 2, { side: 0, tangent: 0 }, { side: 0, tangent: 2 }, -1)).toBeCloseTo(8 * r - 2);
    expect(terraceDistance(pyramid1, 2, { side: 0, tangent: r }, { side: 1, tangent: -r }, 1)).toBeCloseTo(0);
  });
});

describe('étoiles', () => {
  it('1 étoile pour terminer, +1 pour le temps, +1 pour peu de chutes', () => {
    const goals = { time: 150, maxFalls: 1 };
    expect(starsFor(goals, 200_000, 4).stars).toBe(1);
    expect(starsFor(goals, 120_000, 4)).toEqual({ stars: 2, fast: true, careful: false });
    expect(starsFor(goals, 200_000, 1)).toEqual({ stars: 2, fast: false, careful: true });
    expect(starsFor(goals, 150_000, 0).stars).toBe(3);
  });

  it('chaque niveau a des objectifs cohérents', () => {
    for (const level of levels) {
      expect(level.goals.time).toBeGreaterThan(30);
      expect(level.goals.maxFalls).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('bonus', () => {
  it('le Bouclier annule une chute par piège puis une chute physique, une seule fois', () => {
    const game = new Game(pyramid1, 21);
    const p = game.addPlayer('a');
    p.floor = 3;
    const trap = game.layout.doorsByFloor[3].find((d) => d.mechanic === 'smallTrap')!;
    expect(game.useBonus('a', 'shield', 0)).toEqual([{ type: 'bonusUsed', playerId: 'a', bonus: 'shield' }]);
    const events = game.interact('a', trap.id, 0);
    expect(p.floor).toBe(3);
    expect(events.some((e) => e.type === 'shielded')).toBe(true);
    expect(p.shield).toBe(false);
    game.reportFloor('a', 2, 0);
    expect(p.floor).toBe(2);

    game.useBonus('a', 'shield', 0);
    expect(game.reportFloor('a', 1, 0)).toEqual([{ type: 'shielded', playerId: 'a', cause: 'fall', floor: 2 }]);
    expect(p.floor).toBe(2);
  });

  it('l’Œil de Râ montre un passage de l’étage actuel, le Sablier rend du temps', () => {
    const game = new Game(pyramid1, 21);
    game.addPlayer('a');
    const events = game.useBonus('a', 'eye', 1000);
    const reveal = events.find((e) => e.type === 'privateReveal');
    expect(reveal && reveal.type === 'privateReveal' && game.doorsById.get(reveal.doorId)?.mechanic).toBe('passage');
    expect(game.useBonus('a', 'hourglass', 0)[0]).toMatchObject({ bonus: 'hourglass', timeBonusMs: 10000 });
  });
});

describe('dalles fragiles', () => {
  it('occupent des emplacements de trou libres, avec une boîte de collision fine', () => {
    for (const level of levels) {
      for (let seed = 1; seed <= 20; seed++) {
        const layout = generateLayout(level.config, seed);
        const keys = layout.holes.map((h) => `${h.floor}-${h.side}-${h.slot}`);
        expect(new Set(keys).size).toBe(keys.length);
        const fragile = layout.holes.filter((h) => h.fragile);
        expect(buildColliders(layout).filter((b) => b.kind === 'fragile')).toHaveLength(fragile.length);
      }
    }
    expect(generateLayout(levels[0].config, 7).holes.some((h) => h.fragile && h.floor >= 4)).toBe(true);
  });
});

