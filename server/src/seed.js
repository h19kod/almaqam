import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

/** Build a note list from [degree, beats] pairs at a given tempo. */
function phrase(pairs, bpm = 92) {
  const beat = 60000 / bpm;
  let t = 0;
  return pairs.map(([d, b]) => {
    const n = { d, t: Math.round(t), l: Math.round(b * beat * 0.95) };
    t += b * beat;
    return n;
  });
}

const PIECES = [
  {
    title: 'تقاسيم صباحية على البيات', maqam: 'bayati',
    notes: phrase([[0, 1], [1, .5], [2, .5], [3, 1], [2, .5], [1, .5], [0, 2], [3, .5], [4, .5], [5, 1], [4, .5], [3, .5],
      [2, .5], [3, .5], [1, 1], [0, 3]]),
  },
  {
    title: 'شوق الحجاز', maqam: 'hijaz',
    notes: phrase([[4, 1.5], [3, .5], [2, 1], [1, 1], [2, .5], [1, .5], [0, 2], [0, .5], [1, .5], [2, .5], [3, .5],
      [4, 1], [5, .5], [6, .5], [7, 2], [6, .5], [5, .5], [4, 1], [2, .5], [1, .5], [0, 3]], 80),
  },
  {
    title: 'دوزان الراست', maqam: 'rast',
    notes: phrase([[0, .5], [1, .5], [2, .5], [3, .5], [4, 1], [4, .5], [5, .5], [4, .5], [3, .5], [2, 1], [3, .5],
      [2, .5], [1, .5], [0, .5], [1, 1], [0, 2]], 104),
  },
  {
    title: 'ليل بغداد', maqam: 'saba',
    notes: phrase([[0, 1], [1, 1], [2, .5], [3, 1.5], [2, .5], [1, .5], [2, 1], [1, .5], [0, 2.5], [3, .5], [4, 1],
      [3, .5], [2, .5], [1, 1], [0, 3]], 70),
  },
  {
    title: 'نهاوند على شط دجلة', maqam: 'nahawand',
    notes: phrase([[0, .5], [2, .5], [4, 1], [5, .5], [4, .5], [3, 1], [2, .5], [3, .5], [1, 1], [4, .5], [6, .5],
      [7, 1.5], [6, .5], [5, .5], [4, .5], [2, 1], [1, .5], [0, 2.5]], 88),
  },
  {
    title: 'عجم العيد', maqam: 'ajam',
    notes: phrase([[0, .5], [2, .5], [4, .5], [7, 1], [6, .5], [5, .5], [4, 1], [5, .5], [4, .5], [3, .5], [2, .5],
      [1, 1], [0, 2]], 120),
  },
];

export function seedIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  const pass = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
  const { lastInsertRowid: uid } = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
    .run('فرقة مقام', 'ensemble@maqam.local', pass);
  const ins = db.prepare('INSERT INTO compositions (user_id, title, maqam, notes, public) VALUES (?, ?, ?, ?, 1)');
  for (const p of PIECES) ins.run(uid, p.title, p.maqam, JSON.stringify(p.notes));
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb();
  console.log(seedIfEmpty(db) ? 'seeded' : 'database already has data');
}
