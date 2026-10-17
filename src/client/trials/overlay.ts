import { Rng, type Trial } from '../../core';
import type { SfxName } from '../audio/sfx';
import type { SoundPlayer } from '../session';
import { TRIALS } from './index';
import type { TrialRun } from './trial';

/** Temps d'affichage du résultat (porte ouverte / ratée) avant de rendre la main au joueur. */
const RESULT_S = 0.55;

/**
 * Fenêtre d'une épreuve d'ouverture, au-dessus du jeu : titre, règle en une phrase, zone de jeu (toucher = action),
 * boutons pour les épreuves à choix (touches 1 à 4 au clavier). Pilotée par la boucle du jeu (update), donc la pause
 * fige aussi l'épreuve. Le jeu en dessous continue (chronomètre, adversaires).
 */
export class TrialOverlay {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly rule: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly choices: HTMLDivElement;
  private readonly result: HTMLElement;
  private run: TrialRun | null = null;
  private done: ((success: boolean) => void) | null = null;
  private ending = 0;
  private size = 0;

  /** Sortie sonore de la partie en cours (la fenêtre est unique, réutilisée d'une partie à l'autre). */
  sound: SoundPlayer = { play: () => {} };

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'trial';
    this.root.innerHTML = `
      <div class="trial-card">
        <b class="trial-title"></b>
        <small class="trial-rule"></small>
        <canvas class="trial-canvas"></canvas>
        <div class="trial-choices"></div>
        <div class="trial-result"></div>
      </div>`;
    document.body.append(this.root);
    this.title = this.root.querySelector('.trial-title')!;
    this.rule = this.root.querySelector('.trial-rule')!;
    this.canvas = this.root.querySelector('.trial-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.choices = this.root.querySelector('.trial-choices')!;
    this.result = this.root.querySelector('.trial-result')!;
    // Toucher la zone de jeu = action (sur téléphone, plus simple que de viser le bouton Action).
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.run?.press();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.run || e.repeat) return;
      const digit = Number(e.code.replace('Digit', '').replace('Numpad', ''));
      if (this.run.buttons && digit >= 1 && digit <= this.run.buttons.symbols.length) this.run.press(digit - 1);
    });
  }

  get active(): boolean {
    return this.run !== null;
  }

  /** Lance une épreuve ; `onEnd` reçoit le résultat une fois l'affichage du résultat terminé. */
  start(trial: Trial, onEnd: (success: boolean) => void): void {
    const def = TRIALS[trial.kind];
    this.run = def.start(trial.difficulty, new Rng(trial.seed));
    this.done = onEnd;
    this.ending = 0;
    this.title.textContent = def.title;
    this.rule.textContent = def.rule;
    this.result.textContent = '';
    this.result.className = 'trial-result';
    this.buildChoices();
    this.root.classList.add('show');
    this.resize();
    this.sound.play('door');
  }

  /** Abandon sans résultat (chute, coup reçu, fin de partie…). */
  cancel(): void {
    this.close();
  }

  /** Une image : `action` = bouton Action, saut ou touche E / Entrée pressés pendant cette image. */
  update(dt: number, action: boolean): void {
    const run = this.run;
    if (!run) return;
    if (action && run.state === 'playing' && !run.buttons) run.press();
    run.update(dt);
    for (const name of run.sounds.splice(0)) this.sound.play(name as SfxName);
    this.syncChoices();
    run.draw(this.ctx, this.size);
    if (run.state === 'playing') return;
    if (this.ending === 0) {
      const success = run.state === 'success';
      this.result.textContent = success ? 'Ouverte !' : 'Raté…';
      this.result.className = `trial-result ${success ? 'good' : 'bad'}`;
    }
    this.ending += dt;
    if (this.ending >= RESULT_S) {
      const callback = this.done;
      const success = run.state === 'success';
      this.close();
      callback?.(success);
    }
  }

  private close(): void {
    this.run = null;
    this.done = null;
    this.root.classList.remove('show');
  }

  private resize(): void {
    // Épreuves à boutons : petite zone (progression seulement), les boutons font le reste.
    const css = Math.min(this.run?.buttons ? 150 : 300, window.innerWidth * 0.62, window.innerHeight * 0.48);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = this.canvas.style.height = `${css}px`;
    this.canvas.width = this.canvas.height = Math.round(css * ratio);
    this.size = this.canvas.width;
  }

  private buildChoices(): void {
    const buttons = this.run?.buttons;
    this.choices.replaceChildren();
    this.choices.hidden = !buttons;
    if (!buttons) return;
    buttons.symbols.forEach((symbol, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = symbol;
      b.style.setProperty('--glyph', buttons.colors[i]);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.run?.press(i);
      });
      this.choices.append(b);
    });
  }

  private syncChoices(): void {
    const buttons = this.run?.buttons;
    if (!buttons) return;
    [...this.choices.children].forEach((b, i) => {
      b.classList.toggle('lit', buttons.lit === i);
      (b as HTMLButtonElement).disabled = !buttons.enabled;
    });
  }
}

let shared: TrialOverlay | null = null;
/** La fenêtre des épreuves (une seule, créée au premier besoin). */
export function trialOverlay(sound: SoundPlayer): TrialOverlay {
  shared ??= new TrialOverlay();
  shared.sound = sound;
  return shared;
}
