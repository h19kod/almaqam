import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Leader } from '../lib/api';

export default function Leaders() {
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [rows, setRows] = useState<Leader[] | null>(null);

  useEffect(() => {
    setRows(null);
    api.leaderboard(period).then((r) => setRows(r.leaders)).catch(() => setRows([]));
  }, [period]);

  return (
    <div className="wrap page leaders">
      <h1 className="page-title">لوحة الآذان</h1>
      <p className="page-lede">ترتيب المتدرّبين بعدد الإجابات الصحيحة في «درّب أذنك». يظهر هنا من أجاب عن خمسة أسئلة على الأقل.</p>
      <div className="seg" role="group" aria-label="الفترة">
        <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>هذا الأسبوع</button>
        <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>كل الوقت</button>
      </div>
      {!rows && <div className="skeleton-list" aria-busy="true"><div /></div>}
      {rows && rows.length === 0 && (
        <div className="empty-state"><p>لا أحد في اللوحة بعد. كن الأول.</p><Link className="btn" to="/train">ابدأ التدريب</Link></div>
      )}
      {rows && rows.length > 0 && (
        <table className="board">
          <thead><tr><th scope="col">المركز</th><th scope="col">الاسم</th><th scope="col">صحيحة</th><th scope="col">الدقّة</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.me ? 'me' : ''}>
                <td className="rank">{i + 1}</td>
                <td><Link to={`/u/${r.id}`}>{r.name}</Link>{r.me && <span className="tag">أنت</span>}</td>
                <td>{r.correct} <span className="muted">من {r.total}</span></td>
                <td>
                  <div className="acc-bar small" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, k) => <i key={k} className={k < Math.round(r.accuracy / 10) ? 'on' : ''} />)}
                  </div>
                  <span className="sr">{r.accuracy}٪</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
