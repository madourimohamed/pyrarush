import {
  checkValues,
  levelConfig,
  PALETTE_SCHEMA,
  resolveThemes,
  type ComponentEdit,
  type ComponentEntry,
  type Field,
  type LevelDefinition,
  type Theme,
  type ThemeFile,
} from '../src/core';
import { COMPONENTS } from '../src/client/scene/components';
import { el, fieldInput, type Assets } from './fields';
import { panoramaRotation, prepare, type ImportKind } from './importer';
import { Preview } from './preview';

/**
 * Éditeur de décor (page de développement, jamais incluse dans le jeu publié).
 * On modifie les FICHIERS de thème (content/themes/*.json) : ce qu'un thème déclare lui-même est marqué « modifié »
 * (bouton ↺ pour revenir à la valeur héritée) ; le reste vient de son thème de départ ou des valeurs par défaut.
 * L'aperçu utilise le vrai rendu du jeu. « Enregistrer » écrit les fichiers ; le jeu ouvert dans un autre onglet
 * se recharge tout seul.
 */

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEED = 20261011;

interface LevelInfo {
  id: string;
  number: number;
  definition: LevelDefinition;
}

const levelModules = import.meta.glob<LevelDefinition>('/src/levels/[0-9]*.ts', { eager: true, import: 'default' });
const levels: LevelInfo[] = Object.entries(levelModules)
  .map(([path, definition]) => {
    const [, order, id] = path.match(/\/(\d+)-([^/]+)\.ts$/)!;
    return { id, number: Number(order), definition };
  })
  .sort((a, b) => a.number - b.number);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sidebar = $<HTMLDivElement>('panel');
const statusLine = $<HTMLDivElement>('status');
const preview = new Preview($<HTMLCanvasElement>('preview'));

let assets: Assets = { models: [], images: [] };
/** Fichiers en cours d'édition, et leur dernière version enregistrée (pour savoir ce qui a changé). */
let files: Record<string, ThemeFile> = {};
let saved: Record<string, string> = {};
let themes: Record<string, Theme> = {};
let resolveError: string | null = null;
let current = '';
let levelId = levels[0]?.id ?? '';
/** Éléments de décor dépliés (gardés d'un affichage à l'autre). */
const open = new Set<string>(['palette']);

const button = (text: string, onClick: () => void, className = '') => {
  const b = el('button', { type: 'button', textContent: text, className });
  b.addEventListener('click', onClick);
  return b;
};

const isDirty = (name: string) => JSON.stringify(files[name]) !== saved[name];
const keyOf = (c: { use: string; id?: string }) => c.id ?? c.use;
const level = () => levels.find((l) => l.id === levelId) ?? levels[0];

function status(text: string, kind: 'info' | 'error' | 'ok' = 'info'): void {
  statusLine.textContent = text;
  statusLine.className = kind;
}

// ---------- Lecture et écriture des fichiers (serveur de développement, editor/vitePlugin.ts) ----------

async function load(): Promise<void> {
  const response = await fetch('/__editeur/donnees');
  if (!response.ok) throw new Error("Données de l'éditeur indisponibles (lancer `npm run dev`).");
  const data = (await response.json()) as { themes: Record<string, ThemeFile>; models: string[]; images: string[] };
  files = data.themes;
  saved = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, JSON.stringify(file)]));
  assets = { models: data.models, images: data.images };
}

/** Relit la liste des modèles et images disponibles (après un import), sans toucher aux thèmes en cours d'édition. */
async function refreshAssets(): Promise<void> {
  const data = (await (await fetch('/__editeur/donnees')).json()) as Assets;
  assets = { models: data.models, images: data.images };
  document.querySelectorAll('datalist').forEach((d) => d.remove());
}

async function put(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `erreur ${response.status}`);
}

/** Erreurs de validation d'un thème résolu (mêmes règles que les tests). */
function errorsOf(name: string): string[] {
  const theme = themes[name];
  if (!theme) return [];
  const { components, ...palette } = theme;
  const errors = checkValues(PALETTE_SCHEMA, palette, 'palette', false);
  for (const { use, id, ...options } of components) {
    const component = COMPONENTS[use];
    if (!component) errors.push(`${id ?? use} : type d'élément « ${use} » inconnu`);
    else errors.push(...checkValues(component.schema, options, id ?? use));
  }
  return errors;
}

