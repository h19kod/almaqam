import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { limiter, parse } from '../shared.js';

const SESSION_DAYS = 30;
const COOKIE = 'maqam_session';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(40, 'الاسم طويل جداً'),
  email: z.string().trim().email('البريد غير صحيح').max(120),
  password: z.string().min(8, 'كلمة المرور لازم تكون ٨ أحرف على الأقل').max(200),
});
const loginSchema = z.object({ email: z.string().trim().email('البريد غير صحيح'), password: z.string().min(1) });

const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export function sessionMiddleware(db) {
  const session = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
                              WHERE s.token = ? AND s.expires_at > ?`);
  return (req, _res, next) => {
    const token = req.cookies[COOKIE];
    req.user = token ? session.get(token, Date.now()) || null : null;
    next();
  };
}

export function authRoutes(api, db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  };

  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    q.insertSession.run(token, userId, Date.now() + SESSION_DAYS * 864e5);
    q.purge.run(Date.now());
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/' });
  }

  api.post('/auth/register', limiter(10, 60_000), (req, res) => {
    const b = parse(registerSchema, req.body, res);
    if (!b) return;
    if (q.userByEmail.get(b.email)) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' });
    const role = adminEmails().includes(b.email.toLowerCase()) ? 'admin' : 'user';
    const { lastInsertRowid } = q.insertUser.run(b.name, b.email, bcrypt.hashSync(b.password, 10), role);
    startSession(req, res, lastInsertRowid);
    res.status(201).json({ user: { id: Number(lastInsertRowid), name: b.name, email: b.email, role } });
  });

  api.post('/auth/login', limiter(10, 60_000), (req, res) => {
    const b = parse(loginSchema, req.body, res);
    if (!b) return;
    const u = q.userByEmail.get(b.email);
    if (!u || !bcrypt.compareSync(b.password, u.password)) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }
    if (u.role !== 'admin' && adminEmails().includes(u.email.toLowerCase())) {
      q.setRole.run('admin', u.id);
      u.role = 'admin';
    }
    startSession(req, res, u.id);
    res.json({ user: publicUser(u) });
  });

  api.post('/auth/logout', (req, res) => {
    if (req.cookies[COOKIE]) q.deleteSession.run(req.cookies[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
}
