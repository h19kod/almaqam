/** Which maqamat sit close to each other: shared pitches at their usual tonics. */
import { MAQAMAT, degreeCents, noteName, type Maqam, type MaqamId } from './maqamat';

export interface Link { a: MaqamId; b: MaqamId; shared: number[]; sameTonic: boolean }

const pcs = (m: Maqam) => new Set(Array.from({ length: 7 }, (_, d) => ((degreeCents(m, d) % 1200) + 1200) % 1200));

export function links(min = 6): Link[] {
  const out: Link[] = [];
  for (let i = 0; i < MAQAMAT.length; i++) {
    for (let j = i + 1; j < MAQAMAT.length; j++) {
      const a = MAQAMAT[i];
      const b = MAQAMAT[j];
      const sb = pcs(b);
      const shared = [...pcs(a)].filter((p) => sb.has(p)).sort((x, y) => x - y);
      if (shared.length >= min) out.push({ a: a.id, b: b.id, shared, sameTonic: (a.tonic - b.tonic) % 1200 === 0 });
    }
  }
  return out;
}

export const sharedNames = (l: Link) => l.shared.map((c) => noteName(c));
