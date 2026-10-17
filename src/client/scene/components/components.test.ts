import { describe, expect, it } from 'vitest';
import { checkValues, PALETTE_SCHEMA } from '../../../core';
import { levels } from '../../../levels';
import { COMPONENTS } from './index';

describe('composants de décor', () => {
  it('chaque composant cité par un niveau existe dans le registre', () => {
    for (const level of levels) {
      for (const spec of level.theme.components) {
        expect(COMPONENTS[spec.use], `niveau ${level.number} : composant « ${spec.use} » inconnu`).toBeDefined();
      }
    }
  });

  it('les options déclarées par les niveaux sont connues du composant et du bon type', () => {
    for (const level of levels) {
      for (const { use, id, ...options } of level.theme.components) {
        expect(checkValues(COMPONENTS[use].schema, options, `niveau ${level.number}, ${id ?? use}`)).toEqual([]);
      }
    }
  });

  it('la palette de chaque niveau est complète et du bon type', () => {
    for (const level of levels) {
      const { components: _components, ...palette } = level.theme;
      expect(checkValues(PALETTE_SCHEMA, palette, `niveau ${level.number}`, false)).toEqual([]);
    }
  });

  it('les valeurs par défaut des composants respectent leur propre description', () => {
    for (const [name, component] of Object.entries(COMPONENTS)) {
      expect(checkValues(component.schema, component.defaults as Record<string, unknown>, name, false)).toEqual([]);
    }
  });
});
