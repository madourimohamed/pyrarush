import { POWER_IDS, type PowerId, type PowerReserve } from '../core';

/**
 * Protocole du duel entre amis (WebSocket, messages JSON), partagé par le navigateur et le serveur.
 * Chaque client fait tourner le moteur pour son propre joueur (réponse immédiate) et envoie ses actions ;
 * le serveur les rejoue sur sa partie (même graine = même pyramide) et fait autorité : réserves de pouvoirs,
 * mines, sceaux, coups, étages, vainqueur.
 * Les actions qui changent l'état portent un numéro `seq` ; le serveur renvoie l'état de référence du joueur (`self`)
 * avec le dernier `seq` traité : le client ne se recale que s'il n'attend plus de réponse (pas de faux retour en arrière).
 */

export type Vec3Tuple = [number, number, number];

export type ClientMessage =
  | { t: 'create'; level: number; name: string }
  | { t: 'join'; code: string; name: string }
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

export interface DuelResult extends RoomPlayer {
  floor: number;
  falls: number;
  doorsTested: number;
  /** Temps d'arrivée au sommet (ms de course), pour le vainqueur. */
  time?: number;
}

export type ServerMessage =
  /** État de la salle (à la création, à chaque arrivée ou départ). `you` = identifiant du destinataire. */
  | { t: 'room'; code: string; level: number; you: string; players: RoomPlayer[] }
  /** Départ : même graine pour tous, la course démarre dans `inMs`. */
  | { t: 'start'; seed: number; level: number; inMs: number }
  | { t: 'pos'; id: string; p: Vec3Tuple; ry: number }
  /** L'adversaire a trouvé un passage : visible par tous pendant `ms`. */
  | { t: 'reveal'; id: string; doorId: string; ms: number }
  | { t: 'floor'; id: string; floor: number }
  | { t: 'finish'; winner: string; reason: 'summit' | 'forfeit'; results: DuelResult[] }
  /** État de référence du destinataire après ses actions (ou un coup reçu). Durées restantes en ms. */
  | { t: 'self'; seq: number; floor: number; shield: boolean; powers: PowerReserve; turboMs: number; immuneMs: number }
  /** Pouvoir trouvé derrière une porte à pouvoir. */
  | { t: 'gain'; power: PowerId; doorId: string }
  /** Ce que l'on voit d'un joueur : bouclier, turbo, immunité (durées restantes en ms). */
  | { t: 'state'; id: string; shield: boolean; turboMs: number; immuneMs: number }
  | { t: 'seal'; doorId: string; owner: string; ms: number }
  | { t: 'mine'; id: number; owner: string; p: Vec3Tuple }
  | { t: 'mineGone'; id: number }
  /** Une mine a explosé sous `target` : bouclier ou projection (étage `from` → `to`). */
  | { t: 'boom'; mine: number; target: string; shielded: boolean; from: number; to: number }
  /** Un joueur demande une revanche (en attente de l'autre). */
  | { t: 'rematch'; id: string }
  | { t: 'error'; message: string };

export const DUEL_PLAYERS = 2;
/** Compte à rebours entre l'arrivée du second joueur et le départ. */
export const DUEL_COUNTDOWN_MS = 5000;

/** Codes de salle lisibles, sans caractères ambigus (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
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
  switch (msg.t) {
    case 'create':
      return num(msg.level) && str(msg.name) ? (msg as ClientMessage) : null;
    case 'join':
      return str(msg.code, 12) && str(msg.name) ? (msg as ClientMessage) : null;
    case 'pos':
      return vec(msg.p) && num(msg.ry) ? (msg as ClientMessage) : null;
    case 'interact':
      return num(msg.seq) && str(msg.doorId) && vec(msg.p) ? (msg as ClientMessage) : null;
    case 'floor':
      return num(msg.seq) && num(msg.floor) ? (msg as ClientMessage) : null;
    case 'power':
      return num(msg.seq) && POWER_IDS.includes(msg.power as PowerId) && vec(msg.p) ? (msg as ClientMessage) : null;
    case 'rematch':
    case 'leave':
      return msg as ClientMessage;
    default:
      return null;
  }
}
