import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MAQAM_IDS = ['rast', 'bayati', 'sikah', 'hijaz', 'saba', 'nahawand', 'ajam', 'kurd'];
const SESSION_DAYS = 30;
const COOKIE = 'maqam_session';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(40),
  email: z.string().trim().email('البريد غير صحيح').max(120),
  password: z.string().min(8, 'كلمة المرور لازم تكون ٨ أحرف على الأقل').max(200),
});
const loginSchema = z.object({ email: z.string().trim().email('البريد غير صحيح'), password: z.string().min(1) });
const noteSchema = z.object({
  d: z.number().int().min(0).max(15),   // scale degree across two octaves
  t: z.number().int().min(0).max(600000), // ms from start
  l: z.number().int().min(30).max(8000),  // duration ms
});
const compositionSchema = z.object({
  title: z.string().trim().min(1, 'اكتب عنواناً للمقطوعة').max(60),
  maqam: z.enum(MAQAM_IDS),
  notes: z.array(noteSchema).min(1, 'سجّل نغمة واحدة على الأقل').max(2000),
  public: z.boolean().default(true),
});
const attemptSchema = z.object({ maqam: z.enum(MAQAM_IDS), guess: z.enum(MAQAM_IDS) });

/** Tiny fixed-window rate limiter (per IP + route). */
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now > h.reset) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) return res.status(429).json({ error: 'محاولات كثيرة، جرّب بعد دقيقة' });
    next();
  };
}

function parse(schema, body, res) {
  const r = schema.safeParse(body);
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message || 'بيانات غير صالحة' });
    return null;
  }
  return r.data;
}

