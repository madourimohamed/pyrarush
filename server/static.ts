import { existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

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
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) return join(dist, 'index.html');
  return file;
}
