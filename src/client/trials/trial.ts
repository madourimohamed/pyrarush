import type { Rng, TrialKind } from '../../core';

/**
 * Une épreuve d'ouverture de porte, côté navigateur. Un fichier par sorte (verrou.ts, glyphes.ts…), enregistrée dans
 * index.ts. La logique (temps, appuis, réussite) est séparée du dessin : elle se teste sans écran, et un robot peut la
 * jouer avec `solve()`.
 */
export interface TrialRun {
  readonly state: 'playing' | 'success' | 'fail';
  update(dt: number): void;
  /** Action principale (toucher l'épreuve, Espace, E, bouton Action), ou choix d'un bouton (index). */
  press(choice?: number): void;
  /** Ce que ferait un joueur parfait maintenant : appuyer, choisir un bouton, ou attendre (null). */
  solve(): 'press' | number | null;
  draw(ctx: CanvasRenderingContext2D, size: number): void;
  /** Épreuves à boutons : symboles, bouton allumé, boutons utilisables ou non. */
  buttons?: { symbols: string[]; colors: string[]; lit: number | null; enabled: boolean };
  /** Sons demandés depuis la dernière image (vidés par l'affichage). */
  sounds: string[];
}

export interface TrialDef {
  kind: TrialKind;
  title: string;
  /** La règle, en une phrase. */
  rule: string;
  start(difficulty: number, rng: Rng): TrialRun;
}

export const defineTrial = (def: TrialDef): TrialDef => def;

/** Réglage selon la difficulté (1 à 5) : une valeur par palier. */
export const byDifficulty = <T>(difficulty: number, values: readonly [T, T, T, T, T]): T => values[Math.min(4, Math.max(0, Math.round(difficulty) - 1))];

export const TAU = Math.PI * 2;
/** Écart d'angle signé, ramené dans [-π, π]. */
export const angleGap = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const GOLD = '#f2c14e';
export const BRONZE = '#8a5a2a';
export const DARK = '#1c140c';
