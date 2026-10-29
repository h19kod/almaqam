import { describe, expect, it } from 'vitest';
import { centsToHz, ksRender, scaleNotes } from '../src/lib/audio';
import { MAQAMAT, degreeCents, noteName } from '../src/lib/maqamat';

/** Estimate pitch by autocorrelation over a window of the sustained part. */
function pitch(x: Float32Array, sr: number, lo = 60, hi = 1200): number {
  const start = Math.floor(sr * 0.2);
  const w = 4096;
  let best = 0;
  let bestLag = 0;
  const corr = (lag: number) => {
    let s = 0;
    for (let i = 0; i < w; i++) s += x[start + i] * x[start + i + lag];
    return s;
  };
  for (let lag = Math.floor(sr / hi); lag <= Math.ceil(sr / lo); lag++) {
    const s = corr(lag);
    if (s > best) { best = s; bestLag = lag; }
  }
  // parabolic interpolation around the peak
  const a = corr(bestLag - 1), b = corr(bestLag), c = corr(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sr / (bestLag + shift);
}

const seeded = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

describe('oud string tuning', () => {
  it.each([0, 150, 350, 550, 850, 1050, 1550, 2250])('is within 4 cents at %i cents', (c) => {
    const hz = centsToHz(c);
    const sr = 48000;
    const est = pitch(ksRender(hz, sr, sr, seeded()), sr);
    expect(Math.abs(1200 * Math.log2(est / hz))).toBeLessThan(4);
  });

  it('separates a quarter tone clearly (سيكاه vs بوسليك)', () => {
    const sr = 48000;
    const a = pitch(ksRender(centsToHz(350), sr, sr, seeded()), sr);
    const b = pitch(ksRender(centsToHz(400), sr, sr, seeded()), sr);
    expect(1200 * Math.log2(b / a)).toBeGreaterThan(45);
  });
});

describe('maqam data', () => {
  it('every maqam spans one octave in 7 steps', () => {
    for (const m of MAQAMAT) {
      expect(m.steps).toHaveLength(8);
      expect(m.steps[0]).toBe(0);
      expect(m.steps[7]).toBe(1200);
      for (let i = 1; i < 8; i++) expect(m.steps[i]).toBeGreaterThan(m.steps[i - 1]);
    }
  });
  it('every degree of every maqam has an Arabic note name', () => {
    for (const m of MAQAMAT) for (let d = 0; d <= 15; d++) expect(noteName(degreeCents(m, d)), `${m.id} ${d}`).not.toBe('');
  });
  it('scale playback goes up and back down', () => {
    const s = scaleNotes('both');
    expect(s.map((n) => n.d)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

import { duration, notesCount } from '../src/lib/maqamat';
describe('arabic counts', () => {
  it('agrees with the number', () => {
    expect(notesCount(1)).toBe('نغمة واحدة');
    expect(notesCount(2)).toBe('نغمتان');
    expect(notesCount(6)).toBe('6 نغمات');
    expect(notesCount(14)).toBe('14 نغمة');
    expect(duration(300)).toBe('أقل من ثانية');
    expect(duration(7000)).toBe('7 ثوانٍ');
  });
});
