import { icon, type IconName } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type ToastKind = 'good' | 'bad' | 'info' | 'scarab' | 'chaud' | 'tiede' | 'froid';

/** Icône associée à chaque type de message. */
const TOAST_ICONS: Record<ToastKind, IconName> = {
  good: 'up',
  bad: 'down',
  info: 'info',
  scarab: 'scarab',
  chaud: 'thermo',
  tiede: 'thermo',
  froid: 'thermo',
};

export function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Interface en jeu (HTML/CSS par-dessus le canvas). */
export class Hud {
  private floorLabel = $('floor-label');
  private timer = $('timer');
  private ladder = $('ladder');
  private toast = $('toast');
  private toastIcon = this.toast.querySelector<HTMLElement>('.toast-icon')!;
  private toastTitle = this.toast.querySelector<HTMLElement>('.toast-title')!;
  private toastSub = this.toast.querySelector<HTMLElement>('.toast-sub')!;
  private prompt = $('prompt');
  private actButton = $('btn-act');
  private toastTimer = 0;
  private floors = 0;

  setLevel(number: number, name: string): void {
    $('hud-level').textContent = `Niveau ${number}`;
    $('hud-level-name').textContent = name;
  }

  setup(floors: number): void {
    this.floors = floors;
    this.ladder.innerHTML = '';
    const summit = document.createElement('div');
    summit.className = 'rung summit';
    summit.textContent = '▲';
    this.ladder.appendChild(summit);
    for (let f = floors; f >= 1; f--) {
      const rung = document.createElement('div');
      rung.className = 'rung';
      rung.dataset.floor = String(f);
      rung.textContent = String(f);
      this.ladder.appendChild(rung);
    }
    this.hideToast();
  }

  setFloor(floor: number, best: number): void {
    this.floorLabel.textContent = floor > this.floors ? 'Sommet' : `${floor} / ${this.floors}`;
    for (const rung of Array.from(this.ladder.children) as HTMLElement[]) {
      const f = rung.classList.contains('summit') ? this.floors + 1 : Number(rung.dataset.floor);
      rung.classList.toggle('current', f === floor);
      rung.classList.toggle('reached', f <= best && f !== floor);
    }
  }

  /** Grande bannière au centre : nouvel étage atteint pour la première fois dans la partie. */
  showFloorBanner(title: string, sub: string): void {
    const banner = $('floor-banner');
    banner.querySelector('b')!.textContent = title;
    banner.querySelector('small')!.textContent = sub;
    banner.classList.remove('show');
    void banner.offsetWidth; // relance l'animation
    banner.classList.add('show');
  }

  /** Duel : étage de l'adversaire sur l'échelle (null = pas d'adversaire). */
  setRivalFloor(floor: number | null): void {
    for (const rung of Array.from(this.ladder.children) as HTMLElement[]) {
      const f = rung.classList.contains('summit') ? this.floors + 1 : Number(rung.dataset.floor);
      rung.classList.toggle('rival', f === floor);
    }
  }

  /** Grand chiffre du compte à rebours (« 3 », « 2 », « 1 », « Go ! »). */
  showCountdown(text: string): void {
    const el = $('countdown');
    el.textContent = text;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  setTime(ms: number): void {
    this.timer.textContent = formatTime(ms);
  }

  /** Carte de message : icône, titre et sous-titre optionnel. */
  showToast(title: string, kind: ToastKind, seconds = 1.8, sub = ''): void {
    this.toastIcon.innerHTML = icon(TOAST_ICONS[kind]);
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toastSub.style.display = sub ? '' : 'none';
    this.toast.className = `show ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), seconds * 1000);
  }

  hideToast(): void {
    this.toast.className = '';
  }

  setPrompt(visible: boolean): void {
    this.prompt.classList.toggle('show', visible);
    this.actButton.classList.toggle('ready', visible);
  }
}
