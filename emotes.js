// Spectator emotes (keys 1–9, 0): ten short dances.
// API: EMOTES[i] = { dur } (seconds); poseEmote(p, i, t, k) poses the rig at time t, blended over the normal pose by k (0..1).
//
// How it works: each dance is a function of the beat (b = t * bpm / 60) that returns a full-body pose:
//   - pelvis position (x, y, z; y = hip-socket height) and body rotation (bx, by, bz) about the pelvis
//   - feet as ground targets (planted feet stay put; legs are solved with 2-bone IK, so knees bend and the
//     body never sinks into or floats above the floor), with heel/toe pitch and toe-out
//   - hands as targets in torso space (or world space for hands planted on the floor), also IK'd, with an elbow hint
//   - head rotation
// Lateral fields for feet and hands are "outward" amounts (multiplied by the side), so poses mirror cleanly.
import * as THREE from 'three';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const sst = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (b, b0, b1) => sst((b - b0) / (b1 - b0));                      // 0 → 1 between b0 and b1
const env = (b, a0, a1, b0, b1) => ramp(b, a0, a1) * (1 - ramp(b, b0, b1));  // fades in a0..a1, out b0..b1
const onBeat = (b, sh = 2) => Math.pow(0.5 + 0.5 * Math.cos(TAU * b), sh);   // 1 on each beat, 0 between
const sq = (ph, h = 2) => Math.tanh(h * Math.sin(ph)) / Math.tanh(h);        // a groove oscillation that dwells at the ends
const bump = (b, c, w) => { const x = (b - c) / w; return Math.abs(x) >= 1 ? 0 : 0.5 + 0.5 * Math.cos(PI * x); };

/* ---------------- pose fields ---------------- */
const SIDE = [0, 1].map((i) => ({
  fx: `f${i}x`, fy: `f${i}y`, fz: `f${i}z`, fw: `f${i}w`, fp: `f${i}p`, fa: `f${i}a`, k: `k${i}`,
  hx: `h${i}x`, hy: `h${i}y`, hz: `h${i}z`, ex: `e${i}x`, ey: `e${i}y`, ez: `e${i}z`,
  gx: `g${i}x`, gy: `g${i}y`, gz: `g${i}z`, gw: `g${i}w`,
}));
const STAND_Y = 0.895;
const BASE = { x: 0, y: STAND_Y, z: 0, bx: 0.02, by: 0, bz: 0, nx: 0, ny: 0, nz: 0 };
for (const S of SIDE) {
  Object.assign(BASE, {
    [S.fx]: 0.1, [S.fy]: 0, [S.fz]: 0, [S.fw]: 0.12, [S.fp]: 0, [S.fa]: 0, [S.k]: 0.12,
    [S.hx]: 0.24, [S.hy]: 0.87, [S.hz]: 0.08, [S.ex]: 0.35, [S.ey]: -0.2, [S.ez]: -1,
    [S.gx]: 0.24, [S.gy]: 0.05, [S.gz]: 0.3, [S.gw]: 0,
  });
}
const NAMES = Object.keys(BASE);
const base = () => ({ ...BASE });
function mix(A, B, w) { const Q = {}; for (const n of NAMES) Q[n] = A[n] + (B[n] - A[n]) * w; return Q; }
const setHand = (P, i, x, y, z, e) => { const S = SIDE[i]; P[S.hx] = x; P[S.hy] = y; P[S.hz] = z; if (e) { P[S.ex] = e[0]; P[S.ey] = e[1]; P[S.ez] = e[2]; } };
const setFoot = (P, i, x, z, y = 0, pitch = 0, toeOut) => { const S = SIDE[i]; P[S.fx] = x; P[S.fz] = z; P[S.fy] = y; P[S.fp] = pitch; if (toeOut !== undefined) P[S.fw] = toeOut; };
// pivot both feet about the spot by angle a (a turn that the feet follow)
function turnFeet(P, a) {
  const c = Math.cos(a), sn = Math.sin(a);
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], sx = i ? 1 : -1, X = sx * P[S.fx], Z = P[S.fz];
    P[S.fx] = sx * (X * c + Z * sn); P[S.fz] = -X * sn + Z * c; P[S.fw] += sx * a;
  }
}
// blend a list of [weight, [x, y, z], pole] hand poses over the rest pose
function blendHand(P, i, list) {
  const S = SIDE[i];
  let w0 = 1; for (const [w] of list) w0 -= w;
  w0 = Math.max(0, w0);
  const acc = [P[S.hx] * w0, P[S.hy] * w0, P[S.hz] * w0, P[S.ex] * w0, P[S.ey] * w0, P[S.ez] * w0];
  let tw = w0;
  for (const [w, h, e] of list) {
    if (w <= 0) continue;
    acc[0] += h[0] * w; acc[1] += h[1] * w; acc[2] += h[2] * w;
    const ee = e || [P[S.ex], P[S.ey], P[S.ez]];
    acc[3] += ee[0] * w; acc[4] += ee[1] * w; acc[5] += ee[2] * w; tw += w;
  }
  if (tw > 0) for (let j = 0; j < 6; j++) acc[j] /= tw;
  setHand(P, i, acc[0], acc[1], acc[2], [acc[3], acc[4], acc[5]]);
}

