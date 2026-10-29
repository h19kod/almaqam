import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PieceCard from '../components/PieceCard';
import { api, type Composition } from '../lib/api';
import { MAQAMAT, type MaqamId } from '../lib/maqamat';

export default function Gallery() {
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const [maqam, setMaqam] = useState<MaqamId | ''>('');
  const [items, setItems] = useState<Composition[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setItems(null);
    setError('');
    api.compositions({ sort, maqam }).then((r) => setItems(r.compositions)).catch((e) => setError(e.message));
  }, [sort, maqam]);

  return (
    <div className="wrap page">
      <h1 className="page-title">المعرض</h1>
      <p className="page-lede">جمل وتقاسيم سجّلها زوّار الموقع في الاستوديو. اضغط على أي مقطوعة لتسمعها.</p>

      <div className="filters">
        <div className="seg" role="group" aria-label="الترتيب">
          <button aria-pressed={sort === 'new'} onClick={() => setSort('new')}>الأحدث</button>
          <button aria-pressed={sort === 'top'} onClick={() => setSort('top')}>الأكثر إعجاباً</button>
        </div>
        <label className="select">
          <span className="sr">المقام</span>
          <select value={maqam} onChange={(e) => setMaqam(e.target.value as MaqamId | '')}>
            <option value="">كل المقامات</option>
            {MAQAMAT.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!items && !error && <div className="skeleton-list" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} />)}</div>}
      {items && items.length === 0 && (
        <div className="empty-state">
          <p>لا توجد مقطوعات على هذا المقام بعد.</p>
          <Link className="btn" to={`/studio${maqam ? `?maqam=${maqam}` : ''}`}>سجّل أول مقطوعة</Link>
        </div>
      )}
      {items && items.length > 0 && <div className="pieces">{items.map((c) => <PieceCard key={c.id} c={c} />)}</div>}
    </div>
  );
}
