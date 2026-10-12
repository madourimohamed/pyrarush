import { nameProblem, passwordProblem } from '../../net/account';
import { AccountProblem, type AccountManager } from '../account/account';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Panel = 'guest' | 'login' | 'recover' | 'code' | 'secured';

/**
 * Écran « Mon compte » : sécuriser un compte invité (pseudo + mot de passe → code de secours), se connecter,
 * récupérer un compte avec le code de secours, se déconnecter, supprimer son compte (avec confirmation).
 */
export class AccountScreen {
  private panel: Panel = 'guest';
  private deleteArmed = 0;

  constructor(private readonly manager: AccountManager) {
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#screen-account [data-show]'))) {
      button.addEventListener('click', () => this.show(button.dataset.show === 'home' ? this.home() : (button.dataset.show as Panel)));
    }
    this.form('acc-secure-form', async (data) => {
      const problem = nameProblem(data.name) ?? passwordProblem(data.password);
      if (problem) return this.status(problem, true);
      this.showCode(await this.manager.secure(data.name.trim(), data.password));
    });
    this.form('acc-login-form', async (data) => {
      await this.manager.login(data.name.trim(), data.password);
      this.status('Connecté ! Ta progression est à jour.');
      this.show(this.home());
    });
    this.form('acc-recover-form', async (data) => {
      const problem = passwordProblem(data.password);
      if (problem) return this.status(problem, true);
      this.showCode(await this.manager.recover(data.name.trim(), data.code, data.password));
    });
    $('acc-code-copy').addEventListener('click', () => {
      void navigator.clipboard?.writeText($('acc-code').textContent ?? '').then(() => this.status('Code copié.'));
    });
    $('acc-logout').addEventListener('click', () => this.run(async () => {
      await this.manager.logout();
      this.status('Déconnecté : cet appareil repart d’un compte invité.');
      this.show(this.home());
    }));
    $('acc-delete').addEventListener('click', () => this.remove());
  }

  /** Ouvre l'écran sur le bon panneau. */
  open(): void {
    this.status('');
    this.disarmDelete();
    this.show(this.home());
  }

  /** Met à jour le nom et le statut affichés (appelé à chaque changement du compte). */
  render(): void {
    const account = this.manager.account;
    $('acc-name').textContent = account?.name ?? 'Explorateur';
    const badge = $('acc-badge');
    badge.textContent = !account ? 'Hors connexion : progression gardée sur cet appareil' : account.secured ? '✓ Compte sécurisé' : 'Compte invité';
    badge.classList.toggle('secured', !!account?.secured);
    if (this.panel === 'guest' || this.panel === 'secured') this.show(this.home());
  }

  private home(): Panel {
    return this.manager.account?.secured ? 'secured' : 'guest';
  }

  private show(panel: Panel): void {
    this.panel = panel;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#screen-account .acc-panel'))) el.classList.toggle('show', el.dataset.panel === panel);
  }

  private showCode(code: string): void {
    $('acc-code').textContent = code;
    this.status('');
    this.show('code');
  }

  /** Formulaire : empêche l'envoi par défaut, transmet les champs, affiche les erreurs du serveur. */
  private form(id: string, submit: (data: Record<string, string>) => Promise<void>): void {
    const form = $<HTMLFormElement>(id);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
      void this.run(async () => {
        await submit(data);
        form.reset();
      });
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.status('…');
    try {
      await action();
    } catch (error) {
      this.status(error instanceof AccountProblem ? error.message : 'Le serveur ne répond pas, réessaie dans un instant.', true);
    }
  }

  /** Suppression en deux temps : un premier toucher arme le bouton, un second (dans les 5 s) supprime. */
  private remove(): void {
    const button = $<HTMLButtonElement>('acc-delete');
    if (!this.deleteArmed) {
      button.classList.add('confirm');
      button.textContent = 'Confirmer : tout supprimer définitivement ?';
      this.deleteArmed = window.setTimeout(() => this.disarmDelete(), 5000);
      return;
    }
    this.disarmDelete();
    void this.run(async () => {
      await this.manager.remove();
      this.status('Compte supprimé. Un nouveau compte invité a été créé sur cet appareil.');
      this.show(this.home());
    });
  }

  private disarmDelete(): void {
    window.clearTimeout(this.deleteArmed);
    this.deleteArmed = 0;
    const button = $<HTMLButtonElement>('acc-delete');
    button.classList.remove('confirm');
    button.textContent = 'Supprimer mon compte';
  }

  private status(text: string, error = false): void {
    const el = $('acc-status');
    el.textContent = text;
    el.classList.toggle('error', error);
  }
}
