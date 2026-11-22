// RIVERSIDE PIER — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on Ultra.
// It replaces the map's low-poly pieces (`lite` in riverside.js: water, banks, deck + piles, shophouses, lamps, stalls, trees,
// prangs, bridges, boats, the flat light streaks) with:
//  • a river that runs straight past the pier and BENDS AWAY at both ends (so straight down the river, behind the ball's
//    flight in both match cameras, there is only dark water, a dark tree-lined bank and sky);
//  • water that mirrors the world (a real planar reflection of the lit scene, streaked by the ripples), scrolling ripples,
//    a slow swell and V-shaped wakes behind every moving boat;
//  • a teak pier of individual planks on round piles with cross-bracing, bearers, rope lashings, tyre fenders, bollards;
//  • Sino-Portuguese shophouses with framed windows, open shutters, balconies, blade signs, awnings and lit shops;
//  • a floodlit prang (Wat Arun style) and a golden chedi on the far bank off to the sides, a riverside wat straight across,
//    a cable-stayed bridge and an arched bridge far up and down the river, a city skyline + its glow on the horizon;
//  • long-tail boats, a rice-barge train, express ferries, a dinner cruise, a floating market, drifting water hyacinth;
//  • mist on the water, moths at the lamps, fireflies in the trees, steam off the noodle stalls, egrets crossing the river.
// GAMEPLAY RULE: nothing new on or over the court + free zone; everything bright keeps ≥ ~17° off the axis of both match
// cameras (see `offAxis`), so the band of sky / horizon the ball flies through stays dark and calm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, V2, V3, enhance, softTexture, TAU } from './temple-ultra.js';
import { personGeometry, makeFireflies } from './life.js';

const REFL_LAYER = 4;                       // meshes on this layer show up in the water's reflection
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// the river bends away (toward +z) beyond |x| > BEND_X at both ends
const BEND_X = 60, BEND_K = 0.003;
const bend = (x) => { const a = Math.abs(x) - BEND_X; return a > 0 ? BEND_K * a * a : 0; };
const slope = (x) => { const a = Math.abs(x) - BEND_X; return a > 0 ? 2 * BEND_K * a * Math.sign(x) : 0; };
const BEND_GLSL = `float rvBend(float x) { float a = abs(x) - ${BEND_X.toFixed(1)}; return a > 0.0 ? ${BEND_K} * a * a : 0.0; }`;

// is (x, z) far enough off the axis of both match cameras (at x = ±14.6 looking along ∓x) to carry something bright?
function offAxis(x, z, deg = 17) {
  const t = Math.tan((deg * Math.PI) / 180);
  for (const cx of [-14.6, 14.6]) { const fwd = cx < 0 ? x - cx : cx - x; if (fwd > 0 && Math.abs(z) < fwd * t) return false; }
  return true;
}

/* ---------------- geometry helpers ---------------- */
// non-indexed copy with position / normal / uv / color (vertex colour `col`, optional per-vertex jitter)
function vc(geo, col, jit = 0, R = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (col !== undefined && col !== null) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    _c.set(col); if (jit) _c.offsetHSL(0, 0, (R() - 0.5) * jit);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  } else if (!g.attributes.color) {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  }
  return g;
}
const T = (geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  return geo.applyMatrix4(_o.matrix);
};
// apply a parent frame (position + yaw) to a geometry built in local coordinates
const frame = (geo, x, y, z, ry) => { _m.makeRotationY(ry).setPosition(x, y, z); return geo.applyMatrix4(_m); };
function mergeAll(list) {
  const clean = list.map((g) => vc(g));
  return mergeGeometries(clean);
}
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, { cast = false, receive = false, refl = true } = {}) {
      const out = [];
      for (const [mat, list] of m) {
        if (!list.length) continue;
        const mesh = new THREE.Mesh(mergeAll(list), mat); mesh.castShadow = cast; mesh.receiveShadow = receive;
        if (refl && !mat.userData.noRefl) mesh.layers.enable(REFL_LAYER);
        parent.add(mesh); out.push(mesh);
      }
      m.clear();
      return out;
    },
  };
}
// lathe whose cross-section is a rounded square (superellipse exponent p; p = 2 → circle, large → square)
function sqLathe(profile, seg = 48, p = 4, rot = Math.PI / 4) {
  const pos = [], idx = [], uv = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    const k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
    const [r, y] = profile[i], ca = Math.cos(a + rot), sa = Math.sin(a + rot);
    pos.push(r * k * ca, y, r * k * sa); uv.push(j / seg, i / (n - 1));
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const lathe = (pts, seg) => new THREE.LatheGeometry(V2(pts), seg);
// a tube along a list of points
const tube = (pts, r, seg = 6, n = null) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n || pts.length * 4, r, seg, false);
// a box spanning two points (a beam / brace / cable), w × h cross-section
function beam(a, b, w, h = w) {
  const d = b.clone().sub(a), L = d.length(); d.normalize();
  const side = d.clone().cross(Math.abs(d.y) > 0.98 ? V3(1, 0, 0) : V3(0, 1, 0)).normalize(), up = side.clone().cross(d).normalize();
  const g = new THREE.BoxGeometry(w, L, h); g.translate(0, L / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(side, d, up));
  return g.translate(a.x, a.y, a.z);
}
function rod(a, b, r0, r1 = r0, seg = 8) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true); g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
// sagging rope / cable between two points
const sagPts = (a, b, sag, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; return p; });

/* =====================================================================
   CANVAS TEXTURES
   ===================================================================== */
