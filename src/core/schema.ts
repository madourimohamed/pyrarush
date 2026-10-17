/**
 * Description des options réglables (composants de décor, palette d'un thème) : leur type, leur valeur par défaut
 * et leurs limites. Une seule déclaration sert à la fois :
 * - aux valeurs par défaut et au typage (le code d'un composant reçoit des options typées) ;
 * - à la validation des fichiers de thème (messages clairs, au lieu d'un décor faux sans erreur) ;
 * - aux formulaires de l'éditeur de décor (curseur, sélecteur de couleur, choix d'un modèle…).
 * Données pures : aucune dépendance 3D ni DOM.
 */

export type FieldKind =
  | 'number'
  | 'boolean'
  | 'text'
  | 'choice'
  /** Couleur 0xRRGGBB (nombre) ; s'écrit '#rrggbb' dans les fichiers de thème (voir normalizeValues). */
  | 'color'
  /** Couleur CSS '#rrggbb' ; vide = couleur tirée du thème. */
  | 'cssColor'
  /** Couleurs CSS en liste (ex. deux teintes de pierre alternées). */
  | 'cssColors'
  /** Couleur lumineuse [r, g, b] : au-dessus de 1, elle déclenche la lueur. */
  | 'hdr'
  /** Nombres en nombre fixe (intervalle [min, max], direction [x, y, z]…). */
  | 'vector'
  /** Liste de nombres de longueur libre. */
  | 'numbers'
  /** Un modèle 3D (chemin sous public/models, sans .glb) ; ou une liste de modèles (variantes). */
  | 'model'
  | 'models'
  /** Une image (chemin sous public/textures, sans extension). */
  | 'image'
  /** Recoloration par nom de matériau : { leafs: 0x46a33c }. */
  | 'colorMap'
  /** Plusieurs choix parmi une liste. */
  | 'choices'
  /** Groupe d'options (palette : ciel, soleil…). */
  | 'group';

export interface Field<T = unknown> {
  kind: FieldKind;
  default: T;
  /** Nombres : limites et pas proposés par l'éditeur (la validation n'impose que min et max). */
  min?: number;
  max?: number;
  step?: number;
  /** Nombres : entier seulement. */
  integer?: boolean;
  /** Choix possibles (choice, choices). */
  options?: readonly string[];
  /** Groupe : ses options. */
  fields?: Schema;
  /** Explication affichée dans l'éditeur. */
  help?: string;
}

export type Schema = Record<string, Field<any>>;

/** Valeurs d'un schéma (le type des options reçues par un composant). */
export type Values<S extends Schema> = { -readonly [K in keyof S]: S[K]['default'] };

interface NumberLimits {
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

type Extra = { help?: string };

export const num = (value: number, limits: NumberLimits = {}): Field<number> => ({ kind: 'number', default: value, ...limits });
export const int = (value: number, limits: NumberLimits = {}): Field<number> => ({ kind: 'number', default: value, integer: true, step: 1, ...limits });
export const bool = (value: boolean, extra: Extra = {}): Field<boolean> => ({ kind: 'boolean', default: value, ...extra });
export const text = (value: string, extra: Extra = {}): Field<string> => ({ kind: 'text', default: value, ...extra });
export const choice = <const T extends string>(value: NoInfer<T>, options: readonly T[], extra: Extra = {}): Field<T> => ({ kind: 'choice', default: value, options, ...extra });
export const choices = <const T extends string>(value: NoInfer<T>[], options: readonly T[], extra: Extra = {}): Field<T[]> => ({ kind: 'choices', default: value, options, ...extra });
export const color = (value: number, extra: Extra = {}): Field<number> => ({ kind: 'color', default: value, ...extra });
export const cssColor = (value: string, extra: Extra = {}): Field<string> => ({ kind: 'cssColor', default: value, ...extra });
export const cssColors = (value: [string, string], extra: Extra = {}): Field<[string, string]> => ({ kind: 'cssColors', default: value, ...extra });
export const hdrColor = (value: [number, number, number], extra: Extra = {}): Field<[number, number, number]> => ({ kind: 'hdr', default: value, min: 0, ...extra });
export function vector(value: [number, number], limits?: NumberLimits): Field<[number, number]>;
export function vector(value: [number, number, number], limits?: NumberLimits): Field<[number, number, number]>;
export function vector(value: number[], limits: NumberLimits = {}): Field<number[]> {
  return { kind: 'vector', default: value, ...limits };
}
export const numbers = (value: number[], limits: NumberLimits = {}): Field<number[]> => ({ kind: 'numbers', default: value, ...limits });
export const model = (value: string, extra: Extra = {}): Field<string> => ({ kind: 'model', default: value, ...extra });
export const models = (value: string[], extra: Extra = {}): Field<string[]> => ({ kind: 'models', default: value, ...extra });
export const image = (value: string, extra: Extra = {}): Field<string> => ({ kind: 'image', default: value, ...extra });
export const colorMap = (value: Record<string, number>, extra: Extra = {}): Field<Record<string, number>> => ({ kind: 'colorMap', default: value, ...extra });
export const group = <S extends Schema>(fields: S, extra: Extra = {}): Field<Values<S>> => ({ kind: 'group', default: defaultsOf(fields), fields, ...extra });

/** Valeurs par défaut d'un schéma (copiées : les modifier ne change pas le schéma). */
export function defaultsOf<S extends Schema>(schema: S): Values<S> {
  return Object.fromEntries(Object.entries(schema).map(([key, field]) => [key, structuredClone(field.default)])) as Values<S>;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const CSS_COLOR = /^#[0-9a-f]{6}$/i;
const ASSET_PATH = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i;
/** Couleur d'une option `color` : nombre 0xRRGGBB, ou '#rrggbb' (fichiers de thème). */
const isColor = (v: unknown) => (isNumber(v) && Number.isInteger(v) && v >= 0 && v <= 0xffffff) || (typeof v === 'string' && CSS_COLOR.test(v));
const toColorNumber = (v: unknown) => (typeof v === 'string' && CSS_COLOR.test(v) ? parseInt(v.slice(1), 16) : v);

/**
 * Valeurs lues dans un fichier → valeurs reçues par le code : les couleurs `color` (et `colorMap`) écrites '#rrggbb'
 * deviennent des nombres. Les options absentes restent absentes ; les autres valeurs sont recopiées telles quelles.
 */
export function normalizeValues(schema: Schema, values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const field = schema[key];
      if (field?.kind === 'color') return [key, toColorNumber(value)];
      if (field?.kind === 'colorMap' && isRecord(value)) return [key, Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toColorNumber(v)]))];
      if (field?.kind === 'group' && isRecord(value)) return [key, normalizeValues(field.fields!, value)];
      return [key, value];
    }),
  );
}

