import type { TrialRules } from './trials';
import type { TreasureId } from './mechanics/treasure';

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
  /** Dalles fragiles (fissurées) : elles s'effondrent sous les pieds, il faut les sauter. Mêmes emplacements que les trous. */
  fragile?: CountSpec;
}

export interface PyramidConfig {
  id: string;
  name: string;
  floors: number;
  /** Portes par face au dernier étage ; chaque étage inférieur en a une de plus par face. */
  doorsPerSideAtTop: number;
  /**
   * Portes par face au premier étage. Les étages intermédiaires sont interpolés et les portes réparties
   * sur toute la longueur de la paroi. Absent : une porte de plus par face à chaque étage (pyramide dense).
   */
  doorsPerSideAtBase?: number;
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
  /** Épreuves d'ouverture des portes : sortes mélangées et difficulté du premier au dernier étage (voir trials.ts). */
  trials: TrialRules;
  /** Part des portes « indice » (murs) changées en trésors, de 0 à 1 (voir mechanics/treasure.ts). */
  treasureShare: number;
}

export interface PlayerState {
  id: string;
  floor: number;
  bestFloor: number;
  /** Passages que ce joueur a lui-même découverts ou empruntés : base des indices privés. */
  knownPassages: Set<string>;
  /** Portes à usage unique déjà consommées par ce joueur. */
  usedDoors: Set<string>;
  /** Portes déjà essayées par ce joueur et ce qu'il y a découvert : base de la trace privée des portes. */
  tried: Map<string, TriedOutcome>;
  /** Bouclier d'Anubis actif : la prochaine chute (piège, trou ou attaque) est annulée. */
  shield: boolean;
  /** Dernière bonne porte franchie (duel : le Sceau magique la bloque derrière soi). */
  lastPassage?: { doorId: string; at: number };
  falls: number;
  doorsTested: number;
  /** Éclats d'or ramassés dans les trésors pendant la partie. */
  shards: number;
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
  /** Indice parmi les emplacements de trou possibles de cette terrasse (voir geometry.holeTangents). */
  slot: number;
  /** Dalle fragile : le trou est recouvert d'une dalle qui s'effondre quand on marche dessus, puis se reforme. */
  fragile?: boolean;
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
  /**
   * dir : +1 = sens des portes croissantes autour de l'anneau, −1 = sens inverse ; near : passage à 2 portes ou moins ;
   * doors : nombre de portes jusqu'au passage ; target : porte visée (pour régler la course du scarabée, jamais montrée).
   */
  | { type: 'scarab'; dir: 1 | -1; near: boolean; doors: number; target: string };

/**
 * Bonus gagnés dans les coffres du sommet (un seul en réserve, utilisable une fois) :
 * eye = Œil de Râ (montre un passage de l'étage), shield = Bouclier d'Anubis (annule la prochaine chute),
 * hourglass = Sablier de Thot (−10 s au chronomètre). Jamais indispensables pour gagner.
 */
export const BONUS_IDS = ['eye', 'shield', 'hourglass'] as const;
export type BonusId = (typeof BONUS_IDS)[number];
/** Durée de l'Œil de Râ et gain du Sablier de Thot (ms). */
export const BONUS_EYE_MS = 5000;
export const BONUS_HOURGLASS_MS = 10000;

/** Ce qu'un joueur a découvert derrière une porte : un passage (monte), un indice (mur), un piège (descend ou repousse), un trésor. */
/** 'power' : en multijoueur, un pouvoir a été trouvé derrière cette porte (marque ajoutée par le navigateur). */
export type TriedOutcome = 'up' | 'wall' | 'trap' | 'power' | 'treasure';

/** Effets de porte joués par un gardien (gant ou momie) qui projette le joueur : pièges et pari perdu. */
export const TRAP_FX: readonly string[] = ['smallTrap', 'bigTrap', 'riskyLose'];

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
  | { type: 'floorChanged'; playerId: string; from: number; to: number; cause: 'door' | 'fall' | 'attack' }
  | { type: 'victory'; playerId: string; time: number }
  | { type: 'bonusUsed'; playerId: string; bonus: BonusId; timeBonusMs?: number }
  /** Passage montré à un seul joueur (Œil de Râ). */
  | { type: 'privateReveal'; playerId: string; doorId: string; until: number }
  /** Le bouclier a annulé une chute : par une porte (piège) ou physique (trou, bord) ; le joueur reste à `floor`. */
  | { type: 'shielded'; playerId: string; cause: 'door' | 'fall' | 'attack'; floor: number }
  /** Duel : attaque subie (mine) ; `to` = étage après le coup (au plus un de moins). */
  | { type: 'knocked'; playerId: string; from: number; to: number }
  /** Duel : porte scellée par un joueur (bloquée pour les autres jusqu'à `until`). */
  | { type: 'sealed'; doorId: string; owner: string; until: number }
  | { type: 'unsealed'; doorId: string }
  /** Duel : un joueur a tenté d'ouvrir une porte scellée par l'adversaire (rien ne se passe). */
  | { type: 'doorSealed'; playerId: string; doorId: string }
  /** Trésor ramassé : éclats d'or (`amount`), bouclier, ou sablier (`timeBonusMs` retirés au chronomètre, solo seulement). */
  | { type: 'treasure'; playerId: string; doorId: string; reward: TreasureId; amount: number; timeBonusMs?: number };
