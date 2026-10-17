import { describe, expect, it } from 'vitest';
import { levels } from './index';

describe('thèmes des niveaux', () => {
  // Thème complet de chaque niveau, une fois les héritages résolus : toute modification du décor apparaît ici.
  // Après un changement voulu, mettre à jour la référence avec `npx vitest run -u`.
  it('restent identiques à la référence', async () => {
    const themes = Object.fromEntries(levels.map((l) => [l.id, l.theme]));
    await expect(JSON.stringify(themes, null, 2)).toMatchFileSnapshot('__snapshots__/themes.json');
  });
});
