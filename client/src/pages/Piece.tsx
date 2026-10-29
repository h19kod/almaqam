import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import Roll from '../components/Roll';
import { api, ApiError, type Composition } from '../lib/api';
import { playSequence, prewarm, stopAll } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { byId, duration, notesCount } from '../lib/maqamat';

export default function Piece() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [c, setC] = useState<Composition | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [deg, setDeg] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.composition(Number(id))
      .then((r) => { setC(r.composition); prewarm(r.composition.maqam); document.title = `${r.composition.title} — مقام`; })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'لم نجد هذه المقطوعة. ربما حذفها صاحبها.' : e.message));
  }, [id]);

  if (error) return <div className="wrap page"><h1 className="page-title">غير موجودة</h1><p className="page-lede">{error}</p><Link className="btn" to="/gallery">إلى المعرض</Link></div>;
  if (!c) return <div className="page-loading" aria-busy="true" />;
  const m = byId[c.maqam];

  async function toggle() {
    if (playing) { stopAll(); setPlaying(false); setActive(-1); setDeg(null); return; }
    setPlaying(true);
    await playSequence(c!.maqam, c!.notes, (i, n) => { setActive(i); setDeg(n.d % 7 === 0 && n.d > 0 ? 7 : n.d % 7); });
    setPlaying(false); setActive(-1); setDeg(null);
  }

  async function like() {
    if (!user) { nav(`/login?next=/piece/${c!.id}`); return; }
    const r = await api.like(c!.id).catch(() => null);
    if (r) setC({ ...c!, ...r });
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) { await navigator.share({ title: c!.title, url }).catch(() => {}); return; }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const length = Math.max(...c.notes.map((n) => n.t + n.l));

  return (
    <div className="wrap page piece-page" style={{ ['--glaze' as string]: m.glaze }}>
      <Link to="/gallery" className="crumb">المعرض</Link>
      <h1 className="page-title">{c.title}</h1>
      <p className="page-lede">
        على مقام <Link to={`/maqam/${m.id}`}>{m.name}</Link>، عزفها {c.author}. {notesCount(c.notes.length)} في {duration(length)}.
      </p>
      <div className="stage">
        <Roll notes={c.notes} glaze={m.glaze} active={active} height={160} />
      </div>
      <div className="row controls">
        <button className="btn" onClick={toggle}>{playing ? 'إيقاف' : 'شغّل'}</button>
        {c.public && (
          <button className={`btn btn-ghost ${c.liked ? 'on' : ''}`} onClick={like} aria-pressed={c.liked}>
            {c.liked ? 'أعجبتك' : 'أعجبني'} ({c.likes})
          </button>
        )}
        <button className="btn btn-ghost" onClick={share}>{copied ? 'نُسخ الرابط' : 'شارك'}</button>
        <Link className="btn btn-ghost" to={`/studio?maqam=${m.id}`}>اعزف على {m.name}</Link>
      </div>
      <BrickLadder maqam={m} active={deg} />
    </div>
  );
}
