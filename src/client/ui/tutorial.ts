import type { GameSession } from '../session';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/**
 * Tutoriel de déplacement, affiché une seule fois (à la première partie) :
 * sur mobile, une main glisse dans la zone du joystick et les boutons sont légendés ; sur ordinateur, les touches.
 * Il disparaît dès que le joueur a marché un peu (ou au bout de 12 s).
 */
export class MoveTutorial {
  private session: GameSession | null = null;
  private shownAt = 0;

  constructor(
    isTouch: boolean,
    private readonly storage: { get(key: string): string | null; set(key: string, value: string): void },
  ) {
    $('tutorial').classList.add(isTouch ? 'touch' : 'keys');
  }

  start(session: GameSession): void {
    if (this.storage.get('tutorial-move') === 'done') return;
    this.session = session;
    this.shownAt = performance.now();
    $('tutorial').classList.add('show');
  }

  update(): void {
    if (!this.session) return;
    if (this.session.movedTime > 1.2 || performance.now() - this.shownAt > 12000) this.finish();
  }

  private finish(): void {
    this.session = null;
    $('tutorial').classList.remove('show');
    this.storage.set('tutorial-move', 'done');
  }
}
