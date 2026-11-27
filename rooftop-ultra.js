// BANGKOK ROOFTOP — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on Ultra.
// It replaces the map's low-poly city + roof gear (`lite` in rooftop.js) with:
//  • a VAST night city: thousands of towers on a street grid out to ~2 km — glass offices, residential slabs with balconies,
//    round towers, setbacks, podiums, low-rise shophouse blocks — every facade a procedural window grid (lit / dark / TV
//    flicker / whole office floors, a few switching on and off), lit crowns, LED facades, rooftop gardens, glowing pools and
//    helipads on the roofs below, aircraft-warning lights blinking on the tall ones, construction cranes;
//  • streets far below as moving light streams (head- and tail-lights) under sodium street lamps, elevated expressways,
//    two BTS skytrain lines with trains gliding along, the Chao Phraya winding round with lit bridges and dinner cruises;
//  • a floodlit golden prang (Wat Arun style) across the river, LED billboards, a night sky with city glow, low clouds lit
//    from below, haze that thickens toward the horizon;
//  • on the roof: pavers + a timber lounge deck, glass balustrades (fresnel reflections) on the parapet and the ball
//    boundary, a sky bar with a backlit bottle wall, sofas, daybeds, planters with frangipani, AC condensers with spinning
//    fans, vent stacks breathing steam, water tanks, zig-zag string lights.
// HOW THE CITY FITS: the camera's far plane is 400 m, so everything beyond R0 is pulled toward the eye in the vertex shader
// (`rtSquash`: same direction from the eye, distance compressed so 2 km lands inside ~365 m). Seen from the roof it looks
// exactly like the true-scale city; fog / haze use the TRUE distance.
// GAMEPLAY RULE: nothing new on or over the court + free zone (+ a 1.5 m walkable band). Behind each baseline as seen from
// the two match cameras (the ±x axis, ~±20°) the city is kept low (hidden below the parapet line), dim (`rtCalm`) and free
// of anything that blinks, moves or glows hard; the sky there is darker too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { festoons, neonSign } from './props.js';

const STREET_Y = -64;
const EYE = [0, 4, 0], R0 = 220, RM = 365, LC = RM - R0;
const BLOCK = 84, GRID_A = 0.31;                       // street grid pitch (m) and its rotation
const TAU = Math.PI * 2;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _v2 = new THREE.Vector2();
const f1 = (v) => v.toFixed(1);
const MOON = new THREE.Vector3(-7, 15, -14).normalize();

// is a point straight behind a baseline as seen from a match camera? (0 = no … 1 = right on the axis)
function calmAt(x, z, t0 = 0.36, t1 = 0.58) {
  let c = 0;
  for (const cx of [-14.6, 14.6]) {
    const fwd = cx < 0 ? x - cx : cx - x;
    if (fwd > 1) { const t = Math.abs(z) / fwd; c = Math.max(c, 1 - THREE.MathUtils.smoothstep(t, t0, t1)); }
  }
  return c;
}
// distance from the nearer match camera (for the parapet-line height cap)
const camDist = (x, z) => Math.min(Math.hypot(x + 14.6, z), Math.hypot(x - 14.6, z));

/* =====================================================================
   shared GLSL
   ===================================================================== */
const GL_COMMON = `
uniform float uTime;
float rtHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rtNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rtHash(i), rtHash(i + vec2(1.0, 0.0)), f.x), mix(rtHash(i + vec2(0.0, 1.0)), rtHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float rtCalm(vec3 p) {
  float c = 0.0;
  float a = p.x + 14.6; if (a > 1.0) c = max(c, 1.0 - smoothstep(0.36, 0.58, abs(p.z) / a));
  float b = 14.6 - p.x; if (b > 1.0) c = max(c, 1.0 - smoothstep(0.36, 0.58, abs(p.z) / b));
  return c;
}
// the night sky over Bangkok: deep blue overhead, a warm sodium glow on the horizon (dimmer straight down ±x)
vec3 rtSky(vec3 d) {
  float h = d.y;
  float tz = abs(d.z) / max(abs(d.x), 1e-3);
  float calm = 1.0 - smoothstep(0.30, 0.62, tz);
  float az = atan(d.z, d.x);
  float gk = (0.82 + 0.18 * sin(az * 2.0 + 0.7) + 0.12 * sin(az * 5.0 + 2.0)) * (1.0 - 0.6 * calm);
  vec3 hor = vec3(0.115, 0.064, 0.046) * gk;
  vec3 mid = vec3(0.020, 0.018, 0.036) * (1.0 - 0.25 * calm);
  vec3 zen = vec3(0.0032, 0.0042, 0.0115);
  float hp = max(h, 0.0);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.17, hp));
  c = mix(c, zen, smoothstep(0.12, 0.72, hp));
  c += hor * 0.55 * exp(-hp * 38.0);
  return c;
}
vec3 rtHaze(vec3 d) { return rtSky(normalize(vec3(d.x, d.y * 0.45, d.z))); }
`;
const GL_SQUASH = `
vec3 rtSquash(vec3 p, out float k) {
  vec3 v = p - vec3(${EYE.map(f1).join(', ')});
  float d = length(v);
  k = 1.0;
  if (d <= ${f1(R0)}) return p;
  float d2 = ${f1(R0)} + ${f1(LC)} * (1.0 - exp(-(d - ${f1(R0)}) / ${f1(LC)}));
  k = d / d2;
  return vec3(${EYE.map(f1).join(', ')}) + v / k;
}`;

/* standard material → compressed into the far plane, hazed by true distance, + optional extra fragment code.
   o.frag(): code after <emissivemap_fragment> (can touch diffuseColor / totalEmissiveRadiance; has vTrue, vWN, vCalm) */
