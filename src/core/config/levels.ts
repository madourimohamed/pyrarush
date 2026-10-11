import type { CountSpec, FloorBand, PyramidConfig } from '../types';

/**
 * Les niveaux du jeu, débloqués l'un après l'autre. Chaque niveau = des règles (pyramide) + un thème visuel.
 *
 * Ajouter un niveau = ajouter UNE entrée à LEVEL_DEFINITIONS (et son thème dans client/scene/themes.ts).
 * Le numéro et l'identifiant sont déduits de la position dans la liste ; les valeurs communes viennent de DEFAULTS.
 * Les tests vérifient automatiquement que chaque niveau est valide, terminable et possède un thème.
 *
 * Rappel : nombre de portes par étage = 4 faces × (doorsPerSideAtTop + étages au-dessus).
 */
export interface Level {
  number: number;
  name: string;
  /** Ce que le niveau apporte de nouveau, affiché dans le menu. */
  tagline: string;
  /** Identifiant du thème visuel (client/scene/themes.ts). Le moteur ne fait que le transmettre. */
  theme: string;
  config: PyramidConfig;
}

type Rules = Omit<PyramidConfig, 'id' | 'name' | keyof typeof DEFAULTS> & Partial<Pick<PyramidConfig, keyof typeof DEFAULTS>>;

interface LevelDefinition {
  name: string;
  tagline: string;
  theme: string;
  rules: Rules;
}

const DEFAULTS = {
  doorsPerSideAtTop: 2,
  publicRevealMs: 4000,
  hints: 'scarab',
} satisfies Partial<PyramidConfig>;

/** Raccourci d'écriture pour une tranche d'étages. */
const band = (from: number, to: number, passages: number, mechanics: FloorBand['mechanics'], holes: CountSpec): FloorBand => ({
  floors: [from, to],
  passages,
  mechanics,
  holes,
});

/** Pyramide de 10 étages partagée par les niveaux de fin de jeu ; `extra` ajoute des mécaniques aux deux premières tranches. */
const tenFloorBands = (extra: FloorBand['mechanics'] = {}): FloorBand[] => [
  band(1, 3, 4, { smallTrap: 4, teleportUp: [0, 1], ...extra }, [1, 2]),
  band(4, 7, 3, { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1], ...extra }, [2, 3]),
  band(8, 10, 2, { smallTrap: 2, bigTrap: 2, teleportDown: [0, 1] }, [2, 3]),
];

