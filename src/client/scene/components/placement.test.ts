import { describe, expect, it } from 'vitest';
import { generateLayout } from '../../../core';
import { levels } from '../../../levels';
import { checkPlacement, decorFootprints } from './placement';

const SEEDS = [1, 42, 2026, 777, 31337];

function violationsOf(levelNumber: number): string[] {
  const level = levels[levelNumber - 1];
  return SEEDS.flatMap((seed) => {
    const layout = generateLayout(level.config, seed);
    return checkPlacement(layout, decorFootprints(layout, level.theme)).map((v) => `${v.source} (étage ${v.floor}) — ${v.rule} : ${v.detail}`);
  });
}

describe('règles du gameplay pour le décor (bible graphique § 2)', () => {
  /**
   * Infractions connues relevées à l'étape 0 (état de référence) : les braseros de rebord débordent dans la bande
   * de marche (et, aux niveaux 2 à 6, certains sont trop près d'un trou). À corriger après validation de l'étape 0 ;
   * dès que c'est fait, ce test « fails » échouera et devra devenir un test normal (it au lieu de it.fails).
   */
  it.fails.each(levels.map((l) => [l.number] as const))('niveau %i : aucun décor dans les zones interdites (infractions connues)', (n) => {
    expect(violationsOf(n)).toEqual([]);
  });

  it('le contrôle détecte bien une infraction (objets trop larges contre la paroi)', () => {
    const level = levels[0];
    const layout = generateLayout(level.config, 1);
    const footprints = decorFootprints(layout, { ...level.theme, components: [{ use: 'props', place: 'wallFoot' }] });
    expect(footprints.length).toBeGreaterThan(0);
    expect(checkPlacement(layout, footprints).some((v) => v.rule === 'bande de marche')).toBe(true);
  });
});
