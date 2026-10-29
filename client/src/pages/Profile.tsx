import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PieceCard from '../components/PieceCard';
import { api, ApiError, type Composition, type PublicUser } from '../lib/api';
import { useAuth } from '../lib/auth';

const joined = (s: string) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long' });

export default function Profile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [pieces, setPieces] = useState<Composition[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setUser(null); setPieces(null); setError('');
    api.user(Number(id)).then((r) => { setUser(r.user); document.title = `${r.user.name} — مقام`; })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'لا يوجد مستخدم بهذا الرابط.' : e.message));
    api.compositions({ user: Number(id) }).then((r) => setPieces(r.compositions)).catch(() => setPieces([]));
  }, [id]);

  if (error) return <div className="wrap page"><h1 className="page-title">غير موجود</h1><p className="page-lede">{error}</p></div>;
  if (!user) return <div className="page-loading" aria-busy="true" />;

  return (
    <div className="wrap page profile">
      <h1 className="page-title">{user.name}</h1>
      <p className="page-lede">
        عضو منذ {joined(user.joined)}{user.admin ? '، ومشرف في الموقع' : ''}.
        {me?.id === user.id && <> هذه صفحتك كما يراها الآخرون. <Link to="/me">لوحتك الخاصة</Link></>}
      </p>
      <div className="numbers">
        <div><strong>{pieces?.length ?? 0}</strong><span>مقطوعة منشورة</span></div>
        <div><strong>{user.likesReceived}</strong><span>إعجاباً</span></div>
        <div><strong>{user.lessons}</strong><span>درساً مكتملاً</span></div>
        <div><strong>{user.accuracy === null ? '—' : `${user.accuracy}٪`}</strong><span>دقّة الأذن</span></div>
      </div>
      <h2 className="section-title">المقطوعات</h2>
      {pieces && pieces.length === 0 && <p className="hint">لم ينشر شيئاً بعد.</p>}
      {pieces && pieces.length > 0 && <div className="pieces">{pieces.map((c) => <PieceCard key={c.id} c={c} />)}</div>}
    </div>
  );
}
