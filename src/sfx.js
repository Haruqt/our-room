/**
 * Little sounds, made on the spot with the Web Audio API — no files to load.
 *
 *   click()   the light switch
 *   chime()   a computer starting up
 *   cork()    the bottle's cork coming out
 *   seal()    wax pressed onto a time capsule
 *   ding()    an achievement
 *   pop()     a soft tap
 *
 * Off with setSoundOn(false) (remembered). Browsers only allow sound after the
 * first tap or click on the page, so anything before that is silently skipped.
 */
let ctx = null;
let master = null;
let on = (() => { try { return localStorage.getItem('ourroom_sfx') !== 'off'; } catch(_){ return true; } })();

export const soundOn = () => on;
export function setSoundOn(v){
  on = Boolean(v);
  try { localStorage.setItem('ourroom_sfx', on ? 'on' : 'off'); } catch(_){}
}

function ac(){
  if (!on) return null;
  if (!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx.state === 'running' || ctx.state === 'suspended' ? ctx : null;
}
// wake the audio up on the first touch, so the first sound isn't lost
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { if (on) ac(); }, { once: true, passive: true }));

function env(g, t, a, peak, d){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone({ type = 'sine', f, f2 = null, t = 0, a = 0.005, d = 0.2, v = 0.3, q = null, to = master }){
  const c = ac(); if (!c) return;
  const now = c.currentTime + t;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  env(g, now, a, v, d);
  let node = o;
  if (q){ const bq = c.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = q; o.connect(bq); node = bq; }
  node.connect(g); g.connect(to);
  o.start(now); o.stop(now + a + d + 0.05);
}

function noise({ t = 0, d = 0.05, v = 0.2, hp = 800, lp = 8000 }){
  const c = ac(); if (!c) return;
  const now = c.currentTime + t;
  const len = Math.ceil(c.sampleRate * (d + 0.02));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
  const g = c.createGain(); g.gain.value = v;
  src.connect(h); h.connect(l); l.connect(g); g.connect(master);
  src.start(now);
}

/** A wall switch: the plastic snap and the little thump behind it. */
export function click(){
  noise({ d: 0.018, v: 0.5, hp: 2200, lp: 9000 });
  tone({ type: 'triangle', f: 180, f2: 70, d: 0.06, v: 0.35 });
  noise({ t: 0.03, d: 0.012, v: 0.18, hp: 3000 });
}

/** A computer waking up: a warm rising chord. */
export function chime(){
  const notes = [523.25, 659.25, 783.99, 1046.5];      // C E G C
  notes.forEach((f, i) => {
    tone({ type: 'sine', f, t: i * 0.11, a: 0.03, d: 1.3 - i * 0.12, v: 0.16 });
    tone({ type: 'triangle', f: f / 2, t: i * 0.11, a: 0.05, d: 1.0, v: 0.05, q: 1200 });
  });
  tone({ type: 'sine', f: 1568, t: 0.46, a: 0.02, d: 0.9, v: 0.05 });
}

/** The cork: a hollow pop, falling in pitch, and a breath of air. */
export function cork(){
  tone({ type: 'sine', f: 720, f2: 160, a: 0.003, d: 0.09, v: 0.5 });
  noise({ d: 0.03, v: 0.25, hp: 400, lp: 3000 });
  noise({ t: 0.05, d: 0.25, v: 0.05, hp: 1500, lp: 6000 });
}

/** Wax on paper: a soft low press. */
export function seal(){
  tone({ type: 'triangle', f: 140, f2: 60, a: 0.01, d: 0.22, v: 0.35, q: 700 });
  noise({ d: 0.08, v: 0.12, hp: 200, lp: 1800 });
}

/** An achievement: two bright bells. */
export function ding(){
  tone({ type: 'sine', f: 1318.5, a: 0.004, d: 0.6, v: 0.18 });
  tone({ type: 'sine', f: 1975.5, t: 0.09, a: 0.004, d: 0.8, v: 0.14 });
  tone({ type: 'sine', f: 2637, t: 0.09, a: 0.004, d: 0.5, v: 0.04 });
}

export function pop(){ tone({ type: 'sine', f: 600, f2: 900, a: 0.004, d: 0.06, v: 0.12 }); }

/* ---------- the cat ---------- */

/** A meow: a voice that rises then falls, shaped by two moving "mouth" filters. */
export function meow({ pitch = 1, len = 0.55, sad = false } = {}){
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  const f0 = 520 * pitch;
  o.frequency.setValueAtTime(f0 * 0.82, t);
  o.frequency.exponentialRampToValueAtTime(f0 * (sad ? 1.0 : 1.18), t + len * 0.35);
  o.frequency.exponentialRampToValueAtTime(f0 * (sad ? 0.62 : 0.74), t + len);
  const vib = c.createOscillator(); vib.frequency.value = 6; const vg = c.createGain(); vg.gain.value = f0 * 0.02;
  vib.connect(vg); vg.connect(o.frequency);
  const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
  f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1500, t + len * 0.4); f1.frequency.linearRampToValueAtTime(800, t + len);
  const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
  f2.frequency.setValueAtTime(1900, t); f2.frequency.linearRampToValueAtTime(2700, t + len * 0.4); f2.frequency.linearRampToValueAtTime(1600, t + len);
  const g = c.createGain(); env(g, t, 0.06, 0.32, len);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master);
  o.start(t); vib.start(t); o.stop(t + len + 0.1); vib.stop(t + len + 0.1);
}

/** A purr: a low rumble that pulses about 25 times a second. */
export function purr(seconds = 2.2){
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  const len = Math.ceil(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++){
    const s = i / c.sampleRate;
    const pulse = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * 25 * s)), 3);
    const breath = 0.55 + 0.45 * Math.sin(Math.PI * 2 * s / 1.1);
    d[i] = (Math.random() * 2 - 1) * pulse * breath;
  }
  const src = c.createBufferSource(); src.buffer = buf;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.25);
  g.gain.setValueAtTime(0.9, t + seconds - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + seconds);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(t);
}

/** A hiss: breathy noise, quick in and slowly out. */
export function hiss(){
  noise({ d: 0.7, v: 0.32, hp: 2500, lp: 9000 });
}

/** Kibble poured into a bowl. */
export function pour(){
  for (let i = 0; i < 14; i++) noise({ t: i * 0.045 + Math.random() * 0.03, d: 0.02, v: 0.12 + Math.random() * 0.1, hp: 1800, lp: 7000 });
  tone({ type: 'triangle', f: 900, t: 0.02, d: 0.25, v: 0.05 });
}

/** Little crunches while it eats. */
export function crunch(){
  for (let i = 0; i < 3; i++) noise({ t: i * 0.16, d: 0.03, v: 0.12, hp: 900, lp: 5000 });
}

/** Soft paws landing after a jump. */
export function thump(strength = 1){
  tone({ type: 'sine', f: 110, f2: 55, a: 0.004, d: 0.09, v: 0.22 * strength });
  noise({ d: 0.04, v: 0.06 * strength, hp: 150, lp: 900 });
}