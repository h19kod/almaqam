import { describe, expect, it } from 'vitest';
import { centsToHz, ksRender } from '../src/lib/audio';
import { LESSONS } from '../src/lib/lessons';
import { links } from '../src/lib/map';
import { MAQAMAT, byId, degreeCents } from '../src/lib/maqamat';
import { NoteSegmenter, detectMaqam, hzToCents, yin } from '../src/lib/pitch';
import { encodeWav, renderMix } from '../src/lib/wav';

const sine = (hz: number, sr: number, n: number) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr));

describe('yin pitch tracking', () => {
  it.each([110, 196, 262.4, 440, 700])('finds %f Hz within 5 cents', (hz) => {
    const r = yin(sine(hz, 48000, 2048), 48000);
    expect(r).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(r!.hz / hz))).toBeLessThan(5);
  });
  it('tracks a plucked string, not just a sine', () => {
    const hz = centsToHz(350);
    const buf = ksRender(hz, 48000, 48000).slice(4800, 4800 + 2048);
    const r = yin(buf, 48000)!;
    expect(Math.abs(1200 * Math.log2(r.hz / hz))).toBeLessThan(8);
  });
  it('stays quiet on silence', () => {
    expect(yin(new Float32Array(2048), 48000)).toBeNull();
  });
});

describe('note segmentation', () => {
  it('turns frames into steady notes and drops blips', () => {
    const s = new NoteSegmenter(140, 35);
    let t = 0;
    const feed = (c: number | null, frames: number) => { for (let i = 0; i < frames; i++) { s.push(c, t); t += 20; } };
    feed(200, 15); feed(560, 2); feed(350, 15); feed(null, 3);
    expect(s.notes.map((n) => n.cents)).toEqual([200, 350]);
  });
});

describe('maqam detection', () => {
  const sing = (id: keyof typeof byId, shift = 0) => {
    const m = byId[id];
    const ds = [0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
    return ds.map((d) => ({ cents: degreeCents(m, d) + shift, ms: 300 }));
  };
  it.each(MAQAMAT.map((m) => m.id))('recognises %s sung from its own tonic', (id) => {
    expect(detectMaqam(sing(id))[0].id).toBe(id);
  });
  it('is key independent', () => {
    const r = detectMaqam(sing('hijaz', 500));
    expect(r[0].id).toBe('hijaz');
    expect(r[0].tonic).toBe((byId.hijaz.tonic + 500 + 1200) % 1200);
  });
  it('needs a few notes before guessing', () => {
    expect(detectMaqam([{ cents: 0, ms: 300 }])).toEqual([]);
  });
});

describe('wav export', () => {
  it('renders, normalises and writes a valid header', () => {
    const mix = renderMix('rast', [{ d: 0, t: 0, l: 300 }, { d: 4, t: 300, l: 300 }], 22050);
    expect(mix.length).toBeGreaterThan(22050);
    expect(Math.max(...mix.map(Math.abs))).toBeCloseTo(0.89, 2);
    const v = new DataView(encodeWav(mix, 22050));
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(mix.length * 2);
  });
});

describe('maqam map', () => {
  it('links rast and sikah, which share every note', () => {
    const l = links().find((x) => (x.a === 'rast' && x.b === 'sikah') || (x.a === 'sikah' && x.b === 'rast'))!;
    expect(l.shared.length).toBe(7);
  });
  it('kurd on دوكاه and ajam on عجم عشيران share all seven notes', () => {
    expect(links().find((x) => [x.a, x.b].sort().join() === 'ajam,kurd')!.shared.length).toBe(7);
  });
});

describe('lessons', () => {
  it('brick answers point at bricks that exist and quiz options include the right maqam', () => {
    for (const l of LESSONS) for (const q of l.quiz) {
      if (q.kind === 'brick') expect(q.answer).toBeLessThan(7);
      if (q.kind === 'maqam') expect(q.options).toContain(q.play);
      if (q.kind === 'choice') expect(q.options[q.answer]).toBeTruthy();
    }
  });
  it('hzToCents inverts centsToHz', () => {
    expect(hzToCents(centsToHz(737))).toBeCloseTo(737, 6);
  });
});
