import { POWER_IDS, type PowerDensity, type PowerId, type PowerReserve } from '../core';

/**
 * Protocole du multijoueur entre amis (WebSocket, messages JSON), partagé par le navigateur et le serveur.
 * Une salle accueille de MIN_PLAYERS à MAX_PLAYERS joueurs : rien d'autre ne suppose un nombre de joueurs.
 * Chaque client fait tourner le moteur pour son propre joueur (réponse immédiate) et envoie ses actions ;
 * le serveur les rejoue sur sa partie (même graine = même pyramide) et fait autorité : réserves de pouvoirs,
 * mines, sceaux, coups, étages, vainqueur.
 * Les actions qui changent l'état portent un numéro `seq` ; le serveur renvoie l'état de référence du joueur (`self`)
 * avec le dernier `seq` traité : le client ne se recale que s'il n'attend plus de réponse (pas de faux retour en arrière).
 */

export type Vec3Tuple = [number, number, number];

export type ClientMessage =
  /** Premier message après la connexion : le jeton du compte (jamais dans l'adresse, qui peut finir dans des journaux). */
  | { t: 'hello'; token: string }
  /** Créer une salle : niveau et quantité de pouvoirs cachés (le jeu en déduit le nombre par étage). Le nom vient du compte. */
  | { t: 'create'; /** Identifiant permanent du niveau (jamais sa position). */ level: string; powers: PowerDensity }
  | { t: 'join'; code: string }
  /** L'hôte exclut un joueur de sa salle (il ne peut pas revenir pendant KICK_MS ; jamais de bannissement définitif). */
  | { t: 'kick'; id: string }
  /** Le créateur de la salle lance la partie (dès MIN_PLAYERS joueurs ; automatique quand la salle est pleine). */
  | { t: 'launch' }
  /** Position du personnage affiché (pieds) et orientation, ~15 fois par seconde. */
  | { t: 'pos'; p: Vec3Tuple; ry: number }
  | { t: 'interact'; seq: number; doorId: string; p: Vec3Tuple }
  /** Étage où le joueur se trouve physiquement après une chute (trou, dalle, bord). */
  | { t: 'floor'; seq: number; floor: number }
  /** Utiliser un pouvoir de sa réserve ; `p` = position des pieds (pour poser une mine). */
  | { t: 'power'; seq: number; power: PowerId; p: Vec3Tuple }
  | { t: 'rematch' }
  | { t: 'leave' };

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface PlayerResult extends RoomPlayer {
  /** Place au classement final (1 = premier). */
  rank: number;
  floor: number;
  falls: number;
  doorsTested: number;
  /** Temps d'arrivée au sommet (ms de course), pour ceux qui l'ont atteint. */
  time?: number;
  /** A quitté la partie avant la fin. */
  left?: boolean;
}

