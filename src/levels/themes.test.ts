import { describe, expect, it } from 'vitest';
import { COMPONENTS, resolveOptions } from '../client/scene/components';
import { levels } from './index';

describe('thèmes des niveaux', () => {
  // Thème complet de chaque niveau, une fois les héritages résolus et les options des composants telles que le jeu les
  // reçoit (couleurs converties) : toute modification du décor apparaît ici.
  // Après un changement voulu, mettre à jour la référence avec `npx vitest run -u`.
  it('restent identiques à la référence', async () => {
    const themes = Object.fromEntries(
      levels.map((l) => [
        l.id,
        {
          ...l.theme,
          components: l.theme.components.map(({ use, id, ...options }) => {
            const resolved = resolveOptions(COMPONENTS[use], options) as Record<string, unknown>;
            const normalized = Object.fromEntries(Object.keys(options).map((key) => [key, resolved[key]]));
            return { use, ...(id !== undefined && { id }), ...normalized };
          }),
        },
      ]),
    );
    await expect(JSON.stringify(themes, null, 2)).toMatchFileSnapshot('__snapshots__/themes.json');
  });
});
