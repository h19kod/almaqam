import { z } from 'zod';
import { LESSON_IDS, MAQAM_IDS, auth, parse } from '../shared.js';

const attemptSchema = z.object({ maqam: z.enum(MAQAM_IDS), guess: z.enum(MAQAM_IDS) });
const lessonSchema = z.object({ score: z.number().int().min(0).max(100) });
const PASS = 60;

export const ACHIEVEMENTS = [
  { id: 'first_piece', name: 'أول مقطوعة', text: 'حفظت أول تسجيل لك' },
  { id: 'remixer', name: 'على خطاهم', text: 'أعدت عزف مقطوعة لغيرك' },
  { id: 'voice', name: 'صوت في المجلس', text: 'كتبت أول تعليق' },
  { id: 'liked10', name: 'محبوب', text: 'جمعت عشرة إعجابات' },
  { id: 'ear50', name: 'أذن مثابرة', text: 'أجبت عن خمسين سؤالاً' },
  { id: 'golden', name: 'أذن ذهبية', text: 'عشر إجابات صحيحة متتالية' },
  { id: 'all8', name: 'يعرفها كلها', text: 'ميّزت المقامات الثمانية كلها' },
  { id: 'path', name: 'أنهى المسار', text: 'أكملت الدروس التسعة' },
  { id: 'week', name: 'أسبوع متواصل', text: 'تدرّبت سبعة أيام متتالية' },
];

/** Consecutive active days ending today (or yesterday, so the streak survives until tonight). */
export function dayStreak(days, today = new Date().toISOString().slice(0, 10)) {
  const set = new Set(days);
  const d = new Date(`${today}T00:00:00Z`);
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

export function learnRoutes(api, db) {
  const q = {
    insertAttempt: db.prepare('INSERT INTO attempts (user_id, maqam, guess, correct) VALUES (?, ?, ?, ?)'),
    lesson: db.prepare(`INSERT INTO lesson_progress (user_id, lesson_id, score) VALUES (?, ?, ?)
                        ON CONFLICT (user_id, lesson_id) DO UPDATE SET score = MAX(score, excluded.score)`),
    lessons: db.prepare('SELECT lesson_id AS id, score, completed_at AS at FROM lesson_progress WHERE user_id = ?'),
  };

  api.post('/training/attempts', auth, (req, res) => {
    const b = parse(attemptSchema, req.body, res);
    if (!b) return;
    q.insertAttempt.run(req.user.id, b.maqam, b.guess, b.maqam === b.guess ? 1 : 0);
    res.status(201).json({ correct: b.maqam === b.guess });
  });

  api.post('/lessons/:id/complete', auth, (req, res) => {
    if (!LESSON_IDS.includes(req.params.id)) return res.status(404).json({ error: 'الدرس غير موجود' });
    const b = parse(lessonSchema, req.body, res);
    if (!b) return;
    if (b.score < PASS) return res.status(200).json({ passed: false });
    q.lesson.run(req.user.id, req.params.id, b.score);
    res.status(201).json({ passed: true, lessons: q.lessons.all(req.user.id) });
  });

  api.get('/me/lessons', auth, (req, res) => res.json({ lessons: q.lessons.all(req.user.id) }));

  api.get('/me/stats', auth, (req, res) => {
    const uid = req.user.id;
    const per = db.prepare(`SELECT maqam, COUNT(*) AS total, SUM(correct) AS correct FROM attempts
                            WHERE user_id = ? GROUP BY maqam`).all(uid);
    const recent = db.prepare('SELECT correct FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 500').all(uid);
    let streak = 0;
    for (const r of recent) { if (!r.correct) break; streak++; }
    let best = 0, run = 0;
    for (const r of [...recent].reverse()) { run = r.correct ? run + 1 : 0; best = Math.max(best, run); }
    const count = (sql) => db.prepare(sql).get(uid).n;
    const comps = count('SELECT COUNT(*) AS n FROM compositions WHERE user_id = ?');
    const remixes = count('SELECT COUNT(*) AS n FROM compositions WHERE user_id = ? AND parent_id IS NOT NULL');
    const comments = count('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?');
    const likes = count(`SELECT COUNT(*) AS n FROM likes l JOIN compositions c ON c.id = l.composition_id WHERE c.user_id = ?`);
    const lessons = q.lessons.all(uid);
    const days = db.prepare(`
      SELECT date(created_at) AS d FROM attempts WHERE user_id = @u
      UNION SELECT date(completed_at) FROM lesson_progress WHERE user_id = @u
      UNION SELECT date(created_at) FROM compositions WHERE user_id = @u`).all({ u: uid }).map((r) => r.d);
    const days7 = dayStreak(days);
    const total = per.reduce((a, p) => a + p.total, 0);
    const earned = {
      first_piece: comps > 0, remixer: remixes > 0, voice: comments > 0, liked10: likes >= 10, ear50: total >= 50,
      golden: best >= 10, all8: MAQAM_IDS.every((m) => per.find((p) => p.maqam === m && p.correct > 0)),
      path: lessons.length >= LESSON_IDS.length, week: days7 >= 7,
    };
    res.json({
      perMaqam: Object.fromEntries(per.map((p) => [p.maqam, { total: p.total, correct: p.correct }])),
      total, correct: per.reduce((a, p) => a + p.correct, 0), streak, best,
      compositions: comps, likesReceived: likes, lessons, dayStreak: days7,
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, earned: !!earned[a.id] })),
    });
  });

  api.get('/leaderboard', (req, res) => {
    const days = req.query.period === 'all' ? 36500 : 7;
    const rows = db.prepare(`
      SELECT u.id, u.name, COUNT(*) AS total, SUM(a.correct) AS correct
      FROM attempts a JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= datetime('now', ?)
      GROUP BY u.id HAVING total >= 5
      ORDER BY correct DESC, (1.0 * correct / total) DESC, u.id
      LIMIT 20`).all(`-${days} days`);
    res.json({ leaders: rows.map((r) => ({ ...r, accuracy: Math.round((r.correct / r.total) * 100), me: r.id === req.user?.id })) });
  });
}
