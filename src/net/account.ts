import { BONUS_IDS, type BonusId } from '../core';

/**
 * Comptes : format de la progression, fusion, règles des pseudos et mots de passe.
 * Partagé par le navigateur (validation immédiate) et le serveur (qui refait toujours les mêmes contrôles).
 */

/** Progression d'un joueur (solo) : niveau débloqué, record et étoiles par niveau, bonus en réserve. */
export interface Progress {
  unlocked: number;
  levels: Record<string, { best?: number; stars?: number }>;
  bonus?: BonusId | null;
}

export const emptyProgress = (): Progress => ({ unlocked: 1, levels: {} });

/** Temps minimal plausible pour terminer un niveau (ms) : en dessous, le record est ignoré. */
const MIN_PLAUSIBLE_TIME = 5000;

/**
 * Nettoie une progression reçue (jamais crue sur parole) : bornes, niveaux connus, valeurs plausibles.
 * `levelIds` = identifiants des niveaux, dans l'ordre.
 */
export function normalizeProgress(raw: unknown, levelIds: string[]): Progress {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const unlocked = Math.min(levelIds.length, Math.max(1, Math.floor(Number(p.unlocked) || 1)));
  const levels: Progress['levels'] = {};
  const rawLevels = (typeof p.levels === 'object' && p.levels !== null ? p.levels : {}) as Record<string, unknown>;
  for (const id of levelIds) {
    const entry = rawLevels[id] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const best = Number(entry.best);
    const stars = Math.floor(Number(entry.stars));
    const clean: { best?: number; stars?: number } = {};
    if (Number.isFinite(best) && best >= MIN_PLAUSIBLE_TIME) clean.best = Math.round(best);
    if (stars >= 1 && stars <= 3) clean.stars = stars;
    if (clean.best !== undefined || clean.stars !== undefined) levels[id] = clean;
  }
  const bonus = BONUS_IDS.find((b) => b === p.bonus) ?? null;
  return { unlocked, levels, bonus };
}

/**
 * Fusion de deux progressions (premier passage sur un compte, autre appareil) : on garde le meilleur des deux.
 * Le bonus en réserve suit `b` (la plus récente), car c'est une ressource consommable.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const levels: Progress['levels'] = {};
  for (const id of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const x = a.levels[id] ?? {};
    const y = b.levels[id] ?? {};
    const best = [x.best, y.best].filter((v): v is number => v !== undefined);
    const stars = Math.max(x.stars ?? 0, y.stars ?? 0);
    levels[id] = { ...(best.length && { best: Math.min(...best) }), ...(stars > 0 && { stars }) };
  }
  return { unlocked: Math.max(a.unlocked, b.unlocked), levels, bonus: b.bonus ?? null };
}

// ---------- Pseudos et mots de passe ----------

export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const PASSWORD_MIN = 8;

/** Lettres (accents compris), chiffres, espace, tiret, point, souligné. */
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

/** Mots interdits dans les pseudos (liste de base, à compléter) et noms réservés. */
const FORBIDDEN = ['admin', 'moderat', 'pyrarush', 'support', 'staff', 'connard', 'salope', 'pute', 'merde', 'nazi', 'hitler', 'fuck', 'shit', 'bitch', 'nigg', 'enculé', 'encule', 'pédé', 'pede'];

/** Clé d'unicité d'un pseudo : minuscules, sans accents ni espaces superflus (« Élodie » et « elodie » sont le même). */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pseudo valide ? Renvoie la raison sinon. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `Le pseudo doit faire entre ${NAME_MIN} et ${NAME_MAX} caractères.`;
  if (!NAME_PATTERN.test(name)) return 'Lettres, chiffres, espaces, tirets, points et soulignés uniquement.';
  const key = nameKey(name).replace(/[ ._-]/g, '');
  if (FORBIDDEN.some((word) => key.includes(word))) return 'Ce pseudo n’est pas autorisé.';
  return null;
}

/** Mots de passe trop courants, refusés même s'ils sont assez longs. */
const COMMON_PASSWORDS = new Set(['12345678', '123456789', '1234567890', 'password', 'motdepasse', 'azertyui', 'azertyuiop', 'qwertyui', 'qwertyuiop', 'iloveyou', '11111111', '00000000', 'abcdefgh', 'pyrarush', 'password1', 'motdepasse1']);

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`;
  if (password.length > 128) return 'Mot de passe trop long.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Ce mot de passe est trop courant, choisis-en un autre.';
  return null;
}
