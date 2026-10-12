import { DatabaseSync } from 'node:sqlite';

/**
 * Base de données du serveur : SQLite intégré à Node (aucune dépendance), un seul fichier facile à sauvegarder.
 * Tout l'accès passe par accounts.ts : changer de moteur (PostgreSQL, Cloudflare D1…) ne touche que ces deux fichiers.
 *
 * Modèle extensible : un compte (`users`) a plusieurs moyens de connexion (`identities` : mot de passe, code de secours,
 * et plus tard e-mail, Google, Facebook…). Un compte invité n'a aucun moyen de connexion : sa session est sa clé.
 */
export type Database = DatabaseSync;

/** Migrations, dans l'ordre ; la version courante est notée dans `meta`. Ne jamais modifier une migration publiée. */
const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     -- Pseudo réservé (minuscules, sans accents) : uniquement pour les comptes sécurisés.
     name_key TEXT UNIQUE,
     created_at INTEGER NOT NULL,
     progress TEXT NOT NULL DEFAULT '{}'
   );
   CREATE TABLE identities (
     provider TEXT NOT NULL,
     subject TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     secret TEXT,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (provider, subject)
   );
   CREATE INDEX identities_user ON identities(user_id);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);`,
];

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined;
  for (let version = Number(row?.value ?? 0); version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[version]);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version + 1));
    db.exec('COMMIT');
  }
  return db;
}
