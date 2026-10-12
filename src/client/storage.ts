import { BONUS_IDS, type BonusId, type Level } from '../core';
import type { Progress } from '../net/account';

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
};

/** Prévenu à chaque changement de progression (synchronisation avec le compte). */
let onProgressChange: () => void = () => {};
const changed = () => onProgressChange();

/**
 * Progression du joueur : niveaux débloqués, records, étoiles, bonus. Copie locale (le jeu marche hors connexion),
 * synchronisée avec le compte par account/account.ts (snapshot / apply / onChange).
 */
export const progress = {
  unlocked(max: number, minimum = 1): number {
    const saved = Number(storage.get('unlocked') ?? 1);
    return Math.min(max, Math.max(1, Math.floor(Math.max(saved, minimum)) || 1));
  },
  unlock(levelNumber: number): void {
    storage.set('unlocked', String(levelNumber));
    changed();
  },
  best(level: Level): number | null {
    const v = Number(storage.get(`best:${level.config.id}`));
    return Number.isFinite(v) && v > 0 ? v : null;
  },
  /** Meilleur nombre d'étoiles obtenu (0 si jamais terminé). */
  stars(level: Level): number {
    return Math.max(0, Math.min(3, Number(storage.get(`stars:${level.config.id}`) ?? 0) || 0));
  },
  recordStars(level: Level, stars: number): boolean {
    const improved = stars > this.stars(level);
    if (improved) {
      storage.set(`stars:${level.config.id}`, String(stars));
      changed();
    }
    return improved;
  },
  /** Bonus en réserve (un seul), gagné dans un coffre du sommet. */
  bonus(): BonusId | null {
    const v = storage.get('bonus');
    return BONUS_IDS.find((b) => b === v) ?? null;
  },
  setBonus(bonus: BonusId | null): void {
    storage.set('bonus', bonus ?? '');
    changed();
  },
  /** Enregistre un temps ; renvoie true si c'est un nouveau record (et qu'il y en avait un avant). */
  recordTime(level: Level, ms: number): { isRecord: boolean; hadPrevious: boolean } {
    const previous = this.best(level);
    const isRecord = previous === null || ms < previous;
    if (isRecord) {
      storage.set(`best:${level.config.id}`, String(Math.round(ms)));
      changed();
    }
    return { isRecord, hadPrevious: previous !== null };
  },

  /** Démo de prise en main déjà faite (sur cet appareil ou sur le compte). */
  tutorialDone(): boolean {
    return storage.get('tutorial-done') === '1';
  },
  setTutorialDone(): void {
    storage.set('tutorial-done', '1');
    changed();
  },

  /** Toute la progression locale, au format partagé avec le serveur. */
  snapshot(levels: Level[]): Progress {
    const result: Progress = { unlocked: this.unlocked(levels.length), levels: {}, bonus: this.bonus(), ...(this.tutorialDone() && { tutorial: true }) };
    for (const level of levels) {
      const best = this.best(level);
      const stars = this.stars(level);
      if (best !== null || stars > 0) result.levels[level.config.id] = { ...(best !== null && { best }), ...(stars > 0 && { stars }) };
    }
    return result;
  },

  /** Remplace la progression locale (après fusion avec celle du compte). */
  apply(p: Progress, levels: Level[]): void {
    storage.set('unlocked', String(p.unlocked));
    storage.set('bonus', p.bonus ?? '');
    if (p.tutorial) storage.set('tutorial-done', '1');
    else storage.remove('tutorial-done');
    for (const level of levels) {
      const entry = p.levels[level.config.id];
      for (const [key, value] of [['best', entry?.best], ['stars', entry?.stars]] as const) {
        if (value === undefined) storage.remove(`${key}:${level.config.id}`);
        else storage.set(`${key}:${level.config.id}`, String(value));
      }
    }
  },

  /** Efface la progression de cet appareil (déconnexion, suppression du compte). */
  clear(levels: Level[]): void {
    this.apply({ unlocked: 1, levels: {}, bonus: null }, levels);
  },

  onChange(listener: () => void): void {
    onProgressChange = listener;
  },
};
