import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import { api } from '../lib/api';
import { playCents, playSequence, scaleNotes, stopAll } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { LESSONS, lessonById, type Question } from '../lib/lessons';
import { byId, degreeCents } from '../lib/maqamat';
import { saveLocalLesson } from '../lib/progress';
import NotFound from './NotFound';

const COMMON_TONIC = 200;

/** Stable shuffle so options don't jump around on re-render. */
function shuffled<T>(xs: T[], seed: string): T[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return xs.map((x, i) => ({ x, k: Math.sin(h + i * 97) })).sort((a, b) => a.k - b.k).map((o) => o.x);
}

function QuestionView({ q, n, onAnswer }: { q: Question; n: number; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const key = `${n}-${q.prompt}`;

  const options = useMemo(() => {
    if (q.kind === 'choice') return shuffled(q.options.map((o, i) => ({ label: o, value: i })), key);
    if (q.kind === 'maqam') return shuffled(q.options.map((id) => ({ label: byId[id].name, value: id as string })), key);
    return [];
  }, [q, key]);

  const correct = q.kind === 'choice' ? q.answer : q.kind === 'maqam' ? q.play : q.answer;
  const done = picked !== null;

  function pick(v: number | string) {
    if (done) return;
    setPicked(v);
    onAnswer(v === correct);
  }

  async function listen() {
    if (q.kind !== 'maqam') return;
    await playSequence(q.play, scaleNotes('both', 340), (_, x) => setActive(x.d), COMMON_TONIC);
    setActive(null);
  }

  return (
    <div className="question">
      <h3><span className="q-n">{n}</span>{q.prompt}</h3>
      {q.kind === 'maqam' && <button className="btn btn-ghost" onClick={listen}>اسمع</button>}
      {q.kind === 'brick' ? (
        <div className={`brick-quiz ${done ? 'done' : ''}`}>
          <BrickLadder maqam={byId[q.maqam]} active={active} showAjnas={false} onNote={(d) => playCents(degreeCents(byId[q.maqam], d))} />
          <div className="brick-targets" role="group" aria-label="اختر حجرة">
            {byId[q.maqam].steps.slice(1).map((c, i) => {
              const w = c - byId[q.maqam].steps[i];
              const state = !done ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : '';
              return (
                <button key={i} className={`target ${state}`} style={{ width: `${(w / 1200) * 100}%` }}
                  onClick={() => pick(i)} disabled={done} aria-label={`الحجرة ${i + 1}`} />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="opts">
          {options.map((o) => {
            const state = !done ? '' : o.value === correct ? 'right' : o.value === picked ? 'wrong' : 'dim';
            return <button key={String(o.value)} className={`answer ${state}`} onClick={() => pick(o.value)} disabled={done}>{o.label}</button>;
          })}
        </div>
      )}
      {done && <p className={`explain ${picked === correct ? 'ok' : 'no'}`}>{picked === correct ? 'صحيح. ' : 'ليس تماماً. '}{q.explain}</p>}
    </div>
  );
}

export default function Lesson() {
  const { id } = useParams();
  const lesson = lessonById[id ?? ''];
  const { user } = useAuth();
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');

  useEffect(() => { setAnswers([]); setSaved('idle'); stopAll(); }, [id]);
  if (!lesson) return <NotFound />;

  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  const answered = answers.filter((x) => x !== undefined).length;
  const finished = answered === lesson.quiz.length;
  const score = finished ? Math.round((answers.filter(Boolean).length / lesson.quiz.length) * 100) : 0;
  const passed = score >= 60;

  async function answer(i: number, ok: boolean) {
    const a = [...answers];
    a[i] = ok;
    setAnswers(a);
    if (a.filter((x) => x !== undefined).length === lesson.quiz.length) {
      const s = Math.round((a.filter(Boolean).length / lesson.quiz.length) * 100);
      if (s < 60) return;
      saveLocalLesson(lesson.id, s);
      if (user) {
        try { await api.completeLesson(lesson.id, s); setSaved('saved'); } catch { setSaved('failed'); }
      }
    }
  }

  const m = lesson.maqam ? byId[lesson.maqam] : null;
  return (
    <div className="wrap page lesson" style={{ ['--glaze' as string]: m?.glaze ?? 'var(--ochre)' }}>
      <Link to="/learn" className="crumb">المسار</Link>
      <p className="lesson-n">الدرس {idx + 1} من {LESSONS.length}</p>
      <h1 className="page-title">{lesson.title}</h1>
      <p className="page-lede">{lesson.summary}</p>

      {lesson.steps.map((s, i) => (
        <section key={i} className="step">
          <h2>{s.title}</h2>
          <p>{s.body}</p>
          {s.kind === 'listen' && (
            <div className="row">
              {s.play.map((p) => (
                <button key={p.label} className="btn btn-ghost" onClick={() => { stopAll(); p.cents.forEach((c, k) => playCents(c, k * 0.42, k === p.cents.length - 1 ? 2 : 0.6)); }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {s.kind === 'ladder' && <LadderStep id={s.maqam} />}
        </section>
      ))}

      <section className="quiz">
        <h2>اختبار قصير</h2>
        {lesson.quiz.map((q, i) => (
          <QuestionView key={`${lesson.id}-${i}`} q={q} n={i + 1} onAnswer={(ok) => answer(i, ok)} />
        ))}
      </section>

      {finished && (
        <div className={`result ${passed ? 'pass' : 'fail'}`} role="status">
          <strong>{score}٪</strong>
          <p>
            {passed ? 'أنهيت الدرس.' : 'تحتاج إجابتين صحيحتين على الأقل. أعد الاستماع وحاول مرة أخرى.'}
            {passed && saved === 'saved' && ' حفظنا تقدّمك.'}
            {passed && saved === 'failed' && ' لم نتمكن من حفظ التقدّم على الخادم، لكنه محفوظ في هذا المتصفح.'}
          </p>
          <div className="row">
            {!passed && <button className="btn" onClick={() => { setAnswers([]); window.scrollTo({ top: 0 }); }}>أعد الدرس</button>}
            {passed && next && <Link className="btn" to={`/learn/${next.id}`}>الدرس التالي: {next.title}</Link>}
            {passed && !next && <Link className="btn" to="/train">أنهيت المسار. جرّب التدريب الكامل</Link>}
            {m && <Link className="btn btn-ghost" to={`/studio?maqam=${m.id}`}>اعزف {m.name}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function LadderStep({ id }: { id: keyof typeof byId }) {
  const m = byId[id];
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  async function play() {
    if (playing) { stopAll(); setPlaying(false); setActive(null); return; }
    setPlaying(true);
    await playSequence(m.id, scaleNotes('both', 340), (_, n) => setActive(n.d));
    setPlaying(false); setActive(null);
  }
  return (
    <>
      <BrickLadder maqam={m} active={active} onNote={(d) => { playCents(degreeCents(m, d)); setActive(d); }} />
      <div className="row">
        <button className="btn btn-ghost" onClick={play}>{playing ? 'إيقاف' : `اسمع ${m.name}`}</button>
        <Link className="link" to={`/maqam/${m.id}`}>صفحة {m.name} كاملة</Link>
      </div>
    </>
  );
}
