import { buildLevels, resolveThemes, type LevelDefinition, type PyramidConfig, type ThemeFile } from '../core';
import type { LevelCatalog } from '../net/account';

/**
 * Tous les niveaux, découverts automatiquement : chaque fichier « NNN-nom.ts » de ce dossier exporte par défaut
 * un defineLevel({...}). NNN = position dans la progression ; « nom » = identifiant permanent du niveau.
 *
 * Ajouter un niveau = créer UN fichier, par exemple « 007-mon-niveau.ts » :
 * règles (étages, portes, trous…) + nom du thème (un fichier de content/themes/).
 * Rien d'autre à modifier : numéro, déblocage, carte du menu et record sont automatiques.
 *
 * Insérer ou réordonner des niveaux : changer seulement les numéros NNN, jamais les noms. Records, étoiles et
 * déblocage sont rangés sous le nom : ils suivent le niveau. Renommer un niveau : ajouter l'ancien nom à `formerIds`.
 * Les tests vérifient la numérotation (sans trou ni doublon), les identifiants et que chaque niveau est terminable.
 */
const modules = import.meta.glob<LevelDefinition>('./[0-9]*.ts', { eager: true, import: 'default' });

/** Fichiers de niveau triés par leur numéro (exporté pour les tests). */
export const levelFiles = Object.keys(modules)
  .map((path) => {
    const [, order, id] = path.match(/^\.\/(\d+)-(.+)\.ts$/) ?? [];
    return { path, order: Number(order), id };
  })
  .sort((a, b) => a.order - b.order);

/**
 * Thèmes : un fichier JSON par thème dans content/themes/, découvert automatiquement (nom du fichier = nom du thème).
 * Décor modifiable sans toucher au code (à la main ou avec l'éditeur de décor) ; format décrit dans core/themeFile.ts.
 */
const themeFiles = import.meta.glob<ThemeFile>('../../content/themes/*.json', { eager: true, import: 'default' });
export const themes = resolveThemes(Object.fromEntries(Object.entries(themeFiles).map(([path, file]) => [path.match(/([^/]+)\.json$/)![1], file])));

export const levels = buildLevels(
  levelFiles.map((f) => ({ id: f.id, definition: modules[f.path] })),
  themes,
);

export const levelConfigs: PyramidConfig[] = levels.map((l) => l.config);

/** Identifiants dans l'ordre et anciens noms : de quoi relire n'importe quelle progression enregistrée (jeu et serveur). */
export const levelCatalog: LevelCatalog = {
  ids: levels.map((l) => l.id),
  aliases: Object.fromEntries(levels.flatMap((l) => l.formerIds.map((former) => [former, l.id]))),
};

/** Niveau par identifiant (actuel ou ancien). */
export function levelById(id: string) {
  const current = levelCatalog.aliases[id] ?? id;
  return levels.find((l) => l.id === current);
}
