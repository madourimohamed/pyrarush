import { angleGap, BRONZE, byDifficulty, DARK, defineTrial, GOLD, TAU, type TrialRun } from './trial';

/**
 * Œil d'Horus : des anneaux tournent, chacun avec un fragment doré de l'œil ; appuyer pour arrêter l'anneau qui tourne
 * quand son fragment passe en haut. Tous les anneaux alignés reforment l'œil.
 * Difficulté : nombre d'anneaux, vitesse, précision demandée ; sens et vitesses varient d'un anneau à l'autre.
 */
export const horus = defineTrial({
  kind: 'horus',
  title: "Œil d'Horus",
  rule: 'Arrête chaque anneau quand son fragment doré passe en haut.',
  start(difficulty, rng): TrialRun {
    const count = byDifficulty(difficulty, [2, 2, 3, 3, 4]);
    const base = byDifficulty(difficulty, [1.6, 2, 2.3, 2.7, 3.1]);
    const tolerance = byDifficulty(difficulty, [0.4, 0.32, 0.27, 0.22, 0.18]);
    const TOP = -Math.PI / 2;
    const rings = Array.from({ length: count }, () => ({
      angle: TOP + Math.PI * (0.5 + rng.next()),
      speed: base * (0.8 + rng.next() * 0.4) * (rng.next() < 0.5 ? -1 : 1),
    }));
    let current = 0;
    let state: TrialRun['state'] = 'playing';
    return {
      sounds: [],
      get state() {
        return state;
      },
      update(dt) {
        if (state !== 'playing') return;
        rings[current].angle += rings[current].speed * dt;
      },
      press() {
        if (state !== 'playing') return;
        const ring = rings[current];
        if (Math.abs(angleGap(ring.angle, TOP)) > tolerance) {
          state = 'fail';
          this.sounds.push('wall');
          return;
        }
        ring.angle = TOP;
        current++;
        this.sounds.push('click');
        if (current >= count) {
          state = 'success';
          this.sounds.push('unlock');
        }
      },
      solve() {
        return state === 'playing' && Math.abs(angleGap(rings[current].angle, TOP)) <= tolerance * 0.5 ? 'press' : null;
      },
      draw(ctx, size) {
        const c = size / 2;
        ctx.clearRect(0, 0, size, size);
        const outer = size * 0.44;
        const width = (outer - size * 0.12) / count;
        rings.forEach((ring, i) => {
          const r = outer - width * (i + 0.5);
          ctx.lineWidth = width * 0.86;
          ctx.strokeStyle = i === current && state === 'playing' ? '#a8733a' : BRONZE;
          ctx.beginPath();
          ctx.arc(c, c, r, 0, TAU);
          ctx.stroke();
          // Fragment doré de l'anneau.
          const locked = i < current || state === 'success';
          ctx.strokeStyle = state === 'fail' && i === current ? '#ff5a4a' : GOLD;
          ctx.shadowColor = GOLD;
          ctx.shadowBlur = locked ? 16 : 6;
          ctx.beginPath();
          ctx.arc(c, c, r, ring.angle - 0.3, ring.angle + 0.3);
          ctx.stroke();
          ctx.shadowBlur = 0;
        });
        // Repère en haut (là où les fragments doivent s'arrêter).
        ctx.fillStyle = '#f4ead8';
        ctx.beginPath();
        ctx.moveTo(c, size * 0.035);
        ctx.lineTo(c - size * 0.03, size * -0.005);
        ctx.lineTo(c + size * 0.03, size * -0.005);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(c - size * 0.035, size * 0.0);
        ctx.lineTo(c + size * 0.035, size * 0.0);
        ctx.lineTo(c, size * 0.05);
        ctx.fill();
        // Œil au centre : sombre, puis doré une fois reformé.
        ctx.fillStyle = state === 'success' ? GOLD : DARK;
        ctx.beginPath();
        ctx.ellipse(c, c, size * 0.08, size * 0.045, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = state === 'success' ? DARK : '#3a2a1a';
        ctx.beginPath();
        ctx.arc(c, c, size * 0.025, 0, TAU);
        ctx.fill();
      },
    };
  },
});