export function createApp(db, { clientDist } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare(`SELECT u.id, u.name, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
                         WHERE s.token = ? AND s.expires_at > ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    insertComp: db.prepare('INSERT INTO compositions (user_id, title, maqam, notes, public) VALUES (?, ?, ?, ?, ?)'),
    comp: db.prepare(`SELECT c.*, u.name AS author, (SELECT COUNT(*) FROM likes l WHERE l.composition_id = c.id) AS likes
                      FROM compositions c JOIN users u ON u.id = c.user_id WHERE c.id = ?`),
    liked: db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND composition_id = ?'),
    like: db.prepare('INSERT INTO likes (user_id, composition_id) VALUES (?, ?)'),
    unlike: db.prepare('DELETE FROM likes WHERE user_id = ? AND composition_id = ?'),
    deleteComp: db.prepare('DELETE FROM compositions WHERE id = ? AND user_id = ?'),
    insertAttempt: db.prepare('INSERT INTO attempts (user_id, maqam, guess, correct) VALUES (?, ?, ?, ?)'),
  };

  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now() + SESSION_DAYS * 864e5;
    q.insertSession.run(token, userId, expires);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/',
    });
  }

  app.use((req, _res, next) => {
    const token = req.cookies[COOKIE];
    req.user = token ? q.session.get(token, Date.now()) || null : null;
    next();
  });
  const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'سجّل دخولك أولاً' }));

  const api = express.Router();

  // ---------------------------------------------------------------- auth
  api.post('/auth/register', limiter(10, 60_000), (req, res) => {
    const b = parse(registerSchema, req.body, res);
    if (!b) return;
    if (q.userByEmail.get(b.email)) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' });
    const hash = bcrypt.hashSync(b.password, 10);
    const { lastInsertRowid } = q.insertUser.run(b.name, b.email, hash);
    startSession(req, res, lastInsertRowid);
    res.status(201).json({ user: { id: Number(lastInsertRowid), name: b.name, email: b.email } });
  });

  api.post('/auth/login', limiter(10, 60_000), (req, res) => {
    const b = parse(loginSchema, req.body, res);
    if (!b) return;
    const u = q.userByEmail.get(b.email);
    if (!u || !bcrypt.compareSync(b.password, u.password)) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }
    startSession(req, res, u.id);
    res.json({ user: { id: u.id, name: u.name, email: u.email } });
  });

  api.post('/auth/logout', (req, res) => {
    if (req.cookies[COOKIE]) q.deleteSession.run(req.cookies[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => res.json({ user: req.user }));

  // ---------------------------------------------------------------- compositions
  const shape = (c, userId) => ({
    id: c.id, title: c.title, maqam: c.maqam, author: c.author, authorId: c.user_id,
    notes: JSON.parse(c.notes), public: !!c.public, likes: c.likes, createdAt: c.created_at,
    liked: userId ? !!q.liked.get(userId, c.id) : false,
  });

  api.get('/compositions', (req, res) => {
    const sort = req.query.sort === 'top' ? 'likes DESC, c.id DESC' : 'c.id DESC';
    const maqam = MAQAM_IDS.includes(req.query.maqam) ? req.query.maqam : null;
    const mine = req.query.mine === '1' && req.user;
    const where = [mine ? 'c.user_id = @uid' : 'c.public = 1', maqam ? 'c.maqam = @maqam' : '1'].join(' AND ');
    const rows = db.prepare(`
      SELECT c.*, u.name AS author, (SELECT COUNT(*) FROM likes l WHERE l.composition_id = c.id) AS likes
      FROM compositions c JOIN users u ON u.id = c.user_id WHERE ${where} ORDER BY ${sort} LIMIT 60`)
      .all({ uid: req.user?.id, maqam });
    res.json({ compositions: rows.map((c) => shape(c, req.user?.id)) });
  });

  api.get('/compositions/:id', (req, res) => {
    const c = q.comp.get(Number(req.params.id));
    if (!c || (!c.public && c.user_id !== req.user?.id)) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    res.json({ composition: shape(c, req.user?.id) });
  });

  api.post('/compositions', auth, limiter(30, 60_000), (req, res) => {
    const b = parse(compositionSchema, req.body, res);
    if (!b) return;
    const { lastInsertRowid } = q.insertComp.run(req.user.id, b.title, b.maqam, JSON.stringify(b.notes), b.public ? 1 : 0);
    res.status(201).json({ composition: shape(q.comp.get(lastInsertRowid), req.user.id) });
  });

  api.delete('/compositions/:id', auth, (req, res) => {
    const r = q.deleteComp.run(Number(req.params.id), req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    res.json({ ok: true });
  });

  api.post('/compositions/:id/like', auth, (req, res) => {
    const id = Number(req.params.id);
    const c = q.comp.get(id);
    if (!c || !c.public) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    if (q.liked.get(req.user.id, id)) q.unlike.run(req.user.id, id);
    else q.like.run(req.user.id, id);
    const fresh = q.comp.get(id);
    res.json({ liked: !!q.liked.get(req.user.id, id), likes: fresh.likes });
  });

  // ---------------------------------------------------------------- ear training
  api.post('/training/attempts', auth, (req, res) => {
    const b = parse(attemptSchema, req.body, res);
    if (!b) return;
    q.insertAttempt.run(req.user.id, b.maqam, b.guess, b.maqam === b.guess ? 1 : 0);
    res.status(201).json({ correct: b.maqam === b.guess });
  });

  api.get('/me/stats', auth, (req, res) => {
    const per = db.prepare(`SELECT maqam, COUNT(*) AS total, SUM(correct) AS correct FROM attempts
                            WHERE user_id = ? GROUP BY maqam`).all(req.user.id);
    const recent = db.prepare('SELECT correct FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(req.user.id);
    let streak = 0;
    for (const r of recent) { if (!r.correct) break; streak++; }
    let best = 0, run = 0;
    for (const r of [...recent].reverse()) { run = r.correct ? run + 1 : 0; best = Math.max(best, run); }
    const comps = db.prepare('SELECT COUNT(*) AS n FROM compositions WHERE user_id = ?').get(req.user.id).n;
    const likes = db.prepare(`SELECT COUNT(*) AS n FROM likes l JOIN compositions c ON c.id = l.composition_id
                              WHERE c.user_id = ?`).get(req.user.id).n;
    res.json({
      perMaqam: Object.fromEntries(per.map((p) => [p.maqam, { total: p.total, correct: p.correct }])),
      total: per.reduce((a, p) => a + p.total, 0),
      correct: per.reduce((a, p) => a + p.correct, 0),
      streak, best, compositions: comps, likesReceived: likes,
    });
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

  // ---------------------------------------------------------------- client (production)
  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '7d', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  });
  return app;
}
