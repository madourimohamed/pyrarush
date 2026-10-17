import { normalizeValues } from './schema';
import { BASE_PALETTE, defineTheme, editComponents, PALETTE_SCHEMA, type ComponentSpec, type Theme, type ThemeOverrides } from './theme';

/**
 * Fichier de thème (`content/themes/<nom>.json`), écrit à la main ou par l'éditeur de décor :
 *
 *   {
 *     "note": "à quoi sert ce thème",
 *     "extends": "temple-simple",                     ← thème de départ (absent : palette par défaut, voir PALETTE_SCHEMA)
 *     "palette": { "sky": { "top": "#1f8fd6" } },     ← seulement ce qui change ; couleurs en '#rrggbb'
 *     "components": { "palms": { "count": 40 }, "statues": null }
 *   }
 *
 * `components` est soit une liste complète (remplace celle du thème de départ), soit des retouches (comme editComponents :
 * options fusionnées par identifiant `id`, sinon `use` ; `null` retire ; un nom absent est ajouté à la fin).
 * Chaque composant peut porter une `note` (explication pour les humains, ignorée par le jeu).
 */
export interface ThemeFile {
  note?: string;
  extends?: string;
  /** Comme ThemeOverrides, mais tel qu'écrit dans le fichier (couleurs en '#rrggbb'). */
  palette?: Record<string, unknown>;
  components?: ComponentEntry[] | Record<string, ComponentEdit | null>;
}

export type ComponentEntry = ComponentSpec & { note?: string };
export type ComponentEdit = Omit<ComponentSpec, 'use'> & { use?: string; note?: string };

/** Retire la note (réservée aux humains) avant de passer les options au jeu. */
function withoutNote<T extends { note?: string }>(entry: T): T {
  const { note: _note, ...rest } = entry;
  return rest as T;
}

/** Thèmes prêts à l'emploi, par nom, à partir des fichiers (héritage résolu). Erreur claire si un parent manque ou en cas de boucle. */
export function resolveThemes(files: Record<string, ThemeFile>): Record<string, Theme> {
  const themes: Record<string, Theme> = {};
  const resolving = new Set<string>();

  const resolve = (name: string): Theme => {
    if (themes[name]) return themes[name];
    const file = files[name];
    if (!file) throw new Error(`Thème « ${name} » introuvable (content/themes/${name}.json)`);
    if (resolving.has(name)) throw new Error(`Thèmes : héritage en boucle (${[...resolving, name].join(' → ')})`);
    resolving.add(name);
    const parent = file.extends ? resolve(file.extends) : { ...BASE_PALETTE, components: [] };
    resolving.delete(name);

    const palette = normalizeValues(PALETTE_SCHEMA, file.palette ?? {}) as ThemeOverrides;
    const edits = file.components ?? {};
    const components = Array.isArray(edits)
      ? edits.map(withoutNote)
      : editComponents(
          parent.components,
          Object.fromEntries(Object.entries(edits).map(([key, edit]) => [key, edit && withoutNote(edit)])),
        );
    return (themes[name] = defineTheme({ ...palette, components }, parent));
  };

  for (const name of Object.keys(files)) resolve(name);
  return themes;
}
