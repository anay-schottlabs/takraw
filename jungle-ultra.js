// JUNGLE WATERFALL — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on
// Ultra. Replaces the low-poly pieces (`lite` in jungle.js: floor, cliff, falls, pool, trees, vines, understory, boulders,
// spray, fireflies, mushrooms) with:
//  • a smooth leaf-litter forest floor (Poly Haven texture) that falls away on the −z side into a deep valley, so from
//    the clearing you look out over a sea of canopy and mist to layered moonlit ridges;
//  • a stratified, mossy gorge wall with a THREE-TIER WATERFALL (shelves, undercut lips, a channel cut into the rock):
//    animated sheets of falling water with streaks and clumps, ragged edges, churning feet, spray + mist drifting off
//    each landing, a plunge pool that mirrors the falls and the wall (planar reflection), ripples and foam rings;
//  • a stream winding along the edge of the clearing that tumbles over the brink into the valley;
//  • layered rainforest: buttress-rooted emergent giants, mid-canopy trees, understory trees, palms, bananas, tree
//    ferns, ferns, elephant ears and gingers (all leaf-card foliage from one painted atlas, alpha-to-coverage edges,
//    gentle sway), lianas looping between trunks, hanging vines, curtains of creepers down the wall, mossy boulders and
//    fallen logs;
//  • night life: swarms of fireflies, glowing fungi (caps, shelf brackets, a soft glow on the ground), moonbeams through
//    the canopy, flying foxes circling the gorge, a pair of hornbills crossing high above, mist in the valley.
// GAMEPLAY RULE: nothing new on or over the court + free zone (a clear band ≥ 2 m round the boundary); anything that
// moves or glows keeps ≥ ~24° off the axis of both match cameras (`offAxis`) — straight down the court there is only the
// dark, still forest.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, softTexture, TAU } from './temple-ultra.js';
import { makeFireflies } from './life.js';

const REFL = 5;                                   // meshes on this layer show up in the plunge pool's reflection
const MOON = new THREE.Vector3(-7, 15, -14).normalize();   // main.js LIGHT_POS.night
const _o = new THREE.Object3D();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- deterministic value noise ---------------- */
function noise2(seed) {
  const h = (x, y) => {
    let n = (Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801) ^ Math.imul(seed, 2654435761)) >>> 0;
    n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0; n = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o = 5) => { let s = 0, a = 0.5, t = 0; for (let i = 0; i < o; i++) { s += n2(x, y) * a; t += a; a *= 0.5; x = x * 2.03 + 11.7; y = y * 2.03 + 5.3; } return s / t; };
  const ridged = (x, y, o = 4) => {
    let s = 0, a = 0.5, w = 1, t = 0;
    for (let i = 0; i < o; i++) { let n = 1 - Math.abs(n2(x, y) * 2 - 1); n *= n * w; w = Math.min(1, Math.max(0, n * 1.8)); s += n * a; t += a; a *= 0.5; x = x * 2.07 + 3.1; y = y * 2.07 + 9.7; }
    return s / t;
  };
  return { n2, fbm, ridged };
}

// is (x, z) far enough off the axis of both match cameras (at x = ±14.6 looking along ∓x) for something that moves / glows?
function offAxis(x, z, deg = 24) {
  const t = Math.tan((deg * Math.PI) / 180);
  for (const cx of [-14.6, 14.6]) { const fwd = cx < 0 ? x - cx : cx - x; if (fwd > 0 && Math.abs(z) < fwd * t) return false; }
  return true;
}

/* ---------------- a tiny indexed geometry builder ---------------- */
class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  vert(p, n, u, v) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.u.push(u, v); return this.count - 1; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
// a tube along `pts` (parallel-transport frames). uvFix: every vertex gets that uv (a flat patch of the atlas)
function tube(G, pts, rad, radial, uRep = 1, vScale = 0.5, uvFix = null) {
  const n = pts.length, T = [];
  for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; T.push(b.clone().sub(a).normalize()); }
  const nrm = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0).cross(T[0]).normalize() : V(1, 0, 0).cross(T[0]).normalize();
  const base = G.count, ax = V(), d = V(), p = V();
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      ax.copy(T[i - 1]).cross(T[i]);
      if (ax.lengthSq() > 1e-12) nrm.applyAxisAngle(ax.normalize(), Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1)));
      len += pts[i].distanceTo(pts[i - 1]);
    }
    const bin = T[i].clone().cross(nrm).normalize();
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU;
      d.copy(nrm).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      p.copy(pts[i]).addScaledVector(d, rad[i]);
      G.vert(p, d, uvFix ? uvFix[0] : (k / radial) * uRep, uvFix ? uvFix[1] : len * vScale);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) {
    const a = base + i * (radial + 1) + k, b = a + radial + 1;
    G.quad(a, a + 1, b + 1, b);
  }
}
// a flat card (leaf cluster) centred at c, facing nrm, rotated `rot` about it; normals bent away from `from` (rounder crowns)
function card(G, c, nrm, w, h, cell, rot = 0, from = null) {
  const n = nrm.clone().normalize();
  const t1 = (Math.abs(n.y) < 0.95 ? V(0, 1, 0) : V(1, 0, 0)).cross(n).normalize().applyAxisAngle(n, rot), t2 = n.clone().cross(t1);
  const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const p = c.clone().addScaledVector(t1, (a * w) / 2).addScaledVector(t2, (b * h) / 2);
    const nn = from ? p.clone().sub(from).normalize().lerp(n, 0.35).normalize() : n;
    return G.vert(p, nn, a < 0 ? cell[0] : cell[2], b < 0 ? cell[1] : cell[3]);
  });
  G.quad(ids[0], ids[1], ids[2], ids[3]);
}
// an arching strip along a curved rachis (palm / fern frond, banana leaf). cell u runs base → tip, v across.
function frond(G, base, az, L, elev, droop, width, fold, cell, segs = 10, wFn = null) {
  const hz = V(Math.cos(az), 0, Math.sin(az)), up = V(0, 1, 0), side = V(Math.sin(az), 0, -Math.cos(az));
  const P = (s) => base.clone().addScaledVector(hz, L * s * Math.cos(elev)).addScaledVector(up, L * s * Math.sin(elev) - droop * L * s * s);
  const vm = (cell[1] + cell[3]) / 2;
  let prev = null;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs, p = P(s), tg = P(Math.min(1, s + 0.02)).sub(P(Math.max(0, s - 0.02))).normalize();
    const nm = tg.clone().cross(side).normalize();
    const w = width * (wFn ? wFn(s) : 1) / 2, fd = fold * w;
    const u = cell[0] + (cell[2] - cell[0]) * s;
    const l = G.vert(p.clone().addScaledVector(side, -w).addScaledVector(nm, -fd), nm.clone().addScaledVector(side, -fold).normalize(), u, cell[3]);
    const m = G.vert(p, nm, u, vm);
    const r = G.vert(p.clone().addScaledVector(side, w).addScaledVector(nm, -fd), nm.clone().addScaledVector(side, fold).normalize(), u, cell[1]);
    if (prev) { G.quad(prev[0], prev[1], m, l); G.quad(prev[1], prev[2], r, m); }
    prev = [l, m, r];
  }
}

