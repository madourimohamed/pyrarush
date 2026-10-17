import { describe, expect, it } from 'vitest';
import { checkValues, PALETTE_SCHEMA } from '../../../core';
import { themes } from '../../../levels';
import { COMPONENTS } from './index';

describe('composants de décor', () => {
  it('chaque thème (content/themes) : composants connus, options connues et du bon type', () => {
    for (const [name, theme] of Object.entries(themes)) {
      for (const { use, id, ...options } of theme.components) {
        expect(COMPONENTS[use], `thème ${name} : composant « ${use} » inconnu`).toBeDefined();
        expect(checkValues(COMPONENTS[use].schema, options, `thème ${name}, ${id ?? use}`)).toEqual([]);
      }
    }
  });

  it('chaque thème : palette complète et du bon type', () => {
    for (const [name, theme] of Object.entries(themes)) {
      const { components: _components, ...palette } = theme;
      expect(checkValues(PALETTE_SCHEMA, palette, `thème ${name}`, false)).toEqual([]);
    }
  });

  it('les valeurs par défaut des composants respectent leur propre description', () => {
    for (const [name, component] of Object.entries(COMPONENTS)) {
      expect(checkValues(component.schema, component.defaults as Record<string, unknown>, name, false)).toEqual([]);
    }
  });
});
