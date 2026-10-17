import type { CountSpec, FloorBand, PyramidConfig } from './types';
import type { Theme } from './theme';

/**
 * Socle d'un niveau. Un niveau ne contient que des données : ses règles (étages, contenu des portes, trous…)
 * et son thème (graphismes, couleurs, musique). Le moteur et le client savent jouer n'importe quel niveau.
 */
export interface Level {
  /**
   * Identifiant permanent (ex. « temple-des-sables »), tiré du nom du fichier : c'est lui qui relie records, étoiles,
   * déblocage et salles multijoueur au niveau. Ne dépend pas de la position : on peut insérer ou réordonner des niveaux.
   */
  id: string;
  /** Anciens identifiants (renommage) : la progression enregistrée sous ces noms revient à ce niveau. */
  formerIds: string[];
  /** Position dans la progression (1, 2, 3…), déduite de l'ordre de la liste des niveaux. Affichage seulement. */
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
  /** Nom du thème (fichier content/themes/<nom>.json) et thème résolu. */
  themeId: string;
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
  /** Nom du thème : un fichier content/themes/<nom>.json (décor modifiable avec l'éditeur, sans toucher au code). */
  theme: string;
  /**
   * Anciens identifiants de ce niveau, à compléter si on renomme son fichier : sans cela, les records et étoiles
   * des joueurs seraient perdus. Ne jamais réutiliser l'ancien identifiant d'un autre niveau.
   */
  formerIds?: string[];
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

/** Format d'un identifiant de niveau : minuscules, chiffres et tirets (la partie « nom » du fichier NNN-nom.ts). */
export const LEVEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Règles complètes d'un niveau (valeurs par défaut comprises), prêtes pour le moteur. */
export const levelConfig = (id: string, { name, rules }: LevelDefinition): PyramidConfig => ({ ...LEVEL_DEFAULTS, ...rules, id, name });

/**
 * Transforme la liste ordonnée des définitions (avec leur identifiant permanent) en niveaux numérotés, prêts à jouer.
 * `themes` : thèmes disponibles, par nom (voir themeFile.ts).
 */
export function buildLevels(entries: { id: string; definition: LevelDefinition }[], themes: Record<string, Theme>): Level[] {
  return entries.map(({ id, definition }, i) => {
    const { name, tagline, duration, highlights, goals, theme, formerIds = [] } = definition;
    if (!LEVEL_ID_PATTERN.test(id)) throw new Error(`Identifiant de niveau invalide : « ${id} »`);
    if (!themes[theme]) throw new Error(`Niveau « ${id} » : thème « ${theme} » introuvable (content/themes/${theme}.json)`);
    return {
      id,
      formerIds,
      number: i + 1,
      name,
      tagline,
      duration,
      highlights,
      goals,
      themeId: theme,
      theme: themes[theme],
      config: levelConfig(id, definition),
    };
  });
}
