// BAMBOO FOREST — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on Ultra.
// Replaces the low-poly grove (`lite` in bamboo.js) with a moonlit clearing in a towering bamboo grove:
//  • ~2000 instanced culms in three levels of detail — node ridges, waxy bands, streaks, lichen, mossy feet, colour
//    variation — that bend in a travelling wind, carrying alpha-to-coverage leaf sprays that flutter;
//  • layered depth: the grove thins into painted bamboo curtains and ground mist, all melting into a blue-grey haze;
//  • moonlight: soft god-ray shafts slanting down through the canopy (off to the sides), moon pools + dapples on the floor;
//  • a leaf-litter forest floor (Poly Haven), mossy rocks, ferns, dwarf bamboo, shoots, fallen culms;
//  • two stepping-stone paths off the sides of the clearing lined with stone tōrō and paper chōchin lanterns, a stream
//    with a slab bridge, a stone water basin with a bamboo spout and a tipping shishi-odoshi;
//  • a detailed Thai spirit house on a mossy plinth with garlands, offerings, candles and curling incense;
//  • falling bamboo leaves, fireflies, motes in the moon shafts.
// GAMEPLAY RULE: nothing on or above the court + free zone; nothing bright or busy behind the ball's flight in the two
// match cameras (which look along ±x): every light, shaft and particle sits ≥ 25° off the ±x axis as seen from either
// camera (offAxis), and the grove behind each end is left dark and still.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, softTexture, TAU } from './temple-ultra.js';

const DEG = Math.PI / 180;
const MOON = new THREE.Vector3(-7, 15, -14).normalize();          // main.js LIGHT_POS.night
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();

/* ---------------- geometry helpers ---------------- */
function P(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'XYZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  return g.applyMatrix4(_o.matrix);
}
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// merge, keeping position / normal / uv / color (missing ones filled in)
function mergeAll(list) {
  const clean = list.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return g;
  });
  return mergeGeometries(clean);
}
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, { cast = false, receive = true } = {}) {
      for (const [mat, list] of m) { if (!list.length) continue; const mesh = new THREE.Mesh(mergeAll(list), mat); mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.matrixAutoUpdate = false; parent.add(mesh); }
      m.clear();
    },
  };
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/* ---------------- shared GLSL ---------------- */
const NOISE = `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }`;
// wind: a gust front rolls across the grove (+x, slightly +z) over a slow sway; returns the top displacement (m) of a 20 m culm
const WIND = `
  uniform float uTime;
  vec2 windAt(vec2 xz, float ph) {
    float t = uTime;
    float gust = 0.5 + 0.5 * sin(dot(xz, vec2(0.055, 0.03)) - t * 0.75);
    gust *= 0.55 + 0.45 * sin(t * 0.19 + 0.7);
    vec2 lean = vec2(0.7, 0.32) * gust;
    vec2 sway = vec2(sin(t * 0.9 + ph), cos(t * 0.71 + ph * 1.37)) * (0.22 + 0.3 * gust)
              + vec2(sin(t * 2.3 + ph * 3.1), cos(t * 2.1 + ph * 2.3)) * 0.05 * (0.4 + gust);
    return lean + sway;
  }
  // world offset at height fraction f of a culm of height H standing at xz
  vec3 culmBend(vec4 c, float f) { vec2 w = windAt(c.xy, c.w) * (c.z / 20.0) * f * f; return vec3(w.x, 0.0, w.y); }
  // world vector → instance-local (instance = rotation × scale)
  vec3 toLocal(vec3 d) {
    #ifdef USE_INSTANCING
      mat3 m = mat3(instanceMatrix);
      return (transpose(m) * d) / vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
    #else
      return d;
    #endif
  }`;
const lampHead = (n) => `
  uniform vec4 uLamps[${n}]; uniform vec3 uLampCol; uniform float uLampK;
  vec3 lampLight(vec3 p, vec3 nrm) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${n}; i++) {
      vec3 d = uLamps[i].xyz - p; float l2 = dot(d, d); float R2 = uLamps[i].w * uLamps[i].w;
      float f = R2 / (l2 + R2 * 0.35);
      acc += vec3(f * f) * (0.3 + 0.7 * clamp(dot(nrm, d) * inversesqrt(l2 + 1e-4), 0.0, 1.0));
    }
    return acc * uLampCol * uLampK;
  }`;

// patch a built-in material: world pos/normal varyings, optional vertex code, colour / roughness / emissive hooks
function inject(mat, o) {
  const U = o.uniforms || {};
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const world = o.noWorld ? '' : `{ mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWP = (wm * vec4(transformed, 1.0)).xyz;
        mat3 m3 = mat3(wm);
        vec3 wn = m3 * (objectNormal / vec3(max(dot(m3[0], m3[0]), 1e-8), max(dot(m3[1], m3[1]), 1e-8), max(dot(m3[2], m3[2]), 1e-8)));
        vWN = dot(wn, wn) > 1e-12 ? normalize(wn) : vec3(0.0, 1.0, 0.0); }`;
    const vary = o.noWorld ? '' : 'varying vec3 vWP; varying vec3 vWN;\n';
    sh.vertexShader = sh.vertexShader.replace('void main() {', vary + (o.vHead || '') + '\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (o.vBody || '') + '\n' + world);
    let fs = sh.fragmentShader.replace('void main() {', vary + (o.fHead || '') + '\nvoid main() {');
    if (o.fMap) fs = fs.replace('#include <map_fragment>', o.fMap);
    if (o.fColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.fColor);
    if (o.fRough) fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + o.fRough);
    if (o.fNormal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.fNormal);
    if (o.fEmis) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.fEmis);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'bamboo-u-' + o.key;
  return mat;
}

