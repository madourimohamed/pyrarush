import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative } from 'node:path';

/** `file` est-il bien à l'intérieur du dossier `dir` ? (« dist-server » ne doit pas passer pour « dist ».) */
export function inside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Fichier du jeu compilé correspondant à une adresse demandée, ou null si l'adresse est invalide (réponse 400).
 * Toute adresse inconnue renvoie index.html (application d'une seule page).
 * Ne lève jamais d'exception : une adresse mal encodée ne doit pas pouvoir arrêter le serveur.
 */
export function resolveStatic(dist: string, url: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const path = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const file = join(dist, path);
  if (!inside(dist, file) || !existsSync(file) || statSync(file).isDirectory()) return join(dist, 'index.html');
  return file;
}