async function save(): Promise<boolean> {
  const dirty = Object.keys(files).filter(isDirty);
  if (!dirty.length) {
    status('Rien à enregistrer.');
    return true;
  }
  // Un thème modifié change aussi ceux qui en héritent : on les vérifie tous.
  const broken = Object.keys(themes).flatMap((name) => errorsOf(name).map((e) => `${name} › ${e}`));
  if (resolveError || broken.length) {
    status(`Enregistrement impossible : ${resolveError ?? broken[0]}`, 'error');
    return false;
  }
  try {
    for (const name of dirty) {
      await put(`/__editeur/themes/${name}`, files[name]);
      saved[name] = JSON.stringify(files[name]);
    }
    status(`Enregistré : ${dirty.join(', ')}. Le jeu ouvert dans un autre onglet se recharge.`, 'ok');
    render();
    return true;
  } catch (error) {
    status(`Échec de l'enregistrement : ${(error as Error).message}`, 'error');
    return false;
  }
}

async function useForLevel(): Promise<void> {
  if (!(await save())) return;
  try {
    await put(`/__editeur/niveaux/${level().id}/theme`, { theme: current });
    status(`Le niveau ${level().number} utilise maintenant le thème « ${current} ».`, 'ok');
    // Le fichier du niveau a changé : la page se recharge (la sélection est gardée dans l'adresse).
  } catch (error) {
    status(`Échec : ${(error as Error).message}`, 'error');
  }
}

// ---------- Modifications d'un fichier de thème ----------

const file = () => files[current];
const parentTheme = (): Theme | null => (file().extends ? (themes[file().extends!] ?? null) : null);
const inParent = (key: string) => parentTheme()?.components.some((c) => keyOf(c) === key) ?? false;

function paletteOverride(group: string | null, key: string): unknown {
  const palette = (file().palette ?? {}) as Record<string, Record<string, unknown> | unknown>;
  return group ? (palette[group] as Record<string, unknown> | undefined)?.[key] : palette[key];
}

function setPalette(group: string | null, key: string, value: unknown): void {
  const palette = (file().palette ??= {}) as Record<string, unknown>;
  if (!group) {
    if (value === undefined) delete palette[key];
    else palette[key] = value;
  } else {
    const values = (palette[group] ??= {}) as Record<string, unknown>;
    if (value === undefined) delete values[key];
    else values[key] = value;
    if (!Object.keys(values).length) delete palette[group];
  }
  if (!Object.keys(palette).length) delete file().palette;
}

/** Ce que le fichier déclare pour un élément de décor (liste complète ou retouches). */
function declared(key: string): Record<string, unknown> | null {
  const components = file().components;
  if (Array.isArray(components)) return components.find((c) => keyOf(c) === key) ?? null;
  return components?.[key] ?? null;
}

function setOption(key: string, option: string, value: unknown): void {
  const f = file();
  if (Array.isArray(f.components)) {
    const entry = f.components.find((c) => keyOf(c) === key)!;
    if (value === undefined) delete entry[option];
    else entry[option] = value;
    return;
  }
  const edits = (f.components ??= {}) as Record<string, ComponentEdit | null>;
  const edit = (edits[key] ??= {});
  if (value === undefined) delete edit[option];
  else edit[option] = value;
  // Plus rien de déclaré pour un élément hérité : on retire la retouche vide.
  if (inParent(key) && Object.keys(edit).length === 0) delete edits[key];
}

function removeComponent(key: string): void {
  const f = file();
  if (Array.isArray(f.components)) f.components = f.components.filter((c) => keyOf(c) !== key);
  else {
    const edits = (f.components ??= {}) as Record<string, ComponentEdit | null>;
    if (inParent(key)) edits[key] = null;
    else delete edits[key];
  }
}

