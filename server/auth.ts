import type Database from 'better-sqlite3';
import { Router, type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import {
  sanitizeUserPreferences,
  type PersistedUserPreferences,
} from '../src/game/saveSystem.js';
import type { AIRequestConfig, Language, TravelerAvatarId } from '../src/game/types.js';

export const SESSION_COOKIE_NAME = 'tk_session';
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days
const USERNAME_RE = /^[a-zA-Z0-9_\-.]{3,24}$/;

export interface PublicUser {
  id: string;
  username: string | null;
  displayName: string;
  avatar: TravelerAvatarId;
  isGuest: boolean;
  prefs: PersistedUserPreferences;
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string | null;
  display_name: string;
  avatar: string;
  password_hash: string | null;
  is_guest: number;
  prefs_json: string;
  created_at: string;
  updated_at: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUser;
      sessionTokenHash?: string;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function extractRequestToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const qToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (qToken) return qToken;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function rowToPublicUser(row: UserRow): PublicUser {
  let prefs: PersistedUserPreferences = {};
  try {
    const parsed = JSON.parse(row.prefs_json || '{}') as {
      lang?: Language;
      aiConfig?: AIRequestConfig;
    };
    prefs = sanitizeUserPreferences(parsed);
  } catch {
    prefs = {};
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar === 'female' ? 'female' : 'male',
    isGuest: Boolean(row.is_guest),
    prefs,
    createdAt: row.created_at,
  };
}

export function resolveSessionUser(db: Database.Database, token: string | null): {
  user: PublicUser;
  tokenHash: string;
} | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, nowIso) as UserRow | undefined;

  if (!row) return null;
  return { user: rowToPublicUser(row), tokenHash };
}

function createSessionForUser(db: Database.Database, userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expires.toISOString(), now.toISOString());
  return token;
}

export function createGuestAccount(
  db: Database.Database,
  opts?: { displayName?: string; avatar?: TravelerAvatarId }
): { user: PublicUser; sessionToken: string } {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const displayName = (opts?.displayName || '').trim().slice(0, 28) || 'Chrono-Strategist';
  const avatar: TravelerAvatarId = opts?.avatar === 'female' ? 'female' : 'male';

  db.prepare(
    `INSERT INTO users (id, username, display_name, avatar, password_hash, is_guest, prefs_json, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, 1, '{}', ?, ?)`
  ).run(id, displayName, avatar, nowIso, nowIso);

  const sessionToken = createSessionForUser(db, id);
  const created = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow;
  return { user: rowToPublicUser(created), sessionToken };
}

export function attachAuthMiddleware(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractRequestToken(req);
    const resolved = resolveSessionUser(db, token);
    if (resolved) {
      req.authUser = resolved.user;
      req.sessionTokenHash = resolved.tokenHash;
    }
    next();
  };
}

export function requireAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication or guest session required' });
    return;
  }
  next();
}

export function createAuthRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/me', (req, res) => {
    if (req.authUser) {
      res.json({ user: req.authUser });
      return;
    }
    if (req.query.autoGuest === '1') {
      const { user, sessionToken } = createGuestAccount(db);
      setSessionCookie(res, sessionToken);
      res.json({ user, sessionToken });
      return;
    }
    res.json({ user: null });
  });

  router.post('/guest', (req, res) => {
    if (req.authUser) {
      res.json({ user: req.authUser });
      return;
    }
    const body = (req.body || {}) as { displayName?: string; avatar?: TravelerAvatarId };
    const { user, sessionToken } = createGuestAccount(db, body);
    setSessionCookie(res, sessionToken);
    res.json({ user, sessionToken });
  });

  router.post('/register', (req, res) => {
    const body = (req.body || {}) as {
      username?: string;
      password?: string;
      displayName?: string;
      avatar?: TravelerAvatarId;
    };
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!USERNAME_RE.test(username)) {
      res.status(400).json({
        error: 'Username must be 3–24 characters (letters, numbers, _, -, .)',
      });
      return;
    }
    if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'Password/PIN must be at least 4 characters' });
      return;
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
      .get(username) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    const nowIso = new Date().toISOString();
    const pwHash = hashPassword(password);
    const displayName = (body.displayName || '').trim().slice(0, 28) || username;
    const avatar: TravelerAvatarId =
      body.avatar === 'female'
        ? 'female'
        : body.avatar === 'male'
          ? 'male'
          : req.authUser?.avatar ?? 'male';

    // Seamless in-place upgrade if currently playing as a Guest!
    if (req.authUser && req.authUser.isGuest) {
      const guestId = req.authUser.id;
      const upgradeTx = db.transaction(() => {
        db.prepare(
          `UPDATE users
           SET username = ?, display_name = ?, avatar = ?, password_hash = ?, is_guest = 0, updated_at = ?
           WHERE id = ?`
        ).run(username, displayName, avatar, pwHash, nowIso, guestId);

        db.prepare(
          `UPDATE mp_room_players
           SET player_name = ?, avatar = ?
           WHERE user_id = ?`
        ).run(displayName, avatar, guestId);
      });
      upgradeTx();

      const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(guestId) as UserRow;
      res.json({ user: rowToPublicUser(updated), upgradedFromGuest: true });
      return;
    }

    const newId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (id, username, display_name, avatar, password_hash, is_guest, prefs_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, '{}', ?, ?)`
    ).run(newId, username, displayName, avatar, pwHash, nowIso, nowIso);

    const sessionToken = createSessionForUser(db, newId);
    setSessionCookie(res, sessionToken);
    const created = db.prepare(`SELECT * FROM users WHERE id = ?`).get(newId) as UserRow;
    res.json({ user: rowToPublicUser(created), sessionToken });
  });

  router.post('/login', (req, res) => {
    const body = (req.body || {}) as { username?: string; password?: string };
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const row = db
      .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_guest = 0`)
      .get(username) as UserRow | undefined;

    if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const sessionToken = createSessionForUser(db, row.id);
    setSessionCookie(res, sessionToken);
    res.json({ user: rowToPublicUser(row), sessionToken });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionTokenHash) {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(req.sessionTokenHash);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.patch('/prefs', requireAuthMiddleware, (req, res) => {
    const user = req.authUser!;
    const body = (req.body || {}) as {
      displayName?: string;
      avatar?: TravelerAvatarId;
      lang?: Language;
      aiConfig?: AIRequestConfig;
    };

    const currentRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as
      | UserRow
      | undefined;
    if (!currentRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const currentUser = rowToPublicUser(currentRow);
    const nextDisplayName =
      typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 28)
        : currentUser.displayName;
    const nextAvatar: TravelerAvatarId =
      body.avatar === 'female'
        ? 'female'
        : body.avatar === 'male'
          ? 'male'
          : currentUser.avatar;

    const patchPrefs = sanitizeUserPreferences({
      lang: body.lang ?? currentUser.prefs.lang,
      aiConfig: body.aiConfig ?? currentUser.prefs.aiConfig,
    });

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET display_name = ?, avatar = ?, prefs_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextDisplayName, nextAvatar, JSON.stringify(patchPrefs), nowIso, user.id);

    const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as UserRow;
    res.json({ user: rowToPublicUser(updated) });
  });

  return router;
}
