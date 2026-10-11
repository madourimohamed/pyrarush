import { BONUS_EYE_MS, BONUS_HOURGLASS_MS, BONUS_IDS, type BonusId } from '../../core';
import { icon, type IconName } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Présentation des bonus (les règles sont dans le moteur : Game.useBonus). */
export const BONUS_INFO: Record<BonusId, { name: string; effect: string; icon: IconName }> = {
  eye: { name: 'Œil de Râ', effect: `Montre un passage de ton étage pendant ${BONUS_EYE_MS / 1000} s`, icon: 'eye' },
  shield: { name: "Bouclier d'Anubis", effect: 'Annule ta prochaine chute', icon: 'shield' },
  hourglass: { name: 'Sablier de Thot', effect: `Retire ${BONUS_HOURGLASS_MS / 1000} s au chronomètre`, icon: 'hourglass' },
};

/** Mélange de Fisher-Yates (le contenu des coffres n'a pas besoin d'être rejouable). */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ChestsView {
  /** Bonus déjà en réserve, remplacé par le nouveau. */
  current: BonusId | null;
  onOpen(): void;
  onPick(bonus: BonusId): void;
  onDone(): void;
}

/** Trésor du sommet : trois coffres fermés, on en ouvre un, les deux autres se dévoilent ensuite. */
export function renderChests(v: ChestsView): void {
  const list = $('chests');
  const result = $('chest-result');
  const done = $('btn-chests-continue');
  result.innerHTML = '';
  done.classList.remove('show');
  done.onclick = v.onDone;
  list.innerHTML = '';
  list.classList.remove('picked');
  for (const bonus of shuffled(BONUS_IDS)) {
    const info = BONUS_INFO[bonus];
    const chest = document.createElement('button');
    chest.className = 'chest';
    chest.setAttribute('aria-label', 'Ouvrir ce coffre');
    chest.innerHTML = `<span class="loot">${icon(info.icon)}<b>${info.name}</b></span><span class="chest-lid"></span><span class="chest-body"></span>`;
    chest.addEventListener('click', () => {
      if (list.classList.contains('picked')) return;
      list.classList.add('picked');
      chest.classList.add('open', 'chosen');
      v.onOpen();
      v.onPick(bonus);
      setTimeout(() => list.querySelectorAll('.chest:not(.chosen)').forEach((c) => c.classList.add('open')), 700);
      const replaced = v.current && v.current !== bonus ? `<small>Il remplace ton ${BONUS_INFO[v.current].name}.</small>` : '';
      result.innerHTML = `<b>${info.name} !</b><span>${info.effect}. À utiliser une fois pendant une partie.</span>${replaced}`;
      done.classList.add('show');
    });
    list.appendChild(chest);
  }
}

/** Bouton du bonus en réserve dans l'interface de jeu (caché s'il n'y en a pas). */
export function renderBonusButton(bonus: BonusId | null, active = false): void {
  const button = $('btn-bonus');
  button.classList.toggle('has', bonus !== null || active);
  button.classList.toggle('active', active);
  button.querySelector('.bonus-icon')!.innerHTML = bonus ? icon(BONUS_INFO[bonus].icon) : active ? icon('shield') : '';
  button.setAttribute('aria-label', bonus ? `Utiliser : ${BONUS_INFO[bonus].name}` : 'Bonus');
}