/* ---------------- keyframe tracks ---------------- */
// keys: [beat, partial pose (filled forward from the previous key), ease?]. Smooth cubic between keys; a key that
// is a local extreme eases in and out; 'snap' arrives fast with a tiny overshoot and holds (robotic).
function track(keys) {
  let cur = base();
  const ks = keys.map(([b, o, e]) => { cur = { ...cur, ...(typeof o === 'function' ? o(cur) : o) }; return { b, v: NAMES.map((n) => cur[n]), e }; });
  const out = (v) => { const P = {}; NAMES.forEach((n, j) => { P[n] = v[j]; }); return P; };
  return (b) => {
    const n = ks.length;
    if (b <= ks[0].b) return out(ks[0].v);
    if (b >= ks[n - 1].b) return out(ks[n - 1].v);
    let i = 0; while (b > ks[i + 1].b) i++;
    const A = ks[i], B = ks[i + 1], A0 = ks[Math.max(0, i - 1)], B1 = ks[Math.min(n - 1, i + 2)];
    const h = B.b - A.b, u = (b - A.b) / h, P = {};
    if (B.e === 'snap') {
      const x = Math.min(1, u / 0.32), c1 = 1.5, s = 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
      NAMES.forEach((nm, j) => { P[nm] = A.v[j] + (B.v[j] - A.v[j]) * s; });
      return P;
    }
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    NAMES.forEach((nm, j) => {
      const a = A.v[j], c = B.v[j], d = c - a;
      const tan = (prev, pb, next, nb, here) => {
        const d0 = here - prev, d1 = next - here;
        if (d0 * d1 <= 0 || nb === pb) return 0;                    // extreme or hold: ease
        return clamp((next - prev) / (nb - pb) * h, -3 * Math.abs(d), 3 * Math.abs(d));
      };
      const m0 = A0 === A ? 0 : tan(A0.v[j], A0.b, c, B.b, a);
      const m1 = B1 === B ? 0 : tan(a, A.b, B1.v[j], B1.b, c);
      P[nm] = h00 * a + h10 * m0 + h01 * c + h11 * m1;
    });
    return P;
  };
}

/* ---------------- the dances ---------------- */
const REST_H = [0.24, 0.87, 0.08], REST_E = [0.35, -0.2, -1];

// 1 · slow melodic sway with a hand wave (80 bpm)
function swayWave(b) {
  const P = base(), E = env(b, 0.1, 1.1, 7.3, 8.5);
  const s = sq(PI * (b - 0.5), 1.6), sl = sq(PI * (b - 0.75), 1.6);         // weight side, and a lagging copy
  P.x = 0.075 * s * E;
  P.bz = (0.085 * s + 0.03 * sl) * E;                                         // shoulders lean back over the feet
  P.by = 0.12 * sl * E;
  P.bx = 0.02 + 0.03 * E * onBeat(b - 0.1, 2);
  P.y = STAND_Y - E * (0.025 + 0.04 * onBeat(b, 1.4));                       // sink into each beat
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    setFoot(P, i, 0.1 + 0.07 * E, 0.02 * sx * E, 0, 0.32 * E * Math.max(0, -sx * s));   // the unweighted heel peels up
  }
  // wave: the hand sways overhead a little behind the hips
  const w = sq(PI * (b - 0.5) - 1.0, 1.3), w2 = Math.sin(TAU * (b - 0.5) - 1.6);
  const up1 = env(b, 0.35, 1.4, 7.0, 8.2), up0 = env(b, 3.6, 4.6, 7.0, 8.2);
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, u = i ? up1 : up0;
    const cx = sx * lerp(0.1, 0.24, up0);                                     // one arm: near the head; both: apart
    const wx = cx + 0.17 * w;                                                 // world x of the waving hand
    const up = [sx * wx, 1.84 + 0.04 * w2 - 0.05 * Math.abs(w), 0.12 + 0.05 * w2];
    const low = [0.25, 0.93 + 0.03 * sx * sl, 0.13 + 0.08 * sx * sl];        // the free arm swings loosely with the sway
    const arc = Math.sin(PI * u);
    setHand(P, i, lerp(low[0], up[0], u) + 0.24 * arc, lerp(low[1], up[1], u), lerp(low[2], up[2], u) + 0.1 * arc,
      [lerp(0.35, 1, u), lerp(-0.2, 0.25, u), lerp(-1, 0.15, u)]);
  }
  P.ny = 0.16 * sl * E; P.nz = -0.13 * sl * E;
  P.nx = E * (-0.06 - 0.06 * Math.max(up0, up1) + 0.08 * onBeat(b - 0.12, 2));
  return P;
}

