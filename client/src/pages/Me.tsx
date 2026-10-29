import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PieceCard from '../components/PieceCard';
import { api, type Composition, type Stats } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LESSONS } from '../lib/lessons';
import { MAQAMAT } from '../lib/maqamat';

export default function Me() {
  const { user, ready } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [mine, setMine] = useState<Composition[] | null>(null);

  useEffect(() => {
    if (!user) return;
    api.stats().then(setStats).catch(() => {});
    api.compositions({ mine: true }).then((r) => setMine(r.compositions)).catch(() => setMine([]));
  }, [user]);

  if (!ready) return <div className="page-loading" aria-busy="true" />;
  if (!user) return <Navigate to="/login?next=/me" replace />;

  async function remove(id: number) {
    if (!confirm('تحذف هذه المقطوعة نهائياً؟')) return;
    await api.remove(id);
    setMine((m) => m?.filter((c) => c.id !== id) ?? null);
  }

  const acc = stats && stats.total ? Math.round((stats.correct / stats.total) * 100) : null;

  return (
    <div className="wrap page me">
      <h1 className="page-title">أهلاً {user.name}</h1>
      <p className="page-lede">
        {stats?.dayStreak ? `تتدرّب منذ ${stats.dayStreak === 1 ? 'يوم واحد' : `${stats.dayStreak} أيام`} متتالية.` : 'تدرّب اليوم لتبدأ سلسلة أيامك.'}
        {' '}<Link to={`/u/${user.id}`}>صفحتك العامة</Link>
        {user.role === 'admin' && <> · <Link to="/admin">الإشراف</Link></>}
      </p>

      <div className="numbers">
        <div><strong>{acc === null ? '—' : `${acc}٪`}</strong><span>دقّة أذنك</span></div>
        <div><strong>{stats?.total ?? 0}</strong><span>سؤالاً أجبت عنه</span></div>
        <div><strong>{stats?.best ?? 0}</strong><span>أطول سلسلة صحيحة</span></div>
        <div><strong>{stats?.likesReceived ?? 0}</strong><span>إعجاباً بمقطوعاتك</span></div>
      </div>

      {stats && (
        <>
          <h2 className="section-title">الإنجازات</h2>
          <ul className="badges">
            {stats.achievements.map((a) => (
              <li key={a.id} className={a.earned ? 'on' : ''}>
                <span className="badge-brick" aria-hidden="true" />
                <strong>{a.name}</strong>
                <span>{a.text}</span>
                <span className="sr">{a.earned ? 'مكتسب' : 'لم يُكتسب بعد'}</span>
              </li>
            ))}
          </ul>
          <h2 className="section-title">المسار</h2>
          <p className="hint">
            أكملت {stats.lessons.length} من {LESSONS.length} دروس.{' '}
            <Link to="/learn">{stats.lessons.length >= LESSONS.length ? 'راجع الدروس' : 'تابع المسار'}</Link>
          </p>
        </>
      )}

      <h2 className="section-title">أذنك مع كل مقام</h2>
      {stats && stats.total > 0 ? (
        <ul className="acc">
          {MAQAMAT.map((m) => {
            const s = stats.perMaqam[m.id];
            const p = s ? s.correct / s.total : 0;
            return (
              <li key={m.id} style={{ ['--glaze' as string]: m.glaze }}>
                <Link to={`/maqam/${m.id}`}>{m.name}</Link>
                <div className="acc-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}
                  aria-label={`دقّة ${m.name}`}>
                  {Array.from({ length: 10 }, (_, i) => <i key={i} className={s && i < Math.round(p * 10) ? 'on' : ''} />)}
                </div>
                <span>{s ? `${s.correct} من ${s.total}` : 'لم يُسأل بعد'}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state"><p>لم تتدرّب بعد.</p><Link className="btn" to="/train">ابدأ أول جولة</Link></div>
      )}

      <h2 className="section-title">مقطوعاتك</h2>
      {mine && mine.length === 0 && (
        <div className="empty-state"><p>لم تحفظ أي مقطوعة.</p><Link className="btn" to="/studio">افتح الاستوديو</Link></div>
      )}
      {mine && mine.length > 0 && <div className="pieces">{mine.map((c) => <PieceCard key={c.id} c={c} onDelete={() => remove(c.id)} />)}</div>}
    </div>
  );
}