/* ---------------- the foliage atlas: every leaf in the scene, painted once ---------------- */
const AS = 2048;
const CELL = (x0, y0, x1, y1, pad = 3) => [(x0 + pad) / AS, 1 - (y1 - pad) / AS, (x1 - pad) / AS, 1 - (y0 + pad) / AS];   // [u0, vBottom, u1, vTop]
const PATCH = (x, y) => [x / AS, 1 - y / AS];
const A = {
  crown: CELL(0, 0, 1024, 1024), palm: CELL(1024, 0, 2048, 512), fern: CELL(1024, 512, 2048, 1024), banana: CELL(0, 1024, 1024, 1408),
  aloc: CELL(1024, 1024, 1536, 1536), vine: CELL(1536, 1024, 2048, 2048, 0), blades: CELL(0, 1536, 1024, 2048), curtain: CELL(1024, 1536, 1536, 2048),
  stem: PATCH(128, 1472), fernTrunk: PATCH(384, 1472), petiole: PATCH(640, 1472), brown: PATCH(896, 1472),
};
function paintAtlas(R) {
  const T = document.createElement('canvas'); T.width = T.height = AS;
  const g = T.getContext('2d');
  const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${a})`;
  const leafPath = (len, wid, bend = 0) => {
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.22, -wid * 1.1, len * 0.62, -wid * 0.95 + bend * 0.5, len, bend);
    g.bezierCurveTo(len * 0.62, wid * 0.95 + bend * 0.5, len * 0.22, wid * 1.1, 0, 0);
    g.closePath();
  };
  const leaf = (x, y, ang, len, wid, h, s, l, veins = 0, bend = 0) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    leafPath(len, wid, bend);
    const gr = g.createLinearGradient(0, -wid, 0, wid);
    gr.addColorStop(0, hsl(h, s, l * 0.72)); gr.addColorStop(0.48, hsl(h - 4, s, l * 1.12)); gr.addColorStop(0.52, hsl(h, s, l * 0.95)); gr.addColorStop(1, hsl(h + 4, s, l * 0.68));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = hsl(h - 12, s * 0.7, Math.min(78, l * 1.7), 0.6); g.lineWidth = Math.max(1, wid * 0.07);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, bend * 0.4, len * 0.96, bend * 0.95); g.stroke();
    if (veins) {
      g.lineWidth = Math.max(0.6, wid * 0.03); g.strokeStyle = hsl(h - 10, s * 0.6, Math.min(70, l * 1.45), 0.35);
      for (let k = 1; k < veins; k++) {
        const t = k / veins, x0 = len * t * 0.88, w = wid * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.1)) * 0.8;
        g.beginPath(); g.moveTo(x0, bend * t * 0.5); g.quadraticCurveTo(x0 + w * 0.5, -w * 0.45, x0 + w * 0.95, -w); g.moveTo(x0, bend * t * 0.5); g.quadraticCurveTo(x0 + w * 0.5, w * 0.45, x0 + w * 0.95, w); g.stroke();
      }
    }
    g.restore();
  };
  const clip = (x, y, w, h) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); };

  // crown: a rosette of broad leaves on twigs (reads as a leafy clump from any side)
  clip(0, 0, 1024, 1024);
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) { const a = R() * TAU; g.strokeStyle = '#3b3122'; g.lineWidth = 8 - k * 0.6; g.beginPath(); g.moveTo(512, 512); g.quadraticCurveTo(512 + Math.cos(a + 0.3) * 120, 512 + Math.sin(a + 0.3) * 120, 512 + Math.cos(a) * 260, 512 + Math.sin(a) * 260); g.stroke(); }
  for (const [n, l0] of [[18, 22], [18, 28], [14, 34]]) for (let i = 0; i < n; i++) {
    const a = R() * TAU, r0 = 30 + R() * 130, len = Math.min(220 + R() * 160, 492 - r0);
    leaf(512 + Math.cos(a) * r0, 512 + Math.sin(a) * r0, a + (R() - 0.5) * 0.7, len, len * (0.2 + R() * 0.07), 96 + R() * 26, 34 + R() * 18, l0 + R() * 10, 7, (R() - 0.5) * 30);
  }
  g.restore();
  // palm frond: leaflets either side of a rachis, base → tip along +x
  clip(1024, 0, 1024, 512);
  for (let i = 0; i < 52; i++) {
    const t = 0.03 + (i / 52) * 0.95, x = 1030 + t * 1000, L = 232 * Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * t)), 0.6);
    for (const sd of [-1, 1]) leaf(x, 256, sd * (0.85 - 0.35 * t) + (R() - 0.5) * 0.12, L * (0.9 + R() * 0.15), 9 + R() * 4, 92 + R() * 18, 38 + R() * 12, 30 + R() * 10, 0, sd * (6 + R() * 10));
  }
  g.strokeStyle = hsl(60, 28, 30); for (let i = 0; i < 20; i++) { g.lineWidth = 9 - i * 0.35; g.beginPath(); g.moveTo(1030 + i * 50, 256); g.lineTo(1030 + (i + 1) * 50, 256); g.stroke(); }
  g.restore();
  // fern frond: pinnae of little pinnules
  clip(1024, 512, 1024, 512);
  for (let i = 0; i < 42; i++) {
    const t = (i + 0.5) / 42, x = 1030 + t * 1000, L = 215 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.97)), 0.85);
    for (const sd of [-1, 1]) {
      const ang = sd * (1.02 - 0.28 * t), m = Math.max(2, Math.floor(L / 10));
      g.strokeStyle = hsl(95, 35, 26); g.lineWidth = 2; g.beginPath(); g.moveTo(x, 768); g.lineTo(x + Math.cos(ang) * L, 768 + Math.sin(ang) * L); g.stroke();
      for (let j = 0; j < m; j++) {
        const tj = j / m, px = x + Math.cos(ang) * tj * L, py = 768 + Math.sin(ang) * tj * L, pl = (1 - tj * 0.8) * 20 + 4;
        const hh = 98 + R() * 16, ll = 32 + R() * 10;
        leaf(px, py, ang - 0.95, pl, pl * 0.36, hh, 46, ll); leaf(px, py, ang + 0.95, pl, pl * 0.36, hh, 46, ll);
      }
    }
  }
  g.strokeStyle = hsl(70, 30, 26); g.lineWidth = 5; g.beginPath(); g.moveTo(1030, 768); g.lineTo(2040, 768); g.stroke();
  g.restore();
  // banana leaf: a huge paddle with parallel veins, torn by the wind
  clip(0, 1024, 1024, 384);
  {
    g.save(); g.translate(10, 1216);
    const L = 1004, W = 178;
    const shape = () => { g.beginPath(); g.moveTo(0, -W * 0.15); g.bezierCurveTo(L * 0.06, -W, L * 0.8, -W * 1.04, L * 0.985, -W * 0.35); g.quadraticCurveTo(L * 1.005, 0, L * 0.985, W * 0.35); g.bezierCurveTo(L * 0.8, W * 1.04, L * 0.06, W, 0, W * 0.15); g.closePath(); };
    shape();
    const gr = g.createLinearGradient(0, -W, 0, W);
    gr.addColorStop(0, hsl(84, 42, 24)); gr.addColorStop(0.46, hsl(88, 48, 40)); gr.addColorStop(0.54, hsl(90, 46, 36)); gr.addColorStop(1, hsl(86, 42, 23));
    g.fillStyle = gr; g.fill();
    g.save(); shape(); g.clip();
    g.strokeStyle = hsl(80, 40, 46, 0.22); g.lineWidth = 1.5;
    for (let x = 14; x < L; x += 7) for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 70, sd * 175); g.stroke(); }
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3;
    for (const sd of [-1, 1]) for (let k = 0; k < 13; k++) { const x = L * (0.1 + R() * 0.82), f = 0.3 + R() * 0.65; g.beginPath(); g.moveTo(x + 72, sd * 182); g.lineTo(x + 72 - 70 * f, sd * 182 * (1 - f)); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = hsl(34, 40, 28, 0.7); g.lineWidth = 7; shape(); g.stroke();
    g.restore();
    g.strokeStyle = hsl(70, 40, 56); g.lineWidth = 9; g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.99, 0); g.stroke();
    g.restore();
  }
  g.restore();
  // flat patches: banana stem, tree-fern trunk, petiole, dead brown
  for (const [x, c1, c2] of [[0, [86, 30, 30], [70, 26, 24]], [256, [24, 28, 15], [20, 24, 10]], [512, [92, 34, 33], [80, 30, 26]], [768, [32, 34, 24], [28, 30, 18]]]) {
    g.fillStyle = hsl(...c1); g.fillRect(x, 1408, 256, 128);
    for (let i = 0; i < 60; i++) { g.fillStyle = hsl(...c2, 0.5); g.fillRect(x + R() * 256, 1408, 1 + R() * 3, 128); }
  }
  // alocasia: an arrow-shaped leaf with pale veins (petiole at the top centre)
  clip(1024, 1024, 512, 512);
  {
    g.save(); g.translate(1024, 1024);
    const shape = () => { g.beginPath(); g.moveTo(256, 120); g.bezierCurveTo(150, 10, 20, 40, 34, 190); g.bezierCurveTo(52, 330, 180, 420, 256, 500); g.bezierCurveTo(332, 420, 460, 330, 478, 190); g.bezierCurveTo(492, 40, 362, 10, 256, 120); g.closePath(); };
    shape();
    const gr = g.createRadialGradient(256, 200, 20, 256, 260, 300);
    gr.addColorStop(0, hsl(138, 34, 30)); gr.addColorStop(1, hsl(146, 38, 17));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = hsl(95, 22, 70, 0.85); g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(256, 122); g.lineTo(256, 492); g.stroke();
    g.lineWidth = 3.5;
    for (let k = 0; k < 5; k++) for (const sd of [-1, 1]) { const y0 = 150 + k * 62; g.beginPath(); g.moveTo(256, y0); g.quadraticCurveTo(256 + sd * 90, y0 + 10, 256 + sd * (190 - k * 26), y0 + 70 - k * 4); g.stroke(); }
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(256, 125); g.quadraticCurveTo(256 + sd * 120, 70, 256 + sd * 205, 70); g.stroke(); }
    g.lineWidth = 3; g.strokeStyle = hsl(95, 20, 66, 0.55); shape(); g.stroke();
    g.restore();
  }
  g.restore();
  // vine strand: a stem with small heart leaves, seamless top ↔ bottom
  clip(1536, 1024, 512, 1024);
  {
    const sx = (y) => 1536 + 256 + 34 * Math.sin((y / 1024) * TAU * 2);
    g.strokeStyle = hsl(78, 30, 24); g.lineWidth = 6; g.beginPath(); g.moveTo(sx(0), 1024); for (let y = 0; y <= 1024; y += 16) g.lineTo(sx(y), 1024 + y); g.stroke();
    const L = [];
    for (let y = 0; y < 1024; y += 40) L.push([y, (y / 40) % 2 ? 1 : -1, 0.45 + R() * 0.65, 64 + R() * 46, 96 + R() * 24, 28 + R() * 12]);
    for (const off of [-1024, 0, 1024]) for (const [y, sd, a, len, h, l] of L) leaf(sx(y), 1024 + y + off, sd > 0 ? a : Math.PI - a, len, len * 0.42, h, 40, l, 4);
  }
  g.restore();
  // ground plants: a clump of long blades (gingers / lilies)
  clip(0, 1536, 1024, 512);
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 1.7, len = Math.min(240 + R() * 240, 480 / Math.max(0.3, Math.abs(Math.sin(a)) + 0.02), 480);
    leaf(512 + (R() - 0.5) * 40, 2040, a, len, 14 + R() * 12, 92 + R() * 26, 38 + R() * 14, 28 + R() * 12, 5, (R() - 0.5) * 60);
  }
  g.restore();
  // curtain of creepers (hangs down the gorge wall)
  clip(1024, 1536, 512, 512);
  for (let i = 0; i < 30; i++) {
    const x = 1034 + R() * 492, len = (i < 12 ? 140 : 220) + R() * 290;
    g.strokeStyle = hsl(70, 25, 22); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, 1536); g.lineTo(x + (R() - 0.5) * 30, 1536 + len); g.stroke();
    for (let y = 0; y < len; y += 13) { const sd = (y / 13) % 2 ? 1 : -1, l = 20 + R() * 20; leaf(x, 1536 + y, sd > 0 ? 0.7 + R() * 0.6 : Math.PI - 0.7 - R() * 0.6, l, l * 0.45, 96 + R() * 24, 40, 26 + R() * 12); }
  }
  g.restore();

  // colour map (the cut-outs bleed into a blurred copy, not black) + an alpha map
  const id = g.getImageData(0, 0, AS, AS), d = id.data;
  const Acv = document.createElement('canvas'); Acv.width = Acv.height = AS;
  const ag = Acv.getContext('2d'), ad = ag.createImageData(AS, AS);
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; ad.data[i] = ad.data[i + 1] = ad.data[i + 2] = a; ad.data[i + 3] = 255; }
  ag.putImageData(ad, 0, 0);
  const C = document.createElement('canvas'); C.width = C.height = AS;
  const cg = C.getContext('2d');
  cg.fillStyle = '#26361a'; cg.fillRect(0, 0, AS, AS);
  cg.filter = 'blur(10px)'; cg.drawImage(T, 0, 0); cg.drawImage(T, 0, 0); cg.filter = 'blur(3px)'; cg.drawImage(T, 0, 0); cg.filter = 'none';
  cg.drawImage(T, 0, 0);
  const col = new THREE.CanvasTexture(C); col.colorSpace = THREE.SRGBColorSpace; col.anisotropy = 8;
  const alpha = new THREE.CanvasTexture(Acv); alpha.anisotropy = 8;
  return { col, alpha };
}

/* ---------------- shared GLSL ---------------- */
const NOISE_GLSL = `
  float jh21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float jvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(jh21(i), jh21(i + vec2(1.0, 0.0)), f.x), mix(jh21(i + vec2(0.0, 1.0)), jh21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float jfbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += jvn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }`;

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildJungleUltra(ctx, uTime) {
  const { F, texLoader, POOL_Z, CLIFF_Z, scene } = ctx;
  const { outX, outZ } = F;
  const root = new THREE.Group(); root.name = 'jungle-ultra';
  const R = rng(9191), N = noise2(4242);
  const ticks = [];
  const load = (path, srgb, rep = 1) => {
    const t = texLoader.load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /* ---------------- 0. THE LAND: where everything is ---------------- */
  const TOP = 31, L3 = 9.6, L2 = 19.6, WATER_Y = -0.55;
  const zFace = (x) => CLIFF_Z - 2 + 0.006 * x * x;              // foot of the gorge wall (concave, sweeping away at the ends)
  const zBack = (x) => zFace(x) + 9;                               // where the top of the wall meets the plateau
  const Ht = (x) => TOP - 19 * sm(50, 95, Math.abs(x));             // height of the wall
  const bankZ = (x) => POOL_Z - 1 + 3.5 * Math.pow(Math.min(1, Math.abs(x) / 31), 4);
  const brinkZ = (x) => -27 - 2.5 * Math.sin(x * 0.045 + 1) - 0.004 * x * x;
  const liteH = (x, z) => { const d = Math.max(0, Math.max(Math.abs(x) - outX - 4, Math.abs(z) - outZ - 4)); return -0.12 + Math.min(4, d * 0.06) * (0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.06)); };
  const plateauH = (x, z) => Ht(x) + (N.fbm(x * 0.03 + 7, z * 0.03) - 0.45) * 10 * sm(0, 25, z - zBack(x)) - 1.1 * Math.exp(-(x * x) / 7) * sm(zBack(x) + 40, zBack(x), z);
  function baseH(x, z) {
    let y = liteH(x, z);
    if (Math.abs(x) < 33 && z > bankZ(x) - 1.5) { const s = sm(0, 1.8, z - bankZ(x)) * sm(31.5, 28.5, Math.abs(x)); y = lerp(y, -1.7, s); }
    const r = Math.max(Math.abs(x) - 25, Math.abs(z) - 17, 0);
    if (r > 0) y += (N.fbm(x * 0.013 + 3.3, z * 0.013 + 1.1) - 0.42) * 16 * sm(0, 45, r) + 7 * sm(20, 90, Math.abs(x) - 25);
    const zb = brinkZ(x);
    if (z < zb) { const k = zb - z; y -= 40 * sm(0, 48, k) - 46 * sm(70, 150, k); }
    const zf = zFace(x), zbk = zBack(x);
    if (z > zf + 3.5) y = lerp(y, plateauH(x, z), sm(zf + 3.5, zbk - 0.5, z));
    return y;
  }
  // the stream: out of the forest at +x, along the −z edge of the clearing, then over the brink into the valley
  const stream = [];
  {
    const cps = [[95, -62], [76, -48], [58, -38], [44, -29.5], [30, -24], [15, -21.2], [0, -21.6], [-12, -21], [-22, -22.6], [-28.5, -26.5], [-31.5, -32], [-33.5, -40], [-36, -50], [-39, -62], [-42, -78]];
    const curve = new THREE.CatmullRomCurve3(cps.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
    const pts = curve.getSpacedPoints(300);
    let s = 0, y = Infinity;
    pts.forEach((p, i) => {
      if (i) s += p.distanceTo(pts[i - 1]);
      y = Math.min(y, baseH(p.x, p.z) - 0.32);
      stream.push({ x: p.x, z: p.z, s, y, w: 1.15 + 0.45 * N.n2(s * 0.05, 3.3) });
    });
  }
  const sBox = [-60, 110, -95, -12];
  function streamAt(x, z) {
    if (x < sBox[0] || x > sBox[1] || z < sBox[2] || z > sBox[3]) return null;
    let best = 1e9, bi = 0;
    for (let i = 0; i < stream.length; i += 3) { const p = stream[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = i; } }
    for (let i = Math.max(0, bi - 3); i <= Math.min(stream.length - 1, bi + 3); i++) { const p = stream[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return { d: Math.sqrt(best), p: stream[bi] };
  }
  function groundH(x, z) {
    const b = baseH(x, z), st = streamAt(x, z);
    if (!st || st.d > st.p.w + 3) return b;
    return Math.min(b, lerp(st.p.y - 0.55, b, sm(st.p.w * 0.55, st.p.w + 1.8, st.d)));
  }
  // keep-outs
  const inBand = (x, z, pad) => Math.abs(x) < outX + pad && Math.abs(z) < outZ + pad;
  const clearE = (x, z) => (x / (outX + 11)) ** 2 + (z / (outZ + 9.5)) ** 2;
  const inPool = (x, z, pad = 0) => Math.abs(x) < 33 + pad && z > bankZ(x) - 1 - pad && z < zFace(x) + 3;
  const inCliff = (x, z, pad = 0) => z > zFace(x) - 1.5 - pad && z < zBack(x) + 1.5 + pad;
  const nearStream = (x, z, d) => { const st = streamAt(x, z); return st && st.d < st.p.w + d; };
  const onLand = (x, z) => !inPool(x, z) && !inCliff(x, z) && !nearStream(x, z, 0.6);

  /* ---------------- materials ---------------- */
  const atlas = paintAtlas(rng(77));
  const leafMat = new THREE.MeshStandardMaterial({ map: atlas.col, alphaMap: atlas.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, metalness: 0, envMapIntensity: 0.7 });
  leafMat.alphaToCoverage = true;
  const foliageShader = (hang) => (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = (hang ? 'attribute vec2 aHang;\n' : '') + 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        ${hang ? `
        float k = pow(aHang.x, 1.3);
        float ph = uTime * 0.55 + aHang.y * 6.28;
        transformed.x += sin(ph) * 0.018 * k + sin(uTime * 2.7 + position.y * 2.0 + aHang.y * 9.0) * 0.012 * min(aHang.x, 2.0);
        transformed.z += cos(ph * 0.8 + 1.3) * 0.014 * k;` : `
        float h = max(position.y, 0.0);
        float ph = uTime * 0.85 + ip.x * 0.11 + ip.z * 0.07;
        float sw = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * 0.0045 * h;
        float fl = sin(uTime * 3.1 + position.x * 4.0 + position.z * 3.3 + ip.x) * 0.022 * min(h, 1.5);
        transformed.x += sw + fl; transformed.z += sw * 0.6 - fl; transformed.y += fl * 0.4;`}
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <alphatest_fragment>', `
        { vec2 dx = dFdx(vAlphaMapUv * ${AS}.0), dy = dFdy(vAlphaMapUv * ${AS}.0); float md = max(dot(dx, dx), dot(dy, dy));
          diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(md, 1e-8))) * 0.3; }
        #include <alphatest_fragment>`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n { vec3 nn = vNormal; normal = dot(nn, nn) > 1e-10 ? normalize(nn) : vec3(0.0, 0.0, 1.0); }');
  };
  leafMat.onBeforeCompile = foliageShader(false);
  leafMat.customProgramCacheKey = () => 'jgLeaf';
  const vineMat = leafMat.clone(); vineMat.alphaToCoverage = true;
  vineMat.onBeforeCompile = foliageShader(true);
  vineMat.customProgramCacheKey = () => 'jgVine';

  const barkTex = load('assets/temple-ultra/bark_brown_02_diff.jpg', true), barkNor = load('assets/temple-ultra/bark_brown_02_nor_gl.jpg', false);
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, normalMap: barkNor, normalScale: new THREE.Vector2(1.1, 1.1), color: 0xb8ae9c, roughness: 0.9 });
  barkMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWN; varying vec3 vWP; varying float vLY;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWP = (wm * vec4(transformed, 1.0)).xyz; vec3 wn = mat3(wm) * objectNormal; vWN = dot(wn, wn) > 1e-12 ? normalize(wn) : vec3(0.0, 1.0, 0.0); vLY = position.y; }`);
    sh.fragmentShader = 'varying vec3 vWN; varying vec3 vWP; varying float vLY;\n' + NOISE_GLSL + "\n" + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float nz = jfbm(vWP.xz * 0.9 + vWP.y * 0.35);
        float moss = smoothstep(0.15, 0.75, vWN.y + (nz - 0.5) * 0.9) + smoothstep(2.2, 0.0, vLY) * 0.55 * smoothstep(0.35, 0.6, nz);
        float lich = smoothstep(0.62, 0.7, jfbm(vWP.xy * 1.7 + vWP.z * 0.6)) * 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.085, 0.022) * (0.55 + lum * 3.0), clamp(moss, 0.0, 0.9));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.17, 0.14), lich); }`);
  };
  barkMat.customProgramCacheKey = () => 'jgBark';

  const rockTex = load('assets/jungle-ultra/mossy_rock_diff.jpg', true);
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  rockMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTri = { value: rockTex };
    sh.vertexShader = 'attribute float aWet; varying float vWet; varying vec3 vWN; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWet = aWet; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      { vec3 wn = mat3(modelMatrix) * objectNormal; vWN = dot(wn, wn) > 1e-12 ? normalize(wn) : vec3(0.0, 1.0, 0.0); }`);
    sh.fragmentShader = `uniform sampler2D uTri; varying float vWet; varying vec3 vWN; varying vec3 vWP;
      vec3 triC(vec3 p, vec3 n, float s) {
        vec3 bw = pow(abs(n), vec3(4.0)); bw /= max(bw.x + bw.y + bw.z, 1e-6);
        return texture2D(uTri, p.zy * s).rgb * bw.x + texture2D(uTri, p.xz * s).rgb * bw.y + texture2D(uTri, p.xy * s).rgb * bw.z;
      }
      vec3 perturbB(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
        vec3 dx = dFdx(surf_pos), dy = dFdy(surf_pos);
        if (dot(dx, dx) < 1e-14 || dot(dy, dy) < 1e-14) return surf_norm;
        vec3 sX = normalize(dx), sY = normalize(dy);
        vec3 R1 = cross(sY, surf_norm), R2 = cross(surf_norm, sX);
        float det = dot(sX, R1) * fd; vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
        vec3 r = abs(det) * surf_norm - grad;
        return dot(r, r) > 1e-14 ? normalize(r) : surf_norm;
      }
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tc = triC(vWP, vWN, 0.22);
        vec3 tm = triC(vWP + 17.0, vWN, 0.045);
        float triH = dot(tc, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= tc * 4.0 * clamp(0.55 + dot(tm, vec3(0.2126, 0.7152, 0.0722)) * 3.0, 0.7, 1.35);
        diffuseColor.rgb *= mix(1.0, 0.55, vWet);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.28, vWet);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = perturbB(-vViewPosition, normal, vec2(dFdx(triH), dFdy(triH)) * 2.2, faceDirection);`);
  };
  rockMat.customProgramCacheKey = () => 'jgRock';

  /* ---------------- 1. TERRAIN ---------------- */
  const axis = (lo, hi, dLo, dHi, fine, coarse, grow) => {
    const up = []; let x = dLo; while (x < dHi) { up.push(x); x += fine; } up.push(dHi);
    x = dHi; while (x < hi) { x += fine + (coarse - fine) * Math.min(1, (x - dHi) / grow); up.push(Math.min(x, hi)); }
    const dn = []; x = dLo; while (x > lo) { x -= fine + (coarse - fine) * Math.min(1, (dLo - x) / grow); dn.push(Math.max(x, lo)); }
    return [...dn.reverse(), ...up];
  };
  {
    const xs = axis(-215, 215, -38, 38, 0.7, 12, 60), zs = axis(-240, 175, -36, 34, 0.7, 12, 60);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), colA = new Float32Array(nx * nz * 3);
    const c = new THREE.Color(), moss = new THREE.Color(0.5, 0.62, 0.3), earth = new THREE.Color(0.62, 0.52, 0.4), wet = new THREE.Color(0.3, 0.3, 0.24);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i, y = groundH(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x * 0.24; uv[k * 2 + 1] = z * 0.24;
      const n1 = N.fbm(x * 0.07, z * 0.07), dd = Math.max(Math.abs(x) - outX, Math.abs(z) - outZ);
      c.setRGB(0.7, 0.66, 0.56).multiplyScalar(0.8 + N.n2(x * 0.3, z * 0.3) * 0.4);
      c.lerp(moss, sm(0.45, 0.68, n1) * 0.85);
      if (dd < 4) c.lerp(earth, sm(4, 1, dd) * 0.75);
      if (y < -0.2) c.lerp(wet, sm(-0.2, -0.6, y));
      if (z > zBack(x) - 1) c.lerp(moss, 0.55);
      colA.set([c.r, c.g, c.b], k * 3);
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ map: load('assets/jungle-ultra/leaves_diff.jpg', true), normalMap: load('assets/jungle-ultra/leaves_nor_gl.jpg', false), normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 0.95 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 mac = texture2D(map, vWP.xz * 0.031 + 0.37).rgb;
            diffuseColor.rgb *= clamp(0.45 + dot(mac, vec3(0.3, 0.6, 0.1)) * 2.2, 0.65, 1.35);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * vec3(0.8, 0.95, 0.6), 0.3); }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.35, smoothstep(-0.25, -0.5, vWP.y));');
    };
    m.customProgramCacheKey = () => 'jgGround';
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------- 2. THE GORGE WALL ---------------- */
  const hwAt = (y) => lerp(lerp(4.3, 3.0, sm(L3 - 0.5, L3 + 0.5, y)), 2.2, sm(L2 - 0.5, L2 + 0.5, y));     // falls half-width
  const band = (y, L) => sm(L - 0.4, L - 1.3, y) * sm(L - 9, L - 6, y);
  function cliffZ(x, y) {
    const ax = Math.abs(x), wT = sm(17, 9, ax);
    const step = 2.4 * sm(L3 - 0.35, L3 + 0.35, y) + 2.2 * sm(L2 - 0.35, L2 + 0.35, y);
    const ledges = 0.9 * sm(5.8, 6.6, y + N.n2(x * 0.1, 1) * 2) + 1.2 * sm(14.2, 15, y + N.n2(x * 0.08, 2) * 3) + 0.9 * sm(24, 24.8, y + N.n2(x * 0.09, 3) * 3);
    const set = wT * step + (1 - wT) * (step * 0.3 + ledges) + y * 0.05;
    const ch = Math.exp(-((x / (hwAt(y) + 1.3)) ** 2));
    const under = 0.8 * (band(y, L3) + band(y, L2) + band(y, TOP - 0.9));
    const n = ((N.fbm(x * 0.07 + 5, y * 0.09) - 0.5) * 3.6 + (N.ridged(x * 0.21, y * 0.16) - 0.45) * 1.3 + Math.sin(y * 2.4 + N.fbm(x * 0.04, y * 0.04) * 9) * 0.16) * (1 - 0.98 * ch);
    return zFace(x) + set + ch * (1.4 + under) + n;
  }
  const notch = (x) => 0.9 * Math.exp(-((x / 2.8) ** 2));
  {
    const xs = axis(-92, 92, -40, 40, 0.5, 2.5, 30);
    const rows = [];
    for (let y = -2.5; y < TOP - 0.01;) { rows.push(y); y += [L3, L2].some((L) => Math.abs(y - L) < 0.7) ? 0.14 : 0.5; }
    rows.push(TOP);
    const nr = rows.length + 6, nx = xs.length;
    const pos = new Float32Array(nx * nr * 3), wetA = new Float32Array(nx * nr);
    for (let j = 0; j < nr; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], k = j * nx + i, hs = Ht(x) / TOP;
      let y, z;
      if (j < rows.length) { y = rows[j]; z = cliffZ(x, y); y = y * hs - notch(x) * sm(TOP - 3, TOP, y); }
      else { const b = j - rows.length + 1; y = Ht(x) - notch(x) + (N.n2(x * 0.3, b) - 0.5) * 0.5 + b * 0.05; z = cliffZ(x, TOP) + b * 1.7; }
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      wetA[k] = Math.exp(-((x / (hwAt(y) + 2.6)) ** 2)) * (y < TOP - 0.5 ? 1 : 0.6);
    }
    const idx = [];
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1; idx.push(a, d, e, a, e, b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wetA, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, colA = new Float32Array(nx * nr * 3), c = new THREE.Color();
    for (let k = 0; k < nx * nr; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], ny = nrm.getY(k);
      c.setRGB(0.62, 0.62, 0.58).multiplyScalar(0.85 + N.n2(x * 0.2, y * 0.2) * 0.3);
      if (N.fbm(x * 0.5, y * 0.025) > 0.6) c.multiplyScalar(0.7);                          // dark water stains down the face
      c.lerp(new THREE.Color(0.3, 0.42, 0.16), sm(0.25, 0.65, ny + (N.fbm(x * 0.2, y * 0.3) - 0.5) * 0.7) * 0.9);   // moss on every ledge
      colA.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    const mesh = new THREE.Mesh(geo, rockMat);
    mesh.receiveShadow = true; mesh.layers.enable(REFL);
    root.add(mesh);
  }

  /* ---------------- 3. ROCKS — mossy boulders round the pool, in it, at the wall's foot, along the stream, in the forest ---------------- */
  const rocks = [];          // [x, y, z, r, squash, wet]
  {
    for (let i = 0; i < 26; i++) { const x = -30 + (i / 25) * 60 + (R() - 0.5) * 1.5, z = bankZ(x) + 0.3 + R() * 0.9; if (Math.abs(x) < outX + 3 && z < outZ + 6) continue; rocks.push([x, -0.5, z, 0.35 + R() * 0.75, 0.6, 0.6]); }
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const z = bankZ(31) + 1 + i * 2.4 + R(); rocks.push([sd * (30.5 + R() * 2.5), groundH(sd * 31, z) - 0.4, z, 1.1 + R() * 1.6, 0.7, 0.3]); }
    const zl = cliffZ(0, -0.5);
    for (const [x, dz, r] of [[-5.6, -2.5, 1.3], [5.9, -2.0, 1.1], [-8.5, -0.8, 1.6], [8.8, -1.4, 1.5], [-11, 0.4, 1.2], [11.5, 0.6, 1.4], [-3.0, -6.5, 0.7], [4.2, -7.5, 0.6], [-14, -3, 0.9], [15, -2.6, 1.0]]) rocks.push([x, -0.75, zl + dz, r, 0.75, 0.9]);
    for (let i = 0; i < 26; i++) { const x = (R() - 0.5) * 150; if (Math.abs(x) < 10) continue; const z = zFace(x) - 0.8 - R() * 2.5; rocks.push([x, groundH(x, z) - 0.3, z, 0.8 + R() * 2.2, 0.75, Math.exp(-((x / 8) ** 2))]); }
    for (let i = 0; i < 60; i += 4) { const p = stream[Math.floor((i / 60) * (stream.length - 1))]; for (const sd of [-1, 1]) if (R() < 0.7) { const a = Math.atan2(p.z, p.x); rocks.push([p.x + sd * (p.w + 0.6) * Math.sin(a), p.y - 0.2, p.z - sd * (p.w + 0.6) * Math.cos(a), 0.4 + R() * 0.7, 0.65, 0.4]); } }
    for (let n = 0, t = 0; n < 40 && t < 600; t++) {
      const x = (R() - 0.5) * 140, z = -70 + R() * 110;
      if (clearE(x, z) < 1.15 || !onLand(x, z) || inBand(x, z, 4)) continue;
      rocks.push([x, groundH(x, z) - 0.25, z, 0.5 + R() * 1.4, 0.7, 0]); n++;
    }
    const geos = [], geosR = [];
    const proto = [2, 3].map((d) => { const g = new THREE.IcosahedronGeometry(1, d); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return mergeVertices(g); });
    for (const [x, y, z, r, sq, wt] of rocks) {
      const g = proto[r > 1.2 ? 1 : 0].clone(), p = g.attributes.position, seed = R() * 50;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const d = 1 + (N.fbm(vx * 1.3 + seed, vy * 1.3 + vz * 0.7) - 0.5) * 0.7 + (N.n2(vx * 4 + seed, vz * 4 + vy) - 0.5) * 0.12;
        p.setXYZ(i, vx * d * r * (1 + R() * 0.02), Math.max(vy * d * r * sq, -0.45 * r), vz * d * r * 0.9);
      }
      g.rotateY(R() * TAU); g.translate(x, y, z);
      g.computeVertexNormals();
      const cnt = p.count, wa = new Float32Array(cnt), ca = new Float32Array(cnt * 3), c = new THREE.Color(), nn = g.attributes.normal;
      for (let i = 0; i < cnt; i++) {
        const py = p.getY(i);
        wa[i] = Math.max(wt * 0.8, sm(WATER_Y + 0.5, WATER_Y, py) * (inPool(x, z, 1) ? 1 : 0));
        c.setRGB(0.62, 0.62, 0.58).lerp(new THREE.Color(0.32, 0.45, 0.17), sm(0.2, 0.7, nn.getY(i) + (N.n2(p.getX(i), p.getZ(i)) - 0.5) * 0.5) * 0.85);
        ca.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('aWet', new THREE.BufferAttribute(wa, 1));
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      (inPool(x, z, 3) || z > zFace(x) - 4 ? geosR : geos).push(g.toNonIndexed());
    }
    for (const [list, refl] of [[geos, false], [geosR, true]]) {
      if (!list.length) continue;
      const merged = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'color', 'aWet']) {
        const n = list[0].attributes[k].itemSize, arr = new Float32Array(list.reduce((s, g) => s + g.attributes[k].array.length, 0));
        let o = 0; for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
        merged.setAttribute(k, new THREE.BufferAttribute(arr, n));
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, rockMat);
      mesh.receiveShadow = true;
      if (refl) mesh.layers.enable(REFL);
      root.add(mesh);
    }
  }

  /* ---------------- 4. THE WATERFALL — three tiers of animated falling water ---------------- */
  const tiers = [];
  {
    const g = { p: [], uv: [], f: [], idx: [] };
    const ribbon = (cx, edgeY, edgeZ, backZ, toY, v0, hw, layer, alphaK, spread = 0.18) => {
      const T = Math.sqrt(Math.max(0.01, (edgeY - toY) / 4.9));
      const rows = [];
      for (let k = 0; k <= 4; k++) { const t = k / 4; rows.push([edgeY + 0.12 * (1 - t) + 0.02, lerp(backZ, edgeZ, t), 0]); }
      for (let k = 1; k <= 40; k++) { const t = T * Math.pow(k / 40, 0.85); rows.push([edgeY - 4.9 * t * t, edgeZ - v0 * t, t / T]); }
      const base = g.p.length / 3, cols = 14;
      let s = 0;
      rows.forEach(([y, z, fall], j) => {
        if (j) s += Math.hypot(y - rows[j - 1][0], z - rows[j - 1][1]);
        const w = hw * (1 + spread * fall) * (layer ? 1.07 : 1);
        for (let i = 0; i <= cols; i++) {
          const u = i / cols, xx = (u * 2 - 1);
          g.p.push(cx + xx * w, y, z - (layer ? 0.28 : 0) - 0.35 * (1 - xx * xx) * Math.min(1, fall * 3 + 0.2));
          g.uv.push(u, s); g.f.push(fall, layer ? 0.75 + R() * 0.2 : R() * 0.4, w * 2, alphaK);
        }
      });
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < cols; i++) { const a = base + j * (cols + 1) + i, b = a + cols + 1; g.idx.push(a, b, b + 1, a, b + 1, a + 1); }
      return { T, landZ: edgeZ - v0 * T };
    };
    const tierDefs = [[TOP - 0.9 - 0.05, TOP - 1.25, L2 + 0.1, 0.9, 2.2], [L2 - 0.3, L2 - 0.4, L3 + 0.1, 1.0, 3.0], [L3 - 0.3, L3 - 0.4, WATER_Y - 0.35, 1.5, 4.3]];
    for (const [ey, zy, toY, v0, hw] of tierDefs) {
      const edgeZ = cliffZ(0, zy) - 0.18, backZ = edgeZ + (ey > TOP - 3 ? 4 : 1.3);
      let land = null;
      for (const layer of [0, 1]) land = ribbon(0, ey, edgeZ, backZ, toY, v0, hw, layer, layer ? 0.5 : 0.95);
      tiers.push({ y: toY, z: land.landZ, hw });
    }
    // two thin side cascades streaming down the wall from the plateau, and the stream's rapids over the brink
    for (const sd of [-1, 1]) {
      const x = sd * 9.5, ez = cliffZ(x, TOP - 0.2) - 0.25;
      ribbon(x, Ht(x) - 0.25, ez, ez + 2, WATER_Y - 0.3, 0.35, 0.55, 0, 0.42, 0.9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('aF', new THREE.Float32BufferAttribute(g.f, 4));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uBright: { value: 0.78 } }]),
      vertexShader: `
        uniform float uTime; attribute vec4 aF; varying vec2 vUv; varying vec4 vF;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vF = aF;
          vec3 p = position;
          p.z += sin(uTime * 3.1 + uv.y * 0.9 + aF.y * 10.0) * 0.07 * aF.x;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uBright; varying vec2 vUv; varying vec4 vF;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main() {
          float u = vUv.x, s = vUv.y, fall = vF.x, seed = vF.y, W = vF.z;
          float xm = u * W;
          // long vertical streaks: high frequency ACROSS the fall, very low frequency down it (reads as falling water, not swirls)
          float st = jfbm(vec2(xm * 6.5 + seed * 31.0, s * 0.03 - uTime * 0.55));
          float cl = jfbm(vec2(xm * 2.2 + seed * 17.0, s * 0.06 - uTime * 1.4));
          float fine = jvn(vec2(xm * 14.0 + seed * 5.0, s * 0.09 - uTime * 2.6));
          float body = smoothstep(0.38, 0.8, st * 0.7 + cl * 0.45 + fine * 0.22 - 0.12);
          float edge = min(u, 1.0 - u) * W;
          float rag = jfbm(vec2(s * 0.55 - uTime * 1.7, seed * 9.0 + u * 3.0));
          float a = smoothstep(0.0, 0.3 + rag * 0.95 * (0.3 + fall), edge);
          float lip = smoothstep(0.1, 0.0, fall) * (1.0 - step(fall, 0.0) * 0.0);
          float foot = smoothstep(0.8, 1.0, fall);
          float alpha = a * mix(0.18 + body * 0.72, 0.9, foot * 0.6) * vF.w;
          alpha *= mix(1.0, 0.75 + 0.25 * cl, step(0.5, seed));
          vec3 deep = vec3(0.03, 0.05, 0.06), foam = vec3(0.4, 0.47, 0.55);
          float wht = clamp(body * mix(0.5, 1.0, sqrt(fall)) + foot * 0.45 - lip * 0.35, 0.0, 1.0);
          vec3 col = mix(deep, foam, wht) * uBright;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
          #include <fog_fragment>
        }`,
    });
    mat.uniforms.uTime = uTime;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3; mesh.layers.enable(REFL);
    root.add(mesh);
  }

  /* ---------------- 5. SPRAY + MIST — billboards animated in the shader ---------------- */
  const puffs = [];        // [x, y, z, seed, life, rise, drift, size, spread, alpha, grow]
  {
    const P = (x, y, z, life, rise, drift, size, spread, alpha, grow) => puffs.push([x, y, z, R(), life, rise, drift, size, spread, alpha, grow]);
    const [t1, t2, t3] = tiers;
    for (let i = 0; i < 46; i++) P((R() * 2 - 1) * t3.hw * 1.1, WATER_Y, t3.z + (R() - 0.5) * 1.6, 3.5 + R() * 2.5, 4 + R() * 4, 2.5 + R() * 3, 2.2 + R() * 2.5, 1.2, 0.1, 1.6);
    for (let i = 0; i < 14; i++) P((R() * 2 - 1) * t2.hw, t2.y, t2.z, 3 + R() * 2, 2.5 + R() * 2, 1.5 + R(), 1.6 + R() * 1.4, 0.7, 0.08, 1.4);
    for (let i = 0; i < 10; i++) P((R() * 2 - 1) * t1.hw, t1.y, t1.z, 3 + R() * 2, 2 + R() * 2, 1.2 + R(), 1.3 + R(), 0.6, 0.07, 1.4);
    for (let i = 0; i < 18; i++) P((R() - 0.5) * 50, WATER_Y + 0.2, lerp(bankZ(0) + 2, zFace(0) - 1, R()), 14 + R() * 10, 0.6, -1.5 + R() * 3, 4 + R() * 4, 1.5, 0.11, 0.8);
    for (let n = 0, t = 0; n < 60 && t < 2000; t++) {                       // ground mist in the forest (never down the court)
      const x = (R() - 0.5) * 110, z = -45 + R() * 75;
      if (clearE(x, z) < 1.05 || inBand(x, z, 4) || !offAxis(x, z, 28) || inCliff(x, z, 2) || z < brinkZ(x) - 2) continue;
      P(x, groundH(x, z) + 0.3, z, 18 + R() * 14, 0.8, (R() - 0.5) * 3, 5 + R() * 5, 2, 0.085, 0.6); n++;
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    const a0 = new Float32Array(puffs.length * 4), a1 = new Float32Array(puffs.length * 4), a2 = new Float32Array(puffs.length * 4);
    puffs.forEach((p, i) => { a0.set(p.slice(0, 4), i * 4); a1.set(p.slice(4, 8), i * 4); a2.set([...p.slice(8, 11), 0], i * 4); });
    geo.setAttribute('aO', new THREE.InstancedBufferAttribute(a0, 4));
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(a1, 4));
    geo.setAttribute('aQ', new THREE.InstancedBufferAttribute(a2, 4));
    geo.instanceCount = puffs.length;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0.22, 0.27, 0.34) } }]),
      vertexShader: `
        uniform float uTime; attribute vec4 aO; attribute vec4 aP; attribute vec4 aQ;
        varying vec2 vUv; varying float vA; varying float vSeed;
        #include <fog_pars_vertex>
        void main() {
          float t = fract(uTime / aP.x + aO.w * 7.31);
          vec3 c = aO.xyz + vec3(sin(aO.w * 40.0 + t * 2.0) * aQ.x * t, aP.y * pow(t, 0.7), -aP.z * t + cos(aO.w * 23.0) * aQ.x * t);
          float size = aP.w * (0.55 + aQ.z * t);
          float r = aO.w * 6.28 + t * 0.6;
          vec2 q = mat2(cos(r), sin(r), -sin(r), cos(r)) * position.xy;
          vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
          mvPosition.xy += q * size;
          gl_Position = projectionMatrix * mvPosition;
          vA = pow(sin(3.14159 * t), 1.5) * aQ.y; vUv = uv; vSeed = aO.w;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uCol; varying vec2 vUv; varying float vA; varying float vSeed;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float puff = jfbm(vUv * 3.0 + vSeed * 13.0 + uTime * 0.04);
          float a = smoothstep(1.0, 0.15, d) * (0.45 + 0.75 * puff) * vA;
          gl_FragColor = vec4(uCol, clamp(a, 0.0, 1.0));
          #include <fog_fragment>
        }`,
    });
    mat.uniforms.uTime = uTime;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.layers.enable(REFL);
    root.add(mesh);
  }

  /* ---------------- 6. THE PLUNGE POOL — mirror reflection, ripples, foam ---------------- */
  const mirror = { rt: new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }), cam: new THREE.PerspectiveCamera(), mat: new THREE.Matrix4(), busy: false, lit: false };
  mirror.cam.layers.set(REFL);
  const waterNor = load('assets/pond/water_nor.jpg', false);
  {
    const t3 = tiers[2];
    const U = { uTime, uNor: { value: waterNor }, uRefl: { value: mirror.rt.texture }, uReflMat: { value: mirror.mat }, uWY: { value: WATER_Y }, uImp: { value: new THREE.Vector4(0, t3.z, t3.hw, 0) } };
    const m = new THREE.MeshStandardMaterial({ color: 0x08120f, roughness: 0.12, metalness: 0.0, envMapIntensity: 0.15 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uTime; uniform sampler2D uNor; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uWY; uniform vec4 uImp;
        varying vec3 vWP; vec3 gN; float gFoam;
        ${NOISE_GLSL}
        vec3 plNormal(vec2 p) {
          vec2 q = p - vec2(clamp(p.x, -uImp.z, uImp.z), uImp.y);          // from the line where the falls land
          float r = length(q); vec2 dir = r > 1e-3 ? q / r : vec2(0.0, -1.0);
          vec2 fl = dir * uTime * 0.35;
          vec3 a = texture2D(uNor, (p - fl) * 0.11 + vec2(0.0, uTime * 0.01)).xyz * 2.0 - 1.0;
          vec3 b = texture2D(uNor, (p - fl * 1.4) * 0.27 + vec2(uTime * 0.013, -uTime * 0.017)).xyz * 2.0 - 1.0;
          vec2 d = a.xy * 0.45 + b.xy * 0.3;
          float k = exp(-r / 6.0);
          d += dir * sin(r * 2.6 - uTime * 3.6) * 0.32 * k + dir * sin(r * 5.3 - uTime * 6.1 + 1.3) * 0.14 * exp(-r / 2.5);
          float n = jfbm((q - dir * uTime * 0.55) * 0.55 + vec2(0.0, 0.0));
          float n2 = jfbm(q * 1.7 - dir * uTime * 0.9 + 3.1);
          gFoam = clamp(exp(-r / 2.0) * 1.2 + smoothstep(0.55, 0.8, n) * exp(-r / 7.0) * 0.9, 0.0, 1.0) * (0.55 + 0.6 * n2);
          return normalize(vec3(-d.x * 0.4, 1.0, -d.y * 0.4));
        }
        ` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          gN = plNormal(vWP.xz);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.47, 0.5), gFoam * 0.75);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.6, gFoam);')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
        .replace('#include <opaque_fragment>', `{
            vec3 V = cameraPosition - vWP; V = dot(V, V) > 1e-8 ? normalize(V) : vec3(0.0, 1.0, 0.0);
            float cosT = max(dot(gN, V), 0.0);
            float fr = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
            vec4 rc = uReflMat * vec4(vWP.x, uWY, vWP.z, 1.0);
            vec2 ruv = rc.xy / max(rc.w, 1e-4) + gN.xz * vec2(0.04, 0.06);
            vec3 refl = vec3(0.0); float ws = 0.0;
            for (int k = -3; k <= 3; k++) { float w = exp(-float(k * k) * 0.2); refl += texture2D(uRefl, ruv + vec2(0.0, float(k) * (0.002 + 0.008 * (1.0 - cosT)))).rgb * w; ws += w; }
            refl /= ws;
            outgoingLight = outgoingLight * (1.0 - fr * 0.5) + refl * (0.22 + 0.7 * fr) * (1.0 - gFoam * 0.7);
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'jgPool';
    const z0 = bankZ(0) - 2, z1 = zFace(33) + 3;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(68, z1 - z0, 1, 1), m);
    water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, (z0 + z1) / 2);
    water.receiveShadow = true;
    root.add(water);
    const v2 = new THREE.Vector2(), cp = new THREE.Vector3(), cq = new THREE.Quaternion(), dir = new THREE.Vector3(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    water.onBeforeRender = (renderer, scn, camera) => {
      if (mirror.busy || camera === mirror.cam || !camera.isPerspectiveCamera) return;
      if (!mirror.lit) { mirror.lit = true; scn.traverse((o) => { if (o.isLight) o.layers.enable(REFL); }); }
      camera.updateMatrixWorld();
      camera.getWorldPosition(cp); camera.getWorldQuaternion(cq);
      if (cp.y <= WATER_Y + 0.05) return;
      renderer.getDrawingBufferSize(v2);
      const w = Math.max(64, Math.round(Math.min(900, v2.x * 0.45))), h = Math.max(32, Math.round((w * v2.y) / v2.x));
      if (mirror.rt.width !== w || mirror.rt.height !== h) mirror.rt.setSize(w, h);
      const mc = mirror.cam;
      mc.position.set(cp.x, 2 * WATER_Y - cp.y, cp.z);
      dir.set(0, 0, -1).applyQuaternion(cq); dir.y = -dir.y;
      mc.up.set(0, 1, 0).applyQuaternion(cq); mc.up.y = -mc.up.y;
      mc.lookAt(mc.position.x + dir.x, mc.position.y + dir.y, mc.position.z + dir.z);
      mc.far = camera.far; mc.near = camera.near;
      mc.updateMatrixWorld();
      mc.projectionMatrix.copy(camera.projectionMatrix);
      mc.matrixWorldInverse.copy(mc.matrixWorld).invert();
      mirror.mat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
      plane.setFromNormalAndCoplanarPoint(V(0, 1, 0), V(0, WATER_Y, 0)).applyMatrix4(mc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pe = mc.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + pe[8]) / pe[0], (Math.sign(clip.y) + pe[9]) / pe[5], -1, (1 + pe[10]) / pe[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1 - 0.003; pe[14] = clip.w;
      mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert();
      mirror.busy = true;
      const prevRT = renderer.getRenderTarget(), prevXR = renderer.xr.enabled, prevSh = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(mirror.rt);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scn, mc);
      renderer.xr.enabled = prevXR; renderer.shadowMap.autoUpdate = prevSh;
      renderer.setRenderTarget(prevRT);
      mirror.busy = false;
    };
  }

  /* ---------------- 7. THE STREAM ---------------- */
  {
    const pos = [], uv = [], idx = [];
    const across = 6;
    stream.forEach((p, i) => {
      const a = stream[Math.max(0, i - 1)], b = stream[Math.min(stream.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const hw = p.w + 0.9;
      for (let k = 0; k <= across; k++) { const u = k / across * 2 - 1; pos.push(p.x - tz * u * hw, p.y, p.z + tx * u * hw); uv.push(u * hw * 0.3, p.s * 0.3); }
    });
    for (let i = 0; i < stream.length - 1; i++) for (let k = 0; k < across; k++) { const a = i * (across + 1) + k, b = a + across + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const nor = load('assets/pond/water_nor.jpg', false);
    const m = new THREE.MeshStandardMaterial({ color: 0x0a1513, roughness: 0.1, normalMap: nor, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 1.1 });
    ticks.push((t, dt) => { nor.offset.y = (nor.offset.y - dt * 0.35) % 1; });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------- 8. TREES — buttressed giants, mid-canopy, understory; a distant canopy beyond ---------------- */
  // a broadleaf tree: trunk + buttress fins + limbs (bark), clumps of leaf cards (foliage)
  function treeTemplate(seed, o) {
    const r = rng(seed), bark = new Geo(), leaf = new Geo(), clumps = [];
    const H = o.H, r0 = o.r0;
    const lean = [(r() - 0.5) * o.lean, (r() - 0.5) * o.lean];
    const spine = [], rad = [];
    for (let i = 0; i <= o.rings; i++) {
      const t = i / o.rings, y = -0.5 + t * (H + 0.5);
      spine.push(V(lean[0] * t * t * H * 0.08 + Math.sin(t * 5 + seed) * 0.22 * t, y, lean[1] * t * t * H * 0.08 + Math.cos(t * 4 + seed) * 0.2 * t));
      rad.push(r0 * (1 - 0.55 * t) + r0 * (o.flare ?? 0.9) * Math.exp(-Math.max(0, y) / 1.2));
    }
    tube(bark, spine, rad, o.radial, Math.max(1, Math.round((TAU * r0) / 1.6)), 0.45);
    const at = (t) => { const f = t * o.rings, i = Math.min(o.rings - 1, Math.floor(f)); return [spine[i].clone().lerp(spine[i + 1], f - i), lerp(rad[i], rad[i + 1], f - i)]; };
    // buttress fins: plank-like roots flaring out from the trunk
    for (let k = 0; k < (o.fins || 0); k++) {
      const a = (k / o.fins) * TAU + r() * 0.5, d = V(Math.cos(a), 0, Math.sin(a)), tn = V(-Math.sin(a), 0, Math.cos(a));
      const hb = o.hb * (0.75 + r() * 0.5), rb = o.rb * (0.7 + r() * 0.6), th = r0 * 0.32, ph = r() * 6, NA = 10, NB = 4;
      const grid = [];
      for (const sd of [-1, 1]) {
        const ids = [];
        for (let i = 0; i <= NA; i++) {
          const f = i / NA, dist = r0 * 0.55 + (rb - r0 * 0.55) * f, top = hb * Math.pow(1 - f, 1.7) + 0.12, wav = Math.sin(dist * 1.3 + ph) * 0.3 * f;
          const row = [];
          for (let j = 0; j <= NB; j++) {
            const y = -0.5 + (top + 0.5) * (j / NB), thick = th * (1 - 0.75 * f) * (0.55 + 0.45 * (1 - j / NB));
            const p = d.clone().multiplyScalar(dist).addScaledVector(tn, wav + sd * thick / 2); p.y = y;
            row.push(bark.vert(p, tn.clone().multiplyScalar(sd).addScaledVector(d, 0.15).normalize(), dist / 1.6, y / 1.6 + sd * 0.3));
          }
          ids.push(row);
        }
        for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) sd > 0 ? bark.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]) : bark.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]);
        grid.push(ids);
      }
      for (let i = 0; i < NA; i++) bark.quad(grid[0][i][NB], grid[0][i + 1][NB], grid[1][i + 1][NB], grid[1][i][NB]);
    }
    // limbs + sub-branches, each ending in a clump of leaves
    const limb = (p0, dir, L, rA, segs, radial) => {
      const pts = [], rr = [];
      for (let i = 0; i <= segs; i++) { const s = i / segs; pts.push(p0.clone().addScaledVector(dir, s * L).add(V(0, s * s * L * 0.18, 0))); rr.push(rA * (1 - 0.8 * s) + 0.03); }
      tube(bark, pts, rr, radial, 1, 0.45);
      return pts;
    };
    for (let k = 0; k < o.limbs; k++) {
      const t = o.limbT[0] + (o.limbT[1] - o.limbT[0]) * (k / Math.max(1, o.limbs - 1)) + (r() - 0.5) * 0.05;
      const [p0, rT] = at(t), a = (k / o.limbs) * TAU + r() * 0.8, e = o.elev[0] + r() * (o.elev[1] - o.elev[0]);
      const dir = V(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)), L = o.limbL[0] + r() * (o.limbL[1] - o.limbL[0]);
      const pts = limb(p0, dir, L, rT * 0.55, 7, o.radial > 9 ? 8 : 6);
      clumps.push([pts[pts.length - 1].clone().add(V(0, o.clR * 0.25, 0)), o.clR * (0.85 + r() * 0.3)]);
      for (let s = 0; s < (o.subs || 0); s++) {
        const q = pts[3 + s * 2] || pts[4], a2 = a + (s ? 0.9 : -0.9) + (r() - 0.5) * 0.4, e2 = e + 0.15 + r() * 0.3;
        const d2 = V(Math.cos(a2) * Math.cos(e2), Math.sin(e2), Math.sin(a2) * Math.cos(e2));
        const sp = limb(q, d2, L * (0.45 + r() * 0.2), rT * 0.22, 5, 6);
        clumps.push([sp[sp.length - 1].clone().add(V(0, o.clR * 0.2, 0)), o.clR * (0.7 + r() * 0.3)]);
      }
    }
    clumps.push([spine[o.rings].clone().add(V(0, o.clR * 0.35, 0)), o.clR * 1.05]);
    for (const [c, cr] of clumps) for (let i = 0; i < o.cards; i++) {
      let dx, dy, dz; do { dx = r() * 2 - 1; dy = r() * 2 - 1; dz = r() * 2 - 1; } while (dx * dx + dy * dy + dz * dz > 1);
      const sh = 0.5 + 0.5 * Math.cbrt(r()), l = Math.hypot(dx, dy, dz) || 1;
      const p = c.clone().add(V((dx / l) * cr * sh, (dy / l) * cr * 0.55 * sh + 0.15 * cr, (dz / l) * cr * sh));
      const nrm = V(dx + (r() - 0.5) * 0.8, dy + 0.9, dz + (r() - 0.5) * 0.8);
      const s = o.card * (0.75 + r() * 0.5);
      card(leaf, p, nrm, s, s, A.crown, r() * TAU, c.clone().add(V(0, -cr * 0.6, 0)));
    }
    return { bark: bark.build(), leaf: leaf.build(), clumps, H };
  }
  const TPL = {
    giantA: treeTemplate(11, { H: 31, r0: 0.8, rings: 22, radial: 12, lean: 0.4, fins: 5, hb: 3.4, rb: 3.2, limbs: 5, limbT: [0.7, 0.93], elev: [0.3, 0.65], limbL: [6, 9], subs: 2, clR: 3.3, cards: 24, card: 2.5 }),
    giantB: treeTemplate(23, { H: 27, r0: 0.7, rings: 20, radial: 12, lean: 0.6, fins: 4, hb: 2.8, rb: 2.8, limbs: 4, limbT: [0.62, 0.9], elev: [0.4, 0.8], limbL: [5, 8], subs: 2, clR: 3.0, cards: 24, card: 2.4 }),
    midA: treeTemplate(37, { H: 17, r0: 0.38, rings: 16, radial: 10, lean: 0.8, fins: 3, hb: 1.5, rb: 1.5, limbs: 4, limbT: [0.55, 0.9], elev: [0.45, 0.9], limbL: [3.5, 5.5], subs: 1, clR: 2.4, cards: 22, card: 2.0 }),
    midB: treeTemplate(41, { H: 14, r0: 0.32, rings: 14, radial: 9, lean: 1.0, fins: 0, limbs: 4, limbT: [0.5, 0.88], elev: [0.5, 1.0], limbL: [3, 5], subs: 1, clR: 2.2, cards: 22, card: 1.9, flare: 0.5 }),
    small: treeTemplate(53, { H: 8.5, r0: 0.17, rings: 10, radial: 7, lean: 1.2, fins: 0, limbs: 3, limbT: [0.55, 0.85], elev: [0.5, 0.95], limbL: [1.8, 3], subs: 0, clR: 1.7, cards: 18, card: 1.5, flare: 0.3 }),
  };
  // a far tree: just a dome of big leaf cards (the canopy seen from afar)
  const farTree = (() => {
    const r = rng(71), leaf = new Geo();
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * TAU, rr = k === 6 ? 0 : 3.2, c = V(Math.cos(a) * rr, k === 6 ? 2.2 : 0.6 + r(), Math.sin(a) * rr);
      for (let i = 0; i < 8; i++) card(leaf, c.clone().add(V((r() - 0.5) * 3, (r() - 0.3) * 1.6, (r() - 0.5) * 3)), V(r() - 0.5, 1.2, r() - 0.5), 4.4, 4.4, A.crown, r() * TAU, V(0, -2.5, 0));
    }
    return leaf.build();
  })();
  const placeInst = (geo, mat, list, { refl = false, tint = null } = {}) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length), c = new THREE.Color();
    list.forEach(([x, y, z, ry, s, sy = s], i) => {
      _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.set(s, sy, s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
      if (tint) { tint(c, i, x, z); im.setColorAt(i, c); }
    });
    im.computeBoundingSphere();
    if (refl) im.layers.enable(REFL);
    root.add(im);
    return im;
  };
  const leafTint = (c) => c.setHSL(0.24 + (R() - 0.5) * 0.06, 0.25 + R() * 0.25, 0.5 + R() * 0.2).multiplyScalar(1.6);
  const trunks = [];          // [x, z, radius, y] — for liana / fungus / vine placement
  const anchors = [];         // world points under crowns where vines hang
  const scatter = (n, tries, minD, gen, ok) => {
    const out = [];
    for (let t = 0; t < tries && out.length < n; t++) {
      const [x, z] = gen(); if (!ok(x, z)) continue;
      let good = true;
      for (const [px, pz, pr] of trunks) if ((px - x) ** 2 + (pz - z) ** 2 < (pr * 4 + minD * 0.5) ** 2) { good = false; break; }
      if (!good) continue;
      for (const [px, pz] of out) if ((px - x) ** 2 + (pz - z) ** 2 < minD * minD) { good = false; break; }
      if (good) out.push([x, z]);
    }
    return out;
  };
  const box = (x0, x1, z0, z1) => () => [x0 + R() * (x1 - x0), z0 + R() * (z1 - z0)];
  const forestOK = (eMin) => (x, z) => clearE(x, z) > eMin && onLand(x, z) && !inBand(x, z, 5) && !nearStream(x, z, 1.5);
  const plantTrees = (tpl, spots, sMin, sMax, refl) => {
    const list = spots.map(([x, z]) => {
      const s = sMin + R() * (sMax - sMin), y = (z > zBack(x) ? plateauH(x, z) : groundH(x, z)) - 0.15, ry = R() * TAU;
      trunks.push([x, z, tpl === TPL.small ? 0.17 * s : (tpl.H > 20 ? 0.75 : 0.35) * s, y]);
      const cs = Math.cos(ry), sn = Math.sin(ry);
      for (const [c] of tpl.clumps) if (R() < 0.6) anchors.push([x + (c.x * cs + c.z * sn) * s, y + (c.y - 1.2) * s, z + (-c.x * sn + c.z * cs) * s]);
      return [x, y, z, ry, s];
    });
    placeInst(tpl.bark, barkMat, list, { refl });
    placeInst(tpl.leaf, leafMat, list, { refl, tint: leafTint });
  };
  {
    const plat = (x, z) => z > zBack(x) + 2 && Math.abs(x) < 45;
    const giants = scatter(24, 3000, 10, box(-85, 85, -55, 60), forestOK(1.35));
    plantTrees(TPL.giantA, giants.filter((_, i) => i % 2 === 0), 0.85, 1.15);
    plantTrees(TPL.giantB, giants.filter((_, i) => i % 2 === 1), 0.85, 1.2);
    // the wall's crest: trees leaning out over the gorge (these show in the pool's mirror)
    plantTrees(TPL.midA, scatter(14, 600, 6, () => { const x = (R() - 0.5) * 80; return [x, zBack(x) + 2 + R() * 12]; }, plat), 0.9, 1.3, true);
    const mids = scatter(56, 5000, 5.5, box(-80, 80, -60, 55), forestOK(1.05));
    plantTrees(TPL.midA, mids.filter((_, i) => i % 2 === 0), 0.85, 1.2);
    plantTrees(TPL.midB, mids.filter((_, i) => i % 2 === 1), 0.85, 1.25);
    plantTrees(TPL.small, scatter(70, 5000, 3.5, box(-60, 60, -45, 40), forestOK(1.0)), 0.8, 1.3);
    // the far canopy: the valley's sea of trees, the forest past both ends, the plateau beyond the wall
    const far = [];
    for (let t = 0; t < 9000 && far.length < 380; t++) {
      const x = (R() - 0.5) * 330, z = -200 + R() * 330, rr = Math.hypot(x, z * 1.2);
      if (rr < 58 || rr > 175) continue;
      if (inCliff(x, z, 3) || inPool(x, z, 4)) continue;
      const y = z > zBack(x) ? plateauH(x, z) : groundH(x, z);
      far.push([x, y + 3 + R() * 6, z, R() * TAU, 1.0 + R() * 0.8, 0.75 + R() * 0.5]);
    }
    placeInst(farTree, leafMat, far, { tint: (c) => c.setHSL(0.25 + (R() - 0.5) * 0.05, 0.22 + R() * 0.2, 0.42 + R() * 0.16).multiplyScalar(1.5) });
  }

  /* ---------------- 9. UNDERSTORY — palms, bananas, tree ferns, ferns, elephant ears, gingers ---------------- */
  {
    // palm: curved trunk (bark) + a crown of arching fronds
    const palmTrunk = new Geo(), palmLeaf = new Geo();
    {
      const pts = [], rr = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(Math.sin(t * 1.6) * 0.9 * t, -0.3 + t * 8.3, 0)); rr.push(0.2 - 0.06 * t + 0.12 * Math.exp(-t * 12)); }
      tube(palmTrunk, pts, rr, 8, 1, 0.9);
      const top = pts[12];
      for (let k = 0; k < 13; k++) frond(palmLeaf, top, k * 2.4, 3.6 + (k % 3) * 0.35, 0.95 - (k % 4) * 0.33, 0.55 + (k % 3) * 0.12, 1.45, 0.32, A.palm, 12);
    }
    const bananaG = new Geo();
    {
      tube(bananaG, [V(0, -0.2, 0), V(0.02, 1.2, 0), V(0.05, 2.5, 0.02)], [0.17, 0.14, 0.11], 7, 1, 1, A.stem);
      for (let k = 0; k < 7; k++) frond(bananaG, V(0.05, 2.35 + k * 0.05, 0.02), k * 2.2 + 0.3, 2.2 + (k % 3) * 0.3, 0.95 - (k % 3) * 0.28, 0.6 + (k % 2) * 0.2, 0.78, 0.18, A.banana, 10, (s) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.95)));
    }
    const tfernG = new Geo();
    {
      const pts = [], rr = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(Math.sin(t * 2) * 0.25, -0.2 + t * 3.6, 0)); rr.push(0.15 + 0.06 * Math.exp(-t * 5)); }
      tube(tfernG, pts, rr, 7, 1, 1, A.fernTrunk);
      for (let k = 0; k < 14; k++) frond(tfernG, pts[6], k * 2.4, 2.3 + (k % 3) * 0.25, 1.05 - (k % 3) * 0.3, 0.85, 0.85, 0.15, A.fern, 10);
    }
    const fernG = new Geo();
    for (let k = 0; k < 9; k++) frond(fernG, V(0, 0.05, 0), k * 2.7 + 0.2, 1.05 + (k % 3) * 0.22, 1.05 - (k % 3) * 0.2, 0.85, 0.6, 0.12, A.fern, 6);
    const alocG = new Geo();
    for (let k = 0; k < 6; k++) {
      const a = k * 2.3, h = 0.8 + (k % 3) * 0.3, hz = V(Math.cos(a), 0, Math.sin(a));
      const top = hz.clone().multiplyScalar(0.35 + (k % 2) * 0.15).setY(h);
      tube(alocG, [V(0, 0, 0), hz.clone().multiplyScalar(0.12).setY(h * 0.6), top], [0.035, 0.028, 0.02], 4, 1, 1, A.petiole);
      const s = 0.85 + (k % 3) * 0.2, tilt = 0.75;
      const nrm = hz.clone().multiplyScalar(Math.sin(tilt)).setY(Math.cos(tilt) * 0.9);
      const dn = hz.clone().multiplyScalar(Math.cos(tilt)).setY(-Math.sin(tilt));            // from the petiole toward the leaf's tip
      const sd = V(0, 1, 0).cross(hz).normalize();
      const ids = [];
      for (let j = 0; j <= 3; j++) {
        const row = [];
        for (let i = 0; i <= 2; i++) {
          const u = i / 2, v = j / 3, cup = (u - 0.5) ** 2 * 0.25;
          const p = top.clone().addScaledVector(dn, (v - 0.18) * s).addScaledVector(sd, (u - 0.5) * s * 0.9).addScaledVector(nrm, cup - v * v * 0.12);
          row.push(alocG.vert(p, nrm, lerp(A.aloc[0], A.aloc[2], u), lerp(A.aloc[3], A.aloc[1], v)));
        }
        ids.push(row);
      }
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) alocG.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
    }
    const bladeG = new Geo();
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI, n = V(Math.cos(a), 0, Math.sin(a)); card(bladeG, V(0, 0.62, 0), n, 1.3, 1.3, A.blades, 0, null); }
    const pt = palmTrunk.build(), pl = palmLeaf.build();
    const under = (n, minD, gen, ok) => scatter(n, n * 60, minD, gen, ok).map(([x, z]) => [x, groundH(x, z) - 0.05, z, R() * TAU]);
    const edge = (eMin, pad) => (x, z) => clearE(x, z) > eMin && onLand(x, z) && !inBand(x, z, pad) && !nearStream(x, z, 0.8);
    const palms = under(36, 4, box(-70, 70, -50, 45), edge(1.0, 5));
    placeInst(pt, barkMat, palms.map((p) => [...p, 0.8 + R() * 0.5]));
    placeInst(pl, leafMat, palms.map((p, i) => [...p, 0.8 + R() * 0.5]), { tint: (c) => c.setHSL(0.23 + R() * 0.04, 0.3, 0.55).multiplyScalar(1.6) });
    // (palm fronds sized with their own trunk's scale)
    const pi = root.children[root.children.length - 1], pb = root.children[root.children.length - 2];
    for (let i = 0; i < palms.length; i++) { const m = new THREE.Matrix4(); pb.getMatrixAt(i, m); pi.setMatrixAt(i, m); }
    pi.computeBoundingSphere();
    placeInst(bananaG.build(), leafMat, under(55, 2.6, box(-55, 55, -40, 35), edge(0.82, 3.2)).map((p) => [...p, 0.8 + R() * 0.45]), { tint: (c) => c.setHSL(0.22 + R() * 0.04, 0.35, 0.55).multiplyScalar(1.7) });
    placeInst(tfernG.build(), leafMat, under(45, 3, box(-60, 60, -45, 40), edge(0.9, 3.5)).map((p) => [...p, 0.8 + R() * 0.5]), { tint: (c) => c.setHSL(0.26 + R() * 0.04, 0.35, 0.5).multiplyScalar(1.6) });
    const ferns = under(190, 1.4, box(-50, 50, -36, 32), edge(0.62, 2.4));
    for (let i = 0; i < 30; i++) { const x = (R() - 0.5) * 62, z = bankZ(x) - 0.3 - R() * 1.5; if (!inBand(x, z, 2.4) && Math.abs(x) < 31) ferns.push([x, groundH(x, z) - 0.05, z, R() * TAU]); }
    placeInst(fernG.build(), leafMat, ferns.map((p) => [...p, 0.75 + R() * 0.7]), { tint: (c) => c.setHSL(0.27 + R() * 0.05, 0.35 + R() * 0.15, 0.5 + R() * 0.1).multiplyScalar(1.6) });
    placeInst(alocG.build(), leafMat, under(80, 2, box(-48, 48, -34, 30), edge(0.66, 2.6)).map((p) => [...p, 0.75 + R() * 0.6]), { tint: (c) => c.setRGB(1, 1, 1).multiplyScalar(1.3 + R() * 0.4) });
    placeInst(bladeG.build(), leafMat, under(160, 1.4, box(-50, 50, -36, 32), edge(0.6, 2.3)).map((p) => [...p, 0.6 + R() * 0.7]), { tint: (c) => c.setHSL(0.24 + R() * 0.05, 0.3, 0.52).multiplyScalar(1.6) });
  }

  /* ---------------- 10. LIANAS, LOGS, HANGING VINES, CREEPER CURTAINS ---------------- */
  {
    const woody = new Geo();
    const near = trunks.filter(([x, z, r, y]) => Math.hypot(x, z) < 60 && y > -5 && y < 15);
    // lianas looping between neighbouring trunks
    for (let i = 0, made = 0; i < near.length && made < 40; i++) {
      const [x1, z1, r1, y1] = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const [x2, z2, r2, y2] = near[j], d = Math.hypot(x2 - x1, z2 - z1);
        if (d < 5 || d > 15 || R() < 0.55) continue;
        const h1 = y1 + 6 + R() * 10, h2 = y2 + 6 + R() * 10, sag = 1.5 + d * 0.25 + R() * 2, pts = [], rr = [], rad = 0.04 + R() * 0.05;
        for (let k = 0; k <= 22; k++) { const t = k / 22; pts.push(V(lerp(x1, x2, t), lerp(h1, h2, t) - sag * 4 * t * (1 - t) + Math.sin(t * 9 + i) * 0.08, lerp(z1, z2, t))); rr.push(rad); }
        tube(woody, pts, rr, 5, 1, 0.5); made++;
        break;
      }
    }
    // lianas spiralling up trunks, and long loops hanging from the crowns
    for (const [x, z, r, y] of near.slice(0, 50)) {
      if (r < 0.3) continue;
      if (R() < 0.55) {
        const pts = [], rr = [], a0 = R() * TAU, turns = 1.5 + R() * 2, hh = 8 + R() * 10, rad = 0.05 + R() * 0.03;
        for (let k = 0; k <= 40; k++) { const t = k / 40, a = a0 + t * turns * TAU, rt = r * (1 - 0.3 * t) + 0.9 * r * Math.exp(-t * hh / 1.2) + rad + 0.03; pts.push(V(x + Math.cos(a) * rt, y + t * hh, z + Math.sin(a) * rt)); rr.push(rad); }
        tube(woody, pts, rr, 5, 1, 0.5);
      }
      if (R() < 0.5) {
        const a = R() * TAU, top = y + 9 + R() * 8, bot = y + 1 + R() * 2.5, dx = Math.cos(a) * (1.5 + R() * 2), dz = Math.sin(a) * (1.5 + R() * 2), pts = [], rr = [];
        for (let k = 0; k <= 24; k++) { const t = k / 24, w = Math.sin(t * Math.PI); pts.push(V(x + dx * (0.4 + w * 0.8) + Math.cos(a) * r, lerp(top, top - 0.5, t) - (top - bot) * w, z + dz * (0.4 + w * 0.8) + Math.sin(a) * r + t * 1.6)); rr.push(0.045); }
        tube(woody, pts, rr, 5, 1, 0.5);
      }
    }
    // fallen logs (mossy, hollow ends)
    for (let n = 0, t = 0; n < 7 && t < 400; t++) {
      const x = (R() - 0.5) * 90, z = -40 + R() * 70, a = R() * TAU, L = 5 + R() * 5, rad = 0.35 + R() * 0.25;
      const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
      if (![[x, z], [ex, ez], [(x + ex) / 2, (z + ez) / 2]].every(([px, pz]) => clearE(px, pz) > 1.0 && onLand(px, pz) && !inBand(px, pz, 4) && !nearStream(px, pz, 1.5))) continue;
      const pts = [], rr = [];
      for (let k = 0; k <= 10; k++) { const s = k / 10, px = lerp(x, ex, s), pz = lerp(z, ez, s); pts.push(V(px, groundH(px, pz) + rad * 0.65, pz)); rr.push(rad * (1 - 0.15 * s)); }
      tube(woody, pts, rr, 12, 2, 0.4);
      trunks.push([(x + ex) / 2, (z + ez) / 2, 0, groundH((x + ex) / 2, (z + ez) / 2) + rad * 1.4, 'log']);
      n++;
    }
    const lm = new THREE.Mesh(woody.build(), barkMat);
    root.add(lm);

    // hanging vines (crossed ribbons of the vine strand) from the crowns + long creepers down the wall
    const pos = [], uv = [], hang = [], idx = [];
    const strand = (x, y, z, L, w, seed) => {
      const segs = Math.max(2, Math.round(L / 0.9));
      for (const rot of [0, Math.PI / 2]) {
        const sx = Math.cos(seed * 6 + rot) * w / 2, sz = Math.sin(seed * 6 + rot) * w / 2;
        for (let k = 0; k < segs; k++) {
          const y0 = y - (k / segs) * L, y1 = y - ((k + 1) / segs) * L, b = pos.length / 3;
          const wob0 = Math.sin(k * 0.9 + seed * 7) * 0.12, wob1 = Math.sin((k + 1) * 0.9 + seed * 7) * 0.12;
          pos.push(x - sx + wob0, y0, z - sz, x + sx + wob0, y0, z + sz, x + sx + wob1, y1, z + sz, x - sx + wob1, y1, z - sz);
          uv.push(A.vine[0], A.vine[3], A.vine[2], A.vine[3], A.vine[2], A.vine[1], A.vine[0], A.vine[1]);
          const h0 = y - y0, h1 = y - y1;
          hang.push(h0, seed, h0, seed, h1, seed, h1, seed);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
    };
    let nv = 0;
    for (const [x, y, z] of anchors) {
      if (nv > 220 || Math.hypot(x, z) > 55 || !offAxis(x, z, 24) || inBand(x, z, 4.5)) continue;
      const L = Math.min(3 + R() * 9, y - groundH(x, z) - 1.2);
      if (L < 2) continue;
      strand(x, y, z, L, 0.4 + R() * 0.15, R()); nv++;
    }
    // creepers down the gorge wall (never over the falls): curtains near the crest, long strands lower
    const cur = (x, yTop, h, w) => {
      const z = cliffZ(x, yTop - h / 2) - 0.35, b = pos.length / 3, seed = R();
      const zt = cliffZ(x, yTop) - 0.25, zb = cliffZ(x, yTop - h) - 0.4;
      pos.push(x - w / 2, yTop, zt, x + w / 2, yTop, zt, x + w / 2, yTop - h, Math.min(zb, z), x - w / 2, yTop - h, Math.min(zb, z));
      uv.push(A.curtain[0], A.curtain[3], A.curtain[2], A.curtain[3], A.curtain[2], A.curtain[1], A.curtain[0], A.curtain[1]);
      hang.push(0, seed, 0, seed, h * 0.4, seed, h * 0.4, seed);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let i = 0; i < 70; i++) {
      const x = (R() - 0.5) * 120; if (Math.abs(x) < 7.5 || Math.abs(Math.abs(x) - 9.5) < 1.6) continue;
      const top = Ht(x) - 0.2 - (R() < 0.4 ? R() * 14 : 0);
      cur(x, top, 2.5 + R() * 5, 1.8 + R() * 2.5);
    }
    for (let i = 0; i < 60; i++) {
      const x = (R() - 0.5) * 110; if (Math.abs(x) < 7.5 || Math.abs(Math.abs(x) - 9.5) < 1.2) continue;
      const top = Ht(x) - 0.3, L = 6 + R() * 18;
      strand(x, top, cliffZ(x, top - L * 0.5) - 0.3, L, 0.45, R());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aHang', new THREE.Float32BufferAttribute(hang, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) { const ny = nrm.getY(i); nrm.setXYZ(i, nrm.getX(i) * 0.5, Math.abs(ny) + 0.6, nrm.getZ(i) * 0.5); }
    geo.normalizeNormals();
    const vm = new THREE.Mesh(geo, vineMat);
    vm.layers.enable(REFL);
    root.add(vm);
  }

  /* ---------------- 11. GLOWING FUNGI — caps, shelf brackets, a soft glow on the ground ---------------- */
  {
    const capG = (() => {
      const pts = [];
      for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(new THREE.Vector2(Math.sin(t * Math.PI / 2) * 0.16 + 0.001, 0.2 + Math.cos(t * Math.PI / 2) * 0.09)); }
      pts.push(new THREE.Vector2(0.05, 0.17));
      const cap = new THREE.LatheGeometry(pts, 9), stem = new THREE.CylinderGeometry(0.025, 0.035, 0.2, 5, 1, true); stem.translate(0, 0.1, 0);
      const parts = [cap, stem].map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; });
      const col = parts.map((g, k) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length / 3; i++) { const y = g.attributes.position.getY(i), b = k ? 0.35 : 0.55 + 0.45 * sm(0.18, 0.29, y); a.set([b, b, b], i * 3); } return a; });
      parts.forEach((g, k) => g.setAttribute('color', new THREE.BufferAttribute(col[k], 3)));
      const out = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'color']) { const arr = new Float32Array(parts[0].attributes[k].array.length + parts[1].attributes[k].array.length); arr.set(parts[0].attributes[k].array); arr.set(parts[1].attributes[k].array, parts[0].attributes[k].array.length); out.setAttribute(k, new THREE.BufferAttribute(arr, 3)); }
      return out;
    })();
    const shelfG = (() => { const g = new THREE.SphereGeometry(0.22, 12, 4, 0, Math.PI, 0, Math.PI / 2); g.scale(1, 0.32, 0.8); return g; })();
    const fm = new THREE.MeshBasicMaterial({ vertexColors: true });
    const caps = [], shelves = [], glows = [];
    const glowCol = () => new THREE.Color().setHSL(0.43 + R() * 0.1, 0.95, 0.4).multiplyScalar(1.0 + R() * 0.5);
    const cluster = (x, z, n, rad) => {
      if (!offAxis(x, z, 24) || inBand(x, z, 2.5) || inPool(x, z) || nearStream(x, z, 0.4)) return;
      const c = glowCol();
      for (let i = 0; i < n; i++) { const a = R() * TAU, r = R() * rad, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; caps.push([px, groundH(px, pz) - 0.02, pz, R() * TAU, 0.5 + R() * 1.1, c]); }
      glows.push([x, groundH(x, z) + 0.04, z, rad * 2 + 1.2, c]);
    };
    for (const [x, z, r, y, kind] of trunks) {
      if (Math.hypot(x, z) > 60 || y > 8) continue;
      if (kind === 'log') { for (let i = 0; i < 3; i++) cluster(x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, 5 + Math.floor(R() * 5), 0.6); continue; }
      if (R() < 0.5) { const a = R() * TAU; cluster(x + Math.cos(a) * (r + 0.6), z + Math.sin(a) * (r + 0.6), 3 + Math.floor(R() * 6), 0.5); }
      if (R() < 0.55 && offAxis(x, z, 24)) {
        const c = glowCol(), a0 = R() * TAU;
        for (let i = 0; i < 3 + Math.floor(R() * 4); i++) { const a = a0 + (R() - 0.5) * 0.9, h = 0.5 + R() * 2.6; shelves.push([x + Math.cos(a) * (r * 0.95 + 0.02), y + h, z + Math.sin(a) * (r * 0.95 + 0.02), -a + Math.PI / 2, 0.7 + R() * 0.8, c]); }
      }
    }
    for (let i = 0; i < 40; i++) { const x = (R() - 0.5) * 80, z = (R() - 0.5) * 60; if (clearE(x, z) > 0.75 && onLand(x, z)) cluster(x, z, 3 + Math.floor(R() * 5), 0.5); }
    const inst = (geo, list, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, ry, s, c], i) => { _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, c); });
      im.computeBoundingSphere(); root.add(im);
    };
    inst(capG, caps, fm);
    inst(shelfG, shelves, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const gm = new THREE.MeshBasicMaterial({ map: softTexture(0, 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 });
    const disc = new THREE.PlaneGeometry(1, 1); disc.rotateX(-Math.PI / 2);
    const gi = new THREE.InstancedMesh(disc, gm, glows.length);
    glows.forEach(([x, y, z, s, c], i) => { _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(s); _o.updateMatrix(); gi.setMatrixAt(i, _o.matrix); gi.setColorAt(i, c.clone().multiplyScalar(0.35)); });
    gi.computeBoundingSphere(); gi.renderOrder = 2; root.add(gi);
  }

  /* ---------------- 12. FIREFLIES ---------------- */
  {
    const pts = [];
    const swarm = (x, z, n, r, h0, h1) => {
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, rr = Math.sqrt(R()) * r, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        if (!offAxis(px, pz, 24) || inBand(px, pz, 2.6)) continue;
        const gy = inPool(px, pz) ? WATER_Y : groundH(px, pz);
        pts.push([px, gy + h0 + R() * (h1 - h0), pz]);
      }
    };
    for (let i = 0; i < 46; i++) { const a = R() * TAU, x = Math.cos(a) * (outX + 13 + R() * 22), z = Math.sin(a) * (outZ + 10 + R() * 16); swarm(x, z, 22, 4 + R() * 4, 0.3, 3.5); }
    for (let i = 0; i < 12; i++) swarm((R() - 0.5) * 56, lerp(bankZ(0) + 1, zFace(0) - 3, R()), 18, 4, 0.2, 2.5);
    for (let i = 0; i < 16; i++) { const p = stream[Math.floor(R() * stream.length * 0.7)]; swarm(p.x, p.z, 14, 3, 0.2, 2); }
    for (let i = 0; i < 10; i++) swarm((R() - 0.5) * 60, -35 - R() * 25, 24, 8, 0.5, 6);
    const ff = makeFireflies(pts, uTime, [0.72, 1.0, 0.38]);
    ff.layers.enable(REFL);
    root.add(ff);
  }

  /* ---------------- 13. MOONBEAMS through the canopy (never over the court) ---------------- */
  {
    const geos = [];
    const beam = (x, z, len, r0) => {
      const g = new THREE.CylinderGeometry(r0 * 1.25, r0, len, 18, 1, true);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), MOON);
      g.applyQuaternion(q); g.translate(x, groundH(x, z) - 0.2, z);
      geos.push(g);
    };
    for (const [x, z, l, r] of [[-17, -22, 26, 1.1], [-6, -26, 30, 1.6], [7, -23, 24, 0.9], [19, -28, 30, 1.4], [-27, -31, 28, 1.2], [3, -36, 32, 2.0], [-38, 42, 26, 1.4], [26, 46, 26, 1.2], [-10, 52, 26, 1.6]]) {
      if (!offAxis(x, z, 26)) continue;
      beam(x, z, l, r);
    }
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) { const sz = geos[0].attributes[k].itemSize, arr = []; for (const gg of geos) { const n = gg.index ? gg.toNonIndexed() : gg; arr.push(...n.attributes[k].array); } g.setAttribute(k, new THREE.Float32BufferAttribute(arr, sz)); }
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime, uCol: { value: new THREE.Color(0.32, 0.4, 0.58) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vWP;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vY = uv.y; vWP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vWP;
        ${NOISE_GLSL}
        void main() {
          vec3 n = dot(vN, vN) > 1e-10 ? normalize(vN) : vec3(0.0, 0.0, 1.0), v = dot(vV, vV) > 1e-10 ? normalize(vV) : vec3(0.0, 0.0, 1.0);
          float e = abs(dot(n, v));
          float a = e * e * smoothstep(0.0, 0.12, vY) * smoothstep(1.0, 0.45, vY);
          a *= 0.55 + 0.7 * jfbm(vWP.xz * 0.5 + vWP.y * 0.25 + uTime * 0.03);
          a *= 0.11;
          gl_FragColor = vec4(uCol * a, a);
        }`,
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 6;
    root.add(m);
  }

  /* ---------------- 14. DISTANT RIDGES IN MIST + the valley's sea of mist ---------------- */
  {
    const pos = [], col = [], idx = [];
    const layers = [[185, 26, 0.55, 0.32], [245, 44, 0.38, 0.5], [320, 70, 0.26, 0.7]];
    const haze = new THREE.Color(0.026, 0.034, 0.075), dark = new THREE.Color(0.004, 0.006, 0.013), c = new THREE.Color();
    layers.forEach(([rad, hgt, fr, hz], L) => {
      const segs = 360, rows = 6, base = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU, top = hgt * (0.35 + 0.65 * N.ridged(Math.cos(a) * fr * 6 + L * 10, Math.sin(a) * fr * 6)) - 12;
        for (let j = 0; j <= rows; j++) {
          const t = j / rows, y = lerp(-40, top, Math.pow(t, 0.8)), rr = rad + (1 - t) * 8;
          pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          const lit = Math.max(0, Math.cos(a - Math.atan2(MOON.z, MOON.x))) * 0.35 * N.n2(i * 0.3, j + L * 5);
          c.copy(dark).lerp(haze, Math.min(1, hz * 0.6 + (1 - t) * 0.8)).multiplyScalar(1 + lit);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < segs; i++) for (let j = 0; j < rows; j++) { const a = base + i * (rows + 1) + j, b = a + rows + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -2;
    root.add(m);
    // a sea of mist over the valley + mist pooled between the far hills
    const mg = [];
    for (const [y, z0, z1, x0, x1] of [[-30, -60, -200, -190, 190], [-22, -70, -170, -160, 160], [-12, -110, -230, -230, 230]]) { const p = new THREE.PlaneGeometry(x1 - x0, z0 - z1, 1, 1); p.rotateX(-Math.PI / 2); p.translate((x0 + x1) / 2, y, (z0 + z1) / 2); mg.push(p.toNonIndexed()); }
    const g2 = new THREE.BufferGeometry();
    for (const k of ['position', 'uv']) { const arr = []; mg.forEach((p) => arr.push(...p.attributes[k].array)); g2.setAttribute(k, new THREE.Float32BufferAttribute(arr, k === 'uv' ? 2 : 3)); }
    const mm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0.15, 0.18, 0.25) } }]),
      vertexShader: `varying vec3 vWP; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() { vUv = uv; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vWP; varying vec2 vUv;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main() {
          float n = jfbm(vWP.xz * 0.018 + vec2(uTime * 0.006, uTime * 0.003) + vWP.y * 0.1);
          float n2 = jfbm(vWP.xz * 0.05 - vec2(uTime * 0.01, 0.0));
          float e = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float a = smoothstep(0.32, 0.75, n * 0.75 + n2 * 0.35) * 0.55 * e;
          gl_FragColor = vec4(uCol * (0.8 + 0.4 * n2), a);
          #include <fog_fragment>
        }`,
    });
    mm.uniforms.uTime = uTime;
    const mist = new THREE.Mesh(g2, mm); mist.renderOrder = 1;
    root.add(mist);
  }

  /* ---------------- 15. FLYING FOXES round the gorge, HORNBILLS high overhead (paths in the shader) ---------------- */
  {
    const wingGeo = (kind) => {
      const p = [], w = [];
      const T = (a, b, c) => { for (const v of [a, b, c]) { p.push(v[0], v[1], v[2]); w.push(Math.abs(v[0])); } };
      if (kind === 'bat') {
        T([-0.05, 0, 0.22], [0.05, 0, 0.22], [0, 0, -0.2]);
        for (const s of [-1, 1]) {
          const S = (v) => [v[0] * s, v[1], v[2]];
          const sh = S([0.04, 0, 0.1]), hip = S([0.04, 0, -0.12]), wr = S([0.3, 0.02, 0.14]), t1 = S([0.62, 0, 0.02]), t2 = S([0.55, 0, -0.12]), sc = S([0.42, 0, -0.08]), t3 = S([0.36, 0, -0.2]), sc2 = S([0.2, 0, -0.12]);
          T(sh, wr, t1); T(sh, t1, sc); T(sc, t1, t2); T(sh, sc, t3); T(sh, t3, sc2); T(sh, sc2, hip);
        }
      } else {
        T([-0.08, 0, 0.45], [0.08, 0, 0.45], [0, 0, -0.35]); T([0, 0.02, 0.45], [0, 0.12, 0.62], [0, -0.04, 0.85]); T([-0.12, 0, -0.3], [0.12, 0, -0.3], [0, 0, -0.95]);
        for (const s of [-1, 1]) {
          const S = (v) => [v[0] * s, v[1], v[2]];
          const sh = S([0.07, 0, 0.2]), hip = S([0.07, 0, -0.15]), a = S([0.45, 0.02, 0.25]), b = S([0.85, 0, 0.12]), c = S([0.95, 0, -0.02]), d = S([0.8, 0, -0.18]), e = S([0.4, 0, -0.25]);
          T(sh, a, b); T(sh, b, c); T(sh, c, d); T(sh, d, e); T(sh, e, hip);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
      return g;
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0.012, 0.012, 0.016) } }]),
      vertexShader: `uniform float uTime; attribute float aW; attribute vec4 aC; attribute vec4 aR; attribute vec4 aK;
        #include <fog_pars_vertex>
        void main() {
          float th = uTime * aR.w + aC.w;
          vec3 p = aC.xyz + vec3(cos(th) * aR.x, sin(th * 2.0 + aC.w) * aR.z, sin(th) * aR.y);
          vec3 vel = vec3(-sin(th) * aR.x, 2.0 * cos(th * 2.0 + aC.w) * aR.z, cos(th) * aR.y) * sign(aR.w);
          float vl = length(vel); vec3 f = vl > 1e-4 ? vel / vl : vec3(0.0, 0.0, 1.0);
          vec3 r = cross(f, vec3(0.0, 1.0, 0.0)); float rl = length(r); r = rl > 1e-4 ? r / rl : vec3(1.0, 0.0, 0.0);
          vec3 u = cross(r, f);
          float fl = uTime * aK.y + aC.w * 5.0;
          float flap = aK.z > 0.5 ? sin(fl) * 0.85 * smoothstep(-0.2, 0.4, sin(fl * 0.13)) + 0.08 : sin(fl) * 0.9;
          vec3 lp = position;
          float ang = flap * aW / max(abs(lp.x), 1e-3) * abs(lp.x);
          lp.y += abs(lp.x) * sin(flap) * smoothstep(0.03, 0.2, aW);
          lp.x *= mix(1.0, cos(flap), smoothstep(0.03, 0.2, aW));
          lp *= aK.x;
          vec3 wp = p - r * lp.x + u * lp.y + f * lp.z;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol;
        #include <fog_pars_fragment>
        void main() { gl_FragColor = vec4(uCol, 1.0);
        #include <fog_fragment>
        }`,
    });
    mat.uniforms.uTime = uTime;
    const flyers = (kind, list) => {
      const base = wingGeo(kind), geo = new THREE.InstancedBufferGeometry();
      geo.attributes.position = base.attributes.position; geo.attributes.aW = base.attributes.aW;
      const C = new Float32Array(list.length * 4), Rr = new Float32Array(list.length * 4), K = new Float32Array(list.length * 4);
      list.forEach((l, i) => { C.set(l[0], i * 4); Rr.set(l[1], i * 4); K.set(l[2], i * 4); });
      geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
      geo.setAttribute('aR', new THREE.InstancedBufferAttribute(Rr, 4));
      geo.setAttribute('aK', new THREE.InstancedBufferAttribute(K, 4));
      geo.instanceCount = list.length;
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; root.add(m);
    };
    const bats = [];
    for (let i = 0; i < 16; i++) {
      const gorge = i < 10, cx = gorge ? (R() - 0.5) * 30 : (R() - 0.5) * 40, cz = gorge ? 18 + R() * 14 : -34 - R() * 24, cy = gorge ? 13 + R() * 12 : 6 + R() * 8;
      const rx = 5 + R() * 9, rz = 3 + R() * 6;
      bats.push([[cx, cy, cz, R() * TAU], [rx, rz, 0.6 + R() * 1.2, (R() < 0.5 ? -1 : 1) * (5.5 + R() * 2) / Math.max(rx, rz)], [1.8 + R() * 0.6, 9 + R() * 3, 0, 0]]);
    }
    flyers('bat', bats);
    flyers('hornbill', [
      [[0, 46, 40, 0], [150, 26, 2.5, 7.5 / 150], [2.6, 3.4, 1, 0]],
      [[0, 47.5, 43, -0.025], [150, 26, 2.5, 7.5 / 150], [2.4, 3.6, 1, 0]],
      [[-20, 52, 55, 2.2], [120, 34, 3, -7 / 120], [2.6, 3.2, 1, 0]],
    ]);
  }

  /* ---------------- the venue look while Ultra is on ---------------- */
  const look = { hemiSky: 0x4a5c94, hemiGround: 0x141a14, exposure: 1.16, bloom: 0.62 };

  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update, look: { night: look }, fog: { day: [40, 220], night: [32, 250] } };
}
