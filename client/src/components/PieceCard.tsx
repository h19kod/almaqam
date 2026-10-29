import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Composition } from '../lib/api';
import { playSequence, stopAll } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { byId } from '../lib/maqamat';
import Roll from './Roll';

export default function PieceCard({ c, onDelete }: { c: Composition; onDelete?: () => void }) {
  const m = byId[c.maqam];
  const { user } = useAuth();
  const nav = useNavigate();
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [like, setLike] = useState({ liked: c.liked, likes: c.likes });

  async function toggle() {
    if (playing) { stopAll(); setPlaying(false); setActive(-1); return; }
    setPlaying(true);
    await playSequence(c.maqam, c.notes, (i) => setActive(i));
    setPlaying(false);
    setActive(-1);
  }

  async function doLike() {
    if (!user) { nav(`/login?next=/piece/${c.id}`); return; }
    const prev = like;
    setLike({ liked: !like.liked, likes: like.likes + (like.liked ? -1 : 1) });
    try { setLike(await api.like(c.id)); } catch { setLike(prev); }
  }

  return (
    <article className="piece" style={{ ['--glaze' as string]: m.glaze }}>
      <Link to={`/piece/${c.id}`} className="piece-roll" aria-label={`افتح ${c.title}`}>
        <Roll notes={c.notes} glaze={m.glaze} active={active} height={70} />
      </Link>
      <div className="piece-meta">
        <button className={`play ${playing ? 'stop' : ''}`} onClick={toggle} aria-label={playing ? 'إيقاف' : `شغّل ${c.title}`}>
          <span aria-hidden="true" />
        </button>
        <div className="piece-text">
          <h3><Link to={`/piece/${c.id}`}>{c.title}</Link></h3>
          <p>
            <Link to={`/maqam/${m.id}`} className="tag">{m.name}</Link>
            <Link to={`/u/${c.authorId}`} className="muted-link">{c.author}</Link>
            {c.comments > 0 && <span title="تعليقات">{c.comments} تعليق</span>}
            {c.parent && <span className="tag tag-muted">إعادة عزف</span>}
            {!c.public && <span className="tag tag-muted">خاصة</span>}
          </p>
        </div>
        {c.public && (
          <button className={`like ${like.liked ? 'on' : ''}`} onClick={doLike} aria-pressed={like.liked}
            aria-label={like.liked ? 'ألغِ الإعجاب' : 'أعجبني'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z" /></svg>
            <span>{like.likes}</span>
          </button>
        )}
        {onDelete && <button className="link-btn danger" onClick={onDelete}>حذف</button>}
      </div>
    </article>
  );
}
