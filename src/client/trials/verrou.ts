import { angleGap, BRONZE, byDifficulty, DARK, defineTrial, GOLD, TAU, type TrialRun } from './trial';

/**
 * Rythme du verrou : une aiguille tourne autour de la serrure ; appuyer quand elle passe sur le cran doré.
 * Difficulté : nombre de crans à valider, vitesse de l'aiguille, taille du cran, changement de sens.
 */
export const verrou = defineTrial({
  kind: 'verrou',
  title: 'Rythme du verrou',
  rule: "Appuie quand l'aiguille passe sur le cran doré.",
  start(difficulty, rng): TrialRun {
    const notches = byDifficulty(difficulty, [1, 1, 2, 3, 3]);
    const speed = byDifficulty(difficulty, [0.5, 0.65, 0.75, 0.9, 1.05]) * TAU;
    const half = byDifficulty(difficulty, [0.45, 0.36, 0.3, 0.24, 0.19]);
    const reverses = difficulty >= 3;
    let angle = -Math.PI / 2;
    let direction = 1;
    let zone = angle + Math.PI * (0.7 + rng.next() * 0.6);
    let done = 0;
    let state: TrialRun['state'] = 'playing';
    let flash = 0;

    const inZone = () => Math.abs(angleGap(angle, zone)) <= half;
    return {
      sounds: [],
      get state() {
        return state;
      },
      update(dt) {
        if (state !== 'playing') return;
        angle += direction * speed * dt;
        flash = Math.max(0, flash - dt);
      },
      press() {
        if (state !== 'playing') return;
        if (!inZone()) {
          state = 'fail';
          this.sounds.push('wall');
          return;
        }
        done++;
        flash = 0.25;
        this.sounds.push('click');
        if (done >= notches) {
          state = 'success';
          this.sounds.push('unlock');
          return;
        }
        // Cran suivant, loin de l'aiguille ; le sens peut s'inverser.
        zone = angle + direction * Math.PI * (0.6 + rng.next() * 0.8);
        if (reverses && rng.next() < 0.5) direction = -direction;
      },
      solve() {
        return state === 'playing' && Math.abs(angleGap(angle, zone)) <= half * 0.5 ? 'press' : null;
      },
      draw(ctx, size) {
        const c = size / 2;
        const r = size * 0.38;
        ctx.clearRect(0, 0, size, size);
        // Plaque de bronze et piste.
        ctx.fillStyle = BRONZE;
        ctx.beginPath();
        ctx.arc(c, c, r + size * 0.07, 0, TAU);
        ctx.fill();
        ctx.lineWidth = size * 0.06;
        ctx.strokeStyle = DARK;
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        ctx.stroke();
        // Cran doré.
        if (state === 'playing') {
          ctx.strokeStyle = GOLD;
          ctx.shadowColor = GOLD;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(c, c, r, zone - half, zone + half);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // Voyants des crans validés.
        for (let i = 0; i < notches; i++) {
          const x = c + (i - (notches - 1) / 2) * size * 0.09;
          ctx.fillStyle = i < done ? GOLD : '#3a2a1a';
          ctx.beginPath();
          ctx.arc(x, c + size * 0.17, size * 0.028, 0, TAU);
          ctx.fill();
        }
        // Trou de serrure.
        ctx.fillStyle = DARK;
        ctx.beginPath();
        ctx.arc(c, c - size * 0.04, size * 0.055, 0, TAU);
        ctx.fill();
        ctx.fillRect(c - size * 0.025, c - size * 0.04, size * 0.05, size * 0.11);
        // Aiguille.
        const color = state === 'fail' ? '#ff5a4a' : flash > 0 || state === 'success' ? GOLD : '#f4ead8';
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.022;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(angle) * r * 0.3, c + Math.sin(angle) * r * 0.3);
        ctx.lineTo(c + Math.cos(angle) * r * 1.08, c + Math.sin(angle) * r * 1.08);
        ctx.stroke();
      },
    };
  },
});
