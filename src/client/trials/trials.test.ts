import { describe, expect, it } from 'vitest';
import { generateLayout, Rng, TRIAL_KINDS, TRIAL_MAX, TRIAL_MIN, trialFor } from '../../core';
import { levels } from '../../levels';
import { TRIALS } from './index';
import type { TrialRun } from './trial';

const DT = 1 / 60;

/** Joue une épreuve comme un joueur parfait (ce que propose `solve()`), et renvoie le temps mis. */
function playPerfectly(run: TrialRun, limit = 30): number {
  let time = 0;
  while (run.state === 'playing' && time < limit) {
    const move = run.solve();
    if (move === 'press') run.press();
    else if (typeof move === 'number') run.press(move);
    run.update(DT);
    time += DT;
  }
  return time;
}

describe("épreuves d'ouverture des portes", () => {
  it('chaque sorte déclarée dans le socle a son épreuve dans le navigateur', () => {
    for (const kind of TRIAL_KINDS) expect(TRIALS[kind]?.kind, kind).toBe(kind);
  });

  it('un joueur parfait réussit chaque épreuve, à chaque difficulté, en un temps raisonnable', () => {
    for (const kind of TRIAL_KINDS) {
      for (let difficulty = TRIAL_MIN; difficulty <= TRIAL_MAX; difficulty++) {
        for (const seed of [1, 7, 2026]) {
          const run = TRIALS[kind].start(difficulty, new Rng(seed));
          const time = playPerfectly(run);
          expect(run.state, `${kind} ${difficulty} ${seed}`).toBe('success');
          // Les plus faciles se jouent en quelques secondes ; les plus dures restent courtes.
          expect(time, `${kind} ${difficulty}`).toBeLessThan(difficulty <= 2 ? 6 : 10);
        }
      }
    }
  });

  it('appuyer au mauvais moment fait échouer', () => {
    for (const kind of TRIAL_KINDS) {
      const run = TRIALS[kind].start(3, new Rng(5));
      if (kind === 'glyphes') {
        // Attendre la fin de l'affichage de la suite, puis choisir le mauvais glyphe.
        let guard = 0;
        while (run.solve() === null && guard++ < 2000) run.update(DT);
        run.press(((run.solve() as number) + 1) % 4);
      } else {
        // Au départ, l'aiguille (ou l'anneau) est toujours loin de sa cible.
        expect(run.solve()).toBeNull();
        run.press();
      }
      expect(run.state, kind).toBe('fail');
    }
  });

  it("chaque porte a une épreuve déterministe, de la bonne sorte et d'une difficulté croissante avec l'étage", () => {
    for (const level of levels) {
      const layout = generateLayout(level.config, 42);
      let previous = 0;
      for (let floor = 1; floor <= level.config.floors; floor++) {
        const door = layout.doorsByFloor[floor][0];
        const trial = trialFor(level.config, layout, door);
        expect(trialFor(level.config, layout, door)).toEqual(trial);
        expect(level.config.trials.kinds).toContain(trial.kind);
        expect(trial.difficulty).toBeGreaterThanOrEqual(previous);
        expect(trial.difficulty).toBeGreaterThanOrEqual(TRIAL_MIN);
        expect(trial.difficulty).toBeLessThanOrEqual(TRIAL_MAX);
        previous = trial.difficulty;
        expect(trialFor(level.config, layout, door, 1).seed).not.toBe(trial.seed);
      }
    }
  });
});
