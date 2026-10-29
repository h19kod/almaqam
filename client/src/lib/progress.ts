import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

const KEY = 'maqam:lessons';

function readLocal(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function saveLocalLesson(id: string, score: number) {
  try {
    const all = readLocal();
    all[id] = Math.max(all[id] ?? 0, score);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

/**
 * Lesson scores for the current visitor. Guests keep progress in the browser;
 * on login anything done as a guest is uploaded so nothing is lost.
 */
export function useLessonProgress() {
  const { user } = useAuth();
  const [done, setDone] = useState<Record<string, number>>(readLocal);

  useEffect(() => {
    if (!user) { setDone(readLocal()); return; }
    let live = true;
    (async () => {
      const local = readLocal();
      for (const [id, score] of Object.entries(local)) await api.completeLesson(id, score).catch(() => {});
      const r = await api.lessons().catch(() => ({ lessons: [] }));
      if (!live) return;
      const merged = { ...local };
      for (const l of r.lessons) merged[l.id] = Math.max(merged[l.id] ?? 0, l.score);
      setDone(merged);
    })();
    return () => { live = false; };
  }, [user]);

  return done;
}
