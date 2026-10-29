import { degreeCents, intervalLabel, noteName, type Maqam } from '../lib/maqamat';

interface Props {
  maqam: Maqam;
  active?: number | null;       // degree index 0..7 currently sounding
  onNote?: (d: number) => void;
  showAjnas?: boolean;
  compact?: boolean;
}

/**
 * The signature element: a maqam drawn as a course of glazed bricks.
 * Each brick is one step of the scale and its width is the interval in cents,
 * so a quarter-tone step is visibly narrower than a whole tone.
 */
export default function BrickLadder({ maqam, active = null, onNote, showAjnas = true, compact = false }: Props) {
  const gaps = maqam.steps.slice(1).map((c, i) => c - maqam.steps[i]);
  return (
    <div className={`ladder ${compact ? 'compact' : ''}`} style={{ ['--glaze' as string]: maqam.glaze }}>
      <div className="ladder-notes" role="group" aria-label={`درجات مقام ${maqam.name}`}>
        {maqam.steps.map((c, d) => (
          <button
            key={d}
            type="button"
            className={`note ${active === d ? 'on' : ''}`}
            style={{ insetInlineStart: `${(c / 1200) * 100}%` }}
            onClick={() => onNote?.(d)}
            aria-label={`اعزف ${noteName(degreeCents(maqam, d))}`}
            aria-pressed={active === d}
          >
            <span className="note-dot" />
            {!compact && <span className="note-name">{noteName(degreeCents(maqam, d))}</span>}
          </button>
        ))}
      </div>
      <div className="bricks">
        {gaps.map((g, i) => (
          <div key={i} className="brick-cell" style={{ width: `${(g / 1200) * 100}%` }}>
            <div className={`brick w${g} ${active === i || active === i + 1 ? 'lit' : ''}`} title={intervalLabel(g)}>
              {!compact && <span>{intervalLabel(g)}</span>}
            </div>
          </div>
        ))}
      </div>
      {showAjnas && !compact && (
        <div className="ajnas" aria-label="الأجناس">
          {maqam.ajnas.map((j, i) => {
            const a = maqam.steps[j.from];
            const b = maqam.steps[Math.min(7, j.from + j.size - 1)];
            return (
              <div
                key={i}
                className={`jins j${i}`}
                style={{ insetInlineStart: `${(a / 1200) * 100}%`, width: `${((b - a) / 1200) * 100}%` }}
              >
                <span>جنس {j.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
