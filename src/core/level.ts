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
  theme: Theme;
  config: PyramidConfig;
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
  rules: LevelRules;
  theme: Theme;
}

/** Déclare un niveau (aide au typage et à l'autocomplétion). */
export const defineLevel = (definition: LevelDefinition): LevelDefinition => definition;

/** Raccourci d'écriture pour une tranche d'étages : du, au, passages, autres portes, trous. */
export const band = (from: number, to: number, passages: number, mechanics: FloorBand['mechanics'], holes: CountSpec): FloorBand => ({
  floors: [from, to],
  passages,
  mechanics,
  holes,
});

/** Transforme la liste ordonnée des définitions en niveaux numérotés, prêts à jouer. */
export function buildLevels(definitions: LevelDefinition[]): Level[] {
  return definitions.map(({ name, tagline, rules, theme }, i) => ({
    number: i + 1,
    name,
    tagline,
    theme,
    config: { ...LEVEL_DEFAULTS, ...rules, id: `level-${i + 1}`, name },
  }));
}
