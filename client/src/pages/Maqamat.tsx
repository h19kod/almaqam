import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import { playCents, playSequence, scaleNotes, stopAll } from '../lib/audio';
import { MAQAMAT, degreeCents, type MaqamId } from '../lib/maqamat';

export default function Maqamat() {
  const [playing, setPlaying] = useState<MaqamId | null>(null);
  const [active, setActive] = useState<number | null>(null);

  async function play(id: MaqamId) {
    if (playing === id) { stopAll(); setPlaying(null); setActive(null); return; }
    setPlaying(id);
    await playSequence(id, scaleNotes('up', 300), (_, n) => setActive(n.d));
    setPlaying((p) => (p === id ? null : p));
    setActive(null);
  }

  return (
    <div className="wrap page">
      <h1 className="page-title">المقامات الثمانية</h1>
      <p className="page-lede">
        كل سطر مقام كامل من قراره إلى جوابه. الحجرات الضيقة أرباع أصوات، والعريضة تون ونصف.
        قارن بينها بالنظر قبل السمع: الحجاز والكرد يختلفان في حجرة واحدة فقط.
      </p>
      <p className="hint"><Link to="/map">خريطة المقامات</Link> تُريك أيّها قريب من أيّها، وأين يمكن الانتقال.</p>
      <ol className="mlist">
        {MAQAMAT.map((m) => (
          <li key={m.id} className="mrow" style={{ ['--glaze' as string]: m.glaze }}>
            <div className="mrow-head">
              <h2><Link to={`/maqam/${m.id}`}>{m.name}</Link></h2>
              <span className="mrow-mood">{m.mood}</span>
              <button className={`play ${playing === m.id ? 'stop' : ''}`} onClick={() => play(m.id)}
                aria-label={playing === m.id ? 'إيقاف' : `اسمع سلّم ${m.name}`}><span aria-hidden="true" /></button>
            </div>
            <BrickLadder maqam={m} active={playing === m.id ? active : null} showAjnas={false}
              onNote={(d) => playCents(degreeCents(m, d))} />
          </li>
        ))}
      </ol>
    </div>
  );
}
