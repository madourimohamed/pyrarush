import { BONUS_IDS, type BonusId } from '../core';

/**
 * Comptes : format de la progression, fusion, règles des pseudos et mots de passe.
 * Partagé par le navigateur (validation immédiate) et le serveur (qui refait toujours les mêmes contrôles).
 */

/**
 * Niveaux connus, pour relire une progression : identifiants permanents dans l'ordre de la progression,
 * et anciens identifiants → identifiant actuel (renommages, et rangement par position d'avant le 2026-10-13).
 */
export interface LevelCatalog {
  ids: string[];
  aliases: Record<string, string>;
}

/**
 * Progression d'un joueur (solo) : niveau débloqué, record et étoiles par niveau, bonus en réserve.
 * Tout est rangé par identifiant de niveau, jamais par position : insérer ou réordonner des niveaux ne décale rien.
 */
export interface Progress {
  /** Niveau débloqué le plus loin (identifiant). Absent : seul le premier niveau (et ceux qui suivent un niveau terminé). */
  reached?: string;
  levels: Record<string, { best?: number; stars?: number }>;
  bonus?: BonusId | null;
  /** Démo de prise en main terminée (montrée au premier lancement seulement). */
  tutorial?: boolean;
  /** Éclats d'or gagnés dans les trésors (monnaie des objets cosmétiques à venir). */
  shards?: number;
}

export const emptyProgress = (): Progress => ({ levels: {} });

/** Temps minimal plausible pour terminer un niveau (ms) : en dessous, le record est ignoré. */
const MIN_PLAUSIBLE_TIME = 5000;
/** Plafond de vraisemblance des éclats (une progression envoyée au serveur n'est jamais crue sur parole). */
const MAX_SHARDS = 1_000_000;

/**
 * Nombre de niveaux jouables (les N premiers) : jusqu'au niveau atteint, et au moins jusqu'à celui qui suit
 * le niveau terminé le plus loin. Si un niveau est inséré avant, il est jouable aussitôt ; s'il est inséré après,
 * il devient le prochain à débloquer.
 */
export function unlockedCount(progress: Progress, catalog: LevelCatalog): number {
  let count = 1 + catalog.ids.indexOf(progress.reached ?? '');
  catalog.ids.forEach((id, i) => {
    if (progress.levels[id]) count = Math.max(count, i + 2);
  });
  return Math.max(1, Math.min(catalog.ids.length, count));
}

/** Identifiant actuel d'un niveau (suit les renommages), ou undefined s'il n'existe plus. */
function currentId(id: string, catalog: LevelCatalog): string | undefined {
  const resolved = catalog.aliases[id] ?? id;
  return catalog.ids.includes(resolved) ? resolved : undefined;
}

/**
 * Nettoie une progression reçue (jamais crue sur parole) : niveaux connus, valeurs plausibles.
 * Relit aussi l'ancien format (niveaux « level-N » et `unlocked` = nombre) et les anciens noms de niveaux.
 */
export function normalizeProgress(raw: unknown, catalog: LevelCatalog): Progress {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const levels: Progress['levels'] = {};
  const rawLevels = (typeof p.levels === 'object' && p.levels !== null ? p.levels : {}) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(rawLevels)) {
    const id = currentId(key, catalog);
    if (!id || !entry || typeof entry !== 'object') continue;
    const best = Number((entry as Record<string, unknown>).best);
    const stars = Math.floor(Number((entry as Record<string, unknown>).stars));
    // Un niveau et son ancien nom peuvent coexister : on garde le meilleur des deux.
    const clean = { ...levels[id] };
    if (Number.isFinite(best) && best >= MIN_PLAUSIBLE_TIME) clean.best = Math.min(clean.best ?? Infinity, Math.round(best));
    if (stars >= 1 && stars <= 3) clean.stars = Math.max(clean.stars ?? 0, stars);
    if (clean.best !== undefined || clean.stars !== undefined) levels[id] = clean;
  }
  // Ancien format : `unlocked` = position du niveau débloqué le plus loin, à l'époque où l'identifiant était « level-N ».
  const legacy = Math.floor(Number(p.unlocked));
  const reachedRaw = typeof p.reached === 'string' ? p.reached : Number.isInteger(legacy) && legacy >= 1 ? `level-${legacy}` : '';
  const progress: Progress = { levels };
  const reached = currentId(reachedRaw, catalog);
  if (reached) progress.reached = reached;
  // Rangé à sa valeur effective : le niveau jouable le plus loin.
  const count = unlockedCount(progress, catalog);
  progress.reached = catalog.ids[count - 1];
  const bonus = BONUS_IDS.find((b) => b === p.bonus) ?? null;
  const shards = Math.floor(Number(p.shards));
  return { ...progress, bonus, ...(p.tutorial === true && { tutorial: true }), ...(shards > 0 && shards <= MAX_SHARDS && { shards }) };
}

/**
 * Fusion de deux progressions (premier passage sur un compte, autre appareil) : on garde le meilleur des deux.
 * Le bonus en réserve suit `b` (la plus récente), car c'est une ressource consommable.
 */
export function mergeProgress(a: Progress, b: Progress, catalog: LevelCatalog): Progress {
  const levels: Progress['levels'] = {};
  for (const id of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const x = a.levels[id] ?? {};
    const y = b.levels[id] ?? {};
    const best = [x.best, y.best].filter((v): v is number => v !== undefined);
    const stars = Math.max(x.stars ?? 0, y.stars ?? 0);
    levels[id] = { ...(best.length && { best: Math.min(...best) }), ...(stars > 0 && { stars }) };
  }
  const reached = Math.max(unlockedCount(a, catalog), unlockedCount(b, catalog));
  const tutorial = a.tutorial === true || b.tutorial === true;
  // Éclats : le plus grand des deux totaux (fusionner deux appareils ne doit pas les compter deux fois).
  const shards = Math.max(a.shards ?? 0, b.shards ?? 0);
  return { reached: catalog.ids[reached - 1], levels, bonus: b.bonus ?? null, ...(tutorial && { tutorial }), ...(shards > 0 && { shards }) };
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
