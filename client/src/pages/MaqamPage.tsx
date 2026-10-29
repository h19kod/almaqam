import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import PieceCard from '../components/PieceCard';
import { api, type Composition } from '../lib/api';
import { examplePhrase, playCents, playSequence, prewarm, scaleNotes, stopAll, type SeqNote } from '../lib/audio';
import { MAQAMAT, byId, degreeCents, type MaqamId } from '../lib/maqamat';
import NotFound from './NotFound';

export default function MaqamPage() {
  const { id } = useParams();
  const m = byId[id as MaqamId];
  const [active, setActive] = useState<number | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Composition[]>([]);

  useEffect(() => {
    if (!m) return;
    document.title = `مقام ${m.name} — مقام`;
    prewarm(m.id);
    api.compositions({ maqam: m.id, sort: 'top' }).then((r) => setPieces(r.compositions.slice(0, 4))).catch(() => {});
    return () => { document.title = 'مقام — اسمع المقامات واعزفها'; };
  }, [m]);

  if (!m) return <NotFound />;

  async function run(key: string, notes: SeqNote[]) {
    if (mode === key) { stopAll(); setMode(null); setActive(null); return; }
    setMode(key);
    await playSequence(m.id, notes, (_, n) => setActive(n.d % 7 === 0 && n.d > 0 ? 7 : n.d % 7));
    setMode((x) => (x === key ? null : x));
    setActive(null);
  }

  const idx = MAQAMAT.findIndex((x) => x.id === m.id);
  const prev = MAQAMAT[(idx + MAQAMAT.length - 1) % MAQAMAT.length];
  const next = MAQAMAT[(idx + 1) % MAQAMAT.length];

  return (
    <div className="maqam-page" style={{ ['--glaze' as string]: m.glaze }}>
      <header className="mhead">
        <div className="wrap">
          <Link to="/maqamat" className="crumb">المقامات</Link>
          <h1 className="mname">{m.name}</h1>
          <p className="mmood">{m.mood}</p>
        </div>
      </header>
      <div className="wrap page">
        <BrickLadder maqam={m} active={active} onNote={(d) => { playCents(degreeCents(m, d)); setActive(d); }} />
        <div className="row controls">
          <button className={`btn ${mode === 'up' ? 'on' : ''}`} onClick={() => run('up', scaleNotes('up'))}>
            {mode === 'up' ? 'إيقاف' : 'السلّم صعوداً'}
          </button>
          <button className={`btn btn-ghost ${mode === 'down' ? 'on' : ''}`} onClick={() => run('down', scaleNotes('down'))}>
            {mode === 'down' ? 'إيقاف' : 'نزولاً'}
          </button>
          <button className={`btn btn-ghost ${mode === 'phrase' ? 'on' : ''}`} onClick={() => run('phrase', examplePhrase(m.id))}>
            {mode === 'phrase' ? 'إيقاف' : 'جملة قصيرة'}
          </button>
          <Link to={`/studio?maqam=${m.id}`} className="btn btn-ghost">اعزفه في الاستوديو</Link>
        </div>

        <div className="prose">
          <p className="prose-lead">{m.summary}</p>
          {m.body.map((p, i) => <p key={i}>{p}</p>)}
          <h2>السير</h2>
          <p>{m.sayr}</p>
          <h2>الأجناس</h2>
          <ul className="jlist">
            {m.ajnas.map((j, i) => (
              <li key={i}>
                <strong>جنس {j.name}</strong> من الدرجة {['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة'][j.from]}،
                {' '}{j.size} نغمات.
              </li>
            ))}
          </ul>
        </div>

        {pieces.length > 0 && (
          <>
            <h2 className="section-title">مقطوعات على {m.name}</h2>
            <div className="pieces">{pieces.map((c) => <PieceCard key={c.id} c={c} />)}</div>
          </>
        )}

        <nav className="pager" aria-label="مقامات أخرى">
          <Link to={`/maqam/${prev.id}`}>السابق: {prev.name}</Link>
          <Link to={`/maqam/${next.id}`}>التالي: {next.name}</Link>
        </nav>
      </div>
    </div>
  );
}