// 2 · hip swings then hip circles, arms bent (110 bpm)
function partyHips(b) {
  const P = base(), E = env(b, 0, 1, 11, 12);
  const sideK = env(b, 0.4, 1.2, 4.7, 5.5), circK = env(b, 4.7, 5.5, 10.4, 11.4);
  const s = sq(PI * (b - 0.5), 2.6);                                          // a hip lands on every beat
  const a = PI * (b - 5) * 1.0;                                               // one circle every two beats
  const hx = 0.09 * s * sideK + 0.08 * Math.sin(a) * circK;
  const hz = 0.065 * Math.cos(a) * circK;
  P.x = hx; P.z = hz;
  P.bz = 1.7 * hx; P.bx = 0.03 - 1.5 * hz;                                    // shoulders stay over the feet
  P.by = -1.2 * hx;
  P.y = STAND_Y - E * 0.05 - 0.025 * onBeat(b, 2) * sideK + 0.012 * Math.cos(2 * a) * circK;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    setFoot(P, i, 0.1 + 0.075 * E, 0, 0, 0.42 * E * clamp(-sx * hx / 0.09, 0, 1), 0.12 + 0.15 * E);
  }
  // arms bent at the elbows, fists in front; they pump against the hips and roll during the circles
  const armK = env(b, 0.15, 1.0, 10.9, 11.9);
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    const pump = 0.1 * sx * s * sideK;
    const rx = 0.05 * Math.cos(2 * a + i * PI) * circK, ry = 0.05 * Math.sin(2 * a + i * PI) * circK;
    const hand = [0.17 - 0.5 * sx * hx + rx, 1.16 + pump + ry, 0.28 - 0.5 * Math.abs(pump)];
    blendHand(P, i, [[armK, hand, [1, -0.25, -0.35]]]);
    P[SIDE[i].hx] += 0.18 * Math.sin(PI * armK) * (1 - circK) * (b < 6 ? 1 : 0.5);
  }
  P.nz = -1.2 * P.bz + 0.1 * s * sideK;
  P.ny = 0.22 * sq(PI * (b - 0.8), 1.5) * sideK + 0.15 * Math.sin(a - 0.6) * circK;
  P.nx = 0.06 * onBeat(b - 0.1) * E - 0.04 * E;
  return P;
}

// 3 · hand to the forehead with a hopping leg-kick shuffle (120 bpm)
function foreheadKicks(b) {
  const P = base(), E = env(b, 0, 1, 10, 11);
  const Lk = env(b, 0.05, 0.9, 9.6, 10.6), K = env(b, 0.9, 1.5, 9.1, 9.8);
  const c = Math.cos(PI * (b - 1));                                           // +1: leg 1 kicks, −1: leg 0 kicks
  const kick = [Math.pow(Math.max(0, -c), 0.7) * K, Math.pow(Math.max(0, c), 0.7) * K];
  const air = K * 0.065 * Math.pow(1 - Math.abs(c), 1.3);                    // both feet leave the floor as they switch
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, kk = kick[i];
    setFoot(P, i, 0.1 + 0.26 * kk, 0.14 * kk, air + 0.2 * kk, 0, 0.12 + 0.3 * kk);
    P[SIDE[i].fa] = -0.25 * kk;                                               // toes up on the kick
    P[SIDE[i].k] = 0.12 + 0.5 * kk;
  }
  P.x = 0.05 * (kick[0] - kick[1]);                                           // over the standing foot
  P.y = STAND_Y - 0.03 * E + air - 0.03 * (kick[0] + kick[1]);
  P.bz = 0.15 * (kick[1] - kick[0]);                                          // lean away from the kick
  P.by = 0.12 * (kick[1] - kick[0]);
  P.bx = 0.02 - 0.05 * K;
  // the hand on the forehead, elbow out; a tiny tap on each beat
  const tap = 0.012 * onBeat(b - 0.05, 3) * K;
  const arc = Math.sin(PI * Lk);
  setHand(P, 1, lerp(0.24, 0.03, Lk) + 0.2 * arc, lerp(0.87, 1.685 + tap, Lk), lerp(0.08, 0.165, Lk) + 0.12 * arc,
    [lerp(0.35, 1, Lk), lerp(-0.2, 0.3, Lk), lerp(-1, -0.15, Lk)]);
  // the free arm flaps out with its own side's kick
  const f = kick[0], g = kick[1];
  blendHand(P, 0, [[E, [0.3 + 0.14 * f - 0.04 * g, 0.98 + 0.22 * f, 0.12 + 0.1 * g - 0.05 * f], [1, -0.3, -0.5]]]);
  P.nz = 0.1 * (kick[0] - kick[1]) - 0.06 * E;
  P.ny = -0.2 * E + 0.12 * (kick[1] - kick[0]);
  P.nx = -0.04 * E + 0.05 * onBeat(b, 2) * K;
  return P;
}

// 4 · arm-swing groove, both arms brought around in big circles (100 bpm)
function armsAround(b) {
  const P = base(), E = env(b, 0, 1, 10, 11);
  const A = env(b, 0.2, 1.25, 9.2, 10.3);
  // progress around the circle: slow over the top, fast through the bottom; reverses at beat 5
  const g = (x) => x - (0.8 / PI) * Math.sin(PI * x);                         // two beats per circle, eased
  const prog = b < 5 ? g(b - 1) : g(4) - g(b - 5);
  const th = PI + PI * prog;                                                  // 0 = bottom, π = top
  const thl = PI + PI * (b < 5 ? g(b - 1.25) : g(4) - g(b - 5.25));           // the body follows a little behind
  const st = Math.sin(th), ct = Math.cos(th), stl = Math.sin(thl), ctl = Math.cos(thl);
  const R = 0.4;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, S = SIDE[i];
    const wx = 1.2 * R * st + sx * 0.14, wy = 1.36 - R * ct, wz = 0.36 - 0.1 * ct;   // out in front of the face at the top
    P[S.gx] = sx * wx; P[S.gy] = wy; P[S.gz] = wz; P[S.gw] = A * A;              // a clean world-space circle
    P[S.ex] = lerp(0.35, 1, A); P[S.ey] = lerp(-0.2, -0.4, A); P[S.ez] = lerp(-1, -0.2, A);
  }
  P.x = 0.07 * stl * A;
  P.y = STAND_Y - 0.02 * E - 0.065 * A * (1 + ctl) / 2;                       // dip as the arms sweep through the bottom
  P.by = 0.32 * stl * A;
  P.bz = -0.07 * stl * A;
  P.bx = 0.02 + 0.1 * A * (1 + ctl) / 2;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    setFoot(P, i, 0.1 + 0.075 * E, 0.03 * sx * E, 0, 0.35 * A * Math.max(0, -sx * stl), 0.12 + 0.12 * E);
  }
  P.ny = 0.35 * st * A; P.nx = -0.3 * A * (-ct) * 0.6 + 0.05 * E; P.nz = -0.08 * stl * A;
  return P;
}

