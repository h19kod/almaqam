import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrickLadder from '../components/BrickLadder';
import { audio, playCents, stopAll } from '../lib/audio';
import { MAQAMAT, byId, noteName, notesCount, type MaqamId } from '../lib/maqamat';
import { NoteSegmenter, detectMaqam, hzToCents, yin, type Detection } from '../lib/pitch';

type Status = 'off' | 'asking' | 'on' | 'denied' | 'unsupported';

const mod = (x: number, m: number) => ((x % m) + m) % m;
/** Name for any octave: fold into the range our note table covers. */
function nameOf(cents: number) {
  let c = Math.round(cents / 50) * 50;
  while (c < -500) c += 1200;
  while (c > 2600) c -= 1200;
  return noteName(c) || noteName(c + 1200) || noteName(c - 1200);
}

export default function Tuner() {
  const [status, setStatus] = useState<Status>('off');
  const [id, setId] = useState<MaqamId>('bayati');
  const [tonic, setTonic] = useState<number>(byId.bayati.tonic);
  const [reading, setReading] = useState<{ cents: number; hz: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [found, setFound] = useState<Detection[] | null>(null);
  const [heard, setHeard] = useState(0);

  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const seg = useRef<NoteSegmenter | null>(null);
  const smooth = useRef<number | null>(null);

  const m = byId[id];
  const shifted = { ...m, tonic };

  useEffect(() => () => stop(), []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unsupported'); return; }
    setStatus('asking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = s;
      const ctx = audio();
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      src.connect(an);
      const buf = new Float32Array(2048);
      setStatus('on');
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        const r = yin(buf, ctx.sampleRate);
        const now = performance.now();
        if (r && r.clarity > 0.85) {
          const c = hzToCents(r.hz);
          smooth.current = smooth.current === null || Math.abs(c - smooth.current) > 40 ? c : smooth.current * 0.7 + c * 0.3;
          setReading({ cents: smooth.current, hz: r.hz });
          seg.current?.push(c, now);
        } else {
          smooth.current = null;
          setReading(null);
          seg.current?.push(null, now);
        }
        if (seg.current) setHeard(seg.current.notes.length);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setStatus('denied');
    }
  }

  function stop() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setStatus('off');
    setReading(null);
  }

  function toggleDetect() {
    if (!detecting) {
      seg.current = new NoteSegmenter();
      setFound(null);
      setHeard(0);
      setDetecting(true);
      return;
    }
    seg.current?.close(performance.now());
    const notes = seg.current?.notes ?? [];
    seg.current = null;
    setDetecting(false);
    setFound(detectMaqam(notes).slice(0, 3));
  }

  function choose(next: MaqamId) {
    setId(next);
    setTonic(byId[next].tonic);
  }

  // where the voice sits relative to the chosen maqam
  let degree: number | null = null;
  let off = 0;
  let inMaqam = false;
  if (reading) {
    const rel = mod(reading.cents - tonic, 1200);
    let best = 0;
    let dist = 1e9;
    m.steps.forEach((s, d) => {
      const x = Math.abs(rel - s);
      if (x < dist) { dist = x; best = d; }
    });
    degree = best === 7 ? 0 : best;
    off = rel - m.steps[best];
    inMaqam = Math.abs(off) <= 25;
  }
  const nearest = reading ? Math.round(reading.cents / 50) * 50 : 0;
  const dev = reading ? reading.cents - nearest : 0;

  return (
    <div className="wrap page tuner" style={{ ['--glaze' as string]: m.glaze }}>
      <h1 className="page-title">المُدوزِن</h1>
      <p className="page-lede">
        غنِّ أو اعزف قرب الميكروفون، وسترى نغمتك على سلّم المقام الذي تختاره، وكم تبتعد عن ربع الصوت الصحيح.
        الصوت لا يغادر جهازك.
      </p>

      {status !== 'on' && (
        <div className="mic-gate">
          <button className="btn" onClick={start} disabled={status === 'asking'}>
            {status === 'asking' ? 'ننتظر الإذن…' : 'شغّل الميكروفون'}
          </button>
          {status === 'denied' && <p className="error" role="alert">لم نحصل على إذن الميكروفون. اسمح به من إعدادات المتصفح ثم اضغط مرة أخرى.</p>}
          {status === 'unsupported' && <p className="error" role="alert">هذا المتصفح لا يتيح الميكروفون. جرّب كروم أو فايرفوكس حديثاً، وعلى عنوان https.</p>}
        </div>
      )}

      {status === 'on' && (
        <>
          <div className="readout" aria-live="polite">
            <div className="readout-note">{reading ? nameOf(reading.cents) : '—'}</div>
            <div className="gauge" aria-hidden="true">
              <span className="gauge-mid" />
              {reading && <span className={`gauge-needle ${Math.abs(dev) < 8 ? 'ok' : ''}`} style={{ insetInlineStart: `${50 - (dev / 25) * 50}%` }} />}
            </div>
            <div className="readout-sub">
              {reading ? <>{dev > 0 ? '+' : ''}{Math.round(dev)} سنت · {reading.hz.toFixed(1)} هرتز</> : 'لا نسمع نغمة واضحة'}
            </div>
            <button className="link-btn" onClick={stop}>أوقف الميكروفون</button>
          </div>

          <div className="chips" aria-label="المقام">
            {MAQAMAT.map((x) => (
              <button key={x.id} className={`chip ${x.id === id ? 'on' : ''}`} aria-pressed={x.id === id}
                style={{ ['--glaze' as string]: x.glaze }} onClick={() => choose(x.id)}>{x.name}</button>
            ))}
          </div>
          <BrickLadder maqam={shifted} active={inMaqam ? degree : null} showAjnas={false} onNote={(d) => playCents(tonic + m.steps[d])} />
          <div className="row">
            <span className={`in-maqam ${reading ? (inMaqam ? 'yes' : 'no') : ''}`}>
              {!reading ? '' : inMaqam ? 'داخل المقام' : `خارج المقام بـ ${Math.round(Math.abs(off))} سنت`}
            </span>
            <button className="btn btn-ghost" onClick={() => reading && setTonic(mod(Math.round(reading.cents / 50) * 50 + 500, 1200) - 500)}
              disabled={!reading}>اجعل نغمتي الحالية هي القرار</button>
            <button className="btn btn-ghost" onClick={() => { stopAll(); playCents(tonic, 0, 2.5); }}>اسمع القرار</button>
          </div>

          <section className="detect">
            <h2>أي مقام تغنّي؟</h2>
            <p>اضغط «ابدأ»، وغنِّ أو اعزف جملة تمرّ على معظم نغمات المقام وتنتهي على قراره، ثم اضغط «حلّل».</p>
            <div className="row">
              <button className={`rec ${detecting ? 'on' : ''}`} onClick={toggleDetect}>
                <span aria-hidden="true" />{detecting ? `حلّل (${heard ? notesCount(heard) : 'لا نغمات بعد'})` : 'ابدأ'}
              </button>
            </div>
            {found && found.length === 0 && <p className="hint">لم نسمع نغمات كافية. نحتاج أربع نغمات ثابتة على الأقل.</p>}
            {found && found.length > 0 && (
              <ol className="found">
                {found.map((f, i) => (
                  <li key={f.id} style={{ ['--glaze' as string]: byId[f.id].glaze }}>
                    <Link to={`/maqam/${f.id}`}>{byId[f.id].name}</Link>
                    <span>على {nameOf(f.tonic)}</span>
                    <div className="found-bar"><i style={{ width: `${Math.round(f.score * 100)}%` }} /></div>
                    {i === 0 && <button className="link-btn" onClick={() => { setId(f.id); setTonic(f.tonic > 700 ? f.tonic - 1200 : f.tonic); }}>اعرضه على السلّم</button>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
