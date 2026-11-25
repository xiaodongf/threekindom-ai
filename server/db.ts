import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let defaultDb: Database.Database | null = null;

export function openDatabase(customPath?: string): Database.Database {
  const resolvedPath =
    customPath ?? process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/threekindoms.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  if (resolvedPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT COLLATE NOCASE,
      display_name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT 'male',
      password_hash TEXT,
      is_guest INTEGER NOT NULL DEFAULT 1,
      prefs_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
      ON users(username COLLATE NOCASE)
      WHERE username IS NOT NULL;

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS solo_saves (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      label TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, slot_id)
    );

    CREATE TABLE IF NOT EXISTS mp_rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'lobby',
      active_faction TEXT NOT NULL DEFAULT 'wei',
      state_version INTEGER NOT NULL DEFAULT 0,
      summary_json TEXT NOT NULL DEFAULT '{}',
      state_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mp_room_players (
      room_id TEXT NOT NULL REFERENCES mp_rooms(id) ON DELETE CASCADE,
      faction TEXT NOT NULL,
      seat_type TEXT NOT NULL DEFAULT 'human',
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      player_name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT 'male',
      last_seen_at TEXT,
      PRIMARY KEY (room_id, faction)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_room_players_user ON mp_room_players(user_id);
  `);

  return db;
}

export function getDefaultDb(): Database.Database {
  if (!defaultDb) {
    defaultDb = openDatabase();
  }
  return defaultDb;
}
