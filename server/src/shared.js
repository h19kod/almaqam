export const MAQAM_IDS = ['rast', 'bayati', 'sikah', 'hijaz', 'saba', 'nahawand', 'ajam', 'kurd'];
export const LESSON_IDS = ['intro', 'ajam', 'nahawand', 'kurd', 'hijaz', 'rast', 'bayati', 'saba', 'sikah'];

/** Tiny fixed-window rate limiter (per IP + route). */
export function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now > h.reset) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    } else if (++h.n > max) return res.status(429).json({ error: 'محاولات كثيرة، جرّب بعد دقيقة' });
    next();
  };
}

export function parse(schema, body, res) {
  const r = schema.safeParse(body);
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message || 'بيانات غير صالحة' });
    return null;
  }
  return r.data;
}

export const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'سجّل دخولك أولاً' }));
export const admin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: 'هذه الصفحة للمشرفين فقط' });

export const id = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