// the lit-window / shopfront / sign atlas (one material for every glowing pane in the town)
// layout (1024²): windows 8×4 cells of 128² (y 0..512) · shops 4×2 cells of 256×160 (y 512..832) · signs 16 cells of 64×192 (y 832..1024)
function makeAtlas(R) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#05070a'; g.fillRect(0, 0, S, S);
  const grad = (x, y, w, h, c0, c1) => { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  const warm = [['#ffd99a', '#c27a3a'], ['#ffe6bc', '#d09050'], ['#ffc27a', '#a85a28'], ['#fff0d4', '#c8a070']];
  const cool = [['#d8ecff', '#7894b8'], ['#bfe3ff', '#4f78a8']];
  for (let k = 0; k < 32; k++) {
    const x = (k % 8) * 128, y = Math.floor(k / 8) * 128;
    if (k >= 22) {                                                     // unlit: dark glass with a faint sky sheen
      g.fillStyle = grad(x, y, 128, 128, '#141a26', '#07090d'); g.fillRect(x, y, 128, 128);
      g.fillStyle = 'rgba(120,140,190,0.06)'; g.beginPath(); g.moveTo(x, y + 128); g.lineTo(x + 70, y); g.lineTo(x + 100, y); g.lineTo(x + 30, y + 128); g.fill();
      continue;
    }
    const pal = k % 7 === 3 ? cool[k % 2] : warm[k % 4];
    g.fillStyle = grad(x, y, 128, 128, pal[0], pal[1]); g.fillRect(x, y, 128, 128);
    // a ceiling lamp's pool of light
    const rg = g.createRadialGradient(x + 40 + (k * 13) % 50, y + 18, 2, x + 64, y + 30, 90); rg.addColorStop(0, 'rgba(255,255,240,0.55)'); rg.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = rg; g.fillRect(x, y, 128, 128);
    // furniture / people silhouettes
    g.fillStyle = 'rgba(40,22,12,0.55)';
    if (k % 3 === 0) g.fillRect(x + 10, y + 86, 50, 42);                 // a cabinet
    if (k % 4 === 1) { g.beginPath(); g.arc(x + 84, y + 70, 9, 0, TAU); g.fill(); g.fillRect(x + 72, y + 79, 24, 49); }   // someone at the window
    if (k % 5 === 2) { g.fillRect(x + 20, y + 30, 36, 26); }              // a picture on the wall
    // curtains / blinds
    const cc = ['rgba(170,40,30,0.75)', 'rgba(60,110,70,0.7)', 'rgba(230,210,170,0.6)', 'rgba(40,60,130,0.7)'][k % 4];
    if (k % 2 === 0) { g.fillStyle = cc; g.fillRect(x, y, 26 + (k % 3) * 8, 128); g.fillRect(x + 102 - (k % 3) * 8, y, 26 + (k % 3) * 8, 128); }
    else if (k % 3 === 1) { g.fillStyle = 'rgba(30,20,10,0.35)'; for (let i = 0; i < 16; i++) g.fillRect(x, y + i * 8, 128, 3); }
    // mullions (the window is in two leaves)
    g.fillStyle = 'rgba(20,14,10,0.9)'; g.fillRect(x + 62, y, 4, 128); g.fillRect(x, y + 60, 128, 3);
  }
  // shopfronts
  for (let k = 0; k < 8; k++) {
    const x = (k % 4) * 256, y = 512 + Math.floor(k / 4) * 160;
    const closed = k === 7;
    if (closed) {
      g.fillStyle = '#4a4e54'; g.fillRect(x, y, 256, 160);
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 26; i++) g.fillRect(x, y + i * 6, 256, 2);
      continue;
    }
    const wall = ['#fff2d0', '#ffe8b8', '#eaf4ff', '#ffd8a0', '#f4ffe8', '#ffe0c8', '#fff8e8'][k];
    g.fillStyle = grad(x, y, 256, 160, wall, '#a87848'); g.fillRect(x, y, 256, 160);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x + 20, y + 6, 216, 5);          // fluorescent tube
    // shelves of goods
    for (let s = 0; s < 4; s++) {
      g.fillStyle = 'rgba(70,45,25,0.8)'; g.fillRect(x + 10, y + 30 + s * 28, 236, 4);
      for (let i = 0; i < 26; i++) { g.fillStyle = ['#d83a2e', '#2e7ad8', '#e8c22e', '#3aa85a', '#e86aa8', '#f2f2f2', '#ff8a2a'][(i * 7 + s * 3 + k) % 7]; g.fillRect(x + 12 + i * 9, y + 16 + s * 28, 7, 13); }
    }
    if (k % 2 === 0) { g.fillStyle = 'rgba(30,18,10,0.75)'; g.beginPath(); g.arc(x + 70 + k * 18, y + 92, 11, 0, TAU); g.fill(); g.fillRect(x + 56 + k * 18, y + 103, 28, 57); }   // shopkeeper
    g.fillStyle = 'rgba(60,40,25,0.9)'; g.fillRect(x, y + 128, 256, 32);              // counter
    if (k === 2 || k === 5) for (let i = 0; i < 4; i++) { g.fillStyle = '#ff3a2a'; g.beginPath(); g.ellipse(x + 40 + i * 58, y + 22, 9, 12, 0, 0, TAU); g.fill(); }   // red lanterns
  }
  // vertical blade signs: dark board, bright border, pseudo-glyphs
  const sc = ['#ff5a4a', '#ffd23a', '#4ae0a0', '#5ac8ff', '#ff6ad0', '#ffffff', '#ff9a3a', '#a0ff5a'];
  for (let k = 0; k < 16; k++) {
    const x = k * 64, y = 832, col = sc[k % sc.length];
    g.fillStyle = k % 3 === 0 ? '#7a1010' : k % 3 === 1 ? '#101830' : '#0e2416'; g.fillRect(x, y, 64, 192);
    g.strokeStyle = col; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, 56, 184);
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const cy = y + 22 + i * 34;
      const r2 = rng(k * 31 + i);
      g.beginPath();
      for (let s = 0; s < 3; s++) { const a = r2() * 6, b = r2() * 6; g.moveTo(x + 18 + r2() * 28, cy + r2() * 22); g.quadraticCurveTo(x + 32 + Math.cos(a) * 14, cy + 11 + Math.sin(b) * 10, x + 18 + r2() * 28, cy + r2() * 22); }
      g.stroke();
      if (r2() < 0.5) { g.beginPath(); g.arc(x + 32, cy + 11, 4, 0, TAU); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const ATLAS = {
  win: (k) => [(k % 8) / 8, 1 - (Math.floor(k / 8) + 1) * 0.125, 1 / 8, 0.125],       // [u0, v0, du, dv]  (canvas y down → v up)
  shop: (k) => [(k % 4) / 4, 1 - (512 + (Math.floor(k / 4) + 1) * 160) / 1024, 0.25, 160 / 1024],
  sign: (k) => [k / 16, 0, 1 / 16, 192 / 1024],
};
function atlasPlane(w, h, cell) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cell[0] + uv.getX(i) * cell[2], cell[1] + uv.getY(i) * cell[3]);
  return g;
}
// tower facades: window grid (map) + which windows are lit (emissive)
function towerTextures() {
  const R = rng(4242);
  const W = 512, H = 512, cols = 8, rows = 8;
  const mk = (lit) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = lit ? '#000' : '#7c8590'; g.fillRect(0, 0, W, H);
    const R2 = rng(99);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * 64, y = j * 64, on = R2() < 0.34, tone = R2();
      if (lit) { if (on) { g.fillStyle = tone < 0.6 ? '#ffcf86' : tone < 0.85 ? '#fff0d0' : '#a8d4ff'; g.globalAlpha = 0.55 + R2() * 0.45; g.fillRect(x + 6, y + 10, 52, 40); g.globalAlpha = 1; } }
      else { g.fillStyle = R2() < 0.5 ? '#2e3a48' : '#26303c'; g.fillRect(x + 6, y + 10, 52, 40); g.fillStyle = '#9aa4ae'; g.fillRect(x, y + 52, 64, 4); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  void R;
  return [mk(false), mk(true)];
}
// soft cloudy noise sprite for the mist
function mistTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), R = rng(7);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = 20 + R() * 88, y = 40 + R() * 48, r = 10 + R() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildRiversideUltra(ctx) {
  const { F, texLoader, WATER_Y, QUAY_Z, PX, PZ0, PZ1, uTime } = ctx;
  const root = new THREE.Group(); root.name = 'riverside-ultra';
  const ticks = [];
  const R = rng(5150);
  const uPR = { value: 1 };                        // pixel ratio, for point sizes
  const QUAY_TOP = 0.15, FAR_TOP = WATER_Y + 2;    // ground levels (same as High)
  const NEAR_EDGE = QUAY_Z + 0.6, FAR_EDGE = 61.3; // where the near quay / far embankment meet the water (straight part)
  const nearEdge = (x) => NEAR_EDGE + bend(x), farEdge = (x) => FAR_EDGE + bend(x), centre = (x) => (NEAR_EDGE + FAR_EDGE) / 2 + bend(x);

  const load = (path, srgb, rep = 1) => {
    const t = texLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const woodTex = load('assets/riverside-ultra/rough_wood_diff.jpg', true), woodNor = load('assets/riverside-ultra/rough_wood_nor_gl.jpg');
  const plasterTex = load('assets/temple-ultra/clay_plaster_diff.jpg', true);
  const roofTex = load('assets/temple/roof_diff.jpg', true);
  const glowCol = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const M = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex, normalMap: woodNor, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.82 }),
    vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    vcDS: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: glowCol(0xffffff, 2.0) }),
    wall: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { tri: plasterTex, triScale: 0.32, triAmt: 0.9, upK: 0.3, upFall: 2.2, upWrap: 0.35, upCol: 0xffc890, upY: QUAY_TOP, upCentre: [0, 0, 24] }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    panes: new THREE.MeshBasicMaterial({ map: null, color: glowCol(0xffffff, 1.45), side: THREE.DoubleSide }),
    white: enhance(new THREE.MeshStandardMaterial({ color: 0xe2d6c2, roughness: 0.7 }), { tri: plasterTex, triScale: 0.45, upK: 0.62, upFall: 14, upWrap: 0.6, upCol: 0xffb468, upY: FAR_TOP, upCentre: [0, 0, 0] }),
    gold: enhance(new THREE.MeshStandardMaterial({ color: 0xe2ab4e, metalness: 0.8, roughness: 0.3, emissive: 0x1a0e02 }), { upK: 0.75, upFall: 18, upWrap: 0.6, upCol: 0xffb050, upY: FAR_TOP, upCentre: [0, 0, 0] }),
    trim: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { tri: plasterTex, triScale: 0.32, triAmt: 0.6, upK: 0.3, upFall: 2.2, upWrap: 0.35, upCol: 0xffc890, upY: QUAY_TOP, upCentre: [0, 0, 24] }),
    watWhite: enhance(new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.75 }), { tri: plasterTex, triScale: 0.4, upK: 0.32, upFall: 4.5, upWrap: 0.5, upCol: 0xffc888, upY: FAR_TOP, upCentre: [0, 0, 0] }),
    steel: enhance(new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.5, metalness: 0.4 }), { upK: 0.55, upFall: 14, upWrap: 0.8, upCol: 0xfff0d8, upY: 6, upCentre: [0, 0, 0] }),
  };
  M.panes.map = makeAtlas(R);
  for (const k of ['vc', 'vcDS', 'metal', 'trim']) M[k].userData.noRefl = true;   // small details: not worth a second pass in the mirror
  M.panes.customProgramCacheKey = () => 'rvPanes';
  const B = batch();

  /* ---------------- 1. WATER — mirror reflection, ripples, swell and boat wakes ---------------- */
  const NWAKE = 14;
  const wakeU = Array.from({ length: NWAKE }, () => new THREE.Vector4(0, 0, 0, 0));
  const mirror = { rt: new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }), cam: new THREE.PerspectiveCamera(), mat: new THREE.Matrix4(), busy: false };
  mirror.cam.layers.set(REFL_LAYER);
  let water;
  {
    const nor = load('assets/pond/water_nor.jpg');
    const U = { uTime, uNor: { value: nor }, uRefl: { value: mirror.rt.texture }, uReflMat: { value: mirror.mat }, uWY: { value: WATER_Y }, uWake: { value: wakeU } };
    const m = new THREE.MeshStandardMaterial({ color: 0x0b1614, roughness: 0.16, metalness: 0.0, envMapIntensity: 0.12 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uTime; uniform sampler2D uNor; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uWY; uniform vec4 uWake[${NWAKE}];
        varying vec3 vWP;
        vec3 gN; float gFoam;
        vec2 rvWakes(vec2 p, inout float foam) {
          vec2 d = vec2(0.0);
          for (int i = 0; i < ${NWAKE}; i++) {
            vec4 b = uWake[i]; float sp = length(b.zw);
            if (sp < 0.1) continue;
            vec2 f = b.zw / sp, s = vec2(-f.y, f.x), r = p - b.xy;
            float u = -dot(r, f), v = dot(r, s);           // metres astern of the stern, metres abeam
            if (u < -5.0 || u > 110.0 || abs(v) > 45.0) continue;
            float uu = max(u, 0.0), amp = clamp(sp / 5.0, 0.25, 1.3) * exp(-uu / 55.0);
            float arm = abs(v) - (uu * 0.36 + 0.7);             // the two arms of the Kelvin wedge (19.5°)
            float onArm = exp(-arm * arm * 0.3) * smoothstep(-3.0, 1.0, u);
            d += s * sign(v) * sin(abs(v) * 2.3 - uu * 0.85 - uTime * 2.4) * onArm * amp * 0.38;
            float inside = smoothstep(0.5, -2.5, arm) * smoothstep(-1.0, 2.0, u);
            d += f * sin(uu * 1.05 - uTime * 3.1) * inside * amp * 0.26;
            float wash = exp(-v * v * (0.9 / (1.0 + uu * 0.04))) * smoothstep(-1.0, 1.0, u) * exp(-uu / (3.0 + sp * 1.1)) * (0.55 + 0.45 * sin(uu * 3.1 + v * 5.0 - uTime * 4.0));
            foam += wash * clamp(sp / 4.0, 0.0, 1.0) * 0.7 + onArm * amp * 0.06;
          }
          return d;
        }
        vec3 rvNormal(vec2 p) {
          vec2 fl = vec2(-0.32 * uTime, 0.0);                   // the current runs toward -x
          vec3 a = texture2D(uNor, (p + fl) * 0.055 + vec2(0.0, uTime * 0.005)).xyz * 2.0 - 1.0;
          vec3 b = texture2D(uNor, (p + fl * 1.25) * 0.16 + vec2(uTime * 0.011, -uTime * 0.014)).xyz * 2.0 - 1.0;
          vec3 c = texture2D(uNor, (p + fl * 0.7) * 0.019 + 0.37).xyz * 2.0 - 1.0;
          vec2 d = a.xy * 0.5 + b.xy * 0.32 + c.xy * 0.55;
          d += vec2(sin(p.x * 0.23 + p.y * 0.07 + uTime * 1.1), sin(p.y * 0.19 - uTime * 0.8 + p.x * 0.04)) * 0.07;   // a slow swell
          float foam = 0.0;
          d += rvWakes(p, foam);
          gFoam = clamp(foam, 0.0, 1.0) * (0.55 + 0.45 * b.z);
          d *= mix(1.0, 0.5, smoothstep(40.0, 260.0, length(cameraPosition.xz - p)));
          return normalize(vec3(-d.x * 0.42, 1.0, -d.y * 0.42));
        }
        ` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          gN = rvNormal(vWP.xz);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.58), gFoam * 0.4);`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
        .replace('#include <opaque_fragment>', `{
            vec3 V = normalize(cameraPosition - vWP);
            float cosT = max(dot(gN, V), 0.0);
            float fr = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
            vec4 rc = uReflMat * vec4(vWP.x, uWY, vWP.z, 1.0);
            vec2 ruv = rc.xy / rc.w + gN.xz * vec2(0.035, 0.05);
            float st = 0.003 + 0.012 * (1.0 - cosT);                // lights smear into vertical streaks on the ripples
            vec3 refl = vec3(0.0); float ws = 0.0;
            for (int k = -4; k <= 4; k++) { float w = exp(-float(k * k) * 0.14); refl += texture2D(uRefl, ruv + vec2(gN.x * 0.006 * float(k), float(k) * st)).rgb * w; ws += w; }
            refl /= ws;
            outgoingLight = outgoingLight * (1.0 - fr * 0.6) + refl * (0.16 + 0.84 * fr) + vec3(0.012, 0.014, 0.016) * gFoam;
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'rvWater';
    water = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), m);
    water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, 190);
    water.receiveShadow = true;
    root.add(water);
    const v2 = new THREE.Vector2(), cp = new THREE.Vector3(), cq = new THREE.Quaternion(), dir = new THREE.Vector3(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    water.onBeforeRender = (renderer, scene, camera) => {
      if (mirror.busy || camera === mirror.cam || !camera.isPerspectiveCamera) return;
      camera.updateMatrixWorld();
      camera.getWorldPosition(cp); camera.getWorldQuaternion(cq);
      if (cp.y <= WATER_Y + 0.05) return;
      renderer.getDrawingBufferSize(v2);
      const w = Math.max(64, Math.round(Math.min(1024, v2.x * 0.5))), h = Math.max(32, Math.round((w * v2.y) / v2.x));
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
      // oblique near plane = the water surface (nothing under the water shows in the reflection)
      plane.setFromNormalAndCoplanarPoint(V3(0, 1, 0), V3(0, WATER_Y, 0)).applyMatrix4(mc.matrixWorldInverse);
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
      renderer.render(scene, mc);
      renderer.xr.enabled = prevXR; renderer.shadowMap.autoUpdate = prevSh;
      renderer.setRenderTarget(prevRT);
      mirror.busy = false;
    };
  }

  /* ---------------- 2. BANKS — the near quay (paving, granite coping, stone wall) and the far embankment ---------------- */
  {
    const pave = load('assets/temple/paving_diff.jpg', true), paveN = load('assets/temple/paving_nor_gl.jpg');
    const landM = new THREE.MeshStandardMaterial({ map: pave, normalMap: paveN, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 0.88 });
    const pos = [], uv = [], col = [], idx = [];
    const vert = (x, y, z, c, u, v) => { pos.push(x, y, z); uv.push(u ?? x / 2.6, v ?? z / 2.6); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
    const cA = new THREE.Color(), cB = new THREE.Color();
    // columns of the land surface, from the water's edge back (rows = [offset from the edge, colour])
    // rows: [offset back from the edge, colour]; then the land runs on to an absolute z (zEnd)
    const surface = (edge, sgn, y, rows, zEnd, x0, x1) => {
      const xs = []; for (let x = x0; x <= x1 + 1e-6;) { xs.push(x); x += Math.abs(x) < 70 ? 2 : Math.abs(x) < 200 ? 3 : 5; }
      const nr = rows.length + 1, base = pos.length / 3;
      for (const x of xs) {
        for (const [off, c] of rows) { let z = edge(x) - sgn * off; z = sgn > 0 ? Math.max(z, zEnd + 1) : Math.min(z, zEnd - 1); vert(x, y, z, cA.set(c)); }
        vert(x, y, zEnd, cA.set(rows[rows.length - 1][1]));
      }
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < nr - 1; j++) {
        const a = base + i * nr + j, b = a + nr;
        if (sgn > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    };
    surface(nearEdge, 1, QUAY_TOP, [[0, 0xb8b2a6], [0.6, 0xb8b2a6], [0.62, 0x8c8478], [16, 0x8a8276], [40, 0x5a5650]], -380, -380, 380);
    surface(farEdge, -1, FAR_TOP, [[0, 0xaaa294], [0.6, 0xaaa294], [0.62, 0x7d766a], [8, 0x6e675c], [9, 0x3c4630], [60, 0x2c3426]], 400, -380, 380);
    // the stone faces of both banks (following the curve), with a dark wet band at the waterline
    const wall = (edge, sgn, top, x0, x1) => {
      const base = pos.length / 3; let n = 0, arc = 0, px = null, pz = null;
      for (let x = x0; x <= x1 + 1e-6; x += Math.abs(x) < 70 ? 2 : 4) {
        const z = edge(x); if (px !== null) arc += Math.hypot(x - px, z - pz); px = x; pz = z;
        for (const [y, c] of [[top, 0x9a9488], [top - 0.25, 0x847d72], [WATER_Y + 0.45, 0x6e675e], [WATER_Y + 0.2, 0x2e2c24], [WATER_Y - 2.5, 0x1a1a16]]) vert(x, y, z, cB.set(c), arc / 1.6, y / 1.6);
        n++;
      }
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < 4; j++) {
        const a = base + i * 5 + j, b = a + 5;
        if (sgn > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    };
    wall(nearEdge, 1, QUAY_TOP, -380, 380);
    wall(farEdge, -1, FAR_TOP, -380, 380);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, landM); land.receiveShadow = true; land.layers.enable(REFL_LAYER);
    root.add(land);
  }

  /* ---------------- 3. THE PIER — planks, bearers, round piles, bracing, rope, fenders, bollards ---------------- */
  {
    const DECK = -0.12, PT = 0.05, PW = 0.2, GAP = 0.013;
    const planks = [];
    const teak = [0xc89a6c, 0xb88a5e, 0xd2a678, 0xa87c52, 0xc09060, 0xb5835a];
    const plank = (x0, x1, z) => {
      const L = x1 - x0; if (L < 0.15) return;
      const gg = new THREE.BoxGeometry(PW, PT, L - 0.006), uv = gg.attributes.uv;
      const ou = R(), ov = R();
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ou + uv.getX(i) * 0.14, ov + uv.getY(i) * L / 1.6);
      gg.rotateY(Math.PI / 2);
      gg.translate((x0 + x1) / 2, DECK - PT / 2 + (R() - 0.5) * 0.004, z);
      planks.push(vc(gg, teak[Math.floor(R() * teak.length)], 0.1, R));
    };
    for (let z = PZ0 + PW / 2; z < PZ1 - PW / 2 + 0.01; z += PW + GAP) {
      const under = Math.abs(z) < F.outZ - 0.05;                       // the court hides the middle of these rows
      const spans = under ? [[-PX, -F.outX + 0.02], [F.outX - 0.02, PX]] : [[-PX, PX]];
      for (const [a, b] of spans) {
        let x = a - R() * 2.4;
        while (x < b) { const L = 2.4 + Math.floor(R() * 3) * 1.2, x0 = Math.max(a, x), x1 = Math.min(b, x + L); plank(x0, x1, z); x += L; }
      }
    }
    B.put(M.wood, mergeGeometries(planks));
    // rim beams (fascia) and the bearers + dark sub-deck under the boards
    const wood = (geo, col) => B.put(M.wood, vc(geo, col, 0.06, R));
    for (const [len, x, z, ry] of [[PX * 2 + 0.16, 0, PZ1 + 0.04, 0], [PZ1 - PZ0, -PX - 0.04, (PZ0 + PZ1) / 2, Math.PI / 2], [PZ1 - PZ0, PX + 0.04, (PZ0 + PZ1) / 2, Math.PI / 2]]) {
      const gg = new THREE.BoxGeometry(len, 0.34, 0.1), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.6, uv.getY(i) * 0.2);
      wood(T(gg, x, DECK - 0.18, z, ry), 0x8a6444);
    }
    B.put(M.vc, vc(new THREE.BoxGeometry(PX * 2, 0.04, PZ1 - PZ0).translate(0, DECK - PT - 0.03, (PZ0 + PZ1) / 2), 0x120c08));
    for (let z = PZ0 + 0.6; z < PZ1; z += 2.4) { const gg = new THREE.BoxGeometry(PX * 2 - 0.1, 0.26, 0.22); wood(T(gg, 0, DECK - PT - 0.17, z), 0x5a4030); }
    // piles: tapered round timber, darker + wet at the waterline, a few leaning; rope lashings on the outer ones
    const pileTop = DECK - PT - 0.28, pileBot = WATER_Y - 3;
    const piles = [];
    for (let z = PZ0 + 0.6; z < PZ1; z += 2.4) for (let x = -PX + 0.3; x <= PX - 0.29; x += 2.4) piles.push([x, z]);
    for (let x = -PX + 0.3; x <= PX - 0.29; x += 2.4) piles.push([x, PZ1 - 0.12]);
    for (const [x, z] of piles) {
      const r = 0.15 + R() * 0.05, H = pileTop - pileBot;
      const gg = new THREE.CylinderGeometry(r * 0.92, r, H, 14, 3), p = gg.attributes.position, uv = gg.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + (pileTop + pileBot) / 2, a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + 0.05 * Math.sin(a * 3 + x) + 0.03 * Math.sin(y * 4 + z);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
        uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * H / 1.4);
      }
      gg.computeVertexNormals();
      const ng = gg.toNonIndexed();
      const np = ng.attributes.position, nc = new Float32Array(np.count * 3);
      for (let i = 0; i < np.count; i++) { const y = np.getY(i) + (pileTop + pileBot) / 2; _c.set(y < WATER_Y + 0.25 ? 0x262c20 : y < WATER_Y + 0.6 ? 0x4a4838 : 0x7a6650); nc.set([_c.r, _c.g, _c.b], i * 3); }
      ng.setAttribute('color', new THREE.BufferAttribute(nc, 3));
      T(ng, x, (pileTop + pileBot) / 2, z, R() * TAU, (R() - 0.5) * 0.03, (R() - 0.5) * 0.03);
      B.put(M.wood, ng);
      const outer = Math.abs(Math.abs(x) - (PX - 0.3)) < 0.1 || z > PZ1 - 0.5;
      if (outer && R() < 0.6) for (let k = 0; k < 3; k++) B.put(M.vc, vc(T(new THREE.TorusGeometry(r + 0.02, 0.025, 5, 16), x, -0.75 - k * 0.06, z, 0, Math.PI / 2), 0x9c845a));
    }
    // X-bracing between the outer piles (river face + both sides)
    const brace = (a, b) => wood(beam(a, b, 0.1, 0.07), 0x5e4834);
    const yb0 = WATER_Y + 0.35, yb1 = pileTop - 0.15;
    for (let x = -PX + 0.3; x < PX - 2.4; x += 2.4) { const z = PZ1 + 0.06; brace(V3(x, yb0, z), V3(x + 2.4, yb1, z)); brace(V3(x, yb1, z), V3(x + 2.4, yb0, z)); }
    for (const sx of [-1, 1]) for (let z = PZ0 + 0.6; z < PZ1 - 2.4; z += 2.4) { const x = sx * (PX - 0.3 + 0.17); brace(V3(x, yb0, z), V3(x, yb1, z + 2.4)); brace(V3(x, yb1, z), V3(x, yb0, z + 2.4)); }
    // mooring posts on the river face (same spots as High), with rope coils and a rope swag between them
    const posts = [];
    for (let x = -PX + 1.2; x < PX; x += 4.6) posts.push(x);
    for (const x of posts) {
      const gg = new THREE.CylinderGeometry(0.15, 0.17, 1.4 - WATER_Y + 1, 12), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 2);
      wood(T(gg, x, (1.1 + WATER_Y - 1) / 2, PZ1 - 0.2), 0x6a5038);
      B.put(M.metal, vc(T(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), x, 1.12, PZ1 - 0.2), 0x2a2a2c));
      B.put(M.metal, vc(T(new THREE.SphereGeometry(0.1, 12, 6, 0, TAU, 0, Math.PI / 2), x, 1.14, PZ1 - 0.2), 0x2a2a2c));
      for (let k = 0; k < 4; k++) B.put(M.vc, vc(T(new THREE.TorusGeometry(0.19, 0.03, 6, 18), x, 0.55 + k * 0.055, PZ1 - 0.2, 0, Math.PI / 2), 0xb09a6c));
    }
    for (let i = 0; i < posts.length - 1; i++) B.put(M.vc, vc(tube(sagPts(V3(posts[i], 0.98, PZ1 - 0.2), V3(posts[i + 1], 0.98, PZ1 - 0.2), 0.32, 12), 0.022, 5, 24), 0xb09a6c));
    // old tyres hung as fenders along the river face and the far ends of both sides
    const tyre = new THREE.TorusGeometry(0.3, 0.11, 8, 18);
    for (let x = -PX + 3.5; x < PX - 1; x += 4.6) { B.put(M.vc, vc(T(tyre.clone(), x, -0.62, PZ1 + 0.2, 0, 0.1), 0x1a1a1c)); B.put(M.vc, vc(rod(V3(x, -0.35, PZ1 + 0.14), V3(x, -0.16, PZ1 + 0.05), 0.015), 0xb09a6c)); }
    for (const sx of [-1, 1]) for (let z = PZ1 - 3; z > PZ0 + 3; z -= 5.2) B.put(M.vc, vc(T(tyre.clone(), sx * (PX + 0.2), -0.62, z, Math.PI / 2, 0.1), 0x1a1a1c));
    // a low floating pontoon off the river face where the boats tie up, with a short ladder
    {
      const px0 = -3.2, px1 = 3.2, pz = PZ1 + 1.7, py = WATER_Y + 0.22;
      B.put(M.vc, vc(new THREE.BoxGeometry(px1 - px0, 0.32, 2.2).translate(0, py - 0.1, pz), 0x2c2c30));
      for (let x = px0 + 0.1; x < px1; x += 0.21) { const gg = new THREE.BoxGeometry(0.19, 0.04, 2.1), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, R() + uv.getX(i) * 0.12, uv.getY(i) * 1.3); wood(T(gg, x, py + 0.08, pz), teak[Math.floor(R() * 6)]); }
      for (const sx of [-0.5, 0.5]) wood(beam(V3(sx, py + 0.1, PZ1 + 0.65), V3(sx, DECK, PZ1 + 0.1), 0.06), 0x6a5038);
      for (let k = 1; k < 5; k++) { const t = k / 5; wood(T(new THREE.BoxGeometry(1.0, 0.04, 0.12), 0, py + 0.1 + (DECK - py - 0.1) * t, PZ1 + 0.65 - 0.55 * t), 0x7a5a40); }
    }
  }

  /* ---------------- 4. THE QUAY — iron lamp posts, a railing, food carts, rain trees, a spirit house ---------------- */
  const lampHomes = [], glowPts = [];     // moths; extra light points
  {
    const iron = 0x1c2622;
    // lamp posts exactly where High's stand (the festoons hang from them): plinth, fluted shaft, scroll arm, lantern
    for (const x of ctx.lampXs) {
      const z = QUAY_Z - 1.4;
      B.put(M.metal, vc(T(sqLathe([[0, 0], [0.22, 0], [0.22, 0.32], [0.17, 0.38], [0.15, 0.62], [0.11, 0.7], [0, 0.7]], 24, 6), x, QUAY_TOP, z), iron));
      const shaft = new THREE.CylinderGeometry(0.055, 0.075, 3.3, 12, 1, true), sp = shaft.attributes.position;
      for (let i = 0; i < sp.count; i++) { const a = Math.atan2(sp.getZ(i), sp.getX(i)), k = 1 + 0.12 * Math.max(0, Math.cos(a * 8)); sp.setX(i, sp.getX(i) * k); sp.setZ(i, sp.getZ(i) * k); }
      B.put(M.metal, vc(T(shaft, x, QUAY_TOP + 0.7 + 1.65, z), iron));
      for (const y of [1.0, 3.9]) B.put(M.metal, vc(T(new THREE.TorusGeometry(0.075, 0.022, 6, 14), x, QUAY_TOP + y, z, 0, Math.PI / 2), 0x6a5a30));
      B.put(M.metal, vc(T(lathe([[0.03, 0], [0.12, 0.05], [0.16, 0.12], [0.02, 0.18]], 12), x, 4.0, z), iron));
      B.put(M.metal, vc(T(lathe([[0, 0.34], [0.2, 0.3], [0.26, 0.24], [0.05, 0.2]], 16), x, 4.36, z), iron));
      B.put(M.metal, vc(T(new THREE.ConeGeometry(0.04, 0.2, 6), x, 4.82, z), iron));
      B.put(M.glow, vc(T(new THREE.SphereGeometry(0.19, 16, 12), x, 4.37, z), 0xffd6a0));
      lampHomes.push([x, 4.37, z, 0.55]);
    }
    // cast-iron railing along the quay edge (not across the pier's mouth)
    const RZ = NEAR_EDGE - 0.3;
    for (const sx of [-1, 1]) {
      const xs = []; for (let x = PX + 0.9; x <= 96; x += 2.2) xs.push(sx * x);
      const top = [];
      for (const x of xs) {
        const z = nearEdge(x) - 0.3;
        B.put(M.metal, vc(T(new THREE.BoxGeometry(0.07, 0.95, 0.07), x, QUAY_TOP + 0.475, z, -Math.atan(slope(x))), iron));
        B.put(M.metal, vc(T(new THREE.SphereGeometry(0.055, 8, 6), x, QUAY_TOP + 1.0, z), iron));
        top.push([x, z]);
      }
      for (let i = 0; i < top.length - 1; i++) {
        const [xa, za] = top[i], [xb, zb] = top[i + 1];
        for (const y of [0.92, 0.5, 0.12]) B.put(M.metal, vc(beam(V3(xa, QUAY_TOP + y, za), V3(xb, QUAY_TOP + y, zb), 0.035, 0.05), iron));
        for (let k = 1; k < 8; k++) { const t = k / 8, x = xa + (xb - xa) * t, z = za + (zb - za) * t; B.put(M.metal, vc(T(new THREE.BoxGeometry(0.018, 0.8, 0.018), x, QUAY_TOP + 0.52, z), iron)); }
      }
    }
    void RZ;
    // food carts under striped umbrellas at High's stall spots
    const stripe = [[0xc0392b, 0xf2efe6], [0x1f5fa8, 0xf2efe6], [0x2f7a4a, 0xf2efe6], [0xe2a400, 0xc0392b], [0x7a2a6a, 0xf2efe6]];
    for (const [x, z] of ctx.stalls) {
      const ry = (R() - 0.5) * 0.3;
      const P = (geo, col, mat = M.vc) => B.put(mat, vc(frame(geo, x, QUAY_TOP - 0.15, z, ry), col, 0.05, R));
      P(new THREE.BoxGeometry(1.8, 0.75, 0.9).translate(0, 0.62, 0), 0xd8d4cc, M.metal);
      P(new THREE.BoxGeometry(1.84, 0.04, 0.94).translate(0, 1.0, 0), 0xb8b4ac, M.metal);
      P(new THREE.BoxGeometry(1.3, 0.42, 0.55).translate(-0.15, 1.23, -0.05), 0x9ab8c0);                  // glass case
      for (const sx of [-0.75, 0.75]) P(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14).rotateX(Math.PI / 2).translate(sx, 0.2, 0.47), 0x222222);
      P(new THREE.CylinderGeometry(0.17, 0.15, 0.3, 14).translate(0.6, 1.17, 0.1), 0x9aa0a6, M.metal);   // the soup pot
      for (let k = 0; k < 5; k++) P(new THREE.SphereGeometry(0.09, 8, 6).translate(-0.6 + k * 0.22, 1.1, 0.33), [0xff8a2a, 0x7fbf3a, 0xe8d24a, 0xd8382e, 0xf2f2f2][k]);
      for (let k = 0; k < 3; k++) { const a = R() * TAU; P(new THREE.CylinderGeometry(0.16, 0.14, 0.45, 10).translate(Math.cos(a) * 1.4, 0.22, Math.sin(a) * 1.1 + 0.6), [0xc0392b, 0x1f5fa8, 0xe2a400][k]); }
      P(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6).translate(0, 1.4, 0), 0x8a8a8a, M.metal);
      // umbrella: 16 alternating panels, scalloped hem, ribs
      const [c0, c1] = stripe[Math.floor(R() * stripe.length)];
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * TAU, a1 = ((k + 1) / 16) * TAU, am = (a0 + a1) / 2;
        const pts = [V3(0, 2.75, 0), V3(Math.cos(a0) * 1.55, 2.2, Math.sin(a0) * 1.55), V3(Math.cos(a1) * 1.55, 2.2, Math.sin(a1) * 1.55), V3(Math.cos(am) * 1.45, 2.12, Math.sin(am) * 1.45)];
        const gg = new THREE.BufferGeometry().setFromPoints([pts[0], pts[2], pts[1], pts[1], pts[2], pts[3]]); gg.computeVertexNormals();
        B.put(M.vcDS, vc(frame(gg, x, QUAY_TOP - 0.15, z, ry), k % 2 ? c0 : c1));
      }
      B.put(M.glow, vc(frame(new THREE.SphereGeometry(0.07, 10, 8).translate(0, 2.05, 0), x, QUAY_TOP - 0.15, z, ry), 0xfff0c8));
      lampHomes.push([x, 2.0, z, 0.35]);
    }
    // a spirit house on its pillar beside the pier's mouth, garlands + candles
    {
      const x = -PX - 3.4, z = QUAY_Z - 4.2;
      const P = (geo, col, mat = M.vc) => B.put(mat, vc(T(geo, x, QUAY_TOP, z, 0.3), col));
      P(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 12).translate(0, 0.7, 0), 0xe8e0d0, M.wall);
      P(new THREE.BoxGeometry(0.9, 0.06, 0.9).translate(0, 1.43, 0), 0xc8a050, M.metal);
      P(new THREE.BoxGeometry(0.55, 0.5, 0.5).translate(0, 1.71, 0), 0xf0e6d2, M.wall);
      for (const [w, y] of [[0.8, 2.0], [0.6, 2.22]]) { const r = new THREE.ConeGeometry(w * 0.72, 0.32, 4, 1, true).rotateY(Math.PI / 4).translate(0, y + 0.1, 0); P(r, 0xb83a24); }
      P(new THREE.ConeGeometry(0.05, 0.5, 6).translate(0, 2.55, 0), 0xe0b050, M.metal);
      for (let k = 0; k < 5; k++) B.put(M.glow, vc(T(new THREE.SphereGeometry(0.025, 6, 5), x - 0.3 + k * 0.15, QUAY_TOP + 1.49, z + 0.38), 0xffc060));
      for (let k = 0; k < 7; k++) P(new THREE.TorusGeometry(0.07, 0.025, 5, 10).translate(-0.3 + k * 0.1, 1.38, 0.46), [0xffd23a, 0xff6a2a, 0xffffff][k % 3]);
    }
  }

  /* ---------------- 5. SHOPHOUSES — framed windows, shutters, balconies, signs, lit shops, awnings ---------------- */
  // builds one shophouse in local coords (facade at z = 0 facing +z, x across, y up from the street) into the batches
  function shophouse(W, floors, seed, { lod = 0, lit = 0.6, place: [px, py, pz, ry] }) {
    const r = rng(seed), G = 3.7, FH = 3.25, H = G + (floors - 1) * FH + 1.1, D = 10;
    const put = (mat, geo, col, jit = 0.04) => B.put(mat, vc(frame(geo, px, py, pz, ry), col, jit, r));
    const walls = [0xe8d3a6, 0xcfe0d6, 0xe8b8a6, 0xdccbe8, 0xf2e3c2, 0xbcd4e6, 0xe9c890, 0xc9d9b2, 0xf0f0e8, 0xd8b890];
    const wc = walls[Math.floor(r() * walls.length)], trim = 0xf4f0e6, wood = [0x3a5a48, 0x2f4a6a, 0x6a3a2a, 0x4a3828][Math.floor(r() * 4)];
    put(M.wall, new THREE.BoxGeometry(W, H, D).translate(0, H / 2, -D / 2), wc);
    const bays = Math.max(2, Math.round(W / 3.8)), bw = W / bays;
    // pilasters at both ends + cornice bands + parapet
    for (const sx of [-1, 1]) put(M.trim, new THREE.BoxGeometry(0.42, H, 0.2).translate(sx * (W / 2 - 0.21), H / 2, 0.1), trim);
    for (let f = 1; f < floors; f++) put(M.trim, new THREE.BoxGeometry(W + 0.1, 0.24, 0.32).translate(0, G + (f - 1) * FH - 0.12, 0.16), trim);
    put(M.trim, new THREE.BoxGeometry(W + 0.2, 0.3, 0.42).translate(0, H - 1.1, 0.21), trim);
    put(M.wall, new THREE.BoxGeometry(W, 0.9, 0.25).translate(0, H - 0.5, 0.05), wc);
    put(M.trim, new THREE.BoxGeometry(W + 0.12, 0.12, 0.34).translate(0, H - 0.02, 0.06), trim);
    if (r() < 0.45) {                                                  // a Sino-Portuguese gable over the middle
      const s = new THREE.Shape(); const gw = Math.min(W * 0.5, 4.5); s.moveTo(-gw / 2, 0); s.quadraticCurveTo(-gw / 4, 0.4, 0, 1.25); s.quadraticCurveTo(gw / 4, 0.4, gw / 2, 0); s.lineTo(-gw / 2, 0);
      put(M.trim, new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 6 }).translate(0, H, -0.02), trim);
    }
    // roof: a water tank or two, a pitched tile roof on some
    if (r() < 0.35) B.put(M.roof, vc(frame(new THREE.CylinderGeometry(D / 2 - 0.3, D / 2 - 0.3, W - 0.4, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).scale(1, 0.45, 1).translate(0, H + 0.4, -D / 2), px, py, pz, ry), 0x8a5a44));
    else if (r() < 0.6) put(M.metal, new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12).translate((r() - 0.5) * W * 0.5, H + 0.65, -D * 0.6), [0x3a6aa8, 0xd8d8d0, 0x2f8a5a][Math.floor(r() * 3)]);
    // ground floor: open shops (lit), half-raised roller shutters, awnings, a sign band
    for (let b = 0; b < bays; b++) {
      const cx = -W / 2 + bw * (b + 0.5), open = r() < lit + 0.2;
      put(M.panes, atlasPlane(bw - 0.55, 2.75, ATLAS.shop(open ? Math.floor(r() * 7) : 7)).translate(cx, 1.42, 0.02), null);
      put(M.metal, new THREE.BoxGeometry(bw - 0.5, open ? 0.55 : 0.1, 0.12).translate(cx, open ? 2.55 : 2.82, 0.06), 0x6a6e74);
      if (b > 0) put(M.trim, new THREE.BoxGeometry(0.3, G, 0.16).translate(-W / 2 + bw * b, G / 2, 0.08), trim);
      if (lod === 0 && r() < 0.8) {
        const aw = new THREE.BoxGeometry(bw - 0.3, 0.05, 1.5).translate(0, 0, 0.75); aw.rotateX(0.32);
        put(M.vcDS, aw.translate(cx, 3.12, 0.05), [0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400, 0x8a2a6a, 0xd8d8d0][Math.floor(r() * 6)]);
        if (r() < 0.4) for (const sx of [-0.7, 0.7]) {              // a pair of red paper lanterns hung under the awning
          put(M.glow, new THREE.SphereGeometry(0.17, 12, 8).scale(1, 1.25, 1).translate(cx + sx, 2.62, 1.05), 0xff3a1e, 0);
          put(M.metal, new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8).translate(cx + sx, 2.86, 1.05), 0x2a1a10);
        }
      }
    }
    if (r() < 0.7) {                                                  // a sign board over the shops: a dark board with a row of glowing glyphs
      const k = Math.floor(r() * 16), n = Math.max(3, Math.floor((W - 2) / 0.62));
      put(M.vc, new THREE.BoxGeometry(n * 0.62 + 0.5, 0.72, 0.08).translate(0, 3.48, 0.05), [0x5a1010, 0x101a38, 0x0e2a16, 0x2a2a2a][k % 4]);
      for (let i = 0; i < n; i++) put(M.panes, atlasPlane(0.5, 0.5, [k / 16 + 6 / 1024, 1 - (850 + ((i % 5) + 1) * 34) / 1024, 52 / 1024, 34 / 1024]).translate(-(n - 1) * 0.31 + i * 0.62, 3.48, 0.1), null);
    }
    // upper floors: framed windows with open shutters, some balconies, AC units, plants
    for (let f = 1; f < floors; f++) {
      const y0 = G + (f - 1) * FH;
      const balc = lod === 0 ? r() < 0.4 : lod === 1 ? r() < 0.3 : r() < 0.15;
      for (let b = 0; b < bays; b++) {
        const cx = -W / 2 + bw * (b + 0.5), on = r() < lit, door = balc;
        const ww = Math.min(1.5, bw * 0.42), wh = door ? 2.35 : 1.7, wy = door ? y0 + 1.25 : y0 + 1.6;
        put(M.panes, atlasPlane(ww, wh, ATLAS.win(on ? Math.floor(r() * 22) : 22 + Math.floor(r() * 10))).translate(cx, wy, 0.015), null);
        // frame, sill, hood
        if (lod < 2) {
          put(M.vc, new THREE.BoxGeometry(ww + 0.16, 0.08, 0.1).translate(cx, wy + wh / 2 + 0.04, 0.05), trim);
          put(M.vc, new THREE.BoxGeometry(ww + 0.16, 0.08, 0.1).translate(cx, wy - wh / 2 - 0.04, 0.05), trim);
          for (const sx of [-1, 1]) put(M.vc, new THREE.BoxGeometry(0.08, wh, 0.1).translate(cx + sx * (ww / 2 + 0.04), wy, 0.05), trim);
        }
        put(M.trim, new THREE.BoxGeometry(ww + 0.5, 0.14, 0.3).translate(cx, wy + wh / 2 + 0.2, 0.15), trim);
        if (!door) put(M.trim, new THREE.BoxGeometry(ww + 0.3, 0.07, 0.24).translate(cx, wy - wh / 2 - 0.1, 0.12), trim);
        if (lod === 0 || (lod === 1 && r() < 0.5)) for (const sx of [-1, 1]) {      // shutters swung open against the wall
          const sh = new THREE.BoxGeometry(ww / 2, wh, 0.04); sh.translate(sx * ww / 4, 0, 0); sh.rotateY(sx * -1.35); sh.translate(cx + sx * (ww / 2 + 0.08), wy, 0.06);
          put(M.vc, sh, wood, 0.08);
          if (lod === 0) for (let k = 0; k < 5; k++) { const sl = new THREE.BoxGeometry(ww / 2 - 0.06, 0.025, 0.05); sl.translate(sx * ww / 4, -wh / 2 + 0.25 + k * (wh - 0.5) / 4, 0.02); sl.rotateY(sx * -1.35); sl.translate(cx + sx * (ww / 2 + 0.08), wy, 0.06); put(M.vc, sl, 0x000000 + wood, 0.15); }
        }
        if (lod < 2 && !balc && r() < 0.22) put(M.metal, new THREE.BoxGeometry(0.8, 0.55, 0.32).translate(cx + (r() < 0.5 ? -1 : 1) * (ww / 2 + 0.75), y0 + 0.75, 0.17), 0xd8d8d2);
        if (lod < 2 && !balc && r() < 0.3) for (let k = 0; k < 3; k++) put(M.vc, new THREE.IcosahedronGeometry(0.16 + r() * 0.08, lod ? 0 : 1).translate(cx - 0.35 + k * 0.35, wy - wh / 2 + 0.05, 0.18), [0x3f7a3a, 0x2f6a34, 0x5a8a3a][k], 0.1);
      }
      if (balc) {                                                     // a balcony across the whole front
        put(M.trim, new THREE.BoxGeometry(W - 0.5, 0.14, 1.05).translate(0, y0 + 0.05, 0.52), trim);
        put(M.metal, new THREE.BoxGeometry(W - 0.5, 0.06, 0.06).translate(0, y0 + 1.08, 1.02), 0x2a2e2c);
        for (const sx of [-1, 1]) put(M.metal, new THREE.BoxGeometry(0.06, 0.06, 1.0).translate(sx * (W / 2 - 0.28), y0 + 1.08, 0.52), 0x2a2e2c);
        if (lod === 0) { const n = Math.floor((W - 0.6) / 0.16); for (let k = 0; k <= n; k++) put(M.metal, new THREE.BoxGeometry(0.025, 0.95, 0.025).translate(-W / 2 + 0.3 + k * ((W - 0.6) / n), y0 + 0.6, 1.02), 0x2a2e2c); }
        else put(M.metal, new THREE.BoxGeometry(W - 0.5, 0.95, 0.02).translate(0, y0 + 0.6, 1.02), 0x2a2e2c);
        if (lod < 2) for (let k = 0; k < Math.floor(W / 1.6); k++) if (r() < 0.6) put(M.vc, new THREE.IcosahedronGeometry(0.22 + r() * 0.12, lod ? 0 : 1).translate(-W / 2 + 0.8 + k * 1.6, y0 + 0.45, 0.75), [0x3f7a3a, 0x2f6a34, 0x6a9a3a, 0xc83a6a][Math.floor(r() * 4)], 0.1);
        if (lod === 0 && r() < 0.5) { const ly = y0 + 2.2; put(M.vc, tube(sagPts(V3(-W / 2 + 0.4, ly, 0.9), V3(W / 2 - 0.4, ly, 0.9), 0.15, 8), 0.008, 3, 12), 0x888888); for (let k = 0; k < 5; k++) put(M.vcDS, new THREE.PlaneGeometry(0.35 + r() * 0.3, 0.5 + r() * 0.3).translate(-W / 2 + 0.9 + k * (W - 1.8) / 5, ly - 0.35, 0.9), [0xd84a3a, 0xf2f2f2, 0x3a6ad8, 0xe8b82a, 0x2f9a5a][Math.floor(r() * 5)]); }
      }
    }
    // a vertical blade sign sticking out from the facade
    if (r() < 0.55) {
      const sy = G + 0.4 + r() * Math.max(0.5, (floors - 1) * FH - 2.6), sx = (r() < 0.5 ? -1 : 1) * (W / 2 - 0.4);
      put(M.panes, atlasPlane(0.55, 1.65, ATLAS.sign(Math.floor(r() * 16))).rotateY(Math.PI / 2).translate(sx, sy + 0.82, 0.55), null);
      put(M.metal, new THREE.BoxGeometry(0.04, 1.75, 0.62).translate(sx - 0.03, sy + 0.82, 0.55), 0x1a1a1a);
    }
    return H;
  }
  // a row of shophouses standing back from a bank edge, facing the water; returns the roof-line boxes
  function shopRow(x0, x1, edge, setback, sgn, y, seed, { minF = 2, maxF = 4, lod = 0, lit = (x) => 0.6, skip = () => false }) {
    const r = rng(seed);
    let x = x0;
    while (x < x1) {
      const W = 7.4 + Math.floor(r() * 3) * 2.2, floors = minF + Math.floor(r() * (maxF - minF + 1));
      const s = slope(x + W / 2), N = Math.hypot(1, s), xc = x + (W / 2) / N;
      if (!skip(xc)) {
        const zc = edge(xc) - sgn * setback * N;
        const ry = sgn > 0 ? Math.atan2(-s, 1) : Math.atan2(s, -1);
        shophouse(W, floors, seed * 977 + Math.floor(x * 10), { lod, lit: lit(xc), place: [xc, y, zc, ry] });
      }
      x += (W + 0.12) / N;
    }
  }
  // near quay: the street the pier opens onto (same footprint as High: facades at z = -25); a taller row behind it
  shopRow(-92, 92, nearEdge, 12.6, 1, QUAY_TOP, 11, { minF: 2, maxF: 4, lit: (x) => (Math.abs(x) > 58 ? 0.25 : 0.62) });
  shopRow(-120, 120, nearEdge, 30, 1, QUAY_TOP, 13, { minF: 4, maxF: 7, lod: 2, lit: (x) => (Math.abs(x) > 50 ? 0.12 : 0.5) });
  // far bank: a long row along the curving embankment, a second, taller one behind (gaps for the temples + the wat)
  const farSkip = (x) => (x > 92 && x < 150) || (x < -95 && x > -152) || (x > -24 && x < 26);
  shopRow(-300, 300, farEdge, 7, -1, FAR_TOP, 23, { minF: 2, maxF: 5, lod: 1, skip: farSkip, lit: () => 0.58 });
  shopRow(-260, 260, farEdge, 27, -1, FAR_TOP, 29, { minF: 4, maxF: 8, lod: 2, skip: (x) => farSkip(x) || Math.abs(x) < 40, lit: () => 0.42 });

  /* ---------------- 6. TEMPLES — a floodlit prang off the +x end, a golden chedi off the −x end, a wat straight across ---------------- */
  const halos = [];
  {
    // PRANG (Wat Arun style): stepped square terraces, a tall corn-cob tower ringed with tiers, a gilded trident
    const prang = (s) => {
      const white = [], gold = [];
      white.push(sqLathe([[0, 0], [15, 0], [15, 1.6], [13.6, 1.6], [13.6, 2.2], [12.4, 2.2], [12.4, 5.4], [11.2, 5.4], [11.2, 6], [10, 6], [10, 9], [8.8, 9], [8.8, 9.6], [7.6, 9.6], [7.6, 11.6], [0, 11.6]], s > 0.6 ? 40 : 24, 14, 0).scale(s, s, s));
      const prof = [[7.2, 11.6]];
      for (let k = 0; k < 22; k++) {
        const t = k / 22, y = 11.6 + t * 30, rr = 6.6 * Math.pow(1 - t, 0.62) * (1 + 0.12 * Math.sin(t * Math.PI)) + 0.6;
        prof.push([rr + 0.5, y], [rr + 0.5, y + 0.45], [rr + 0.12, y + 0.62], [rr, y + 1.36]);
      }
      prof.push([0.55, 42.4], [0, 42.6]);
      const tw = sqLathe(prof.map(([r, y]) => [r * s, y * s]), s > 0.6 ? 48 : 24, 3.2), tp = tw.attributes.position, tc = new Float32Array(tp.count * 3);
      for (let i = 0; i < tp.count; i++) {                             // porcelain bands: pale on each ledge, warmer + darker in the recesses
        const y = tp.getY(i) / s, r = Math.hypot(tp.getX(i), tp.getZ(i)) / s, f = ((y - 11.6) % 1.36 + 1.36) % 1.36;
        _c.set(f < 0.62 ? 0xf4ece0 : (Math.floor((y - 11.6) / 1.36) % 3 === 0 ? 0xb89a7a : 0xcab49a)).offsetHSL(0, 0, 0.04 * Math.sin(Math.atan2(tp.getZ(i), tp.getX(i)) * 24) * Math.min(1, r));
        tc.set([_c.r, _c.g, _c.b], i * 3);
      }
      tw.setAttribute('color', new THREE.BufferAttribute(tc, 3));
      white.push(tw);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; white.push(lathe([[0, 0], [1.1, 0], [1.1, 2.4], [0.8, 2.6], [0.9, 3.6], [0.4, 4.4], [0, 4.6]], 16).scale(s, s, s).translate(Math.cos(a) * 9.4 * s, 9.6 * s, Math.sin(a) * 9.4 * s)); }   // small spires on the top terrace
      gold.push(lathe([[0.5, 0], [0.42, 1.4], [0.25, 1.6], [0.2, 4.4], [0.32, 4.7], [0.1, 5], [0.06, 7.5], [0, 7.8]], 16).scale(s, s, s).translate(0, 42.4 * s, 0));
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; gold.push(new THREE.BoxGeometry(0.16, 2.2, 0.16).scale(s, s, s).translate(Math.cos(a) * 0.4 * s, 47.5 * s, Math.sin(a) * 0.4 * s)); }
      return { white, gold };
    };
    const site = (fn, x, z, s, ry = 0) => { const p = fn(s); for (const g of p.white) B.put(M.white, vc(frame(g, x, FAR_TOP, z, ry), g.attributes.color ? null : 0xffffff)); for (const g of p.gold) B.put(M.gold, vc(frame(g, x, FAR_TOP, z, ry), 0xffffff)); };
    const PX1 = 121, PZ1_ = farEdge(121) + 24;
    site(prang, PX1, PZ1_, 1.0);
    for (const [dx, dz] of [[-26, -14], [26, -14], [-26, 16], [26, 16]]) site(prang, PX1 + dx, PZ1_ + dz, 0.4);   // four satellite prangs
    halos.push([PX1, FAR_TOP + 26, PZ1_, 80, 0.1]);
    // GOLDEN CHEDI on a hill (Golden Mount style): a forested mound with a lit path, a gilded bell on a white terrace
    const CX = -124, CZ = farEdge(-124) + 30;
    {
      const hill = new THREE.SphereGeometry(1, 48, 16, 0, TAU, 0, Math.PI / 2); const hp = hill.attributes.position;
      for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), a = Math.atan2(z, x); const k = 1 + 0.05 * Math.sin(a * 5) + 0.04 * Math.sin(a * 9 + y * 5); hp.setXYZ(i, x * k, Math.pow(y, 0.9), z * k); }
      hill.scale(24, 15, 24); B.put(M.vc, vc(hill.translate(CX, FAR_TOP - 0.5, CZ), 0x1f3020));
      const top = FAR_TOP + 14.2;
      B.put(M.white, vc(sqLathe([[0, 0], [9, 0], [9, 2], [7.8, 2], [7.8, 3.2], [6.8, 3.2], [6.8, 4.2], [0, 4.2]], 40, 14, 0).translate(CX, top, CZ), 0xffffff));
      const bell = [[5.2, 4.2], [5.4, 4.6], [5.2, 5], [5.5, 5.4], [5.8, 6.5], [5.9, 8], [5.6, 9.6], [4.9, 11.2], [3.8, 12.6], [2.6, 13.6], [1.9, 14.2], [0, 14.2]];
      B.put(M.gold, vc(lathe(bell, 64).translate(CX, top, CZ), 0xffffff));
      B.put(M.gold, vc(sqLathe([[1.9, 14.2], [1.9, 15.4], [2.1, 15.5], [2.1, 15.8], [0, 15.8]], 24, 12, 0).translate(CX, top, CZ), 0xffffff));
      const ring = [[1.4, 15.8]]; let y = 15.9, r = 1.35;
      for (let k = 0; k < 10; k++) { ring.push([r + 0.12, y], [r + 0.12, y + 0.22], [r - 0.04, y + 0.32]); y += 0.58; r *= 0.86; }
      ring.push([0.2, y], [0.12, y + 3], [0.22, y + 3.3], [0.03, y + 5], [0, y + 5.3]);
      B.put(M.gold, vc(lathe(ring, 48).translate(CX, top, CZ), 0xffffff));
      halos.push([CX, top + 10, CZ, 60, 0.1]);
      // the lamp-lit path spiralling up the hill
      for (let k = 0; k < 60; k++) { const t = k / 60, a = t * TAU * 1.6 + 1, rr = 23 - t * 15; glowPts.push([CX + Math.cos(a) * rr, FAR_TOP + 0.4 + t * 13.5 + 0.6, CZ + Math.sin(a) * rr, 0.55, 1.0, 0.72, 0.4]); }
    }
    // RIVERSIDE WAT straight across from the pier: an ordination hall with tiered roofs, two white chedis, a ghat down to the water
    {
      const wx = 2, wz = FAR_EDGE + 18;
      const L = 20, Wd = 11;
      B.put(M.watWhite, vc(new THREE.BoxGeometry(Wd + 2.4, 1.2, L + 2.4).translate(wx, FAR_TOP + 0.6, wz), 0xffffff));
      B.put(M.watWhite, vc(new THREE.BoxGeometry(Wd, 5.6, L).translate(wx, FAR_TOP + 1.2 + 2.8, wz), 0xffffff));
      for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) {
        B.put(M.panes, vc(atlasPlane(1.1, 2.4, ATLAS.win(k % 2 ? 2 : 6)).rotateY(sx * Math.PI / 2).translate(wx + sx * (Wd / 2 + 0.02), FAR_TOP + 4, wz - L / 2 + 2.5 + k * 3.75), null));
        B.put(M.watWhite, vc(new THREE.CylinderGeometry(0.42, 0.45, 5.4, 14).translate(wx + sx * (Wd / 2 + 0.9), FAR_TOP + 1.2 + 2.7, wz - L / 2 + 0.6 + k * 4.7), 0xffffff));
      }
      B.put(M.vc, vc(new THREE.BoxGeometry(3.2, 4.6, 0.2).translate(wx, FAR_TOP + 3.5, wz - L / 2 - 0.05), 0x5a2210));   // gilded door + frame facing the river
      // three tiers of roof (orange, green border), gilded bargeboards + chofa
      let eY = FAR_TOP + 7, half = Wd / 2 + 1.6, ridge = FAR_TOP + 12.5, zl = L / 2 + 1.2;
      for (let t = 0; t < 3; t++) {
        for (const sx of [-1, 1]) {
          const q = new THREE.BufferGeometry(), a = [wx + sx * half, eY, wz - zl], b = [wx + sx * half, eY, wz + zl], c = [wx, ridge, wz + zl - t * 1.6], d = [wx, ridge, wz - zl + t * 1.6];
          q.setAttribute('position', new THREE.Float32BufferAttribute(sx > 0 ? [...a, ...d, ...b, ...b, ...d, ...c] : [...a, ...b, ...d, ...d, ...b, ...c], 3));
          q.setAttribute('uv', new THREE.Float32BufferAttribute(sx > 0 ? [0, 0, 0, 3, 4, 0, 4, 0, 0, 3, 4, 3] : [0, 0, 4, 0, 0, 3, 0, 3, 4, 0, 4, 3], 2));
          q.computeVertexNormals(); B.put(M.roof, vc(q, t === 2 ? 0xd8642a : 0x3a8a5a));
        }
        for (const sz of [-1, 1]) {
          const z = wz + sz * (zl - t * 1.6);
          B.put(M.gold, vc(beam(V3(wx - half, eY, z), V3(wx, ridge + 0.1, z), 0.25, 0.3), 0xffffff));
          B.put(M.gold, vc(beam(V3(wx + half, eY, z), V3(wx, ridge + 0.1, z), 0.25, 0.3), 0xffffff));
          B.put(M.gold, vc(tube([V3(wx, ridge, z), V3(wx, ridge + 0.8, z - sz * 0.2), V3(wx, ridge + 1.4, z + sz * 0.15), V3(wx, ridge + 1.3, z + sz * 0.5)], 0.11, 6, 12), 0xffffff));
          const ped = new THREE.BufferGeometry(); ped.setAttribute('position', new THREE.Float32BufferAttribute(sz < 0 ? [wx + half - 0.3, eY + 0.1, z - 0.02, wx - half + 0.3, eY + 0.1, z - 0.02, wx, ridge - 0.2, z - 0.02] : [wx - half + 0.3, eY + 0.1, z + 0.02, wx + half - 0.3, eY + 0.1, z + 0.02, wx, ridge - 0.2, z + 0.02], 3)); ped.computeVertexNormals();
          B.put(M.vc, vc(ped, 0x6a3a1c));
        }
        eY += 1.2; half -= 1.5; ridge += 1.1; zl -= 2.4;
      }
      for (const sx of [-1, 1]) {
        const cx = wx + sx * 16, cz = wz + 2;
        B.put(M.watWhite, vc(sqLathe([[0, 0], [3.2, 0], [3.2, 1], [2.8, 1], [2.8, 1.8], [2.4, 1.8], [2.4, 2.4], [0, 2.4]], 32, 14, 0).translate(cx, FAR_TOP, cz), 0xffffff));
        B.put(M.watWhite, vc(lathe([[2.1, 2.4], [2.2, 3], [2.1, 4.2], [1.7, 5.4], [1.1, 6.2], [0.7, 6.6], [0, 6.6]], 40).translate(cx, FAR_TOP, cz), 0xffffff));
        const ring = [[0.6, 6.6]]; let y = 6.7, r = 0.6;
        for (let k = 0; k < 9; k++) { ring.push([r + 0.06, y], [r + 0.06, y + 0.12], [r - 0.02, y + 0.17]); y += 0.32; r *= 0.85; }
        ring.push([0.1, y], [0.04, y + 2.2], [0, y + 2.4]);
        B.put(M.gold, vc(lathe(ring, 28).translate(cx, FAR_TOP, cz), 0xffffff));
      }
      // ghat: steps from the wat down into the river, lamps on the landing
      for (let k = 0; k < 6; k++) B.put(M.watWhite, vc(new THREE.BoxGeometry(16, 0.36, 0.7).translate(wx, FAR_TOP - 0.18 - k * 0.36, FAR_EDGE - 0.35 - k * 0.7), 0xd8d0c0));
      for (const sx of [-1, 1]) { B.put(M.metal, vc(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8).translate(wx + sx * 8.6, FAR_TOP + 1.3, FAR_EDGE + 0.4), 0x2a2a2a)); B.put(M.glow, vc(new THREE.SphereGeometry(0.2, 12, 8).translate(wx + sx * 8.6, FAR_TOP + 2.7, FAR_EDGE + 0.4), 0xffd090)); }
      halos.push([wx, FAR_TOP + 8, wz, 44, 0.05]);
    }
  }

  /* ---------------- 7. BRIDGES — a cable-stayed bridge up-river (+x), an arched one down-river (−x) ---------------- */
  const cableSegs = [];
  {
    const bridgeAt = (bx) => {
      const c = V3(bx, 0, centre(bx)), s = slope(bx), t = V3(1, 0, s).normalize(), n = V3(-t.z, 0, t.x);
      if (n.z < 0) n.negate();                                          // n points from the near bank to the far bank
      return { c, t, n, at: (u, y = 0) => c.clone().addScaledVector(n, u).setY(y) };
    };
    const deckY = WATER_Y + 12;
    const deck = (br, u0, u1, w, col = 0x8a8a8a) => {
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const ua = u0 + ((u1 - u0) * i) / steps, ub = u0 + ((u1 - u0) * (i + 1)) / steps;
        const ya = deckY - Math.max(0, Math.abs(ua) - 40) * 0.22, yb = deckY - Math.max(0, Math.abs(ub) - 40) * 0.22;
        const a = br.at(ua, ya), b = br.at(ub, yb);
        B.put(M.steel, vc(beam(a.clone().setY(ya - 0.9), b.clone().setY(yb - 0.9), w, 1.2).applyMatrix4(new THREE.Matrix4()), col));
        for (const sd of [-1, 1]) {
          const oa = a.clone().addScaledVector(br.t, sd * w / 2), ob = b.clone().addScaledVector(br.t, sd * w / 2);
          B.put(M.steel, vc(beam(oa.clone().setY(ya - 0.2), ob.clone().setY(yb - 0.2), 0.25, 0.9), 0xb0b4b8));
        }
      }
      for (let u = u0 + 2; u < u1; u += 9) for (const sd of [-1, 1]) {   // deck lamps
        const y = deckY - Math.max(0, Math.abs(u) - 40) * 0.22, p = br.at(u, y).addScaledVector(br.t, sd * (w / 2 - 0.3));
        if (y > FAR_TOP + 1.5 && offAxis(p.x, p.z, 16)) glowPts.push([p.x, y + 4.2, p.z, 1.0, 1.0, 0.86, 0.6]);
      }
    };
    // A: cable-stayed (Rama VIII style): one inverted-Y pylon near the far bank, a fan of lit stays
    {
      const br = bridgeAt(236), W = 16;
      deck(br, -78, 82, W);
      const pu = 20, pb = br.at(pu, WATER_Y - 1), top = br.at(pu, deckY + 50);
      for (const sd of [-1, 1]) {
        const foot = pb.clone().addScaledVector(br.t, sd * (W / 2 + 1.2));
        B.put(M.steel, vc(beam(foot, top.clone().setY(deckY + 26), 1.6, 1.8), 0xd8d8d0));
      }
      B.put(M.steel, vc(beam(top.clone().setY(deckY + 26), top, 1.4, 1.8), 0xd8d8d0));
      B.put(M.steel, vc(new THREE.BoxGeometry(W + 4, 1.2, 2.4).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(-br.t.z, br.t.x))).translate(pb.x, deckY - 2.2, pb.z), 0xc8c8c0));
      for (let k = 0; k < 14; k++) {
        const u1 = pu - 6 - k * 6.4, u2 = pu + 5 + k * 3.6, ya = top.y - 1 - k * 1.6;
        const a = top.clone().setY(ya);
        cableSegs.push([a, br.at(u1, deckY - Math.max(0, Math.abs(u1) - 40) * 0.22 + 0.3)]);
        if (k < 9) cableSegs.push([a, br.at(u2, deckY - Math.max(0, Math.abs(u2) - 40) * 0.22 + 0.3)]);
      }
      for (const u of [-30, -6]) { const p = br.at(u, 0); B.put(M.steel, vc(new THREE.CylinderGeometry(1.4, 1.6, deckY - WATER_Y + 1, 16).translate(p.x, (deckY + WATER_Y) / 2 - 1, p.z), 0xb8b8b0)); }
      for (let k = 0; k < 6; k++) { const p = top.clone().setY(top.y - k * 8); glowPts.push([p.x, p.y, p.z, 1.6, 1.0, 0.8, 0.45]); }
      glowPts.push([top.x, top.y + 1.2, top.z, 2.2, 1.0, 0.2, 0.15, 1]);     // a red aircraft light
    }
    // B: tied-arch bridge (three steel arches with hangers, lit along the arches)
    {
      const br = bridgeAt(-236), W = 14;
      deck(br, -80, 80, W, 0x7a7a80);
      for (const [u0, u1] of [[-40, -13], [-13, 13], [13, 40]]) {
        for (const sd of [-1, 1]) {
          const pts = [];
          for (let k = 0; k <= 16; k++) { const t = k / 16, u = u0 + (u1 - u0) * t, p = br.at(u, deckY + 0.2 + Math.sin(Math.PI * t) * (u1 - u0) * 0.38).addScaledVector(br.t, sd * (W / 2 - 0.5)); pts.push(p); }
          B.put(M.steel, vc(tube(pts, 0.45, 8, 48), 0x9aa6b4));
          for (let k = 1; k < 16; k++) { const p = pts[k]; B.put(M.steel, vc(beam(p.clone().setY(deckY), p, 0.12), 0x9aa6b4)); if (k % 2 === 0) glowPts.push([p.x, p.y + 0.5, p.z, 0.9, 0.75, 0.85, 1.0]); }
        }
        const p = br.at((u0 + u1) / 2, 0);
        void p;
      }
      for (const u of [-40, -13, 13, 40]) { const p = br.at(u, 0); B.put(M.steel, vc(new THREE.BoxGeometry(5, deckY - WATER_Y + 1, 5).translate(p.x, (deckY + WATER_Y) / 2 - 1, p.z), 0x8a8a84)); }
    }
  }
  if (cableSegs.length) {
    const pts = []; for (const [a, b] of cableSegs) pts.push(a, b);
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(0.7), transparent: true, opacity: 0.5 }));
    lines.layers.enable(REFL_LAYER); root.add(lines);
  }

  /* ---------------- 8. THE CITY — towers behind both banks (kept off the cameras' axis) + its glow on the horizon ---------------- */
  {
    const [map, glow] = towerTextures();
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.4, metalness: 0.35, vertexColors: true });
    const geos = [];
    const tint = [0xc8ccd2, 0xb0b8c4, 0xd8d0c4, 0x9aa8b8, 0xc4c0b8, 0xaab4be];
    const tower = (x, z, w, d, h, ry, k, far = z > 0) => {
      const base = (far ? FAR_TOP : QUAY_TOP) - 0.5;
      const b = new THREE.BoxGeometry(w, h, d), uv = b.attributes.uv, nr = b.attributes.normal;
      const ou = Math.floor(R() * 8) / 8, ov = Math.floor(R() * 8) / 8;
      for (let i = 0; i < uv.count; i++) { const horiz = Math.abs(nr.getX(i)) > 0.5 ? d : w; uv.setXY(i, ou + uv.getX(i) * horiz / 16, ov + uv.getY(i) * h / 27); if (Math.abs(nr.getY(i)) > 0.5) uv.setXY(i, 0.005, 0.005); }
      geos.push(vc(T(b, x, base + h / 2, z, ry), tint[k % tint.length], 0.05, R));
      if (R() < 0.5) glowPts.push([x, base + h + 1.5, z, 1.6, 1.0, 0.18, 0.12, 1]);     // red aircraft light (blinks)
      if (R() < 0.25) { const cw = w * 0.8; geos.push(vc(T(new THREE.BoxGeometry(cw, 3.5, d * 0.8), x, base + h + 1.75, z, ry), 0x6a7078)); }
    };
    let n = 0;
    for (let i = 0; i < 260 && n < 92; i++) {
      const side = i % 2 ? 1 : -1, x = (R() - 0.5) * 680, z = side > 0 ? farEdge(x) + 70 + R() * 180 : nearEdge(x) - 60 - R() * 200;
      if (Math.hypot(x, z) > 360 || !offAxis(x, z, 20)) continue;
      if (side > 0 && (Math.abs(x - 121) < 50 || Math.abs(x + 124) < 45)) continue;      // keep the temples clear
      const h = 28 + Math.pow(R(), 1.8) * 110, w = 14 + R() * 16, d = 14 + R() * 14;
      tower(x, z, w, d, h, R() * 0.4 - 0.2, n++, side > 0);
    }
    // two signature glass towers straight across the river (ICONSIAM style), seen from the quay
    for (const [x, h] of [[-46, 150], [-20, 118]]) {
      tower(x, farEdge(x) + 140, 26, 22, h, 0.1, 1);
      const p = V3(x, FAR_TOP + h + 1, farEdge(x) + 140);
      for (let k = 0; k < 18; k++) glowPts.push([p.x - 13 + (k % 9) * 3.2, p.y - 0.5 - Math.floor(k / 9) * 2.2, p.z - 11.5, 1.0, 0.75, 0.9, 1.0]);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat); mesh.layers.enable(REFL_LAYER);
    root.add(mesh);
    // city glow: a soft warm band behind both banks, fading out toward the river's axis (where the ball flies)
    const band = new THREE.CylinderGeometry(355, 355, 70, 128, 1, true);
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){ float h = clamp((vP.y + 35.0) / 70.0, 0.0, 1.0); float az = abs(atan(vP.z, abs(vP.x)));
          float k = smoothstep(0.42, 0.9, az) * (vP.z > 0.0 ? 1.0 : 0.8);
          float a = pow(1.0 - h, 2.6) * smoothstep(0.0, 0.12, h) * k;
          gl_FragColor = vec4(vec3(1.0, 0.56, 0.32) * a * 0.32, 1.0); }` });
    const bandM = new THREE.Mesh(band, bm); bandM.position.y = 30; bandM.renderOrder = -1; bandM.frustumCulled = false;
    root.add(bandM);
  }

  /* ---------------- 9. TREES — rain trees + palms on both banks, a dark wooded bank where the river bends away ---------------- */
  {
    const canopy = new THREE.IcosahedronGeometry(1, 2);
    const pp = canopy.attributes.position, nrm = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) {
      nrm.set(pp.getX(i), pp.getY(i), pp.getZ(i)).normalize();
      const k = 1 + 0.17 * Math.sin(nrm.x * 7.1 + nrm.z * 3.3) * Math.cos(nrm.y * 6.3 + nrm.x * 2.1) + 0.08 * Math.sin(nrm.z * 13.7 + nrm.y * 9.1);
      pp.setXYZ(i, nrm.x * k, Math.max(nrm.y, -0.3) * k, nrm.z * k);
    }
    canopy.computeVertexNormals(); canopy.scale(1, 0.55, 1);
    const trunk = vc(new THREE.CylinderGeometry(0.05, 0.09, 1, 8).translate(0, 0.5, 0));
    const spots = [];   // [x, y, z, radius, height]
    for (const x of ctx.treeSpots) spots.push([x, QUAY_TOP + 0.4, nearEdge(x) - 10.8, 2.3, 4.6]);
    // the near bank past the shophouses: a dense dark park (what you see straight down the river)
    for (let i = 0; i < 150; i++) {
      const sx = i % 2 ? 1 : -1, x = sx * (98 + R() * 250), z = nearEdge(x) - 3 - R() * 38;
      if (Math.hypot(x, z) > 350) continue;
      spots.push([x, QUAY_TOP, z, 4 + R() * 3.5, 6 + R() * 6]);
    }
    // far bank: trees along the promenade + behind the rows, round the temples
    for (let i = 0; i < 130; i++) {
      const x = (R() - 0.5) * 600, z = farEdge(x) + (R() < 0.4 ? 3.5 : 14 + R() * 60);
      if (Math.hypot(x, z) > 350 || (Math.abs(x - 121) < 30 && z < farEdge(x) + 50) || (Math.abs(x) < 30 && z < FAR_EDGE + 32)) continue;
      spots.push([x, FAR_TOP, z, 2.6 + R() * 3, 5 + R() * 5]);
    }
    const leafM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    leafM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz; float h = max(position.y, 0.0); transformed.x += sin(uTime * 0.7 + ip.x * 0.3) * 0.04 * h; transformed.z += cos(uTime * 0.55 + ip.z * 0.3) * 0.03 * h; }`);
    };
    leafM.customProgramCacheKey = () => 'rvLeaf';
    const barkM = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x4a3a2e, roughness: 0.95 });
    const cIm = new THREE.InstancedMesh(canopy, leafM, spots.length), tIm = new THREE.InstancedMesh(trunk, barkM, spots.length);
    spots.forEach(([x, y, z, rad, h], i) => {
      _o.rotation.set(0, R() * TAU, 0);
      _o.position.set(x, y + h, z); _o.scale.set(rad, rad, rad); _o.updateMatrix(); cIm.setMatrixAt(i, _o.matrix);
      cIm.setColorAt(i, _c.set(0x22361e).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.06));
      _o.position.set(x, y, z); _o.scale.set(rad, h, rad); _o.updateMatrix(); tIm.setMatrixAt(i, _o.matrix);
    });
    cIm.computeBoundingSphere(); tIm.computeBoundingSphere();
    root.add(cIm, tIm);
    // coconut palms: curved ringed trunks, drooping fronds
    const palmT = [], palmF = [];
    {
      const curve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0.3, 4, 0), V3(1.0, 8, 0), V3(1.9, 11.5, 0)]);
      palmT.push(new THREE.TubeGeometry(curve, 20, 0.17, 8));
      const top = V3(1.9, 11.5, 0);
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU, droop = 0.55 + (k % 3) * 0.2, fp = [], fi = [], N = 12;
        for (let i = 0; i <= N; i++) { const t = i / N, d = t * 3.4, y = Math.sin(t * Math.PI * 0.6) * 0.9 - t * t * 2.4 * droop, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04; fp.push(d, y, -w, d, y + 0.08, 0, d, y, w); }
        for (let i = 0; i < N; i++) { const b = i * 3; fi.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi); fg.computeVertexNormals();
        _o.position.copy(top); _o.rotation.set(0, a, 0.15); _o.scale.setScalar(1); _o.updateMatrix();
        palmF.push(fg.applyMatrix4(_o.matrix));
      }
    }
    const palmSpots = [];
    for (let i = 0; i < 46; i++) {
      const far = i % 3 !== 0, x = far ? (R() - 0.5) * 520 : (R() < 0.5 ? -1 : 1) * (60 + R() * 60);
      const z = far ? farEdge(x) + 2.5 + R() * 20 : nearEdge(x) - 2.5 - R() * 6;
      if (Math.hypot(x, z) > 340 || (far && Math.abs(x) < 30 && z < FAR_EDGE + 32)) continue;
      palmSpots.push([x, far ? FAR_TOP : QUAY_TOP, z, R() * TAU, 0.85 + R() * 0.4]);
    }
    const fM = new THREE.MeshStandardMaterial({ color: 0x2c4a26, roughness: 0.8, side: THREE.DoubleSide });
    fM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float h = max(position.y - 10.5, 0.0); vec3 ip = instanceMatrix[3].xyz;
          transformed.x += sin(uTime * 0.8 + ip.x * 0.2 + position.z) * 0.08 * h; transformed.y += sin(uTime * 1.3 + ip.z * 0.3 + position.x) * 0.04 * h; }`);
    };
    fM.customProgramCacheKey = () => 'rvPalm';
    const tM = new THREE.MeshStandardMaterial({ color: 0x5a4c3e, roughness: 0.95 });
    for (const [geo, m] of [[mergeAll(palmT), tM], [mergeAll(palmF), fM]]) {
      const im = new THREE.InstancedMesh(geo, m, palmSpots.length);
      palmSpots.forEach(([x, y, z, ry, sc], i) => { _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(sc); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
      im.computeBoundingSphere(); root.add(im);
    }
    // fireflies in the trees (only well away from the court)
    const ff = [];
    for (const [x, y, z, rad] of spots) if (Math.abs(x) > 18 && Math.hypot(x, z) < 160 && R() < 0.5) for (let k = 0; k < 3; k++) ff.push([x + (R() - 0.5) * rad * 2, y + 1 + R() * 3, z + (R() - 0.5) * rad * 2]);
    const ffp = makeFireflies(ff, uTime, [1.0, 0.95, 0.55]); root.add(ffp);
    ticks.push(() => { ffp.material.uniforms.uScale.value = uPR.value * 0.8; });
  }

  /* ---------------- 10. BOATS — long-tails, a rice-barge train, express ferries, a dinner cruise, a floating market ---------------- */
  // every boat is one entry in uniform arrays; the vertex shader moves its vertices (one draw call for all hulls, one for all lights)
  const boats = [];
  {
    const person = personGeometry({ hat: true }), personB = personGeometry();
    // a lofted hull: stations along x (stern −L/2 → bow +L/2), U-shaped sections, the bow sweeping up
    const hull = (L, Wd, Dp, rise, col, inner = 0x3a2a1e) => {
      const N = 20, Mj = 8, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = -L / 2 + t * L;
        const w = Wd / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.03)), 0.55) + 0.02;
        const sheer = Dp * 0.25 + rise * Math.pow(t, 5) + 0.15 * Math.pow(1 - t, 4);
        for (let j = 0; j <= Mj; j++) { const ph = -Math.PI / 2 + (j / Mj) * Math.PI; pos.push(x, sheer - (sheer + Dp * 0.75) * Math.pow(Math.cos(ph), 0.7), w * Math.sin(ph)); }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < Mj; j++) { const a = i * (Mj + 1) + j, b = a + Mj + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const out = [vc(g, col)];
      const gi = g.clone(); gi.scale(0.97, 0.98, 0.94); const ii = gi.index.array; for (let k = 0; k < ii.length; k += 3) { const tmp = ii[k]; ii[k] = ii[k + 1]; ii[k + 1] = tmp; } gi.computeVertexNormals();
      out.push(vc(gi, inner));
      out.push(vc(new THREE.BoxGeometry(L * 0.8, 0.04, Wd * 0.78).translate(-L * 0.03, -Dp * 0.25, 0), 0x6a4a30));   // floorboards
      return out;
    };
    const P = (list, geo, col) => { list.push(vc(geo, col)); };
    const kinds = {};
    const longtail = (i) => {
      const b = hull(9, 1.5, 0.75, 1.0, [0x3a6a8a, 0x8a3a2a, 0x2f6a4a, 0x5a4a8a][i % 4]), gl = [];
      const cc = [0x1f5fa8, 0xc0392b, 0x2f7a4a, 0xe2a400][i % 4];
      const roof = new THREE.CylinderGeometry(0.85, 0.85, 4.2, 14, 1, true, 0, Math.PI); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.3, 1);
      P(b, roof.translate(-0.2, 1.55, 0), cc);
      for (const [x, z] of [[-2.1, 0.62], [-2.1, -0.62], [1.7, 0.6], [1.7, -0.6]]) P(b, new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6).translate(x, 0.88, z), 0x2a2a2a);
      P(b, new THREE.BoxGeometry(0.7, 0.5, 0.5).translate(-4.0, 0.75, 0), 0x8a8f96);
      P(b, rod(V3(-3.7, 0.7, 0), V3(-7.6, -0.35, 0), 0.045, 0.035), 0x6a6e74);
      P(b, new THREE.TorusGeometry(0.25, 0.04, 5, 10).rotateY(Math.PI / 2).translate(-7.6, -0.35, 0), 0x9a9a9a);
      for (let k = 0; k < 6; k++) P(b, new THREE.BoxGeometry(0.1, 0.5, 0.05).rotateZ(0.4).translate(4.3 + k * 0.03, 0.8 + k * 0.08, (k % 2 - 0.5) * 0.1), [0xff4a8a, 0xffd23a, 0x4ac0ff, 0xffffff, 0xff7a2a, 0x7aff5a][k]);   // bow garlands
      const pp = (geo, col, x, y, z, s = 0.85) => P(b, geo.clone().scale(s, s, s).translate(x, y, z), col);
      pp(person.body, 0x3a4a6a, -3.3, -0.1, 0); pp(person.head, 0x8a5a3a, -3.3, -0.1, 0); pp(person.hat, 0xd8b25a, -3.3, -0.1, 0);
      for (let k = 0; k < (i % 3) + 1; k++) { const x = -1.2 + k * 1.1; pp(personB.body, [0xd84a3a, 0xf2f2f2, 0x2f9a5a, 0xe8b82a][(k + i) % 4], x, -0.6, (k % 2 - 0.5) * 0.4, 0.8); pp(personB.head, 0xc99a72, x, -0.6, (k % 2 - 0.5) * 0.4, 0.8); }
      gl.push(vc(new THREE.SphereGeometry(0.11, 10, 8).translate(1.75, 1.5, 0), 0xffc070), vc(new THREE.SphereGeometry(0.06, 8, 6).translate(-4.0, 1.1, 0), 0xffe0b0));
      return { body: b, glow: gl, len: 9 };
    };
    const canoe = (i) => {
      const b = hull(4.6, 0.95, 0.45, 0.35, 0x4a3020, 0x2a1c12), gl = [];
      const pp = (geo, col, x, y, z, s = 0.85) => P(b, geo.clone().scale(s, s, s).translate(x, y, z), col);
      pp(personB.body, [0x2a3a5a, 0x5a2a2a, 0x2a4a3a][i % 3], -1.3, -0.75, 0, 0.85); pp(personB.head, 0x8a5a3a, -1.3, -0.75, 0, 0.85); pp(person.hat, 0xd8b25a, -1.3, -0.75, 0, 0.85);
      for (let k = 0; k < 9; k++) P(b, new THREE.SphereGeometry(0.12, 6, 4).translate(-0.3 + (k % 5) * 0.32, 0.0 + Math.floor(k / 5) * 0.1, ((k % 2) - 0.5) * 0.3), [0xff8a2a, 0x7fbf3a, 0xe8d24a, 0xd8382e, 0xffffff, 0x8a3a8a, 0xffb0c0][(k + i) % 7]);
      P(b, new THREE.CylinderGeometry(0.28, 0.2, 0.18, 12).translate(0.9, -0.02, 0), 0x8a6a3a);
      if (i % 3 === 0) { P(b, new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5).translate(0.4, 0.6, 0), 0x6a6a6a); const um = new THREE.ConeGeometry(0.9, 0.35, 16, 1, true); P(b, um.translate(0.4, 1.4, 0), [0xc0392b, 0x1f5fa8, 0xe2a400][i % 3]); }
      gl.push(vc(new THREE.SphereGeometry(0.06, 8, 6).translate(1.6, 0.4, 0), 0xffc070));
      return { body: b, glow: gl, len: 4.6 };
    };
    const barge = () => {
      const b = hull(22, 5.2, 1.6, 0.6, 0x3a2618, 0x2a1c12), gl = [];
      const roof = new THREE.CylinderGeometry(2.4, 2.4, 14, 16, 1, true, 0, Math.PI); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.55, 1);
      P(b, roof.translate(0.5, 0.35, 0), 0x2a1e16);
      P(b, new THREE.BoxGeometry(3.2, 1.8, 3.6).translate(-8.5, 0.9, 0), 0x4a3426);
      gl.push(vc(new THREE.PlaneGeometry(0.8, 0.5).translate(-6.88, 1.0, 0).rotateY(0), 0xffb860));
      gl.push(vc(new THREE.SphereGeometry(0.08, 8, 6).translate(-8.5, 2.2, 0), 0xffffff));
      return { body: b, glow: gl, len: 22 };
    };
    const tug = () => {
      const b = hull(11, 3.4, 1.2, 0.5, 0x202428, 0x1a1c1e), gl = [];
      P(b, new THREE.BoxGeometry(3.6, 2.0, 2.6).translate(-1.0, 1.0, 0), 0xd8d4c8);
      P(b, new THREE.BoxGeometry(4.0, 0.15, 3.0).translate(-1.0, 2.05, 0), 0x2a2a2a);
      P(b, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(-1.0, 3.2, 0), 0x2a2a2a);
      for (const sz of [-1, 1]) gl.push(vc(new THREE.PlaneGeometry(0.7, 0.5).rotateY(sz > 0 ? 0 : Math.PI).translate(-1.0, 1.4, sz * 1.31), 0xffd8a0));
      gl.push(vc(new THREE.SphereGeometry(0.1, 8, 6).translate(-1.0, 4.45, 0), 0xffffff), vc(new THREE.SphereGeometry(0.08, 8, 6).translate(0.6, 2.2, 1.2), 0x30ff60), vc(new THREE.SphereGeometry(0.08, 8, 6).translate(0.6, 2.2, -1.2), 0xff3020));
      return { body: b, glow: gl, len: 11 };
    };
    const ferry = () => {
      const b = hull(24, 3.8, 1.1, 0.5, 0xe8e8e2, 0x2a3a5a), gl = [];
      P(b, new THREE.BoxGeometry(18, 0.12, 3.9).translate(-0.5, 2.5, 0), 0xf2f2ee);
      P(b, new THREE.BoxGeometry(24, 0.18, 0.06).translate(0, 0.2, 1.75), 0xe8862a); P(b, new THREE.BoxGeometry(24, 0.18, 0.06).translate(0, 0.2, -1.75), 0xe8862a);
      for (let k = 0; k < 7; k++) for (const sz of [-1, 1]) P(b, new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6).translate(-9 + k * 3, 1.45, sz * 1.8), 0xd8d8d8);
      for (let k = 0; k < 10; k++) { const x = -8 + k * 1.7; P(b, personB.body.clone().scale(0.8, 0.8, 0.8).translate(x, 0, (k % 2 - 0.5) * 1.2), [0x3a6ad8, 0xd84a3a, 0xf2f2f2, 0x2f9a5a, 0xe8b82a][k % 5]); P(b, personB.head.clone().scale(0.8, 0.8, 0.8).translate(x, 0, (k % 2 - 0.5) * 1.2), 0xc99a72); }
      for (const sz of [-1, 1]) gl.push(vc(new THREE.PlaneGeometry(17, 0.08).rotateY(sz > 0 ? 0 : Math.PI).translate(-0.5, 2.38, sz * 1.95), 0xe0f0ff));
      P(b, new THREE.PlaneGeometry(0.9, 0.55).translate(10.5, 3.4, 0), 0xe8862a);
      P(b, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5).translate(10.05, 3.0, 0), 0x8a8a8a);
      return { body: b, glow: gl, len: 24 };
    };
    const cruise = () => {
      const b = hull(30, 6.4, 1.4, 0.4, 0xf0ece4, 0x2a2a2a), gl = [];
      P(b, new THREE.BoxGeometry(24, 2.4, 5.8).translate(-1, 1.6, 0), 0xf4f0e8);
      P(b, new THREE.BoxGeometry(24.6, 0.15, 6.2).translate(-1, 2.85, 0), 0x8a1e17);
      P(b, new THREE.BoxGeometry(14, 2.0, 5).translate(-3, 3.9, 0), 0xf4f0e8);
      P(b, new THREE.BoxGeometry(14.6, 0.15, 5.4).translate(-3, 4.95, 0), 0x8a1e17);
      for (const sz of [-1, 1]) {
        gl.push(vc(new THREE.PlaneGeometry(22, 1.2).rotateY(sz > 0 ? 0 : Math.PI).translate(-1, 1.8, sz * 2.92), 0xffc070));
        gl.push(vc(new THREE.PlaneGeometry(12, 1.0).rotateY(sz > 0 ? 0 : Math.PI).translate(-3, 3.95, sz * 2.52), 0xffd890));
        for (let k = 0; k < 24; k++) gl.push(vc(new THREE.SphereGeometry(0.07, 6, 5).translate(-13 + k * 1.05, 2.75 - Math.sin((k % 4) / 4 * Math.PI) * 0.15, sz * 3.05), [0xffd27a, 0xff8a5a, 0xfff0c8][k % 3]));
      }
      return { body: b, glow: gl, len: 30 };
    };
    // the fleet: [kind, lane offset from the river's centre line (m, + = toward the far bank), speed (m/s, + = toward +x), start x]
    const fleet = [];
    for (let i = 0; i < 7; i++) fleet.push(['longtail', [-6, 0, 8, 14, -3, 20, 4][i], (i % 2 ? -1 : 1) * (4.2 + R() * 2.5), -300 + R() * 600, i]);
    fleet.push(['tug', 18, -1.3, 120], ['barge', 18, -1.3, 136.5], ['barge', 18, -1.3, 160], ['barge', 18, -1.3, 183.5]);
    fleet.push(['ferry', 6, 5.4, -200], ['ferry', -4, -5.0, 90], ['cruise', 25, 1.6, -60]);
    // floating market: canoes drifting a few metres either side of a home spot by the quay wall and off the pier's flanks
    for (let i = 0; i < 12; i++) { const sd = i % 2 ? 1 : -1, x = sd * (PX + 3.2 + Math.floor(i / 2) * 5.0 + R() * 1.4); fleet.push(['canoe', null, 0, x, i, QUAY_Z + 1.9 + (i % 3) * 1.25]); }
    for (let i = 0; i < 6; i++) { const sd = i % 2 ? 1 : -1, x = sd * (PX + 5 + R() * 24); fleet.push(['canoe', null, 0, x, i + 12, PZ1 + 2.2 + R() * 5]); }
    fleet.push(['canoe', null, 0, -1.6, 30, PZ1 + 3.55], ['longtail', null, 0, 1.2, 9, PZ1 + 4.6]);     // tied up at the pontoon
    const makers = { longtail, canoe, barge, tug, ferry, cruise };
    const bodyParts = [], glowParts = [];
    const tag = (geo, k) => { const n = geo.attributes.position.count; geo.setAttribute('aBoat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(k), 1)); return geo; };
    fleet.forEach((f, k) => {
      const [kind, lane, v, x0, i, zHome] = f;
      const key = kind + (kind === 'longtail' || kind === 'canoe' ? (i % 4) : '');
      const proto = kinds[key] || (kinds[key] = makers[kind](i || 0));
      for (const g of proto.body) bodyParts.push(tag(g.clone(), k));
      for (const g of proto.glow) glowParts.push(tag(g.clone(), k));
      boats.push({ kind, lane, v, x: x0, zHome, home: x0, len: proto.len, ph: R() * TAU, drift: lane === null, dv: (R() - 0.5) * 0.5, yaw0: (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.3, tied: lane === null && Math.abs(zHome - PZ1) < 6 && Math.abs(x0) < 4 });
    });
    const NB = boats.length;
    const uBT = { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uBR = { value: Array.from({ length: NB }, () => new THREE.Vector4()) };
    const inject = (mat, normals) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uBT = uBT; sh.uniforms.uBR = uBR;
        sh.vertexShader = `attribute float aBoat; uniform vec4 uBT[${NB}]; uniform vec4 uBR[${NB}];
          mat3 rvBoatRot() { int k = int(aBoat + 0.5); vec4 t = uBT[k], r = uBR[k];
            float cy = cos(t.w), sy = sin(t.w), cp = cos(r.x), sp = sin(r.x), cr = cos(r.y), sr = sin(r.y);
            return mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(cp, sp, 0.0, -sp, cp, 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, cr, sr, 0.0, -sr, cr); }
          ` + sh.vertexShader
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            { mat3 bR = rvBoatRot(); transformed = bR * transformed + uBT[int(aBoat + 0.5)].xyz; }`);
        if (normals) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = rvBoatRot() * objectNormal;');
      };
      mat.customProgramCacheKey = () => 'rvBoat' + (normals ? 'n' : 'g') + NB;
      return mat;
    };
    const bodyM = inject(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), true);
    const glowM = inject(new THREE.MeshBasicMaterial({ vertexColors: true, color: glowCol(0xffffff, 2.2), side: THREE.DoubleSide }), false);
    const bodyMesh = new THREE.Mesh(mergeGeometries(bodyParts), bodyM), glowMesh = new THREE.Mesh(mergeGeometries(glowParts), glowM);
    for (const m of [bodyMesh, glowMesh]) { m.frustumCulled = false; root.add(m); }
    glowMesh.layers.enable(REFL_LAYER);   // (the boats' lamps + lit windows show in the water; the hulls are left out of the mirror pass)
    const LIM = 330;
    let wakeN = 0;
    ticks.push((t, dt) => {
      wakeN = 0;
      boats.forEach((b, k) => {
        let x, z, yaw, sp = 0, dirx = 1, dirz = 0;
        if (b.drift) {
          if (!b.tied) { b.x += b.dv * dt; if (Math.abs(b.x - b.home) > 3) b.dv = -b.dv; }
          x = b.x; z = b.zHome + Math.sin(t * 0.21 + b.ph) * 0.25; yaw = b.yaw0 + Math.sin(t * 0.3 + b.ph) * 0.08;
          if (b.tied) yaw = Math.PI * 0.02;
        } else {
          const s = slope(b.x), N = Math.hypot(1, s);
          b.x += (b.v / N) * dt;
          if (b.x > LIM) b.x = -LIM; if (b.x < -LIM) b.x = LIM;
          x = b.x; z = centre(x) + b.lane * N;
          dirx = Math.sign(b.v) / N; dirz = (Math.sign(b.v) * s) / N;
          yaw = Math.atan2(-dirz, dirx); sp = Math.abs(b.v);
        }
        const bob = Math.sin(t * 1.3 + b.ph) * 0.05 * (b.len < 12 ? 1 : 0.4);
        uBT.value[k].set(x, WATER_Y + 0.02 + bob, z, yaw);
        uBR.value[k].set(Math.sin(t * 0.9 + b.ph) * (b.len < 12 ? 0.025 : 0.008), Math.sin(t * 1.1 + b.ph * 2) * (b.len < 12 ? 0.04 : 0.01), 0, 0);
        if (sp > 0.5 && wakeN < NWAKE) { wakeU[wakeN++].set(x - dirx * b.len * 0.45, z - dirz * b.len * 0.45, dirx * sp, dirz * sp); }
      });
      for (let i = wakeN; i < NWAKE; i++) wakeU[i].set(0, 0, 0, 0);
    });
  }
  // water hyacinth: dark green clumps with a few lilac flowers, drifting down-river with the current
  {
    const parts = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; parts.push(vc(new THREE.IcosahedronGeometry(0.28, 0).scale(1, 0.45, 1).translate(Math.cos(a) * 0.35, 0.05, Math.sin(a) * 0.35), 0x2a4a22)); }
    parts.push(vc(new THREE.IcosahedronGeometry(0.34, 0).scale(1, 0.6, 1).translate(0, 0.12, 0), 0x335a28));
    for (let k = 0; k < 3; k++) parts.push(vc(new THREE.SphereGeometry(0.07, 6, 5).translate((k - 1) * 0.2, 0.32, (k % 2) * 0.15), 0xb89ad8));
    const geo = mergeGeometries(parts);
    const N = 64, im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), N);
    for (let i = 0; i < N; i++) {
      const x = (R() - 0.5) * 660, off = -24 + R() * 54;
      _o.position.set(x, WATER_Y + 0.02, off); _o.rotation.set(0, R() * TAU, 0); _o.scale.setScalar(0.7 + R() * 1.4); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
    }
    im.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + BEND_GLSL + '\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          vec4 ip = instanceMatrix[3];
          float x = mod(ip.x + 330.0 - uTime * 0.45, 660.0) - 330.0;
          float s = abs(x) > ${BEND_X.toFixed(1)} ? 2.0 * ${BEND_K} * (abs(x) - ${BEND_X.toFixed(1)}) : 0.0;
          float zc = ${((NEAR_EDGE + FAR_EDGE) / 2).toFixed(2)} + rvBend(x) + ip.z * sqrt(1.0 + s * s);
          zc = abs(x) < ${(PX + 3).toFixed(1)} ? max(zc, ${(PZ1 + 1.2).toFixed(2)}) : zc;
          mvPosition = instanceMatrix * mvPosition; mvPosition.xz += vec2(x, zc) - ip.xz;
          mvPosition.y += sin(uTime * 1.2 + ip.x) * 0.03;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    im.material.customProgramCacheKey = () => 'rvHyacinth';
    im.frustumCulled = false;
    root.add(im);
  }

  /* ---------------- 11. LIGHTS, MIST, MOTHS, STEAM, EGRETS ---------------- */
  // far lamps along the far promenade + every point light collected above, one Points draw call (blinking ones flagged)
  {
    for (let x = -300; x <= 300; x += 14) { const z = farEdge(x) + 1.2; if (Math.hypot(x, z) > 350 || !offAxis(x, z, 17)) continue; glowPts.push([x, FAR_TOP + 4.2, z, 0.75, 1.0, 0.82, 0.55]); B.put(M.metal, vc(new THREE.CylinderGeometry(0.06, 0.09, 4.1, 8).translate(x, FAR_TOP + 2.05, z), 0x222222)); }
    const n = glowPts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), bl = new Float32Array(n);
    glowPts.forEach(([x, y, z, s, r, g, b, blink = 0], i) => { pos.set([x, y, z], i * 3); col.set([r, g, b], i * 3); sz[i] = s; bl[i] = blink; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('aBlink', new THREE.BufferAttribute(bl, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: true,
      uniforms: { uTime, uPR, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: `uniform float uTime; uniform float uPR; attribute float aSize; attribute float aBlink; varying vec3 vC; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vC = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          vA = aBlink > 0.5 ? step(0.55, fract(uTime * 0.6 + position.x * 0.013)) : 1.0;
          gl_PointSize = max(2.0, aSize * 520.0 / -mvPosition.z) * uPR;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        #include <fog_pars_fragment>
        void main(){ float d = length(gl_PointCoord - 0.5); float a = (smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.16, 0.0, d)) * vA; gl_FragColor = vec4(vC * a * 1.6, a);
          #include <fog_fragment>
        }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.layers.enable(REFL_LAYER); root.add(p);
  }
  // halos round the floodlit temples
  for (const [x, y, z, s, op] of halos) {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffb060, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    h.position.set(x, y, z); h.scale.set(s, s, 1); root.add(h);
  }
  // mist lying on the water: soft billboards drifting with the current, kept away from the court and thin toward the camera
  {
    const N = 70, offs = new Float32Array(N * 4), geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    for (let i = 0; i < N; i++) { const x = (R() - 0.5) * 600, off = -26 + R() * 56; offs.set([x, off, 26 + R() * 40, R()], i * 4); }
    geo.setAttribute('aM', new THREE.InstancedBufferAttribute(offs, 4)); geo.instanceCount = N;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: { uTime, uMap: { value: mistTexture() }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: `uniform float uTime; attribute vec4 aM; varying vec2 vUv; varying float vA;
        ${BEND_GLSL}
        #include <fog_pars_vertex>
        void main(){ vUv = uv;
          float x = mod(aM.x + 300.0 - uTime * (0.35 + aM.w * 0.25), 600.0) - 300.0;
          float zc = ${((NEAR_EDGE + FAR_EDGE) / 2).toFixed(2)} + rvBend(x) + aM.y;
          vec3 c = vec3(x, ${(WATER_Y + 1.2).toFixed(2)} + aM.w * 1.5, zc);
          vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
          mvPosition.xy += position.xy * vec2(aM.z, aM.z * 0.16);
          gl_Position = projectionMatrix * mvPosition;
          float dc = length(c.xz);
          float ax = abs(c.z) / (abs(c.x) + 15.0);                       // how far off the river's axis (as the match cameras see it)
          vA = smoothstep(30.0, 60.0, dc) * smoothstep(14.0, 40.0, -mvPosition.z) * smoothstep(0.3, 0.55, ax) * (1.0 - smoothstep(10.0, 28.0, cameraPosition.y)) * (0.55 + 0.45 * sin(uTime * 0.05 + aM.w * 20.0));
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying float vA;
        #include <fog_pars_fragment>
        void main(){ float a = texture2D(uMap, vUv).r * vA * 0.16; gl_FragColor = vec4(vec3(0.42, 0.48, 0.62), a);
          #include <fog_fragment>
        }` });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 4; root.add(mesh);
  }
  // moths round the quay lamps + stall bulbs; steam off the soup pots
  {
    const per = 3, n = lampHomes.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const h = lampHomes[Math.floor(i / per)]; pos.set(h.slice(0, 3), i * 3); sd[i * 2] = R(); sd[i * 2 + 1] = h[3]; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPR },
      vertexShader: `uniform float uTime; uniform float uPR; attribute vec2 sd; varying float vA;
        void main(){ float s = sd.x, r = sd.y; float a = uTime * (1.6 + s * 1.4) + s * 30.0;
          vec3 p = position + vec3(cos(a) * r, sin(uTime * 2.3 + s * 9.0) * 0.18 + sin(a * 2.7) * 0.08, sin(a * 1.3) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.25 * sin(uTime * 23.0 + s * 50.0); gl_PointSize = 26.0 / -mv.z * uPR; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; root.add(pts);
  }
  {
    const src = ctx.stalls.filter((_, i) => i % 2 === 0), per = 6, n = src.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [x, z] = src[Math.floor(i / per)]; pos.set([x + 0.6, QUAY_TOP + 1.2, z + 0.1], i * 3); sd[i] = R(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uPR, uMap: { value: softTexture(0, 64) } },
      vertexShader: `uniform float uTime; uniform float uPR; attribute float seed; varying float vA;
        void main(){ float life = 4.0; float t = mod(uTime + seed * life, life) / life;
          vec3 p = position + vec3(sin(uTime * 0.7 + seed * 20.0 + t * 4.0) * 0.2 * t, t * 1.6, cos(uTime * 0.5 + seed * 13.0) * 0.2 * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.15, t) * (1.0 - t) * 0.09; gl_PointSize = (0.2 + t * 0.7) * 700.0 / -mv.z * uPR; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.85, 0.85, 0.88) * a, a); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; root.add(pts);
  }
  // egrets: loose skeins crossing high over the far half of the river, wings flapping (instanced, one draw call)
  {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, -0.85, 0.05, -0.05, 0, 0, -0.05, 0, 0, 0.35, 0, 0, -0.05, 0.85, 0.05, -0.05, 0, 0, 0.35, 0, -0.02, -0.5, 0.06, 0, 0], 3));
    wing.computeVertexNormals();
    const N = 16, im = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x8c92a0, side: THREE.DoubleSide }), N);
    im.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z; transformed.y += abs(position.x) * sin(uTime * 4.2 + ph) * 0.7; }`);
    };
    im.material.customProgramCacheKey = () => 'rvEgret';
    const birds = Array.from({ length: N }, (_, i) => ({ g: Math.floor(i / 8), k: i % 8, ph: R() * 10 }));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; root.add(im);
    ticks.push((t) => {
      birds.forEach((b, i) => {
        const dir = b.g ? -1 : 1, L = 560, sp = 7.5;
        const x = ((((t + b.g * 37) * sp * dir + (b.g ? 200 : -200)) % L) + L * 1.5) % L - L / 2;
        const row = Math.ceil(b.k / 2), sd = b.k % 2 ? 1 : -1;
        const px = x - dir * row * 1.8, pz = (b.g ? 120 : 80) + bend(x) * 0.6 + sd * row * 1.6, py = (b.g ? 34 : 26) + Math.sin(t * 0.3 + b.ph) * 0.6;
        _o.position.set(px, py, pz); _o.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); _o.scale.setScalar(1.3); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  }

  B.build(root, { receive: true });
  // the pier's timber + deck receive and cast shadows (the court-side floodlights rake across it)
  root.traverse((o) => { if (o.isMesh && o.material === M.wood) { o.castShadow = true; o.receiveShadow = true; } });

  function update(dt, t, pr) {
    if (pr) uPR.value = pr;
    for (const f of ticks) f(t, dt);
  }
  return { group: root, update, REFL_LAYER };
}
