import type { IncomingMessage } from 'node:http';

/**
 * Protections anti-abus du serveur : limites de fréquence, verrouillage après échecs de connexion,
 * vérification anti-robot (Cloudflare Turnstile, gratuit et sans limite d'usage), adresse réelle du client.
 * Toutes les limites sont réglées ici. Aucun bannissement définitif : seulement des blocages temporaires.
 */

export const LIMITS = {
  /** Création de comptes invités, par adresse IP. */
  guestPerIp: { max: 10, windowMs: 3600_000 },
  /** Tentatives de connexion ou de récupération, par adresse IP. */
  loginPerIp: { max: 20, windowMs: 600_000 },
  /** Requêtes d'API ordinaires (progression, nom…), par compte. */
  apiPerAccount: { max: 60, windowMs: 60_000 },
  /** Sécurisation, changement de nom, par compte. */
  sensitivePerAccount: { max: 10, windowMs: 3600_000 },
  /** Codes de salle erronés, par adresse IP : au-delà, les essais sont bloqués jusqu'à la fin de la fenêtre. */
  joinFailuresPerIp: { max: 5, windowMs: 60_000 },
  /** Création de salles, par compte. */
  roomsPerAccount: { max: 15, windowMs: 600_000 },
  /** Connexions multijoueur simultanées par adresse IP. */
  socketsPerIp: 8,
  /** Positions relayées par seconde et par joueur (le jeu en envoie 15) : au-delà, ignorées (ni relayées ni utilisées). */
  positionsPerSecond: 20,
  /** Messages multijoueur par seconde et par connexion (positions ~15/s + actions) ; au-delà, ignorés. */
  messagesPerSecond: 40,
  /** Au-delà de ce nombre de messages en une seconde, la connexion est fermée (client malveillant). */
  messagesFlood: 200,
} as const;

/** Échecs de connexion avant verrouillage temporaire (par pseudo et par IP), et durée du verrouillage. */
export const LOGIN_FAILURES = { max: 8, windowMs: 900_000, lockMs: 900_000 };

/** Compteur à fenêtre fixe, par clé (IP, compte…). Les clés inactives sont oubliées. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** La limite est-elle déjà atteinte (sans compter de nouvelle action) ? */
  blocked(key: string): boolean {
    const entry = this.hits.get(key);
    return !!entry && entry.until > this.now() && entry.count >= this.max;
  }

  /** Compte une action ; renvoie false si la limite est atteinte (l'action doit être refusée). */
  hit(key: string): boolean {
    const now = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
    const entry = this.hits.get(key);
    if (!entry || entry.until <= now) {
      this.hits.set(key, { count: 1, until: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
}

/** Verrouillage temporaire après trop d'échecs de connexion (protège contre l'essai de mots de passe en série). */
export class LoginGuard {
  private readonly failures = new Map<string, { count: number; since: number; lockedUntil: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Clé verrouillée ? Renvoie le temps restant (ms), ou 0. */
  locked(key: string): number {
    const entry = this.failures.get(key);
    return entry ? Math.max(0, entry.lockedUntil - this.now()) : 0;
  }

  fail(key: string): void {
    const now = this.now();
    let entry = this.failures.get(key);
    if (!entry || now - entry.since > LOGIN_FAILURES.windowMs) {
      entry = { count: 0, since: now, lockedUntil: 0 };
      this.failures.set(key, entry);
    }
    entry.count++;
    if (entry.count >= LOGIN_FAILURES.max) entry.lockedUntil = now + LOGIN_FAILURES.lockMs;
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}

/**
 * Vérification anti-robot Cloudflare Turnstile (gratuite, nombre de vérifications illimité).
 * Sans clé secrète configurée (développement local), la vérification est ignorée.
 */
export async function verifyTurnstile(token: string | undefined, ip: string, secret: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Adresse IP du client. Derrière Cloudflare (tunnel ou proxy), l'adresse réelle est dans CF-Connecting-IP :
 * on ne la croit que si le serveur est configuré pour (sinon n'importe qui pourrait l'inventer).
 */
export function clientIp(req: IncomingMessage, trustCloudflare: boolean): string {
  const header = req.headers['cf-connecting-ip'];
  if (trustCloudflare && typeof header === 'string' && header) return header;
  return req.socket.remoteAddress ?? 'inconnue';
}

/** Compteur de messages par seconde d'une connexion : 'ok', 'drop' (ignoré) ou 'flood' (fermer la connexion). */
export class MessageBudget {
  private second = 0;
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  take(): 'ok' | 'drop' | 'flood' {
    const second = Math.floor(this.now() / 1000);
    if (second !== this.second) {
      this.second = second;
      this.count = 0;
    }
    this.count++;
    if (this.count > LIMITS.messagesFlood) return 'flood';
    return this.count > LIMITS.messagesPerSecond ? 'drop' : 'ok';
  }
}

/**
 * Origine autorisée pour une connexion multijoueur : une page servie par ce même site (même hôte), ou une origine
 * listée dans `allowed` (par exemple une appli mobile). Sans en-tête Origin (programme hors navigateur), la connexion
 * est acceptée : elle doit de toute façon présenter un jeton de compte valide.
 */
export function originAllowed(origin: string | undefined, host: string | undefined, allowed: string[] = []): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * En-têtes de sécurité de toutes les réponses : seuls nos scripts (et Turnstile) s'exécutent, la page ne peut pas
 * être affichée dans un cadre d'un autre site, pas de devinette de type de fichier, pas de caméra ni de micro.
 * Les styles en ligne restent permis (couleurs posées par le jeu) ; images et textures peuvent venir de data:/blob:.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "connect-src 'self' blob: data:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