function squash(mat, uTime, o = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    Object.assign(sh.uniforms, o.uniforms || {});
    sh.vertexShader = `varying vec3 vTrue; varying float vRK; varying vec3 vWN; ${o.vHead || ''}\n${GL_SQUASH}\n` + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${o.vBegin || ''}`)
      .replace('#include <project_vertex>', `
        vec4 rtW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rtW = instanceMatrix * rtW;
          vWN = mat3(modelMatrix) * mat3(instanceMatrix) * ${o.noN ? 'vec3(0.0, 1.0, 0.0)' : 'objectNormal'};
        #else
          vWN = mat3(modelMatrix) * ${o.noN ? 'vec3(0.0, 1.0, 0.0)' : 'objectNormal'};
        #endif
        rtW = modelMatrix * rtW;
        vTrue = rtW.xyz;
        float rtK; rtW.xyz = rtSquash(rtW.xyz, rtK); vRK = rtK;
        vec4 mvPosition = viewMatrix * rtW;
        gl_Position = projectionMatrix * mvPosition;
        ${o.vMain || ''}`)
      .replace('#include <fog_vertex>', '#ifdef USE_FOG\n vFogDepth = -mvPosition.z * vRK;\n#endif');
    sh.fragmentShader = `varying vec3 vTrue; varying float vRK; varying vec3 vWN; ${o.fHead || ''}\n${GL_COMMON}\n${o.fFuncs || ''}\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\n float vCalm = rtCalm(vTrue);\n${o.fColor || ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${o.fRough || ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${o.fMetal || ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${o.frag || ''}`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
          float rtFog = smoothstep(fogNear, fogFar, vFogDepth);
          rtFog = max(rtFog, rtCalm(vTrue) * smoothstep(120.0, 900.0, vFogDepth) * 0.8);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, rtHaze(normalize(vTrue - cameraPosition + vec3(0.0, 1e-3, 0.0))) * ${o.hazeK ?? '1.0'}, rtFog);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'rtsq-' + (o.key || '');
  return mat;
}

/* =====================================================================
   geometry helpers
   ===================================================================== */
// non-indexed copy with position / normal / color (+ uv)
function vc(geo, col, R = null, jit = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (col !== undefined && col !== null) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    _c.set(col); if (jit && R) _c.offsetHSL(0, 0, (R() - 0.5) * jit);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  } else if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}
const T = (geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); _o.scale.setScalar(s); _o.updateMatrix();
  return geo.applyMatrix4(_o.matrix);
};
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, { cast = false, receive = false } = {}) {
      for (const [mat, list] of m) {
        if (!list.length) continue;
        const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => vc(g))), mat);
        mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;   // true-scale bounds lie past the far plane (drawn compressed)
        parent.add(mesh);
      }
      m.clear();
    },
  };
}
// a beam / rod between two points
function rod(a, b, r0, r1 = r0, seg = 6) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
function beam(a, b, w, h = w) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.BoxGeometry(w, h, L);
  _o.position.copy(a).add(b).multiplyScalar(0.5); _o.lookAt(b); _o.scale.setScalar(1); _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}

/* ---------- the tower buffer: polygon prisms with per-vertex tower data for the facade shader ---------- */
// aT = (seed, lit fraction, style + roof/10, column width) on walls; (seed, half w, style + roof/10, half d) on roofs
// aR = roof-local coords (m); aH = (top y, bottom y) of the whole tower
function towerBuffer() {
  const P = [], N = [], C = [], A = [], U = [], H = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  function tri(a, b, c, n, col, at, ua, ub, uc, hh) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_a, _b);
    if (_n.x * n[0] + _n.y * n[1] + _n.z * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) {
      P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(col.r, col.g, col.b); A.push(at[0], at[1], at[2], at[3]); U.push(u[0], u[1]); H.push(hh[0], hh[1]);
    }
  }
  const Z2 = [0, 0];
  // footprint poly: [[x,z],…] around (cx,cz); frame angle `ang` gives the roof-local axes
  function prism(poly, y0, y1, col, wallT, roofT, hh, { top = true, cx = 0, cz = 0, ang = 0 } = {}) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      let nx = q[1] - p[1], nz = -(q[0] - p[0]);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const mx = (p[0] + q[0]) / 2 - cx, mz = (p[1] + q[1]) / 2 - cz;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      const nn = [nx, 0, nz];
      const a = [p[0], y0, p[1]], b = [q[0], y0, q[1]], c = [q[0], y1, q[1]], d = [p[0], y1, p[1]];
      tri(a, b, c, nn, col, wallT, Z2, Z2, Z2, hh); tri(a, c, d, nn, col, wallT, Z2, Z2, Z2, hh);
    }
    if (!top) return;
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    const loc = (p) => { const x = p[0] - cx, z = p[1] - cz; return [x * ca - z * sa, x * sa + z * ca]; };
    const c0 = [cx, y1, cz], up = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      tri(c0, [p[0], y1, p[1]], [q[0], y1, q[1]], up, col, roofT, [0, 0], loc(p), loc(q), hh);
    }
  }
  function build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(A, 4));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(H, 2));
    g.computeBoundingSphere();
    return g;
  }
  return { prism, build, count: () => P.length / 3 };
}
const rectPoly = (cx, cz, w, d, a) => {
  const c = Math.cos(a), s = Math.sin(a), out = [];
  for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) out.push([cx + u * c - v * s, cz + u * s + v * c]);
  return out;
};
const ngonPoly = (cx, cz, r, n, a = 0, sx = 1, sz = 1) => Array.from({ length: n }, (_, i) => { const t = a + (i / n) * TAU; return [cx + Math.cos(t) * r * sx, cz + Math.sin(t) * r * sz]; });
const chamferPoly = (cx, cz, w, d, k, a) => {
  const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2, out = [];
  for (const [u, v] of [[-hw + k, -hd], [hw - k, -hd], [hw, -hd + k], [hw, hd - k], [hw - k, hd], [-hw + k, hd], [-hw, hd - k], [-hw, -hd + k]]) out.push([cx + u * c - v * s, cz + u * s + v * c]);
  return out;
};

/* ---------- the river: a meander round three sides of the tower ---------- */
const RIVER_PTS = [[1500, -1900], [900, -1250], [520, -720], [330, -330], [300, -60], [330, 160], [250, 330], [70, 410], [-130, 400], [-330, 300], [-470, 120], [-560, -130], [-760, -520], [-1150, -950], [-1800, -1500]];
const RIVER_W = 210;

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildRooftopUltra(ctx) {
  const { F, glowTexture } = ctx;
  const uTime = { value: 0 };
  const root = new THREE.Group(); root.name = 'rooftop-ultra';
  const R = rng(20251121);
  const RX = F.outX + 5.5, RZ = F.outZ + 5.5;

  /* ---------------- the river curve (CPU distance for placement + a distance texture for the street shader) ---------------- */
  const river = new THREE.CatmullRomCurve3(RIVER_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const RS = river.getSpacedPoints(700);
  const riverDist = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < RS.length - 1; i++) {
      const a = RS[i], b = RS[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
      let t = ((x - a.x) * ex + (z - a.z) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = a.x + ex * t - x, dz = a.z + ez * t - z, d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best) - RIVER_W / 2;
  };
  const RT_N = 256, RT_EXT = 2400;
  const riverTex = (() => {
    const data = new Uint8Array(RT_N * RT_N * 4);
    for (let j = 0; j < RT_N; j++) for (let i = 0; i < RT_N; i++) {
      const x = ((i + 0.5) / RT_N - 0.5) * 2 * RT_EXT, z = ((j + 0.5) / RT_N - 0.5) * 2 * RT_EXT;
      const d = riverDist(x, z);
      const v = Math.max(0, Math.min(255, Math.round((d + 60) / 2)));
      data.set([v, v, v, 255], (j * RT_N + i) * 4);
    }
    const t = new THREE.DataTexture(data, RT_N, RT_N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  })();

  // the CBDs (taller towers): Silom / Sathorn, Sukhumvit, Ratchaprasong, Rama IX … all well off the cameras' axis
  const CBD = [[60, -360, 260, 1.6], [-280, 230, 220, 1.2], [330, 420, 260, 1.3], [-200, -620, 300, 1.4], [700, -560, 320, 1.0], [-650, 520, 300, 0.9], [120, 900, 380, 0.8]];
  const cbdK = (x, z) => { let k = 0; for (const [cx, cz, r, a] of CBD) k += a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r)); return k; };
  const PRANG_AZ = Math.atan2(597, 150);
  const gcos = Math.cos(GRID_A), gsin = Math.sin(GRID_A);
  const toWorld = (gx, gz) => [gx * gcos - gz * gsin, gx * gsin + gz * gcos];

  /* ======================= 1. THE CITY ======================= */
  const TB = towerBuffer();
  const glowPts = [];        // [x, y, z, r, g, b, size(m), mode, phase]
  const nearRoofs = [];      // [cx, top, cz, w, d, ang, roofType] for 3D roof clutter close by
  const GP = (x, y, z, col, k, size, mode = 0, ph = R()) => { _c.set(col).multiplyScalar(k); glowPts.push(x, y, z, _c.r, _c.g, _c.b, size, mode, ph); };
  const TINT_GLASS = [0x5a6c80, 0x4f6470, 0x667788, 0x3e5060, 0x6c7a70, 0x7a8a9a, 0x506a78];
  const TINT_CONC = [0xb8b2a4, 0xc8c0b0, 0xa8a8a0, 0xd0c8b8, 0x98a0a8, 0xb0a090, 0xc4b8a0];
  const TINT_LOW = [0xc8b8a0, 0xd8ccb0, 0xb0a490, 0xe0d0b8, 0xa89880, 0xc0b090, 0xd8c0a8, 0xb8c0b0];
  let nTowers = 0;
  // one tower (true coords). kind: 0 glass office, 1 residential, 2 LED facade, 3 low-rise, 4 our own tower
  function tower(x, z, w, d, h, ang, kind, opt = {}) {
    const seed = R(), base = STREET_Y, top = base + h;
    const near = Math.hypot(x, z) < 300;
    const tints = kind === 0 || kind === 2 ? TINT_GLASS : kind === 3 ? TINT_LOW : TINT_CONC;
    _c.set(tints[Math.floor(R() * tints.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.08);
    const col = _c.clone();
    const calm = calmAt(x, z);
    const lit = (kind === 3 ? 0.32 : kind === 1 ? 0.38 : 0.42) * (0.6 + R() * 0.8) * (1 - 0.55 * calm);
    const colW = kind === 0 || kind === 2 ? 1.5 + R() * 0.8 : kind === 1 ? 2.8 + R() * 1.2 : 3.2 + R() * 1.2;
    let roof = 0;
    if (kind !== 3 && kind !== 4) { const r = R(); roof = r < 0.16 ? 1 : r < 0.3 ? 2 : r < 0.4 && h > 90 ? 3 : 0; }
    if (opt.roof !== undefined) roof = opt.roof;
    const wallT = [seed, lit, kind + 0.05, colW];
    const hh = [top, base];
    const shape = opt.shape ?? (kind === 3 ? 0 : Math.floor(R() * 6));
    const roofT = (hw, hd) => [seed, hw, kind + roof / 10 + 0.01, hd];
    nTowers++;
    if (shape === 1 && h > 80) {                                   // setbacks
      let y = base, ww = w, dd = d; const steps = 2 + Math.floor(R() * 2);
      for (let i = 0; i < steps; i++) {
        const y1 = i === steps - 1 ? top : y + h * (0.5 - i * 0.12);
        TB.prism(rectPoly(x, z, ww, dd, ang), y, y1, col, wallT, roofT(ww / 2, dd / 2), hh, { cx: x, cz: z, ang });
        y = y1; ww *= 0.78; dd *= 0.78;
      }
      if (near && i0(roof)) nearRoofs.push([x, top, z, ww / 0.78, dd / 0.78, ang, roof]);
    } else if (shape === 2 && kind !== 1) {                         // round glass tower
      const r = Math.min(w, d) / 2, n = 18;
      TB.prism(ngonPoly(x, z, r, n, ang), base, top, col, wallT, roofT(r * 0.7, r * 0.7), hh, { cx: x, cz: z, ang });
      if (R() < 0.5) TB.prism(ngonPoly(x, z, r * 0.55, 12, ang), top, top + 4 + R() * 6, col, wallT, roofT(r * 0.4, r * 0.4), [top + 8, base], { cx: x, cz: z, ang });
      if (near) nearRoofs.push([x, top, z, r * 1.2, r * 1.2, ang, roof === 3 ? 0 : roof]);
    } else if (shape === 3) {                                       // chamfered / octagonal
      TB.prism(chamferPoly(x, z, w, d, Math.min(w, d) * 0.22, ang), base, top, col, wallT, roofT(w * 0.4, d * 0.4), hh, { cx: x, cz: z, ang });
      if (near) nearRoofs.push([x, top, z, w * 0.8, d * 0.8, ang, roof]);
    } else if (shape === 4 && h > 60) {                             // podium + slimmer tower
      const ph = 12 + R() * 10;
      TB.prism(rectPoly(x, z, w * 1.25, d * 1.25, ang), base, base + ph, _c.set(TINT_CONC[Math.floor(R() * TINT_CONC.length)]).clone(), [seed, lit * 1.4, 3.05, 3.5], [seed, w * 0.6, 3.21, d * 0.6], [base + ph, base], { cx: x, cz: z, ang });
      TB.prism(rectPoly(x, z, w * 0.8, d * 0.8, ang), base + ph, top, col, wallT, roofT(w * 0.4, d * 0.4), hh, { cx: x, cz: z, ang });
      if (near) nearRoofs.push([x, top, z, w * 0.8, d * 0.8, ang, roof]);
    } else {
      TB.prism(rectPoly(x, z, w, d, ang), base, top, col, wallT, roofT(w / 2, d / 2), hh, { cx: x, cz: z, ang });
      if (near) nearRoofs.push([x, top, z, w, d, ang, roof]);
    }
    // a spire / mast on some tall ones + aircraft-warning lights (blinking on the tallest)
    const off = calm < 0.05;
    if (h > 150 && R() < 0.45) {
      const sh = 12 + R() * 30;
      TB.prism(ngonPoly(x, z, 1.2, 6), top, top + sh, _c.set(0x9aa4ae).clone(), [seed, 0, 4.05, 1], [seed, 0.5, 4.05, 0.5], [top + sh, base], { top: true, cx: x, cz: z });
      if (off) GP(x, top + sh + 0.8, z, 0xff2a14, 3.0, 3.2, 1, R());
    }
    if (off && h > 110) for (const [u, v] of [[-0.45, -0.45], [0.45, 0.45]]) {
      const c = Math.cos(ang), s = Math.sin(ang);
      GP(x + (u * w * c - v * d * s), top + 1, z + (u * w * s + v * d * c), 0xff2a14, h > 170 ? 3.0 : 1.8, h > 170 ? 2.6 : 1.8, h > 170 ? 1 : 0, (seed * 7) % 1);
    }
    if (roof === 3 && off) {                                        // helipad edge lights
      const r = Math.min(w, d) * 0.42 * 0.82;
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; GP(x + Math.cos(a) * r, top + 0.4, z + Math.sin(a) * r, k % 2 ? 0x40ff70 : 0xfff0c0, 1.6, 0.9, 0); }
    }
    return top;
  }
  function i0(v) { return v !== undefined; }

  // walk the street grid, block by block
  const MAXR = 2000;
  const NB = Math.ceil(MAXR / BLOCK);
  const majorG = (k) => ((k % 4) + 4) % 4 === 0;
  for (let bj = -NB; bj <= NB; bj++) for (let bi = -NB; bi <= NB; bi++) {
    const [cx, cz] = toWorld(bi * BLOCK, bj * BLOCK);         // block centre (roads run at half-block offsets)
    const rr = Math.hypot(cx, cz);
    if (rr > MAXR) continue;
    if (bi === 0 && bj === 0) continue;                         // our own block
    const rd = riverDist(cx, cz);
    if (rd < 14) continue;
    // road half widths around this block → the free interior
    const hwL = majorG(bi) ? 13 : 7.5, hwR = majorG(bi + 1) ? 13 : 7.5, hwB = majorG(bj) ? 13 : 7.5, hwT = majorG(bj + 1) ? 13 : 7.5;
    const ix0 = -BLOCK / 2 + hwL + 3, ix1 = BLOCK / 2 - hwR - 3, iz0 = -BLOCK / 2 + hwB + 3, iz1 = BLOCK / 2 - hwT - 3;
    const iw = ix1 - ix0, id = iz1 - iz0, icx = (ix0 + ix1) / 2, icz = (iz0 + iz1) / 2;
    const place = (u, v) => toWorld(bi * BLOCK + icx + u, bj * BLOCK + icz + v);
    const calm = calmAt(cx, cz), D = camDist(cx, cz);
    // in the calm band keep the roofs below the parapet line seen from the match camera (and low + dim further out)
    let cap = calm > 0.02 ? THREE.MathUtils.lerp(400, D < 470 ? Math.max(4, (5.3 - 0.137 * D - 9) - STREET_Y) : 64, calm) : 400;
    // close by, the roofs stay mostly below ours (so the roof looks OUT over the city), with the odd taller one
    if (rr < 340) cap = Math.min(cap, (rr < 110 ? 44 : 44 + (rr - 110) * 0.42) * (R() < 0.12 ? 1.7 : 1));
    // keep the line of sight to the prang open
    { let da = Math.atan2(cz, cx) - PRANG_AZ; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < 0.14 && rr < 580) cap = Math.min(cap, 34); }
    const k = cbdK(cx, cz);
    const far = rr > 1100;
    const r = R();
    if (rd < 50 && r < 0.6) continue;                           // riverside parks
    if (r < 0.06 && !far) continue;                             // the odd open plot / park
    const kindLow = r < 0.3 - Math.min(0.25, k * 0.15);
    if (kindLow || cap < 30) {
      // low-rise: shophouse rows / small blocks
      const nx = far ? 2 : 3 + Math.floor(R() * 2), nz = far ? 2 : 3 + Math.floor(R() * 2);
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        if (R() < 0.12) continue;
        const cw = iw / nx, cd = id / nz;
        const [x, z] = place(ix0 - icx + (a + 0.5) * cw, iz0 - icz + (b + 0.5) * cd);
        tower(x, z, cw * (0.82 + R() * 0.14), cd * (0.82 + R() * 0.14), Math.min(cap, 8 + R() * 18), GRID_A, 3);
      }
      continue;
    }
    const tall = (m = 1) => Math.min(cap, 300, (34 + Math.pow(R(), 1.7) * 150 * (1 + k)) * m);
    const kind = () => { const q = R(); return q < 0.5 ? 0 : q < 0.93 ? 1 : 2; };
    const lay = R();
    if (lay < 0.42) {                                            // one big tower
      const w = Math.min(iw, 22 + R() * 22), d = Math.min(id, 22 + R() * 22);
      const [x, z] = place((R() - 0.5) * (iw - w) * 0.8, (R() - 0.5) * (id - d) * 0.8);
      tower(x, z, w, d, tall(1.15), GRID_A + (R() < 0.15 ? 0.785 * (R() < 0.5 ? 1 : 0) : 0), kind());
    } else if (lay < 0.74) {                                     // two slabs
      const along = iw > id;
      for (const s of [-1, 1]) {
        const w = along ? iw * 0.44 : iw * (0.6 + R() * 0.3), d = along ? id * (0.6 + R() * 0.3) : id * 0.44;
        const [x, z] = place(along ? s * iw * 0.26 : 0, along ? 0 : s * id * 0.26);
        tower(x, z, w, d, tall(), GRID_A, kind());
      }
    } else {                                                     // four mid-rises
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (R() < 0.15) continue;
        const [x, z] = place(u * iw * 0.25, v * id * 0.25);
        tower(x, z, iw * 0.42, id * 0.42, tall(0.6), GRID_A, R() < 0.7 ? 1 : 0);
      }
    }
  }
  // LANDMARKS (all well off the cameras' axis)
  {
    // a MahaNakhon-ish pixelated tower: a spiral of notches climbing a slim glass block
    const [mx, mz] = [-150, -470], mh = 300, ang = GRID_A + 0.2;
    const seed = 0.37, hh = [STREET_Y + mh, STREET_Y], glass = new THREE.Color(0x5e7488);
    for (let i = 0, y = STREET_Y; i < 60; i++) {
      const y1 = y + mh / 60, a = i * 0.21;
      const c = Math.cos(ang), s = Math.sin(ang);
      const nx = Math.cos(a) * 9, nz = Math.sin(a) * 9;                     // notch position on the plan
      const cut = i > 8 && i < 56;
      if (cut) {
        // the block minus a notch: two rectangles
        TB.prism(rectPoly(mx + (-nx * 0.5) * c - (-nz * 0.5) * s, mz + (-nx * 0.5) * s + (-nz * 0.5) * c, 22 - Math.abs(nx) * 0.55, 22 - Math.abs(nz) * 0.55, ang), y, y1, glass, [seed, 0.6, 2.05, 1.6], [seed, 8, 2.01, 8], hh, { cx: mx, cz: mz, ang });
        TB.prism(rectPoly(mx + nx * 0.9 * c - nz * 0.9 * s, mz + nx * 0.9 * s + nz * 0.9 * c, 4, 4, ang + a), y, y1, _c.set(0x8a9aa8).clone(), [seed, 0.9, 2.05, 0.9], [seed, 2, 2.01, 2], hh, { cx: mx, cz: mz, ang });
      } else TB.prism(rectPoly(mx, mz, 22, 22, ang), y, y1, glass, [seed, 0.5, 0.05, 1.6], [seed, 11, 0.01, 11], hh, { cx: mx, cz: mz, ang });
      y = y1;
    }
    GP(mx, STREET_Y + mh + 2, mz, 0xff2a14, 3.2, 3.4, 1, 0.1);
    // a Baiyoke-ish tower: tall, banded, a crown + mast
    const [bx, bz] = [430, 520], bh = 300;
    TB.prism(chamferPoly(bx, bz, 40, 30, 6, GRID_A), STREET_Y, STREET_Y + bh, _c.set(0x6a7888).clone(), [0.81, 0.5, 2.05, 2.0], [0.81, 16, 2.01, 12], [STREET_Y + bh, STREET_Y], { cx: bx, cz: bz, ang: GRID_A });
    TB.prism(ngonPoly(bx, bz, 9, 12), STREET_Y + bh, STREET_Y + bh + 18, _c.set(0x9aa0a8).clone(), [0.81, 0.8, 0.05, 1.4], [0.81, 6, 0.01, 6], [STREET_Y + bh + 18, STREET_Y], { cx: bx, cz: bz });
    TB.prism(ngonPoly(bx, bz, 1.5, 6), STREET_Y + bh + 18, STREET_Y + bh + 60, _c.set(0xb0b4b8).clone(), [0.81, 0, 4.05, 1], [0.81, 1, 4.01, 1], [STREET_Y + bh + 60, STREET_Y], { cx: bx, cz: bz });
    GP(bx, STREET_Y + bh + 61, bz, 0xff2a14, 3.2, 3.6, 1, 0.6);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; GP(bx + Math.cos(a) * 9.5, STREET_Y + bh + 18.5, bz + Math.sin(a) * 9.5, 0xfff2d8, 2.2, 1.6, 0); }
    // an LED-screen tower + a couple more LED facades nearer the roof
    tower(230, -260, 30, 24, 160, GRID_A, 2, { shape: 0 });
    tower(-260, 260, 26, 26, 150, GRID_A + 0.785, 2, { shape: 3 });
    tower(330, 230, 34, 22, 190, GRID_A, 0, { shape: 1 });
  }
  // OUR tower (under the roof): glass + fins, a lit crown band, no compression needed
  TB.prism(rectPoly(0, 0, RX * 2 + 0.6, RZ * 2 + 0.6, 0), STREET_Y, -0.42, _c.set(0x6a7484).clone(), [0.123, 0.42, 4.05, 1.9], [0.123, RX, 4.01, RZ], [-0.42, STREET_Y], { top: false });

  const towerMat = squash(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15, envMapIntensity: 1.0 }), uTime, {
    key: 'tower',
    vHead: 'attribute vec4 aT; attribute vec2 aR; attribute vec2 aH; varying vec4 vT; varying vec2 vR; varying vec2 vH;',
    vBegin: 'vT = aT; vR = aR; vH = aH;',
    fHead: 'varying vec4 vT; varying vec2 vR; varying vec2 vH;',
    fFuncs: `
      vec3 rtHue(float h) { return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
      float rtWin; vec3 rtEm; float rtRf;`,
    fColor: `
      rtWin = 0.0; rtEm = vec3(0.0); rtRf = -1.0;
      {
        vec3 Nw = normalize(vWN);
        float seed = floor(vT.x * 997.0 + 0.5) / 997.0, style = floor(vT.z + 0.001), roofT = floor(fract(vT.z) * 10.0 + 0.5);
        float hgt = vTrue.y - ${f1(STREET_Y)};
        if (abs(Nw.y) < 0.5) {
          vec2 tg = vec2(-Nw.z, Nw.x); float tl = length(tg); tg = tl > 1e-3 ? tg / tl : vec2(1.0, 0.0);
          float u = dot(vTrue.xz, tg) + seed * 97.0;
          float flH = style > 2.5 && style < 3.5 ? 3.9 : 3.6;
          vec2 c = vec2(u / max(vT.w, 0.5), hgt / flH);
          vec2 fw = fwidth(c);
          vec2 id = floor(c), f = fract(c);
          float blur = clamp(max(fw.x, fw.y) * 1.6 - 0.35, 0.0, 1.0);
          vec2 lo = style < 0.5 || style > 1.5 && style < 2.5 ? vec2(0.06, 0.12) : vec2(0.18, 0.26);
          vec2 hi = style < 0.5 || style > 1.5 && style < 2.5 ? vec2(0.94, 0.94) : vec2(0.82, 0.84);
          vec2 aa = fw * 0.75 + 1e-4;
          vec2 m2 = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
          float area = (hi.x - lo.x) * (hi.y - lo.y);
          float win = mix(m2.x * m2.y, area, blur);
          float h1 = rtHash(id + seed * 91.7), h2 = rtHash(id.yx * 1.31 + seed * 13.1);
          float litF = vT.y;
          float flOn = step(rtHash(vec2(id.y, seed * 77.0)), style < 0.5 ? 0.14 : 0.05);
          float on = max(step(h1, litF), flOn * step(h1, 0.9));
          float sw = rtHash(id * 0.71 + floor(uTime * 0.03 + h2 * 9.0));
          on = sw < 0.035 ? 1.0 - on : on;
          if (hgt < 4.5) on = step(h1, 0.75);                         // shopfronts at street level
          vec3 wc = h2 < 0.5 ? vec3(1.0, 0.74, 0.42) : h2 < 0.82 ? vec3(1.0, 0.9, 0.74) : vec3(0.7, 0.86, 1.0);
          if (style < 0.5) wc = mix(wc, vec3(0.86, 0.94, 1.0), 0.3);
          float dim = 0.4 + 0.6 * rtHash(id * 1.7 + seed);
          float tv = step(0.985, h2) * (0.6 + 0.4 * sin(uTime * 9.0 + h1 * 40.0) * sin(uTime * 3.7 + h1 * 11.0));
          // office glazing: a mullion down the middle of each bay; homes: curtains half-drawn in some
          float mul = (style < 0.5 || style > 1.5 && style < 2.5) ? smoothstep(aa.x * 1.5, 0.0, abs(f.x - 0.5) - 0.02) * (1.0 - blur) : 0.0;
          float curt = step(0.62, h2) * step(h2, 0.8) * mix(1.0, 0.3, step(0.5, f.x));
          float grad = 0.7 + 0.45 * smoothstep(lo.y, hi.y, f.y);
          vec3 crisp = (on * dim * wc * grad * (curt > 0.0 ? curt : 1.0) + tv * vec3(0.3, 0.45, 1.0) * (1.0 - on)) * m2.x * m2.y * (1.0 - mul);
          vec3 avg = vec3(1.0, 0.84, 0.64) * (litF * 0.7 + 0.05) * area * 0.75;
          rtEm = mix(crisp, avg, blur) * 0.72;
          // balconies (residential): a pale slab edge every floor
          if (style > 0.5 && style < 1.5) { float sl = smoothstep(0.1 + aa.y, 0.1 - aa.y, f.y) * (1.0 - blur); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75), sl * 0.6); win *= 1.0 - sl; }
          // street level: shop signs glow in colour
          if (hgt < 5.5 && hgt > 4.2) rtEm += rtHue(rtHash(id + 3.1)) * 0.9 * step(0.4, rtHash(id * 2.3));
          // LED facade: a slow colour wave climbing the slab edges
          if (style > 1.5 && style < 2.5) {
            float band = smoothstep(0.12, 0.0, f.y) + smoothstep(0.88, 1.0, f.y);
            float wave = 0.5 + 0.5 * sin(id.y * 0.22 - uTime * 0.9 + u * 0.04);
            rtEm += rtHue(fract(seed + id.y * 0.006 + uTime * 0.025)) * mix(band, 0.24, blur) * (0.35 + 1.1 * wave);
          }
          // a lit crown on some towers, uplight at the base of the tall ones
          float crown = step(fract(seed * 13.7), 0.3) * smoothstep(vH.x - 7.0, vH.x - 6.0, vTrue.y) * step(60.0, vH.x - vH.y);
          rtEm += crown * mix(vec3(1.0, 0.8, 0.5), vec3(0.55, 0.8, 1.0), step(0.5, fract(seed * 31.0))) * (0.55 + 0.25 * f.y);
          rtEm += vec3(1.0, 0.6, 0.3) * 0.05 * exp(-hgt / 10.0);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.3, vec3(0.02, 0.026, 0.034), win);
          rtWin = win;
          if (style > 3.5) { rtEm *= 0.8; }
        } else if (Nw.y > 0.5) {
          // roofs: gravel / garden / pool / helipad
          vec2 q = vR; float hw = vT.y, hd = vT.w;
          float n = rtNoise(q * 0.6 + seed * 50.0);
          diffuseColor.rgb = vec3(0.16, 0.16, 0.17) * (0.7 + 0.5 * n);
          if (roofT > 0.5 && roofT < 1.5) {               // garden: lawn, shrubs, path lights
            float t = rtNoise(q * 0.35 + seed * 9.0);
            diffuseColor.rgb = mix(vec3(0.04, 0.09, 0.035), vec3(0.02, 0.05, 0.02), smoothstep(0.4, 0.7, t));
            float pth = smoothstep(1.2, 0.6, abs(q.x - sin(q.y * 0.2 + seed * 6.0) * hw * 0.35));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.32, 0.28), pth);
            vec2 lp = fract(q / 6.0) - 0.5; rtEm += vec3(1.0, 0.75, 0.4) * smoothstep(0.08, 0.0, length(lp)) * pth * 2.2;
          } else if (roofT > 1.5 && roofT < 2.5) {          // pool + deck
            vec2 pq = abs(q) - vec2(hw * 0.62, hd * 0.36);
            float pool = smoothstep(0.3, -0.3, max(pq.x, pq.y));
            float deck = smoothstep(0.3, -0.3, max(abs(q.x) - hw * 0.85, abs(q.y) - hd * 0.7));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.24), deck);
            float caus = rtNoise(q * 1.3 + vec2(uTime * 0.35, -uTime * 0.21)) * rtNoise(q * 0.9 - vec2(uTime * 0.2, uTime * 0.3));
            vec3 pc = mix(vec3(0.05, 0.45, 0.62), vec3(0.35, 0.95, 1.0), smoothstep(0.15, 0.45, caus));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.1, 0.14), pool);
            rtEm += pc * pool * (0.9 + 0.4 * smoothstep(-2.0, 0.0, max(pq.x, pq.y)));
            rtRf = mix(0.8, 0.1, pool);
          } else if (roofT > 2.5 && roofT < 3.5) {          // helipad
            float r = length(q), R0h = min(hw, hd) * 0.82;
            float pad = smoothstep(R0h + 0.3, R0h - 0.3, r);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.065, 0.07), pad);
            float ring = smoothstep(0.5, 0.2, abs(r - R0h * 0.86));
            vec2 hq = abs(q) / max(R0h, 1.0);
            float H = (step(hq.x, 0.32) * step(0.2, hq.x) * step(hq.y, 0.42)) + step(hq.x, 0.2) * step(hq.y, 0.06);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), clamp(ring + H, 0.0, 1.0) * pad);
          }
          if (style > 3.5) diffuseColor.rgb = vec3(0.22, 0.23, 0.25);
        }
      }`,
    fRough: 'if (rtRf >= 0.0) roughnessFactor = rtRf; roughnessFactor = mix(roughnessFactor, 0.08, rtWin);',
    fMetal: 'metalnessFactor = mix(metalnessFactor, 0.55, rtWin);',
    frag: 'totalEmissiveRadiance += rtEm * mix(1.0, 0.16, vCalm);',
  });
  const buildTowers = () => {
    const m = new THREE.Mesh(TB.build(), towerMat);
    m.frustumCulled = false; m.matrixAutoUpdate = false;
    root.add(m);
  };

  // a plain vertex-coloured material for the city's structures (compressed + hazed) and a self-lit one
  const cityMat = squash(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }), uTime, {
    key: 'city', frag: `totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 0.35 * exp(-(vTrue.y - ${f1(STREET_Y)}) / 14.0) * mix(1.0, 0.3, vCalm);`,
  });
  const cityB = batch();
  // 3D clutter on the roofs right below us: parapet caps, stair cores, water tanks, AC units, antennas, garden trees
  const treeSpots = [];
  for (const [x, top, z, w, d, ang, roof] of nearRoofs) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const at = (u, v) => [x + u * c - v * s, z + u * s + v * c];
    // parapet rim
    for (const [u, v, L, ry] of [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]]) {
      const [px, pz] = at(u, v);
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(L, 1.0, 0.35), px, top + 0.5, pz, -ang - ry), 0x9a968e));
    }
    if (roof === 0 || roof === 1) {
      const [px, pz] = at(-w * 0.22, d * 0.18);
      if (roof === 0) cityB.put(cityMat, vc(T(new THREE.BoxGeometry(w * 0.3, 3.2, d * 0.28), px, top + 1.6, pz, -ang), 0xb8b2a8));
      if (R() < 0.7) { const [tx, tz] = at(w * 0.26, -d * 0.24); cityB.put(cityMat, vc(T(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12), tx, top + 2.6, tz), [0x5a7ea0, 0xd8d6d0, 0x3a7a5a][Math.floor(R() * 3)])); cityB.put(cityMat, vc(T(new THREE.BoxGeometry(2.4, 1.5, 2.4), tx, top + 0.75, tz, -ang), 0x55585c)); }
      for (let k = 0; k < 4; k++) if (R() < 0.6) { const [ax, az] = at((R() - 0.5) * w * 0.7, (R() - 0.5) * d * 0.7); cityB.put(cityMat, vc(T(new THREE.BoxGeometry(1.4, 1.0, 1.0), ax, top + 0.5, az, -ang), 0xcfcfc8)); }
      if (R() < 0.35) { const [ax, az] = at(w * 0.35, d * 0.35); cityB.put(cityMat, vc(T(new THREE.CylinderGeometry(0.08, 0.12, 9, 5), ax, top + 4.5, az), 0xa0a0a0)); if (calmAt(ax, az) < 0.05) GP(ax, top + 9.2, az, 0xff2a14, 1.8, 1.0, 1); }
    }
    if (roof === 1) for (let k = 0; k < 7; k++) { const [tx, tz] = at((R() - 0.5) * w * 0.75, (R() - 0.5) * d * 0.75); treeSpots.push([tx, top, tz, 0.7 + R() * 0.7]); }
    if (roof === 2) { const [lx, lz] = at(0, -d * 0.55); for (const sx of [-1, 1]) { const [ux, uz] = at(sx * w * 0.3, d * 0.55); cityB.put(cityMat, vc(T(new THREE.BoxGeometry(2.5, 0.4, 1), ux, top + 0.2, uz, -ang), 0xe8e4dc)); } void lx; void lz; }
  }
  // garden trees (instanced) on the roof gardens below
  if (treeSpots.length) {
    const blob = mergeGeometries([T(new THREE.IcosahedronGeometry(1.6, 1), 0, 2.6, 0), T(new THREE.IcosahedronGeometry(1.1, 1), 0.9, 2.1, 0.5), T(new THREE.CylinderGeometry(0.15, 0.2, 1.8, 5), 0, 0.9, 0)].map((g) => vc(g, null)));
    const tm = squash(new THREE.MeshStandardMaterial({ color: 0x2a4a26, roughness: 0.9, flatShading: true }), uTime, { key: 'tree', frag: 'totalEmissiveRadiance += vec3(0.02, 0.035, 0.015);' });
    const im = new THREE.InstancedMesh(blob, tm, treeSpots.length);
    treeSpots.forEach(([x, y, z, s], i) => { _o.position.set(x, y, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.setScalar(s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
    im.frustumCulled = false;
    root.add(im);
  }

  /* ======================= 2. STREETS far below: grid, sodium lamps, moving traffic, the riverbanks ======================= */
  {
    // polar ground mesh (fine near the middle, coarse far out) so the compression bends it correctly
    const rings = [0]; for (let r = 30; r < 2600; r *= 1.07) rings.push(r);
    const NA = 200, pos = [], idx = [];
    for (let i = 0; i < rings.length; i++) for (let a = 0; a <= NA; a++) { const t = (a / NA) * TAU; pos.push(Math.cos(t) * rings[i], STREET_Y, Math.sin(t) * rings[i]); }
    for (let i = 0; i < rings.length - 1; i++) for (let a = 0; a < NA; a++) { const p = i * (NA + 1) + a, q = p + NA + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRiver: { value: riverTex } }]),
      fog: true,
      vertexShader: `varying vec3 vTrue; varying float vDepth; ${GL_SQUASH}
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vTrue = w.xyz; float k; w.xyz = rtSquash(w.xyz, k);
          vec4 mv = viewMatrix * w; vDepth = -mv.z * k; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vTrue; varying float vDepth; uniform sampler2D uRiver;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        ${GL_COMMON}
        vec3 traffic(float along, float across, float hw, float seed, float fwA) {
          float side = across >= 0.0 ? 1.0 : -1.0;
          float lane = floor(abs(across) / 3.3);
          float inL = abs(across) - (lane + 0.5) * 3.3;
          float nl = max(floor((hw - 1.5) / 3.3), 1.0);
          float okL = step(lane, nl - 1.0);
          float sp = 9.0 + 9.0 * rtHash(vec2(lane, seed + side));
          float s = along - side * sp * uTime;
          float L = 15.0;
          float cid = floor(s / L);
          float dens = 0.3 + 0.4 * rtNoise(vec2(along * 0.004 + seed, uTime * 0.02));
          float pres = step(rtHash(vec2(cid, lane * 7.1 + seed * 3.0 + side * 3.3)), dens);
          float loc = (fract(s / L) - 0.5) * L;
          float blob = exp(-loc * loc * 0.8) * exp(-inL * inL * 2.0);
          float blur = clamp(fwA * 0.5 - 0.3, 0.0, 1.0);
          float v = mix(pres * blob, dens * 0.13 * exp(-inL * inL * 0.6), blur) * okL;
          vec3 col = side > 0.0 ? vec3(1.0, 0.06, 0.025) * 2.2 : vec3(1.0, 0.88, 0.7) * 1.9;
          return col * v;
        }
        void main() {
          vec2 p = vTrue.xz;
          // street grid (rotated), roads on half-block lines
          float c = cos(${f1(-GRID_A * 100)} / 100.0), s = sin(${f1(-GRID_A * 100)} / 100.0);
          vec2 g = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + ${f1(BLOCK / 2)};
          vec2 k = floor(g / ${f1(BLOCK)} + 0.5);
          vec2 dd = g - k * ${f1(BLOCK)};
          vec2 fwG = fwidth(g);
          float fwA = max(fwG.x, fwG.y);
          vec2 hw = vec2(abs(mod(k.x, 4.0)) < 0.5 ? 13.0 : 7.5, abs(mod(k.y, 4.0)) < 0.5 ? 13.0 : 7.5);
          float aa = fwA + 0.2;
          float onZ = 1.0 - smoothstep(hw.x - aa, hw.x + aa, abs(dd.x));     // road running along grid-z
          float onX = 1.0 - smoothstep(hw.y - aa, hw.y + aa, abs(dd.y));     // along grid-x
          vec2 ruv = p / ${f1(RT_EXT * 2)} + 0.5;
          float rd = texture2D(uRiver, ruv).r * 510.0 - 60.0;               // metres from the riverbank (− in the water)
          float land = smoothstep(-2.0, 6.0, rd);
          float roadK = smoothstep(18.0, 40.0, rd);
          onZ *= roadK; onX *= roadK;
          float road = max(onZ, onX);
          // ground: dark blocks with a little variation, sidewalks, trees, the odd lit car park
          vec2 bid = floor(g / ${f1(BLOCK)});
          float bn = rtNoise(g * 0.08);
          vec3 alb = vec3(0.05, 0.05, 0.055) * (0.7 + 0.6 * bn);
          float side = (1.0 - road) * (1.0 - smoothstep(hw.x + 3.0, hw.x + 3.0 + aa, abs(dd.x)) * smoothstep(hw.y + 3.0, hw.y + 3.0 + aa, abs(dd.y)));
          alb = mix(alb, vec3(0.13, 0.12, 0.11), side);
          float park = smoothstep(46.0, 30.0, rd) * land;
          alb = mix(alb, vec3(0.02, 0.05, 0.02) * (0.6 + 0.8 * rtNoise(p * 0.15)), park);
          alb = mix(alb, vec3(0.03, 0.032, 0.035), road);
          vec3 em = vec3(0.0);
          // sodium wash on the roads + lamp pools along both kerbs
          float along1 = g.y, along2 = g.x;
          float lampZ = exp(-pow(abs(abs(dd.x) - hw.x + 1.0), 2.0) * 0.08) * exp(-pow((fract(along1 / 30.0) - 0.5) * 30.0, 2.0) * 0.06);
          float lampX = exp(-pow(abs(abs(dd.y) - hw.y + 1.0), 2.0) * 0.08) * exp(-pow((fract(along2 / 30.0) - 0.5) * 30.0, 2.0) * 0.06);
          float lb = clamp(fwA * 0.25 - 0.2, 0.0, 1.0);
          em += vec3(1.0, 0.55, 0.2) * (road * 0.07 + mix(onZ * lampZ + onX * lampX, road * 0.12, lb) * 0.55);
          // traffic
          em += traffic(along1, dd.x, hw.x, k.x * 1.7, fwA) * onZ;
          em += traffic(along2, dd.y, hw.y, k.y * 2.3 + 5.0, fwA) * onX;
          // riverside promenade: a string of lamps along the bank
          float prom = exp(-pow(rd - 6.0, 2.0) * 0.15) * exp(-pow((fract((p.x + p.y) / 22.0) - 0.5) * 22.0, 2.0) * 0.12);
          em += vec3(1.0, 0.8, 0.5) * mix(prom * 1.6, exp(-pow(rd - 6.0, 2.0) * 0.15) * 0.25, lb);
          // a lit car park / sports pitch here and there
          float lot = step(0.93, rtHash(bid + 0.37)) * smoothstep(22.0, 18.0, max(abs(fract(g.x / ${f1(BLOCK)}) - 0.5), abs(fract(g.y / ${f1(BLOCK)}) - 0.5)) * ${f1(BLOCK)}) * (1.0 - road) * roadK;
          em += vec3(0.75, 0.85, 1.0) * lot * 0.12;
          float calm = rtCalm(vTrue);
          vec3 col = alb * 0.06 + em * mix(1.0, 0.25, calm);
          vec3 dir = normalize(vTrue - cameraPosition + vec3(0.0, 1e-3, 0.0));
          float fog = smoothstep(fogNear, fogFar, vDepth);
          fog = max(fog, calm * smoothstep(120.0, 900.0, vDepth) * 0.8);
          col = mix(col, rtHaze(dir), fog);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    mat.uniforms.uTime = uTime;
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.renderOrder = -5;
    root.add(m);
  }

  /* ======================= 3. THE CHAO PHRAYA ======================= */
  const riverLen = river.getLength();
  {
    const NS = 900, NW = 6, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, p = river.getPointAt(t), tg = river.getTangentAt(t);
      const nx = -tg.z, nz = tg.x;
      for (let j = 0; j <= NW; j++) { const v = j / NW - 0.5; pos.push(p.x + nx * v * (RIVER_W + 6), STREET_Y + 0.4, p.z + nz * v * (RIVER_W + 6)); uv.push(t * riverLen, v * 2); }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NW; j++) { const a = i * (NW + 1) + j, b = a + NW + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true,
      vertexShader: `varying vec3 vTrue; varying float vDepth; varying vec2 vUv; ${GL_SQUASH}
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vTrue = w.xyz; float k; w.xyz = rtSquash(w.xyz, k);
          vec4 mv = viewMatrix * w; vDepth = -mv.z * k; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vTrue; varying float vDepth; varying vec2 vUv;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        ${GL_COMMON}
        void main() {
          vec3 V = normalize(vTrue - cameraPosition + vec3(0.0, 1e-3, 0.0));
          vec2 q = vTrue.xz * 0.05;
          float e = 0.6;
          float h0 = rtNoise(q + vec2(uTime * 0.07, uTime * 0.03)) + 0.5 * rtNoise(q * 2.3 - vec2(uTime * 0.05, -uTime * 0.08));
          float hx = rtNoise(q + vec2(e, 0.0) + vec2(uTime * 0.07, uTime * 0.03)) + 0.5 * rtNoise((q + vec2(e, 0.0)) * 2.3 - vec2(uTime * 0.05, -uTime * 0.08));
          float hz = rtNoise(q + vec2(0.0, e) + vec2(uTime * 0.07, uTime * 0.03)) + 0.5 * rtNoise((q + vec2(0.0, e)) * 2.3 - vec2(uTime * 0.05, -uTime * 0.08));
          vec3 N = normalize(vec3(-(hx - h0) * 0.35, 1.0, -(hz - h0) * 0.35));
          vec3 Rf = reflect(V, N); Rf.y = abs(Rf.y);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          vec3 col = vec3(0.004, 0.008, 0.012) + rtSky(Rf) * fres * 1.3;
          // reflections of the lit riverside: broken warm columns near both banks
          float bank = smoothstep(0.45, 0.98, abs(vUv.y));
          float cols = rtNoise(vec2(vUv.x * 0.11, 0.0)) * rtNoise(vec2(vUv.x * 0.37 + 4.0, 0.0));
          float rip = 0.55 + 0.45 * rtNoise(vec2(vUv.x * 0.6, vUv.y * 40.0 - uTime * 0.8));
          vec3 rc = mix(vec3(1.0, 0.62, 0.3), vec3(0.75, 0.85, 1.0), step(0.6, rtNoise(vec2(vUv.x * 0.05, 7.0))));
          col += rc * bank * smoothstep(0.25, 0.6, cols) * rip * 0.22;
          col *= mix(1.0, 0.45, rtCalm(vTrue));
          float fog = smoothstep(fogNear, fogFar, vDepth);
          col = mix(col, rtHaze(V), fog);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    mat.uniforms.uTime = uTime;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -4;
    root.add(m);
  }

  /* ======================= 4. ELEVATED ROADS, BRIDGES, BTS ======================= */
  // light-stream strips: aS = (metres along, metres across from the centre line, half width)
  const LS = { pos: [], s: [] };
  function lightStrip(curve, y, hw, n) {
    const L = curve.getLength();
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const a = curve.getPointAt(t0), b = curve.getPointAt(t1), ta = curve.getTangentAt(t0), tb = curve.getTangentAt(t1);
      const na = [-ta.z, ta.x], nb = [-tb.z, tb.x];
      const ya = (typeof y === 'function' ? y(t0) : y) + 0.12, yb = (typeof y === 'function' ? y(t1) : y) + 0.12;
      const P = (p, nn, yy, v) => [p.x + nn[0] * v, yy, p.z + nn[1] * v];
      const q = [[P(a, na, ya, -hw), t0, -hw], [P(b, nb, yb, -hw), t1, -hw], [P(b, nb, yb, hw), t1, hw], [P(a, na, ya, hw), t0, hw]];
      for (const k of [0, 1, 2, 0, 2, 3]) { LS.pos.push(...q[k][0]); LS.s.push(q[k][1] * L, q[k][2], hw); }
    }
  }
  const guidePts = [];   // [x, z] samples of the elevated structures (to keep towers off them — they're added after the towers, so just visual)
  function elevated(pts, { y = 20, hw = 12, pier = 34, lamps = true, col = 0x8a8680 } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const L = curve.getLength(), n = Math.ceil(L / 14);
    const yAt = (t) => { const p = curve.getPointAt(t); return riverDist(p.x, p.z) < 30 ? STREET_Y + y + 6 : STREET_Y + y; };
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, a = curve.getPointAt(t0), b = curve.getPointAt(t1);
      const ya = yAt(t0), yb = yAt(t1);
      cityB.put(cityMat, vc(beam(new THREE.Vector3(a.x, ya - 1.2, a.z), new THREE.Vector3(b.x, yb - 1.2, b.z), hw * 2, 2.2), col));
      for (const s of [-1, 1]) { const tg = curve.getTangentAt(t0); const nx = -tg.z * s * (hw - 0.2), nz = tg.x * s * (hw - 0.2); cityB.put(cityMat, vc(beam(new THREE.Vector3(a.x + nx, ya + 0.5, a.z + nz), new THREE.Vector3(b.x + nx, yb + 0.5, b.z + nz), 0.35, 1.0), 0xb0aca4)); }
      guidePts.push([a.x, a.z]);
    }
    for (let d = pier / 2; d < L; d += pier) {
      const t = d / L, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      if (riverDist(p.x, p.z) < 4) continue;
      const yy = yAt(t);
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(2.6, yy - 2.3 - STREET_Y, 2.6), p.x, (yy - 2.3 + STREET_Y) / 2, p.z, -Math.atan2(tg.z, tg.x)), col));
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(2.4, 1.6, hw * 1.7), p.x, yy - 3.0, p.z, -Math.atan2(tg.z, tg.x)), col));
      if (lamps && calmAt(p.x, p.z) < 0.05) for (const s of [-1, 1]) GP(p.x - tg.z * s * (hw - 0.6), yy + 9, p.z + tg.x * s * (hw - 0.6), 0xffa040, 1.6, 2.2, 0);
    }
    return { curve, yAt };
  }
  // two expressways sweeping round the sides (never down the ±x axis)
  const ex1 = elevated([[-1700, 760], [-1100, 560], [-560, 380], [-240, 200], [60, 170], [330, 300], [560, 520], [1000, 860], [1500, 1150]], { y: 22, hw: 12 });
  const ex2 = elevated([[-1500, -980], [-900, -560], [-420, -300], [-120, -190], [180, -230], [480, -400], [900, -760], [1300, -1250]], { y: 18, hw: 11 });
  lightStrip(ex1.curve, ex1.yAt, 11.5, 900);
  lightStrip(ex2.curve, ex2.yAt, 10.5, 900);

  // BTS skytrain: two lines on concrete guideways, stations with lit canopies
  const btsLines = [
    elevated([[-1400, -430], [-800, -330], [-420, -250], [-160, -140], [120, -110], [380, -170], [700, -330], [1300, -560]], { y: 13, hw: 4.6, pier: 30, lamps: false, col: 0xb4b0a8 }),
    elevated([[-260, 1500], [-220, 900], [-150, 520], [-40, 260], [90, 150], [200, 120], [520, 150], [1000, 380], [1600, 650]], { y: 15, hw: 4.6, pier: 30, lamps: false, col: 0xb4b0a8 }),
  ];
  const btsStations = [];
  btsLines.forEach((ln, li) => {
    const L = ln.curve.getLength();
    for (let d = 260; d < L - 100; d += 520) {
      const t = d / L, p = ln.curve.getPointAt(t), tg = ln.curve.getTangentAt(t), yy = ln.yAt(t), ry = -Math.atan2(tg.z, tg.x);
      if (riverDist(p.x, p.z) < 40) continue;
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(120, 7, 22), p.x, yy + 2.2, p.z, ry), 0xc8c4bc));
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(124, 1.0, 26), p.x, yy + 6.2, p.z, ry), 0x7a8088));
      if (calmAt(p.x, p.z) < 0.05) for (let k = -5; k <= 5; k++) for (const s of [-1, 1]) GP(p.x + tg.x * k * 11 - tg.z * s * 10.5, yy + 4.5, p.z + tg.z * k * 11 + tg.x * s * 10.5, li ? 0xd8ffe8 : 0xeaf4ff, 1.3, 1.3, 0);
      btsStations.push([p.x, p.z]);
    }
  });
  // trains: 4-car sets, instanced; windows + head / tail lights in a little canvas
  const trainTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#fff2d8'; for (let i = 0; i < 10; i++) g.fillRect(8 + i * 24.5, 18, 18, 18);
    g.fillStyle = '#62d070'; g.fillRect(0, 44, 256, 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const trains = [];
  const TRAIN_CARS = 4, CAR_L = 21;
  {
    const car = new THREE.BoxGeometry(CAR_L, 3.6, 3.1);
    const mat = squash(new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.45, metalness: 0.4, emissive: 0xffffff, emissiveMap: trainTex, emissiveIntensity: 1.5 }), uTime, { key: 'train' });
    let n = 0;
    btsLines.forEach((ln, li) => { for (let k = 0; k < 4; k++) for (const dir of [1, -1]) trains.push({ ln, li, s: (k + (dir > 0 ? 0 : 0.5)) / 4, dir, v: 16 + R() * 4 }); });
    const im = new THREE.InstancedMesh(car, mat, trains.length * TRAIN_CARS);
    im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(im);
    for (const t of trains) { t.L = t.ln.curve.getLength(); t.i0 = n; n += TRAIN_CARS; }
    trains.im = im;
  }

  // BRIDGES over the river (off-axis crossings): a cable-stayed one, a steel arch, a girder bridge
  const cableLines = [];
  const bridgeAt = (t) => { const p = river.getPointAt(t), tg = river.getTangentAt(t); return { p, tg, ang: Math.atan2(tg.z, tg.x) }; };
  function bridge(t, kind) {
    const { p, tg } = bridgeAt(t);
    const ax = -tg.z, az = tg.x;                                  // across the river
    const half = RIVER_W / 2 + 40, y = STREET_Y + 16;
    const a = new THREE.Vector3(p.x - ax * half, y, p.z - az * half), b = new THREE.Vector3(p.x + ax * half, y, p.z + az * half);
    cityB.put(cityMat, vc(beam(a, b, 26, 2.4), 0x8e8a84));
    for (const s of [-1, 1]) cityB.put(cityMat, vc(beam(a.clone().add(new THREE.Vector3(tg.x * s * 12.6, 1.6, tg.z * s * 12.6)), b.clone().add(new THREE.Vector3(tg.x * s * 12.6, 1.6, tg.z * s * 12.6)), 0.4, 1.0), 0xc0bcb4));
    lightStrip(new THREE.CatmullRomCurve3([a.clone().setY(0), b.clone().setY(0)]), y + 1.2, 11, 30);
    for (let k = -3; k <= 3; k++) { const q = p.clone().add(new THREE.Vector3(ax * k * 40, 0, az * k * 40)); cityB.put(cityMat, vc(T(new THREE.BoxGeometry(6, y - STREET_Y, 14), q.x, (y + STREET_Y) / 2 - 1, q.z, -Math.atan2(az, ax)), 0x77736e)); }
    const lampsOK = calmAt(p.x, p.z) < 0.05;
    for (let k = 0; k <= 20; k++) for (const s of [-1, 1]) { const q = a.clone().lerp(b, k / 20); if (lampsOK) GP(q.x + tg.x * s * 13, y + 8, q.z + tg.z * s * 13, 0xffd8a0, 1.8, 1.8, 0); }
    if (kind === 0) {
      // cable-stayed: one tall inverted-Y pylon on the near bank, two fans of cables
      const pp = p.clone().add(new THREE.Vector3(-ax * (RIVER_W / 2 - 10), 0, -az * (RIVER_W / 2 - 10)));
      const top = new THREE.Vector3(pp.x, STREET_Y + 150, pp.z);
      for (const s of [-1, 1]) cityB.put(cityMat, vc(rod(new THREE.Vector3(pp.x + tg.x * s * 16, STREET_Y, pp.z + tg.z * s * 16), new THREE.Vector3(pp.x + tg.x * s * 2, STREET_Y + 100, pp.z + tg.z * s * 2), 3.2, 2.2, 8), 0xe8e0d0));
      cityB.put(cityMat, vc(rod(new THREE.Vector3(pp.x, STREET_Y + 100, pp.z), top, 2.4, 1.2, 8), 0xe8e0d0));
      for (let k = 1; k <= 12; k++) for (const dir of [-1, 1]) {
        const d = k * (dir > 0 ? 17 : 11);
        const anchor = new THREE.Vector3(pp.x + ax * d * dir, y + 1.5, pp.z + az * d * dir);
        for (const s of [-1, 1]) cableLines.push([new THREE.Vector3(pp.x, STREET_Y + 108 + k * 3.3, pp.z), anchor.clone().add(new THREE.Vector3(tg.x * s * 11, 0, tg.z * s * 11))]);
      }
      if (lampsOK) { GP(top.x, top.y + 1, top.z, 0xff2a14, 3.0, 2.6, 1, 0.3); for (let k = 0; k < 8; k++) GP(pp.x - ax * 6, STREET_Y + 4, pp.z - az * 6, 0xffe0b0, 1.2, 6, 0); }
    } else if (kind === 1) {
      // a steel through-arch, lit along its ribs
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 24; k++) { const u = k / 24, q = a.clone().lerp(b, 0.12 + u * 0.76); q.y = y + 1 + Math.sin(Math.PI * u) * 48; q.x += tg.x * s * 13; q.z += tg.z * s * 13; pts.push(q); }
        for (let k = 0; k < 24; k++) { cityB.put(cityMat, vc(rod(pts[k], pts[k + 1], 1.1, 1.1, 6), 0x5a7088)); if (k % 2 === 0) cableLines.push([pts[k], new THREE.Vector3(pts[k].x, y + 1.5, pts[k].z)]); if (lampsOK && k % 2 === 1) GP(pts[k].x, pts[k].y + 1.4, pts[k].z, 0xbfe0ff, 2.4, 1.8, 0); }
      }
    }
    return { p, ax, az, y };
  }
  const BR = [];
  for (const [t, k] of [[0.405, 0], [0.585, 1], [0.27, 2], [0.73, 2]]) { const { p } = bridgeAt(t); if (calmAt(p.x, p.z) < 0.1) BR.push(bridge(t, k)); }
  if (cableLines.length) {
    const arr = []; for (const [a, b] of cableLines) arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const m = new THREE.LineSegments(geo, squash(new THREE.LineBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.4) }), uTime, { key: 'cable', noN: true }));
    m.frustumCulled = false; root.add(m);
  }
  // the light strips (one draw for every deck): head / tail lights + a sodium wash
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(LS.pos, 3));
    geo.setAttribute('aS', new THREE.Float32BufferAttribute(LS.s, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aS; varying vec3 vS; varying vec3 vTrue; varying float vDepth; ${GL_SQUASH}
        void main() { vS = aS; vec4 w = modelMatrix * vec4(position, 1.0); vTrue = w.xyz; float k; w.xyz = rtSquash(w.xyz, k);
          vec4 mv = viewMatrix * w; vDepth = -mv.z * k; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vS; varying vec3 vTrue; varying float vDepth;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        ${GL_COMMON}
        void main() {
          float along = vS.x, across = vS.y, hw = vS.z;
          float fwA = max(fwidth(along), fwidth(across));
          float side = across >= 0.0 ? 1.0 : -1.0;
          float lane = floor(abs(across) / 3.4);
          float inL = abs(across) - (lane + 0.5) * 3.4;
          float sp = 18.0 + 8.0 * rtHash(vec2(lane, side + hw));
          float s = along - side * sp * uTime;
          float L = 16.0;
          float cid = floor(s / L);
          float dens = 0.35 + 0.35 * rtNoise(vec2(along * 0.003 + hw, uTime * 0.03));
          float pres = step(rtHash(vec2(cid, lane * 5.1 + side * 2.7 + hw)), dens);
          float loc = (fract(s / L) - 0.5) * L;
          float blob = exp(-loc * loc * 0.7) * exp(-inL * inL * 1.6);
          float blur = clamp(fwA * 0.5 - 0.3, 0.0, 1.0);
          float v = mix(pres * blob, dens * 0.15 * exp(-inL * inL * 0.5), blur) * step(abs(across), hw - 0.8);
          vec3 col = side > 0.0 ? vec3(1.0, 0.06, 0.025) * 2.4 : vec3(1.0, 0.88, 0.7) * 2.1;
          vec3 e = col * v + vec3(1.0, 0.55, 0.2) * 0.06;
          e *= mix(1.0, 0.25, rtCalm(vTrue));
          e *= 1.0 - smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(e, 1.0);
        }`,
    });
    mat.uniforms.uTime = uTime;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2;
    root.add(m);
  }

  /* ======================= 5. THE GOLDEN PRANG (Wat Arun style) on the far bank ======================= */
  {
    const tP = 0.5, { p, tg } = bridgeAt(tP);
    let nx = -tg.z, nz = tg.x; if (nx * p.x + nz * p.z < 0) { nx = -nx; nz = -nz; }          // away from us
    const PX = p.x + nx * (RIVER_W / 2 + 95), PZ = p.z + nz * (RIVER_W / 2 + 95), PY = STREET_Y;
    const pr = batch();
    const goldMat = squash(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 }), uTime, {
      key: 'prang',
      frag: `{
        float hgt = vTrue.y - ${f1(PY)};
        vec3 toC = vec3(${f1(PX)}, vTrue.y, ${f1(PZ)}) - vTrue; toC.y = 0.0;
        vec3 Nw = normalize(vWN);
        float face = clamp(dot(Nw, normalize(-vTrue + vec3(0.0, vTrue.y, 0.0) + vec3(1e-3, 0.0, 0.0))), 0.0, 1.0);
        float up = 0.55 + 0.75 * exp(-hgt / 32.0);
        float spark = step(0.93, rtHash(floor(vTrue.xz * 1.3) + floor(vTrue.y * 1.3) * 7.0 + floor(uTime * 2.0))) * 0.8;
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.7, 0.38) * up * (0.4 + 0.6 * face) * (1.0 + spark) * 0.95;
        void(toC);
      }`.replace('void(toC);', ''),
    });
    // redented square ring (cross-section of a prang), unit half-size
    const redent = (k = 0.13) => {
      const out = [];
      for (let q = 0; q < 4; q++) {
        const a = (q * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
        for (const [u, v] of [[1, -1 + 2 * k], [1, 1 - 2 * k], [1 - k, 1 - 2 * k], [1 - k, 1 - k], [1 - 2 * k, 1 - k], [1 - 2 * k, 1]]) out.push([u * c - v * s, u * s + v * c]);
      }
      return out;
    };
    const RING = redent();
    function prangGeo(profile, s, x, y, z, col) {
      const pos = [], cols = [];
      _c.set(col);
      for (let i = 0; i < profile.length - 1; i++) {
        const [r0, y0, c0] = profile[i], [r1, y1, c1] = profile[i + 1];
        const ca = new THREE.Color(c0 ?? col), cb = new THREE.Color(c1 ?? col);
        for (let j = 0; j < RING.length; j++) {
          const p0 = RING[j], p1 = RING[(j + 1) % RING.length];
          const A = [x + p0[0] * r0 * s, y + y0 * s, z + p0[1] * r0 * s], B = [x + p1[0] * r0 * s, y + y0 * s, z + p1[1] * r0 * s];
          const C = [x + p1[0] * r1 * s, y + y1 * s, z + p1[1] * r1 * s], D = [x + p0[0] * r1 * s, y + y1 * s, z + p0[1] * r1 * s];
          for (const [P, cc] of [[A, ca], [C, cb], [B, ca], [A, ca], [D, cb], [C, cb]]) { pos.push(...P); cols.push(cc.r, cc.g, cc.b); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      return g;
    }
    const W = 0xece4d4, Gd = 0xe0a850, Gl = 0xf4c870;
    const mainProfile = [[46, 0, W], [46, 7, W], [38, 7, W], [38, 14, W], [31, 14, W], [31, 22, W], [24, 22, W], [24, 26, W]];
    // the corn-cob body: tiers that flare and step in, getting gold toward the top
    let r = 21, y = 26;
    for (let i = 0; i < 9; i++) {
      const h = 5.2 - i * 0.25, c = i < 3 ? W : i < 6 ? 0xe8c890 : Gd;
      mainProfile.push([r, y, c], [r * 1.07, y + h * 0.2, c], [r * 0.98, y + h * 0.35, c], [r * 0.9, y + h, c]);
      y += h; r *= 0.86;
    }
    mainProfile.push([r * 0.9, y, Gd], [r * 1.3, y + 1.2, Gl], [r * 0.9, y + 2.6, Gl], [r * 0.6, y + 5, Gl], [r * 0.35, y + 9, Gl], [r * 0.2, y + 14, Gl], [0.15, y + 20, Gl], [0.0, y + 21, Gl]);
    pr.put(goldMat, prangGeo(mainProfile, 1, PX, PY, PZ, W));
    // four satellite prangs + four mondops round the terrace
    const small = mainProfile.slice(8).map(([rr, yy, c]) => [rr, yy - 26, c]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pr.put(goldMat, prangGeo([[16, 0, W], [16, 6, W], [12, 6, W], [12, 9, W]], 1, PX + sx * 52, PY, PZ + sz * 52, W));
      pr.put(goldMat, prangGeo(small.map(([rr, yy, c]) => [rr * 0.55, yy * 0.55 + 9, c]), 1, PX + sx * 52, PY, PZ + sz * 52, W));
    }
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const mx = PX + sx * 52, mz = PZ + sz * 52;
      pr.put(goldMat, vc(T(new THREE.BoxGeometry(12, 10, 12), mx, PY + 5, mz), W));
      pr.put(goldMat, vc(T(new THREE.ConeGeometry(6.5, 20, 4), mx, PY + 20, mz, Math.PI / 4), Gd));
    }
    // the compound: white crenellated wall, temple halls with tiered orange / green roofs, a pier
    for (const [L, x, z, ry] of [[150, 0, -75, 0], [150, 0, 75, 0], [150, -75, 0, Math.PI / 2], [150, 75, 0, Math.PI / 2]]) pr.put(goldMat, vc(T(new THREE.BoxGeometry(L, 4, 1.4), PX + x, PY + 2, PZ + z, ry), 0xe8e0d0));
    for (const [x, z, ry, L] of [[-110, -30, 0.3, 46], [-105, 45, -0.2, 38], [100, 60, 0.1, 42], [115, -40, 0.5, 30]]) {
      const hx = PX + x, hz = PZ + z;
      pr.put(goldMat, vc(T(new THREE.BoxGeometry(L, 9, 18), hx, PY + 4.5, hz, ry), 0xece4d4));
      for (let k = 0; k < 3; k++) {
        const roof = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); roof.rotateY(Math.PI / 4); roof.scale((L - k * 6) * 0.72, 7 - k, 22 - k * 3);
        pr.put(goldMat, vc(T(roof, hx, PY + 12 + k * 4, hz, ry), k % 2 ? 0x2f7a4a : 0xc85a20));
      }
      GP(hx, PY + 1, hz, 0xffc070, 1.4, 14, 0);
    }
    pr.build(root);
    // floodlights at the foot of the prang + gold glints at the top, its reflection on the river
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; GP(PX + Math.cos(a) * 48, PY + 2, PZ + Math.sin(a) * 48, 0xffd090, 1.6, 10, 0); }
    GP(PX, PY + 108, PZ, 0xffe8a0, 1.6, 4, 3, 0.2);
    // reflection streak: a long soft gold smear on the water, pointing at the roof
    const refl = [];
    const addStreak = (x, z, len, wid, col, k) => refl.push({ x, z, len, wid, col, k });
    { const { p: rp } = bridgeAt(tP); addStreak(rp.x + nx * (RIVER_W * 0.35), rp.z + nz * (RIVER_W * 0.35), RIVER_W * 0.7, 30, 0xffb050, 0.55); }
    for (const b of BR) addStreak(b.p.x, b.p.z, RIVER_W * 0.8, 16, 0xffd0a0, 0.25);
    if (refl.length) {
      const pos = [], uv = [], col = [];
      for (const s of refl) {
        const dx = -s.x, dz = -s.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, vx = -uz, vz = ux;
        const c = new THREE.Color(s.col).multiplyScalar(s.k);
        const P = (a, b) => [s.x + ux * a * s.len / 2 + vx * b * s.wid / 2, STREET_Y + 0.6, s.z + uz * a * s.len / 2 + vz * b * s.wid / 2];
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { pos.push(...P(a, b)); uv.push(a, b); col.push(c.r, c.g, c.b); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
        vertexShader: `varying vec2 vUv; varying vec3 vC; varying vec3 vTrue; ${GL_SQUASH}
          void main() { vUv = uv; vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vTrue = w.xyz; float k; w.xyz = rtSquash(w.xyz, k); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vC; varying vec3 vTrue; ${GL_COMMON}
          void main() {
            float a = (1.0 - vUv.x * vUv.x) * exp(-vUv.y * vUv.y * 4.0);
            float brk = 0.4 + 0.6 * rtNoise(vec2(vUv.y * 3.0, vUv.x * 26.0 - uTime * 1.3));
            gl_FragColor = vec4(vC * a * brk * mix(1.0, 0.3, rtCalm(vTrue)), 1.0);
          }`,
      });
      mat.uniforms = { uTime };
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1;
      root.add(m);
    }
  }

  /* ======================= 6. LIFE: boats on the river, cranes, a plane on approach ======================= */
  const boats = [];
  {
    for (let i = 0; i < 7; i++) boats.push({ t: R(), v: (R() < 0.5 ? 1 : -1) * (2.5 + R() * 3) / riverLen, off: (R() - 0.5) * RIVER_W * 0.6, kind: i % 3, ph: R() });
    const hull = new THREE.BoxGeometry(46, 4, 11);
    const im = new THREE.InstancedMesh(hull, squash(new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, emissive: 0xffd8a0, emissiveIntensity: 0.25 }), uTime, { key: 'boat' }), boats.length);
    im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(im); boats.im = im;
  }
  // construction cranes (yellow lattice masts + jibs) with red lights on the jib tips
  {
    for (const [x, z, h, a] of [[-330, -330, 170, 0.4], [520, 260, 210, 2.1], [-60, -760, 230, 1.2], [-560, 330, 190, 4.0]]) {
      if (calmAt(x, z) > 0.02) continue;
      const top = STREET_Y + h;
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(3, h, 3), x, STREET_Y + h / 2, z), 0xd8a820));
      const c = Math.cos(a), s = Math.sin(a);
      cityB.put(cityMat, vc(beam(new THREE.Vector3(x - c * 20, top, z - s * 20), new THREE.Vector3(x + c * 65, top, z + s * 65), 2.2, 2.4), 0xd8a820));
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(4, 8, 4), x, top + 5, z), 0xd8a820));
      GP(x + c * 65, top + 1.5, z + s * 65, 0xff2a14, 3.0, 2.4, 1, R());
      GP(x, top + 9.5, z, 0xff2a14, 3.0, 2.4, 1, R());
      // the half-built tower under it
      tower(x + c * 22, z + s * 22, 30, 30, h - 40, a, 1, { shape: 0, roof: 0 });
    }
  }
  cityB.build(root);
  buildTowers();

  /* ======================= 7. LIGHT POINTS (static + moving) ======================= */
  const pointMat = (dyn) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 800 } }]), fog: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aC; attribute vec3 aB; varying vec3 vC; uniform float uScale; uniform float uTime;
        uniform float fogNear; uniform float fogFar;
        ${GL_SQUASH}
        float rtCalm(vec3 p) {
          float c = 0.0;
          float a = p.x + 14.6; if (a > 1.0) c = max(c, 1.0 - smoothstep(0.36, 0.58, abs(p.z) / a));
          float b = 14.6 - p.x; if (b > 1.0) c = max(c, 1.0 - smoothstep(0.36, 0.58, abs(p.z) / b));
          return c;
        }
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0); vec3 tp = w.xyz; float k; w.xyz = rtSquash(w.xyz, k);
          vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
          float dep = max(-mv.z * k, 1.0);
          float a = 1.0;
          if (aB.y > 0.5 && aB.y < 1.5) a = smoothstep(0.42, 0.5, fract(uTime * 0.55 + aB.z)) * smoothstep(1.0, 0.92, fract(uTime * 0.55 + aB.z));
          else if (aB.y > 1.5 && aB.y < 2.5) a = smoothstep(0.9, 0.95, fract(uTime * 0.8 + aB.z)) * smoothstep(1.0, 0.97, fract(uTime * 0.8 + aB.z));
          else if (aB.y > 2.5) a = 0.7 + 0.3 * sin(uTime * 2.3 + aB.z * 6.28);
          float px = aB.x * uScale / dep;
          float fade = clamp(px / 1.4, 0.25, 1.0);
          gl_PointSize = clamp(px, 1.4, 40.0) * 3.0;
          float fog = smoothstep(fogNear, fogFar, dep);
          vC = aC * a * fade * (1.0 - fog * 0.85) * mix(1.0, 0.2, rtCalm(tp));
        }`,
      fragmentShader: `varying vec3 vC;
        void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
          gl_FragColor = vec4(vC * (exp(-r2 * 16.0) * 1.2 + exp(-r2 * 4.0) * 0.22), 1.0); }`,
    });
    mat.uniforms.uTime = uTime;
    void dyn;
    return mat;
  };
  const setScale = (mat) => (renderer, scene, camera) => { renderer.getDrawingBufferSize(_v2); mat.uniforms.uScale.value = _v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); };
  {
    const n = glowPts.length / 9, pos = new Float32Array(n * 3), c = new Float32Array(n * 3), b = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const o = i * 9; pos.set(glowPts.slice(o, o + 3), i * 3); c.set(glowPts.slice(o + 3, o + 6), i * 3); b.set(glowPts.slice(o + 6, o + 9), i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aC', new THREE.BufferAttribute(c, 3)); geo.setAttribute('aB', new THREE.BufferAttribute(b, 3));
    const mat = pointMat(false);
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3;
    pts.onBeforeRender = setScale(mat);
    root.add(pts);
  }
  // moving lights: boats' strings + nav lights, a plane on approach far off to the side
  const DYN_N = boats.length * 14 + 4;
  const dyn = (() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(DYN_N * 3), c = new Float32Array(DYN_N * 3), b = new Float32Array(DYN_N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aC', new THREE.BufferAttribute(c, 3)); geo.setAttribute('aB', new THREE.BufferAttribute(b, 3));
    let i = 0;
    for (const bt of boats) for (let k = 0; k < 14; k++, i++) {
      _c.set(k < 12 ? [0xffd27a, 0xff8a5a, 0x8fd8ff, 0xffffff][(k + bt.kind) % 4] : k === 12 ? 0xff2020 : 0x20ff40).multiplyScalar(k < 12 ? 1.5 : 2.2);
      c.set([_c.r, _c.g, _c.b], i * 3); b.set([k < 12 ? 1.4 : 1.6, k < 12 ? 3 : 0, R()], i * 3);
    }
    for (let k = 0; k < 4; k++, i++) { _c.set(k === 0 ? 0xffffff : k === 1 ? 0xff2020 : k === 2 ? 0x20ff40 : 0xfff6e0).multiplyScalar(k === 3 ? 4 : 2.6); c.set([_c.r, _c.g, _c.b], i * 3); b.set([k === 3 ? 6 : 3, k === 0 ? 2 : k === 1 ? 1 : 0, 0.3], i * 3); }
    const mat = pointMat(true);
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3;
    pts.onBeforeRender = setScale(mat);
    root.add(pts);
    return { geo, pos };
  })();

  /* ======================= 8. BILLBOARDS: neon + an animated LED screen (facing the roof, off-axis) ======================= */
  const neonMats = [];
  {
    for (const [x, y, z, txt, col] of [[-120, -30, 95, 'SIAM TAKRAW', '#ff3fa0'], [95, -38, -120, 'TUK TUK TOURS', '#3fe0ff'], [-60, -46, -150, 'MANGO STICKY RICE', '#ffb03f']]) {
      if (calmAt(x, z) > 0.02) continue;
      const b = neonSign(txt, col, 24, 6.4);
      squash(b.mat, uTime, { key: 'neon' });
      b.mesh.position.set(x, y + 3.6, z); b.mesh.lookAt(0, y + 3.6, 0);
      root.add(b.mesh); neonMats.push(b.mat);
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(0.8, y + 0.4 - STREET_Y, 0.8), x, (y + 0.4 + STREET_Y) / 2, z), 0x555a60));
    }
    // LED screen on a podium roof: slow colour fields + a scrolling bar
    const [sx, sy, sz] = [150, -40, 110];
    if (calmAt(sx, sz) < 0.02) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.ShaderMaterial({
        uniforms: { uTime },
        vertexShader: `varying vec2 vUv; varying vec3 vTrue; ${GL_SQUASH} void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vTrue = w.xyz; float k; w.xyz = rtSquash(w.xyz, k); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vTrue; ${GL_COMMON}
          vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
          void main() {
            float scene = floor(uTime / 7.0);
            float t = fract(uTime / 7.0);
            vec2 px = floor(vUv * vec2(120.0, 48.0)) / vec2(120.0, 48.0);
            float n = rtNoise(px * vec2(5.0, 3.0) + vec2(uTime * 0.25, scene * 3.1));
            vec3 c = mix(hue(fract(scene * 0.37)), hue(fract(scene * 0.37 + 0.18)), n);
            float bar = smoothstep(0.02, 0.0, abs(px.y - 0.18)) * step(0.5, fract(px.x * 18.0 - uTime * 1.5));
            c = mix(c * 0.85, vec3(1.0), bar * 0.7);
            c *= smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t) * 0.8 + 0.2;
            vec2 g = fract(vUv * vec2(120.0, 48.0)); c *= 0.75 + 0.25 * step(0.15, g.x) * step(0.15, g.y);
            gl_FragColor = vec4(c * 1.25, 1.0);
          }`,
      }));
      scr.position.set(sx, sy + 7, sz); scr.lookAt(0, sy + 7, 0);
      root.add(scr);
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(31, 13, 0.8), sx, sy + 7, sz, Math.atan2(sx, sz) + Math.PI), 0x202226));
      cityB.put(cityMat, vc(T(new THREE.BoxGeometry(1.2, sy + 1 - STREET_Y, 1.2), sx, (sy + 1 + STREET_Y) / 2, sz), 0x555a60));
    }
  }
  cityB.build(root);

  /* ======================= 9. SKY: dome (moon, stars, low clouds lit from below) + a painted copy as the environment ======================= */
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uMoon: { value: MOON } }, depthWrite: false, depthTest: false, fog: false, side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main() { vD = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }',
      fragmentShader: `varying vec3 vD; uniform vec3 uMoon; ${GL_COMMON}
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * rtNoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vD);
          vec3 c = rtSky(d);
          float h = d.y;
          float tz = abs(d.z) / max(abs(d.x), 1e-3);
          float calm = 1.0 - smoothstep(0.30, 0.62, tz);
          // a low cloud deck lit orange from below by the city
          if (h > 0.0) {
            vec2 cp = d.xz / (h + 0.06) * 0.9 + vec2(uTime * 0.004, uTime * 0.002);
            float cl = smoothstep(0.48, 0.82, fbm(cp));
            float band = smoothstep(0.015, 0.09, h) * (1.0 - smoothstep(0.25, 0.6, h));
            vec3 cc = vec3(0.16, 0.085, 0.06) * (1.0 - 0.6 * calm) * (0.7 + 0.5 * (1.0 - smoothstep(0.02, 0.4, h)));
            c = mix(c, cc, cl * band * 0.85);
            // stars (faint, washed out near the horizon by the city glow)
            vec2 sp = vec2(atan(d.z, d.x) * 420.0, asin(clamp(h, -1.0, 1.0)) * 420.0);
            vec2 si = floor(sp), sf = fract(sp) - 0.5;
            float st = step(0.985, rtHash(si)) * smoothstep(0.32, 0.0, length(sf)) * rtHash(si + 3.0);
            c += vec3(0.75, 0.8, 1.0) * st * smoothstep(0.18, 0.5, h) * (1.0 - cl * band) * 0.5;
          }
          // the moon (well away from the match cameras' view)
          float md = dot(d, uMoon);
          c += vec3(1.0, 0.96, 0.86) * 2.6 * smoothstep(0.99988, 0.99993, md);
          c += vec3(0.5, 0.55, 0.7) * 0.06 * exp(-(1.0 - md) * 400.0);
          c += (rtHash(gl_FragCoord.xy) - 0.5) * 0.004;
          gl_FragColor = vec4(max(c, 0.0), 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
    dome.frustumCulled = false; dome.renderOrder = -20;
    dome.onBeforeRender = (r, s, camera) => { dome.position.copy(camera.position); dome.updateMatrixWorld(); };
    root.add(dome);
  }
  // the same sky painted small, for the environment light (glass reflections) — JS port of rtSky
  const skyTex = (() => {
    const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H);
    const ss = THREE.MathUtils.smoothstep, mix = (a, b, t) => a + (b - a) * t;
    const toS = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = 1 - (j + 0.5) / H, ph = (u - 0.5) * TAU, th = (v - 0.5) * Math.PI;
      const d = [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)];
      const tz = Math.abs(d[2]) / Math.max(Math.abs(d[0]), 1e-3), calm = 1 - ss(tz, 0.3, 0.62), az = Math.atan2(d[2], d[0]);
      const gk = (0.82 + 0.18 * Math.sin(az * 2 + 0.7) + 0.12 * Math.sin(az * 5 + 2)) * (1 - 0.6 * calm);
      const hor = [0.115 * gk, 0.064 * gk, 0.046 * gk], mid = [0.02, 0.018, 0.036], zen = [0.0032, 0.0042, 0.0115];
      const hp = Math.max(d[1], 0);
      const out = [0, 1, 2].map((k) => { let x = mix(hor[k], mid[k], ss(hp, 0, 0.17)); x = mix(x, zen[k], ss(hp, 0.12, 0.72)); x += hor[k] * 0.55 * Math.exp(-hp * 38); if (d[1] < 0) x = hor[k] * (0.6 + 0.4 * Math.exp(d[1] * 6)); return x * 1.6; });
      img.data.set([toS(out[0]), toS(out[1]), toS(out[2]), 255], (j * W + i) * 4);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  })();

  /* ======================= 10. THE ROOF ======================= */
  const roofG = new THREE.Group(); root.add(roofG);
  const RB = batch();
  const tex = (w, h, draw, srgb = true, rep = [1, 1]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8;
    return t;
  };
  // pavers: 600 mm stone tiles with joints and a little mottling (texture covers 4.8 m)
  const paverMap = tex(1024, 1024, (g, W) => {
    const Rt = rng(77), n = 8, s = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 112 + Rt() * 26; g.fillStyle = `rgb(${v | 0},${(v - 3) | 0},${(v - 8) | 0})`; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 120; k++) { const a = Rt() * 0.07; g.fillStyle = Rt() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; const r = 1 + Rt() * 5; g.fillRect(i * s + Rt() * s, j * s + Rt() * s, r, r); }
    }
    g.fillStyle = 'rgba(20,18,16,0.85)'; for (let i = 0; i <= n; i++) { g.fillRect(i * s - 2, 0, 4, W); g.fillRect(0, i * s - 2, W, 4); }
  }, true, [RX * 2 / 4.8, RZ * 2 / 4.8]);
  const deckMap = tex(1024, 512, (g, W, H) => {
    const Rt = rng(31), rows = 16, rh = H / rows;
    for (let j = 0; j < rows; j++) {
      let x = -Rt() * 300;
      while (x < W) { const L = 260 + Rt() * 260, v = 0.85 + Rt() * 0.3; g.fillStyle = `rgb(${(96 * v) | 0},${(64 * v) | 0},${(42 * v) | 0})`; g.fillRect(x, j * rh, L, rh);
        for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(30,18,10,${0.08 + Rt() * 0.1})`; g.fillRect(x, j * rh + Rt() * rh, L, 1 + Rt()); }
        g.fillStyle = 'rgba(10,6,4,0.9)'; g.fillRect(x, j * rh, 3, rh); x += L; }
      g.fillStyle = 'rgba(10,6,4,0.9)'; g.fillRect(0, j * rh, W, 3);
    }
  });
  {
    // pavers round the court deck only (never under it: a floor just below the court shows through at grazing angles)
    const hx = F.outX + 0.4, hz = F.outZ + 0.4, parts = [];
    const strip = (x0, x1, z0, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, -0.112, (z0 + z1) / 2);
      const pa = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + RX) / (RX * 2), 1 - (pa.getZ(i) + RZ) / (RZ * 2));
      parts.push(g);
    };
    strip(-RX, RX, -RZ, -hz); strip(-RX, RX, hz, RZ); strip(-RX, -hx, -hz, hz); strip(hx, RX, -hz, hz);
    const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ map: paverMap, roughness: 0.62, metalness: 0.0, color: 0xb0aaa2 }));
    m.receiveShadow = true; roofG.add(m);
  }
  // the lounge deck (−z side, timber) — raised 5 cm
  const DZ0 = -RZ, DZ1 = -(F.outZ + 2.0);
  {
    deckMap.repeat.set((RX * 2 - 1) / 4, (DZ1 - DZ0) / 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(RX * 2 - 1, 0.06, DZ1 - DZ0), new THREE.MeshStandardMaterial({ map: deckMap, roughness: 0.55, color: 0xc8b8a8 }));
    m.position.set(0, -0.08, (DZ0 + DZ1) / 2); m.receiveShadow = true; roofG.add(m);
  }

  const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x8a929a, metalness: 0.85, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.45 }),
    vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    fabric: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0xffffff).multiplyScalar(2.2) }),
    glowSoft: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0xffffff).multiplyScalar(1.15) }),
  };
  // GLASS: fresnel — nearly clear head-on, reflective at grazing angles, faint green edges
  const glass = (k = 1) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x9cc4cc, transparent: true, opacity: 0.1 * k, roughness: 0.03, metalness: 0.1, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float rtF = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        diffuseColor.a = clamp(diffuseColor.a + rtF * 0.5 * ${f1(k)}, 0.0, 0.7);
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'rtglass' + k;
    return m;
  };
  const glassP = glass(1), glassC = glass(0.8);
  // glass balustrade on top of the parapet: panels between stainless posts, a round handrail, standoff clamps
  {
    const ys = 1.02, ye = 1.95;
    const sides = [[RX * 2 + 0.6, 0, -RZ - 0.15, 0], [RX * 2 + 0.6, 0, RZ + 0.15, 0], [RZ * 2, -RX - 0.15, 0, Math.PI / 2], [RZ * 2, RX + 0.15, 0, Math.PI / 2]];
    for (const [len, x, z, ry] of sides) {
      const n = Math.round(len / 1.5), pw = len / n;
      const c = Math.cos(ry), s = Math.sin(ry);
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5) * pw;
        RB.put(glassP, T(new THREE.BoxGeometry(pw - 0.04, ye - ys, 0.024), x + c * t, (ys + ye) / 2, z - s * t, ry));
        RB.put(M.vc, vc(T(new THREE.BoxGeometry(pw - 0.04, 0.012, 0.026), x + c * t, ye, z - s * t, ry), 0x6fa89a));   // glass edge
      }
      for (let i = 0; i <= n; i++) { const t = -len / 2 + i * pw; RB.put(M.steel, T(new THREE.CylinderGeometry(0.025, 0.025, ye - ys + 0.05, 10), x + c * t, (ys + ye) / 2, z - s * t)); }
      RB.put(M.steel, T(new THREE.CylinderGeometry(0.03, 0.03, len, 12), x, ye + 0.03, z, ry, 0, Math.PI / 2));
      RB.put(M.vc, vc(T(new THREE.BoxGeometry(len, 0.05, 0.36), x, 1.005, z, ry), 0x8a8680));       // coping stone
    }
    // the court boundary glass (same place as High's panels, now real glass)
    const bx = F.outX + 0.05, bz = F.outZ + 0.05;
    for (const [len, x, z, ry] of [[F.outX * 2, 0, -bz, 0], [F.outX * 2, 0, bz, 0], [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, Math.PI / 2]])
      RB.put(glassC, T(new THREE.BoxGeometry(len, 0.72, 0.02), x, 0.38, z, ry));
  }
  // planters: long corten / concrete troughs with grasses + shrubs (low along the ends — calm behind the baselines)
  const plantGeo = [];
  const shrub = (x, y, z, s, col) => { const g = new THREE.IcosahedronGeometry(s, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * 0.12; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.computeVertexNormals(); plantGeo.push(vc(T(g, x, y, z), col, R, 0.12)); };
  const grass = (x, y, z, w, d, h, col) => {
    for (let k = 0; k < Math.round(w * d * 26); k++) {
      const bl = new THREE.ConeGeometry(0.03, h * (0.6 + R() * 0.6), 3, 1); bl.translate(0, h * 0.45, 0);
      plantGeo.push(vc(T(bl, x + (R() - 0.5) * w, y, z + (R() - 0.5) * d, R() * TAU, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5), col, R, 0.2));
    }
  };
  function planter(x, z, w, d, h, ry, kind) {
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(w, h, d), x, h / 2 - 0.1, z, ry), kind === 'corten' ? 0x6a3a22 : 0x7a7670));
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(w - 0.12, 0.04, d - 0.12), x, h - 0.12, z, ry), 0x2a1e16));
  }
  // ends (|x| ≥ outX + 2): only low, dark planters with grasses
  for (const sx of [-1, 1]) {
    const x = sx * (RX - 0.55);
    for (const z0 of [-RZ + 3.5, 0, RZ - 3.5]) {
      if (Math.abs(z0) < 1 && false) continue;
      planter(x, z0, 0.8, 4.5, 0.5, 0, 'conc');
      grass(x, 0.38, z0, 0.6, 4.2, 0.45, 0x3a5a30);
    }
  }
  // +z side: a garden terrace — corten planters, frangipani, sun loungers, the AC plant + vents
  const PZ = RZ - 0.75;
  for (const x of [-RX + 3.2, -6.5, 1.5]) {
    planter(x, PZ, 3.6, 1.1, 0.7, 0, 'corten');
    grass(x, 0.58, PZ, 3.3, 0.9, 0.5, 0x4a6a38);
    for (const dx of [-1.1, 0, 1.1]) shrub(x + dx, 0.85, PZ + (R() - 0.5) * 0.3, 0.38 + R() * 0.15, 0x2f5a2a);
  }
  const fran = [];
  for (const x of [-RX + 3.2, -6.5]) fran.push([x + 1.2, PZ]);
  for (const [x, z] of fran) {
    // a frangipani: forking trunk, clusters of leaves with white-yellow flowers
    const base = new THREE.Vector3(x, 0.6, z);
    const forks = [];
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + R(), tip = new THREE.Vector3(x + Math.cos(a) * 0.8, 2.3 + R() * 0.5, z + Math.sin(a) * 0.5); forks.push(tip); plantGeo.push(vc(rod(base.clone().setY(1.4), tip, 0.06, 0.04, 5), 0x7a6a58)); }
    plantGeo.push(vc(rod(base, base.clone().setY(1.45), 0.1, 0.08, 6), 0x7a6a58));
    for (const t of forks) { shrub(t.x, t.y + 0.15, t.z, 0.45, 0x2f5a28); for (let k = 0; k < 5; k++) plantGeo.push(vc(T(new THREE.IcosahedronGeometry(0.06, 0), t.x + (R() - 0.5) * 0.6, t.y + 0.35 + R() * 0.2, t.z + (R() - 0.5) * 0.5), 0xfff4d8)); }
  }
  // sun loungers on the garden side
  for (const x of [-11, -9.6]) {
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(0.7, 0.1, 1.9), x, 0.3, RZ - 2.6), 0x5a3a26));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.66, 0.1, 1.3, 2, 0.04), x, 0.4, RZ - 2.9), 0xe8e2d4));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.66, 0.08, 0.6, 2, 0.03), x, 0.62, RZ - 2.0, 0, -0.75), 0xe8e2d4));
    for (const [dx, dz] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) RB.put(M.dark, T(new THREE.BoxGeometry(0.05, 0.25, 0.05), x + dx, 0.13, RZ - 2.6 + dz));
  }
  // AC condensers (fans spin) + vent stacks with steam, toward +x on the garden side
  const fans = [];
  for (const [x, z] of [[4.2, RZ - 1.0], [6.0, RZ - 1.0], [7.8, RZ - 1.0], [-3.6, -RZ + 0.9 + 0 * 1]]) {
    if (z < 0) continue;
    RB.put(M.vc, vc(T(new RoundedBoxGeometry(1.5, 0.95, 0.8, 2, 0.04), x, 0.38, z), 0xd8d8d2));
    RB.put(M.dark, T(new THREE.BoxGeometry(1.3, 0.75, 0.02), x, 0.38, z - 0.41));
    RB.put(M.dark, T(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), x - 0.2, 0.87, z));
    RB.put(M.steel, T(new THREE.TorusGeometry(0.34, 0.015, 6, 24), x - 0.2, 0.88, z, 0, Math.PI / 2));
    fans.push([x - 0.2, 0.86, z]);
    RB.put(M.steel, T(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), x + 0.55, 0.9, z + 0.32));
  }
  const vents = [];
  for (const [x, z, h] of [[9.6, RZ - 0.9, 1.6], [2.4, RZ - 0.9, 1.2], [-2.8, -RZ + 1.0, 1.4]]) {
    RB.put(M.steel, T(new THREE.CylinderGeometry(0.16, 0.16, h, 14), x, h / 2 - 0.1, z));
    RB.put(M.steel, T(new THREE.CylinderGeometry(0.3, 0.2, 0.16, 14), x, h + 0.02, z));
    vents.push([x, h + 0.05, z]);
  }
  // water tanks on steel stands (two corners), with ladders
  for (const [x, z] of [[RX - 2.2, RZ - 2.4], [-RX + 2.2, -RZ + 2.2]]) {
    RB.put(M.vc, vc(T(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 28), x, 3.0, z), 0x4f6f8a));
    for (let k = 0; k < 3; k++) RB.put(M.vc, vc(T(new THREE.CylinderGeometry(1.12, 1.12, 0.06, 28), x, 2.2 + k * 0.8, z), 0x3f5a72));
    RB.put(M.vc, vc(T(new THREE.ConeGeometry(1.15, 0.45, 28), x, 4.22, z), 0x3f5a72));
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) RB.put(M.steel, T(new THREE.BoxGeometry(0.09, 2.0, 0.09), x + dx, 1.0, z + dz));
    RB.put(M.steel, T(new THREE.BoxGeometry(1.8, 0.1, 1.8), x, 2.0, z));
    for (const sx of [-0.2, 0.2]) RB.put(M.steel, T(new THREE.BoxGeometry(0.04, 4.0, 0.04), x + sx, 2.0, z + (z > 0 ? -1.13 : 1.13)));
    for (let k = 0; k < 12; k++) RB.put(M.steel, T(new THREE.BoxGeometry(0.42, 0.03, 0.03), x, 0.3 + k * 0.33, z + (z > 0 ? -1.13 : 1.13)));
  }

  // −z side: THE SKY BAR — counter, backlit bottle wall, stools, sofas, daybeds, low tables, lanterns, string lights
  const BZ = -RZ + 0.55;
  const bottleTex = tex(1024, 256, (g, W, H) => {
    const Rt = rng(5);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < 3; row++) {
      const y0 = 20 + row * 80;
      const gr = g.createLinearGradient(0, y0, 0, y0 + 70); gr.addColorStop(0, 'rgba(255,190,110,0.15)'); gr.addColorStop(1, 'rgba(255,170,80,0.55)');
      g.fillStyle = gr; g.fillRect(0, y0, W, 70);
      let x = 6;
      while (x < W - 20) {
        const w = 10 + Rt() * 12, h = 34 + Rt() * 26, hue = [30, 40, 120, 0, 200, 50][Math.floor(Rt() * 6)];
        g.fillStyle = `hsla(${hue},70%,${30 + Rt() * 30}%,0.95)`; g.fillRect(x, y0 + 70 - h, w, h);
        g.fillRect(x + w * 0.35, y0 + 70 - h - 10, w * 0.3, 12);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 2, y0 + 70 - h + 4, 2, h - 8);
        x += w + 3 + Rt() * 6;
      }
      g.fillStyle = '#ffd8a0'; g.fillRect(0, y0 + 70, W, 3);
    }
  }, true);
  {
    // back bar: dark frame + glowing bottle shelves
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(7.2, 2.4, 0.5), 0, 1.1, BZ - 0.05), 0x1a1614));
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.7), new THREE.MeshBasicMaterial({ map: bottleTex, color: new THREE.Color(0xffffff).multiplyScalar(1.25) }));
    shelf.position.set(0, 1.25, BZ + 0.21); roofG.add(shelf);
    // the counter: dark stone top on a ribbed front with an LED strip under the lip
    const cz = BZ + 2.0;
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(6.4, 1.02, 0.7), 0, 0.41, cz), 0x2a2420));
    for (let i = 0; i < 40; i++) RB.put(M.vc, vc(T(new THREE.BoxGeometry(0.08, 0.9, 0.04), -3.1 + i * 0.159, 0.4, cz + 0.36), 0x5a4030));
    RB.put(M.vc, vc(T(new RoundedBoxGeometry(6.7, 0.07, 0.95, 2, 0.02), 0, 0.95, cz + 0.05), 0xd8d2c8));
    RB.put(M.glow, vc(T(new THREE.BoxGeometry(6.4, 0.025, 0.02), 0, 0.88, cz + 0.52), 0xffb060));
    for (let i = 0; i < 6; i++) {
      const sx = -2.7 + i * 1.08, sz = cz + 0.95;
      RB.put(M.steel, T(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8), sx, 0.3, sz));
      RB.put(M.steel, T(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), sx, -0.05, sz));
      RB.put(M.fabric, vc(T(new THREE.CylinderGeometry(0.2, 0.18, 0.08, 16), sx, 0.7, sz), 0x8a2a3a));
    }
    // pendant lights over the counter
    for (let i = 0; i < 4; i++) {
      const px = -2.4 + i * 1.6;
      RB.put(M.dark, T(new THREE.CylinderGeometry(0.005, 0.005, 1.3, 4), px, 2.55, cz));
      RB.put(M.dark, T(new THREE.ConeGeometry(0.16, 0.2, 16, 1, true), px, 1.85, cz));
      RB.put(M.glow, vc(T(new THREE.SphereGeometry(0.06, 12, 8), px, 1.78, cz), 0xffc080));
    }
    // a slim steel frame carrying the pendants and the string lights
    for (const x of [-3.6, 3.6]) RB.put(M.dark, T(new THREE.BoxGeometry(0.08, 3.2, 0.08), x, 1.5, cz));
    RB.put(M.dark, T(new THREE.BoxGeometry(7.3, 0.08, 0.08), 0, 3.1, cz));
  }
  // lounge: L-sofas + daybeds + low tables round the bar, either side
  for (const sx of [-1, 1]) {
    const x0 = sx * 7.6, z0 = -RZ + 1.4;
    // sofa: frame + seat + back cushions
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(3.0, 0.32, 0.9), x0, 0.12, z0), 0x3a2a20));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(2.9, 0.18, 0.85, 3, 0.07), x0, 0.36, z0 + 0.02), 0xd8d0c0));
    for (let k = 0; k < 3; k++) RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.92, 0.5, 0.2, 3, 0.08), x0 - 0.95 + k * 0.95, 0.66, z0 - 0.33, 0, -0.12), 0xd8d0c0));
    for (let k = 0; k < 2; k++) RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.4, 0.4, 0.14, 3, 0.06), x0 - 0.6 + k * 1.2, 0.62, z0 - 0.15, 0.2 * (k ? 1 : -1), -0.2), sx > 0 ? 0x2a8a8a : 0xc85a3a));
    // side wing
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(0.9, 0.32, 2.0), x0 + sx * 1.95, 0.12, z0 + 0.55), 0x3a2a20));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.85, 0.18, 1.95, 3, 0.07), x0 + sx * 1.95, 0.36, z0 + 0.55), 0xd8d0c0));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.2, 0.5, 1.9, 3, 0.08), x0 + sx * 2.33, 0.66, z0 + 0.55), 0xd8d0c0));
    // low table with a candle lantern
    RB.put(M.vc, vc(T(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28), x0, 0.36, z0 + 1.3), 0x6a4a30));
    RB.put(M.dark, T(new THREE.CylinderGeometry(0.12, 0.2, 0.34, 12), x0, 0.16, z0 + 1.3));
    RB.put(glassC, T(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12), x0, 0.48, z0 + 1.3));
    RB.put(M.glow, vc(T(new THREE.SphereGeometry(0.03, 8, 6), x0, 0.44, z0 + 1.3), 0xffa040));
    // a daybed further out
    const dx = sx * 11.6, dz = -RZ + 1.6;
    RB.put(M.vc, vc(T(new THREE.BoxGeometry(2.0, 0.3, 2.0), dx, 0.1, dz), 0x3a2a20));
    RB.put(M.fabric, vc(T(new RoundedBoxGeometry(1.95, 0.2, 1.95, 3, 0.08), dx, 0.34, dz), 0xe6e0d2));
    for (let k = 0; k < 3; k++) RB.put(M.fabric, vc(T(new RoundedBoxGeometry(0.55, 0.42, 0.16, 3, 0.07), dx - 0.6 + k * 0.6, 0.62, dz - 0.82, 0, -0.2), [0x2a8a8a, 0xd8b048, 0xc85a3a][k]));
    // canopy frame over the daybed
    for (const [ux, uz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) RB.put(M.dark, T(new THREE.BoxGeometry(0.06, 2.4, 0.06), dx + ux * 1.0, 1.15, dz + uz * 1.0));
    RB.put(M.fabric, vc(T(new THREE.BoxGeometry(2.1, 0.02, 2.1), dx, 2.36, dz), 0x7a6e60));
    // planters with palms framing the lounge
    planter(sx * 5.2, -RZ + 0.75, 1.0, 1.0, 0.8, 0, 'corten');
    shrub(sx * 5.2, 1.05, -RZ + 0.75, 0.45, 0x2f5a2a);
  }
  // little palms in tall pots by the bar
  {
    for (const sx of [-1, 1]) {
      const x = sx * 4.3, z = -RZ + 0.75;
      RB.put(M.vc, vc(T(new THREE.CylinderGeometry(0.32, 0.25, 0.9, 20), x, 0.35, z), 0xe8e4dc));
      plantGeo.push(vc(rod(new THREE.Vector3(x, 0.7, z), new THREE.Vector3(x + 0.1, 2.3, z), 0.06, 0.05, 6), 0x7a6248));
      for (let k = 0; k < 8; k++) {
        const f = new THREE.PlaneGeometry(0.3, 1.3, 1, 5), p = f.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.65; p.setXYZ(i, p.getX(i) * (1 - y / 1.5), -0.25 * y * y + 0.18 * y, y); }
        f.computeVertexNormals(); f.rotateY((k / 8) * TAU);
        plantGeo.push(vc(T(f, x + 0.1, 2.3, z), 0x3f7a3a, R, 0.1));
      }
    }
  }
  RB.put(M.leaf, mergeGeometries(plantGeo));
  RB.build(roofG, { cast: false, receive: true });

  // AC fans (instanced, spinning)
  const fanIM = (() => {
    const bl = []; for (let k = 0; k < 4; k++) { const b = new THREE.BoxGeometry(0.28, 0.01, 0.09); b.translate(0.15, 0, 0); b.rotateX(0.25); b.rotateY((k / 4) * TAU); bl.push(b); }
    const im = new THREE.InstancedMesh(mergeGeometries(bl), M.dark, fans.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    roofG.add(im); return im;
  })();
  // string lights: zig-zag over the lounge between the bar frame and slim posts at the deck edge
  {
    const pairs = [], y = 3.1;
    const zA = BZ + 2.0, zB = DZ1 - 0.4;
    const xs = [-RX + 1.6, -9.5, -6.5, -3.6, 3.6, 6.5, 9.5, RX - 1.6];
    for (const x of xs) if (Math.abs(x) > 3.7) { RB.put(M.dark, T(new THREE.CylinderGeometry(0.035, 0.045, y + 0.1, 8), x, y / 2, zB)); RB.put(M.dark, T(new THREE.CylinderGeometry(0.035, 0.045, y + 0.1, 8), x, y / 2, -RZ + 0.35)); }
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      if (Math.abs(a) < 3.7 && Math.abs(b) < 3.7) continue;
      pairs.push([new THREE.Vector3(a, y, i % 2 ? zA : zB), new THREE.Vector3(b, y, i % 2 ? zB : zA)]);
      pairs.push([new THREE.Vector3(a, y, -RZ + 0.35), new THREE.Vector3(b, y, -RZ + 0.35)]);
    }
    const f = festoons(pairs, { sag: 0.35, n: 16, colors: [0xffe2a8, 0xffd080, 0xfff0d0], bright: 2.6, size: 0.06 });
    roofG.add(f);
    RB.build(roofG);
  }
  // soft light pools on the floor (under the bar pendants, the lounge lanterns, along the planters)
  {
    const geo = [];
    const pool = (x, z, r, col, k) => { const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); _c.set(col).multiplyScalar(k); geo.push(vc(T(g, x, -0.03, z), _c.getHex())); };
    for (let i = 0; i < 4; i++) pool(-2.4 + i * 1.6, BZ + 2.0, 1.4, 0xffb060, 0.5);
    for (const sx of [-1, 1]) { pool(sx * 7.6, -RZ + 2.7, 1.2, 0xff9a40, 0.4); pool(sx * 11.6, -RZ + 1.6, 2.2, 0xffc080, 0.25); }
    pool(0, BZ + 0.6, 3.2, 0xffa050, 0.35);
    const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(mergeGeometries(geo), mat); m.renderOrder = 4; roofG.add(m);
  }
  // neon: SKY BAR over the back bar, TAKRAW on the lounge-side parapet glass (never behind a baseline)
  {
    const n = neonSign('SKY BAR', '#3fe0ff', 3.2, 0.85); n.mesh.position.set(0, 2.75, BZ + 0.2); roofG.add(n.mesh); neonMats.push(n.mat);
    const n2 = neonSign('TAKRAW', '#ff3fa0', 2.6, 0.7); n2.mesh.position.set(-RX + 4.0, 2.55, -RZ + 0.1); roofG.add(n2.mesh); neonMats.push(n2.mat);
    RB.put(M.dark, T(new THREE.BoxGeometry(0.05, 1.0, 0.05), -RX + 4.0 - 1.1, 2.0, -RZ + 0.1)); RB.put(M.dark, T(new THREE.BoxGeometry(0.05, 1.0, 0.05), -RX + 4.0 + 1.1, 2.0, -RZ + 0.1));
    RB.build(roofG);
  }
  // STEAM from the vents: soft billboards, rising + spreading + drifting outward
  {
    const N = 36;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    const aO = [], aR = [];
    for (const [x, y, z] of vents) for (let i = 0; i < N; i++) { aO.push(x, y, z, i / N); aR.push(R(), R(), z > 0 ? 1 : -1, 0); }
    geo.setAttribute('aO', new THREE.InstancedBufferAttribute(new Float32Array(aO), 4));
    geo.setAttribute('aR', new THREE.InstancedBufferAttribute(new Float32Array(aR), 4));
    geo.instanceCount = vents.length * N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 aO; attribute vec4 aR; uniform float uTime; varying vec2 vUv; varying float vA; varying float vS;
        void main() {
          float t = fract(uTime * 0.16 + aO.w + aR.x * 0.05);
          vec3 c = aO.xyz + vec3(sin(t * 4.0 + aR.y * 6.28) * 0.18 + t * 0.6 * (aR.x - 0.5), t * 3.0 + t * t * 0.8, aR.z * t * 1.1 + cos(t * 3.0 + aR.x * 6.0) * 0.15);
          float s = 0.18 + t * 1.5;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float a = aR.y * 6.28 + t * (aR.x - 0.5) * 2.0, ca = cos(a), sa = sin(a);
          vec2 q = vec2(position.x * ca - position.y * sa, position.x * sa + position.y * ca);
          vec3 w = c + (right * q.x + up * q.y) * s;
          vUv = uv; vS = aR.x;
          vA = smoothstep(0.0, 0.1, t) * (1.0 - t) * (1.0 - t) * 0.42;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying vec2 vUv; varying float vA; varying float vS;
        float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 q = vUv - 0.5; float r = length(q) * 2.0;
          float a = smoothstep(1.0, 0.2, r) * (0.55 + 0.45 * n(vUv * 4.0 + vS * 17.0));
          gl_FragColor = vec4(vec3(0.32, 0.31, 0.33), a * vA);
        }`,
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 6;
    roofG.add(m);
  }

  /* ======================= animation ======================= */
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
  function update(dt, time) {
    uTime.value = time;
    // trains glide along the guideways (a short dwell when passing a station)
    const im = trains.im;
    for (const t of trains) {
      t.s = (t.s + (t.dir * t.v * dt) / t.L + 1) % 1;
      for (let c = 0; c < TRAIN_CARS; c++) {
        const u = (t.s - (t.dir * c * (CAR_L + 0.8)) / t.L + 1) % 1;
        t.ln.curve.getPointAt(u, _p); t.ln.curve.getTangentAt(u, _t);
        _p.y = t.ln.yAt(u) + 2.0; _p.addScaledVector(new THREE.Vector3(-_t.z, 0, _t.x), t.dir * 2.0);
        _q.setFromAxisAngle(_up, -Math.atan2(_t.z, _t.x));
        _m4.compose(_p, _q, _s); im.setMatrixAt(t.i0 + c, _m4);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    // boats drift along the river, their light strings with them
    const pos = dyn.pos; let i = 0;
    boats.forEach((b, k) => {
      b.t = (b.t + b.v * dt + 1) % 1;
      river.getPointAt(b.t, _p); river.getTangentAt(b.t, _t);
      const nx = -_t.z, nz = _t.x, x = _p.x + nx * b.off, z = _p.z + nz * b.off, a = Math.atan2(_t.z, _t.x);
      _q.setFromAxisAngle(_up, -a); _m4.compose(_p.set(x, STREET_Y + 1.6, z), _q, _s); boats.im.setMatrixAt(k, _m4);
      const hide = calmAt(x, z) > 0.05 ? -9999 : 0;
      for (let j = 0; j < 14; j++, i++) {
        const u = j < 12 ? (j % 6) / 5 - 0.5 : j === 12 ? 0.5 : -0.5, v = j < 12 ? (j < 6 ? -1 : 1) : 0;
        pos[i * 3] = x + _t.x * u * 44 + nx * v * 5.2; pos[i * 3 + 1] = STREET_Y + (j < 12 ? 5.5 : 7) + hide; pos[i * 3 + 2] = z + _t.z * u * 44 + nz * v * 5.2;
      }
    });
    boats.im.instanceMatrix.needsUpdate = true;
    // a plane on final approach, crossing far off to the −z side, banking slowly down
    const pt = (time * 0.012) % 1, px = -2600 + pt * 5200, pz = -1500 - Math.sin(pt * Math.PI) * 300, py = 520 - pt * 300;
    for (let k = 0; k < 4; k++, i++) { pos[i * 3] = px + (k === 1 ? -14 : k === 2 ? 14 : 0); pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz + (k === 1 ? -8 : k === 2 ? 8 : 0); }
    dyn.geo.attributes.position.needsUpdate = true;
    // AC fans spin
    fans.forEach(([x, y, z], k) => { _q.setFromAxisAngle(_up, time * 14 + k); _m4.compose(_p.set(x, y, z), _q, _s); fanIM.setMatrixAt(k, _m4); });
    fanIM.instanceMatrix.needsUpdate = true;
  }

  const look = {
    sky: skyTex, envI: 0.55, bgI: 1, fog: 0x2a1e1c,
    key: 0xaab8ff, keyI: 0.7, hemiSky: 0x46527e, hemiGround: 0x2c2018, hemiI: 0.55, exposure: 1.12, bloom: 0.62, spots: 1,
  };
  void nTowers; void guidePts; void btsStations;
  return { group: root, update, look: { night: look, day: look }, fog: { night: [160, 2700], day: [160, 2700] } };
}
