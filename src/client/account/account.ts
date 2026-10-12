import type { Level } from '../../core';
import { mergeProgress, type Progress } from '../../net/account';
import { progress, storage } from '../storage';
import { turnstileToken } from './turnstile';

/** Compte tel que le jeu le connaît (jamais de secret). */
export interface AccountView {
  id: string;
  name: string;
  secured: boolean;
}

/** Erreur à afficher au joueur (message du serveur). */
export class AccountProblem extends Error {}

const TOKEN_KEY = 'account-token';
/** Délai avant d'envoyer la progression (regroupe les changements). */
const SYNC_DELAY = 1500;

/**
 * Compte du joueur côté navigateur : un compte invité est créé tout seul au premier lancement ; le joueur peut le
 * sécuriser (pseudo + mot de passe + code de secours), se connecter sur un autre appareil, se déconnecter, le supprimer.
 * La progression reste aussi sur l'appareil (le solo marche hors connexion) et se synchronise dès que possible.
 */
export class AccountManager {
  account: AccountView | null = null;
  /** Serveur joignable lors de la dernière tentative. */
  online = false;
  /** Appelé quand le compte ou la progression changent (affichage du profil, du menu). */
  onUpdate: () => void = () => {};
  private syncTimer = 0;

  constructor(private readonly levels: Level[]) {
    progress.onChange(() => this.scheduleSync());
  }

  get token(): string | null {
    return storage.get(TOKEN_KEY);
  }

  /** Au démarrage : reprend la session (ou crée un invité), puis fusionne la progression de l'appareil avec celle du compte. */
  async start(): Promise<void> {
    try {
      if (this.token) {
        const me = await this.request<{ account: AccountView & { progress: Progress } }>('GET', '/api/me').catch((error) => {
          if (error instanceof AccountProblem && error.message.includes('Session')) return null;
          throw error;
        });
        if (me) return await this.adopt(me.account);
        storage.remove(TOKEN_KEY);
      }
      await this.newGuest();
    } catch {
      this.online = false;
      this.onUpdate();
    }
  }

  /** Sécurise le compte : renvoie le code de secours, à faire noter au joueur (affiché une seule fois). */
  async secure(name: string, password: string): Promise<string> {
    const res = await this.request<{ account: AccountView; recoveryCode: string }>('POST', '/api/me/secure', { name, password });
    this.account = res.account;
    this.onUpdate();
    return res.recoveryCode;
  }

  /** Connexion à un compte existant ; la progression de cet appareil s'y ajoute (on garde le meilleur). */
  async login(name: string, password: string): Promise<void> {
    const res = await this.request<{ token: string; account: AccountView & { progress: Progress } }>('POST', '/api/login', {
      name,
      password,
      turnstile: await turnstileToken(),
    });
    storage.set(TOKEN_KEY, res.token);
    await this.adopt(res.account);
  }

  /** Mot de passe oublié : renvoie le nouveau code de secours. */
  async recover(name: string, code: string, password: string): Promise<string> {
    const res = await this.request<{ token: string; account: AccountView & { progress: Progress }; recoveryCode: string }>('POST', '/api/recover', {
      name,
      code,
      password,
      turnstile: await turnstileToken(),
    });
    storage.set(TOKEN_KEY, res.token);
    await this.adopt(res.account);
    return res.recoveryCode;
  }

  async rename(name: string): Promise<void> {
    const res = await this.request<{ account: AccountView }>('PUT', '/api/me/name', { name });
    this.account = res.account;
    this.onUpdate();
  }

  /** Déconnexion : cet appareil repart d'un compte invité vierge (la progression reste sur le compte quitté). */
  async logout(): Promise<void> {
    await this.request('POST', '/api/logout').catch(() => {});
    this.forget();
    await this.newGuest();
  }

  /** Suppression définitive du compte et de sa progression (ici et sur le serveur). */
  async remove(): Promise<void> {
    await this.request('DELETE', '/api/me');
    this.forget();
    await this.newGuest();
  }

  private forget(): void {
    window.clearTimeout(this.syncTimer);
    storage.remove(TOKEN_KEY);
    progress.clear(this.levels);
    this.account = null;
  }

  private async newGuest(): Promise<void> {
    const res = await this.request<{ token: string; account: AccountView & { progress: Progress } }>('POST', '/api/guest', { turnstile: await turnstileToken() });
    storage.set(TOKEN_KEY, res.token);
    await this.adopt(res.account);
  }

  /** Fusionne la progression de l'appareil et celle du compte, garde le résultat des deux côtés. */
  private async adopt(account: AccountView & { progress: Progress }): Promise<void> {
    this.account = { id: account.id, name: account.name, secured: account.secured };
    this.online = true;
    progress.apply(mergeProgress(account.progress, progress.snapshot(this.levels)), this.levels);
    this.onUpdate();
    await this.sync();
  }

  private scheduleSync(): void {
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.sync(), SYNC_DELAY);
  }

  /** Envoie la progression locale ; le serveur renvoie la fusion (utile si un autre appareil a progressé). */
  private async sync(): Promise<void> {
    if (!this.token) return;
    try {
      const res = await this.request<{ progress: Progress }>('PUT', '/api/me/progress', { progress: progress.snapshot(this.levels) });
      progress.apply(res.progress, this.levels);
      this.online = true;
    } catch {
      this.online = false; // hors connexion : on réessaiera au prochain changement
    }
    this.onUpdate();
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.token;
    const res = await fetch(path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new AccountProblem(data.error ?? 'Le serveur ne répond pas, réessaie.');
    return data as T;
  }
}
