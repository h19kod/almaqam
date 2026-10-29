import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import PieceCard from '../components/PieceCard';
import { api, type Composition } from '../lib/api';
import { playCents, playSequence, scaleNotes, stopAll } from '../lib/audio';
import { MAQAMAT, byId, degreeCents, type MaqamId } from '../lib/maqamat';

export default function Home() {
  const [id, setId] = useState<MaqamId>('hijaz');
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [latest, setLatest] = useState<Composition[]>([]);
  const [qt, setQt] = useState<'e' | 'q' | null>(null);
  const m = byId[id];

  useEffect(() => {
    api.compositions({ sort: 'top' }).then((r) => setLatest(r.compositions.slice(0, 3))).catch(() => {});
  }, []);

  async function play(next: MaqamId = id) {
    setId(next);
    setPlaying(true);
    await playSequence(next, scaleNotes('both', 320), (_, n) => setActive(n.d));
    setActive(null);
    setPlaying(false);
  }

  function compare(which: 'e' | 'q') {
    stopAll();
    setQt(which);
    // راست, دوكاه, then بوسليك (E) or سيكاه (E half-flat)
    [0, 200, which === 'e' ? 400 : 350].forEach((c, i) => playCents(c, i * 0.42, i === 2 ? 2 : 0.6));
    setTimeout(() => setQt(null), 2600);
  }

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1 className="hero-title">مقام</h1>
          <p className="hero-lede">
            اسمع الفرق بين الحجاز والصبا، وشاهد أين يقع ربع الصوت، ثم اعزفه بنفسك.
            كل حجرة هنا درجة، وعرضها هو المسافة الحقيقية بين النغمتين.
          </p>

          <div className="chips" role="tablist" aria-label="اختر مقاماً">
            {MAQAMAT.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === id} className={`chip ${x.id === id ? 'on' : ''}`}
                style={{ ['--glaze' as string]: x.glaze }} onClick={() => play(x.id)}>
                {x.name}
              </button>
            ))}
          </div>

          <div className="hero-stage">
            <BrickLadder maqam={m} active={active} onNote={(d) => { playCents(degreeCents(m, d)); setActive(d); }} />
            <div className="hero-caption">
              <p><strong>{m.name}</strong>: {m.mood}. {m.summary}</p>
              <div className="row">
                <button className="btn" onClick={() => (playing ? (stopAll(), setPlaying(false), setActive(null)) : play())}>
                  {playing ? 'إيقاف' : `اسمع ${m.name}`}
                </button>
                <Link to={`/maqam/${m.id}`} className="btn btn-ghost">اقرأ عن {m.name}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band band-quarter">
        <div className="wrap split">
          <div>
            <h2>ربع الصوت ليس خطأً في الدوزان</h2>
            <p>
              البيانو يقسم الأوكتاف إلى اثني عشر صوتاً. الموسيقى العربية تحتاج نغمات تقع بينها،
              أشهرها السيكاه: أخفض من «مي» بربع صوت. اضغط الزرّين واسمع الجملة نفسها تنتهي مرة على مي، ومرة على سيكاه.
            </p>
          </div>
          <div className="qt">
            <button className={`qt-btn ${qt === 'e' ? 'on' : ''}`} onClick={() => compare('e')}>
              <span className="qt-note">مي</span>
              <span>كما على البيانو</span>
            </button>
            <button className={`qt-btn q ${qt === 'q' ? 'on' : ''}`} onClick={() => compare('q')}>
              <span className="qt-note">سيكاه</span>
              <span>أخفض بخمسين سنت</span>
            </button>
            <div className="qt-scale" aria-hidden="true">
              <span style={{ insetInlineStart: '0%' }}>راست</span>
              <span style={{ insetInlineStart: '50%' }}>دوكاه</span>
              <span className={`mark ${qt === 'q' ? 'on' : ''}`} style={{ insetInlineStart: '87.5%' }}>سيكاه</span>
              <span className={`mark ${qt === 'e' ? 'on' : ''}`} style={{ insetInlineStart: '100%' }}>مي</span>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2 className="section-title">ثلاث طرق للدخول</h2>
          <div className="doors">
            <Link to="/maqamat" className="door">
              <span className="door-word">تعلّم</span>
              <span className="door-text">ثمانية مقامات، كل واحد بأجناسه وسيره وجملة تسمعها بصوت العود.</span>
            </Link>
            <Link to="/studio" className="door">
              <span className="door-word">اعزف</span>
              <span className="door-text">عود من خمس عشرة نغمة على لوحة المفاتيح أو بلمس الشاشة. سجّل جملتك واحفظها.</span>
            </Link>
            <Link to="/train" className="door">
              <span className="door-word">درّب أذنك</span>
              <span className="door-text">نعزف لك سلّماً من قرار واحد، وأنت تخمّن المقام. نحفظ نتائجك لتعرف أين تخطئ.</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="band band-iraq">
        <div className="wrap split">
          <div>
            <h2>من بغداد</h2>
            <p>
              المقام العراقي فنّ قائم بذاته: قصيدة تُغنّى على مقام، بترتيب محفوظ من التحرير إلى التسليم،
              وتحمله «الجالغي البغدادي» بالسنطور والجوزة والطبلة. حفظه رواة مثل محمد القبانجي ويوسف عمر وناظم الغزالي،
              وأوصل منير بشير العود العراقي إلى مسارح العالم.
            </p>
            <p>
              هذا الموقع يبدأ من المقامات الثمانية المشتركة بين البلاد العربية، لأنها الأبجدية التي يُبنى عليها كل شيء آخر.
            </p>
          </div>
          <figure className="gate" aria-hidden="true">
            {Array.from({ length: 6 }, (_, r) => (
              <div key={r} className="gate-row">
                {Array.from({ length: 7 - (r % 2) }, (_, k) => <i key={k} style={{ animationDelay: `${(r * 7 + k) * 40}ms` }} />)}
              </div>
            ))}
          </figure>
        </div>
      </section>

      {latest.length > 0 && (
        <section className="band">
          <div className="wrap">
            <div className="section-head">
              <h2 className="section-title">الأكثر إعجاباً في المعرض</h2>
              <Link to="/gallery" className="link">كل المقطوعات</Link>
            </div>
            <div className="pieces">
              {latest.map((c) => <PieceCard key={c.id} c={c} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
