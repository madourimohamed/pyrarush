import { describe, expect, it } from 'vitest';
import { buildColliders, doorTangent, floorY, generateLayout, holeTangent, sideFrame, wallHalf, terraceOuterHalf, HOLE_WIDTH, Rng } from '../../../core';
import { levels } from '../../../levels';
import { masonryLayout, pavingLayout, type KitPiece } from './masonry';

const BLOCKS: KitPiece[] = [{ width: 1.2 }, { width: 1.6 }, { width: 2.2 }, { width: 2.8 }, { width: 1.5, tall: true }, { width: 2.1, tall: true }];
const SLABS: KitPiece[] = [{ width: 1.1 }, { width: 1.5 }, { width: 1.9 }, { width: 2.4 }];
const OPTIONS = { courses: [1.2, 1.2, 0.6], tall: 0.25, relief: 0.06, joint: 0.03, doorClear: [1.1, 2.4] as [number, number] };
const SEEDS = [1, 2026, 31337];
/** Vérifications exhaustives (toutes les paires de blocs) : plusieurs secondes quand tous les tests tournent en même temps. */
const SLOW = 30_000;
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;

describe('maçonnerie (blocs posés sur les parois)', () => {
  for (const level of levels) {
    it(`niveau ${level.number} : les blocs suivent les parois sans couvrir portes, trous ni d'autres blocs`, () => {
      for (const seed of SEEDS) {
        const layout = generateLayout(level.config, seed);
        const { config } = layout;
        const blocks = masonryLayout(layout, BLOCKS, OPTIONS, new Rng(seed));
        expect(blocks.some((b) => BLOCKS[b.variant].tall)).toBe(true);
        for (const b of blocks) {
          const a = wallHalf(config, b.floor);
          const [lo, hi] = [b.center - b.width / 2, b.center + b.width / 2];
          expect(lo).toBeGreaterThanOrEqual(-a - OPTIONS.relief - 1e-6);
          expect(hi).toBeLessThanOrEqual(a + OPTIONS.relief + 1e-6);
          expect(b.width).toBeGreaterThan(0.2);
          expect(b.y + b.height).toBeLessThanOrEqual(floorY(b.floor) + 3 + 1e-6);
          // Jamais devant un encadrement de porte (sous la hauteur libre).
          if (b.y < floorY(b.floor) + OPTIONS.doorClear[1] - 1e-6) {
            for (const door of layout.doors.filter((d) => d.floor === b.floor && d.side === b.side)) {
              const t = doorTangent(config, door.floor, door.slot);
              expect(overlaps(lo, hi, t - OPTIONS.doorClear[0], t + OPTIONS.doorClear[0])).toBe(false);
            }
          }
          // Jamais en travers d'un trou (le puits coupe la paroi du dessous).
          for (const hole of layout.holes.filter((h) => h.floor === b.floor + 1 && h.side === b.side)) {
            const t = holeTangent(config, hole);
            expect(overlaps(lo, hi, t - HOLE_WIDTH / 2, t + HOLE_WIDTH / 2)).toBe(false);
          }
        }
        // Aucun chevauchement entre blocs d'une même face (blocs doubles compris).
        for (let i = 0; i < blocks.length; i++) {
          for (let j = i + 1; j < blocks.length; j++) {
            const [p, q] = [blocks[i], blocks[j]];
            if (p.floor !== q.floor || p.side !== q.side) continue;
            const both = overlaps(p.center - p.width / 2, p.center + p.width / 2, q.center - q.width / 2, q.center + q.width / 2) && overlaps(p.y, p.y + p.height, q.y, q.y + q.height);
            expect(both, `blocs ${i} et ${j} se chevauchent`).toBe(false);
          }
        }
      }
    }, SLOW);

    it(`niveau ${level.number} : les dalles couvrent les sols sans recouvrir les trous`, () => {
      for (const seed of SEEDS) {
        const layout = generateLayout(level.config, seed);
        const { config } = layout;
        const slabs = pavingLayout(layout, SLABS, { rows: [0.9, 1.4], joint: 0.035 }, new Rng(seed));
        const g = terraceOuterHalf(config, 1);
        const colliders = buildColliders(layout);
        for (const s of slabs) {
          const [hx, hz] = s.alongX ? [s.width / 2, s.depth / 2] : [s.depth / 2, s.width / 2];
          expect(Math.max(Math.abs(s.x) + hx, Math.abs(s.z) + hz)).toBeLessThanOrEqual(g + 1e-6);
          // Chaque dalle repose sur un sol (bloc ou esplanade) à sa hauteur, jamais au-dessus d'un trou.
          if (s.floor > 1) {
            const support = colliders.some(
              (b) => b.kind === 'block' && Math.abs(b.max[1] - s.y) < 1e-6 && s.x - hx >= b.min[0] - 1e-6 && s.x + hx <= b.max[0] + 1e-6 && s.z - hz >= b.min[2] - 1e-6 && s.z + hz <= b.max[2] + 1e-6,
            );
            expect(support, `dalle sans appui à l'étage ${s.floor}`).toBe(true);
          }
          for (const hole of layout.holes.filter((h) => h.floor === s.floor)) {
            const f = sideFrame(hole.side);
            const t = holeTangent(config, hole);
            const cx = f.tanX * t + f.outX * (wallHalf(config, s.floor) + 1.5);
            const cz = f.tanZ * t + f.outZ * (wallHalf(config, s.floor) + 1.5);
            const inside = Math.abs(cx - s.x) < hx - 0.01 && Math.abs(cz - s.z) < hz - 0.01;
            expect(inside, 'dalle sur un trou').toBe(false);
          }
        }
      }
    }, SLOW);
  }

  it("avec where: 'terraces', aucune dalle sur l'esplanade (étage 1)", () => {
    const layout = generateLayout(levels[0].config, 5);
    const slabs = pavingLayout(layout, SLABS, { rows: [0.9, 1.4], joint: 0.035, where: 'terraces' }, new Rng(5));
    expect(slabs.length).toBeGreaterThan(0);
    expect(slabs.every((s) => s.floor > 1)).toBe(true);
  });

  it('est déterministe pour une graine donnée', () => {
    const layout = generateLayout(levels[0].config, 7);
    expect(masonryLayout(layout, BLOCKS, OPTIONS, new Rng(3))).toEqual(masonryLayout(layout, BLOCKS, OPTIONS, new Rng(3)));
    expect(pavingLayout(layout, SLABS, { rows: [0.9, 1.4], joint: 0.035 }, new Rng(3))).toEqual(pavingLayout(layout, SLABS, { rows: [0.9, 1.4], joint: 0.035 }, new Rng(3)));
  });
});
