import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function hasColumn(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

export function openDb(file = process.env.MAQAM_DB || path.join(here, '..', 'maqam.db')) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compositions (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      maqam      TEXT NOT NULL,
      notes      TEXT NOT NULL,
      public     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS likes (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      composition_id INTEGER NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, composition_id)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      maqam      TEXT NOT NULL,
      guess      TEXT NOT NULL,
      correct    INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS comments (
      id             INTEGER PRIMARY KEY,
      composition_id INTEGER NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body           TEXT NOT NULL,
      hidden         INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lesson_progress (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id    TEXT NOT NULL,
      score        INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('composition', 'comment')),
      target_id   INTEGER NOT NULL,
      reason      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hidden', 'dismissed')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, target_type, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comp_public ON compositions(public, created_at);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_attempts_time ON attempts(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_comp ON comments(composition_id, id);
  `);
  // additive migrations for databases created by earlier versions
  if (!hasColumn(db, 'users', 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  if (!hasColumn(db, 'compositions', 'parent_id')) {
    db.exec('ALTER TABLE compositions ADD COLUMN parent_id INTEGER REFERENCES compositions(id) ON DELETE SET NULL');
  }
  if (!hasColumn(db, 'compositions', 'hidden')) db.exec('ALTER TABLE compositions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  return db;
}