/** Erreurs d'une valeur pour un champ (liste vide = valeur correcte). `path` situe l'erreur dans les messages. */
export function checkField(field: Field, value: unknown, path: string): string[] {
  const fail = (expected: string) => [`${path} : attendu ${expected}, reçu ${JSON.stringify(value)}`];
  switch (field.kind) {
    case 'number': {
      if (!isNumber(value)) return fail('un nombre');
      if (field.integer && !Number.isInteger(value)) return fail('un nombre entier');
      if (field.min !== undefined && value < field.min) return fail(`un nombre ≥ ${field.min}`);
      if (field.max !== undefined && value > field.max) return fail(`un nombre ≤ ${field.max}`);
      return [];
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : fail('vrai ou faux');
    case 'text':
      return typeof value === 'string' ? [] : fail('un texte');
    case 'choice':
      return field.options!.includes(value as string) ? [] : fail(`un choix parmi ${field.options!.join(', ')}`);
    case 'choices':
      return Array.isArray(value) && value.every((v) => field.options!.includes(v)) ? [] : fail(`une liste parmi ${field.options!.join(', ')}`);
    case 'color':
      return isColor(value) ? [] : fail('une couleur');
    case 'cssColor':
      return value === '' || (typeof value === 'string' && CSS_COLOR.test(value)) ? [] : fail('une couleur #rrggbb');
    case 'cssColors':
      return Array.isArray(value) && value.length === (field.default as string[]).length && value.every((v) => typeof v === 'string' && CSS_COLOR.test(v))
        ? []
        : fail(`${(field.default as string[]).length} couleurs #rrggbb`);
    case 'hdr':
      return Array.isArray(value) && value.length === 3 && value.every((v) => isNumber(v) && v >= 0) ? [] : fail('une couleur lumineuse [r, g, b]');
    case 'vector': {
      const length = (field.default as number[]).length;
      return Array.isArray(value) && value.length === length && value.every(isNumber) ? [] : fail(`${length} nombres`);
    }
    case 'numbers':
      return Array.isArray(value) && value.every(isNumber) ? [] : fail('une liste de nombres');
    case 'model':
    case 'image':
      return value === '' || (typeof value === 'string' && ASSET_PATH.test(value)) ? [] : fail('un chemin de fichier');
    case 'models':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && ASSET_PATH.test(v)) ? [] : fail('une liste de chemins de fichiers');
    case 'colorMap':
      return isRecord(value) && Object.values(value).every(isColor) ? [] : fail('des couleurs par matériau');
    case 'group':
      return isRecord(value) ? checkValues(field.fields!, value, path, true) : fail('un groupe');
  }
}

/**
 * Erreurs d'un ensemble de valeurs : options inconnues et valeurs incorrectes.
 * `partial` : les options absentes sont permises (elles prennent leur valeur par défaut).
 */
export function checkValues(schema: Schema, values: Record<string, unknown>, path: string, partial = true): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const field = schema[key];
    if (!field) errors.push(`${path} : option « ${key} » inconnue (connues : ${Object.keys(schema).join(', ')})`);
    else errors.push(...checkField(field, value, `${path}.${key}`));
  }
  if (!partial) for (const key of Object.keys(schema)) if (!(key in values)) errors.push(`${path} : option « ${key} » manquante`);
  return errors;
}
