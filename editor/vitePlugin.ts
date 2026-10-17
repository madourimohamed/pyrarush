import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Éditeur de décor : accès aux fichiers pendant le développement seulement (`npm run dev`, jamais dans le jeu publié).
 *
 *   GET /__editeur/donnees              → fichiers de thème bruts, modèles et images disponibles
 *   PUT /__editeur/themes/<nom>          → écrit content/themes/<nom>.json (corps : le fichier, en JSON)
 *   PUT /__editeur/niveaux/<id>/theme    → change le thème d'un niveau (corps : { "theme": "<nom>" })
 *   POST /__editeur/importer             → range un asset préparé par l'éditeur (voir Import), avec sa licence
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
/** Nom de fichier d'un asset (les packs existants utilisent aussi « _ » et des majuscules, ex. tree_palmBend). */
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const CREDITS = join(ROOT, 'CREDITS.md');

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
  // Images : les JPG s'écrivent sans extension (format historique), les autres avec (ex. arbres/acacia.png).
  const images = files(TEXTURES)
    .filter((f) => /\.(jpg|png|webp)$/.test(f) && !/-(mobile|normal)\.\w+$/.test(f))
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

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error('fichier trop gros'));
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

/**
 * Asset préparé par l'éditeur (redimensionné, versions ordinateur et téléphone) :
 * - model : public/models/<dossier>/<nom>.glb ;
 * - image, texture, panorama : public/textures/<dossier>/<nom><suffixe>.<ext> (suffixes '', '-mobile', '-normal'…).
 * La licence est obligatoire : ajoutée au LICENSE.txt du dossier et au tableau de CREDITS.md.
 */
export interface Import {
  kind: 'model' | 'image' | 'texture' | 'panorama';
  folder: string;
  name: string;
  files: { suffix: string; ext: 'glb' | 'jpg' | 'png'; data: string }[];
  license: { title: string; author: string; licence: string; url?: string };
  replace?: boolean;
}

const KIND_LABEL: Record<Import['kind'], string> = { model: 'modèle 3D', image: 'image détourée', texture: 'texture de sol', panorama: 'panorama' };
/** Suffixes de fichier : '', '-mobile', '-normal', '-normal-mobile'… */
const SUFFIX = /^(-[a-z]+)*$/;

/** Range les fichiers d'un import ; renvoie le nom à utiliser dans un thème. */
function importAsset(asset: Import): string {
  const { kind, folder, name, files: parts, license } = asset;
  if (!NAME.test(folder)) throw new Error('dossier : minuscules, chiffres et tirets');
  if (!FILE_NAME.test(name)) throw new Error('nom : lettres, chiffres, « - » et « _ »');
  if (!parts?.length || parts.some((f) => !SUFFIX.test(f.suffix) || !['glb', 'jpg', 'png'].includes(f.ext) || typeof f.data !== 'string')) throw new Error('fichiers invalides');
  for (const key of ['title', 'author', 'licence'] as const) if (!license?.[key]?.trim()) throw new Error('licence : titre, auteur et licence sont obligatoires');
  if (kind === 'model' && (parts.length !== 1 || parts[0].ext !== 'glb')) throw new Error('un modèle 3D est un seul fichier .glb');

  const dir = join(kind === 'model' ? MODELS : TEXTURES, folder);
  const targets = parts.map((f) => ({ path: join(dir, `${name}${f.suffix}.${f.ext}`), data: Buffer.from(f.data, 'base64') }));
  if (!asset.replace) {
    const existing = targets.find((t) => existsSync(t.path));
    if (existing) throw new Error(`${relative(ROOT, existing.path)} existe déjà (cocher « remplacer »)`);
  }
  if (kind === 'model' && targets[0].data.subarray(0, 4).toString() !== 'glTF') throw new Error("ce fichier n'est pas un modèle .glb");
  mkdirSync(dir, { recursive: true });
  for (const t of targets) writeFileSync(t.path, t.data);

  // Licence : un bloc par asset dans le LICENSE.txt du dossier, une ligne dans CREDITS.md.
  const date = new Date().toISOString().slice(0, 10);
  const fileNames = targets.map((t) => relative(dir, t.path)).join(', ');
  const block = [`${license.title} (${fileNames}) : ${KIND_LABEL[kind]}, ajouté le ${date}`, `Auteur / source : ${license.author}`, `Licence : ${license.licence}`]
    .concat(license.url ? [`Lien : ${license.url}`] : [])
    .join('\n');
  const licensePath = join(dir, 'LICENSE.txt');
  const previous = existsSync(licensePath) ? readFileSync(licensePath, 'utf8').trimEnd() + '\n\n' : '';
  writeFileSync(licensePath, previous + block + '\n');
  addCredit(kind === 'model' ? '## Modèles 3D' : '## Images', license, relative(ROOT, dir).split(sep).join('/') + '/');

  const ext = parts[0].ext;
  return kind === 'model' ? (folder === 'nature' ? name : `${folder}/${name}`) : `${folder}/${name}${ext === 'jpg' ? '' : `.${ext}`}`;
}

/** Ajoute une ligne à la fin du tableau d'une section de CREDITS.md. */
function addCredit(section: string, license: Import['license'], folder: string): void {
  const cell = (text: string) => text.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const author = license.url ? `[${cell(license.author)}](${license.url.trim()})` : cell(license.author);
  const line = `| ${cell(license.title)} | ${author} | ${cell(license.licence)} | \`${folder}\` |`;
  const lines = readFileSync(CREDITS, 'utf8').split('\n');
  const start = lines.indexOf(section);
  if (start < 0) throw new Error(`CREDITS.md : section « ${section} » introuvable`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('|')) end++;
  while (end < lines.length && lines[end].startsWith('|')) end++;
  lines.splice(end, 0, line);
  writeFileSync(CREDITS, lines.join('\n'));
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
          if (req.method !== 'PUT' && req.method !== 'POST') return send(res, 404, { error: 'inconnu' });
          if (!isLocal(req)) return send(res, 403, { error: "l'éditeur n'enregistre que depuis cet ordinateur" });

          if (req.method === 'POST' && url === '/importer') {
            const name = importAsset((await readBody(req, 150_000_000)) as Import);
            return send(res, 200, { ok: true, name });
          }

          const theme = url.match(/^\/themes\/([^/]+)$/);
          if (theme) {
            if (!NAME.test(theme[1])) return send(res, 400, { error: 'nom de thème : minuscules, chiffres et tirets' });
            const file = await readBody(req);
            if (!file || typeof file !== 'object' || Array.isArray(file)) return send(res, 400, { error: 'un thème est un objet JSON' });
            // Sections toujours dans le même ordre (les autres clés suivent), pour des fichiers faciles à comparer.
            const { note, extends: parent, palette, components, ...rest } = file as Record<string, unknown>;
            const ordered = { note, extends: parent, palette, components, ...rest };
            writeFileSync(join(THEMES, `${theme[1]}.json`), formatJson(JSON.parse(JSON.stringify(ordered))) + '\n');
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
