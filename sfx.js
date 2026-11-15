// Synthesized sound effects (Web Audio) — no audio files needed.
// Every sound takes an optional `pan` (-1 left … 1 right) and `power` (0…1+).

let ctx = null, master = null, ambGain = null, noiseBuf = null, verb = null;
let muted = false;
try { muted = localStorage.getItem('takraw-muted') === '1'; } catch {}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // generated arena reverb (decaying stereo noise impulse)
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verb = ctx.createGain(); verb.gain.value = 0.22;
    verb.connect(conv); conv.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// browsers only allow audio after a user gesture
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => ensure(), { capture: true });

function out(pan = 0) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  if (verb) p.connect(verb);
  return p;
}
const vary = (f, amt = 0.05) => f * (1 + (Math.random() - 0.5) * amt);   // tiny pitch wobble so repeats never sound identical

function tone({ f = 440, f2 = null, dur = 0.1, type = 'sine', gain = 0.3, attack = 0.003, delay = 0, pan = 0, vib = 0, vibRate = 30 }) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  const k = vary(1);
  o.frequency.setValueAtTime(f * k, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2 * k), t + dur);
  if (vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = vibRate; lg.gain.value = vib;
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(pan));
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.1, type = 'bandpass', f = 1000, f2 = null, q = 1, gain = 0.3, attack = 0.002, delay = 0, pan = 0 }) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(flt); flt.connect(g); g.connect(out(pan));
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

function startAmbience() {
  // distant riverside crowd + city hum, very quiet
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
  ambGain = ctx.createGain(); ambGain.gain.value = 0.05;
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  s.connect(lp); lp.connect(ambGain);
  s.connect(bp); bp.connect(g2); g2.connect(ambGain);
  // slow swell so it breathes
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.07; lg.gain.value = 0.02;
  lfo.connect(lg); lg.connect(ambGain.gain); lfo.start();
  ambGain.connect(master);
  s.start();
}

