import { z } from 'zod';
import { MAQAM_IDS, auth, id, limiter, parse } from '../shared.js';

const noteSchema = z.object({
  d: z.number().int().min(0).max(15),     // scale degree across two octaves
  t: z.number().int().min(0).max(600000), // ms from start
  l: z.number().int().min(30).max(8000),  // duration ms
});
const compositionSchema = z.object({
  title: z.string().trim().min(1, 'اكتب عنواناً للمقطوعة').max(60, 'العنوان طويل جداً'),
  maqam: z.enum(MAQAM_IDS),
  notes: z.array(noteSchema).min(1, 'سجّل نغمة واحدة على الأقل').max(2000),
  public: z.boolean().default(true),
  parentId: z.number().int().positive().optional(),
});
const commentSchema = z.object({ body: z.string().trim().min(1, 'اكتب تعليقاً').max(500, 'التعليق أطول من ٥٠٠ حرف') });
const reportSchema = z.object({
  type: z.enum(['composition', 'comment']),
  id: z.number().int().positive(),
  reason: z.string().trim().min(3, 'اكتب سبب البلاغ').max(300),
});

const SELECT = `
  SELECT c.*, u.name AS author,
    (SELECT COUNT(*) FROM likes l WHERE l.composition_id = c.id) AS likes,
    (SELECT COUNT(*) FROM comments m WHERE m.composition_id = c.id AND m.hidden = 0) AS comment_count,
    (SELECT COUNT(*) FROM compositions r WHERE r.parent_id = c.id AND r.public = 1 AND r.hidden = 0) AS remixes,
    p.title AS parent_title, pu.name AS parent_author
  FROM compositions c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN compositions p ON p.id = c.parent_id AND p.public = 1 AND p.hidden = 0
  LEFT JOIN users pu ON pu.id = p.user_id`;