/* ---------------- canvas textures ---------------- */
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }
// leaf atlas (1024²): spray A | spray B (top), dwarf bamboo clump | fern frond (bottom). Attach points: sprays top-centre,
// clump + frond bottom-centre.
function leafAtlas() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d');
  const R = rng(4242);
  const leaf = (x, y, ang, len, wid, col) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, shade(col, -0.08)); gr.addColorStop(0.45, col); gr.addColorStop(1, shade(col, 0.06));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.18, -wid * 1.1, len * 0.55, -wid * 0.9, len, 0);
    g.bezierCurveTo(len * 0.55, wid * 0.8, len * 0.18, wid * 1.0, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(230,240,190,0.22)'; g.lineWidth = Math.max(1, wid * 0.18);
    g.beginPath(); g.moveTo(1, 0); g.lineTo(len * 0.92, 0); g.stroke();
    g.restore();
  };
  const greens = ['#5c8a30', '#4c7a28', '#6e9a3a', '#3f6a24', '#7aa243', '#55802c'];
  const twig = (x0, y0, pts, w) => {
    g.strokeStyle = '#5a6a2a'; g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) { g.lineWidth = w * (1 - i / pts.length) + 0.8; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  };
  // a bamboo spray: twigs fanning down from the node, each ending in fans of slender drooping leaves
  const spray = (ox, oy, seed) => {
    const nT = 5 + (seed % 2);
    for (let k = 0; k < nT; k++) {
      let a = Math.PI / 2 + ((k / (nT - 1)) - 0.5) * 2.1 + (R() - 0.5) * 0.25;   // canvas angle (+y down)
      const L = S * (0.42 + R() * 0.38);
      let x = ox, y = oy + 6; const pts = [[x, y]];
      for (let s = 0; s < 8; s++) { a += (Math.PI / 2 - a) * 0.08; x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8; pts.push([x, y]); }
      twig(ox, oy, pts, 3.2);
      for (const tt of [0.3, 0.5, 0.68, 0.84, 1.0]) {
        const p = pts[Math.round(tt * 8)];
        const n = 2 + Math.floor(R() * 3);
        for (let j = 0; j < n; j++) {
          const side = j % 2 ? 1 : -1;
          let la = a + side * (0.35 + R() * 0.7);
          la += (Math.PI / 2 - la) * 0.45;                                   // leaves droop
          const ll = S * (0.17 + R() * 0.13);
          leaf(p[0], p[1], la, ll, ll * (0.085 + R() * 0.03), R() < 0.08 ? '#9a9448' : greens[Math.floor(R() * greens.length)]);
        }
      }
    }
  };
  spray(S * 0.5, 4, 1); spray(S * 1.5, 4, 2);
  // dwarf bamboo (sasa): stems up from the bottom, broad leaves held out at the nodes
  {
    const ox = S * 0.5, oy = S * 2 - 4;
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 1.3, L = S * (0.45 + R() * 0.45);
      const ex = ox + Math.cos(a) * L, ey = oy + Math.sin(a) * L;
      twig(ox, oy, [[ox + (R() - 0.5) * 30, oy], [ex, ey]], 2.5);
      for (let s = 0; s < 4; s++) {
        const t = 0.45 + s * 0.17, px = ox + (ex - ox) * t, py = oy + (ey - oy) * t;
        for (const side of [-1, 1]) { if (R() < 0.3) continue; const la = a + side * (0.9 + R() * 0.5) + 0.25; const ll = S * (0.12 + R() * 0.08); leaf(px, py, la, ll, ll * 0.2, greens[Math.floor(R() * greens.length)]); }
      }
    }
  }
  // fern frond: a curving rachis with tapering pinnae
  {
    const ox = S * 1.5, oy = S * 2 - 4;
    const pts = []; for (let s = 0; s <= 24; s++) { const t = s / 24; pts.push([ox + Math.sin(t * 1.4) * 40 * t, oy - t * S * 0.95]); }
    twig(ox, oy, pts, 4);
    for (let s = 2; s < 24; s++) {
      const t = s / 24, [px, py] = pts[s], len = S * 0.21 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.95) + 6;
      for (const side of [-1, 1]) leaf(px, py, -Math.PI / 2 + side * (1.25 - t * 0.5), len, len * 0.16, s % 3 ? '#3f6e2a' : '#4a7a30');
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// distant bamboo curtain: dark culms with nodes + leafy tops, alpha (2048×512, tiles horizontally)
function curtainTexture(seed) {
  const W = 2048, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const R = rng(seed);
  for (let i = 0; i < 230; i++) {
    const x = R() * W, w = 2 + R() * 5, top = H * (0.02 + R() * 0.3), l = 0.55 + R() * 0.45;
    g.fillStyle = `rgb(${Math.round(40 * l)},${Math.round(56 * l)},${Math.round(30 * l)})`;
    g.fillRect(x, top, w, H - top);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let y = H - 30 - R() * 40; y > top; y -= 34 + R() * 20) g.fillRect(x - 0.5, y, w + 1, 2);
    for (let wrap = -1; wrap <= 1; wrap++) {                        // leaf masses (wrapped so the texture tiles)
      const X = x + wrap * W;
      for (let k = 0; k < 9; k++) {
        const lx = X + (R() - 0.5) * 70, ly = top + R() * H * 0.45, r = 10 + R() * 26;
        g.fillStyle = `rgba(${Math.round(30 * l)},${Math.round(50 * l)},${Math.round(24 * l)},0.95)`;
        g.beginPath(); g.ellipse(lx, ly, r * 1.4, r * 0.7, (R() - 0.5) * 0.8, 0, TAU); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}
// paper lantern: warm paper with bamboo ribs, dark bands top and bottom, a painted band
function paperTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#d8a070'); gr.addColorStop(0.5, '#fff2d8'); gr.addColorStop(1, '#d8a070');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(90,40,10,0.35)'; for (let i = 0; i < 18; i++) g.fillRect(0, 14 + i * 13, 64, 2);
  g.fillStyle = 'rgba(160,20,10,0.55)'; g.fillRect(0, 104, 64, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildBambooUltra(ctx, uTime) {
  const { F, texLoader } = ctx;
  const root = new THREE.Group(); root.name = 'bamboo-ultra';
  const R = rng(91919);
  const ticks = [];
  const OX = F.outX, OZ = F.outZ, CAMX = F.hl + 6.9 * (F.hw / 3.5);
  const CL = 4.5;                                                   // the clearing reaches this far past the free zone
  const inClear = (x, z, m = 0) => Math.abs(x) < OX + CL + m && Math.abs(z) < OZ + CL + m;
  const camCorr = (x, z) => Math.abs(z) < OZ + 4 && Math.abs(x) < CAMX + 7;     // around + behind each match camera
  const offAxis = (x, z, deg = 25) => Math.abs(z) > Math.tan(deg * DEG) * (CAMX + Math.abs(x));
  const walkBand = (x, z) => Math.abs(x) < OX + 1.9 && Math.abs(z) < OZ + 1.9;   // fence + the spectators' band round it

  /* ---------------- layout: paths, stream, shrine, basin ---------------- */
  const pathN = [[2, OZ + 1.2], [2.6, OZ + 4.5], [4.4, OZ + 7.5], [6, OZ + 11], [5, OZ + 16], [7.5, OZ + 23], [6, OZ + 32], [9, OZ + 46], [8, OZ + 62]];
  const pathS = [[0, -(OZ + 1.2)], [-0.4, -(OZ + 4.5)], [1.2, -(OZ + 8.5)], [-0.8, -(OZ + 14)], [1.8, -(OZ + 21)], [0, -(OZ + 30)], [3, -(OZ + 44)], [1, -(OZ + 60)]];
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const polyDist = (x, z, pl) => { let d = 1e9; for (let i = 1; i < pl.length; i++) d = Math.min(d, segDist(x, z, pl[i - 1], pl[i])); return d; };
  const pathDist = (x, z) => Math.min(polyDist(x, z, pathN), polyDist(x, z, pathS));
  const along = (pl, step) => {                                     // points every `step` m along a polyline: [x, z, dirx, dirz]
    const out = []; let carry = 0;
    for (let i = 1; i < pl.length; i++) {
      const [ax, az] = pl[i - 1], [bx, bz] = pl[i], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s = carry; s < L; s += step) out.push([ax + dx * s, az + dz * s, dx, dz]);
      carry = (carry - L) % step; if (carry < 0) carry += step;
    }
    return out;
  };
  const streamZ = (x) => OZ + 8.6 + 1.4 * Math.sin(x * 0.085 + 0.6) + 0.7 * Math.sin(x * 0.21 + 1.7) + 0.22 * Math.max(0, Math.abs(x) - 18);
  const streamW = (x) => 1.5 + 0.45 * Math.sin(x * 0.15 + 0.4);
  const STREAM_Y = -0.34;
  const SH = { x: -5.4, z: -(OZ + 6.6) };                           // spirit house (faces +z, toward the court)
  const BA = { x: 4.0, z: -(OZ + 5.4) };                            // water basin + shishi-odoshi
  // bridge: where the north path crosses the stream
  let BR = null;
  for (const [x, z, dx, dz] of along(pathN, 0.1)) if (!BR && z > streamZ(x)) BR = { x, z: streamZ(x), dx, dz };

  /* ---------------- terrain height ---------------- */
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const boxOut = (x, z) => Math.max(Math.abs(x) - (OX + 3), Math.abs(z) - (OZ + 3), 0);      // metres outside the lite clearing
  const heightAt = (x, z) => {
    let y = -0.12 + smooth(0, 3, boxOut(x, z)) * 0.25 * Math.sin(x * 0.2) * Math.sin(z * 0.17);
    const far = Math.max(0, Math.hypot(x / 1.25, z) - 26);
    y += far * 0.045 + Math.min(1, far / 20) * (0.9 * Math.sin(x * 0.07 + 1.3) * Math.sin(z * 0.09) + 0.4 * Math.sin(x * 0.19 + z * 0.13));
    const ds = Math.abs(z - streamZ(x)), hw = streamW(x) / 2;
    if (ds < hw + 1.6) { const bed = -0.62 + 0.25 * smooth(0, hw, ds); y = Math.min(y, bed + (y - bed) * smooth(hw - 0.1, hw + 1.6, ds)); }
    const pd = pathDist(x, z); if (pd < 1.6) y = y + (Math.min(y, -0.08) - y) * (1 - smooth(0.6, 1.6, pd)) * 0.5;
    return y;
  };

  /* ---------------- lights (shader "lamps"): stone lanterns, paper lanterns, the shrine ---------------- */
  const lamps = [];
  const stoneLanterns = [], paperLanterns = [];
  {
    let side = 1;
    for (const pl of [pathN, pathS]) for (const [x, z, dx, dz] of along(pl, 4.6)) {
      if (Math.abs(z) < OZ + 2.6) continue;
      if (BR && Math.hypot(x - BR.x, z - BR.z) < 2.4) continue;
      side = -side;
      const px = x - dz * 1.45 * side, pz = z + dx * 1.45 * side;
      if (!offAxis(px, pz, 27) || Math.hypot(px - SH.x, pz - SH.z) < 2.6 || Math.hypot(px - BA.x, pz - BA.z) < 2) continue;
      if (Math.abs(z - streamZ(x)) < streamW(x) / 2 + 1.2) continue;
      const far = Math.hypot(px, pz) > 34;
      if (side > 0) stoneLanterns.push({ x: px, z: pz, ry: Math.atan2(dx, dz) + Math.PI / 2 * side, s: 0.9 + R() * 0.2 });
      else if (!far) paperLanterns.push({ x: px, z: pz, ry: Math.atan2(dx, dz), stand: true });
      else stoneLanterns.push({ x: px, z: pz, ry: Math.atan2(dx, dz), s: 0.85 + R() * 0.2 });
    }
    // paper lanterns hung along the grove edge on both sides of the clearing (off the ball's axis)
    for (const sz of [-1, 1]) for (let x = -OX + 1; x <= OX - 1; x += 3.4) {
      const z = sz * (OZ + 3.4), px = x + (R() - 0.5) * 0.6;
      if (!offAxis(px, z, 27) || pathDist(px, z) < 1.6 || Math.hypot(px - SH.x, z - SH.z) < 3.4 || Math.hypot(px - BA.x, z - BA.z) < 2.4) continue;
      paperLanterns.push({ x: px, z, ry: R() * TAU, stand: true, high: true });
    }
    for (const l of stoneLanterns) lamps.push(new THREE.Vector4(l.x, heightAt(l.x, l.z) + 1.05 * l.s, l.z, 2.4));
    for (const l of paperLanterns) lamps.push(new THREE.Vector4(l.x, heightAt(l.x, l.z) + (l.high ? 2.05 : 1.55), l.z, 2.6));
    lamps.push(new THREE.Vector4(SH.x, 1.5, SH.z + 1.5, 2.2), new THREE.Vector4(SH.x, 0.75, SH.z + 1.6, 2.0));
  }
  const NL = lamps.length;
  const LAMP_COL = new THREE.Color(0xffa458);
  const lampU = (k) => ({ uLamps: { value: lamps }, uLampCol: { value: LAMP_COL }, uLampK: { value: k } });

  /* ---------------- textures ---------------- */
  const tex = (name, rep = 1, srgb = true) => {
    const t = texLoader.load(`assets/bamboo-ultra/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const litter = tex('litter_diff.jpg'), litterN = tex('litter_nor_gl.jpg', 1, false);
  const rockT = tex('mossy_rock_diff.jpg'), rockN = tex('mossy_rock_nor_gl.jpg', 1, false);
  const atlas = leafAtlas();

  /* ---------------- materials ---------------- */
  const U_TIME = { uTime };
  // stone: triplanar mossy rock as albedo (tinted), extra moss on top faces, bump from the texture, lantern light
  const stoneMat = (tint, { scale = 0.9, moss = 0.6, key, lampK = 0.6 } = {}) => inject(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, map: rockT }), {
    key: 'stone' + key, uniforms: { ...lampU(lampK), uTS: { value: scale }, uMoss: { value: moss } },
    fHead: lampHead(NL) + NOISE + `uniform float uTS; uniform float uMoss;
      vec3 triCol(vec3 p, vec3 n) { vec3 bw = pow(abs(n), vec3(4.0)); bw /= max(bw.x + bw.y + bw.z, 1e-5);
        return texture2D(map, p.zy * uTS).rgb * bw.x + texture2D(map, p.xz * uTS).rgb * bw.y + texture2D(map, p.xy * uTS).rgb * bw.z; }
      vec3 perturbB(vec3 sp, vec3 sn, vec2 dh, float fd) {
        vec3 dx = dFdx(sp), dy = dFdy(sp);
        if (dot(dx, dx) < 1e-14 || dot(dy, dy) < 1e-14) return sn;
        vec3 sx = normalize(dx), sy = normalize(dy); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
        float det = dot(sx, r1) * fd; vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2);
        vec3 r = abs(det) * sn - gr; return dot(r, r) > 1e-14 ? normalize(r) : sn; }`,
    fMap: `vec3 tc = triCol(vWP, vWN); float triH = dot(tc, vec3(0.3, 0.6, 0.1));
      float up = smoothstep(0.35, 0.9, vWN.y) * smoothstep(0.35, 0.6, fbm2(vWP.xz * 2.3 + vWP.y));
      tc = mix(tc, tc * vec3(0.55, 1.05, 0.35) + vec3(0.0, 0.025, 0.0), up * uMoss);
      diffuseColor.rgb *= tc * 1.6;`,
    fNormal: 'normal = perturbB(-vViewPosition, normal, vec2(dFdx(triH), dFdy(triH)) * 1.4, faceDirection);',
    fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);',
  });
  const stoneM = stoneMat(0xb8b2a8, { key: 'a' });
  const stoneDark = stoneMat(0x8a8a80, { key: 'b', moss: 0.9, scale: 0.6 });
  // painted / lacquered / wooden pieces (vertex colours) and gilt, lit by the lanterns + candles
  const vcMat = inject(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { key: 'vc', uniforms: lampU(0.55), fHead: lampHead(NL), fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);' });
  const goldM = inject(new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.32, emissive: 0x3a2206, emissiveIntensity: 0.6 }), { key: 'gold', uniforms: lampU(0.9), fHead: lampHead(NL), fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);' });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(2.2) });
  const glowSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc480).multiplyScalar(1.5) });

  const S = batch();                    // static: stones, shrine, lanterns, bridge, basin
  const put = (mat, geo) => S.put(mat, geo);

  /* ---------------- the forest floor ---------------- */
  {
    const N = 190, M = 160, W = 330, D = 280;
    const warp = (t) => t * (0.3 + 0.7 * t * t);
    const pos = [], uv = [], mask = [], idx = [];
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const x = warp(i / N * 2 - 1) * W / 2, z = warp(j / M * 2 - 1) * D / 2;
      const y = heightAt(x, z);
      pos.push(x, y, z); uv.push(x / 3.2, z / 3.2);
      const pd = pathDist(x, z), ds = Math.abs(z - streamZ(x)) - streamW(x) / 2;
      mask.push(1 - smooth(0.5, 1.5, pd), 1 - smooth(0, 2.2, ds), smooth(0, 2.5, boxOut(x, z) - 0.5));
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aMask', new THREE.Float32BufferAttribute(mask, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    // moon pools: where the shafts reach the ground (filled in below)
    const pools = [];
    const mat = inject(new THREE.MeshStandardMaterial({ map: litter, normalMap: litterN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.95, color: 0xffffff }), {
      key: 'floor', uniforms: { ...lampU(0.5), ...U_TIME, uPools: { value: pools } },
      vHead: 'attribute vec3 aMask; varying vec3 vMask;', vBody: 'vMask = aMask;',
      fHead: lampHead(NL) + NOISE + `uniform float uTime; varying vec3 vMask; uniform vec4 uPools[12];`,
      fMap: `
        vec2 wuv = vWP.xz / 3.2;
        vec3 tA = texture2D(map, wuv).rgb;
        vec3 tB = texture2D(map, vec2(wuv.x * 0.8 - wuv.y * 0.6, wuv.x * 0.6 + wuv.y * 0.8) * 0.47 + 0.31).rgb;
        float mn = fbm2(vWP.xz * 0.05);
        vec3 alb = mix(tA, tB, smoothstep(0.35, 0.65, mn));
        alb *= mix(0.75, 1.15, fbm2(vWP.xz * 0.17 + 3.1));
        float moss = smoothstep(0.52, 0.72, fbm2(vWP.xz * 0.09 + 7.3)) * (1.0 - vMask.x) * vMask.z;
        alb = mix(alb, alb * vec3(0.45, 0.95, 0.3) + vec3(0.0, 0.03, 0.0), moss * 0.75);
        alb = mix(alb, vec3(0.2, 0.16, 0.11) * (0.7 + 0.6 * tA.g), vMask.x * 0.7);      // trodden path
        alb = mix(alb, alb * 0.55 + vec3(0.0, 0.012, 0.008), vMask.y);                    // damp stream banks
        alb = mix(vec3(0.15, 0.12, 0.085) * (0.8 + 0.5 * tA.r), alb, 0.35 + 0.65 * vMask.z); // worn earth by the fence
        diffuseColor.rgb *= alb;`,
      fEmis: `
        totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);
        vec3 moonC = vec3(0.55, 0.66, 1.0);
        float pool = 0.0;
        for (int i = 0; i < 12; i++) { vec2 d = vWP.xz - uPools[i].xy; pool += uPools[i].w * exp(-dot(d, d) / (uPools[i].z * uPools[i].z)); }
        vec2 dw = vec2(sin(uTime * 0.31), cos(uTime * 0.23)) * 0.35;
        float dap = smoothstep(0.66, 0.8, vn(vWP.xz * 0.55 + dw) * 0.7 + vn(vWP.xz * 1.7 - dw * 2.0) * 0.3) * vMask.z * (1.0 - vMask.y * 0.6);
        totalEmissiveRadiance += diffuseColor.rgb * moonC * (pool * 1.6 + dap * 0.45);`,
    });
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'floor';
    root.add(m);
    root.userData.pools = pools;
  }

  /* ---------------- the grove: instanced culms in three levels of detail ---------------- */
  const culms = [];
  const okCulm = (x, z) => !inClear(x, z) && !camCorr(x, z) && pathDist(x, z) > 1.5 && Math.abs(z - streamZ(x)) > streamW(x) / 2 + 0.5 &&
    Math.hypot(x - SH.x, z - SH.z) > 3.2 && Math.hypot(x - BA.x, z - BA.z) > 2.3 && !(BR && Math.hypot(x - BR.x, z - BR.z) < 2.5) &&
    !stoneLanterns.some((l) => Math.hypot(x - l.x, z - l.z) < 0.7) && !paperLanterns.some((l) => Math.hypot(x - l.x, z - l.z) < 0.9);
  for (let i = 0; i < 6000 && culms.length < 2150; i++) {
    const a = R() * TAU, d = Math.pow(R(), 1.35) * 78;
    const cx = Math.cos(a) * (OX + CL + 0.3 + d), cz = Math.sin(a) * (OZ + CL + 0.3 + d * 0.92);
    const n = R() < 0.3 ? 1 : 2 + Math.floor(R() * 5);
    const big = 0.75 + R() * 0.5;
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * 1.6, z = cz + (R() - 0.5) * 1.6;
      if (!okCulm(x, z)) continue;
      const dist = Math.hypot(x / 1.3, z);
      const H = (13 + R() * 9) * big * (dist > 30 ? 1.1 : 1), r = (0.045 + R() * 0.03) * (0.6 + 0.4 * big) * (H / 18);
      culms.push({ x, z, H, r, ph: R() * TAU, dist, y: heightAt(x, z) - 0.05 });
    }
  }
  // lean: near the clearing, tilt away from it (never over the free zone)
  for (const c of culms) {
    const ox = Math.sign(c.x) * Math.max(0, Math.abs(c.x) - OX) / (Math.abs(c.x) + 1), oz = Math.sign(c.z) * Math.max(0, Math.abs(c.z) - OZ) / (Math.abs(c.z) + 1);
    c.lx = (R() - 0.5) * 0.045 + ox * 0.04; c.lz = (R() - 0.5) * 0.045 + oz * 0.04;   // lean (radians) toward +x / +z
  }
  const near = culms.filter((c) => c.dist < 22), mid = culms.filter((c) => c.dist >= 22 && c.dist < 42), far = culms.filter((c) => c.dist >= 42);
  // a culm: unit height (y 0..1), unit base radius tapering to 0.55, node ridges in the near level
  const culmGeo = (radial, nodes, fracs, ridge) => {
    const ys = []; for (let k = 0; k < nodes; k++) for (const f of fracs) ys.push((k + f) / nodes); ys.push(1);
    const rad = (y) => { const f = (y * nodes) % 1; const e = Math.min(f, 1 - f); return (1 - 0.45 * Math.pow(y, 1.4)) * (1 + ridge * Math.exp(-Math.pow(e / 0.014, 2))); };
    const pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j < ys.length; j++) {
      const y = ys[j], r = rad(y), dr = (rad(Math.min(1, y + 0.002)) - rad(Math.max(0, y - 0.002))) / 0.004;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(ca * r, y, sa * r);
        const n = new THREE.Vector3(ca, -dr * 0.004, sa).normalize(); nor.push(n.x, n.y, n.z);   // (ridge slope shown only faintly)
        uv.push(i / radial, y);
      }
    }
    for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < radial; i++) { const a = j * (radial + 1) + i, b = a + 1, c = a + radial + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };
  const NODES = 11;
  const culmMat = (lod) => inject(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.0 }), {
    key: 'culm' + lod, uniforms: { ...lampU(0.7), ...U_TIME },
    vHead: WIND + 'attribute vec4 aCulm; varying vec4 vCu;',
    vBody: `transformed += toLocal(culmBend(aCulm, position.y)); vCu = vec4(uv, aCulm.z, aCulm.w);`,
    fHead: lampHead(NL) + NOISE + `varying vec4 vCu;`,
    fColor: `
      float v = vCu.y, H = vCu.z, hM = v * H;
      float fN = fract(v * ${NODES}.0);
      float node = smoothstep(0.022, 0.0, fN) + smoothstep(0.985, 1.0, fN);
      float wax = smoothstep(0.80, 0.95, fN) * (1.0 - smoothstep(0.975, 0.99, fN));
      float seed = fract(vCu.w * 0.6180339);
      float streak = vn(vec2(vCu.x * 46.0 + seed * 9.0, v * 4.0));
      vec3 c = diffuseColor.rgb * (0.8 + 0.32 * streak);
      c = mix(c, vec3(0.62, 0.68, 0.55), wax * 0.4);
      c = mix(c, c * vec3(0.5, 0.42, 0.25), node * 0.75);
      float bl = smoothstep(0.62, 0.8, vn(vec2(vCu.x * 9.0, hM * 1.4) + seed * 31.0)) * (0.25 + 0.75 * smoothstep(9.0, 0.0, hM));
      c = mix(c, vec3(0.34, 0.35, 0.29), bl * 0.6);
      float mb = smoothstep(1.1, 0.0, hM) * (0.55 + 0.45 * vn(vec2(vCu.x * 12.0, hM * 6.0)));
      c = mix(c, vec3(0.07, 0.12, 0.03), mb * 0.85);
      c *= 0.82 + 0.22 * smoothstep(0.0, 0.7, v);
      diffuseColor.rgb = c;`,
    fRough: 'roughnessFactor = clamp(roughnessFactor + node * 0.3 + wax * 0.35 + bl * 0.4, 0.0, 1.0);',
    fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);',
  });
  const culmCols = [0x8a9a40, 0x7f9a3a, 0x93a04a, 0x6f8c34, 0xa49c52, 0x5f7c2e, 0x9aa858];
  const makeCulms = (list, geo, lod) => {
    const im = new THREE.InstancedMesh(geo, culmMat(lod), list.length);
    const a = new Float32Array(list.length * 4), c = new THREE.Color();
    list.forEach((k, i) => {
      _o.position.set(k.x, k.y, k.z); _o.rotation.set(k.lz, k.ph, -k.lx, 'XZY'); _o.scale.set(k.r, k.H, k.r); _o.updateMatrix();   // spin, then lean
      im.setMatrixAt(i, _o.matrix); k.matrix = _o.matrix.clone();
      im.setColorAt(i, c.set(culmCols[Math.floor(R() * culmCols.length)]).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08));
      a.set([k.x, k.z, k.H, k.ph], i * 4);
    });
    geo.setAttribute('aCulm', new THREE.InstancedBufferAttribute(a, 4));
    im.computeBoundingSphere(); im.matrixAutoUpdate = false; im.name = 'culms' + lod;
    root.add(im);
  };
  makeCulms(near, culmGeo(7, NODES, [0, 0.035, 0.965], 0.11), 0);
  makeCulms(mid, culmGeo(6, 6, [0, 0.5], 0), 1);
  makeCulms(far, culmGeo(5, 4, [0, 0.5], 0), 2);

  /* ---------------- leaf sprays (alpha-to-coverage cards, swaying with their culm, fluttering) ---------------- */
  const sprayGeo = (cards, segV) => {
    const parts = [];
    cards.forEach(([yaw, roll, s, tile]) => {
      const W = 1.35 * s, L = 1.75 * s;
      const g = new THREE.PlaneGeometry(W, L, 2, segV);
      const p = g.attributes.position, uvA = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), t = (L / 2 - p.getY(i)) / L;
        const out = t * L * 0.78, down = t * L * 0.38 + t * t * L * 0.42;
        p.setXYZ(i, out, -down, px);
        uvA.setXY(i, tile * 0.5 + uvA.getX(i) * 0.5, 0.5 + uvA.getY(i) * 0.5);
      }
      g.rotateX(roll); g.rotateY(yaw);
      g.computeVertexNormals();
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) { const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)); if (v.y < 0) v.negate(); v.multiplyScalar(0.45).add(new THREE.Vector3(0, 0.55, 0)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
      parts.push(g.toNonIndexed());
    });
    return mergeGeometries(parts);
  };
  const leafMat = inject(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.7, color: 0xffffff }), {
    key: 'spray', uniforms: { ...lampU(0.6), ...U_TIME },
    vHead: WIND + 'attribute vec4 aCulm; attribute float aF;',
    vBody: `{ vec3 bend = culmBend(aCulm, aF);
        float r = length(position);
        float fl = sin(uTime * 2.7 + aCulm.w * 5.0 + position.x * 2.1 + position.z * 1.7) + 0.5 * sin(uTime * 4.3 + aCulm.w * 3.0 + position.y * 3.0);
        vec2 w = windAt(aCulm.xy, aCulm.w);
        vec3 flut = vec3(w.x * 0.06, fl * 0.05, w.y * 0.06) * r + vec3(0.0, 0.0, fl * 0.035 * r);
        transformed += toLocal(bend + flut); }`,
    fHead: lampHead(NL),
    fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN) * 0.8;',
  });
  const makeSprays = (list, perCulm, geo, scale, name) => {
    const items = [];
    for (const k of list) {
      const n = perCulm(k);
      for (let j = 0; j < n; j++) {
        const f = 0.42 + (j + R() * 0.8) / n * 0.55;
        const p = new THREE.Vector3(0, f, 0).applyMatrix4(k.matrix);
        const s = scale * (0.85 + R() * 0.5) * (1.15 - f * 0.4) * Math.min(1.2, k.H / 17);
        items.push([p.x, p.y, p.z, R() * TAU, s, k, f]);
      }
    }
    const im = new THREE.InstancedMesh(geo, leafMat, items.length);
    const aC = new Float32Array(items.length * 4), aF = new Float32Array(items.length), c = new THREE.Color();
    items.forEach(([x, y, z, ry, s, k, f], i) => {
      _o.position.set(x, y, z); _o.rotation.set((R() - 0.5) * 0.3, ry, (R() - 0.5) * 0.3); _o.scale.setScalar(s); _o.updateMatrix();
      im.setMatrixAt(i, _o.matrix);
      im.setColorAt(i, c.setRGB(1, 1, 1).offsetHSL((R() - 0.5) * 0.05, -R() * 0.15, -R() * 0.22 - (k.dist > 40 ? 0.1 : 0)));
      aC.set([k.x, k.z, k.H, k.ph], i * 4); aF[i] = f;
    });
    geo.setAttribute('aCulm', new THREE.InstancedBufferAttribute(aC, 4));
    geo.setAttribute('aF', new THREE.InstancedBufferAttribute(aF, 1));
    im.computeBoundingSphere(); im.matrixAutoUpdate = false; im.name = name;
    root.add(im);
  };
  const cardsA = [[0, 0.2, 1, 0], [1.9, -0.9, 0.9, 1], [-1.8, 1.0, 0.85, 0]];
  makeSprays(near, (k) => 6 + Math.floor(R() * 3), sprayGeo(cardsA, 3), 1.0, 'spraysNear');
  makeSprays(mid, () => 4, sprayGeo(cardsA, 2), 1.15, 'spraysMid');
  makeSprays(far, () => 3, sprayGeo([[0, 0.2, 1, 0], [2.1, -1.0, 0.9, 1]], 2), 1.6, 'spraysFar');

  /* ---------------- distant layers: painted bamboo curtains melting into the haze ---------------- */
  {
    for (const [r, h, seed, k] of [[88, 34, 11, 0.8], [104, 40, 12, 0.6], [122, 46, 13, 0.45]]) {
      const t = curtainTexture(seed); t.repeat.set(Math.round(r / 12), 1);
      const g = new THREE.CylinderGeometry(r, r, h, 96, 1, true); g.translate(0, h / 2 - 1, 0); g.scale(1.25, 1, 1);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.BackSide, color: new THREE.Color(0.22, 0.26, 0.3).multiplyScalar(k), fog: true }));
      m.matrixAutoUpdate = false; m.name = 'curtain'; root.add(m);
    }
  }

  /* ---------------- ground cover: ferns, dwarf bamboo, rocks, fallen culms, shoots ---------------- */
  {
    const okG = (x, z) => !inClear(x, z, -1.2) && !walkBand(x, z) && !camCorr(x, z) && pathDist(x, z) > 1.1 && Math.abs(z - streamZ(x)) > streamW(x) / 2 + 0.2 &&
      Math.hypot(x - SH.x, z - SH.z) > 2.2 && Math.hypot(x - BA.x, z - BA.z) > 1.6;
    // fern: 7 arching frond cards
    const fronds = [];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.PlaneGeometry(0.42, 1.0, 1, 5);
      const p = g.attributes.position, uvA = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.5; p.setXYZ(i, p.getX(i), 0.55 * y - 0.28 * y * y + 0.02, y * 0.85); uvA.setXY(i, 0.5 + uvA.getX(i) * 0.5, uvA.getY(i) * 0.5); }
      g.rotateY((k / 7) * TAU + 0.3 * Math.sin(k * 3.1));
      fronds.push(g.toNonIndexed());
    }
    const fernG = mergeGeometries(fronds); fernG.computeVertexNormals();
    // dwarf bamboo: 3 crossed upright cards
    const sasa = [];
    for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(1.1, 1.0, 1, 1); g.translate(0, 0.5, 0); const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 0.5, uvA.getY(i) * 0.5); g.rotateY((k / 3) * Math.PI); sasa.push(g.toNonIndexed()); }
    const sasaG = mergeGeometries(sasa);
    for (const g of [fernG, sasaG]) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.4, 0.9, n.getZ(i) * 0.4); }
    const gcMat = inject(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 }), {
      key: 'ground', uniforms: { ...lampU(0.6), ...U_TIME },
      vHead: 'uniform float uTime;',
      vBody: `{ float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4; float hh = max(position.y, 0.0);
          transformed.x += sin(uTime * 1.6 + ph) * 0.05 * hh; transformed.z += cos(uTime * 1.3 + ph) * 0.04 * hh; }`,
      fHead: lampHead(NL), fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);',
    });
    const place = (geo, n, near0, s0, s1, name, col) => {
      const spots = [];
      for (let t = 0; t < n * 8 && spots.length < n; t++) {
        const nearC = R() < near0;
        const x = nearC ? (R() - 0.5) * (OX * 2 + 26) : (R() - 0.5) * 120, z = nearC ? (R() - 0.5) * (OZ * 2 + 24) : (R() - 0.5) * 100;
        if (okG(x, z)) spots.push([x, z]);
      }
      const im = new THREE.InstancedMesh(geo, gcMat, spots.length), c = new THREE.Color();
      spots.forEach(([x, z], i) => { _o.position.set(x, heightAt(x, z) - 0.02, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.setScalar(s0 + R() * (s1 - s0)); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, c.set(col).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.12)); });
      im.computeBoundingSphere(); im.matrixAutoUpdate = false; im.name = name; root.add(im);
      return spots;
    };
    place(fernG, 520, 0.6, 0.7, 1.5, 'ferns', 0xb8c8a0);
    place(sasaG, 700, 0.55, 0.6, 1.25, 'sasa', 0xc8d4a8);
    // rocks (mossy), fallen culms, shoots, moss mounds
    const rock = (seed) => {
      const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, RR = rng(seed);
      const k = [RR() * 9, RR() * 9, RR() * 9];
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); const d = 1 + 0.18 * Math.sin(v.x * 2.3 + k[0]) * Math.sin(v.y * 2.1 + k[1]) + 0.12 * Math.sin(v.z * 3.7 + k[2]); v.multiplyScalar(d); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g;
    };
    const rocks = [rock(1), rock(2), rock(3)];
    for (let i = 0; i < 70; i++) {
      const x = (R() - 0.5) * 100, z = (R() - 0.5) * 80;
      if (!okG(x, z)) continue;
      const s = 0.3 + R() * 0.7;
      put(stoneDark, P(rocks[i % 3], x, heightAt(x, z) + s * 0.05, z, R() * TAU, 0, 0, s * (1 + R() * 0.6), s * (0.45 + R() * 0.3), s));
    }
    // stream-side rocks
    for (let x = -60; x < 60; x += 1.1 + R() * 1.8) {
      for (const side of [-1, 1]) {
        if (R() < 0.45) continue;
        const z = streamZ(x) + side * (streamW(x) / 2 + (R() - 0.3) * 0.5);
        if (BR && Math.hypot(x - BR.x, z - BR.z) < 1.8) continue;
        const s = 0.18 + R() * 0.35;
        put(stoneDark, P(rocks[Math.floor(R() * 3)], x, STREAM_Y + s * 0.15, z, R() * TAU, 0, 0, s * 1.4, s * 0.6, s));
      }
    }
    const fallen = [], shoots = [];
    for (let i = 0; i < 60; i++) {
      const x = (R() - 0.5) * 110, z = (R() - 0.5) * 90;
      if (!okG(x, z) || inClear(x, z, 2)) continue;
      if (R() < 0.5) { const L = 3 + R() * 6, c = new THREE.CylinderGeometry(0.05, 0.06, L, 7, 4); c.rotateZ(Math.PI / 2); fallen.push(paint(P(c, x, heightAt(x, z) + 0.05, z, R() * TAU), R() < 0.5 ? 0x8a7a48 : 0x6a6a3a)); }
      else for (let k = 0; k < 3; k++) { const h = 0.4 + R() * 0.9, s = new THREE.ConeGeometry(0.07, h, 7); shoots.push(paint(P(s, x + (R() - 0.5) * 0.8, heightAt(x, z) + h / 2 - 0.05, z + (R() - 0.5) * 0.8, R() * TAU, (R() - 0.5) * 0.2), R() < 0.5 ? 0x6a5a2a : 0x5a6a2a)); }
    }
    for (const g of [...fallen, ...shoots]) put(vcMat, g);
  }

  /* ---------------- stepping-stone paths ---------------- */
  const stoneG = (() => {
    const g = new THREE.CylinderGeometry(1, 1.06, 1, 11, 1), p = g.attributes.position;
    const RR = rng(77); const jit = Array.from({ length: 12 }, () => 0.85 + RR() * 0.3);
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = Math.round(((a + Math.PI) / TAU) * 11) % 11; const r = Math.hypot(p.getX(i), p.getZ(i)); if (r > 0.01) { p.setX(i, p.getX(i) * jit[k]); p.setZ(i, p.getZ(i) * jit[k]); } }
    g.computeVertexNormals(); return g;
  })();
  for (const pl of [pathN, pathS]) for (const [x, z] of along(pl, 0.78)) {
    if (Math.abs(z) < OZ + 0.5) continue;
    if (Math.abs(z - streamZ(x)) < streamW(x) / 2 + 0.5) continue;
    const ox = (R() - 0.5) * 0.35, oz = (R() - 0.5) * 0.2;
    put(stoneM, P(stoneG, x + ox, heightAt(x + ox, z + oz) - 0.02, z + oz, R() * TAU, 0, 0, 0.32 + R() * 0.12, 0.1, 0.26 + R() * 0.1));
  }
  // spur to the shrine + the basin
  for (const [x, z] of along([[-0.4, -(OZ + 4.8)], [SH.x + 1.2, SH.z + 1.9]], 0.8)) put(stoneM, P(stoneG, x, heightAt(x, z) - 0.02, z, R() * TAU, 0, 0, 0.3, 0.1, 0.26));
  for (const [x, z] of along([[0.3, -(OZ + 5.5)], [BA.x - 1.0, BA.z + 0.2]], 0.8)) put(stoneM, P(stoneG, x, heightAt(x, z) - 0.02, z, R() * TAU, 0, 0, 0.28, 0.1, 0.24));

  /* ---------------- bridge: two granite slabs on rubble piers ---------------- */
  if (BR) {
    const ry = Math.atan2(BR.dx, BR.dz), L = streamW(BR.x) + 2.0;
    for (const s of [-0.29, 0.29]) {
      const g = new THREE.BoxGeometry(0.56, 0.16, L, 2, 1, 6), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const zz = p.getZ(i) / (L / 2); p.setY(i, p.getY(i) + 0.08 * (1 - zz * zz)); }
      g.computeVertexNormals();
      put(stoneM, P(g, BR.x + Math.cos(ry) * s, -0.02, BR.z - Math.sin(ry) * s, ry));
    }
    for (const e of [-1, 1]) put(stoneDark, P(new THREE.BoxGeometry(1.5, 0.5, 0.5), BR.x + BR.dx * e * (L / 2 - 0.35), -0.33, BR.z + BR.dz * e * (L / 2 - 0.35), ry));
  }

  /* ---------------- stone lanterns (tōrō) ---------------- */
  {
    const parts = [], paper = [];
    const hex = (rt, rb, h, y) => { const g = new THREE.CylinderGeometry(rt, rb, h, 6); g.translate(0, y + h / 2, 0); return g; };
    // base, pole, platform
    parts.push(hex(0.3, 0.34, 0.12, 0), lathe([[0.0, 0.12], [0.3, 0.12], [0.26, 0.2], [0.17, 0.24], [0.0, 0.24]], 12));
    const pole = new THREE.CylinderGeometry(0.095, 0.11, 0.48, 12); pole.translate(0, 0.48, 0); parts.push(pole);
    parts.push(lathe([[0.0, 0.7], [0.12, 0.7], [0.22, 0.75], [0.25, 0.8], [0.0, 0.8]], 12), hex(0.25, 0.26, 0.06, 0.8));
    // light box: six corner posts, top and bottom plates; a glowing paper prism inside
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const b = new THREE.BoxGeometry(0.05, 0.3, 0.05); b.translate(Math.cos(a) * 0.17, 1.01, Math.sin(a) * 0.17); b.rotateY(0); parts.push(b); }
    parts.push(hex(0.2, 0.21, 0.04, 0.86));
    const paperG = new THREE.CylinderGeometry(0.135, 0.135, 0.26, 6); paperG.translate(0, 1.0, 0); paper.push(paperG);
    // roof (kasa) with upturned corners, and the jewel (hōju)
    const roof = new THREE.CylinderGeometry(0.06, 0.4, 0.17, 12, 1); const rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) { const r = Math.hypot(rp.getX(i), rp.getZ(i)); if (r > 0.3) { const a = Math.atan2(rp.getZ(i), rp.getX(i)); const corner = Math.pow(Math.abs(Math.cos(a * 3)), 6); rp.setY(i, rp.getY(i) + corner * 0.07); rp.setX(i, rp.getX(i) * (1 + corner * 0.08)); rp.setZ(i, rp.getZ(i) * (1 + corner * 0.08)); } }
    roof.computeVertexNormals(); roof.translate(0, 1.27, 0); parts.push(roof, hex(0.38, 0.38, 0.03, 1.16));
    parts.push(lathe([[0, 1.35], [0.07, 1.36], [0.1, 1.42], [0.08, 1.48], [0.03, 1.54], [0, 1.58]], 12));
    const body = mergeAll(parts), glow = mergeAll(paper);
    for (const l of stoneLanterns) {
      const y = heightAt(l.x, l.z) - 0.04;
      put(stoneM, P(body, l.x, y, l.z, l.ry, 0, 0, l.s));
      put(glowM, P(glow, l.x, y, l.z, l.ry, 0, 0, l.s));
    }
  }

  /* ---------------- paper lanterns (chōchin) on bamboo stands, swinging gently ---------------- */
  {
    const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([0.035 + Math.sin(t * Math.PI) * 0.15, -0.06 - t * 0.38]); }
    const body = lathe(prof.reverse(), 16);
    const caps = mergeAll([P(new THREE.CylinderGeometry(0.075, 0.08, 0.05, 12), 0, -0.05, 0), P(new THREE.CylinderGeometry(0.08, 0.075, 0.05, 12), 0, -0.46, 0), P(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4), 0, -0.01, 0)]);
    const swing = (m, key, noWorld = false) => inject(m, {
      key, noWorld, uniforms: { ...U_TIME },
      vHead: 'uniform float uTime;',
      vBody: `{ float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float ax = sin(uTime * 1.1 + ph) * 0.06, az = sin(uTime * 0.83 + ph * 1.3) * 0.05;
          float y = transformed.y;
          transformed.x += -y * sin(az); transformed.z += y * sin(ax); }`,
    });
    const paperM = swing(new THREE.MeshBasicMaterial({ map: paperTexture(), color: new THREE.Color(1.0, 0.8, 0.62).multiplyScalar(1.35) }), 'paper', true);
    const capM = swing(new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6 }), 'cap');
    const n = paperLanterns.length;
    const ib = new THREE.InstancedMesh(body, paperM, n), ic = new THREE.InstancedMesh(caps, capM, n), c = new THREE.Color();
    const posts = [];
    paperLanterns.forEach((l, i) => {
      const y0 = heightAt(l.x, l.z), top = y0 + (l.high ? 2.3 : 1.8);
      _o.position.set(l.x, top, l.z); _o.rotation.set(0, l.ry, 0); _o.scale.setScalar(l.high ? 1.15 : 1); _o.updateMatrix();
      ib.setMatrixAt(i, _o.matrix); ic.setMatrixAt(i, _o.matrix);
      ib.setColorAt(i, c.set(i % 3 === 0 ? 0xffd8c0 : i % 3 === 1 ? 0xffb090 : 0xfff0d0));
      // the stand: a bamboo post with an arm
      const ax = Math.cos(l.ry) * 0.55, az = -Math.sin(l.ry) * 0.55;
      posts.push(paint(P(new THREE.CylinderGeometry(0.035, 0.04, top + 0.25 - y0, 7), l.x + ax, (top + 0.25 + y0) / 2, l.z + az), 0x8a7a40));
      const arm = new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6); arm.rotateZ(Math.PI / 2);
      posts.push(paint(P(arm, l.x + ax / 2, top + 0.12, l.z + az / 2, l.ry), 0x8a7a40));
      posts.push(paint(P(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3), l.x, top + 0.06, l.z), 0x222222));
    });
    for (const g of posts) put(vcMat, g);
    for (const m of [ib, ic]) { m.computeBoundingSphere(); m.matrixAutoUpdate = false; root.add(m); }
    ib.name = 'paperLanterns';
  }

  /* ---------------- the spirit house ---------------- */
  {
    const parts = { vc: [], gold: [], stone: [], glow: [], soft: [] };
    const RED = 0x8e1f18, CREAM = 0xefe2c4, GREEN = 0x2a5a36, TILE = 0x9a2a1c, WOOD = 0x5a3a22;
    const sx = SH.x, sz = SH.z, y0 = heightAt(sx, sz) - 0.04;
    const L = (geo, x, y, z, ry = 0, rx = 0, rz = 0) => P(geo, sx + x, y0 + y, sz + z, ry, rx, rz);
    // plinth: two mossy stone tiers + a step
    parts.stone.push(L(new THREE.BoxGeometry(2.7, 0.28, 2.3), 0, 0.14, 0), L(new THREE.BoxGeometry(2.05, 0.22, 1.75), 0, 0.39, -0.05), L(new THREE.BoxGeometry(1.1, 0.14, 0.4), 0, 0.07, 1.32));
    // pillar (red lacquer, gold bands), capital and the house floor
    parts.vc.push(paint(L(new THREE.BoxGeometry(0.34, 1.3, 0.34), 0, 1.15, -0.2), RED));
    for (const y of [0.56, 0.9, 1.68]) parts.gold.push(L(new THREE.BoxGeometry(0.38, 0.05, 0.38), 0, y, -0.2));
    parts.gold.push(L(lathe([[0.0, 0], [0.24, 0], [0.34, 0.1], [0.5, 0.16], [0.0, 0.16]], 4), 0, 1.78, -0.2, Math.PI / 4));
    parts.vc.push(paint(L(new THREE.BoxGeometry(1.36, 0.07, 1.2), 0, 1.97, -0.15), RED));
    parts.gold.push(L(new THREE.BoxGeometry(1.42, 0.03, 1.26), 0, 1.94, -0.15));
    // balustrade round the floor
    for (const [w, d, x, z] of [[1.3, 0.03, 0, 0.42], [1.3, 0.03, 0, -0.72], [0.03, 1.14, -0.65, -0.15], [0.03, 1.14, 0.65, -0.15]]) {
      if (z === 0.42) { for (const xx of [-0.45, 0.45]) parts.gold.push(L(new THREE.BoxGeometry(0.4, 0.03, 0.03), xx, 2.12, z)); }
      else parts.gold.push(L(new THREE.BoxGeometry(w, 0.03, d), x, 2.12, z));
    }
    for (let k = 0; k < 14; k++) { const t = k / 13; const pts = [[-0.65 + 1.3 * t, 0.42], [-0.65 + 1.3 * t, -0.72], [-0.65, 0.42 - 1.14 * t], [0.65, 0.42 - 1.14 * t]]; for (const [x, z] of pts) if (!(z === 0.42 && Math.abs(x) < 0.22)) parts.gold.push(L(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), x, 2.06, z)); }
    // walls + glowing door and windows
    parts.vc.push(paint(L(new THREE.BoxGeometry(0.78, 0.66, 0.66), 0, 2.33, -0.3), CREAM));
    parts.glow.push(L(new THREE.PlaneGeometry(0.26, 0.42), 0, 2.25, 0.035));
    for (const s of [-1, 1]) parts.soft.push(L(new THREE.PlaneGeometry(0.16, 0.22), s * 0.395, 2.36, -0.3, s * Math.PI / 2));
    for (const [w, h, x, y] of [[0.36, 0.04, 0, 2.48], [0.04, 0.48, -0.16, 2.25], [0.04, 0.48, 0.16, 2.25], [0.4, 0.05, 0, 2.03]]) parts.gold.push(L(new THREE.BoxGeometry(w, h, 0.03), x, y, 0.035));
    parts.gold.push(L(lathe([[0, 0], [0.05, 0], [0.06, 0.04], [0.035, 0.09], [0.045, 0.12], [0.02, 0.18], [0, 0.2]], 10), 0, 2.03, 0.1));   // the guardian figure
    // porch: four red columns with gilt capitals, porch floor
    for (const x of [-0.33, 0.33]) for (const z of [0.12, 0.36]) { parts.vc.push(paint(L(new THREE.CylinderGeometry(0.028, 0.03, 0.56, 8), x, 2.28, z), RED)); parts.gold.push(L(lathe([[0, 0], [0.05, 0], [0.04, 0.05], [0, 0.05]], 8), x, 2.55, z)); }
    // roof: two tiers of steep gables (red tiles, green border), gilt bargeboards, chofa finials, a gilt spire
    const gable = (half, rise, len, y, zc, scale = 1) => {
      const ang = Math.atan2(rise, half), sl = Math.hypot(half, rise) + 0.08;
      for (const s of [-1, 1]) {
        parts.vc.push(paint(L(new THREE.BoxGeometry(sl, 0.035, len), s * half / 2, y + rise / 2, zc, 0, 0, -s * ang), TILE));
        parts.vc.push(paint(L(new THREE.BoxGeometry(0.06, 0.04, len + 0.01), s * (half + 0.02), y - 0.01, zc, 0, 0, -s * ang), GREEN));
        for (const e of [-1, 1]) {                                                     // gilt bargeboard along each gable edge
          parts.gold.push(L(new THREE.BoxGeometry(sl, 0.05, 0.035), s * half / 2, y + rise / 2 + 0.025, zc + e * (len / 2 + 0.02), 0, 0, -s * ang));
          const curl = new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI * 1.3); parts.gold.push(L(curl, s * (half + 0.04), y + 0.02, zc + e * (len / 2 + 0.02), 0, 0, s > 0 ? 0 : Math.PI));   // hang hong
        }
      }
      for (const e of [-1, 1]) {                                                       // gilt gable face + chofa horn
        const tri = new THREE.Shape(); tri.moveTo(-half * 0.92, 0); tri.lineTo(half * 0.92, 0); tri.lineTo(0, rise * 0.92); tri.closePath();
        const tg = new THREE.ShapeGeometry(tri); if (e < 0) tg.rotateY(Math.PI);
        parts.gold.push(L(tg, 0, y + 0.02, zc + e * (len / 2 + 0.005)));
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, e * 0.03), new THREE.Vector3(0, 0.2, e * 0.12), new THREE.Vector3(0, 0.19, e * 0.2)]);
        parts.gold.push(L(new THREE.TubeGeometry(curve, 8, 0.016 * scale, 5), 0, y + rise + 0.01, zc + e * (len / 2 + 0.01)));
      }
      parts.gold.push(L(new THREE.BoxGeometry(0.04, 0.04, len + 0.02), 0, y + rise + 0.01, zc));
    };
    gable(0.58, 0.42, 1.12, 2.62, -0.12, 1);
    gable(0.44, 0.5, 0.86, 2.86, -0.12, 0.9);
    parts.gold.push(L(lathe([[0, 0], [0.1, 0], [0.11, 0.05], [0.08, 0.08], [0.09, 0.12], [0.06, 0.16], [0.07, 0.2], [0.045, 0.25], [0.05, 0.3], [0.025, 0.42], [0.012, 0.55], [0, 0.66]], 12), 0, 3.32, -0.12));
    // offerings on the plinth: red soda bottles with straws, fruit, an incense urn, candles, zebras + elephants, marigolds
    const OY = 0.5;
    for (let k = 0; k < 5; k++) {
      const x = -0.55 + k * 0.1, z = 0.62;
      parts.soft.push(L(new THREE.CylinderGeometry(0.028, 0.03, 0.17, 8), x, OY + 0.085, z));   // (lit from within by the candles)
      parts.vc.push(paint(L(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3), x + 0.01, OY + 0.2, z, 0, 0, 0.2), 0xf0f0f0));
    }
    for (const g of parts.soft.slice(-5)) g.userData.red = true;
    parts.vc.push(paint(L(new THREE.CylinderGeometry(0.17, 0.12, 0.04, 14), 0.42, OY + 0.02, 0.55), 0xc8a050));     // fruit plate
    for (let k = 0; k < 6; k++) parts.vc.push(paint(L(new THREE.SphereGeometry(0.045, 8, 6), 0.42 + Math.cos(k) * 0.08, OY + 0.07 + (k > 3 ? 0.05 : 0), 0.55 + Math.sin(k) * 0.08), 0xe8861a));
    for (let k = 0; k < 4; k++) { const b = new THREE.CapsuleGeometry(0.018, 0.13, 3, 6); parts.vc.push(paint(L(b, 0.36 + k * 0.025, OY + 0.1, 0.48, 0.4, 0, 1.2 + k * 0.1), 0xe8c838)); }
    parts.vc.push(paint(L(new THREE.SphereGeometry(0.075, 10, 8), 0.58, OY + 0.07, 0.62), 0x6a4a2a));
    parts.gold.push(L(lathe([[0, 0], [0.07, 0], [0.11, 0.06], [0.12, 0.11], [0.1, 0.13], [0, 0.13]], 14), 0, OY, 0.62));   // incense urn
    const incense = [];
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9, x = Math.cos(a) * 0.05, z = 0.62 + Math.sin(a) * 0.05, tilt = (k - 3) * 0.06;
      parts.vc.push(paint(L(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 3), x, OY + 0.25, z, 0, 0, tilt), 0xb0402a));
      parts.glow.push(L(new THREE.SphereGeometry(0.008, 5, 4), x - Math.sin(tilt) * 0.14, OY + 0.39, z));
      incense.push([sx + x - Math.sin(tilt) * 0.14, y0 + OY + 0.4, sz + z]);
    }
    const candles = [];
    for (const [x, z] of [[-0.82, 0.55], [0.82, 0.55], [-0.25, 0.75], [0.25, 0.75]]) {
      parts.vc.push(paint(L(new THREE.CylinderGeometry(0.022, 0.024, 0.13, 10), x, OY + 0.065, z), 0xf2ead8));
      candles.push([sx + x, y0 + OY + 0.15, sz + z]);
    }
    // zebra + elephant figurines
    const animal = (x, z, ry, col, trunk) => {
      const g = [P(new THREE.CapsuleGeometry(0.045, 0.1, 3, 8), 0, 0.12, 0, 0, 0, Math.PI / 2), P(new THREE.SphereGeometry(trunk ? 0.05 : 0.032, 8, 6), 0.1, trunk ? 0.16 : 0.2, 0)];
      for (const lx of [-0.05, 0.05]) for (const lz of [-0.025, 0.025]) g.push(P(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 5), lx, 0.04, lz));
      if (trunk) g.push(P(new THREE.CylinderGeometry(0.012, 0.018, 0.1, 5), 0.14, 0.1, 0, 0, 0, 0.3));
      else g.push(P(new THREE.CylinderGeometry(0.016, 0.02, 0.09, 5), 0.075, 0.17, 0, 0, 0, -0.7));
      parts.vc.push(paint(L(mergeAll(g), x, OY, z, ry), col));
    };
    animal(-0.75, 0.25, -0.4, 0xf2f2ee, false); animal(-0.5, 0.15, -0.2, 0xf2f2ee, false); animal(0.72, 0.25, Math.PI + 0.4, 0x8a8a8a, true); animal(0.52, 0.1, Math.PI + 0.2, 0x8a8a8a, true);
    // garlands (phuang malai): loops of jasmine beads with marigold + rose tassels
    const bead = new THREE.IcosahedronGeometry(0.018, 0);
    const garland = (x, y, z, r, n, ry = 0) => {
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU; parts.vc.push(paint(L(bead, x + Math.cos(ry) * Math.sin(a) * r, y - (1 - Math.cos(a)) * r * 1.3, z - Math.sin(ry) * Math.sin(a) * r), k % 7 === 0 ? 0xe8402a : 0xf6f2e0)); }
      for (let k = 0; k < 5; k++) parts.vc.push(paint(L(new THREE.SphereGeometry(0.024, 6, 5), x, y - 2.6 * r - 0.03 - k * 0.04, z), k < 2 ? 0xff9a1a : 0xd81a3a));
    };
    garland(0, 1.6, -0.02, 0.1, 22);
    for (const x of [-0.33, 0.33]) garland(x, 2.5, 0.38, 0.06, 16);
    for (const x of [-0.72, 0.72]) garland(x, 2.0, 0.43, 0.08, 18);
    // marigold heaps on the plinth corners
    for (const [x, z] of [[-0.9, 0.85], [0.9, 0.85]]) for (let k = 0; k < 9; k++) parts.vc.push(paint(L(new THREE.SphereGeometry(0.035, 6, 5), x + (R() - 0.5) * 0.14, 0.53 + R() * 0.04, z + (R() - 0.5) * 0.1), R() < 0.6 ? 0xff9010 : 0xffc020));
    for (const g of parts.vc) put(vcMat, g);
    for (const g of parts.gold) put(goldM, g);
    for (const g of parts.stone) put(stoneM, g);
    for (const g of parts.glow) put(glowM, g);
    const redGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a20).multiplyScalar(0.9) });
    for (const g of parts.soft) put(g.userData.red ? redGlow : glowSoft, g);
    // candle flames: flicker in the vertex shader
    {
      const fl = [];
      candles.forEach(([x, y, z], i) => { const g = new THREE.ConeGeometry(0.014, 0.05, 6); g.translate(0, 0.025, 0); const sd = new Float32Array(g.attributes.position.count).fill(i * 1.7); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1)); const b = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < b.length; k += 3) b.set([x, y, z], k); g.setAttribute('aBase', new THREE.BufferAttribute(b, 3)); g.translate(x, y, z); fl.push(g.toNonIndexed()); });
      const fm = new THREE.ShaderMaterial({ uniforms: { uTime }, vertexShader: `uniform float uTime; attribute float aSeed; attribute vec3 aBase; varying float vH;
          void main() { vec3 d = position - aBase; vH = d.y / 0.05; float k = 1.0 + 0.18 * sin(uTime * 17.0 + aSeed) + 0.1 * sin(uTime * 29.0 + aSeed * 3.0);
            d.y *= k; d.x += sin(uTime * 7.0 + aSeed) * 0.004 * vH; gl_Position = projectionMatrix * modelViewMatrix * vec4(aBase + d, 1.0); }`,
        fragmentShader: 'varying float vH; void main() { gl_FragColor = vec4(mix(vec3(3.0, 1.6, 0.5), vec3(2.2, 2.0, 1.4), clamp(vH, 0.0, 1.0)), 1.0); }' });
      const m = new THREE.Mesh(mergeGeometries(fl), fm); m.frustumCulled = false; root.add(m);
    }
    // incense smoke curling up
    {
      const per = 10, n = incense.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos.set(incense[Math.floor(i / per)], i * 3); sd[i] = R(); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uMap: { value: softTexture(0, 64) } },
        vertexShader: `uniform float uTime; attribute float seed; varying float vA;
          void main(){ float life = 8.0; float t = mod(uTime + seed * life, life) / life;
            vec3 p = position + vec3(sin(uTime * 0.6 + seed * 20.0 + t * 5.0) * 0.18 * t + t * 0.25, t * 2.4, cos(uTime * 0.5 + seed * 13.0 + t * 4.0) * 0.18 * t);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            vA = smoothstep(0.0, 0.12, t) * (1.0 - t) * 0.09; gl_PointSize = (0.12 + t * 0.8) * 700.0 / max(-mv.z, 0.5); }`,
        fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.78, 0.78, 0.84) * a, a); }` });
      const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
    }
  }

  /* ---------------- water basin (tsukubai) + bamboo spout + shishi-odoshi ---------------- */
  let shishi = null;
  {
    const bx = BA.x, bz = BA.z, y0 = heightAt(bx, bz) - 0.05;
    put(stoneDark, P(lathe([[0.0, 0], [0.5, 0], [0.56, 0.12], [0.55, 0.32], [0.48, 0.42], [0.36, 0.43], [0.34, 0.36], [0.0, 0.33]], 18), bx, y0, bz, 0.3));
    // flat stones in front, the spout post and pipe
    put(stoneM, P(stoneG, bx - 0.3, y0 + 0.02, bz + 0.8, 0.5, 0, 0, 0.42, 0.12, 0.32));
    put(vcMat, paint(P(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 8), bx + 0.95, y0 + 0.5, bz - 0.2), 0x7a6a38));
    const pipe = new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8); pipe.rotateZ(Math.PI / 2 - 0.12);
    put(vcMat, paint(P(pipe, bx + 0.55, y0 + 0.82, bz - 0.15, 0.25), 0x8a9a48));
    // water surface + a thin trickle; ripples ring out where the drop lands
    const wm = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime, uSky: { value: new THREE.Color(0x2a3456) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uSky; varying vec2 vP;
        void main(){ vec2 c = vP - vec2(0.12, 0.05); float d = length(c);
          float rip = 0.0; for (int i = 0; i < 3; i++) { float t = fract(uTime * 0.45 + float(i) / 3.0); rip += sin((d - t * 0.4) * 60.0) * exp(-abs(d - t * 0.4) * 25.0) * (1.0 - t); }
          vec3 col = uSky * (0.55 + 0.25 * rip) + vec3(0.9, 0.55, 0.25) * 0.08 * (1.0 + rip);
          gl_FragColor = vec4(col, 0.92); }` });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), wm); disc.rotation.x = -Math.PI / 2; disc.position.set(bx, y0 + 0.4, bz); root.add(disc);
    const trick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.5, depthWrite: false }));
    trick.position.set(bx + 0.13, y0 + 0.6, bz - 0.05); root.add(trick);
    // shishi-odoshi: a bamboo tube on a pivot that fills from a second spout, tips, and clacks back onto its stone
    const sx = bx - 1.3, sz = bz - 0.6, sy = heightAt(sx, sz);
    for (const e of [-1, 1]) put(vcMat, paint(P(new THREE.CylinderGeometry(0.04, 0.045, 0.6, 7), sx, sy + 0.3, sz + e * 0.12), 0x7a6a38));
    put(vcMat, paint(P(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), sx, sy + 0.45, sz, 0, Math.PI / 2), 0x5a4a28));
    put(stoneDark, P(stoneG, sx + 0.55, sy, sz, 0.2, 0, 0, 0.22, 0.12, 0.18));
    const tube = new THREE.CylinderGeometry(0.055, 0.055, 1.0, 10); tube.rotateZ(Math.PI / 2); tube.translate(0.1, 0, 0);
    const cut = new THREE.CylinderGeometry(0.05, 0.05, 0.002, 10); cut.rotateZ(Math.PI / 2 + 0.6); cut.translate(-0.4, 0.01, 0);
    shishi = new THREE.Mesh(mergeAll([paint(tube, 0x9aa84a), paint(cut, 0x2a2a18)]), vcMat);
    shishi.position.set(sx, sy + 0.45, sz); root.add(shishi);
  }

  /* ---------------- the stream ---------------- */
  {
    const segs = 260, pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const x = -75 + (150 * i) / segs, z = streamZ(x), w = streamW(x) / 2 + 0.25;
      pos.push(x, STREAM_Y, z - w, x, STREAM_Y, z + w); uv.push(x * 0.25, 0, x * 0.25, 1);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nt = texLoader.load('assets/pond/water_nor.jpg'); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(1, 1);
    const wmat = inject(new THREE.MeshStandardMaterial({ color: 0x0b1416, roughness: 0.06, metalness: 0.0, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 }), {
      key: 'stream', uniforms: { ...lampU(0.25) }, fHead: lampHead(NL), fEmis: 'totalEmissiveRadiance += vec3(0.04, 0.05, 0.06) * lampLight(vWP, vec3(0.0, 1.0, 0.0));',
    });
    const m = new THREE.Mesh(g, wmat); m.receiveShadow = true; m.name = 'stream'; root.add(m);
    ticks.push((t) => { nt.offset.set(-t * 0.09, Math.sin(t * 0.3) * 0.02); });
  }

  /* ---------------- moonlight: god-ray shafts slanting down through the canopy ---------------- */
  {
    const shafts = [];
    const shaftOk = (x, z, L) => { for (let s = 0; s <= 1.001; s += 0.1) { const p = new THREE.Vector3(x, 0, z).addScaledVector(MOON, L * s); if (inClear(p.x, p.z, -1.5) || !offAxis(p.x, p.z, 26)) return false; } return true; };
    for (let i = 0; i < 400 && shafts.length < 11; i++) {
      const x = (R() - 0.5) * 70, z = (R() < 0.6 ? -1 : 1) * (OZ + 5 + R() * 26);
      const L = (14 + R() * 8) / MOON.y;
      if (!shaftOk(x, z, L) || shafts.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      shafts.push({ x, z, y: heightAt(x, z), L, w: 0.7 + R() * 1.4, k: 0.55 + R() * 0.45 });
    }
    const pools = root.userData.pools;
    shafts.forEach((s, i) => { if (i < 12) pools.push(new THREE.Vector4(s.x + MOON.x * 0.4, s.z + MOON.z * 0.4, s.w * 1.2, 0.12 * s.k)); });
    while (pools.length < 12) pools.push(new THREE.Vector4(0, 0, 1, 0));
    const pos = [], dat = [], ax = [], idx = [];
    shafts.forEach((s, i) => {
      for (const [a, b] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { pos.push(s.x, s.y, s.z); dat.push(a, b, s.w, i * 7.3); ax.push(s.L, s.k, 0); }
      const o = i * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aD', new THREE.Float32BufferAttribute(dat, 4)); g.setAttribute('aL', new THREE.Float32BufferAttribute(ax, 3)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime, uDir: { value: MOON } },
      vertexShader: `uniform vec3 uDir; attribute vec4 aD; attribute vec3 aL; varying vec3 vS; varying float vK; varying float vFade;
        void main() {
          float s = aD.x; vec3 c = position + uDir * aL.x * s;
          vec3 toCam = cameraPosition - c; vec3 side = cross(uDir, toCam);
          side = dot(side, side) > 1e-8 ? normalize(side) : vec3(1.0, 0.0, 0.0);
          float w = aD.z * (1.0 + s * 0.5);
          vec3 p = c + side * aD.y * w;
          vS = vec3(aD.y, s, aD.w); vK = aL.y;
          // fade out when the camera is inside or very close to the shaft, or looking straight along it
          vec3 tc = cameraPosition - (position + uDir * dot(cameraPosition - position, uDir));
          float dt = dot(toCam, toCam);
          vFade = smoothstep(1.5, 6.0, length(tc)) * (1.0 - smoothstep(0.85, 0.98, abs(dot(uDir, toCam) * inversesqrt(max(dt, 1e-6)))));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uTime; varying vec3 vS; varying float vK; varying float vFade;
        ${NOISE}
        void main() {
          float across = exp(-vS.x * vS.x * 3.2);
          float along = smoothstep(0.0, 0.08, vS.y) * (1.0 - smoothstep(0.55, 1.0, vS.y));
          float n = 0.55 + 0.45 * vn(vec2(vS.x * 2.5 + vS.z, vS.y * 6.0 - uTime * 0.06)) * vn(vec2(vS.x * 5.0 - vS.z, vS.y * 2.0 + uTime * 0.04));
          float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vS.z);
          float a = across * along * n * flick * vK * vFade * 0.16;
          gl_FragColor = vec4(vec3(0.62, 0.74, 1.0) * a, a);
        }` });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'moonShafts'; root.add(mesh);
    // motes drifting in the shafts
    const n = shafts.length * 26, mp = new Float32Array(n * 3), ms = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = shafts[i % shafts.length], t = 0.05 + R() * 0.5, j = (R() - 0.5) * s.w * 0.9; const p = new THREE.Vector3(s.x + j, s.y, s.z + (R() - 0.5) * s.w * 0.9).addScaledVector(MOON, s.L * t); mp.set([p.x, p.y, p.z], i * 3); ms[i] = R(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('seed', new THREE.BufferAttribute(ms, 1));
    const mm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ vec3 p = position + vec3(sin(uTime * 0.2 + seed * 40.0) * 0.4, sin(uTime * 0.13 + seed * 20.0) * 0.6, cos(uTime * 0.17 + seed * 30.0) * 0.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.25 + 0.2 * sin(uTime * 1.3 + seed * 60.0); gl_PointSize = clamp(40.0 / max(-mv.z, 0.5), 1.0, 6.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a); }` });
    const mpts = new THREE.Points(mg, mm); mpts.frustumCulled = false; root.add(mpts);
  }

  /* ---------------- mist: low drifting ground mist in the grove + soft banks between the culm layers ---------------- */
  {
    const mist = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uC: { value: new THREE.Vector4(OX + CL, OZ + CL, CAMX, OZ) }, uCol: { value: new THREE.Color(0x5a6a8a) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec4 uC; uniform vec3 uCol; varying vec3 vW;
        ${NOISE}
        void main(){
          vec2 q = vW.xz;
          float out0 = max(abs(q.x) - uC.x, abs(q.y) - uC.y);
          float m = smoothstep(-1.0, 6.0, out0);
          float n = fbm2(q * 0.06 + vec2(uTime * 0.012, uTime * 0.007) + vW.y * 3.1);
          n = smoothstep(0.38, 0.85, n);
          float far = smoothstep(150.0, 60.0, length(q));
          float axis = smoothstep(0.3, 0.55, abs(q.y) / (abs(q.x) + uC.z));            // thinner behind the ends (the ball's backdrop)
          float a = m * n * far * 0.22 * mix(0.3, 1.0, axis);
          gl_FragColor = vec4(uCol, a);
        }` });
    for (const y of [0.25, 0.8, 1.6]) {
      const g = new THREE.PlaneGeometry(320, 280, 1, 1); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mist); m.position.y = y; m.renderOrder = 1; m.name = 'mist'; m.frustumCulled = false; root.add(m);
    }
    // soft mist banks (big faint sprites) deeper in the grove
    const n = 160, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x, z;
      for (let t = 0; t < 30; t++) { const a = R() * TAU, d = 16 + R() * 60; x = Math.cos(a) * (OX + d); z = Math.sin(a) * (OZ + d * 0.9); if (!inClear(x, z, 4)) break; }
      pos.set([x, heightAt(x, z) + 0.8 + R() * 3.5, z], i * 3); sd[i] = R();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uMap: { value: softTexture(0, 64) } },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ vec3 p = position + vec3(sin(uTime * 0.03 + seed * 30.0) * 3.0, sin(uTime * 0.05 + seed * 9.0) * 0.4, cos(uTime * 0.025 + seed * 20.0) * 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = (0.05 + 0.04 * seed) * smoothstep(6.0, 18.0, -mv.z); gl_PointSize = min(700.0, (7.0 + seed * 7.0) * 700.0 / max(-mv.z, 1.0)); }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.36, 0.42, 0.56) * a, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.renderOrder = 1; root.add(p);
  }

  /* ---------------- falling bamboo leaves ---------------- */
  {
    const n = 420, spawn = [];
    for (let t = 0; t < 6000 && spawn.length < n; t++) {
      const x = (R() - 0.5) * 70, z = (R() - 0.5) * 56;
      if (inClear(x, z, -1.0) || camCorr(x, z) || !offAxis(x, z, 18)) continue;
      spawn.push([x, z, 6 + R() * 12, R()]);
    }
    const lg = new THREE.PlaneGeometry(0.035, 0.17, 1, 2); const lp = lg.attributes.position;
    for (let i = 0; i < lp.count; i++) lp.setZ(i, Math.abs(lp.getX(i)) * 0.6 + lp.getY(i) * lp.getY(i) * 0.8);
    lg.computeVertexNormals();
    const im = new THREE.InstancedMesh(lg, null, spawn.length);
    const a = new Float32Array(spawn.length * 4); spawn.forEach((s, i) => a.set(s, i * 4));
    lg.setAttribute('aS', new THREE.InstancedBufferAttribute(a, 4));
    const c = new THREE.Color();
    for (let i = 0; i < spawn.length; i++) { im.setMatrixAt(i, _m.identity()); im.setColorAt(i, c.set(R() < 0.6 ? 0xb8a85a : 0x7a9a3a).offsetHSL(0, 0, (R() - 0.5) * 0.15)); }
    im.material = inject(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 }), {
      key: 'fall', uniforms: { ...lampU(0.6), ...U_TIME },
      vHead: WIND + 'attribute vec4 aS; varying float vVis;',
      vBody: `{ float T = 14.0 + aS.w * 8.0; float t = fract(uTime / T + aS.w * 13.0);
          float a1 = uTime * (1.6 + aS.w * 2.0) + aS.w * 40.0, a2 = uTime * (1.1 + aS.w) + aS.w * 17.0;
          mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a1), sin(a1), 0.0, -sin(a1), cos(a1));
          mat3 ry = mat3(cos(a2), 0.0, -sin(a2), 0.0, 1.0, 0.0, sin(a2), 0.0, cos(a2));
          vec2 w = windAt(aS.xy, aS.w * 6.0);
          vec3 c = vec3(aS.x + sin(t * 9.0 + aS.w * 30.0) * 0.6 + w.x * t * 2.5, aS.z * (1.0 - t) - 0.1, aS.y + cos(t * 7.0 + aS.w * 20.0) * 0.6 + w.y * t * 2.5);
          vVis = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.93, 1.0, t));
          transformed = c + ry * rx * transformed * vVis;
          objectNormal = ry * rx * objectNormal; }`,
      fHead: lampHead(NL), fEmis: 'totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWP, vWN);',
    });
    im.frustumCulled = false; im.name = 'fallingLeaves'; root.add(im);
  }

  /* ---------------- fireflies: along the grove edges, the stream and the shrine (never over the court or behind the ends) ---------------- */
  {
    const pts = [];
    for (let t = 0; t < 9000 && pts.length < 340; t++) {
      const x = (R() - 0.5) * 80, z = (R() - 0.5) * 64;
      if (inClear(x, z, -2.5) || camCorr(x, z) || !offAxis(x, z, 26)) continue;
      const nearStream = Math.abs(z - streamZ(x)) < 4, nearShrine = Math.hypot(x - SH.x, z - SH.z) < 6;
      if (!nearStream && !nearShrine && R() < 0.35) continue;
      pts.push(x, heightAt(x, z) + 0.3 + R() * (nearStream ? 1.2 : 2.6), z);
    }
    const n = pts.length / 3, sd = new Float32Array(n); for (let i = 0; i < n; i++) sd[i] = R();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float s = seed * 40.0;
          vec3 p = position + vec3(sin(uTime * 0.35 + s) * 0.9 + sin(uTime * 0.9 + s * 1.3) * 0.2, sin(uTime * 0.5 + s * 0.7) * 0.35, cos(uTime * 0.3 + s * 1.1) * 0.9);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float blink = pow(max(0.0, sin(uTime * (0.6 + seed * 0.5) + s)), 6.0);
          vA = blink; gl_PointSize = clamp(110.0 / max(-mv.z, 0.5), 2.0, 26.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.12, 0.0, d), halo = smoothstep(0.5, 0.0, d) * 0.35;
          float a = (core + halo) * vA; gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * a * 1.6, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.name = 'fireflies'; root.add(p);
  }

  S.build(root);

  /* ---------------- animation ---------------- */
  ticks.push((t) => {
    if (!shishi) return;
    const T = 9.0, k = (t % T) / T;                                // fills slowly, tips, empties, clacks back
    let a;
    if (k < 0.82) a = -0.32 + 0.1 * (k / 0.82);
    else if (k < 0.88) a = -0.22 + 0.72 * ((k - 0.82) / 0.06);
    else if (k < 0.93) a = 0.5;
    else a = 0.5 - 0.82 * Math.min(1, (k - 0.93) / 0.03) + (k > 0.96 ? Math.sin((k - 0.96) * 300) * 0.03 * (1 - (k - 0.96) / 0.04) : 0);
    shishi.rotation.z = a;
  });
  function update(dt, t) { for (const f of ticks) f(t, dt); }

  // light + haze: the moonlit grove reads through a blue-grey mist that the far culms melt into
  const look = { fog: 0x121a26, hemiSky: 0x50609a, hemiGround: 0x141810, hemiI: 0.6, keyI: 0.8, exposure: 1.15, bloom: 0.6 };
  return { group: root, update, look: { night: look, day: look }, fog: { night: [20, 125], day: [20, 125] } };
}
