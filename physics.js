// Pure ball physics + shot solvers. No three.js — runs in the browser and in Node tests.
// Coordinates: x baseline→baseline (net plane at x = 0), y up, z sideline→sideline.

export const G = 9.81;
export const BALL_R = 0.07;       // real takraw ball is ~14 cm across
export const DRAG = 0.024;        // quadratic drag: a = -DRAG·|v|·v  (light, holey ball)
export const STEP = 1 / 240;

export const C = {
  hl: 7.7, hw: 3.5,               // half length / half width (court is 15% bigger than ISTAF)
  outX: 10.7, outZ: 6.5,          // ad boards (3 m free zone)
  postZ: 3.8,
  netTopMid: 1.52, netTopPost: 1.55, netDepth: 0.7,
  boardH: 0.8,
  // the game draws the ball much bigger than life (BALL_VIS in main.js): it lands — and hits the boards — when the
  // DRAWN ball touches, so the call always matches what you saw. Defaults to the real radius (tests / solvers in Node).
  floorR: BALL_R,
  // a ball touching the line is IN: the real ball's own radius overlapping the line counts
  lineIn: BALL_R,
};

export function netTop(z) {
  const t = Math.min(1, (z / C.postZ) ** 2);
  return C.netTopPost - (C.netTopPost - C.netTopMid) * (1 - t);
}

export const sideOfX = (x) => (x < 0 ? 'left' : 'right');
export const inCourt = (x, z) => Math.abs(x) <= C.hl + C.lineIn && Math.abs(z) <= C.hw + C.lineIn;
/** How far outside the court a landing is (m): > 0 out, <= 0 in (lines included). */
export const outBy = (x, z) => Math.max(Math.abs(x) - C.hl, Math.abs(z) - C.hw) - C.lineIn;
export const copyBall = (b) => ({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz });

/**
 * Advance the ball one step. Pushes events into `ev`:
 *  cross  – cleanly crossed over the net between the side tapes
 *  tape   – clipped the top tape and rolled over (still a cross)
 *  net    – hit the net and bounced back
 *  wide   – crossed the net line outside the side tapes
 *  under  – passed under the net
 *  floor  – touched the floor (rally over)
 *  board  – hit an ad board (rally over)
 * opts.noNet skips net collision (used by solvers).
 */
export function step(b, dt, ev, opts = {}) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const k = DRAG * sp;
  b.vx -= b.vx * k * dt;
  b.vy -= (G + b.vy * k) * dt;
  b.vz -= b.vz * k * dt;
  const px = b.x;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

  if (!opts.noNet && (px < 0) !== (b.x < 0)) {
    const az = Math.abs(b.z);
    const top = netTop(b.z), bottom = top - C.netDepth;
    if (az > C.hw + BALL_R) {
      ev && ev.push({ type: 'wide', x: b.x, y: b.y, z: b.z });
    } else if (b.y > top + BALL_R) {
      ev && ev.push({ type: 'cross', x: b.x, y: b.y, z: b.z });
    } else if (b.y > top - BALL_R * 0.6) {
      // let-cord: dribbles over the tape
      b.vx *= 0.5; b.vz *= 0.7; b.vy = Math.abs(b.vy) * 0.3 + 0.8;
      ev && ev.push({ type: 'tape', x: b.x, y: b.y, z: b.z });
    } else if (b.y >= bottom - BALL_R) {
      // drops back off the net on the side it came from — held clear of the mesh by the DRAWN ball's radius, so it
      // never sits inside the net, and always moving a little away from it
      const back = px < 0 ? -1 : 1;
      b.x = back * Math.max(BALL_R, C.floorR + 0.02);
      b.vx = back * Math.max(0.6, Math.abs(b.vx) * 0.2); b.vy *= 0.5; b.vz *= 0.6;
      ev && ev.push({ type: 'net', x: b.x, y: b.y, z: b.z });
    } else {
      ev && ev.push({ type: 'under', x: b.x, y: b.y, z: b.z });
    }
  }

  if ((Math.abs(b.x) > C.outX - C.floorR || Math.abs(b.z) > C.outZ - C.floorR) && b.y < C.boardH + C.floorR) {
    ev && ev.push({ type: 'board', x: b.x, y: b.y, z: b.z });
    return true;
  }
  if (b.y <= C.floorR) {
    b.y = C.floorR;
    ev && ev.push({ type: 'floor', x: b.x, y: b.y, z: b.z });
    return true;
  }
  return false;
}

