import { doorFront, floorAtY, floorY, holeTangent, sideCoords, terraceOuterHalf, wallHalf, HOLE_WIDTH, type Vec3 } from './geometry';
import type { Layout } from './types';

/**
 * Règles du duel (TypeScript pur, partagé par le navigateur et le serveur) : pouvoirs, réglages, mines.
 * L'état (pouvoirs cachés derrière les portes, réserves, mines posées, immunités) est tenu par le serveur seul,
 * pour éviter la triche ; le moteur (Game) gère les sceaux et les coups. La pyramide est celle du solo.
 * Tous les réglages d'équilibrage sont ici.
 */

export const POWER_IDS = ['turbo', 'shield', 'seal', 'mine', 'cloud', 'boots'] as const;
export type PowerId = (typeof POWER_IDS)[number];
export type PowerReserve = Record<PowerId, number>;
export const emptyReserve = (): PowerReserve => ({ turbo: 0, shield: 0, seal: 0, mine: 0, cloud: 0, boots: 0 });

/**
 * Pouvoirs cachés derrière les portes vides (murs). Le créateur de la salle choisit « peu » ou « beaucoup » ;
 * le jeu en déduit le nombre par étage d'après le nombre de portes de l'étage (il varie donc avec le niveau).
 * Un pouvoir ramassé réapparaît POWER_RESPAWN_MS plus tard derrière une autre porte vide du même étage.
 */
export type PowerDensity = 'few' | 'many';
export const POWER_DENSITY: Record<PowerDensity, number> = { few: 0.08, many: 0.2 };
export const POWER_RESPAWN_MS = 15000;

/** Nombre de pouvoirs cachés à un étage (au moins un, jamais plus que de portes vides). */
export function powerSpotCount(doors: number, walls: number, density: PowerDensity): number {
  return Math.min(walls, Math.max(1, Math.round(doors * POWER_DENSITY[density])));
}
/** Turbo : multiplicateur de vitesse au sol et durée. */
export const TURBO_SPEED = 2;
export const TURBO_MS = 10000;
/** Sceau magique : durée du blocage, délai pour l'utiliser après le passage, repos avant de pouvoir resceller la porte. */
export const SEAL_MS = 10000;
export const SEAL_WINDOW_MS = 8000;
export const SEAL_COOLDOWN_MS = 10000;
/** Mine : délai d'armement, durée de vie, nombre maximal posé par joueur, rayon de déclenchement, distance aux portes. */
export const MINE_ARM_MS = 1000;
export const MINE_LIFETIME_MS = 60000;
export const MINE_MAX_ACTIVE = 3;
export const MINE_RADIUS = 0.9;
export const MINE_DOOR_CLEARANCE = 2;
/** Au-dessus de cette hauteur (m) au-dessus de la terrasse, on saute par-dessus la mine. */
export const MINE_JUMP_HEIGHT = 0.5;
/** Nuage de confusion : durée du voile sur l'écran de l'adversaire (les commandes restent nettes). */
export const CLOUD_MS = 3000;
/**
 * Bottes rebondissantes : durée et multiplicateur de l'impulsion du saut. Le sommet du saut reste sous la hauteur
 * d'une marche (3 m) : impossible de monter sans passer par les portes (vérifié par un test de la physique).
 */
export const BOOTS_MS = 8000;
export const BOOTS_JUMP = 1.15;
/** Immunité après une attaque subie (pas d'attaques en chaîne). */
export const IMMUNITY_MS = 4000;
/** Affichage des compteurs (pas une limite de jeu). */
export const POWER_DISPLAY_MAX = 9;

/**
 * Contenu d'un pouvoir caché, tiré au moment où il est ramassé, selon le classement (comme Mario Kart) :
 * le joueur en retard reçoit plutôt de quoi revenir (turbo, bouclier), celui en tête de quoi ralentir l'autre.
 */
export type Standing = 'behind' | 'tied' | 'ahead';
export const POWER_ODDS: Record<Standing, PowerReserve> = {
  behind: { turbo: 30, shield: 25, seal: 6, mine: 10, cloud: 9, boots: 20 },
  tied: { turbo: 17, shield: 17, seal: 16, mine: 17, cloud: 16, boots: 17 },
  ahead: { turbo: 10, shield: 15, seal: 22, mine: 25, cloud: 20, boots: 8 },
};

export function standing(myFloor: number, rivalFloor: number): Standing {
  return myFloor < rivalFloor ? 'behind' : myFloor > rivalFloor ? 'ahead' : 'tied';
}

/** Tire un pouvoir ; `random` dans [0, 1). */
export function pickPower(standing: Standing, random: number): PowerId {
  const odds = POWER_ODDS[standing];
  const total = POWER_IDS.reduce((sum, id) => sum + odds[id], 0);
  let r = random * total;
  for (const id of POWER_IDS) {
    r -= odds[id];
    if (r < 0) return id;
  }
  return POWER_IDS[POWER_IDS.length - 1];
}

/**
 * Peut-on poser une mine ici ? Sur une terrasse (au sol), dans la bande où l'on marche, loin des portes
 * (une porte doit toujours pouvoir être approchée) et pas au-dessus d'un trou ou d'une dalle fragile.
 */
export function mineSpotValid(layout: Layout, p: Vec3): boolean {
  const { config } = layout;
  const floor = floorAtY(config, p.y);
  if (floor < 1 || floor > config.floors || Math.abs(p.y - floorY(floor)) > 0.3) return false;
  const { side, radial, tangent } = sideCoords(p);
  const inner = wallHalf(config, floor);
  const outer = floor === 1 ? inner + 3 : terraceOuterHalf(config, floor);
  if (radial < inner + 0.3 || radial > outer - 0.3) return false;
  for (const door of layout.doorsByFloor[floor] ?? []) {
    const front = doorFront(config, door);
    if (Math.hypot(front.x - p.x, front.z - p.z) < MINE_DOOR_CLEARANCE) return false;
  }
  return layout.holes.every((h) => h.floor !== floor || h.side !== side || Math.abs(holeTangent(config, h) - tangent) > HOLE_WIDTH / 2 + 0.5);
}

/**
 * Un joueur qui s'est déplacé de `from` à `to` (deux positions reçues) a-t-il marché sur la mine ?
 * Le segment entier est testé : même en turbo, on ne peut pas « sauter » une mine entre deux messages.
 * Passer au-dessus en sautant ne la déclenche pas.
 */
export function mineTriggered(mine: Vec3, from: Vec3, to: Vec3): boolean {
  if (Math.abs(to.y - mine.y) > MINE_JUMP_HEIGHT || to.y < mine.y - 0.3) return false;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((mine.x - from.x) * dx + (mine.z - from.z) * dz) / len2));
  return Math.hypot(from.x + dx * t - mine.x, from.z + dz * t - mine.z) < MINE_RADIUS;
}
