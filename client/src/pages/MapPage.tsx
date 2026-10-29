import { useState } from 'react';
import { Link } from 'react-router-dom';
import { examplePhrase, playSequence, scaleNotes, stopAll } from '../lib/audio';
import { links, sharedNames, type Link as MLink } from '../lib/map';
import { MAQAMAT, byId, type MaqamId } from '../lib/maqamat';

const LINKS = links(6);
const R = 210;
const C = 260;
const pos = Object.fromEntries(MAQAMAT.map((m, i) => {
  const a = -Math.PI / 2 + (i / MAQAMAT.length) * Math.PI * 2;
  return [m.id, { x: C - Math.cos(a) * R, y: C + Math.sin(a) * R }];
})) as Record<MaqamId, { x: number; y: number }>;

export default function MapPage() {
  const [sel, setSel] = useState<MaqamId>('bayati');
  const [playing, setPlaying] = useState<string | null>(null);
  const near = LINKS.filter((l) => l.a === sel || l.b === sel).sort((x, y) => y.shared.length - x.shared.length);

  async function journey(l: MLink) {
    const key = `${l.a}-${l.b}`;
    if (playing === key) { stopAll(); setPlaying(null); return; }
    const from = sel;
    const to = l.a === sel ? l.b : l.a;
    setPlaying(key);
    await playSequence(from, scaleNotes('up', 300));
    if (!document.hidden) await playSequence(to, examplePhrase(to));
    setPlaying((p) => (p === key ? null : p));
  }

  return (
    <div className="wrap page map">
      <h1 className="page-title">خريطة المقامات</h1>
      <p className="page-lede">
        العازف ينتقل من مقام إلى آخر عبر النغمات المشتركة بينهما. الخطوط تربط كل مقامين يشتركان في ست نغمات أو أكثر من سبع
        على قرارَيهما المعتادين، وكلما غلُظ الخط زاد المشترك. اختر مقاماً لترى جيرانه.
      </p>
      <div className="map-grid">
        <svg viewBox="0 0 520 520" className="map-svg" role="img" aria-label="شبكة القرابة بين المقامات">
          {LINKS.map((l) => {
            const on = l.a === sel || l.b === sel;
            return (
              <line key={`${l.a}${l.b}`} x1={pos[l.a].x} y1={pos[l.a].y} x2={pos[l.b].x} y2={pos[l.b].y}
                className={`map-edge ${on ? 'on' : ''}`} strokeWidth={(l.shared.length - 4) * (on ? 2.4 : 1.4)} />
            );
          })}
          {MAQAMAT.map((m) => (
            <g key={m.id} className={`map-node ${sel === m.id ? 'on' : ''}`} transform={`translate(${pos[m.id].x} ${pos[m.id].y})`}
              onClick={() => setSel(m.id)} role="button" tabIndex={0} aria-pressed={sel === m.id}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(m.id); } }}
              aria-label={m.name}>
              <rect x={-46} y={-22} width={92} height={44} rx={4} fill={m.glaze} />
              <text textAnchor="middle" dy="8">{m.name}</text>
            </g>
          ))}
        </svg>
        <div className="map-side" style={{ ['--glaze' as string]: byId[sel].glaze }}>
          <h2><Link to={`/maqam/${sel}`}>{byId[sel].name}</Link></h2>
          <p className="map-mood">{byId[sel].mood}</p>
          {near.length === 0 && <p className="hint">لا يشترك في ست نغمات مع غيره على قراره المعتاد.</p>}
          <ul className="neighbours">
            {near.map((l) => {
              const other = l.a === sel ? l.b : l.a;
              const key = `${l.a}-${l.b}`;
              return (
                <li key={key} style={{ ['--glaze' as string]: byId[other].glaze }}>
                  <div className="nb-head">
                    <button className="nb-name" onClick={() => setSel(other)}>{byId[other].name}</button>
                    <span>{l.shared.length === 7 ? 'النغمات نفسها كلها' : `${l.shared.length} نغمات مشتركة`}</span>
                  </div>
                  <p className="nb-notes">{sharedNames(l).join('، ')}</p>
                  <button className="btn btn-ghost btn-small" onClick={() => journey(l)}>
                    {playing === key ? 'إيقاف' : `اسمع الانتقال إلى ${byId[other].name}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="hint">
        مقامان بالنغمات نفسها، كالراست والسيكاه، يختلفان في القرار وفي النغمة التي يستقر عليها الغناء. لهذا لا تكفي النغمات وحدها لتعريف المقام.
      </p>
    </div>
  );
}