const LEVEL_DEFINITIONS: LevelDefinition[] = [
  {
    name: 'Le Temple des Sables',
    tagline: 'Passages, murs et gants de boxe : apprends les bases.',
    theme: 'sables',
    rules: {
      floors: 6,
      // Les pièges font perdre 1 étage ; seule la porte risquée (visible, choisie) va jusqu'à ±2.
      maxFloorsLost: 2,
      maxFloorsGained: 2,
      // Un bonus ne dépose jamais sur le dernier étage : depuis l'étage 3, la porte ±2 mène au 5 au mieux.
      protectedTopFloors: 1,
      bands: [
        band(1, 1, 2, { smallTrap: 2 }, 0),
        band(2, 2, 2, { smallTrap: 3 }, [1, 2]),
        band(3, 3, 2, { smallTrap: 3, riskyDoor: 1 }, [1, 2]), // ±2 : vers l'étage 5 ou l'étage 1
        band(4, 4, 2, { smallTrap: 3 }, 2),
        band(5, 6, 1, { smallTrap: 3 }, 2), // un seul passage en haut : le sommet se mérite
      ],
      settings: { riskyDoor: { amount: 2 } },
    },
  },
  {
    name: "L'Oasis Émeraude",
    tagline: 'Nouveau : le gant géant fait perdre 2 étages.',
    theme: 'oasis',
    rules: {
      floors: 6,
      maxFloorsLost: 2,
      maxFloorsGained: 2,
      protectedTopFloors: 1,
      bands: [
        band(1, 1, 2, { smallTrap: 3 }, 0),
        band(2, 2, 2, { smallTrap: 3 }, 2),
        band(3, 3, 2, { smallTrap: 3, bigTrap: 1, riskyDoor: 1 }, 2),
        band(4, 4, 2, { smallTrap: 3, bigTrap: 1 }, 2),
        band(5, 6, 1, { smallTrap: 3, bigTrap: 1 }, [2, 3]),
      ],
      settings: { riskyDoor: { amount: 2 } },
    },
  },
  {
    name: 'Le Crépuscule Pourpre',
    tagline: '8 étages. Nouveau : les téléporteurs (+2) pour revenir dans la course.',
    theme: 'crepuscule',
    rules: {
      floors: 8,
      maxFloorsLost: 3,
      maxFloorsGained: 2,
      protectedTopFloors: 2,
      bands: [
        band(1, 2, 3, { smallTrap: 3, teleportUp: [0, 1] }, [0, 2]),
        band(3, 4, 2, { smallTrap: 3, bigTrap: [1, 2], teleportUp: [0, 1], riskyDoor: 1 }, 2),
        band(5, 6, 2, { smallTrap: 3, bigTrap: 2 }, [2, 3]),
        band(7, 8, 1, { smallTrap: 3, bigTrap: 2 }, [2, 3]),
      ],
      limits: { teleportUp: 2, riskyDoor: 1 },
      settings: { teleportUp: { min: 2, max: 2 }, riskyDoor: { amount: 2 } },
    },
  },
  {
    name: 'La Pyramide de Glace',
    tagline: 'Nouveau : les téléporteurs piégés et la porte ±3.',
    theme: 'glace',
    rules: {
      floors: 8,
      maxFloorsLost: 3,
      maxFloorsGained: 3,
      protectedTopFloors: 2,
      bands: [
        band(1, 2, 3, { smallTrap: 3, teleportUp: [0, 1], riskyDoor: [0, 1] }, [1, 2]),
        band(3, 5, 2, { smallTrap: 3, bigTrap: 2, teleportUp: [0, 1], teleportDown: [0, 1], riskyDoor: [0, 1] }, [2, 3]),
        band(6, 8, 1, { smallTrap: 3, bigTrap: 2, teleportDown: [0, 1] }, [2, 3]),
      ],
      limits: { teleportUp: 2, riskyDoor: 2 },
      settings: { teleportUp: { min: 2, max: 3 }, teleportDown: { min: 2, max: 2 }, riskyDoor: { amount: 3 } },
    },
  },
  {
    name: 'Le Sanctuaire de Lave',
    tagline: '10 étages. Les pièges brûlent : jusqu’à −4 étages.',
    theme: 'lave',
    rules: {
      floors: 10,
      maxFloorsLost: 4,
      maxFloorsGained: 3,
      protectedTopFloors: 2,
      bands: tenFloorBands(),
      limits: { teleportUp: 2 },
      settings: { teleportUp: { min: 3, max: 3 }, teleportDown: { min: 2, max: 3 } },
    },
  },
  {
    name: 'La Cité Céleste',
    tagline: 'Le défi ultime, sous les étoiles : −5, +4, paris ±3.',
    theme: 'celeste',
    rules: {
      floors: 10,
      maxFloorsLost: 5,
      maxFloorsGained: 4,
      protectedTopFloors: 2,
      bands: tenFloorBands({ riskyDoor: [0, 1] }),
      limits: { teleportUp: 2, riskyDoor: 3 },
      settings: { teleportUp: { min: 3, max: 4 }, teleportDown: { min: 2, max: 3 }, riskyDoor: { amount: 3 } },
    },
  },
];

export const levels: Level[] = LEVEL_DEFINITIONS.map(({ name, tagline, theme, rules }, i) => ({
  number: i + 1,
  name,
  tagline,
  theme,
  config: { ...DEFAULTS, ...rules, id: `level-${i + 1}`, name },
}));

export const levelConfigs: PyramidConfig[] = levels.map((l) => l.config);