// 5 · drop to the floor, a wave-ripple worm along the ground, get back up (90 bpm)
const HW = (x, y, z) => ({ g0x: x, g0y: y, g0z: z, g1x: x, g1y: y, g1z: z });
const FT = (x, y, z, p, a) => ({ f0x: x, f0y: y, f0z: z, f0p: p, f0a: a, f1x: x, f1y: y, f1z: z, f1p: p, f1a: a });
const ARMPOLE = (x, y, z) => ({ e0x: x, e0y: y, e0z: z, e1x: x, e1y: y, e1z: z });
const wormCycle = (b0, z) => [
  [b0 + 0.5, { x: 0, y: 0.21, z: z + 0.02, bx: PI / 2 - 0.2, ...FT(0.1, 0.45, z - 0.46, 0, PI - 0.9), nx: -0.45, ...HW(0.25, 0.05, z + 0.5) }],
  [b0 + 1.0, { x: 0, y: 0.43, z: z + 0.07, bx: PI / 2 + 0.42, ...FT(0.1, 0.24, z - 0.6, 0, PI - 0.6), nx: -0.85, ...HW(0.25, 0.05, z + 0.5) }],
  [b0 + 1.5, { x: 0, y: 0.16, z: z + 0.1, bx: PI / 2 - 0.02, ...FT(0.1, 0.16, z - 0.72, 0, PI - 0.5), nx: -0.55, ...HW(0.25, 0.05, z + 0.52) }],
  [b0 + 2.0, { x: 0, y: 0.13, z: z + 0.1, bx: PI / 2 - 0.45, ...FT(0.1, 0.05, z + 0.1 - 0.9, 0, PI - 0.45), nx: -0.35, ...HW(0.25, 0.05, z + 0.6) }],
];
const worm = track([
  [0, {}],
  [0.9, { y: 0.54, z: 0.04, bx: 0.85, ...FT(0.12, 0, 0, 0, 0), g0w: 1, g1w: 1, ...HW(0.22, 0.05, 0.42), nx: -0.3, ...ARMPOLE(0.5, 0, -1) }],
  [1.65, { y: 0.43, z: -0.17, bx: 1.22, ...FT(0.1, 0, -1.02, 1.25, 0), ...HW(0.22, 0.05, 0.32), nx: -0.5 }],
  [2.4, { y: 0.13, z: -0.14, bx: PI / 2 - 0.45, ...FT(0.1, 0.05, -1.04, 0, PI - 0.45), ...HW(0.25, 0.05, 0.42), nx: -0.35 }],
  ...wormCycle(2.4, -0.14), ...wormCycle(4.4, -0.06), ...wormCycle(6.4, 0.02),
  [9.2, { y: 0.54, z: -0.02, bx: 1.33, ...FT(0.11, 0.06, -0.44, 0, PI - 0.5), ...HW(0.24, 0.05, 0.48), nx: -0.4 }],
  [9.55, { y: 0.52, z: -0.05, bx: 1.1, ...FT(0.115, 0, -0.3, 1.25, 0), ...HW(0.23, 0.05, 0.42), nx: -0.3 }],
  [9.95, { y: 0.54, z: -0.08, bx: 0.8, ...FT(0.12, 0, 0, 0, 0), ...HW(0.22, 0.05, 0.36), g0w: 0.6, g1w: 0.6, nx: -0.2 }],
  [10.7, { y: 0.86, z: 0, bx: 0.08, ...FT(0.1, 0, 0, 0, 0), g0w: 0, g1w: 0, nx: 0, ...ARMPOLE(0.35, -0.2, -1) }],
  [11.4, {}],
]);

