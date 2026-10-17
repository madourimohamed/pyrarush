import { describe, expect, it } from 'vitest';
import { BASE_PALETTE } from './theme';
import { resolveThemes } from './themeFile';

describe('fichiers de thème', () => {
  const files = {
    racine: { components: [{ use: 'sky', clouds: '#ffffff', note: 'pour les humains' }, { use: 'props', id: 'palmiers', count: 3 }] },
    enfant: {
      extends: 'racine',
      palette: { sky: { top: '#123456' }, exposure: 2 },
      components: { palmiers: { count: 9 }, sky: null, pond: { glow: true, note: 'ajouté' } },
    },
  };

  it('sans parent : palette par défaut et liste de composants telle quelle, sans les notes', () => {
    const { racine } = resolveThemes(files);
    expect(racine.sky).toEqual(BASE_PALETTE.sky);
    expect(racine.components).toEqual([
      { use: 'sky', clouds: '#ffffff' },
      { use: 'props', id: 'palmiers', count: 3 },
    ]);
  });

  it('avec parent : seule la différence est déclarée ; couleurs de la palette converties', () => {
    const { enfant } = resolveThemes(files);
    expect(enfant.sky).toEqual({ ...BASE_PALETTE.sky, top: 0x123456 });
    expect(enfant.exposure).toBe(2);
    expect(enfant.components).toEqual([
      { use: 'props', id: 'palmiers', count: 9 },
      { use: 'pond', glow: true },
    ]);
  });

  it('erreurs claires : parent introuvable, héritage en boucle', () => {
    expect(() => resolveThemes({ a: { extends: 'absent' } })).toThrow(/« absent » introuvable/);
    expect(() => resolveThemes({ a: { extends: 'b' }, b: { extends: 'a' } })).toThrow(/boucle \(a → b → a\)/);
  });
});
