import type { SeqNote } from '../lib/audio';

/** A tiny piano roll. Time runs right to left, like the text around it. */
export default function Roll({ notes, glaze, active = -1, height = 90, label }: {
  notes: SeqNote[]; glaze: string; active?: number; height?: number; label?: string;
}) {
  const end = Math.max(1000, ...notes.map((n) => n.t + n.l));
  const maxD = Math.max(7, ...notes.map((n) => n.d));
  const W = 600;
  const rowH = height / (maxD + 2);
  return (
    <svg className="roll" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={label ?? `مخطط ${notes.length} نغمة`}>
      {Array.from({ length: maxD + 1 }, (_, d) => (
        <line key={d} x1="0" x2={W} y1={height - (d + 1) * rowH} y2={height - (d + 1) * rowH}
          className={d % 7 === 0 ? 'roll-tonic' : 'roll-line'} />
      ))}
      {notes.map((n, i) => {
        const w = Math.max(4, (n.l / end) * W * 0.85);
        const x = W - (n.t / end) * W - w;
        return (
          <rect key={i} x={x} y={height - (n.d + 1) * rowH - rowH * 0.4} width={w} height={rowH * 0.8} rx={2}
            fill={glaze} opacity={i === active ? 1 : 0.78} className={i === active ? 'roll-on' : ''} />
        );
      })}
    </svg>
  );
}