// 6 · sassy hand-on-hip bounce with a wagging hand and a palms-up shrug (100 bpm)
function sassy(b) {
  const P = base(), E = env(b, 0, 1, 10, 11);
  const s = sq(PI * (b - 0.5), 2.2), sl = sq(PI * (b - 0.72), 1.8);
  const wagA = env(b, 0.4, 1.2, 4.0, 4.6), shrug1 = env(b, 4.0, 4.6, 5.1, 5.8);
  const wagB = env(b, 5.1, 5.8, 8.0, 8.6), shrug2 = env(b, 8.0, 8.6, 9.3, 10.3);
  const shrug = shrug1 + shrug2;
  const groove = clamp(wagA + wagB, 0, 1);
  P.x = 0.055 * s * groove;                                                   // hip pops
  P.bz = 0.1 * s * groove;
  P.by = 0.08 * sl * groove;
  P.y = STAND_Y - 0.03 * E - 0.035 * onBeat(b, 1.6) * groove + 0.02 * shrug;
  P.bx = 0.02 - 0.09 * shrug;
  const lead = wagB > wagA ? 0 : 1;                                           // the front foot (opposite the hand on the hip)
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, front = i === lead ? 1 : 0;
    const tap = front * groove * onBeat(b - 0.5, 1.5);
    setFoot(P, i, 0.11 + 0.04 * E, front * 0.13 * groove, 0, 0.3 * tap + 0.25 * shrug + 0.25 * groove * Math.max(0, -sx * s) * (1 - front), 0.12 + 0.2 * E);
  }
  const wag = (i) => {
    const w = sq(PI * (b - 0.55), 2.4);
    return [0.13 + 0.13 * (i ? 1 : -1) * w, 1.2 + 0.035 * onBeat(b - 0.1, 2), 0.32 - 0.03 * Math.abs(w)];
  };
  const HIP = [0.205, 0.99, -0.01], HIP_E = [1, -0.1, -0.7];
  const SHRUG = [0.36, 1.06, 0.27], SHRUG_E = [1, -0.6, -0.5];
  blendHand(P, 0, [[wagA, HIP, HIP_E], [wagB, wag(0), [0.8, -0.7, -0.2]], [shrug, SHRUG, SHRUG_E]]);
  blendHand(P, 1, [[wagB, HIP, HIP_E], [wagA, wag(1), [0.8, -0.7, -0.2]], [shrug, SHRUG, SHRUG_E]]);
  // neck slides with the groove, a big sassy tilt on the shrug
  P.nz = (-0.16 * sl * groove + 0.3 * (shrug1 - shrug2)) ;
  P.ny = 0.18 * sq(PI * (b - 0.4), 2) * groove + 0.15 * (shrug1 - shrug2);
  P.nx = -0.12 * shrug + 0.06 * onBeat(b - 0.08, 2) * groove;
  return P;
}

// 7 · big open arms, then a swaying self-hug (70 bpm)
function bigHug(b) {
  const P = base(), E = env(b, 0, 0.8, 6.0, 6.9);
  const openK = env(b, 0.15, 1.05, 1.65, 2.35), hugK = env(b, 1.75, 2.45, 5.5, 6.4);
  const breathe = 0.5 + 0.5 * Math.sin(PI * (b - 1.05));
  const s = sq(PI * (b - 2.45), 1.5), sl = sq(PI * (b - 2.7), 1.5);           // sway in the hug
  P.bx = 0.02 - 0.15 * openK + 0.1 * hugK;                                    // chest out, then curl in
  P.y = STAND_Y + 0.015 * openK - 0.035 * hugK - 0.015 * hugK * onBeat(b, 1.5);
  P.x = 0.04 * s * hugK; P.bz = 0.07 * s * hugK; P.by = 0.26 * sl * hugK;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    setFoot(P, i, 0.1 + 0.04 * E, 0, 0, 0.22 * openK + 0.35 * hugK * Math.max(0, -sx * s), 0.12 + 0.1 * E);
  }
  const squeeze = 0.02 * onBeat(b - 0.1, 3) * hugK;
  const open = [0.62, 1.5 + 0.04 * breathe, 0.2], openE = [0.2, -1, -0.3];
  const hug = [[-0.19 + squeeze, 1.34, 0.17], [-0.15 + squeeze, 1.23, 0.215]];
  for (let i = 0; i < 2; i++) {
    blendHand(P, i, [[openK, open, openE], [hugK, hug[i], [0.2, -0.5, 1]]]);
    P[SIDE[i].hz] += 0.16 * Math.sin(PI * hugK) * (1 - hugK * 0.6) + 0.1 * Math.sin(PI * openK) * (1 - openK);
  }
  P.nx = -0.25 * openK + 0.22 * hugK; P.ny = 0.12 * sl * hugK;
  P.nz = -0.22 * sl * hugK;
  return P;
}

