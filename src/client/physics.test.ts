import { describe, expect, it } from 'vitest';
import { BOOTS_JUMP, FLOOR_HEIGHT } from '../core';
import { CharacterBody } from './physics';

/** Hauteur maximale atteinte par un saut sur un sol plat, avec un multiplicateur d'impulsion. */
function jumpApex(scale: number): number {
  const body = new CharacterBody([{ min: [-50, -1, -50], max: [50, 0, 50], kind: 'ground' }], { x: 0, y: 0, z: 0 });
  body.jumpScale = scale;
  body.step(1 / 60, { x: 0, z: 0, jumpPressed: true });
  let apex = 0;
  for (let i = 0; i < 120; i++) {
    body.step(1 / 60, { x: 0, z: 0, jumpPressed: false });
    apex = Math.max(apex, body.pos.y);
  }
  return apex;
}

describe('physique du personnage', () => {
  it('les Bottes rebondissantes sautent plus haut, mais jamais jusqu’à la terrasse du dessus (on ne contourne pas les portes)', () => {
    const normal = jumpApex(1);
    const boots = jumpApex(BOOTS_JUMP);
    expect(boots).toBeGreaterThan(normal + 0.4);
    expect(boots).toBeLessThan(FLOOR_HEIGHT - 0.3);
  });
});
