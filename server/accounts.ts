import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { emptyProgress, mergeProgress, nameKey, nameProblem, normalizeProgress, passwordProblem, type Progress } from '../src/net/account';
import type { Database } from './db';

/**
 * Comptes joueurs : invités (créés sans rien saisir), sécurisés par pseudo + mot de passe + code de secours,
 * sessions, progression, suppression. Pas d'e-mail pour l'instant : le modèle « un compte, plusieurs moyens de connexion »
 * (table identities) permettra d'ajouter e-mail, Google, Facebook… sans migration des comptes existants.
 */

export interface Account {
  id: string;
  name: string;
  /** Compte sécurisé (pseudo réservé + mot de passe) ; sinon invité. */
  secured: boolean;
  progress: Progress;
}

/** Erreur attendue (affichée au joueur), à distinguer d'un bug. */
export class AccountError extends Error {
  constructor(
    readonly code: 'invalid' | 'taken' | 'credentials' | 'not-found' | 'already-secured',
    message: string,
  ) {
    super(message);
  }
}

/** Durée de vie d'une session (renouvelée à chaque connexion). */
export const SESSION_DAYS = 180;
const DAY = 24 * 3600 * 1000;

// ---------- Secrets ----------

/** Jeton de session : 32 octets aléatoires ; seule son empreinte est stockée (une fuite de la base ne donne aucun accès). */
const newToken = () => randomBytes(32).toString('base64url');
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Mot de passe ou code de secours : scrypt (lent exprès, intégré à Node), sel aléatoire par secret. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
function verifySecret(secret: string, stored: string): boolean {
  const [kind, N, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(secret, Buffer.from(salt, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

/** Code de secours lisible (sans caractères ambigus), à noter par le joueur : XXXX-XXXX-XXXX-XXXX. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRecoveryCode(): string {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('')).join('-');
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------- Service ----------

interface UserRow {
  id: string;
  name: string;
  name_key: string | null;
  progress: string;
}

export class AccountService {
  constructor(
    private readonly db: Database,
    /** Identifiants des niveaux, dans l'ordre (validation de la progression). */
    private readonly levelIds: string[],
    private readonly now: () => number = Date.now,
  ) {}

  /** Nouveau compte invité, sans rien saisir : un nom par défaut et une session. */
  createGuest(): { account: Account; token: string } {
    const id = randomBytes(12).toString('base64url');
    const name = `Explorateur${randomInt(1000, 10000)}`;
    this.db.prepare('INSERT INTO users (id, name, created_at, progress) VALUES (?, ?, ?, ?)').run(id, name, this.now(), JSON.stringify(emptyProgress()));
    return { account: this.get(id)!, token: this.openSession(id) };
  }

  /** Compte d'une session valide (null si inconnue ou expirée). */
  authenticate(token: string): Account | null {
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash(token)) as { user_id: string; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at < this.now()) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
      return null;
    }
    return this.get(row.user_id);
  }

  get(id: string): Account | null {
    const row = this.db.prepare('SELECT id, name, name_key, progress FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? this.toAccount(row) : null;
  }

  /**
   * Sécurise un compte invité : pseudo réservé + mot de passe. Renvoie le code de secours (affiché une seule fois),
   * seul moyen de récupérer le compte en cas d'oubli tant qu'il n'y a pas d'e-mail.
   */
  secure(userId: string, name: string, password: string): { account: Account; recoveryCode: string } {
    const account = this.get(userId);
    if (!account) throw new AccountError('not-found', 'Compte introuvable.');
    if (account.secured) throw new AccountError('already-secured', 'Ce compte est déjà sécurisé.');
    const clean = this.checkName(name.trim(), userId);
    const problem = passwordProblem(password);
    if (problem) throw new AccountError('invalid', problem);
    const key = nameKey(clean);
    const recoveryCode = newRecoveryCode();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ?').run(clean, key, userId);
      this.addIdentity(userId, 'password', key, hashSecret(password));
      this.addIdentity(userId, 'recovery', userId, hashSecret(normalizeCode(recoveryCode)));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { account: this.get(userId)!, recoveryCode };
  }

  /** Connexion par pseudo et mot de passe. Même message d'erreur que le pseudo existe ou non (pas d'énumération). */
  login(name: string, password: string): { account: Account; token: string } {
    const row = this.db.prepare("SELECT user_id, secret FROM identities WHERE provider = 'password' AND subject = ?").get(nameKey(name)) as
      | { user_id: string; secret: string }
      | undefined;
    if (!row || !verifySecret(password, row.secret)) throw new AccountError('credentials', 'Pseudo ou mot de passe incorrect.');
    return { account: this.get(row.user_id)!, token: this.openSession(row.user_id) };
  }

  /** Mot de passe oublié : pseudo + code de secours → nouveau mot de passe, nouveau code, anciennes sessions fermées. */
  recover(name: string, code: string, newPassword: string): { account: Account; token: string; recoveryCode: string } {
    const problem = passwordProblem(newPassword);
    if (problem) throw new AccountError('invalid', problem);
    const user = this.db.prepare("SELECT user_id FROM identities WHERE provider = 'password' AND subject = ?").get(nameKey(name)) as { user_id: string } | undefined;
    const recovery = user
      ? (this.db.prepare("SELECT secret FROM identities WHERE provider = 'recovery' AND subject = ?").get(user.user_id) as { secret: string } | undefined)
      : undefined;
    if (!user || !recovery || !verifySecret(normalizeCode(code), recovery.secret)) throw new AccountError('credentials', 'Pseudo ou code de secours incorrect.');
    const recoveryCode = newRecoveryCode();
    this.db.prepare("UPDATE identities SET secret = ? WHERE provider = 'password' AND user_id = ?").run(hashSecret(newPassword), user.user_id);
    this.db.prepare("UPDATE identities SET secret = ? WHERE provider = 'recovery' AND user_id = ?").run(hashSecret(normalizeCode(recoveryCode)), user.user_id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.user_id);
    return { account: this.get(user.user_id)!, token: this.openSession(user.user_id), recoveryCode };
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  /** Change le nom affiché (un invité ne peut pas prendre le pseudo d'un compte sécurisé). */
  rename(userId: string, name: string): Account {
    const account = this.get(userId);
    if (!account) throw new AccountError('not-found', 'Compte introuvable.');
    const clean = this.checkName(name.trim(), userId);
    if (account.secured) {
      const key = nameKey(clean);
      this.db.prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ?').run(clean, key, userId);
      this.db.prepare("UPDATE identities SET subject = ? WHERE provider = 'password' AND user_id = ?").run(key, userId);
    } else {
      this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(clean, userId);
    }
    return this.get(userId)!;
  }

  /** Enregistre la progression envoyée par le jeu, fusionnée avec celle du serveur (on garde le meilleur). */
  saveProgress(userId: string, incoming: unknown): Progress {
    const account = this.get(userId);
    if (!account) throw new AccountError('not-found', 'Compte introuvable.');
    const merged = mergeProgress(account.progress, normalizeProgress(incoming, this.levelIds));
    this.db.prepare('UPDATE users SET progress = ? WHERE id = ?').run(JSON.stringify(merged), userId);
    return merged;
  }

  /** Suppression définitive du compte et de toutes ses données (exigée par le Play Store). */
  delete(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  /** Ménage : sessions expirées. */
  purgeExpiredSessions(): number {
    return Number(this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(this.now()).changes);
  }

  private checkName(name: string, userId: string): string {
    const problem = nameProblem(name);
    if (problem) throw new AccountError('invalid', problem);
    const owner = this.db.prepare('SELECT id FROM users WHERE name_key = ?').get(nameKey(name)) as { id: string } | undefined;
    if (owner && owner.id !== userId) throw new AccountError('taken', 'Ce pseudo est déjà pris.');
    return name;
  }

  private addIdentity(userId: string, provider: string, subject: string, secret: string): void {
    this.db.prepare('INSERT INTO identities (provider, subject, user_id, secret, created_at) VALUES (?, ?, ?, ?, ?)').run(provider, subject, userId, secret, this.now());
  }

  private openSession(userId: string): string {
    const token = newToken();
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash(token), userId, this.now(), this.now() + SESSION_DAYS * DAY);
    return token;
  }

  private toAccount(row: UserRow): Account {
    let progress: Progress;
    try {
      progress = normalizeProgress(JSON.parse(row.progress), this.levelIds);
    } catch {
      progress = emptyProgress();
    }
    return { id: row.id, name: row.name, secured: row.name_key !== null, progress };
  }
}
