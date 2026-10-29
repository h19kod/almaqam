import { z } from 'zod';
import { admin, id, parse } from '../shared.js';

const resolveSchema = z.object({ action: z.enum(['hide', 'dismiss', 'restore']) });

export function adminRoutes(api, db) {
  api.get('/admin/stats', admin, (_req, res) => {
    const n = (sql) => db.prepare(sql).get().n;
    res.json({
      users: n('SELECT COUNT(*) AS n FROM users'),
      newUsers7: n("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')"),
      compositions: n('SELECT COUNT(*) AS n FROM compositions'),
      comments: n('SELECT COUNT(*) AS n FROM comments'),
      attempts7: n("SELECT COUNT(*) AS n FROM attempts WHERE created_at >= datetime('now', '-7 days')"),
      lessons: n('SELECT COUNT(*) AS n FROM lesson_progress'),
      openReports: n("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      daily: db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS n FROM attempts
                         WHERE created_at >= datetime('now', '-13 days') GROUP BY day ORDER BY day`).all(),
    });
  });

  api.get('/admin/reports', admin, (req, res) => {
    const status = ['open', 'hidden', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const rows = db.prepare(`
      SELECT r.id, r.target_type AS type, r.target_id AS targetId, r.reason, r.status, r.created_at AS createdAt,
             u.name AS reporter,
             (SELECT COUNT(*) FROM reports x WHERE x.target_type = r.target_type AND x.target_id = r.target_id) AS reports,
             CASE r.target_type
               WHEN 'composition' THEN (SELECT title FROM compositions WHERE id = r.target_id)
               ELSE (SELECT body FROM comments WHERE id = r.target_id) END AS preview,
             CASE r.target_type
               WHEN 'composition' THEN (SELECT id FROM compositions WHERE id = r.target_id)
               ELSE (SELECT composition_id FROM comments WHERE id = r.target_id) END AS compositionId
      FROM reports r JOIN users u ON u.id = r.user_id
      WHERE r.status = ? ORDER BY r.id DESC LIMIT 100`).all(status);
    res.json({ reports: rows });
  });

  api.post('/admin/reports/:id', admin, (req, res) => {
    const b = parse(resolveSchema, req.body, res);
    if (!b) return;
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id(req.params.id));
    if (!r) return res.status(404).json({ error: 'البلاغ غير موجود' });
    const table = r.target_type === 'composition' ? 'compositions' : 'comments';
    const status = b.action === 'hide' ? 'hidden' : 'dismissed';
    db.transaction(() => {
      if (b.action !== 'dismiss') db.prepare(`UPDATE ${table} SET hidden = ? WHERE id = ?`).run(b.action === 'hide' ? 1 : 0, r.target_id);
      // resolve every report about the same item together
      db.prepare('UPDATE reports SET status = ? WHERE target_type = ? AND target_id = ?').run(status, r.target_type, r.target_id);
    })();
    res.json({ ok: true, status });
  });
}
