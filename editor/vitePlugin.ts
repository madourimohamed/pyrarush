import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Éditeur de décor : accès aux fichiers pendant le développement seulement (`npm run dev`, jamais dans le jeu publié).
 *
 *   GET /__editeur/donnees              → fichiers de thème bruts, modèles et images disponibles
 *   PUT /__editeur/themes/<nom>          → écrit content/themes/<nom>.json (corps : le fichier, en JSON)
 *   PUT /__editeur/niveaux/<id>/theme    → change le thème d'un niveau (corps : { "theme": "<nom>" })
 *
 * Les écritures ne sont acceptées que depuis cet ordinateur (le serveur de développement est aussi ouvert au réseau
 * local, pour tester sur téléphone).
 */

const ROOT = process.cwd();
const THEMES = join(ROOT, 'content', 'themes');
const LEVELS = join(ROOT, 'src', 'levels');
const MODELS = join(ROOT, 'public', 'models');
const TEXTURES = join(ROOT, 'public', 'textures');
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Fichiers d'un dossier et de ses sous-dossiers (chemins relatifs, séparés par « / »). */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

/** Noms utilisables dans un thème : modèles « pack/nom » (le pack nature s'écrit sans préfixe), images sans extension. */
function data() {
  const themes = Object.fromEntries(
    files(THEMES)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(THEMES, f), 'utf8'))]),
  );
  const models = files(MODELS)
    .filter((f) => f.endsWith('.glb') && !f.startsWith('explorer/'))
    .map((f) => f.replace(/\.glb$/, '').replace(/^nature\//, ''))
    .sort();
  const images = files(TEXTURES)
    .filter((f) => f.endsWith('.jpg') && !f.endsWith('-mobile.jpg') && !f.endsWith('-normal.jpg'))
    .map((f) => f.replace(/\.jpg$/, ''))
    .sort();
  return { themes, models, images };
}

/**
 * JSON lisible : une valeur courte tient sur une ligne (`{ "use": "sky", "clouds": "#ffffff" }`),
 * les plus longues sont dépliées, une entrée par ligne.
 */
export function formatJson(value: unknown, indent = ''): string {
  const inline = inlineJson(value);
  if (inline.length + indent.length <= 110 || value === null || typeof value !== 'object') return inline;
  const inner = indent + '  ';
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + formatJson(v, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/**
 * Requête venue de cet ordinateur, adressée à localhost : un tunnel (ex. cloudflared, qui se connecte lui aussi en local)
 * garde le nom public dans l'en-tête Host et ne peut donc pas écrire.
 */
const isLocal = (req: IncomingMessage) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '');

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('fichier trop gros'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Remplace le thème d'un fichier de niveau (la ligne `theme: '…'`, qui doit être unique). */
function setLevelTheme(id: string, theme: string): void {
  const file = readdirSync(LEVELS).find((f) => f.match(/^\d+-(.+)\.ts$/)?.[1] === id);
  if (!file) throw new Error(`niveau « ${id} » introuvable`);
  const path = join(LEVELS, file);
  const source = readFileSync(path, 'utf8');
  const pattern = /^(\s*theme: )'[^']*',$/m;
  if ((source.match(new RegExp(pattern.source, 'gm')) ?? []).length !== 1) throw new Error(`${file} : ligne « theme: '…', » introuvable`);
  writeFileSync(path, source.replace(pattern, `$1'${theme}',`));
}

export function themeEditor(): Plugin {
  return {
    name: 'pyrarush-editeur',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editeur', async (req, res) => {
        try {
          const url = req.url ?? '';
          if (req.method === 'GET' && url === '/donnees') return send(res, 200, data());
          if (req.method !== 'PUT') return send(res, 404, { error: 'inconnu' });
          if (!isLocal(req)) return send(res, 403, { error: "l'éditeur n'enregistre que depuis cet ordinateur" });

          const theme = url.match(/^\/themes\/([^/]+)$/);
          if (theme) {
            if (!NAME.test(theme[1])) return send(res, 400, { error: 'nom de thème : minuscules, chiffres et tirets' });
            const file = await readBody(req);
            if (!file || typeof file !== 'object' || Array.isArray(file)) return send(res, 400, { error: 'un thème est un objet JSON' });
            writeFileSync(join(THEMES, `${theme[1]}.json`), formatJson(file) + '\n');
            return send(res, 200, { ok: true });
          }

          const level = url.match(/^\/niveaux\/([^/]+)\/theme$/);
          if (level) {
            const { theme: name } = (await readBody(req)) as { theme?: unknown };
            if (typeof name !== 'string' || !NAME.test(name)) return send(res, 400, { error: 'nom de thème invalide' });
            setLevelTheme(level[1], name);
            return send(res, 200, { ok: true });
          }
          return send(res, 404, { error: 'inconnu' });
        } catch (error) {
          send(res, 500, { error: (error as Error).message });
        }
      });
    },
  };
}
