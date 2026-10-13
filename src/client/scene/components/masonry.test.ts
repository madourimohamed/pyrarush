import { describe, expect, it } from 'vitest';
import { doorTangent, floorY, generateLayout, holeTangent, wallHalf, HOLE_WIDTH, Rng } from '../../../core';
import { levels } from '../../../levels';
import { masonryLayout } from './masonry';

const WIDTHS = [0.9, 1.2, 1.2, 1.5, 1.5, 1.9];
const OPTIONS = { courses: [0.8, 0.8, 0.8, 0.6], relief: 0.06, joint: 0.025, doorClear: [1.1, 2.4] as [number, number] };

describe('maçonnerie (blocs posés sur les parois)', () => {
  for (const level of levels) {
    it(`niveau ${level.number} : les blocs suivent les parois sans couvrir portes ni trous`, () => {
      for (const seed of [1, 2026, 31337]) {
        const layout = generateLayout(level.config, seed);
        const { config } = layout;
        const blocks = masonryLayout(layout, WIDTHS, OPTIONS, new Rng(seed));
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          const a = wallHalf(config, b.floor);
          const [lo, hi] = [b.tangent - b.width / 2, b.tangent + b.width / 2];
          // Sur la face, angles croisés compris.
          expect(lo).toBeGreaterThanOrEqual(-a - OPTIONS.relief - 1e-6);
          expect(hi).toBeLessThanOrEqual(a + OPTIONS.relief + 1e-6);
          expect(b.width).toBeGreaterThan(0.2);
          // Jamais devant un encadrement de porte (sous la hauteur libre).
          if (b.y < floorY(b.floor) + OPTIONS.doorClear[1] - 1e-6) {
            for (const door of layout.doors.filter((d) => d.floor === b.floor && d.side === b.side)) {
              const t = doorTangent(config, door.floor, door.slot);
              expect(hi <= t - OPTIONS.doorClear[0] + 1e-6 || lo >= t + OPTIONS.doorClear[0] - 1e-6).toBe(true);
            }
          }
          // Jamais en travers d'un trou (le puits coupe la paroi du dessous).
          for (const hole of layout.holes.filter((h) => h.floor === b.floor + 1 && h.side === b.side)) {
            const t = holeTangent(config, hole);
            expect(hi <= t - HOLE_WIDTH / 2 + 1e-6 || lo >= t + HOLE_WIDTH / 2 - 1e-6).toBe(true);
          }
        }
      }
    });
  }

  it('est déterministe pour une graine donnée', () => {
    const layout = generateLayout(levels[0].config, 7);
    expect(masonryLayout(layout, WIDTHS, OPTIONS, new Rng(3))).toEqual(masonryLayout(layout, WIDTHS, OPTIONS, new Rng(3)));
  });
});
