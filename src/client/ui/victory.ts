import type { Level, StarResult } from '../../core';
import { hex } from '../scene/themes';
import { formatTime } from './hud';
import { icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface VictoryView {
  level: Level;
  time: number;
  falls: number;
  doorsTested: number;
  seed: number;
  result: StarResult;
  newRecord: boolean;
  next?: Level;
  nextThumbnail?: string;
  justUnlocked: boolean;
  /** Joué quand chaque étoile s'allume (1, 2, 3). */
  onStar(index: 1 | 2 | 3): void;
}

let timers: number[] = [];

/** Écran de victoire : étoiles qui s'allument une à une, objectifs, record, aperçu du prochain univers. */
export function renderVictory(v: VictoryView): void {
  timers.forEach(clearTimeout);
  timers = [];
  $('v-title').textContent = `Niveau ${v.level.number} terminé !`;
  $('v-time').textContent = formatTime(v.time);
  $('v-record').classList.toggle('show', v.newRecord);
  $('v-falls').textContent = String(v.falls);
  $('v-doors').textContent = String(v.doorsTested);
  $('v-seed').textContent = String(v.seed);

  const goal = (ok: boolean, text: string) => `<li class="${ok ? 'ok' : 'ko'}">${icon(ok ? 'check' : 'cross')}<span>${text}</span></li>`;
  const { goals } = v.level;
  $('v-goals').innerHTML = [
    goal(true, 'Sommet atteint'),
    goal(v.result.fast, `Moins de ${formatTime(goals.time * 1000).replace(/\.\d$/, '')} — ton temps : ${formatTime(v.time)}`),
    goal(v.result.careful, `${goals.maxFalls === 0 ? 'Aucune chute' : `${goals.maxFalls} chute${goals.maxFalls > 1 ? 's' : ''} maximum`} — tu en as fait ${v.falls}`),
  ].join('');

  const stars = Array.from($('v-stars').children) as HTMLElement[];
  stars.forEach((s) => s.classList.remove('on'));
  for (let i = 0; i < v.result.stars; i++) {
    timers.push(
      window.setTimeout(() => {
        stars[i].classList.add('on');
        v.onStar((i + 1) as 1 | 2 | 3);
      }, 500 + i * 450),
    );
  }

  const next = $('v-next');
  next.classList.toggle('show', !!v.next);
  if (v.next) {
    const { sky } = v.next.theme;
    const img = $<HTMLImageElement>('v-next-img');
    img.style.setProperty('--sky', `linear-gradient(160deg, ${hex(sky.top)}, ${hex(sky.mid)} 55%, ${hex(sky.horizon)})`);
    if (v.nextThumbnail) img.src = v.nextThumbnail;
    else img.removeAttribute('src');
    $('v-next-label').textContent = v.justUnlocked ? '🔓 Nouvel univers débloqué !' : 'Prochain univers';
    $('v-next-name').textContent = `Niveau ${v.next.number} · ${v.next.name}`;
    $('v-next-tagline').textContent = v.next.tagline;
  }
  $('v-final').classList.toggle('show', !v.next);
  $('btn-v-next').style.display = v.next ? '' : 'none';
}
