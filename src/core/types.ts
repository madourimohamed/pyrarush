/** Nombre fixe ou intervalle [min, max] tiré au sort à la génération. */
export type CountSpec = number | [number, number];

/** Règles appliquées à une tranche d'étages (inclusive). */
export interface FloorBand {
  floors: [number, number];
  /** Nombre de passages (+1 étage). Toujours >= 1 : garantit qu'une pyramide est terminable. */
  passages: number;
  /** Autres mécaniques placées sur l'étage, par identifiant (voir mechanics/registry.ts). Le reste des portes sont des murs. */
  mechanics: Record<string, CountSpec>;
  /** Trous dans la terrasse, à franchir en sautant. Ignoré à l'étage 1 (le sol). */
  holes: CountSpec;
}

export interface PyramidConfig {
  id: string;
  name: string;
  difficulty: string;
  floors: number;
  /** Portes par face au dernier étage ; chaque étage inférieur en a une de plus par face. */
  doorsPerSideAtTop: number;
  /** Perte maximale d'étages en un seul effet. */
  maxFloorsLost: number;
  /** Gain maximal d'étages en un seul effet (le passage classique fait toujours +1). */
  maxFloorsGained: number;
  /** Un bonus (> +1) ne peut jamais déposer le joueur sur les N derniers étages (0 = jusqu'au dernier étage, jamais au sommet). */
  protectedTopFloors: number;
  /** Durée pendant laquelle un passage découvert est visible par tous. */
  publicRevealMs: number;
  /** Indice donné par les murs vers le passage le plus proche du même étage. */
  hints: HintMode;
  bands: FloorBand[];
  /** Nombre maximal d'occurrences d'une mécanique sur toute la pyramide (ex. téléporteurs rares). */
  limits?: Record<string, number>;
  /** Réglages propres à chaque mécanique, par identifiant (ex. { teleportUp: { min: 3, max: 4 } }). */
  settings?: Record<string, Record<string, number>>;
}

export interface PlayerState {
  id: string;
  floor: number;
  bestFloor: number;
  /** Passages que ce joueur a lui-même découverts ou empruntés : base des indices privés. */
  knownPassages: Set<string>;
  /** Portes à usage unique déjà consommées par ce joueur. */
  usedDoors: Set<string>;
  falls: number;
  doorsTested: number;
  finishedAt?: number;
}

export interface Door {
  id: string;
  floor: number;
  /** Face de la pyramide : 0 = sud (+z), 1 = est (+x), 2 = nord (-z), 3 = ouest (-x). */
  side: number;
  /** Position de la porte sur sa face, de gauche à droite vue de l'extérieur. */
  slot: number;
  /** Position dans l'anneau de l'étage (side * portesParFace + slot), utile pour les distances. */
  ring: number;
  mechanic: string;
  /** Paramètres fixés à la génération (ex. nombre d'étages perdus). La disposition ne change jamais pendant la partie. */
  params: Record<string, number>;
}

export interface Hole {
  floor: number;
  side: number;
  /** Le trou est situé juste à droite de la porte `slot` de cet étage. */
  slot: number;
}

export interface Layout {
  seed: number;
  config: PyramidConfig;
  /** doorsPerSide[floor] (index 0 inutilisé). */
  doorsPerSide: number[];
  doors: Door[];
  doorsByFloor: Door[][];
  holes: Hole[];
}

/**
 * - scarab : un scarabée sort du mur et détale dans la direction du passage le plus proche (direction, pas la porte exacte) ;
 * - hotCold : chaud / tiède / froid selon la distance ;
 * - none : aucun indice.
 */
export type HintMode = 'scarab' | 'hotCold' | 'none';
export type HotColdLevel = 'chaud' | 'tiede' | 'froid';

export type Hint =
  | { type: 'hotCold'; level: HotColdLevel }
  /** dir : +1 = sens des portes croissantes autour de l'anneau, −1 = sens inverse. near : passage à 2 portes ou moins. */
  | { type: 'scarab'; dir: 1 | -1; near: boolean };

/** Étage spécial : atteindre floors + 1 signifie être au sommet. */
export const summitFloor = (config: PyramidConfig) => config.floors + 1;

export type GameEvent =
  | {
      type: 'doorResult';
      playerId: string;
      doorId: string;
      mechanic: string;
      /** Effet visuel à jouer : 'passage', 'wall', 'smallTrap', 'bigTrap', 'teleportUp', 'teleportDown', 'riskyWin', 'riskyLose'... */
      fx: string;
      from: number;
      to: number;
      hint?: Hint;
      /** Message court ; le client y ajoute la variation d'étage réelle (après bornage). */
      message: string;
    }
  | { type: 'publicReveal'; doorId: string; until: number }
  | { type: 'revealEnd'; doorId: string }
  | { type: 'floorChanged'; playerId: string; from: number; to: number; cause: 'door' | 'fall' }
  | { type: 'victory'; playerId: string; time: number };
