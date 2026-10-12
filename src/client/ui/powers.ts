import { POWER_DISPLAY_MAX, POWER_IDS, type PowerId, type PowerReserve } from '../../core';
import { icon, type IconName } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Présentation des pouvoirs du multijoueur (les règles sont dans core/multiplayer.ts et sur le serveur). */
export const POWER_INFO: Record<PowerId, { name: string; short: string; icon: IconName }> = {
  turbo: { name: 'Turbo', short: 'Turbo', icon: 'bolt' },
  shield: { name: "Bouclier d'Anubis", short: 'Bouclier', icon: 'shield' },
  seal: { name: 'Sceau magique', short: 'Sceau', icon: 'seal' },
  mine: { name: 'Mine', short: 'Mine', icon: 'bomb' },
  cloud: { name: 'Nuage de confusion', short: 'Nuage', icon: 'cloud' },
  boots: { name: 'Bottes rebondissantes', short: 'Bottes', icon: 'boots' },
  car: { name: 'Voiture', short: 'Voiture', icon: 'car' },
};

const button = (power: PowerId) => document.querySelector<HTMLButtonElement>(`#power-bar [data-power="${power}"]`);

/**
 * Barre de pouvoirs : seuls les pouvoirs possédés (ou en cours d'effet) sont affichés, en gros boutons colorés
 * qui « respirent » ; un toucher ou un clic utilise le pouvoir (touches 1, 2, 3… dans l'ordre de la barre).
 * Tant qu'on n'a rien, un petit message invite à ouvrir des portes.
 */
export function setupPowerBar(onUse: (power: PowerId) => void): void {
  const bar = $('power-bar');
  bar.innerHTML =
    `<div class="power-hint">Ouvre les portes : des pouvoirs s'y cachent !</div>` +
    POWER_IDS.map(
      (id) =>
        `<button class="power ${id}" data-power="${id}" aria-label="${POWER_INFO[id].name}">` +
        `<span class="orb">${icon(POWER_INFO[id].icon)}<b class="count">0</b><span class="key"></span></span>` +
        `<span class="label">${POWER_INFO[id].short}</span><span class="new">NOUVEAU !</span></button>`,
    ).join('');
  for (const el of Array.from(bar.querySelectorAll<HTMLButtonElement>('button'))) {
    el.addEventListener('pointerdown', (e) => {
      // Ne pas déclencher la caméra ni le joystick ; utilisable en courant.
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      onUse(el.dataset.power as PowerId);
    });
    const release = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }
}

/**
 * Met la barre à jour : compteurs, pouvoirs affichés, atténués quand ils ne peuvent pas servir maintenant
 * (raison en info-bulle), anneau de temps restant pour un effet en cours (`running`, fraction de 0 à 1).
 */
export function renderPowerBar(reserve: PowerReserve, blockers: Record<PowerId, string | null>, running: Partial<Record<PowerId, number>>): void {
  let any = false;
  let key = 0;
  for (const id of POWER_IDS) {
    const el = button(id);
    if (!el) continue;
    const count = reserve[id];
    const left = running[id] ?? 0;
    any ||= count > 0 || left > 0;
    el.classList.toggle('owned', count > 0);
    el.classList.toggle('running', left > 0);
    el.classList.toggle('blocked', count > 0 && blockers[id] !== null);
    el.style.setProperty('--progress', String(Math.max(0, Math.min(1, left))));
    // Touches 1, 2, 3… dans l'ordre des pouvoirs affichés (le badge montre toujours la bonne touche).
    el.querySelector('.key')!.textContent = count > 0 ? String(++key) : '';
    el.querySelector('.count')!.textContent = count > POWER_DISPLAY_MAX ? `${POWER_DISPLAY_MAX}+` : `×${count}`;
    el.title = count === 0 ? `${POWER_INFO[id].name} (en cours)` : (blockers[id] ?? `${POWER_INFO[id].name} : clique pour l'utiliser`);
  }
  $('power-bar').classList.toggle('has-powers', any);
}

/**
 * Pouvoir gagné : son icône s'envole depuis `from` (point de l'écran, la porte ouverte) jusqu'à son bouton,
 * qui apparaît en rebondissant avec « NOUVEAU ! ».
 */
export function announcePower(power: PowerId, from: { x: number; y: number } | null): void {
  const el = button(power);
  if (!el) return;
  el.classList.add('owned');
  $('power-bar').classList.add('has-powers');
  const orb = el.querySelector<HTMLElement>('.orb')!;
  const to = orb.getBoundingClientRect();
  const start = from ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  const flyer = document.createElement('div');
  flyer.className = `power-flyer ${power}`;
  flyer.style.background = getComputedStyle(el).getPropertyValue('--c2') || '#888';
  flyer.innerHTML = icon(POWER_INFO[power].icon);
  flyer.style.left = `${start.x - 28}px`;
  flyer.style.top = `${start.y - 28}px`;
  document.body.appendChild(flyer);
  requestAnimationFrame(() => {
    flyer.style.transform = `translate(${to.left + to.width / 2 - start.x}px, ${to.top + to.height / 2 - start.y}px) scale(0.8)`;
    flyer.style.opacity = '0.4';
  });
  window.setTimeout(() => {
    flyer.remove();
    el.classList.remove('fresh');
    void el.offsetWidth; // relance l'animation si on gagne le même pouvoir deux fois de suite
    el.classList.add('fresh');
    window.setTimeout(() => el.classList.remove('fresh'), 1700);
  }, 750);
}

/** Pouvoirs possédés, dans l'ordre de la barre (raccourcis clavier 1, 2, 3…). */
export function visiblePowers(): PowerId[] {
  return POWER_IDS.filter((id) => button(id)?.classList.contains('owned'));
}

