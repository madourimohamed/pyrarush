import { Rng } from './rng';
import type { Door, Layout, PyramidConfig } from './types';

/**
 * Épreuves d'ouverture des portes : chaque porte demande une épreuve courte avant de révéler ce qu'il y a derrière.
 * Le socle ne fait que décider QUELLE épreuve et QUELLE difficulté (données pures, déterministes par la graine) ;
 * l'affichage et le jeu de l'épreuve sont dans le navigateur (client/trials/), un fichier par sorte d'épreuve.
 */

/** Sortes d'épreuves. En ajouter une : son nom ici, son fichier dans client/trials/, puis la citer dans un niveau. */
export const TRIAL_KINDS = ['verrou', 'glyphes', 'horus'] as const;
export type TrialKind = (typeof TRIAL_KINDS)[number];

/** Difficulté d'une épreuve : de 1 (très facile, 2 à 3 s) à 5 (exigeante). */
export const TRIAL_MIN = 1;
export const TRIAL_MAX = 5;

/** Règles des épreuves d'une pyramide : sortes possibles (mélangées) et difficulté du premier au dernier étage. */
export interface TrialRules {
  kinds: TrialKind[];
  difficulty: [number, number];
}

/** Une épreuve à jouer : sa sorte, sa difficulté et la graine de son tirage (positions, suites…). */
export interface Trial {
  kind: TrialKind;
  difficulty: number;
  seed: number;
}

/** Durée pendant laquelle une porte reste bloquée après une épreuve ratée. */
export const TRIAL_FAIL_LOCK_MS = 3000;

const mix = (...values: number[]) => values.reduce((h, v) => Math.imul(h ^ (v >>> 0), 0x9e3779b1) >>> 0, 0x2545f491);

/**
 * Épreuve d'une porte. La sorte et la difficulté ne dépendent que de la pyramide (graine) et de la porte : tout le monde
 * a la même épreuve devant la même porte. `attempt` change seulement le tirage (un nouvel essai n'est pas identique).
 */
export function trialFor(config: PyramidConfig, layout: Layout, door: Door, attempt = 0): Trial {
  const { kinds, difficulty } = config.trials;
  const rng = new Rng(mix(layout.seed, door.floor, door.ring, 0x7e57));
  const t = config.floors > 1 ? (door.floor - 1) / (config.floors - 1) : 0;
  const level = Math.round(difficulty[0] + (difficulty[1] - difficulty[0]) * t);
  return {
    kind: rng.pick(kinds),
    difficulty: Math.min(TRIAL_MAX, Math.max(TRIAL_MIN, level)),
    seed: mix(layout.seed, door.floor, door.ring, attempt),
  };
}