function addComponent(use: string, id: string): string | null {
  const key = id || use;
  if (themes[current].components.some((c) => keyOf(c) === key)) return `« ${key} » existe déjà : donne-lui un autre nom.`;
  const f = file();
  const entry: ComponentEntry = { use, ...(id && { id }) };
  if (Array.isArray(f.components)) f.components.push(entry);
  else {
    const edits = (f.components ??= {}) as Record<string, ComponentEdit | null>;
    // Élément retiré par ce thème mais présent dans son thème de départ : on le remet à sa place d'origine.
    if (edits[key] === null && inParent(key)) delete edits[key];
    else edits[key] = id ? { use, id } : {};
  }
  open.add(key);
  return null;
}

// ---------- Bibliothèque : importer un asset ----------

const IMPORT_KINDS: Record<ImportKind, { label: string; accept: string; folder: string }> = {
  model: { label: 'Modèle 3D (.glb) : arbres, rochers, statues…', accept: '.glb', folder: 'decor' },
  image: { label: 'Image détourée (.png) : arbres plats, silhouettes…', accept: 'image/png,image/webp', folder: 'arbres' },
  texture: { label: 'Texture de sol (sable, herbe, neige…)', accept: 'image/*', folder: 'sol' },
  panorama: { label: 'Panorama 360° (fond, image 2 fois plus large que haute)', accept: 'image/*', folder: 'panoramas' },
};
const LICENCES = ['CC0 1.0', 'CC BY 4.0', 'Créé pour le jeu', 'Généré par IA', 'Autre'];

/** Nom de fichier tiré du fichier choisi : « Acacia 01.png » → « Acacia-01 ». */
const fileBase = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
/** Identifiant d'élément de décor tiré d'un nom d'asset : « decor/Acacia_01 » → « acacia-01 ». */
const componentId = (name: string) => fileBase(name.split('/').pop()!).toLowerCase().replace(/_/g, '-');

/** Raccourcis proposés après un import, pour utiliser l'asset tout de suite dans le thème affiché. */
function quickActions(kind: ImportKind, name: string, sunU?: number): HTMLElement[] {
  const has = (key: string) => themes[current].components.some((c) => keyOf(c) === key);
  const set = (key: string, use: string, options: Record<string, unknown>) => {
    if (!has(key)) addComponent(use, key === use ? '' : key);
    for (const [option, value] of Object.entries(options)) setOption(key, option, value);
  };
  switch (kind) {
    case 'panorama':
      return [
        button(`Utiliser comme fond de « ${current} »`, () => {
          if (has('sky')) removeComponent('sky');
          const rotation = sunU === undefined ? 0 : panoramaRotation(sunU, themes[current].sun.dir);
          set('panorama', 'panorama', { image: name, rotation });
          status(`Fond « ${name} » utilisé, tourné de ${rotation} pour aligner son soleil sur la lumière du thème.`, 'ok');
          changed(true);
        }),
      ];
    case 'model':
      return [
        button(`Ajouter au décor de « ${current} »`, () => {
          const id = componentId(name);
          if (has(id)) return status(`« ${id} » existe déjà dans le décor.`, 'error');
          set(id, 'props', { models: [name], place: 'shore', count: 12, height: [3, 6] });
          status(`« ${id} » ajouté à la fin du décor : règle sa taille, son nombre et son emplacement.`, 'ok');
          changed(true);
        }),
      ];
    case 'texture':
      return [
        button(`Utiliser pour le sol de « ${current} »`, () => {
          for (const key of ['terrain', 'esplanade', 'sandDrifts']) if (has(key)) setOption(key, 'detail', name);
          status(`Texture « ${name} » utilisée pour le sol.`, 'ok');
          changed(true);
        }),
      ];
    case 'image':
      return [];
  }
}