// 8 · robotic scanning: stepped head and torso turns, a scanning arm, robot arm pops (120 bpm)
const SCAN_ARM = (i) => ({ [`h${i}x`]: 0.13, [`h${i}y`]: 1.38, [`h${i}z`]: 0.54, [`e${i}x`]: 1, [`e${i}y`]: 0, [`e${i}z`]: 0 });
const GUARD = (i) => ({ [`h${i}x`]: 0.06, [`h${i}y`]: 1.2, [`h${i}z`]: 0.3, [`e${i}x`]: 1, [`e${i}y`]: -0.3, [`e${i}z`]: 0 });
const UP = (i) => ({ [`h${i}x`]: 0.47, [`h${i}y`]: 1.66, [`h${i}z`]: 0.06, [`e${i}x`]: 1, [`e${i}y`]: -0.4, [`e${i}z`]: 0 });
const DOWN = (i) => ({ [`h${i}x`]: 0.48, [`h${i}y`]: 1.12, [`h${i}z`]: 0.06, [`e${i}x`]: 1, [`e${i}y`]: 0.4, [`e${i}z`]: 0 });
const STANCE = { f0x: 0.15, f1x: 0.15, f0w: 0.2, f1w: 0.2, y: 0.865 };
const robot = track([
  [0, {}],
  [1, { ...STANCE, ...SCAN_ARM(1), ...GUARD(0), by: 0, ny: 0 }, 'snap'],
  [2, { by: 0.3, ny: 0.35 }, 'snap'],
  [3, { by: 0.6, ny: 0.5 }, 'snap'],
  [3.5, { by: 0.6, ny: 0.5, nx: 0.14 }, 'snap'],
  [4, { by: 0.3, ny: 0, nx: 0 }, 'snap'],
  [5, { by: 0, ny: -0.25 }, 'snap'],
  [6, { by: -0.3, ny: -0.5 }, 'snap'],
  [7, { by: -0.6, ny: -0.55 }, 'snap'],
  [7.5, { by: -0.6, ny: -0.55, nx: 0.14 }, 'snap'],
  [8, { by: 0, ny: 0, nx: 0, ...UP(1), ...DOWN(0), nz: 0.22 }, 'snap'],
  [9, { ...UP(0), ...DOWN(1), nz: -0.22 }, 'snap'],
  [10, { ...UP(1), ...DOWN(0), nz: 0.22, by: 0.25, ny: 0.35 }, 'snap'],
  [11, { ...SCAN_ARM(0), ...SCAN_ARM(1), h0x: 0.1, h1x: 0.1, nz: 0, by: 0, ny: 0 }, 'snap'],
  [11.5, { ny: 0.45 }, 'snap'],
  [12, { ny: -0.45 }, 'snap'],
  [12.6, { ...base() }, 'snap'],
  [13, {}],
]);
function robotScan(b) {
  const P = robot(b), K = env(b, 0.8, 1.1, 12.2, 12.6);
  turnFeet(P, 0.5 * P.by); P.by *= 0.8;                                     // the feet pivot with each turn; the hips only twist a little
  const tick = b - Math.floor(b);                                             // a stiff little dip right after every beat
  P.y -= 0.022 * K * Math.exp(-tick * 9) * (1 - Math.exp(-tick * 40));
  P.nx += 0.04 * K * Math.exp(-tick * 9) * (1 - Math.exp(-tick * 40));
  return P;
}

// 9 · playful bounce-and-point (116 bpm)
function bouncePoint(b) {
  const P = base(), E = env(b, 0, 0.8, 11, 12);
  const wA = env(b, 0.5, 1.0, 4.4, 4.9), wB = env(b, 4.4, 4.9, 6.4, 6.9);
  const wC = env(b, 6.4, 6.9, 8.4, 8.9), wD = env(b, 8.4, 8.9, 10.5, 11.4);
  const c = Math.cos(PI * (b - 1));
  const pw = [sst((-c + 0.25) / 0.9) * wA, sst((c + 0.25) / 0.9) * wA];      // arm 1 on beats 1, 3; arm 0 on 2, 4
  const bounce = onBeat(b, 2.2);
  P.y = STAND_Y - 0.025 * E - (0.04 + 0.02 * wB) * bounce * E - 0.1 * wC;
  P.by = 0.28 * (pw[1] - pw[0]) - 0.05 * wD * Math.sin(PI * b);
  P.x = 0.035 * (pw[1] - pw[0]) + 0.045 * Math.sin(TAU * b) * wC;             // hip wiggle when pointing down
  P.bz = -0.04 * (pw[1] - pw[0]) + 0.07 * Math.sin(TAU * b) * wC;
  P.bx = 0.02 + 0.2 * wC + 0.09 * wD - 0.04 * wB;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    setFoot(P, i, 0.11 + 0.05 * E, 0.13 * pw[i], 0, -0.4 * pw[i] + 0.2 * wB * bounce, 0.15 + 0.12 * E);
  }
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, o = pw[1 - i];
    const pump = 0.06 * onBeat(b - 0.1, 2);
    const recoil = 0.07 * onBeat(b - 0.05, 4);
    blendHand(P, i, [
      [pw[i], [0.34, 1.5, 0.45], [1, 0, -0.3]],                               // point out to the diagonal
      [o * 0.9, [0.2, 1.08, -0.04], [0.5, 0, -1]],                            // the other elbow pulls back
      [wB, [0.1, 1.9 - pump, 0.14], [1, 0.2, 0]],                             // both up at the sky
      [wC, [0.36, 0.99, 0.33 + 0.03 * sx * Math.sin(TAU * b)], [1, 0.3, -0.5]],   // both down at the floor
      [wD, [0.13, 1.4 + recoil, 0.5 - recoil * 0.7], [1, -0.2, -0.4]],       // both at you
    ]);
  }
  P.ny = 0.3 * (pw[1] - pw[0]) + 0.12 * Math.sin(PI * b) * wD;
  P.nx = 0.07 * bounce * E - 0.3 * wB + 0.3 * wC - 0.03 * wD;
  P.nz = 0.08 * (pw[0] - pw[1]) + 0.12 * Math.sin(PI * (b - 0.3)) * wD;
  return P;
}

