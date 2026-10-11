import { BONUS_IDS, type BonusId, type Level } from '../core';

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
};

/** Progression du joueur : niveaux débloqués et records. */
export const progress = {
  unlocked(max: number, minimum = 1): number {
    const saved = Number(storage.get('unlocked') ?? 1);
    return Math.min(max, Math.max(1, Math.floor(Math.max(saved, minimum)) || 1));
  },
  unlock(levelNumber: number): void {
    storage.set('unlocked', String(levelNumber));
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
    if (improved) storage.set(`stars:${level.config.id}`, String(stars));
    return improved;
  },
  /** Bonus en réserve (un seul), gagné dans un coffre du sommet. */
  bonus(): BonusId | null {
    const v = storage.get('bonus');
    return BONUS_IDS.find((b) => b === v) ?? null;
  },
  setBonus(bonus: BonusId | null): void {
    storage.set('bonus', bonus ?? '');
  },
  /** Enregistre un temps ; renvoie true si c'est un nouveau record (et qu'il y en avait un avant). */
  recordTime(level: Level, ms: number): { isRecord: boolean; hadPrevious: boolean } {
    const previous = this.best(level);
    const isRecord = previous === null || ms < previous;
    if (isRecord) storage.set(`best:${level.config.id}`, String(Math.round(ms)));
    return { isRecord, hadPrevious: previous !== null };
  },
};
