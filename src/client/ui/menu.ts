import type { Level } from '../../core';
import { hex } from '../scene/themes';
import { formatTime } from './hud';
import { icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface MenuState {
  levels: Level[];
  selected: Level;
  unlocked: number;
  best(level: Level): number | null;
  stars(level: Level): number;
  thumbnails: Map<number, string>;
}

/** Trois petites étoiles, allumées selon le meilleur résultat. */
const starRow = (count: number) => `<span class="level-stars">${[1, 2, 3].map((i) => icon('star').replace('<svg', `<svg class="${i <= count ? 'on' : ''}"`)).join('')}</span>`;

/** Badge d'une carte : verrouillé, ou « Nouveau » tant qu'il n'est pas terminé (sinon ses étoiles s'affichent). */
function badge(level: Level, state: MenuState): string {
  if (level.number > state.unlocked) return `<span class="badge lock">${icon('lock')}</span>`;
  if (state.stars(level) === 0) return '<span class="badge new">Nouveau</span>';
  return '';
}

/** Cartes des niveaux : miniature 3D (ou dégradé du ciel en attendant), nom, étages, durée, badge. */
export function renderLevelCards(state: MenuState, onSelect: (level: Level) => void): void {
  const list = $('level-list');
  list.innerHTML = '';
  for (const level of state.levels) {
    const locked = level.number > state.unlocked;
    const { sky } = level.theme;
    const card = document.createElement('button');
    card.className = `level-card${level === state.selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
    card.dataset.level = String(level.number);
    card.style.setProperty('--sky', `linear-gradient(160deg, ${hex(sky.top)}, ${hex(sky.mid)} 55%, ${hex(sky.horizon)})`);
    card.style.setProperty('--accent', level.theme.accent[0]);
    const thumb = state.thumbnails.get(level.number);
    const best = state.best(level);
    card.innerHTML = `
      ${thumb ? `<img class="thumb" src="${thumb}" alt="" />` : ''}
      ${badge(level, state)}
      <span class="card-text">
        <span class="level-num">Niveau ${level.number}</span>
        <span class="level-name">${level.name}</span>
        ${state.stars(level) > 0 ? starRow(state.stars(level)) : ''}
        <span class="level-meta">
          <span>${icon('floors')}${level.config.floors} étages</span>
          <span>${icon('clock')}${best ? formatTime(best) : level.duration}</span>
        </span>
      </span>`;
    card.disabled = locked;
    card.addEventListener('click', () => onSelect(level));
    list.appendChild(card);
  }
}

/** Remplace le dégradé d'une carte par sa miniature dès qu'elle est prête. */
export function showThumbnail(level: Level, url: string): void {
  const card = document.querySelector<HTMLElement>(`.level-card[data-level="${level.number}"]`);
  if (!card || card.querySelector('.thumb')) return;
  card.insertAdjacentHTML('afterbegin', `<img class="thumb" src="${url}" alt="" />`);
}

/** Fiche du niveau sélectionné (bas droite de l'accueil). */
export function renderLevelInfo(level: Level): void {
  $('info-number').textContent = `Niveau ${level.number}`;
  $('info-name').textContent = level.name;
  $('info-tagline').textContent = level.tagline;
  $('info-highlights').innerHTML = level.highlights.map((h) => `<li>${icon('check')}<span>${h}</span></li>`).join('');
}

/** Tableau des records par niveau. */
export function renderRecords(state: MenuState): void {
  $('records-list').innerHTML = state.levels
    .map((level) => {
      const best = state.best(level);
      const locked = level.number > state.unlocked;
      return `<div class="record-row${locked ? ' locked' : ''}">
        <span class="record-num">${level.number}</span>
        <span class="record-name">${level.name}</span>
        <span class="record-time">${locked ? icon('lock') : best ? `${starRow(state.stars(level))}${formatTime(best)}` : '—'}</span>
      </div>`;
    })
    .join('');
}
