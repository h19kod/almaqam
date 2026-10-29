import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import { api } from '../lib/api';
import { playSequence, scaleNotes, stopAll } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { MAQAMAT, byId, type Maqam, type MaqamId } from '../lib/maqamat';

const LEVELS = {
  start: { label: 'بداية', ids: ['rast', 'hijaz', 'nahawand', 'ajam'] as MaqamId[], hint: 'أربعة مقامات متباعدة الطابع' },
  middle: { label: 'متوسط', ids: ['rast', 'bayati', 'hijaz', 'kurd', 'nahawand', 'ajam'] as MaqamId[], hint: 'يدخل البيات والكرد' },
  full: { label: 'كامل', ids: MAQAMAT.map((m) => m.id), hint: 'الثمانية كلها، بما فيها الصبا والسيكاه' },
};
type Level = keyof typeof LEVELS;
const ROUNDS = 10;
const COMMON_TONIC = 200; // دوكاه: every question starts from the same note, so only the shape gives it away

function onTonic(m: Maqam): Maqam {
  return { ...m, tonic: COMMON_TONIC };
}

export default function Train() {
  const { user } = useAuth();
  const [level, setLevel] = useState<Level | null>(null);
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState<MaqamId | null>(null);
  const [guess, setGuess] = useState<MaqamId | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState<{ was: MaqamId; said: MaqamId }[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const order = useRef<MaqamId[]>([]);

  useEffect(() => () => stopAll(), []);

  function start(l: Level) {
    const ids = LEVELS[l].ids;
    // balanced, shuffled question list
    const list = Array.from({ length: ROUNDS }, (_, i) => ids[i % ids.length]).sort(() => Math.random() - 0.5);
    order.current = list;
    setLevel(l); setRound(0); setScore(0); setMisses([]); setGuess(null);
    setAnswer(list[0]);
    setTimeout(() => listen(list[0]), 250);
  }

  async function listen(id: MaqamId = answer!) {
    setPlaying(true);
    await playSequence(id, scaleNotes('both', 360), (_, n) => setActive(n.d), COMMON_TONIC);
    setPlaying(false);
    setActive(null);
  }

  function pick(id: MaqamId) {
    if (guess || !answer) return;
    setGuess(id);
    const ok = id === answer;
    if (ok) setScore((s) => s + 1);
    else setMisses((x) => [...x, { was: answer, said: id }]);
    if (user) api.attempt({ maqam: answer, guess: id }).catch(() => {});
  }

  function nextRound() {
    const r = round + 1;
    setRound(r);
    setGuess(null);
    if (r >= ROUNDS) { setAnswer(null); return; }
    setAnswer(order.current[r]);
    setTimeout(() => listen(order.current[r]), 200);
  }

  if (!level) {
    return (
      <div className="wrap page">
        <h1 className="page-title">درّب أذنك</h1>
        <p className="page-lede">
          نعزف لك سلّماً صاعداً ونازلاً، وكل الأسئلة تبدأ من الدوكاه نفسها، فلا يبقى أمامك إلا شكل المقام.
          عشر جولات في كل مرة.
        </p>
        <div className="levels">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} className="level" onClick={() => start(l)}>
              <span className="level-name">{LEVELS[l].label}</span>
              <span className="level-hint">{LEVELS[l].hint}</span>
              <span className="level-list">{LEVELS[l].ids.map((i) => byId[i].name).join('، ')}</span>
            </button>
          ))}
        </div>
        {!user && <p className="hint"><Link to="/login?next=/train">سجّل الدخول</Link> لنحفظ نتائجك ونُريك أي المقامات تخلط بينها.</p>}
      </div>
    );
  }

  if (!answer) {
    const pct = Math.round((score / ROUNDS) * 100);
    return (
      <div className="wrap page train-done">
        <h1 className="page-title">{score} من {ROUNDS}</h1>
        <p className="page-lede">
          {pct === 100 ? 'أذن سليمة تماماً. جرّب المستوى الأعلى.' : pct >= 70 ? 'جيد جداً. راجع المقامات التي خلطت بينها أدناه.' :
            'البداية دائماً هكذا. استمع للسلالم في صفحة المقامات ثم عُد.'}
        </p>
        {misses.length > 0 && (
          <ul className="misses">
            {misses.map((x, i) => (
              <li key={i}>
                سمعتَ <Link to={`/maqam/${x.was}`}>{byId[x.was].name}</Link> وظننته <Link to={`/maqam/${x.said}`}>{byId[x.said].name}</Link>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn" onClick={() => start(level)}>جولة جديدة</button>
          <button className="btn btn-ghost" onClick={() => setLevel(null)}>غيّر المستوى</button>
          {user && <Link className="btn btn-ghost" to="/me">نتائجي</Link>}
        </div>
      </div>
    );
  }

  const shown = onTonic(byId[answer]);
  return (
    <div className="wrap page train">
      <div className="train-head">
        <span>الجولة {round + 1} من {ROUNDS}</span>
        <span>النتيجة {score}</span>
      </div>
      <div className="progress" aria-hidden="true">
        {Array.from({ length: ROUNDS }, (_, i) => <i key={i} className={i < round ? 'done' : i === round ? 'now' : ''} />)}
      </div>
      <h1 className="page-title">أي مقام هذا؟</h1>
      <button className="btn btn-ghost" onClick={() => listen()} disabled={playing}>{playing ? 'نعزف…' : 'اسمعه مرة أخرى'}</button>

      <div className="answers">
        {LEVELS[level].ids.map((id) => {
          const state = !guess ? '' : id === answer ? 'right' : id === guess ? 'wrong' : 'dim';
          return (
            <button key={id} className={`answer ${state}`} onClick={() => pick(id)} disabled={!!guess}
              style={{ ['--glaze' as string]: byId[id].glaze }}>
              {byId[id].name}
            </button>
          );
        })}
      </div>

      {guess && (
        <div className="reveal" role="status">
          <p>{guess === answer ? 'صحيح.' : `كان ${byId[answer].name}.`} {byId[answer].summary}</p>
          <BrickLadder maqam={shown} active={active} />
          <button className="btn" onClick={nextRound} autoFocus>{round + 1 >= ROUNDS ? 'النتيجة' : 'التالي'}</button>
        </div>
      )}
    </div>
  );
}
