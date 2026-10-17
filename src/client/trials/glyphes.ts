import { byDifficulty, defineTrial, GOLD, type TrialRun } from './trial';

const SYMBOLS = ['☥', '▲', '✦', '◉'];
const COLORS = [GOLD, '#2fb7c4', '#e8603c', '#7a6aff'];

/**
 * Mémoire des glyphes : la porte allume une suite de hiéroglyphes, il faut la refaire dans le même ordre.
 * Difficulté : longueur de la suite, vitesse d'affichage.
 */
export const glyphes = defineTrial({
  kind: 'glyphes',
  title: 'Mémoire des glyphes',
  rule: 'Retiens la suite de glyphes, puis refais-la dans le même ordre.',
  start(difficulty, rng): TrialRun {
    const length = byDifficulty(difficulty, [3, 4, 5, 6, 7]);
    const step = byDifficulty(difficulty, [0.7, 0.62, 0.55, 0.48, 0.42]);
    const sequence: number[] = [];
    for (let i = 0; i < length; i++) {
      // Jamais deux fois le même glyphe de suite (on ne verrait pas le deuxième s'allumer).
      let next = rng.int(0, SYMBOLS.length - 1);
      if (next === sequence[i - 1]) next = (next + 1) % SYMBOLS.length;
      sequence.push(next);
    }
    // Affichage : 0,5 s d'attente, puis chaque glyphe allumé `step` s (dont 70 % allumé, 30 % éteint).
    let time = -0.5;
    let typed = 0;
    let echo = 0;
    let state: TrialRun['state'] = 'playing';
    const showing = () => time < length * step;
    const run: TrialRun = {
      sounds: [],
      get state() {
        return state;
      },
      buttons: { symbols: SYMBOLS, colors: COLORS, lit: null, enabled: false },
      update(dt) {
        const before = showing() && time >= 0 ? Math.floor(time / step) : -1;
        time += dt;
        echo = Math.max(0, echo - dt);
        const showingNow = showing() && time >= 0;
        const index = showingNow ? Math.floor(time / step) : -1;
        if (index !== before && index >= 0) run.sounds.push('click');
        const lit = showingNow && time - index * step < step * 0.7 ? sequence[index] : null;
        run.buttons = { symbols: SYMBOLS, colors: COLORS, lit: echo > 0 ? run.buttons!.lit : lit, enabled: state === 'playing' && !showing() };
      },
      press(choice) {
        if (state !== 'playing' || showing() || choice === undefined) return;
        run.buttons = { ...run.buttons!, lit: choice };
        echo = 0.15;
        if (choice !== sequence[typed]) {
          state = 'fail';
          run.sounds.push('wall');
          return;
        }
        typed++;
        run.sounds.push('click');
        if (typed >= length) {
          state = 'success';
          run.sounds.push('unlock');
        }
      },
      solve() {
        return state === 'playing' && !showing() ? sequence[typed] : null;
      },
      draw(ctx, size) {
        ctx.clearRect(0, 0, size, size);
        // Progression : un point par glyphe de la suite.
        for (let i = 0; i < length; i++) {
          const x = size / 2 + (i - (length - 1) / 2) * size * 0.09;
          ctx.fillStyle = i < typed ? GOLD : showing() ? '#5a4a3a' : '#a08a6a';
          ctx.beginPath();
          ctx.arc(x, size / 2, size * 0.028, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f4ead8';
        ctx.font = `600 ${Math.round(size * 0.07)}px "Fredoka Variable", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(showing() ? 'Regarde…' : state === 'playing' ? 'À toi !' : '', size / 2, size * 0.35);
      },
    };
    return run;
  },
});
