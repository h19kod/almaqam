/**
 * A small plucked-oud synth: Karplus-Strong strings rendered into cached
 * AudioBuffers, a resonant body filter, and a generated room reverb.
 */
import { byId, degreeCents, type MaqamId } from './maqamat';

const C3 = 130.8128;
export const centsToHz = (c: number) => C3 * Math.pow(2, c / 1200);

let ctx: AudioContext | null = null;
let master: GainNode;
let dry: GainNode;
const cache = new Map<number, AudioBuffer>();
let live: { src: AudioScheduledSourceNode; gain: GainNode }[] = [];
let timers: number[] = [];
let drone: { osc: OscillatorNode[]; gain: GainNode } | null = null;

function impulse(c: AudioContext, secs: number, decay: number) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function audio(): AudioContext {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  ctx = new AudioContext({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  // body: woody low-mid bump + soft top
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 240;
  body.Q.value = 1.1;
  body.gain.value = 5;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 3800;
  body.connect(top);
  top.connect(master);

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.2, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  top.connect(verb);
  verb.connect(wet);
  wet.connect(master);

  dry = ctx.createGain();
  dry.connect(body);
  return ctx;
}

/** Render a Karplus-Strong string (pure, testable). */
export function ksRender(hz: number, sr: number, len: number, rand: () => number = Math.random): Float32Array {
  const out = new Float32Array(len);
  // loop delay = N samples - 0.5 (averaging the two oldest taps) + allpass fraction
  const period = sr / hz;
  const N = Math.max(2, Math.floor(period + 0.4));
  const f = period + 0.5 - N; // 0.1 .. 1.1, kept away from 0 for allpass stability
  const C = (1 - f) / (1 + f);
  const ring = new Float32Array(N);
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const r = rand() * 2 - 1;
    ring[i] = r * 0.65 + prev * 0.35; // pick slightly away from the bridge
    prev = r;
  }
  const decay = 0.9965 - Math.min(0.006, hz / 140000);
  let idx = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % N];
    const avg = decay * 0.5 * (a + b);
    const y = C * avg + apX - C * apY; // first-order allpass for the fractional delay
    apX = avg;
    apY = y;
    ring[idx] = y;
    out[i] = a;
    idx = (idx + 1) % N;
  }
  for (let i = Math.max(0, len - 2000); i < len; i++) out[i] *= (len - i) / 2000;
  return out;
}

/** Cached pluck buffer by frequency (0.1 Hz resolution). */
function pluck(hz: number): AudioBuffer {
  const c = audio();
  const key = Math.round(hz * 10);
  const hit = cache.get(key);
  if (hit) return hit;
  const len = Math.floor(c.sampleRate * 2.6);
  const buf = c.createBuffer(1, len, c.sampleRate);
  buf.getChannelData(0).set(ksRender(hz, c.sampleRate, len));
  cache.set(key, buf);
  return buf;
}

export function prewarm(id: MaqamId) {
  const m = byId[id];
  const go = (d: number) => {
    if (d > 15) return;
    pluck(centsToHz(degreeCents(m, d)));
    setTimeout(() => go(d + 1), 0);
  };
  go(0);
}

/** Play one note. `when` is seconds from now. */
export function playCents(cents: number, when = 0, dur = 1.2, vel = 0.8) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = pluck(centsToHz(cents));
  const g = c.createGain();
  const t0 = c.currentTime + when;
  g.gain.setValueAtTime(vel, t0);
  g.gain.setTargetAtTime(0, t0 + Math.max(0.08, dur), 0.12);
  src.connect(g);
  g.connect(dry);
  src.start(t0);
  src.stop(t0 + dur + 1.2);
  const item = { src, gain: g };
  live.push(item);
  src.onended = () => {
    live = live.filter((x) => x !== item);
  };
}

export function stopAll() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const { src, gain } of live) {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.03);
    try { src.stop(now + 0.2); } catch { /* already stopped */ }
  }
  live = [];
}

export interface SeqNote { d: number; t: number; l: number }

/** Play a sequence of degree notes; onStep fires as each note sounds; resolves when done. */
export function playSequence(id: MaqamId, notes: SeqNote[], onStep?: (i: number, n: SeqNote) => void,
  tonic?: number): Promise<void> {
  stopAll();
  const m = tonic === undefined ? byId[id] : { ...byId[id], tonic };
  audio();
  return new Promise((resolve) => {
    notes.forEach((n, i) => {
      playCents(degreeCents(m, n.d), n.t / 1000 + 0.05, Math.max(0.15, n.l / 1000), 0.75 + Math.random() * 0.1);
      if (onStep) timers.push(window.setTimeout(() => onStep(i, n), n.t + 50));
    });
    const end = notes.length ? Math.max(...notes.map((n) => n.t + n.l)) : 0;
    timers.push(window.setTimeout(resolve, end + 300));
  });
}

export function scaleNotes(direction: 'up' | 'down' | 'both' = 'both', gap = 380): SeqNote[] {
  const up = [0, 1, 2, 3, 4, 5, 6, 7];
  const seq = direction === 'up' ? up : direction === 'down' ? [...up].reverse() : [...up, ...up.slice(0, -1).reverse()];
  return seq.map((d, i) => ({ d, t: i * gap, l: gap * (i === seq.length - 1 ? 3 : 1.6) }));
}

/** A short characteristic phrase, built from the maqam's ajnas. */
export function examplePhrase(id: MaqamId): SeqNote[] {
  const m = byId[id];
  const j1 = m.ajnas[0].size;
  const shape = [0, 1, 2, 1, 0, 1, 2, Math.min(3, j1 - 1), 2, 1, 4, 3, 2, 1, 2, 1, 0];
  const beats = [1, .5, .5, .5, .5, .5, .5, 1, .5, .5, 1.5, .5, .5, .5, .5, .5, 2.5];
  const beat = 330;
  let t = 0;
  return shape.map((d, i) => {
    const n = { d, t, l: beats[i] * beat * 1.4 };
    t += beats[i] * beat;
    return n;
  });
}

export function setDrone(id: MaqamId | null) {
  const c = audio();
  if (drone) {
    const old = drone;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.3);
    setTimeout(() => old.osc.forEach((o) => o.stop()), 1500);
    drone = null;
  }
  if (!id) return;
  const hz = centsToHz(byId[id].tonic) / 2;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.05, c.currentTime, 0.6);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const osc = [hz, hz * 1.5, hz * 2.003].map((f, i) => {
    const o = c.createOscillator();
    o.type = i === 0 ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    o.connect(lp);
    o.start();
    return o;
  });
  lp.connect(gain);
  gain.connect(master);
  drone = { osc, gain };
}
