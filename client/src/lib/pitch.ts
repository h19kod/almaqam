/** Pitch tracking (YIN) and maqam detection from sung or played notes. */
import { MAQAMAT, type MaqamId } from './maqamat';

const C3 = 130.8128;
export const hzToCents = (hz: number) => 1200 * Math.log2(hz / C3);

/**
 * YIN fundamental-frequency estimate. Returns null for silence or noise.
 * de Cheveigné & Kawahara (2002), steps 2–5.
 */
export function yin(buf: Float32Array, sr: number, minHz = 70, maxHz = 1100, threshold = 0.12): { hz: number; clarity: number } | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;

  const maxTau = Math.min(Math.floor(sr / minHz), Math.floor(buf.length / 2));
  const minTau = Math.floor(sr / maxHz);
  const W = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation
  const a = d[tau - 1] ?? d[tau];
  const b = d[tau];
  const c = d[tau + 1] ?? d[tau];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { hz: sr / (tau + (Number.isFinite(shift) ? shift : 0)), clarity: 1 - b };
}

/** Collapses a stream of pitch frames into steady notes. */
export class NoteSegmenter {
  private cur: { cents: number[]; start: number } | null = null;
  notes: { cents: number; ms: number }[] = [];
  constructor(private minMs = 140, private tolerance = 35) {}

  push(cents: number | null, now: number) {
    const c = this.cur;
    if (cents !== null && c) {
      const mean = c.cents.reduce((a, b) => a + b, 0) / c.cents.length;
      if (Math.abs(cents - mean) <= this.tolerance) {
        c.cents.push(cents);
        return;
      }
    }
    this.close(now);
    if (cents !== null) this.cur = { cents: [cents], start: now };
  }

  close(now: number) {
    const c = this.cur;
    this.cur = null;
    if (!c || now - c.start < this.minMs) return;
    const sorted = [...c.cents].sort((a, b) => a - b);
    this.notes.push({ cents: sorted[Math.floor(sorted.length / 2)], ms: now - c.start });
  }
}

export interface Detection { id: MaqamId; tonic: number; score: number }

const mod = (x: number, m: number) => ((x % m) + m) % m;

/**
 * Rank maqamat for a set of notes (cents above C3). Every maqam is tried on
 * every quarter-tone tonic; a candidate scores by how much of the sung time
 * falls on its scale, how much of its scale was used, and whether the
 * phrase rests on its tonic (last and lowest notes).
 */
export function detectMaqam(notes: { cents: number; ms: number }[]): Detection[] {
  if (notes.length < 4) return [];
  const bins = new Float32Array(24);
  let total = 0;
  for (const n of notes) {
    bins[mod(Math.round(n.cents / 50), 24)] += n.ms;
    total += n.ms;
  }
  const last = mod(Math.round(notes[notes.length - 1].cents / 50), 24);
  const lowest = mod(Math.round(Math.min(...notes.map((n) => n.cents)) / 50), 24);
  const used = bins.filter((b) => b > total * 0.03).length;

  const results: Detection[] = [];
  for (const m of MAQAMAT) {
    const pcs = m.steps.slice(0, 7).map((s) => s / 50);
    let best: Detection | null = null;
    for (let t = 0; t < 24; t++) {
      const set = new Set(pcs.map((p) => mod(t + p, 24)));
      let inside = 0;
      let covered = 0;
      for (const p of set) {
        inside += bins[p];
        if (bins[p] > total * 0.03) covered++;
      }
      let score = (inside / total) * 0.6 + (covered / Math.max(used, 7)) * 0.25;
      if (last === t) score += 0.1;
      if (lowest === t) score += 0.05;
      if (!best || score > best.score) best = { id: m.id, tonic: t * 50, score };
    }
    results.push(best!);
  }
  return results.sort((a, b) => b.score - a.score);
}