export type ServerMessage =
  /**
   * État de la salle (à la création, à chaque arrivée ou départ). `you` = identifiant du destinataire ;
   * `host` = le créateur (ou son remplaçant s'il est parti), seul à pouvoir lancer ; `max` = places.
   */
  | { t: 'room'; code: string; level: string; powers: PowerDensity; you: string; host: string; max: number; players: RoomPlayer[] }
  /** Départ : même graine pour tous, la course démarre dans `inMs` ; `order` = ordre des joueurs (places de départ, couleurs). */
  | { t: 'start'; seed: number; level: string; inMs: number; order: string[] }
  /** Un joueur a atteint le sommet : sa place et son temps (la course continue jusqu'au podium). */
  | { t: 'arrived'; id: string; rank: number; time: number }
  | { t: 'pos'; id: string; p: Vec3Tuple; ry: number }
  /** L'adversaire a trouvé un passage : visible par tous pendant `ms`. */
  | { t: 'reveal'; id: string; doorId: string; ms: number }
  | { t: 'floor'; id: string; floor: number }
  /** Fin de la partie : classement complet (podium atteint, délai écoulé, ou plus assez de joueurs). */
  | { t: 'finish'; reason: 'podium' | 'time' | 'forfeit'; ranking: PlayerResult[] }
  /** État de référence du destinataire après ses actions (ou un coup reçu). Durées restantes en ms. */
  | { t: 'self'; seq: number; floor: number; shield: boolean; powers: PowerReserve; turboMs: number; bootsMs: number; immuneMs: number }
  /** Pouvoir trouvé derrière une porte vide (les emplacements restent secrets, connus du serveur seul). */
  | { t: 'gain'; power: PowerId; doorId: string }
  /** Ce que l'on voit d'un joueur : bouclier, turbo, bottes, immunité (durées restantes en ms). */
  | { t: 'state'; id: string; shield: boolean; turboMs: number; bootsMs: number; immuneMs: number }
  /** Nuage de confusion envoyé par `from` sur le destinataire, pendant `ms`. */
  | { t: 'cloud'; from: string; ms: number }
  | { t: 'seal'; doorId: string; owner: string; ms: number }
  | { t: 'mine'; id: number; owner: string; p: Vec3Tuple }
  | { t: 'mineGone'; id: number }
  /** La mine de `owner` a explosé sous `target` : projeté (étage `from` → `to`), protégé par son bouclier, ou encore immunisé. */
  | { t: 'boom'; mine: number; owner: string; target: string; result: 'knocked' | 'shielded' | 'immune'; p: Vec3Tuple; from: number; to: number }
  /** Un joueur part en Voiture vers le passage `doorId` (sens `dir` le long de la terrasse), pendant `ms` : tous jouent le trajet. */
  | { t: 'ride'; id: string; doorId: string; dir: 1 | -1; ms: number }
  /** Un joueur a été piégé (gant ou momie) à `doorId` : les autres rejouent la scène sur son personnage. */
  | { t: 'trapped'; id: string; doorId: string; from: number; to: number }
  /** Un joueur demande une revanche (elle part quand tous les joueurs restants l'ont demandée). */
  | { t: 'rematch'; id: string }
  /** Le destinataire a été exclu de la salle par l'hôte. */
  | { t: 'kicked' }
  | { t: 'error'; message: string };

/** Joueurs par salle : il en faut MIN_PLAYERS pour lancer ; MAX_PLAYERS est la seule limite à changer pour des salles plus grandes. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Durée pendant laquelle un joueur exclu ne peut pas revenir dans la salle (pas de bannissement définitif). */
export const KICK_MS = 10 * 60_000;
/** Compte à rebours entre le lancement et le départ. */
export const COUNTDOWN_MS = 5000;
/**
 * Fin de partie : la course continue après le premier arrivé, jusqu'au podium (PODIUM_SIZE arrivées,
 * ou tous sauf un) ou au plus FINISH_GRACE_MS après la première arrivée.
 */
export const PODIUM_SIZE = 3;
export const FINISH_GRACE_MS = 45000;
/** Nombre d'arrivées qui termine la partie pour `players` joueurs (à deux : la première). */
export const arrivalsToFinish = (players: number) => Math.max(1, Math.min(PODIUM_SIZE, players - 1));

/** Codes de salle lisibles, sans caractères ambigus (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 6 caractères parmi 31 : environ 890 millions de codes (impossible à deviner avec la limite d'essais du serveur). */
export const ROOM_CODE_LENGTH = 6;
export const normalizeRoomCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Lecture prudente d'un message reçu (les clients ne sont jamais crus sur parole). */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const msg = m as Record<string, unknown>;
  const str = (v: unknown, max = 40) => typeof v === 'string' && v.length <= max;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(num);
  /** Entier positif (étage, numéro d'action). */
  const count = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e9;
  switch (msg.t) {
    case 'hello':
      return str(msg.token, 200) ? (msg as ClientMessage) : null;
    case 'create':
      return str(msg.level, 64) && (msg.powers === 'few' || msg.powers === 'many') ? (msg as ClientMessage) : null;
    case 'join':
      return str(msg.code, 12) ? (msg as ClientMessage) : null;
    case 'kick':
      return str(msg.id) ? (msg as ClientMessage) : null;
    case 'pos':
      return vec(msg.p) && num(msg.ry) ? (msg as ClientMessage) : null;
    case 'interact':
      return count(msg.seq) && str(msg.doorId) && vec(msg.p) ? (msg as ClientMessage) : null;
    case 'floor':
      return count(msg.seq) && count(msg.floor) && (msg.floor as number) >= 1 ? (msg as ClientMessage) : null;
    case 'power':
      return count(msg.seq) && POWER_IDS.includes(msg.power as PowerId) && vec(msg.p) ? (msg as ClientMessage) : null;
    case 'launch':
    case 'rematch':
    case 'leave':
      return msg as ClientMessage;
    default:
      return null;
  }
}
