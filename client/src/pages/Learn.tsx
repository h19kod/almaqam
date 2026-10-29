import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LESSONS } from '../lib/lessons';
import { byId } from '../lib/maqamat';
import { useLessonProgress } from '../lib/progress';

export default function Learn() {
  const done = useLessonProgress();
  const { user } = useAuth();
  const finished = LESSONS.filter((l) => done[l.id] !== undefined).length;
  const next = LESSONS.find((l) => done[l.id] === undefined);

  return (
    <div className="wrap page learn">
      <h1 className="page-title">المسار</h1>
      <p className="page-lede">
        تسعة دروس قصيرة، من المألوف إلى الغريب: نبدأ بالعجم الذي يشبه البيانو، وننتهي بالسيكاه الذي يقف على ربع الصوت.
        كل درس ينتهي باختبار من ثلاثة أسئلة.
      </p>
      <div className="path-head">
        <div className="path-meter" role="meter" aria-valuemin={0} aria-valuemax={LESSONS.length} aria-valuenow={finished}
          aria-label="الدروس المكتملة">
          {LESSONS.map((l) => <i key={l.id} className={done[l.id] !== undefined ? 'on' : ''} />)}
        </div>
        <span>{finished} من {LESSONS.length}</span>
        {next && <Link className="btn" to={`/learn/${next.id}`}>{finished ? 'تابع' : 'ابدأ'}: {next.title}</Link>}
      </div>
      {!user && finished > 0 && <p className="hint">تقدّمك محفوظ في هذا المتصفح فقط. <Link to="/register?next=/learn">أنشئ حساباً</Link> لتحفظه في كل مكان.</p>}

      <ol className="path">
        {LESSONS.map((l, i) => {
          const glaze = l.maqam ? byId[l.maqam].glaze : 'var(--ochre)';
          const score = done[l.id];
          return (
            <li key={l.id} className={`stop ${score !== undefined ? 'done' : ''} ${next?.id === l.id ? 'next' : ''}`}
              style={{ ['--glaze' as string]: glaze }}>
              <span className="stop-n" aria-hidden="true">{i + 1}</span>
              <Link to={`/learn/${l.id}`} className="stop-body">
                <span className="stop-title">{l.title}</span>
                <span className="stop-text">{l.summary}</span>
              </Link>
              <span className="stop-state">{score !== undefined ? `${score}٪` : next?.id === l.id ? 'التالي' : ''}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
