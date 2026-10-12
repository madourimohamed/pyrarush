import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, type Account, type AccountService } from './accounts';
import { LIMITS, LoginGuard, RateLimiter, SECURITY_HEADERS, verifyTurnstile } from './security';
import { nameKey } from '../src/net/account';

/**
 * API des comptes (JSON, sous /api). Authentification par jeton : en-tête « Authorization: Bearer <jeton> »
 * (fonctionne pareil sur le web et dans une appli Android, sans cookie ni risque CSRF).
 *
 *   POST   /api/guest      { turnstile? }             → { token, account }   nouveau compte invité
 *   GET    /api/me                                     → { account }
 *   PUT    /api/me/progress { progress }               → { progress }         fusionnée avec celle du serveur
 *   PUT    /api/me/name     { name }                   → { account }
 *   POST   /api/me/secure   { name, password }         → { account, recoveryCode }
 *   POST   /api/login       { name, password, turnstile? } → { token, account }
 *   POST   /api/recover     { name, code, password, turnstile? } → { token, account, recoveryCode }
 *   POST   /api/logout                                 → {}
 *   DELETE /api/me                                     → {}                   suppression définitive
 */

export interface ApiRequest {
  method: string;
  path: string;
  token: string | null;
  body: Record<string, unknown>;
  ip: string;
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

export interface ApiOptions {
  /** Clé secrète Turnstile (absente en local : vérification ignorée). */
  turnstileSecret?: string;
  now?: () => number;
  fetch?: typeof fetch;
}

const ok = (json: unknown = {}): ApiResponse => ({ status: 200, json });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ApiResponse => ({ status, json: { error, ...extra } });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Ce que le jeu reçoit d'un compte (jamais d'identifiant interne de connexion ni de secret). */
const publicAccount = (a: Account) => ({ id: a.id, name: a.name, secured: a.secured, progress: a.progress });

export function createApi(accounts: AccountService, options: ApiOptions = {}) {
  const now = options.now ?? Date.now;
  const guests = new RateLimiter(LIMITS.guestPerIp.max, LIMITS.guestPerIp.windowMs, now);
  const logins = new RateLimiter(LIMITS.loginPerIp.max, LIMITS.loginPerIp.windowMs, now);
  const calls = new RateLimiter(LIMITS.apiPerAccount.max, LIMITS.apiPerAccount.windowMs, now);
  const sensitive = new RateLimiter(LIMITS.sensitivePerAccount.max, LIMITS.sensitivePerAccount.windowMs, now);
  const guard = new LoginGuard(now);
  const human = (token: unknown, ip: string) => verifyTurnstile(str(token) || undefined, ip, options.turnstileSecret, options.fetch);
  const tooMany = () => fail(429, 'Trop de tentatives : réessaie dans quelques minutes.');

  /** Connexion ou récupération : limite par IP, verrouillage temporaire par pseudo et par IP après trop d'échecs. */
  async function guarded(req: ApiRequest, attempt: () => ApiResponse): Promise<ApiResponse> {
    const keys = [`ip:${req.ip}`, `name:${nameKey(str(req.body.name))}`];
    const lockedMs = Math.max(...keys.map((k) => guard.locked(k)));
    if (lockedMs > 0) return fail(429, `Trop d'essais ratés : réessaie dans ${Math.ceil(lockedMs / 60000)} min.`);
    if (!logins.hit(req.ip)) return tooMany();
    if (!(await human(req.body.turnstile, req.ip))) return fail(403, 'Vérification anti-robot échouée, réessaie.');
    let response: ApiResponse;
    try {
      response = attempt();
    } catch (error) {
      response = accountError(error);
    }
    for (const key of keys) {
      if (response.status === 200) guard.succeed(key);
      else if (response.status === 401) guard.fail(key);
    }
    return response;
  }

  async function handle(req: ApiRequest): Promise<ApiResponse> {
    const route = `${req.method} ${req.path}`;
    try {
      // Routes sans compte.
      if (route === 'POST /api/guest') {
        if (!guests.hit(req.ip)) return tooMany();
        if (!(await human(req.body.turnstile, req.ip))) return fail(403, 'Vérification anti-robot échouée, réessaie.');
        const { account, token } = accounts.createGuest();
        return ok({ token, account: publicAccount(account) });
      }
      if (route === 'POST /api/login') {
        return await guarded(req, () => {
          const { account, token } = accounts.login(str(req.body.name), str(req.body.password));
          return ok({ token, account: publicAccount(account) });
        });
      }
      if (route === 'POST /api/recover') {
        return await guarded(req, () => {
          const { account, token, recoveryCode } = accounts.recover(str(req.body.name), str(req.body.code), str(req.body.password));
          return ok({ token, account: publicAccount(account), recoveryCode });
        });
      }

      // Routes avec compte.
      const account = req.token ? accounts.authenticate(req.token) : null;
      if (!account) return fail(401, 'Session expirée : reconnecte-toi.');
      if (!calls.hit(account.id)) return tooMany();
      switch (route) {
        case 'GET /api/me':
          return ok({ account: publicAccount(account) });
        case 'PUT /api/me/progress':
          return ok({ progress: accounts.saveProgress(account.id, req.body.progress) });
        case 'PUT /api/me/name':
          if (!sensitive.hit(account.id)) return tooMany();
          return ok({ account: publicAccount(accounts.rename(account.id, str(req.body.name))) });
        case 'POST /api/me/secure': {
          if (!sensitive.hit(account.id)) return tooMany();
          const { account: secured, recoveryCode } = accounts.secure(account.id, str(req.body.name), str(req.body.password));
          return ok({ account: publicAccount(secured), recoveryCode });
        }
        case 'POST /api/logout':
          accounts.logout(req.token!);
          return ok();
        case 'DELETE /api/me':
          accounts.delete(account.id);
          return ok();
        default:
          return fail(404, 'Route inconnue.');
      }
    } catch (error) {
      return accountError(error);
    }
  }

  /** Branche l'API sur le serveur HTTP de Node ; renvoie false si la requête n'est pas pour l'API. */
  async function serve(httpReq: IncomingMessage, res: ServerResponse, ip: string): Promise<boolean> {
    const path = (httpReq.url ?? '/').split('?')[0];
    if (!path.startsWith('/api/')) return false;
    const auth = httpReq.headers.authorization;
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    let response: ApiResponse;
    try {
      const body = await readJson(httpReq);
      response = await handle({ method: httpReq.method ?? 'GET', path, token, body, ip });
    } catch (error) {
      response = error instanceof BodyError ? fail(400, error.message) : fail(500, 'Erreur du serveur.');
      if (!(error instanceof BodyError)) console.error(error);
    }
    res.writeHead(response.status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(response.json));
    return true;
  }

  return { handle, serve };
}

/** Erreur attendue (mauvais mot de passe, pseudo pris…) → réponse HTTP ; toute autre erreur est un bug et remonte. */
function accountError(error: unknown): ApiResponse {
  if (!(error instanceof AccountError)) throw error;
  const status = error.code === 'credentials' ? 401 : error.code === 'taken' ? 409 : error.code === 'not-found' ? 404 : 400;
  return fail(status, error.message, { code: error.code });
}

class BodyError extends Error {}

/** Corps JSON d'au plus 4 Ko (au-delà, la requête est refusée). */
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve({});
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new BodyError('Requête trop grande.'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(typeof parsed === 'object' && parsed !== null ? parsed : {});
      } catch {
        reject(new BodyError('JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}
