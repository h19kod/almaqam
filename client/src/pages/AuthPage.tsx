import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Only follow same-site relative paths after login. */
function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/me';
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;
  const isLogin = mode === 'login';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = isLogin ? await api.login({ email: form.email, password: form.password }) : await api.register(form);
      setUser(r.user);
      nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const other = `${isLogin ? '/register' : '/login'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="wrap page auth">
      <h1 className="page-title">{isLogin ? 'تسجيل الدخول' : 'حساب جديد'}</h1>
      <p className="page-lede">
        {isLogin ? 'ادخل لتحفظ مقطوعاتك ونتائج تدريب أذنك.' : 'الحساب مجاني. نحتاجه فقط لنحفظ ما تعزفه وتقدّمك في التدريب.'}
      </p>
      <form onSubmit={submit} className="form" noValidate>
        {!isLogin && (
          <label className="field">
            <span>الاسم الذي يظهر في المعرض</span>
            <input value={form.name} onChange={set('name')} autoComplete="nickname" required minLength={2} maxLength={40} />
          </label>
        )}
        <label className="field">
          <span>البريد الإلكتروني</span>
          <input type="email" dir="ltr" value={form.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label className="field">
          <span>كلمة المرور</span>
          <input type="password" dir="ltr" value={form.password} onChange={set('password')} required
            autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? 1 : 8} />
          {!isLogin && <small>ثمانية أحرف على الأقل</small>}
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'لحظة…' : isLogin ? 'ادخل' : 'أنشئ الحساب'}</button>
      </form>
      <p className="hint">
        {isLogin ? 'ليس لديك حساب؟ ' : 'لديك حساب؟ '}
        <Link to={other}>{isLogin ? 'أنشئ حساباً' : 'سجّل الدخول'}</Link>
      </p>
    </div>
  );
}