/** Run the ball forward until it ends (floor/board) or maxT. Returns { end, events, t }. */
export function simulate(b0, maxT = 4, opts = {}) {
  const b = copyBall(b0);
  const events = [];
  let t = 0;
  while (t < maxT) {
    t += STEP;
    if (step(b, STEP, events, opts)) break;
  }
  const end = events.find((e) => e.type === 'floor' || e.type === 'board') || null;
  return { end, events, t, ball: b };
}

const projDist = (from, dir, p) => (p.x - from.x) * dir.x + (p.z - from.z) * dir.z;

/**
 * Launch with a chosen apex height and find the horizontal speed that lands on `target`.
 * If the shot is meant to cross the net and would hit it, the apex is raised.
 */
export function solveApex(from, target, apex, crossNet = true) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const D = Math.hypot(dx, dz) || 1e-6;
  const dir = { x: dx / D, z: dz / D };
  let H = Math.max(apex, from.y + 0.25);
  for (let attempt = 0; attempt < 10; attempt++) {
    const vy = Math.sqrt(2 * G * (H - from.y));
    let lo = 0, hi = 45;
    for (let i = 0; i < 22; i++) {
      const h = (lo + hi) / 2;
      const r = simulate({ x: from.x, y: from.y, z: from.z, vx: dir.x * h, vy, vz: dir.z * h }, 5, { noNet: true });
      if (projDist(from, dir, r.ball) < D) lo = h; else hi = h;
    }
    const h = (lo + hi) / 2;
    const v = { x: from.x, y: from.y, z: from.z, vx: dir.x * h, vy, vz: dir.z * h };
    if (!crossNet) return v;
    const r = simulate(v, 5);
    if (!r.events.some((e) => e.type === 'net' || e.type === 'tape' || e.type === 'under')) return v;
    H += 0.3;
  }
  // give up: lob it high
  const vy = Math.sqrt(2 * G * (H - from.y));
  return { x: from.x, y: from.y, z: from.z, vx: dir.x * 6, vy, vz: dir.z * 6 };
}

/**
 * Launch at a fixed speed (spikes) and find the elevation that lands on `target`.
 * If that line would hit the net, steepen it upward until it clears (the ball lands deeper).
 */
export function solveSpeed(from, target, V) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const D = Math.hypot(dx, dz) || 1e-6;
  const dir = { x: dx / D, z: dz / D };
  const mk = (th) => ({ x: from.x, y: from.y, z: from.z,
    vx: dir.x * V * Math.cos(th), vy: V * Math.sin(th), vz: dir.z * V * Math.cos(th) });
  const land = (th) => projDist(from, dir, simulate(mk(th), 4, { noNet: true }).ball);
  let lo = -1.3, hi = 0.7;
  if (land(hi) < D) return mk(hi);
  for (let i = 0; i < 24; i++) {
    const th = (lo + hi) / 2;
    if (land(th) < D) lo = th; else hi = th;
  }
  let th = (lo + hi) / 2;
  const clears = (t) => !simulate(mk(t), 4).events.some((e) => e.type === 'net' || e.type === 'tape' || e.type === 'under');
  if (!clears(th)) {
    let a = th, b = 0.9;
    for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (clears(m)) b = m; else a = m; }
    th = b;
  }
  return mk(th);
}