// 10 · goofy side-to-side victory jig, arms flailing, with a jump to finish (140 bpm)
const jigEnd = track([
  [9.4, { y: 0.86, ...ARMPOLE(1, 0.5, 0), h0x: 0.34, h0y: 1.6, h0z: 0.15, h1x: 0.34, h1y: 1.6, h1z: 0.15 }],
  [10.15, { y: 0.74, bx: 0.3, h0x: 0.3, h0y: 0.95, h0z: -0.12, h1x: 0.3, h1y: 0.95, h1z: -0.12, ...ARMPOLE(0.4, 0, -1), nx: 0.15 }],
  [10.75, { y: 1.12, bx: -0.08, h0x: 0.4, h0y: 1.9, h0z: 0.12, h1x: 0.4, h1y: 1.9, h1z: 0.12, ...ARMPOLE(1, 0.2, 0), ...FT(0.13, 0.18, 0.02, 0.5, 0.15), nx: -0.3 }],
  [11.3, { y: 0.78, bx: 0.15, h0x: 0.42, h0y: 1.75, h0z: 0.14, h1x: 0.42, h1y: 1.75, h1z: 0.14, ...FT(0.13, 0, 0.02, 0, 0), nx: -0.1 }],
  [12.3, { ...base() }],
  [13, {}],
]);
function jig(b) {
  const J = env(b, 0.2, 1.0, 9.1, 9.7);
  const P = base();
  const c = Math.cos(PI * (b - 1));                                           // +1: on foot 0, leg 1 kicks up; −1: the reverse
  const up = [Math.pow(Math.max(0, -c), 0.6), Math.pow(Math.max(0, c), 0.6)];
  const air = 0.075 * Math.pow(1 - Math.abs(c), 1.2);
  const side = sq(PI * (b - 0.5), 1.8);                                       // weight over foot 0 when +1
  P.x = -0.1 * side; P.bz = 0.2 * side; P.by = 0.18 * sq(PI * (b - 0.75), 1.5);
  P.y = STAND_Y - 0.055 + air - 0.03 * onBeat(b, 2);
  P.bx = 0.08;
  for (let i = 0; i < 2; i++) {
    const kk = up[i];
    setFoot(P, i, 0.13 + 0.12 * kk, -0.12 * kk, air + 0.25 * kk, 0.3 * kk, 0.2 + 0.2 * kk);
    P[SIDE[i].fa] = 0.5 * kk;
    P[SIDE[i].k] = 0.4;
  }
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, ph = TAU * b + (i ? PI : 0);
    setHand(P, i, 0.36 + 0.09 * Math.sin(ph) + 0.03 * Math.sin(2 * ph + 1), 1.6 + 0.17 * Math.sin(ph - 0.9) + 0.05 * Math.sin(2 * ph),
      0.14 + 0.08 * Math.cos(ph), [1, 0.55 + 0.2 * Math.sin(ph), -0.1]);
  }
  P.nz = -0.22 * sq(PI * (b - 0.8), 1.5); P.ny = 0.25 * Math.sin(PI * (b - 0.3)); P.nx = -0.06 + 0.06 * onBeat(b - 0.15);
  const intro = mix(base(), P, J);
  return b < 9.4 ? intro : mix(jigEnd(b), intro, J);
}

/* ---------------- the table ---------------- */
const DANCES = [
  { bpm: 80, beats: 8.5, fn: swayWave },
  { bpm: 110, beats: 12, fn: partyHips },
  { bpm: 120, beats: 11, fn: foreheadKicks },
  { bpm: 100, beats: 11, fn: armsAround },
  { bpm: 90, beats: 11.4, fn: worm },
  { bpm: 100, beats: 11, fn: sassy },
  { bpm: 70, beats: 7, fn: bigHug },
  { bpm: 120, beats: 13, fn: robotScan },
  { bpm: 116, beats: 12, fn: bouncePoint },
  { bpm: 140, beats: 13, fn: jig },
];
export const EMOTES = DANCES.map((d) => ({ dur: +(d.beats * 60 / d.bpm).toFixed(3) }));

/* ---------------- solving the pose onto the rig ---------------- */
const V3 = () => new THREE.Vector3();
const _d = V3(), _pp = V3(), _E = V3(), _u = V3(), _f = V3(), _Tc = V3(), _X = V3(), _Y = V3(), _Z = V3();
const _bp = V3(), _S = V3(), _T = V3(), _pole = V3(), _v = V3(), _w = V3(), _flat = V3();
const _A = [V3(), V3()];
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
const qB = new THREE.Quaternion(), qBi = new THREE.Quaternion(), qH = new THREE.Quaternion(), qK = new THREE.Quaternion();
const qF = new THREE.Quaternion(), qY = new THREE.Quaternion(), qL = new THREE.Quaternion(), qS = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const BALL = new THREE.Vector3(0, -0.075, 0.168), HEEL = new THREE.Vector3(0, -0.075, -0.082);
const HIP_H = 0.92, THIGH = 0.44, SHIN = 0.42, UPPER = 0.28, FORE = 0.265, LEG_MAX = (THIGH + SHIN) * 0.995;

// 2-bone IK in the parent's space. Rest: the chain hangs along −Y and bends about local X
// (legs: shin goes back, so the knee points +Z; arms: forearm comes forward). Returns the joint angle; outQ = root rotation.
function solve(S, T, pole, a, b, leg, outQ) {
  _d.subVectors(T, S); let d = _d.length();
  if (d < 1e-6) { _d.set(0, -1, 0); d = 1e-6; } else _d.divideScalar(d);
  const dc = clamp(d, Math.abs(a - b) + 0.03, (a + b) * 0.9995);
  const x = (a * a - b * b + dc * dc) / (2 * dc), r = Math.sqrt(Math.max(0, a * a - x * x));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _pp.normalize();
  _E.copy(S).addScaledVector(_d, x).addScaledVector(_pp, r);
  _u.subVectors(_E, S).divideScalar(a);
  _Tc.copy(S).addScaledVector(_d, dc);
  _f.subVectors(_Tc, _E).divideScalar(b);
  _Y.copy(_u).negate();
  _Z.copy(_pp).addScaledVector(_u, -_pp.dot(_u)).normalize();
  if (!leg) _Z.negate();
  _X.crossVectors(_Y, _Z);
  _m.makeBasis(_X, _Y, _Z); outQ.setFromRotationMatrix(_m);
  const ang = Math.acos(clamp(_u.dot(_f), -1, 1));
  return leg ? ang : -ang;
}

