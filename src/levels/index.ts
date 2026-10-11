import { buildLevels, type PyramidConfig } from '../core';
import templeDesSables from './01-temple-des-sables';
import oasisEmeraude from './02-oasis-emeraude';
import crepusculePourpre from './03-crepuscule-pourpre';
import pyramideDeGlace from './04-pyramide-de-glace';
import sanctuaireDeLave from './05-sanctuaire-de-lave';
import citeCeleste from './06-cite-celeste';

/**
 * Ordre de progression des niveaux : chacun se débloque en terminant le précédent.
 *
 * Ajouter un niveau :
 *   1. copier un fichier de niveau (ex. 06-cite-celeste.ts) en 07-mon-niveau.ts ;
 *   2. régler ses règles (étages, portes, trous…) et son thème (couleurs, décor, musique) ;
 *   3. l'ajouter à la fin de cette liste.
 * Les tests vérifient automatiquement que chaque niveau est valide et toujours terminable.
 */
export const levels = buildLevels([templeDesSables, oasisEmeraude, crepusculePourpre, pyramideDeGlace, sanctuaireDeLave, citeCeleste]);

export const levelConfigs: PyramidConfig[] = levels.map((l) => l.config);
