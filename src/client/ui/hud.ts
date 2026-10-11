const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type ToastKind = 'good' | 'bad' | 'info' | 'scarab' | 'chaud' | 'tiede' | 'froid';

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
  private prompt = $('prompt');
  private actButton = $('btn-act');
  private toastTimer = 0;
  private floors = 0;

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
    this.floorLabel.textContent = floor > this.floors ? 'Sommet !' : `Étage ${floor} / ${this.floors}`;
    for (const rung of Array.from(this.ladder.children) as HTMLElement[]) {
      const f = rung.classList.contains('summit') ? this.floors + 1 : Number(rung.dataset.floor);
      rung.classList.toggle('current', f === floor);
      rung.classList.toggle('reached', f <= best && f !== floor);
    }
  }

  setTime(ms: number): void {
    this.timer.textContent = formatTime(ms);
  }

  showToast(text: string, kind: ToastKind, seconds = 1.8): void {
    this.toast.textContent = text;
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
