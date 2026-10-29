/** Render a composition to a WAV file entirely in JS (no audio device needed). */
import { centsToHz, ksRender, type SeqNote } from './audio';
import { byId, degreeCents, type MaqamId } from './maqamat';

export function renderMix(id: MaqamId, notes: SeqNote[], sr = 44100): Float32Array {
  const m = byId[id];
  const tail = 1.4;
  const end = Math.max(...notes.map((n) => n.t + n.l)) / 1000 + tail;
  const out = new Float32Array(Math.ceil(end * sr));
  const cache = new Map<number, Float32Array>();
  for (const n of notes) {
    const hz = centsToHz(degreeCents(m, n.d));
    const key = Math.round(hz * 10);
    let s = cache.get(key);
    if (!s) {
      s = ksRender(hz, sr, Math.floor(sr * 2.6));
      cache.set(key, s);
    }
    const start = Math.floor((n.t / 1000) * sr);
    const hold = Math.floor((Math.max(150, n.l) / 1000) * sr);
    const release = Math.floor(0.12 * sr);
    const len = Math.min(s.length, hold + release * 4, out.length - start);
    for (let i = 0; i < len; i++) {
      const env = i < hold ? 1 : Math.exp(-(i - hold) / release);
      out[start + i] += s[i] * env * 0.8;
    }
  }
  // gentle body: one-pole lowpass around 4 kHz, then normalise to -1 dBFS
  const a = Math.exp((-2 * Math.PI * 4000) / sr);
  let y = 0;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    y = (1 - a) * out[i] + a * y;
    out[i] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  const g = peak ? 0.89 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

export function encodeWav(samples: Float32Array, sr = 44100): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);  // PCM
  v.setUint16(22, 1, true);  // mono
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export function downloadWav(id: MaqamId, notes: SeqNote[], title: string) {
  const blob = new Blob([encodeWav(renderMix(id, notes))], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'maqam'}.wav`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