function buildImportPanel(): HTMLElement {
  const kind = el('select');
  kind.append(...Object.entries(IMPORT_KINDS).map(([value, k]) => el('option', { value, textContent: k.label })));
  const file = el('input', { type: 'file' });
  const relief = el('input', { type: 'file', accept: 'image/*' });
  const reliefRow = el('div', { className: 'block' }, el('label', { textContent: 'Relief (normal map, facultatif)' }), relief);
  const folder = el('input', { type: 'text' });
  const name = el('input', { type: 'text', placeholder: 'nom du fichier' });
  const replace = el('input', { type: 'checkbox' });
  const title = el('input', { type: 'text', placeholder: 'ex. Acacia du désert' });
  const author = el('input', { type: 'text', placeholder: 'ex. Kenney, Poly Haven, moi (ChatGPT)…' });
  const licence = el('select');
  licence.append(...LICENCES.map((l) => el('option', { value: l, textContent: l })));
  const details = el('input', { type: 'text', placeholder: "précisions (outil d'IA, version de la licence…)" });
  const url = el('input', { type: 'text', placeholder: 'lien vers la source (facultatif)' });
  const result = el('div', { className: 'result' });
  const go = button('Importer', () => void run(), 'primary');

  const sync = () => {
    const k = IMPORT_KINDS[kind.value as ImportKind];
    file.accept = k.accept;
    folder.value = k.folder;
    reliefRow.hidden = kind.value !== 'texture';
  };
  kind.addEventListener('change', sync);
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    name.value = fileBase(f.name);
    if (!title.value) title.value = fileBase(f.name).replace(/[-_]+/g, ' ');
  });
  sync();

  async function run(): Promise<void> {
    const f = file.files?.[0];
    if (!f) return status('Choisis un fichier.', 'error');
    if (!author.value.trim() || !title.value.trim()) return status('Licence : titre et auteur / source sont obligatoires.', 'error');
    const type = kind.value as ImportKind;
    go.disabled = true;
    status('Préparation (redimensionnement, version téléphone)…');
    try {
      const prepared = await prepare(type, f, relief.files?.[0]);
      status('Envoi…');
      const response = await fetch('/__editeur/importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: type,
          folder: folder.value.trim(),
          name: name.value.trim(),
          files: prepared.files,
          license: { title: title.value, author: author.value, licence: details.value.trim() ? `${licence.value} (${details.value.trim()})` : licence.value, url: url.value.trim() || undefined },
          replace: replace.checked,
        }),
      });
      const answer = (await response.json()) as { name?: string; error?: string };
      if (!response.ok || !answer.name) throw new Error(answer.error ?? `erreur ${response.status}`);
      await refreshAssets();
      result.replaceChildren(
        el('p', { className: 'ok', textContent: `Importé : « ${answer.name} » (licence ajoutée au dossier et à CREDITS.md).` }),
        ...prepared.report.map((line) => el('p', { className: 'note', textContent: line })),
        el('div', { className: 'row' }, ...quickActions(type, answer.name, prepared.sunU)),
      );
      status(`« ${answer.name} » est disponible dans les listes de l'éditeur.`, 'ok');
      file.value = '';
      relief.value = '';
      title.value = '';
      render();
    } catch (error) {
      status(`Import impossible : ${(error as Error).message}`, 'error');
    } finally {
      go.disabled = false;
    }
  }

  const row = (label: string, ...inputs: HTMLElement[]) => el('div', { className: 'block' }, el('label', { textContent: label }), ...inputs);
  const panel = el(
    'details',
    { className: 'library' },
    el('summary', { textContent: 'Bibliothèque : importer un modèle, une image, un panorama' }),
    row('Type', kind),
    row('Fichier', file),
    reliefRow,
    el('div', { className: 'row' }, row('Dossier', folder), row('Nom', name)),
    el('label', { className: 'check' }, replace, ' remplacer un fichier du même nom'),
    el('h4', { textContent: 'Licence (obligatoire)' }),
    row('Titre', title),
    row('Auteur / source', author),
    el('div', { className: 'row' }, licence, details),
    row('Lien', url),
    go,
    result,
  );
  return panel;
}

let importPanel: HTMLElement | null = null;

// ---------- Affichage ----------

let previewTimer = 0;
function changed(rerender: boolean): void {
  try {
    themes = resolveThemes(files);
    resolveError = null;
  } catch (error) {
    resolveError = (error as Error).message;
  }
  if (rerender) render();
  else refreshHeader();
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(showPreview, 250);
}

async function showPreview(): Promise<void> {
  const theme = themes[current];
  if (!theme || !level()) return;
  const error = await preview.show(theme, levelConfig(level().id, level().definition), SEED);
  if (error) status(`Aperçu impossible : ${error}`, 'error');
}

