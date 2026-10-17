import { describe, expect, it } from 'vitest';
import { bool, checkValues, choice, color, cssColor, defaultsOf, group, int, models, num, vector } from './schema';

const schema = {
  count: int(10, { min: 0, max: 50 }),
  size: num(1),
  leaf: color(0x3f9e4d),
  cloth: cssColor(''),
  shape: choice('mesa', ['mesa', 'peaks']),
  height: vector([1, 2]),
  variants: models([]),
  stars: bool(false),
  sky: group({ top: color(0x2f6fd0) }),
};

describe('description des options', () => {
  it('donne les valeurs par défaut (copiées)', () => {
    const values = defaultsOf(schema);
    expect(values).toMatchObject({ count: 10, shape: 'mesa', height: [1, 2], sky: { top: 0x2f6fd0 } });
    values.height[0] = 9;
    expect(schema.height.default).toEqual([1, 2]);
  });

  it('accepte des valeurs correctes, même partielles', () => {
    expect(checkValues(schema, { count: 3, cloth: '#a1b2c3', variants: ['vegetation/palm_a'], sky: { top: 0 } }, 't')).toEqual([]);
  });

  it('signale chaque erreur avec son emplacement', () => {
    const errors = checkValues(
      schema,
      { count: 2.5, size: 'grand', leaf: 'vert', cloth: 'rouge', shape: 'cube', height: [1], variants: ['../secret'], stars: 1, sky: { top: -1 }, oups: 1 },
      'palmiers',
    );
    expect(errors).toHaveLength(10);
    expect(errors.join('\n')).toMatch(/palmiers\.count : attendu un nombre entier/);
    expect(errors.join('\n')).toMatch(/palmiers\.sky\.top : attendu une couleur/);
    expect(errors.join('\n')).toMatch(/option « oups » inconnue/);
  });

  it('respecte les limites et signale les options manquantes si demandé', () => {
    expect(checkValues(schema, { count: 51 }, 't')).toHaveLength(1);
    expect(checkValues(schema, { count: 1 }, 't', false).length).toBe(Object.keys(schema).length - 1);
  });
});
