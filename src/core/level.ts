import type { CountSpec, FloorBand, PyramidConfig } from './types';
import type { Theme } from './theme';

/**
 * Socle d'un niveau. Un niveau ne contient que des données : ses règles (étages, contenu des portes, trous…)
 * et son thème (graphismes, couleurs, musique). Le moteur et le client savent jouer n'importe quel niveau.
 */
export interface Level {
  /** Position dans la progression (1, 2, 3…), déduite de l'ordre de la liste des niveaux. */
  number: number;
  name: string;
  /** Ce que le niveau apporte de nouveau, affiché dans le menu. */
  tagline: string;
  /** Durée indicative d'une partie, affichée sur la carte du niveau (ex. « 2–5 min »). */
  duration: string;
  /** Points forts listés sur la fiche du niveau. */
  highlights: string[];
  /** Objectifs des étoiles. */
  goals: LevelGoals;
  theme: Theme;
  config: PyramidConfig;
}

/**
 * Trois étoiles : 1 pour atteindre le sommet, 1 pour un temps inférieur à `time` (secondes),
 * 1 pour au plus `maxFalls` chutes. Une seule étoile suffit pour débloquer le niveau suivant.
 */
export interface LevelGoals {
  time: number;
  maxFalls: number;
}

export interface StarResult {
  stars: 1 | 2 | 3;
  fast: boolean;
  careful: boolean;
}

export function starsFor(goals: LevelGoals, timeMs: number, falls: number): StarResult {
  const fast = timeMs <= goals.time * 1000;
  const careful = falls <= goals.maxFalls;
  return { stars: (1 + Number(fast) + Number(careful)) as 1 | 2 | 3, fast, careful };
}

/** Valeurs communes à tous les niveaux, surchargeables niveau par niveau. */
export const LEVEL_DEFAULTS = {
  doorsPerSideAtTop: 2,
  publicRevealMs: 4000,
  hints: 'scarab',
} satisfies Partial<PyramidConfig>;

type Defaults = typeof LEVEL_DEFAULTS;
export type LevelRules = Omit<PyramidConfig, 'id' | 'name' | keyof Defaults> & Partial<Pick<PyramidConfig, keyof Defaults>>;

export interface LevelDefinition {
  name: string;
  tagline: string;
  duration: string;
  highlights: string[];
  goals: LevelGoals;
  rules: LevelRules;
  theme: Theme;
}

/** Déclare un niveau (aide au typage et à l'autocomplétion). */
export const defineLevel = (definition: LevelDefinition): LevelDefinition => definition;

/** Raccourci d'écriture pour une tranche d'étages : du, au, passages, autres portes, trous, dalles fragiles. */
export const band = (from: number, to: number, passages: number, mechanics: FloorBand['mechanics'], holes: CountSpec, fragile?: CountSpec): FloorBand => ({
  floors: [from, to],
  passages,
  mechanics,
  holes,
  ...(fragile !== undefined && { fragile }),
});

/** Transforme la liste ordonnée des définitions en niveaux numérotés, prêts à jouer. */
export function buildLevels(definitions: LevelDefinition[]): Level[] {
  return definitions.map(({ name, tagline, duration, highlights, goals, rules, theme }, i) => ({
    number: i + 1,
    name,
    tagline,
    duration,
    highlights,
    goals,
    theme,
    config: { ...LEVEL_DEFAULTS, ...rules, id: `level-${i + 1}`, name },
  }));
}