export const sfx = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem('takraw-muted', v ? '1' : '0'); } catch {}
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.02);
  },
  unlock: ensure,

  // ---- ball contacts ----
  kick(power = 0.6, pan = 0) {   // inside foot / instep: sub thump + rattan "tock" + crunchy click
    tone({ f: 150, f2: 48, dur: 0.16, gain: 0.6 + power * 0.4, pan });
    tone({ f: 70, f2: 38, dur: 0.22, gain: 0.35 + power * 0.35, pan });                 // sub
    noise({ dur: 0.035, f: 2600, q: 1.2, gain: 0.4 + power * 0.3, pan });
    noise({ dur: 0.08, type: 'highpass', f: 4500, gain: 0.12 + power * 0.12, pan });    // air
    tone({ f: 980, f2: 620, dur: 0.07, type: 'triangle', gain: 0.24, pan });
  },
  set(pan = 0) {                 // soft touch
    tone({ f: 560, f2: 430, dur: 0.07, type: 'triangle', gain: 0.28, pan });
    tone({ f: 120, f2: 80, dur: 0.09, gain: 0.35, pan });
    noise({ dur: 0.03, f: 1800, gain: 0.15, pan });
  },
  head(pan = 0) {
    tone({ f: 320, f2: 200, dur: 0.09, type: 'triangle', gain: 0.3, pan });
    noise({ dur: 0.04, f: 1200, gain: 0.2, pan });
  },
  chest(pan = 0) {
    tone({ f: 95, f2: 55, dur: 0.17, gain: 0.55, pan });
    noise({ dur: 0.08, type: 'lowpass', f: 700, gain: 0.3, pan });
  },
  spike(power = 1, pan = 0) {    // big crack + whoosh
    tone({ f: 170, f2: 38, dur: 0.28, gain: 0.95, pan });
    tone({ f: 60, f2: 30, dur: 0.4, gain: 0.6, pan });                                   // sub boom
    noise({ dur: 0.07, type: 'highpass', f: 2800, gain: 0.7 * power, pan });
    noise({ dur: 0.3, f: 700, f2: 3200, q: 0.8, gain: 0.28, attack: 0.02, pan });
    tone({ f: 1200, f2: 700, dur: 0.08, type: 'square', gain: 0.07, pan });
  },
  body(pan = 0) {
    tone({ f: 110, f2: 70, dur: 0.12, gain: 0.4, pan });
    noise({ dur: 0.06, type: 'lowpass', f: 500, gain: 0.25, pan });
  },
  toss(pan = 0) { noise({ dur: 0.22, f: 500, f2: 1600, q: 0.9, gain: 0.12, attack: 0.03, pan }); },
  machine(pan = 0) {             // ball-machine launch "fwump"
    tone({ f: 80, f2: 45, dur: 0.18, gain: 0.5, pan });
    noise({ dur: 0.2, f: 300, f2: 1400, gain: 0.25, pan });
  },

  // ---- ball vs world ----
  net(pan = 0) {
    noise({ dur: 0.28, f: 380, q: 0.7, gain: 0.45, pan });
    for (let i = 0; i < 3; i++) noise({ dur: 0.05, f: 900 + i * 300, q: 2, gain: 0.12, delay: 0.04 + i * 0.05, pan });
  },
  tape(pan = 0) { tone({ f: 1900, dur: 0.035, type: 'square', gain: 0.08, pan }); noise({ dur: 0.1, f: 500, gain: 0.2, pan }); },
  bounce(power = 0.5, pan = 0) {
    tone({ f: 130, f2: 70, dur: 0.1, gain: 0.15 + power * 0.45, pan });
    tone({ f: 55, f2: 35, dur: 0.18, gain: 0.1 + power * 0.4, pan });
    noise({ dur: 0.05, type: 'lowpass', f: 1400, gain: 0.1 + power * 0.25, pan });
  },
  board(pan = 0) { tone({ f: 90, f2: 60, dur: 0.2, type: 'square', gain: 0.12, pan }); noise({ dur: 0.12, type: 'lowpass', f: 600, gain: 0.35, pan }); },

  // ---- player ----
  jump() { tone({ f: 1500, f2: 2300, dur: 0.05, gain: 0.05 }); tone({ f: 120, f2: 70, dur: 0.07, gain: 0.18 }); },
  land() { tone({ f: 100, f2: 60, dur: 0.07, gain: 0.15 }); },

  swing() { noise({ dur: 0.14, f: 600, f2: 2400, q: 0.9, gain: 0.16, attack: 0.01 }); },
  // rising hum while you hold a charge; returns a stop() function
  charge() {
    if (!ensure()) return () => {};
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine';
    o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(520, t + 0.5);
    o2.frequency.setValueAtTime(360, t); o2.frequency.linearRampToValueAtTime(1040, t + 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    // short swell that fades out on its own — it can never drone on, even if a charge is held for ages
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.08);
    g.gain.setValueAtTime(0.045, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out(0));
    o.start(t); o2.start(t);
    o.stop(t + 1.5); o2.stop(t + 1.5);   // hard stop no matter what
    let stopped = false;
    return () => {
      if (stopped) return; stopped = true;
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.05);
      try { o.stop(n + 0.06); o2.stop(n + 0.06); } catch {}
    };
  },

  // ---- feedback cues ----
  perfect() {                    // bright sparkly arpeggio
    [1320, 1660, 1980, 2640].forEach((f, i) => tone({ f, dur: 0.28, gain: 0.09 - i * 0.012, delay: i * 0.035, type: i % 2 ? 'triangle' : 'sine' }));
    noise({ dur: 0.25, type: 'highpass', f: 7000, gain: 0.05, attack: 0.02 });
  },
  good() { tone({ f: 990, dur: 0.1, gain: 0.07 }); },
  miss() { tone({ f: 210, f2: 140, dur: 0.14, type: 'square', gain: 0.07 }); },
  cue() { tone({ f: 2100, dur: 0.03, gain: 0.035 }); },                 // ball is in your sweet spot
  touch(n) {                                                             // touch counter
    tone({ f: 520 + n * 180, dur: 0.06, gain: 0.07, delay: 0.05 });
    if (n >= 3) tone({ f: 520 + n * 180, dur: 0.06, gain: 0.07, delay: 0.14 });
  },
  yourServe() { tone({ f: 660, dur: 0.1, gain: 0.08 }); tone({ f: 990, dur: 0.16, gain: 0.08, delay: 0.1 }); },
  whistle() {
    tone({ f: 2700, dur: 0.16, gain: 0.13, vib: 70, vibRate: 34 });
    tone({ f: 2700, dur: 0.38, gain: 0.13, vib: 70, vibRate: 34, delay: 0.22 });
  },
  cheer(big = 1) {
    noise({ dur: 1.6, f: 1100, q: 0.5, gain: 0.22 * big, attack: 0.15 });
    noise({ dur: 1.2, type: 'lowpass', f: 600, gain: 0.18 * big, attack: 0.1 });
    for (let i = 0; i < 4; i++) tone({ f: 500 + Math.random() * 400, f2: 900 + Math.random() * 500, dur: 0.5, gain: 0.025, delay: 0.1 + Math.random() * 0.6, vib: 20, vibRate: 7 });
  },
  groan() { noise({ dur: 1.0, type: 'lowpass', f: 480, gain: 0.2, attack: 0.1 }); tone({ f: 240, f2: 150, dur: 0.7, gain: 0.04, delay: 0.05, vib: 6, vibRate: 5 }); },
  ui() { tone({ f: 1400, dur: 0.03, gain: 0.05 }); },
  // bullet time: everything drops into slow motion
  btIn() {
    tone({ f: 420, f2: 60, dur: 0.7, gain: 0.35, type: 'sawtooth' });
    tone({ f: 90, f2: 32, dur: 0.9, gain: 0.7 });
    noise({ dur: 0.8, f: 2400, f2: 300, q: 0.8, gain: 0.25, attack: 0.02 });
    [0, 0.42].forEach((d) => tone({ f: 60, f2: 40, dur: 0.16, gain: 0.5, delay: 0.25 + d }));   // heartbeat
  },
  btOut() { noise({ dur: 0.35, f: 300, f2: 3000, q: 0.9, gain: 0.2, attack: 0.03 }); tone({ f: 80, f2: 200, dur: 0.3, gain: 0.2 }); },
  // low rumble while the attack hangs in the air; returns stop() (also self-stops after 6 s)
  btDrone() {
    if (!ensure()) return () => {};
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 48; o2.type = 'sawtooth'; o2.frequency.value = 72;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 1.6; lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.2);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out(0));
    o.start(t); o2.start(t); lfo.start(t);
    const hard = t + 6; o.stop(hard); o2.stop(hard); lfo.stop(hard);
    let done = false;
    return () => {
      if (done) return; done = true;
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.15);
      try { o.stop(n + 0.2); o2.stop(n + 0.2); lfo.stop(n + 0.2); } catch {}
    };
  },
  // BLOCKED: huge impact, net twang, crowd "ooh"
  blocked(stuffed = true, pan = 0) {
    tone({ f: 140, f2: 30, dur: 0.6, gain: 1.0, pan });
    tone({ f: 60, f2: 25, dur: 0.8, gain: 0.7, pan });
    noise({ dur: 0.12, type: 'highpass', f: 1800, gain: 0.8, pan });
    tone({ f: 330, f2: 300, dur: 0.5, type: 'triangle', gain: 0.14, vib: 30, vibRate: 22, pan });   // net twang
    noise({ dur: 1.3, f: 700, q: 0.6, gain: stuffed ? 0.3 : 0.2, attack: 0.12, delay: 0.08 });       // crowd ooh
    tone({ f: 260, f2: 200, dur: 0.9, gain: 0.05, delay: 0.1, vib: 8, vibRate: 5 });
  },
  whoosh(pan = 0) { noise({ dur: 0.3, f: 500, f2: 2600, q: 1.1, gain: 0.16, attack: 0.05, pan }); },
  aim() { tone({ f: 880, dur: 0.04, gain: 0.05, type: 'triangle' }); },
  meterReady() { [660, 880, 1320].forEach((f, i) => tone({ f, dur: 0.18, gain: 0.08, delay: i * 0.06, type: 'triangle' })); },
  meterDrain() { tone({ f: 520, f2: 180, dur: 0.35, gain: 0.07, type: 'sawtooth' }); },
  ult(pan = 0) {                 // ULTIMATE: huge boom, crack, rising roar, shimmer
    tone({ f: 120, f2: 28, dur: 0.9, gain: 1.0, pan });
    tone({ f: 55, f2: 25, dur: 1.1, gain: 0.8, pan });
    noise({ dur: 0.1, type: 'highpass', f: 2200, gain: 0.9, pan });
    noise({ dur: 0.7, f: 300, f2: 4000, q: 0.7, gain: 0.45, attack: 0.03, pan });
    noise({ dur: 1.2, type: 'lowpass', f: 900, gain: 0.35, attack: 0.05, pan });
    [880, 1320, 1760, 2640].forEach((f, i) => tone({ f, dur: 0.5, gain: 0.06, delay: 0.05 + i * 0.05, type: 'triangle' }));
  },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone({ f, dur: 0.25, gain: 0.1, delay: i * 0.11, type: 'triangle' })); },
};
