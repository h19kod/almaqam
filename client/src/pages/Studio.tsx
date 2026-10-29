import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Roll from '../components/Roll';
import { api, ApiError } from '../lib/api';
import { playCents, playSequence, prewarm, setDrone, stopAll, type SeqNote } from '../lib/audio';
import { useAuth } from '../lib/auth';
import { DEGREES_IN_STUDIO, MAQAMAT, byId, degreeCents, noteName, notesCount, type MaqamId } from '../lib/maqamat';

// Physical key positions (layout independent, so an Arabic keyboard works too).
const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'];
const KEY_LABEL = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'];
const DRAFT = 'maqam:draft';

interface Draft { maqam: MaqamId; notes: SeqNote[]; title: string; parentId?: number }

export default function Studio() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('maqam') as MaqamId) in byId ? (params.get('maqam') as MaqamId) : 'bayati';
  const [id, setId] = useState<MaqamId>(initial);
  const m = byId[id];
  const { user } = useAuth();
  const nav = useNavigate();

  const [lit, setLit] = useState<Set<number>>(new Set());
  const [drone, setDroneOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState<SeqNote[]>([]);
  const [activeNote, setActiveNote] = useState(-1);
  const [title, setTitle] = useState('');
  const [isPublic, setPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parent, setParent] = useState<{ id: number; title: string; author: string } | null>(null);

  const recStart = useRef(0);
  const open = useRef(new Map<number, number>()); // degree -> index in notes being held

  // restore a draft saved before logging in
  useEffect(() => {
    const raw = sessionStorage.getItem(DRAFT);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Draft;
      setId(d.maqam); setNotes(d.notes); setTitle(d.title);
      if (d.parentId) setParent({ id: d.parentId, title: '', author: '' });
    } catch { /* ignore broken draft */ }
    sessionStorage.removeItem(DRAFT);
  }, []);

  // ?remix=ID: start from someone else's piece
  useEffect(() => {
    const rid = Number(params.get('remix'));
    if (!rid) return;
    api.composition(rid).then(({ composition: c }) => {
      setId(c.maqam);
      setNotes(c.notes);
      setTitle(`على خطى «${c.title}»`.slice(0, 60));
      setParent({ id: c.id, title: c.title, author: c.author });
    }).catch(() => setError('لم نجد المقطوعة التي تريد إعادة عزفها.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { prewarm(id); }, [id]);
  useEffect(() => { setDrone(drone ? id : null); }, [drone, id]);
  useEffect(() => () => setDrone(null), []);

  const press = useCallback((d: number) => {
    playCents(degreeCents(m, d), 0, 1.6);
    setLit((s) => new Set(s).add(d));
    if (recording) {
      setNotes((ns) => {
        if (ns.length >= 2000) return ns;
        open.current.set(d, ns.length);
        return [...ns, { d, t: Math.round(performance.now() - recStart.current), l: 400 }];
      });
    }
  }, [m, recording]);

  const release = useCallback((d: number) => {
    setLit((s) => { const n = new Set(s); n.delete(d); return n; });
    const at = open.current.get(d);
    if (at !== undefined && recording) {
      open.current.delete(d);
      setNotes((ns) => ns.map((n, i) => (i === at ? { ...n, l: Math.max(80, Math.round(performance.now() - recStart.current - n.t)) } : n)));
    }
  }, [recording]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const d = KEYS.indexOf(e.code);
      if (d >= 0) { e.preventDefault(); press(d); }
    };
    const up = (e: KeyboardEvent) => {
      const d = KEYS.indexOf(e.code);
      if (d >= 0) release(d);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [press, release]);

  function choose(next: MaqamId) {
    setId(next);
    setParams({ maqam: next }, { replace: true });
  }

  function toggleRecord() {
    if (recording) { setRecording(false); return; }
    stopAll(); setPlaying(false);
    setNotes([]); setError(''); setParent(null);
    open.current.clear();
    recStart.current = performance.now();
    setRecording(true);
  }

  async function togglePlay() {
    if (playing) { stopAll(); setPlaying(false); setActiveNote(-1); return; }
    if (!notes.length) return;
    setRecording(false);
    setPlaying(true);
    await playSequence(id, notes, (i, n) => {
      setActiveNote(i);
      setLit(new Set([n.d]));
      setTimeout(() => setLit((s) => { const x = new Set(s); x.delete(n.d); return x; }), Math.min(n.l, 400));
    });
    setPlaying(false); setActiveNote(-1);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!user) {
      sessionStorage.setItem(DRAFT, JSON.stringify({ maqam: id, notes, title, parentId: parent?.id } satisfies Draft));
      nav(`/login?next=${encodeURIComponent(`/studio?maqam=${id}`)}`);
      return;
    }
    setSaving(true);
    try {
      const { composition } = await api.save({ title: title.trim(), maqam: id, notes, public: isPublic, parentId: parent?.id });
      nav(`/piece/${composition.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wrap page studio" style={{ ['--glaze' as string]: m.glaze }}>
      <h1 className="page-title">الاستوديو</h1>
      <p className="page-lede">
        اختر مقاماً، واعزف بالضغط على الحجرات أو بأزرار لوحة المفاتيح. الصف الأسفل القرار، والأعلى الجواب.
        لن تخرج عن المقام مهما ضغطت.
      </p>

      {parent && parent.title && (
        <p className="notice">
          تعيد عزف <Link to={`/piece/${parent.id}`}>«{parent.title}»</Link> لـ{parent.author}. شغّلها لتسمعها، أو سجّل نسختك من جديد.
          غيّر المقام لتسمع الجملة نفسها بطابع آخر.
        </p>
      )}

      <div className="chips" aria-label="المقام">
        {MAQAMAT.map((x) => (
          <button key={x.id} className={`chip ${x.id === id ? 'on' : ''}`} aria-pressed={x.id === id}
            style={{ ['--glaze' as string]: x.glaze }} onClick={() => choose(x.id)}>{x.name}</button>
        ))}
      </div>

      <div className="pads" dir="ltr" role="group" aria-label={`عود على مقام ${m.name}`}>
        {[2, 1, 0].map((row) => (
          <div key={row} className={`pad-row r${row}`}>
            {Array.from({ length: DEGREES_IN_STUDIO }, (_, d) => d)
              .filter((d) => Math.floor(d / 7) === row)
              .map((d) => (
                <button
                  key={d}
                  className={`pad ${lit.has(d) ? 'on' : ''} ${d % 7 === 0 ? 'tonic' : ''}`}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(d); }}
                  onPointerUp={() => release(d)}
                  onPointerCancel={() => release(d)}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); press(d); } }}
                  onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release(d); }}
                  aria-label={noteName(degreeCents(m, d))}
                >
                  <span className="pad-name" dir="rtl">{noteName(degreeCents(m, d))}</span>
                  <kbd>{KEY_LABEL[d]}</kbd>
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="transport">
        <button className={`rec ${recording ? 'on' : ''}`} onClick={toggleRecord} aria-pressed={recording}>
          <span aria-hidden="true" />{recording ? 'أوقف التسجيل' : 'سجّل'}
        </button>
        <button className="btn btn-ghost" onClick={togglePlay} disabled={!notes.length || recording}>
          {playing ? 'إيقاف' : 'شغّل التسجيل'}
        </button>
        <button className="btn btn-ghost" onClick={() => { stopAll(); setNotes([]); setPlaying(false); }}
          disabled={!notes.length || recording}>امسح</button>
        <label className="switch">
          <input type="checkbox" checked={drone} onChange={(e) => setDroneOn(e.target.checked)} />
          <span>صوت القرار المستمر</span>
        </label>
      </div>

      <div className={`take ${recording ? 'live' : ''}`}>
        {notes.length ? (
          <Roll notes={notes} glaze={m.glaze} active={activeNote} height={120} label={`تسجيلك: ${notesCount(notes.length)}`} />
        ) : (
          <p className="empty">{recording ? 'نسجّل الآن. اعزف أي نغمة.' : 'اضغط «سجّل» ثم اعزف. ستظهر نغماتك هنا.'}</p>
        )}
      </div>

      {notes.length > 0 && !recording && (
        <form className="save" onSubmit={save}>
          <label className="field">
            <span>عنوان المقطوعة</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required
              placeholder={`مثلاً: تقاسيم على ال${m.name}`} />
          </label>
          <label className="check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
            <span>اعرضها في المعرض العام</span>
          </label>
          <button className="btn" disabled={saving}>{saving ? 'نحفظ…' : user ? 'احفظ المقطوعة' : 'سجّل الدخول لتحفظ'}</button>
          {error && <p className="error" role="alert">{error}</p>}
          {!user && <p className="hint">سنحتفظ بتسجيلك إلى أن تعود. ليس لديك حساب؟ <Link to="/register?next=/studio">أنشئ حساباً</Link></p>}
        </form>
      )}
    </div>
  );
}
