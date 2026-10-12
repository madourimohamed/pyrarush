import { POWER_DISPLAY_MAX, POWER_IDS, type PowerId, type PowerReserve } from '../../core';
import { icon, type IconName } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Présentation des pouvoirs du duel (les règles sont dans core/duel.ts et sur le serveur). */
export const POWER_INFO: Record<PowerId, { name: string; icon: IconName }> = {
  turbo: { name: 'Turbo', icon: 'bolt' },
  shield: { name: "Bouclier d'Anubis", icon: 'shield' },
  seal: { name: 'Sceau magique', icon: 'seal' },
  mine: { name: 'Mine', icon: 'bomb' },
  cloud: { name: 'Nuage de confusion', icon: 'cloud' },
  boots: { name: 'Bottes rebondissantes', icon: 'boots' },
  car: { name: 'Voiture', icon: 'car' },
};

/** Barre de pouvoirs : une icône par pouvoir avec son compteur ; un toucher ou un clic l'utilise (touches 1, 2, 3…). */
export function setupPowerBar(onUse: (power: PowerId) => void): void {
  const bar = $('power-bar');
  bar.innerHTML = POWER_IDS.map(
    (id, i) =>
      `<button class="power ${id}" data-power="${id}" aria-label="${POWER_INFO[id].name}">${icon(POWER_INFO[id].icon)}<b class="count">0</b><span class="key">${i + 1}</span></button>`,
  ).join('');
  for (const button of Array.from(bar.querySelectorAll<HTMLButtonElement>('button'))) {
    button.addEventListener('pointerdown', (e) => {
      // Ne pas déclencher la caméra ni le joystick ; utilisable en courant.
      e.preventDefault();
      e.stopPropagation();
      onUse(button.dataset.power as PowerId);
    });
  }
}

/** Compteurs, et icônes atténuées quand le pouvoir manque ou ne peut pas servir maintenant (raison en info-bulle). */
export function renderPowerBar(reserve: PowerReserve, blockers: Record<PowerId, string | null>): void {
  for (const id of POWER_IDS) {
    const button = document.querySelector<HTMLButtonElement>(`#power-bar [data-power="${id}"]`);
    if (!button) continue;
    const count = reserve[id];
    button.querySelector('.count')!.textContent = count > POWER_DISPLAY_MAX ? `${POWER_DISPLAY_MAX}+` : String(count);
    button.classList.toggle('empty', count === 0);
    button.classList.toggle('blocked', count > 0 && blockers[id] !== null);
    button.title = count === 0 ? `${POWER_INFO[id].name} : aucun en réserve` : (blockers[id] ?? POWER_INFO[id].name);
  }
}
