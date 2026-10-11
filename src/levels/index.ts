import { buildLevels, type LevelDefinition, type PyramidConfig } from '../core';

/**
 * Tous les niveaux, découverts automatiquement : chaque fichier « NNN-nom.ts » de ce dossier
 * (NNN = position dans la progression) exporte par défaut un defineLevel({...}).
 *
 * Ajouter un niveau = créer UN fichier, par exemple « 007-mon-niveau.ts » :
 * règles (étages, portes, trous…) + thème (une famille de themes.ts, éventuellement variée).
 * Rien d'autre à modifier : numéro, déblocage, carte du menu et record sont automatiques.
 * Les tests vérifient la numérotation (sans trou ni doublon) et que chaque niveau est valide et terminable.
 */
const modules = import.meta.glob<LevelDefinition>('./[0-9]*.ts', { eager: true, import: 'default' });

/** Fichiers de niveau triés par leur numéro (exporté pour les tests). */
export const levelFiles = Object.keys(modules)
  .map((path) => ({ path, order: Number(path.match(/^\.\/(\d+)-/)?.[1]) }))
  .sort((a, b) => a.order - b.order);

export const levels = buildLevels(levelFiles.map((f) => modules[f.path]));

export const levelConfigs: PyramidConfig[] = levels.map((l) => l.config);