/** Ligne d'un réglage : libellé, champ, et ↺ si ce thème le déclare lui-même. */
function row(label: string, field: Field, value: unknown, isSet: boolean, set: (v: unknown) => void, reset: () => void): HTMLElement {
  const structural = field.kind === 'models' || field.kind === 'colorMap';
  const line = el('div', { className: 'field' + (isSet ? ' set' : ''), title: field.help ?? '' });
  const undo = button('↺', () => (reset(), changed(true)), 'icon reset');
  undo.title = 'Revenir à la valeur héritée';
  line.append(
    el('label', { textContent: label }),
    fieldInput(field, value, assets, (v) => {
      set(v);
      line.classList.add('set');
      changed(structural);
    }),
    undo,
  );
  return line;
}

function section(key: string, title: Node | string, body: () => HTMLElement[], extra: HTMLElement[] = []): HTMLElement {
  const details = el('details', { open: open.has(key) });
  details.addEventListener('toggle', () => {
    if (details.open) open.add(key);
    else open.delete(key);
  });
  details.append(el('summary', {}, title, ...extra), ...body());
  return details;
}

function paletteSection(): HTMLElement {
  const theme = themes[current] as unknown as Record<string, unknown>;
  return section('palette', 'Palette (ciel, lumière, pierres, portes, musique)', () =>
    Object.entries(PALETTE_SCHEMA).map(([key, field]: [string, Field]) => {
      if (field.kind !== 'group') {
        return row(key, field, theme[key], paletteOverride(null, key) !== undefined, (v) => setPalette(null, key, v), () => setPalette(null, key, undefined));
      }
      const group = theme[key] as Record<string, unknown>;
      return el(
        'fieldset',
        {},
        el('legend', { textContent: key }),
        ...Object.entries(field.fields!).map(([name, sub]) =>
          row(name, sub, group[name], paletteOverride(key, name) !== undefined, (v) => setPalette(key, name, v), () => setPalette(key, name, undefined)),
        ),
      );
    }),
  );
}

function componentSection(spec: Theme['components'][number]): HTMLElement {
  const { use, id, ...options } = spec;
  const key = keyOf(spec);
  const component = COMPONENTS[use];
  const own = declared(key);
  const note = typeof own?.note === 'string' ? own.note : '';
  const remove = button('Retirer', () => (removeComponent(key), changed(true)), 'small danger');
  const title = el('span', {}, el('b', { textContent: key }), id ? el('small', { textContent: ` (${use})` }) : '', own ? el('small', { className: 'mark', textContent: ' • modifié ici' }) : '');
  return section(`c:${key}`, title, () => {
    if (!component) return [el('p', { className: 'error', textContent: `Type d'élément « ${use} » inconnu.` })];
    const values = { ...component.defaults, ...options } as Record<string, unknown>;
    return [
      ...(note ? [el('p', { className: 'note', textContent: note })] : []),
      ...Object.entries(component.schema).map(([name, field]) =>
        row(name, field, values[name], own?.[name] !== undefined, (v) => setOption(key, name, v), () => setOption(key, name, undefined)),
      ),
    ];
  }, [remove]);
}

function addSection(): HTMLElement {
  const type = el('select');
  type.append(...Object.keys(COMPONENTS).sort().map((name) => el('option', { value: name, textContent: name })));
  const id = el('input', { type: 'text', placeholder: 'nom (si plusieurs du même type)' });
  const add = button('+ Ajouter', () => {
    const name = id.value.trim();
    if (name && !NAME.test(name)) return status('Nom : minuscules, chiffres et tirets.', 'error');
    const error = addComponent(type.value, name);
    if (error) return status(error, 'error');
    changed(true);
  });
  return el('div', { className: 'add' }, type, id, add);
}

/** Thèmes dont on peut hériter sans créer de boucle. */
function possibleParents(): string[] {
  const descends = (name: string): boolean => name === current || (!!files[name]?.extends && descends(files[name].extends!));
  return Object.keys(files).filter((name) => !descends(name)).sort();
}

