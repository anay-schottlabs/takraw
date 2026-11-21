// SPECTATORS — where a spectator may walk on each map, and their third-person camera.
// The walkable ground comes from spectate-grids.js: a 0.5 m grid of every map (both court sizes), sampled from the real scene
// (High + Ultra merged): each cell is floor (with its height), water / a drop, or blocked — plus how high the scenery reaches.
// Spectators walk the floor OUTSIDE the ad boards / railing, on the biggest connected stretch of it — never on the court.
import { GRIDS, GRID } from './spectate-grids.js';

const { X0, Z0, S, W, H } = GRID;
const decode = (rle) => { let out = ''; for (const m of rle.matchAll(/(\d*)(.)/g)) out += m[2].repeat(m[1] ? +m[1] : 1); return out; };
const FLOOR_LO = -0.3, FLOOR_STEP = 0.03, TOP_STEP = 0.5;
const ROOM = 0.42;          // keep this far outside the ball's boundary (boards / railing)

export function makeZone(map, size, F) {
  const raw = GRIDS[`${map}:${size}`] || GRIDS[`${map}:normal`];
  const ground = raw ? decode(raw[0]) : '', tops = raw ? decode(raw[1]) : '';
  const kind = new Int8Array(W * H);        // 0 water / drop, 1 floor, 2 blocked
  const val = new Float32Array(W * H);      // floor height
  const topV = new Float32Array(W * H).fill(-Infinity);   // how high the scenery reaches (camera)
  for (let k = 0; k < W * H; k++) {
    const c = ground[k] || '_', t = tops[k] || '.';
    if (c >= 'A' && c <= 'P') { kind[k] = 1; val[k] = FLOOR_LO + (c.charCodeAt(0) - 65) * FLOOR_STEP; }
    else if (c === '#') kind[k] = 2;
    if (t >= 'a' && t <= 'z') topV[k] = (t.charCodeAt(0) - 96) * TOP_STEP;
  }
  const ix = (x) => Math.round((x - X0) / S), iz = (z) => Math.round((z - Z0) / S);
  const at = (x, z) => { const i = ix(x), j = iz(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
  const outside = (x, z) => Math.abs(x) > F.outX + ROOM || Math.abs(z) > F.outZ + ROOM;
  // floor cells off the court, then only the connected stretch that best rings the court (most ground near the boundary)
  const ok = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (kind[k] === 1 && outside(X0 + (k % W) * S, Z0 + Math.floor(k / W) * S)) ok[k] = 1;
  const near = (k) => { const x = Math.abs(X0 + (k % W) * S), z = Math.abs(Z0 + Math.floor(k / W) * S); return Math.max(x - F.outX, z - F.outZ) < 4; };
  const comp = new Int32Array(W * H).fill(-1);
  let best = -1, bestN = 0, nComp = 0;
  for (let k = 0; k < W * H; k++) {
    if (!ok[k] || comp[k] >= 0) continue;
    const q = [k]; comp[k] = nComp; let n = 0;
    while (q.length) {
      const c = q.pop(); if (near(c)) n++;
      for (const d of [-1, 1, -W, W]) { const e = c + d; if (e >= 0 && e < W * H && ok[e] && comp[e] < 0 && Math.abs((e % W) - (c % W)) <= 1) { comp[e] = nComp; q.push(e); } }
    }
    if (n > bestN) { bestN = n; best = nComp; }
    nComp++;
  }
  for (let k = 0; k < W * H; k++) ok[k] = ok[k] && comp[k] === best ? 1 : 0;
  const has = bestN > 0;
  const walk = (x, z) => { if (!outside(x, z)) return false; const k = at(x, z); return k >= 0 && ok[k] === 1; };
  const floorY = (x, z) => { const k = at(x, z); return k >= 0 && kind[k] === 1 ? val[k] : 0; };
  // how high the scenery reaches here (for the camera); void / floor = nothing to hit
  const top = (x, z) => { const k = at(x, z); return k >= 0 && kind[k] === 2 ? topV[k] : -Infinity; };   // (things overhead with open ground below — lanterns, wires, canopies — don't count)
  // a spot for spectator #n: around the court, the n-th of a few nice viewing angles
  function spawn(n = 0) {
    const [sx, sz] = [[0, 1], [0, -1], [0.55, 1], [-0.55, 1], [0.55, -1], [-0.55, -1], [1, 0], [-1, 0]][n % 8];
    const tx = sx * (F.outX + 1.5), tz = sz * (F.outZ + 1.6);
    let bk = -1, bd = Infinity;
    for (let k = 0; k < W * H; k++) if (ok[k]) {
      const x = X0 + (k % W) * S, z = Z0 + Math.floor(k / W) * S;
      if (!walk(x - 0.25, z) || !walk(x + 0.25, z) || !walk(x, z - 0.25) || !walk(x, z + 0.25)) continue;
      const d = (x - tx) ** 2 + (z - tz) ** 2; if (d < bd) { bd = d; bk = k; }
    }
    if (bk < 0) return { x: 0, z: F.outZ + 1.2 };
    return { x: X0 + (bk % W) * S, z: Z0 + Math.floor(bk / W) * S };
  }
  return { has, walk, floorY, top, spawn };
}

const BODY = 0.24;
const fits = (zone, x, z) => zone.walk(x, z) && zone.walk(x + BODY, z) && zone.walk(x - BODY, z) && zone.walk(x, z + BODY) && zone.walk(x, z - BODY);
/** Move a spectator by (dx, dz), sliding along whatever stops it. Others: [{x, z}] to keep a little apart from. */
export function moveSpectator(zone, p, dx, dz, others = []) {
  for (const o of others) {                            // gentle separation from other spectators
    const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz);
    if (d < 0.6 && d > 1e-4) { dx += (ox / d) * (0.6 - d) * 0.5; dz += (oz / d) * (0.6 - d) * 0.5; }
  }
  if (fits(zone, p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return; }
  if (fits(zone, p.x + dx, p.z)) p.x += dx;
  else if (fits(zone, p.x, p.z + dz)) p.z += dz;
}

/** Third-person camera: behind the spectator on the line out from the court, always looking at the court. */
export function spectatorCamera(zone, p, look, outPos, outLook) {
  let ox = p.x, oz = p.z;
  const len = Math.hypot(ox, oz) || 1; ox /= len; oz /= len;          // out from the court's centre
  const D = 4.6, HC = 2.6;
  let d = D;
  for (let t = 0.75; t <= D + 0.5; t += 0.25) {                         // pull in before anything as tall as the camera
    const cx = p.x + ox * t, cz = p.z + oz * t, hi = (dx, dz) => (zone.top(cx + dx, cz + dz) > HC - 0.3 ? 1 : 0);
    if (hi(0, 0) && hi(-oz * 0.5, ox * 0.5) + hi(oz * 0.5, -ox * 0.5) >= 1) { d = Math.max(1.6, t - 0.5); break; }   // a wall / trunk — not a thin pole
  }
  const fy = zone.floorY(p.x, p.z);
  const k = (D - d) / (D - 1.6);                                        // 0 = room to stand back, 1 = right up against something
  outPos.set(p.x + ox * d, fy + HC + k * 0.5, p.z + oz * d);
  // aim past you at the court (you stay in the lower part of the shot), drifting a little toward the ball
  const ahead = 3.2 - k * 1.7;                                          // camera pulled in close: aim nearer so you stay in the shot
  const ax = p.x - ox * ahead, az = p.z - oz * ahead;
  outLook.set(ax + (look.x - ax) * 0.2, fy + 0.35, az + (look.z - az) * 0.2);
}
