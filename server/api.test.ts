import { describe, expect, it } from 'vitest';
import { levelCatalog } from '../src/levels';
import { AccountService } from './accounts';
import { createApi, type ApiRequest } from './api';
import { openDatabase } from './db';
import { LIMITS, LOGIN_FAILURES } from './security';


function setup(options: Parameters<typeof createApi>[1] = {}) {
  const now = { t: 1_000_000 };
  const api = createApi(new AccountService(openDatabase(':memory:'), levelCatalog, () => now.t), { now: () => now.t, ...options });
  const call = (method: string, path: string, body: Record<string, unknown> = {}, token: string | null = null, ip = '1.2.3.4') =>
    api.handle({ method, path, body, token, ip } satisfies ApiRequest);
  return { call, now };
}

describe('API des comptes', () => {
  it('parcours complet : invité, progression, sécurisation, connexion ailleurs, suppression', async () => {
    const { call } = setup();
    const guest = (await call('POST', '/api/guest')).json as { token: string; account: { id: string; secured: boolean } };
    expect(guest.account.secured).toBe(false);
    expect((await call('PUT', '/api/me/progress', { progress: { reached: levelCatalog.ids[1] } }, guest.token)).json).toMatchObject({ progress: { reached: levelCatalog.ids[1] } });
    const secured = await call('POST', '/api/me/secure', { name: 'Yasmine', password: 'oasis-emeraude' }, guest.token);
    expect(secured.status).toBe(200);
    expect(JSON.stringify(secured.json)).not.toContain('scrypt'); // aucun secret ne sort du serveur
    const login = (await call('POST', '/api/login', { name: 'yasmine', password: 'oasis-emeraude' })).json as { token: string; account: { progress: { reached: string } } };
    expect(login.account.progress.reached).toBe(levelCatalog.ids[1]);
    expect((await call('DELETE', '/api/me', {}, login.token)).status).toBe(200);
    expect((await call('GET', '/api/me', {}, login.token)).status).toBe(401);
    expect((await call('POST', '/api/login', { name: 'Yasmine', password: 'oasis-emeraude' })).status).toBe(401);
  });

  it('sans session valide : 401 ; pseudo pris : 409', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/me')).status).toBe(401);
    const a = (await call('POST', '/api/guest')).json as { token: string };
    const b = (await call('POST', '/api/guest', {}, null, '5.6.7.8')).json as { token: string };
    await call('POST', '/api/me/secure', { name: 'Ilyes', password: 'mot-de-passe-long' }, a.token);
    expect((await call('PUT', '/api/me/name', { name: 'ILYES' }, b.token)).status).toBe(409);
  });

  it('anti-spam : pas plus de quelques comptes invités par adresse IP et par heure', async () => {
    const { call, now } = setup();
    for (let i = 0; i < LIMITS.guestPerIp.max; i++) expect((await call('POST', '/api/guest')).status).toBe(200);
    expect((await call('POST', '/api/guest')).status).toBe(429);
    expect((await call('POST', '/api/guest', {}, null, '9.9.9.9')).status).toBe(200); // autre adresse
    now.t += LIMITS.guestPerIp.windowMs;
    expect((await call('POST', '/api/guest')).status).toBe(200);
  });

  it('anti-spam : verrouillage temporaire du pseudo après trop de mauvais mots de passe, même depuis plusieurs adresses', async () => {
    const { call, now } = setup();
    const guest = (await call('POST', '/api/guest')).json as { token: string };
    await call('POST', '/api/me/secure', { name: 'Sofiane', password: 'le-bon-secret' }, guest.token);
    for (let i = 0; i < LOGIN_FAILURES.max; i++) {
      expect((await call('POST', '/api/login', { name: 'Sofiane', password: `essai-${i}` }, null, `10.0.0.${i}`)).status).toBe(401);
    }
    const locked = await call('POST', '/api/login', { name: 'Sofiane', password: 'le-bon-secret' }, null, '10.0.1.1');
    expect(locked.status).toBe(429);
    now.t += LOGIN_FAILURES.lockMs;
    expect((await call('POST', '/api/login', { name: 'Sofiane', password: 'le-bon-secret' }, null, '10.0.1.1')).status).toBe(200);
  });

  it('anti-robot : avec une clé Turnstile configurée, un jeton valide est exigé', async () => {
    const fakeFetch = (async (_url: string, init: { body: URLSearchParams }) =>
      ({ json: async () => ({ success: init.body.get('response') === 'humain' }) }) as Response) as unknown as typeof fetch;
    const { call } = setup({ turnstileSecret: 'secret', fetch: fakeFetch });
    expect((await call('POST', '/api/guest')).status).toBe(403);
    expect((await call('POST', '/api/guest', { turnstile: 'robot' })).status).toBe(403);
    expect((await call('POST', '/api/guest', { turnstile: 'humain' })).status).toBe(200);
  });
});