function refreshHeader(): void {
  const select = $<HTMLSelectElement>('theme');
  select.replaceChildren(...Object.keys(files).sort().map((name) => el('option', { value: name, selected: name === current, textContent: (isDirty(name) ? '● ' : '') + name })));
  const errors = resolveError ? [resolveError] : errorsOf(current);
  $('errors').replaceChildren(...errors.map((e) => el('li', { textContent: e })));
  const users = levels.filter((l) => l.definition.theme === current).map((l) => l.number);
  $('users').textContent = users.length ? `Utilisé par le niveau ${users.join(', ')}` : "Utilisé par aucun niveau (directement)";
  const dirty = Object.keys(files).filter(isDirty);
  $<HTMLButtonElement>('save').textContent = dirty.length ? `Enregistrer (${dirty.length})` : 'Enregistré';
}

function render(): void {
  const scroll = sidebar.scrollTop;
  refreshHeader();
  const f = file();
  const levelSelect = el('select');
  levelSelect.append(...levels.map((l) => el('option', { value: l.id, selected: l.id === level().id, textContent: `${l.number}. ${l.definition.name} — thème ${l.definition.theme}` })));
  levelSelect.addEventListener('change', () => {
    levelId = levelSelect.value;
    location.hash = `${current}/${levelId}`;
    render();
    void showPreview();
  });
  const assign = button(`Utiliser « ${current} » pour ce niveau`, () => void useForLevel(), 'small');
  assign.disabled = level().definition.theme === current;

  const parent = el('select');
  parent.append(el('option', { value: '', textContent: '(aucun : palette par défaut)' }), ...possibleParents().map((name) => el('option', { value: name, textContent: name, selected: name === f.extends })));
  parent.addEventListener('change', () => {
    if (parent.value) f.extends = parent.value;
    else delete f.extends;
    changed(true);
  });
  const note = el('textarea', { value: f.note ?? '', rows: 2, placeholder: 'À quoi sert ce thème ?' });
  note.addEventListener('change', () => {
    if (note.value.trim()) f.note = note.value.trim();
    else delete f.note;
    changed(false);
  });

  const theme = themes[current];
  sidebar.replaceChildren(
    el('div', { className: 'block' }, el('label', { textContent: "Pyramide de l'aperçu" }), levelSelect, assign),
    el('div', { className: 'block' }, el('label', { textContent: 'Hérite de' }), parent, el('label', { textContent: 'Note' }), note),
    (importPanel ??= buildImportPanel()),
    ...(theme
      ? [
          paletteSection(),
          el('h3', { textContent: 'Décor (construit dans cet ordre)' }),
          ...theme.components.map(componentSection),
          addSection(),
        ]
      : []),
  );
  sidebar.scrollTop = scroll;
}

function select(name: string): void {
  current = name;
  location.hash = `${current}/${levelId}`;
  changed(true);
}

function newTheme(): void {
  const name = prompt(`Nom du nouveau thème (minuscules, chiffres, tirets). Il partira de « ${current} ».`)?.trim();
  if (!name) return;
  if (!NAME.test(name)) return status('Nom : minuscules, chiffres et tirets.', 'error');
  if (files[name]) return status(`Le thème « ${name} » existe déjà.`, 'error');
  files[name] = { extends: current, components: {} };
  saved[name] = '';
  select(name);
  status(`Thème « ${name} » créé (pas encore enregistré).`);
}

// ---------- Démarrage ----------

async function start(): Promise<void> {
  try {
    await load();
  } catch (error) {
    status((error as Error).message, 'error');
    return;
  }
  const [hashTheme, hashLevel] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (hashLevel && levels.some((l) => l.id === hashLevel)) levelId = hashLevel;
  current = files[hashTheme] ? hashTheme : (files[level().definition.theme] ? level().definition.theme : Object.keys(files)[0]);
  $<HTMLSelectElement>('theme').addEventListener('change', (e) => select((e.target as HTMLSelectElement).value));
  $('save').addEventListener('click', () => void save());
  $('new').addEventListener('click', newTheme);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void save();
    }
  });
  addEventListener('beforeunload', (e) => {
    if (Object.keys(files).some(isDirty)) e.preventDefault();
  });
  select(current);
  status('Prêt. Les modifications apparaissent dans l’aperçu ; Ctrl+S pour enregistrer.');
}

void start();
