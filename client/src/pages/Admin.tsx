import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type AdminStats, type Report } from '../lib/api';
import { useAuth } from '../lib/auth';

type Tab = 'open' | 'hidden' | 'dismissed';
const TABS: { id: Tab; label: string }[] = [
  { id: 'open', label: 'بانتظار المراجعة' },
  { id: 'hidden', label: 'مخفيّة' },
  { id: 'dismissed', label: 'مرفوضة' },
];

export default function Admin() {
  const { user, ready } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    api.adminStats().then(setStats).catch(() => {});
    setReports(null);
    api.adminReports(tab).then((r) => setReports(r.reports)).catch(() => setReports([]));
  };
  useEffect(() => { if (user?.role === 'admin') load(); }, [user, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="page-loading" aria-busy="true" />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== 'admin') {
    return <div className="wrap page"><h1 className="page-title">للمشرفين فقط</h1><p className="page-lede">حسابك لا يملك صلاحية الإشراف.</p></div>;
  }

  async function act(r: Report, action: 'hide' | 'dismiss' | 'restore') {
    setBusy(r.id);
    try { await api.resolve(r.id, action); load(); } finally { setBusy(null); }
  }

  const max = Math.max(1, ...(stats?.daily.map((d) => d.n) ?? [1]));

  return (
    <div className="wrap page admin">
      <h1 className="page-title">الإشراف</h1>
      {stats && (
        <>
          <div className="numbers">
            <div><strong>{stats.users}</strong><span>مستخدماً ({stats.newUsers7} هذا الأسبوع)</span></div>
            <div><strong>{stats.compositions}</strong><span>مقطوعة</span></div>
            <div><strong>{stats.attempts7}</strong><span>سؤال تدريب هذا الأسبوع</span></div>
            <div><strong>{stats.openReports}</strong><span>بلاغاً مفتوحاً</span></div>
          </div>
          <h2 className="section-title">أسئلة التدريب يومياً</h2>
          {stats.daily.length === 0 ? <p className="hint">لا نشاط في الأسبوعين الأخيرين.</p> : (
            <div className="bars" role="img" aria-label="عدد أسئلة التدريب في كل يوم من آخر أسبوعين">
              {stats.daily.map((d) => (
                <div key={d.day} className="bar" title={`${d.day}: ${d.n}`}>
                  <i style={{ height: `${(d.n / max) * 100}%` }} />
                  <span>{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <h2 className="section-title">البلاغات</h2>
      <div className="seg" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {reports && reports.length === 0 && <p className="hint">لا شيء هنا.</p>}
      {reports && reports.length > 0 && (
        <ul className="reports">
          {reports.map((r) => (
            <li key={r.id}>
              <div className="rep-head">
                <span className="tag">{r.type === 'composition' ? 'مقطوعة' : 'تعليق'}</span>
                <span className="muted">{r.reports > 1 ? `${r.reports} بلاغات` : 'بلاغ واحد'} · أبلغ {r.reporter}</span>
              </div>
              <blockquote>{r.preview ?? <em>حُذف المحتوى</em>}</blockquote>
              <p className="rep-reason">السبب: {r.reason}</p>
              <div className="row">
                {r.compositionId && <Link className="link" to={`/piece/${r.compositionId}`}>افتح المقطوعة</Link>}
                {tab === 'open' && <>
                  <button className="btn btn-small" disabled={busy === r.id} onClick={() => act(r, 'hide')}>أخفِ المحتوى</button>
                  <button className="btn btn-ghost btn-small" disabled={busy === r.id} onClick={() => act(r, 'dismiss')}>ارفض البلاغ</button>
                </>}
                {tab === 'hidden' && <button className="btn btn-ghost btn-small" disabled={busy === r.id} onClick={() => act(r, 'restore')}>أعِد إظهاره</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