export function compositionRoutes(api, db) {
  const q = {
    insert: db.prepare('INSERT INTO compositions (user_id, title, maqam, notes, public, parent_id) VALUES (?, ?, ?, ?, ?, ?)'),
    one: db.prepare(`${SELECT} WHERE c.id = ?`),
    liked: db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND composition_id = ?'),
    like: db.prepare('INSERT INTO likes (user_id, composition_id) VALUES (?, ?)'),
    unlike: db.prepare('DELETE FROM likes WHERE user_id = ? AND composition_id = ?'),
    remove: db.prepare('DELETE FROM compositions WHERE id = ? AND user_id = ?'),
    comments: db.prepare(`SELECT m.id, m.body, m.created_at, m.user_id, u.name AS author FROM comments m
                          JOIN users u ON u.id = m.user_id WHERE m.composition_id = ? AND m.hidden = 0 ORDER BY m.id`),
    comment: db.prepare('SELECT * FROM comments WHERE id = ?'),
    addComment: db.prepare('INSERT INTO comments (composition_id, user_id, body) VALUES (?, ?, ?)'),
    removeComment: db.prepare('DELETE FROM comments WHERE id = ?'),
    report: db.prepare('INSERT OR IGNORE INTO reports (user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)'),
    user: db.prepare('SELECT id, name, role, created_at FROM users WHERE id = ?'),
  };

  const visible = (c, user) => c && (c.user_id === user?.id || user?.role === 'admin' || (c.public && !c.hidden));
  const listed = (c) => c && c.public && !c.hidden;

  const shape = (c, userId) => ({
    id: c.id, title: c.title, maqam: c.maqam, author: c.author, authorId: c.user_id,
    notes: JSON.parse(c.notes), public: !!c.public, hidden: !!c.hidden, likes: c.likes, createdAt: c.created_at,
    liked: userId ? !!q.liked.get(userId, c.id) : false,
    comments: c.comment_count, remixes: c.remixes,
    parent: c.parent_id && c.parent_title ? { id: c.parent_id, title: c.parent_title, author: c.parent_author } : null,
  });

  api.get('/compositions', (req, res) => {
    const sort = req.query.sort === 'top' ? 'likes DESC, c.id DESC' : 'c.id DESC';
    const maqam = MAQAM_IDS.includes(req.query.maqam) ? req.query.maqam : null;
    const mine = req.query.mine === '1' && req.user;
    const author = id(req.query.user);
    const where = [
      mine ? 'c.user_id = @uid' : 'c.public = 1 AND c.hidden = 0',
      maqam ? 'c.maqam = @maqam' : '1',
      author && !mine ? 'c.user_id = @author' : '1',
    ].join(' AND ');
    const rows = db.prepare(`${SELECT} WHERE ${where} ORDER BY ${sort} LIMIT 60`).all({ uid: req.user?.id, maqam, author });
    res.json({ compositions: rows.map((c) => shape(c, req.user?.id)) });
  });

  api.get('/compositions/:id', (req, res) => {
    const c = q.one.get(id(req.params.id));
    if (!visible(c, req.user)) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    res.json({ composition: shape(c, req.user?.id) });
  });

  api.post('/compositions', auth, limiter(30, 60_000), (req, res) => {
    const b = parse(compositionSchema, req.body, res);
    if (!b) return;
    let parent = null;
    if (b.parentId) {
      const p = q.one.get(b.parentId);
      if (!visible(p, req.user)) return res.status(400).json({ error: 'المقطوعة الأصلية غير موجودة' });
      parent = p.id;
    }
    const { lastInsertRowid } = q.insert.run(req.user.id, b.title, b.maqam, JSON.stringify(b.notes), b.public ? 1 : 0, parent);
    res.status(201).json({ composition: shape(q.one.get(lastInsertRowid), req.user.id) });
  });

  api.delete('/compositions/:id', auth, (req, res) => {
    const r = q.remove.run(id(req.params.id), req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    res.json({ ok: true });
  });

  api.post('/compositions/:id/like', auth, (req, res) => {
    const cid = id(req.params.id);
    if (!listed(q.one.get(cid))) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    if (q.liked.get(req.user.id, cid)) q.unlike.run(req.user.id, cid);
    else q.like.run(req.user.id, cid);
    res.json({ liked: !!q.liked.get(req.user.id, cid), likes: q.one.get(cid).likes });
  });

  // ---------------------------------------------------------------- comments
  const shapeComment = (m, user) => ({
    id: m.id, body: m.body, author: m.author, authorId: m.user_id, createdAt: m.created_at,
    canDelete: !!user && (user.id === m.user_id || user.role === 'admin'),
  });

  api.get('/compositions/:id/comments', (req, res) => {
    const c = q.one.get(id(req.params.id));
    if (!visible(c, req.user)) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    res.json({ comments: q.comments.all(c.id).map((m) => shapeComment(m, req.user)) });
  });

  api.post('/compositions/:id/comments', auth, limiter(10, 60_000), (req, res) => {
    const c = q.one.get(id(req.params.id));
    if (!listed(c)) return res.status(404).json({ error: 'المقطوعة غير موجودة' });
    const b = parse(commentSchema, req.body, res);
    if (!b) return;
    const { lastInsertRowid } = q.addComment.run(c.id, req.user.id, b.body);
    const m = q.comments.all(c.id).find((x) => x.id === Number(lastInsertRowid));
    res.status(201).json({ comment: shapeComment(m, req.user) });
  });

  api.delete('/comments/:id', auth, (req, res) => {
    const m = q.comment.get(id(req.params.id));
    if (!m) return res.status(404).json({ error: 'التعليق غير موجود' });
    if (m.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'لا يمكنك حذف تعليق غيرك' });
    q.removeComment.run(m.id);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- reports
  api.post('/reports', auth, limiter(10, 60_000), (req, res) => {
    const b = parse(reportSchema, req.body, res);
    if (!b) return;
    const exists = b.type === 'composition' ? listed(q.one.get(b.id)) : q.comment.get(b.id);
    if (!exists) return res.status(404).json({ error: 'المحتوى غير موجود' });
    q.report.run(req.user.id, b.type, b.id, b.reason);
    res.status(201).json({ ok: true });
  });

  // ---------------------------------------------------------------- public profiles
  api.get('/users/:id', (req, res) => {
    const u = q.user.get(id(req.params.id));
    if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const s = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(correct), 0) AS correct FROM attempts WHERE user_id = ?').get(u.id);
    const lessons = db.prepare('SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ?').get(u.id).n;
    const likes = db.prepare(`SELECT COUNT(*) AS n FROM likes l JOIN compositions c ON c.id = l.composition_id
                              WHERE c.user_id = ? AND c.public = 1 AND c.hidden = 0`).get(u.id).n;
    res.json({ user: { id: u.id, name: u.name, joined: u.created_at, admin: u.role === 'admin', attempts: s.total,
      accuracy: s.total ? Math.round((s.correct / s.total) * 100) : null, lessons, likesReceived: likes } });
  });
}
