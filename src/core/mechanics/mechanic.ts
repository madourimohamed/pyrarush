import type { Rng } from '../rng';
import type { Door, Hint, Layout, PlayerState, PyramidConfig } from '../types';

export interface MechanicContext {
  door: Door;
  layout: Layout;
  player: PlayerState;
}

export interface MechanicOutcome {
  /** Variation d'étage demandée. Le moteur la borne ensuite selon la configuration de la pyramide. */
  delta: number;
  fx: string;
  message: string;
  hint?: Hint;
}

/**
 * Une mécanique = un type de porte. Pour ajouter une règle au jeu :
 * 1. créer un objet Mechanic ;
 * 2. l'enregistrer dans registry.ts ;
 * 3. l'activer dans la configuration d'une pyramide (config/pyramids.ts).
 */
export interface Mechanic {
  id: string;
  label: string;
  /** Si défini, la porte est reconnaissable avant d'être testée (un pari assumé plutôt qu'une punition cachée). */
  appearance?: { color: number; symbol: (config: PyramidConfig) => string };
  /** Un succès s'illumine quelques secondes pour tous les joueurs. */
  revealPublicly?: boolean;
  /** Mémorisée comme passage dans les indices privés du joueur. */
  rememberAsPassage?: boolean;
  /** Après usage, se comporte comme un mur pour ce joueur. */
  oncePerPlayer?: boolean;
  /** Étages où la mécanique peut être placée (par défaut : tous). */
  canPlace?(floor: number, config: PyramidConfig): boolean;
  /** Paramètres tirés une fois à la génération, puis fixes pendant toute la partie. */
  generateParams?(rng: Rng, floor: number, config: PyramidConfig): Record<string, number>;
  resolve(ctx: MechanicContext): MechanicOutcome;
}

export function setting(config: PyramidConfig, mechanicId: string, key: string, fallback: number): number {
  return config.settings?.[mechanicId]?.[key] ?? fallback;
}
