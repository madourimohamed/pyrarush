import type { BonusId, Level } from '../core';
import { levelCatalog } from '../levels';
import { emptyProgress, normalizeProgress, unlockedCount, type Progress } from '../net/account';

/** Stockage local tolérant : en navigation privée ou si le stockage est bloqué, le jeu continue sans sauvegarde. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : on continue sans */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* stockage indisponible */
    }
  },
  /** Toutes les clés enregistrées (vide si le stockage est indisponible). */
  keys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
};

/** Prévenu à chaque changement de progression (synchronisation avec le compte). */
let onProgressChange: () => void = () => {};

const PROGRESS_KEY = 'progress';
/** Anciennes clés (une par valeur, niveaux rangés par position) : relues une fois, puis effacées. */
const LEGACY_KEY = /^(unlocked|bonus|tutorial-done|(best|stars):level-\d+)$/;

function readLegacy(): Record<string, unknown> {
  const levels: Record<string, Record<string, number>> = {};
  for (const key of storage.keys()) {
    const m = key.match(/^(best|stars):(level-\d+)$/);
    if (m) (levels[m[2]] ??= {})[m[1]] = Number(storage.get(key));
  }
  return { unlocked: storage.get('unlocked'), levels, bonus: storage.get('bonus'), tutorial: storage.get('tutorial-done') === '1' };
}

/** Progression en mémoire (le stockage peut être indisponible : le jeu continue, sans sauvegarde). */
let current: Progress | null = null;

function load(): Progress {
  if (current) return current;
  const saved = storage.get(PROGRESS_KEY);
  let raw: unknown = null;
  try {
    raw = saved ? JSON.parse(saved) : null;
  } catch {
    /* sauvegarde illisible : on repart des anciennes clés, sinon de zéro */
  }
  current = normalizeProgress(raw ?? readLegacy(), levelCatalog);
  if (!saved) {
    save(current);
    for (const key of storage.keys()) if (LEGACY_KEY.test(key)) storage.remove(key);
  }
  return current;
}

function save(p: Progress): void {
  current = p;
  storage.set(PROGRESS_KEY, JSON.stringify(p));
}

/** Modifie la progression, l'enregistre et prévient la synchronisation. */
function change(edit: (p: Progress) => Progress): void {
  save(edit(load()));
  onProgressChange();
}

const entry = (level: Level) => load().levels[level.id] ?? {};

/**
 * Progression du joueur : niveaux débloqués, records, étoiles, bonus. Copie locale (le jeu marche hors connexion),
 * synchronisée avec le compte par account/account.ts (snapshot / apply / onChange). Rangée par identifiant de niveau.
 */
export const progress = {
  /** Nombre de niveaux jouables (les N premiers) ; `minimum` pour les tests (?debloquer=6). */
  unlocked(minimum = 1): number {
    return Math.min(levelCatalog.ids.length, Math.max(unlockedCount(load(), levelCatalog), Math.floor(minimum) || 1));
  },
  /** Débloque les niveaux jusqu'à `level` compris (sans rien reverrouiller). */
  unlock(level: Level): void {
    if (level.number > unlockedCount(load(), levelCatalog)) change((p) => ({ ...p, reached: level.id }));
  },
  best(level: Level): number | null {
    return entry(level).best ?? null;
  },
  /** Meilleur nombre d'étoiles obtenu (0 si jamais terminé). */
  stars(level: Level): number {
    return entry(level).stars ?? 0;
  },
  recordStars(level: Level, stars: number): boolean {
    const improved = stars > this.stars(level);
    if (improved) change((p) => ({ ...p, levels: { ...p.levels, [level.id]: { ...entry(level), stars } } }));
    return improved;
  },
  /** Bonus en réserve (un seul), gagné dans un coffre du sommet. */
  /** Éclats d'or gagnés au total. */
  shards(): number {
    return load().shards ?? 0;
  },
  addShards(count: number): void {
    if (count > 0) change((p) => ({ ...p, shards: (p.shards ?? 0) + Math.floor(count) }));
  },
  bonus(): BonusId | null {
    return load().bonus ?? null;
  },
  setBonus(bonus: BonusId | null): void {
    change((p) => ({ ...p, bonus }));
  },
  /** Enregistre un temps ; renvoie true si c'est un nouveau record (et qu'il y en avait un avant). */
  recordTime(level: Level, ms: number): { isRecord: boolean; hadPrevious: boolean } {
    const previous = this.best(level);
    const isRecord = previous === null || ms < previous;
    if (isRecord) change((p) => ({ ...p, levels: { ...p.levels, [level.id]: { ...entry(level), best: Math.round(ms) } } }));
    return { isRecord, hadPrevious: previous !== null };
  },

  /** Démo de prise en main déjà faite (sur cet appareil ou sur le compte). */
  tutorialDone(): boolean {
    return load().tutorial === true;
  },
  setTutorialDone(): void {
    change((p) => ({ ...p, tutorial: true }));
  },

  /** Toute la progression locale, au format partagé avec le serveur. */
  snapshot(): Progress {
    return load();
  },

  /** Remplace la progression locale (après fusion avec celle du compte). */
  apply(p: Progress): void {
    save(normalizeProgress(p, levelCatalog));
  },

  /** Efface la progression de cet appareil (déconnexion, suppression du compte). */
  clear(): void {
    this.apply(emptyProgress());
  },

  onChange(listener: () => void): void {
    onProgressChange = listener;
  },
};
