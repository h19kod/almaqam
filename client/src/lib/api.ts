import type { MaqamId } from './maqamat';
import type { SeqNote } from './audio';

export interface User { id: number; name: string; email: string }
export interface Composition {
  id: number; title: string; maqam: MaqamId; author: string; authorId: number;
  notes: SeqNote[]; public: boolean; likes: number; liked: boolean; createdAt: string;
}
export interface Stats {
  perMaqam: Partial<Record<MaqamId, { total: number; correct: number }>>;
  total: number; correct: number; streak: number; best: number; compositions: number; likesReceived: number;
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
  compositions: (p: { sort?: 'new' | 'top'; maqam?: MaqamId | ''; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (p.sort) qs.set('sort', p.sort);
    if (p.maqam) qs.set('maqam', p.maqam);
    if (p.mine) qs.set('mine', '1');
    return call<{ compositions: Composition[] }>(`/compositions?${qs}`);
  },
  composition: (id: number) => call<{ composition: Composition }>(`/compositions/${id}`),
  save: (b: { title: string; maqam: MaqamId; notes: SeqNote[]; public: boolean }) =>
    post<{ composition: Composition }>('/compositions', b),
  remove: (id: number) => call<{ ok: true }>(`/compositions/${id}`, { method: 'DELETE' }),
  like: (id: number) => post<{ liked: boolean; likes: number }>(`/compositions/${id}/like`),
  attempt: (b: { maqam: MaqamId; guess: MaqamId }) => post<{ correct: boolean }>('/training/attempts', b),
  stats: () => call<Stats>('/me/stats'),
};
