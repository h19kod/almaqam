import type { MaqamId } from './maqamat';
import type { SeqNote } from './audio';

export interface User { id: number; name: string; email: string; role: 'user' | 'admin' }
export interface Composition {
  id: number; title: string; maqam: MaqamId; author: string; authorId: number;
  notes: SeqNote[]; public: boolean; hidden: boolean; likes: number; liked: boolean; createdAt: string;
  comments: number; remixes: number; parent: { id: number; title: string; author: string } | null;
}
export interface Comment { id: number; body: string; author: string; authorId: number; createdAt: string; canDelete: boolean }
export interface Achievement { id: string; name: string; text: string; earned: boolean }
export interface LessonDone { id: string; score: number; at: string }
export interface PublicUser {
  id: number; name: string; joined: string; admin: boolean; attempts: number; accuracy: number | null;
  lessons: number; likesReceived: number;
}
export interface Leader { id: number; name: string; total: number; correct: number; accuracy: number; me: boolean }
export interface Report {
  id: number; type: 'composition' | 'comment'; targetId: number; reason: string; status: string; createdAt: string;
  reporter: string; reports: number; preview: string | null; compositionId: number | null;
}
export interface AdminStats {
  users: number; newUsers7: number; compositions: number; comments: number; attempts7: number; lessons: number;
  openReports: number; daily: { day: string; n: number }[];
}
export interface Stats {
  perMaqam: Partial<Record<MaqamId, { total: number; correct: number }>>;
  total: number; correct: number; streak: number; best: number; compositions: number; likesReceived: number;
  lessons: LessonDone[]; dayStreak: number; achievements: Achievement[];
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول مجدداً.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'حدث خطأ غير متوقع', res.status);
  return data as T;
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const api = {
  me: () => call<{ user: User | null }>('/auth/me'),
  register: (b: { name: string; email: string; password: string }) => post<{ user: User }>('/auth/register', b),
  login: (b: { email: string; password: string }) => post<{ user: User }>('/auth/login', b),
  logout: () => post<{ ok: true }>('/auth/logout'),
  compositions: (p: { sort?: 'new' | 'top'; maqam?: MaqamId | ''; mine?: boolean; user?: number } = {}) => {
    const qs = new URLSearchParams();
    if (p.user) qs.set('user', String(p.user));
    if (p.sort) qs.set('sort', p.sort);
    if (p.maqam) qs.set('maqam', p.maqam);
    if (p.mine) qs.set('mine', '1');
    return call<{ compositions: Composition[] }>(`/compositions?${qs}`);
  },
  composition: (id: number) => call<{ composition: Composition }>(`/compositions/${id}`),
  save: (b: { title: string; maqam: MaqamId; notes: SeqNote[]; public: boolean; parentId?: number }) =>
    post<{ composition: Composition }>('/compositions', b),
  remove: (id: number) => call<{ ok: true }>(`/compositions/${id}`, { method: 'DELETE' }),
  like: (id: number) => post<{ liked: boolean; likes: number }>(`/compositions/${id}/like`),
  attempt: (b: { maqam: MaqamId; guess: MaqamId }) => post<{ correct: boolean }>('/training/attempts', b),
  stats: () => call<Stats>('/me/stats'),
  comments: (id: number) => call<{ comments: Comment[] }>(`/compositions/${id}/comments`),
  comment: (id: number, body: string) => post<{ comment: Comment }>(`/compositions/${id}/comments`, { body }),
  removeComment: (id: number) => call<{ ok: true }>(`/comments/${id}`, { method: 'DELETE' }),
  report: (b: { type: 'composition' | 'comment'; id: number; reason: string }) => post<{ ok: true }>('/reports', b),
  user: (id: number) => call<{ user: PublicUser }>(`/users/${id}`),
  lessons: () => call<{ lessons: LessonDone[] }>('/me/lessons'),
  completeLesson: (id: string, score: number) => post<{ passed: boolean; lessons?: LessonDone[] }>(`/lessons/${id}/complete`, { score }),
  leaderboard: (period: 'week' | 'all') => call<{ leaders: Leader[] }>(`/leaderboard?period=${period}`),
  adminStats: () => call<AdminStats>('/admin/stats'),
  adminReports: (status: 'open' | 'hidden' | 'dismissed') => call<{ reports: Report[] }>(`/admin/reports?status=${status}`),
  resolve: (id: number, action: 'hide' | 'dismiss' | 'restore') => post<{ ok: true; status: string }>(`/admin/reports/${id}`, { action }),
};
