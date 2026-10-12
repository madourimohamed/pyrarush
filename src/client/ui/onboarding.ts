import type { GameEvent } from '../../core';
import type { SfxName } from '../audio/sfx';
import type { GameSession } from '../session';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

type Step = 'right' | 'left' | 'jump' | 'door';
const STEPS: Step[] = ['right', 'left', 'jump', 'door'];

/** Texte et touches de chaque étape (mobile : le pouce et les flèches suffisent, pas de touches). */
const TEXT: Record<Step, { title: string; touch: string; keys: string; caps: string[] }> = {
  right: { title: 'Marche vers la droite', touch: 'Glisse ton pouce vers la droite, à gauche de l’écran', keys: 'Garde la touche enfoncée', caps: ['D', '→'] },
  left: { title: 'Marche vers la gauche', touch: 'Glisse ton pouce vers la gauche', keys: 'Garde la touche enfoncée', caps: ['Q', 'A', '←'] },
  jump: { title: 'Saute !', touch: 'Touche le bouton de saut', keys: 'Appuie sur la barre d’espace', caps: ['Espace'] },
  door: { title: 'Ouvre la porte dorée', touch: 'Approche-toi de la porte qui brille, puis touche la main', keys: 'Approche-toi de la porte qui brille, puis appuie sur E', caps: ['E'] },
};

/** Temps de marche (s) dans la bonne direction pour valider une étape de déplacement. */
const WALK_SECONDS = 0.8;

/**
 * Démo de prise en main, au premier lancement : marcher à droite, à gauche, sauter, ouvrir une porte.
 * On ne passe à l'étape suivante qu'après l'avoir réussie (pas de bouton pour passer) ; la porte à ouvrir est
 * un vrai passage, signalé par le repère doré, pour que la démo se termine toujours sur une réussite.
 */
export class Onboarding {
  private session: GameSession | null = null;
  private index = 0;
  private walked = 0;
  private busy = false;
  /** Démo terminée : le joueur touche « C'est parti ! ». */
  onDone: () => void = () => {};

  constructor(
    private readonly isTouch: boolean,
    private readonly play: (name: SfxName) => void,
  ) {
    document.querySelector('.onb-go')!.addEventListener('click', () => this.finish());
  }

  get active(): boolean {
    return this.session !== null;
  }

  start(session: GameSession): void {
    this.session = session;
    this.index = 0;
    this.walked = 0;
    session.canInteract = false;
    session.guide = {
      move: (x, dt) => this.onMove(x, dt),
      jump: () => this.step === 'jump' && this.success(),
      door: (e) => this.onDoor(e),
    };
    $('onboarding').classList.remove('done');
    $('onboarding').classList.add('show');
    this.render();
  }

  /** Arrête la démo sans la valider (retour au menu en cours de route). */
  stop(): void {
    if (!this.session) return;
    this.session.guide = null;
    this.session.canInteract = true;
    this.session = null;
    $('onboarding').classList.remove('show', 'done');
  }

  private get step(): Step | undefined {
    return STEPS[this.index];
  }

  private onMove(x: number, dt: number): void {
    const want = this.step === 'right' ? 1 : this.step === 'left' ? -1 : 0;
    if (!want || this.busy) return;
    if (x * want > 0.5) this.walked += dt;
    if (this.walked >= WALK_SECONDS) this.success();
  }

  private onDoor(e: Extract<GameEvent, { type: 'doorResult' }>): void {
    if (this.step === 'door' && e.fx === 'passage') this.success();
  }

  /** Étape réussie : la carte passe au vert, un carillon, puis l'étape suivante (ou la fin). */
  private success(): void {
    if (this.busy || !this.session) return;
    this.busy = true;
    const card = document.querySelector('.onb-card')!;
    card.classList.add('success');
    card.querySelector('.onb-title')!.textContent = 'Bravo !';
    card.querySelector('.onb-sub')!.textContent = '';
    card.querySelector('.onb-keys')!.innerHTML = '';
    this.play(this.index === STEPS.length - 1 ? 'star3' : 'star1');
    window.setTimeout(() => {
      this.busy = false;
      card.classList.remove('success');
      this.index++;
      this.walked = 0;
      if (this.step === 'door' && this.session) {
        this.session.canInteract = true;
        this.session.showGuideDoor();
      }
      this.render();
    }, 900);
  }

  private render(): void {
    const root = $('onboarding');
    const step = this.step;
    const dots = Array.from(root.querySelectorAll('.onb-dots i'));
    dots.forEach((dot, i) => {
      dot.classList.toggle('done', i < this.index);
      dot.classList.toggle('current', i === this.index);
    });
    const card = root.querySelector('.onb-card')!;
    if (!step) {
      root.removeAttribute('data-step');
      root.classList.add('done');
      card.querySelector('.onb-title')!.textContent = 'Tu es prêt !';
      card.querySelector('.onb-sub')!.textContent = 'Trouve les passages, évite les pièges, et atteins le sommet.';
      card.querySelector('.onb-keys')!.innerHTML = '';
      return;
    }
    root.dataset.step = step;
    const text = TEXT[step];
    card.querySelector('.onb-title')!.textContent = text.title;
    card.querySelector('.onb-sub')!.textContent = this.isTouch ? text.touch : text.keys;
    card.querySelector('.onb-keys')!.innerHTML = text.caps.map((c) => `<kbd>${c}</kbd>`).join('<span>ou</span>');
  }

  private finish(): void {
    this.stop();
    this.onDone();
  }
}
