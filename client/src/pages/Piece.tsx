import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import ReportButton from '../components/ReportButton';
import Roll from '../components/Roll';
import { api, ApiError, type Comment, type Composition } from '../lib/api';
import { playSequence, prewarm, stopAll } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { byId, duration, notesCount } from '../lib/maqamat';
import { downloadWav } from '../lib/wav';

const when = (s: string) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    setC(null); setError(''); setComments([]);
    api.composition(Number(id))
      .then((r) => { setC(r.composition); prewarm(r.composition.maqam); document.title = `${r.composition.title} — مقام`; })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'لم نجد هذه المقطوعة. ربما حذفها صاحبها.' : e.message));
    api.comments(Number(id)).then((r) => setComments(r.comments)).catch(() => {});
  }, [id]);

  if (error) return <div className="wrap page"><h1 className="page-title">غير موجودة</h1><p className="page-lede">{error}</p><Link className="btn" to="/gallery">إلى المعرض</Link></div>;
  if (!c) return <div className="page-loading" aria-busy="true" />;
  const m = byId[c.maqam];
  const piece = c;

  async function toggle() {
    if (playing) { stopAll(); setPlaying(false); setActive(-1); setDeg(null); return; }
    setPlaying(true);
    await playSequence(piece.maqam, piece.notes, (i, n) => { setActive(i); setDeg(n.d % 7 === 0 && n.d > 0 ? 7 : n.d % 7); });
    setPlaying(false); setActive(-1); setDeg(null);
  }

  async function like() {
    if (!user) { nav(`/login?next=/piece/${piece.id}`); return; }
    const r = await api.like(piece.id).catch(() => null);
    if (r) setC({ ...piece, ...r });
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) { await navigator.share({ title: piece.title, url }).catch(() => {}); return; }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    setRendering(true);
    // let the button repaint before the (synchronous) render
    setTimeout(() => { try { downloadWav(piece.maqam, piece.notes, piece.title); } finally { setRendering(false); } }, 30);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setCommentError('');
    setSending(true);
    try {
      const r = await api.comment(piece.id, draft);
      setComments((xs) => [...xs, r.comment]);
      setDraft('');
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'تعذّر الإرسال');
    } finally {
      setSending(false);
    }
  }

  async function removeComment(cid: number) {
    if (!confirm('تحذف هذا التعليق؟')) return;
    await api.removeComment(cid).catch(() => {});
    setComments((xs) => xs.filter((x) => x.id !== cid));
  }

  const length = Math.max(...c.notes.map((n) => n.t + n.l));
  const mine = user?.id === c.authorId;

  return (
    <div className="wrap page piece-page" style={{ ['--glaze' as string]: m.glaze }}>
      <Link to="/gallery" className="crumb">المعرض</Link>
      <h1 className="page-title">{c.title}</h1>
      <p className="page-lede">
        على مقام <Link to={`/maqam/${m.id}`}>{m.name}</Link>، عزفها <Link to={`/u/${c.authorId}`}>{c.author}</Link> في {when(c.createdAt)}.
        {' '}{notesCount(c.notes.length)} في {duration(length)}.
        {c.parent && <> إعادة عزف لـ <Link to={`/piece/${c.parent.id}`}>«{c.parent.title}»</Link> لـ{c.parent.author}.</>}
      </p>
      {c.hidden && <p className="notice">أخفى المشرفون هذه المقطوعة من المعرض. تراها أنت لأنك صاحبها أو مشرف.</p>}
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
        <Link className="btn btn-ghost" to={`/studio?remix=${c.id}`}>أعد عزفها</Link>
        <button className="btn btn-ghost" onClick={download} disabled={rendering}>{rendering ? 'نجهّز الملف…' : 'نزّلها WAV'}</button>
        <button className="btn btn-ghost" onClick={share}>{copied ? 'نُسخ الرابط' : 'شارك'}</button>
        {!mine && c.public && <ReportButton type="composition" id={c.id} />}
      </div>
      <BrickLadder maqam={m} active={deg} />

      {c.remixes > 0 && <p className="hint">أعاد {c.remixes === 1 ? 'شخص واحد' : `${c.remixes} أشخاص`} عزف هذه المقطوعة.</p>}

      {c.public && (
        <section className="comments" aria-labelledby="comments-h">
          <h2 id="comments-h" className="section-title">التعليقات</h2>
          {comments.length === 0 && <p className="hint">لا تعليقات بعد.</p>}
          <ul>
            {comments.map((x) => (
              <li key={x.id}>
                <div className="cm-head">
                  <Link to={`/u/${x.authorId}`}>{x.author}</Link>
                  <span className="muted">{when(x.createdAt)}</span>
                  {x.canDelete && <button className="link-btn danger" onClick={() => removeComment(x.id)}>حذف</button>}
                  {user && !x.canDelete && <ReportButton type="comment" id={x.id} small />}
                </div>
                <p>{x.body}</p>
              </li>
            ))}
          </ul>
          {user ? (
            <form className="cm-form" onSubmit={send}>
              <label className="field">
                <span className="sr">تعليقك</span>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} rows={3} required
                  placeholder="ماذا سمعت؟" />
              </label>
              <div className="row">
                <button className="btn" disabled={sending || !draft.trim()}>{sending ? 'نرسل…' : 'أرسل التعليق'}</button>
                <span className="muted">{draft.length}/500</span>
              </div>
              {commentError && <p className="error" role="alert">{commentError}</p>}
            </form>
          ) : (
            <p className="hint"><Link to={`/login?next=/piece/${c.id}`}>سجّل الدخول</Link> لتكتب تعليقاً.</p>
          )}
        </section>
      )}
    </div>
  );
}