function apply(p, P, k) {
  const body = p.body;
  // joints the normal pose never sets: start them from rest so nothing is left over
  for (const L of p.legs) { L.hip.rotation.y = 0; L.knee.rotation.y = 0; L.knee.rotation.z = 0; L.foot.rotation.set(0, 0, 0); }
  for (const A of p.arms) { A.sh.rotation.y = 0; A.el.rotation.y = 0; }
  if (p.headG) p.headG.rotation.z = 0;

  _e.set(P.bx, P.by, P.bz, 'XYZ'); qB.setFromEuler(_e); qBi.copy(qB).invert();
  _bp.set(0, HIP_H, 0).applyQuaternion(qB);
  _bp.set(P.x - _bp.x, P.y - _bp.y, P.z - _bp.z);                            // body origin that puts the pelvis at (x, y, z)

  // ankle targets from the foot ground targets (heel-up pivots on the ball, toe-up on the heel)
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], sx = i ? 1 : -1, yaw = sx * P[S.fw], pit = P[S.fp];
    const pl = pit >= 0 ? BALL : HEEL;
    _e.set(0, yaw, 0, 'YXZ'); qY.setFromEuler(_e);
    _e.set(pit, yaw, 0, 'YXZ'); qF.setFromEuler(_e);
    _flat.set(sx * P[S.fx], Math.max(0, P[S.fy]) + 0.075, P[S.fz]);
    _A[i].copy(_flat).add(_v.copy(pl).applyQuaternion(qY)).sub(_w.copy(pl).applyQuaternion(qF));
  }
  // standing: if a planted foot is out of reach, lower the body until it reaches (feet never float)
  if (Math.abs(P.bx) < 0.6) {
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      if (P[SIDE[i].fy] > 0.03) continue;
      const sx = i ? 1 : -1;
      _S.set(sx * 0.095, HIP_H, 0).applyQuaternion(qB).add(_bp);
      _v.subVectors(_A[i], _S);
      const L2 = _v.lengthSq();
      if (L2 > LEG_MAX * LEG_MAX) {
        const disc = _v.y * _v.y - (L2 - LEG_MAX * LEG_MAX);
        drop = Math.max(drop, disc > 0 ? -_v.y - Math.sqrt(disc) : -_v.y);
      }
    }
    _bp.y -= drop;
  }

  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], sx = i ? 1 : -1, L = p.legs[i];
    _T.copy(_A[i]).sub(_bp).applyQuaternion(qBi);
    _S.set(sx * 0.095, HIP_H, 0);
    _pole.set(sx * P[S.k], 0, 1);
    const kn = solve(_S, _T, _pole, THIGH, SHIN, true, qH);
    _e.set(P[S.fp] + P[S.fa], sx * P[S.fw], 0, 'YXZ'); qF.setFromEuler(_e);   // foot: flat on the floor (plus pitch)
    qK.setFromAxisAngle(X_AXIS, kn);
    qL.copy(qB).multiply(qH).multiply(qK).invert().multiply(qF);
    L.hip.quaternion.slerp(qH, k);
    L.knee.rotation.x += (kn - L.knee.rotation.x) * k;
    L.foot.quaternion.slerp(qL, k);
  }

  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], sx = i ? 1 : -1, A = p.arms[i];
    _T.set(sx * P[S.hx], P[S.hy], P[S.hz]);
    const gw = P[S.gw];
    if (gw > 0) { _v.set(sx * P[S.gx], P[S.gy], P[S.gz]).sub(_bp).applyQuaternion(qBi); _T.lerp(_v, Math.min(1, gw)); }
    _S.set(sx * 0.21, 1.395, 0);
    _pole.set(sx * P[S.ex], P[S.ey], P[S.ez]);
    const el = solve(_S, _T, _pole, UPPER, FORE, false, qS);
    A.sh.quaternion.slerp(qS, k);
    A.el.rotation.x += (el - A.el.rotation.x) * k;
    A.el.rotation.z *= 1 - k;
  }

  if (p.headG) {
    p.headG.rotation.x += (P.nx - p.headG.rotation.x) * k;
    p.headG.rotation.y += (P.ny - p.headG.rotation.y) * k;
    p.headG.rotation.z = P.nz * k;
  }
  body.position.x += (_bp.x - body.position.x) * k;
  body.position.y += (_bp.y + (p.y || 0) - body.position.y) * k;
  body.position.z += (_bp.z - body.position.z) * k;
  body.rotation.x += (P.bx - body.rotation.x) * k;
  body.rotation.y += (P.by - body.rotation.y) * k;
  body.rotation.z += (P.bz - body.rotation.z) * k;
}

export function poseEmote(p, i, t, k) {
  const D = DANCES[i];
  if (!D || !p || !p.body) return;
  const b = Math.max(0, t) * D.bpm / 60;
  apply(p, D.fn(b), clamp(k, 0, 1));
}
