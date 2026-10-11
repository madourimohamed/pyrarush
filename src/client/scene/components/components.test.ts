import { describe, expect, it } from 'vitest';
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

  it('les options déclarées par les niveaux sont connues du composant', () => {
    for (const level of levels) {
      for (const { use, id: _id, ...options } of level.theme.components) {
        const known = Object.keys(COMPONENTS[use].defaults);
        for (const key of Object.keys(options)) {
          expect(known, `niveau ${level.number} : option « ${key} » inconnue pour « ${use} »`).toContain(key);
        }
      }
    }
  });
});
