// LANTERN FESTIVAL — ULTRA: Yi Peng night. Built lazily the first time Ultra is on (see the ULTRA contract in main.js) and
// shown only on Ultra. It replaces the High festival's low-poly pieces (`lite` in festival.js: field, tents, bunting, stage,
// khom canopies behind the ends, the merged crowd; the High sky lanterns are hidden) with:
//  • a starry full-moon sky dome (milky way, twinkling stars, a warm lantern haze low down at the sides, kept a cool dusky
//    violet beyond each baseline so the ball reads against it) + a painted copy of it as the environment light (`look`);
//  • about a thousand paper sky lanterns (khom loi) rising and drifting away from the release fields beside the court, plus
//    thousands of far-off ones rising from the villages and hills to the horizon, each with a soft glow;
//  • detailed Lanna khom lantern canopies (ribbed paper drums, gold collars, paper fringes, swaying) strung over the side
//    walkways, over the path to the temple and the stall lanes — never over the court;
//  • striped festival stalls with scalloped valances, lit counters and goods; string lights; bunting;
//  • a drum stage (Lanna pavilion roof, painted backdrop, great klong drums, drummers and dancers) behind the +z side;
//  • a Lanna temple (stepped three-tier roofs, chofa, gilded pediments, naga stairs, a golden chedi) behind a pond full of
//    floating krathong whose candles — and the temple, lamps and lanterns — reflect in the water (a mirrored copy seen
//    through a hole in the ground; no extra render pass);
//  • crowds: people along the walkways (watching, cheering, holding lanterns) and, far off, people releasing sky lanterns
//    (raise it overhead, let go, watch it rise — the lantern really leaves their hands), kneeling at the pond with krathong;
//  • tree lines with fairy lights, layered mountains, a lit temple on the mountain, village lights, fireflies.
// GAMEPLAY RULE: nothing new on or above the court + free zone. Every glowing thing in the sky is faded out inside a wedge
// around each match camera's view of the court (low down beyond each baseline: camClear()), lanterns are released only to
// the sides and drift away from the court, and the canopy lanterns nearest the camera axes are dimmed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { figureGeometry } from './market-crowd.js';
import { makeFireflies } from './life.js';
import { paint, vcMat } from './props.js';
import { TAU, rng, V2, place } from './temple-ultra.js';

const WY = -0.55;                                   // the pond's water level (the ground is at -0.12)
const _o = new THREE.Object3D();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------------- the keep-out wedge: what each match camera sees just behind the ball's flight ----------------
   camera at (-s·CAMX, CAMY, 0) looking toward +s·x. A point is "in the wedge" when it is within ~25° of the view axis
   sideways AND below ~20° of elevation — that is the far end of the court and the sky just above it. */
const WEDGE_GLSL = /* glsl */`
uniform vec2 uCam;
float clearOf(vec3 p, float sg) {
  float fwd = sg * p.x + uCam.x;
  if (fwd < 0.5) return 1.0;
  float az = abs(p.z) / fwd;
  float el = (p.y - uCam.y) / max(length(vec2(fwd, p.z)), 0.5);
  return 1.0 - (1.0 - smoothstep(0.38, 0.54, az)) * (1.0 - smoothstep(0.36, 0.56, el));
}
float camClear(vec3 p) { return clearOf(p, 1.0) * clearOf(p, -1.0); }
`;
function camClearJS(CAM, x, y, z) {
  let k = 1;
  for (const sg of [1, -1]) {
    const fwd = sg * x + CAM.x;
    if (fwd < 0.5) continue;
    const az = Math.abs(z) / fwd, el = (y - CAM.y) / Math.max(Math.hypot(fwd, z), 0.5);
    k *= 1 - (1 - smooth(0.38, 0.54, az)) * (1 - smooth(0.36, 0.56, el));
  }
  return k;
}

/* ---------------- small geometry helpers ---------------- */
// painted (vertex-coloured) copy of a geometry, placed
const P = (geo, col, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => paint(place(geo, x, y, z, ry, rx, rz, s), col);
function vcBatch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, o = {}) {
      const out = [];
      for (const [mat, list] of m) {
        const clean = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); if (!n.attributes.color) paint(n, 0xffffff); return n; });
        const mesh = new THREE.Mesh(mergeGeometries(clean), mat);
        mesh.castShadow = !!o.cast; mesh.receiveShadow = !!o.receive;
        parent.add(mesh); out.push(mesh);
      }
      m.clear(); return out;
    },
  };
}
// a lit-from-inside / floodlit surface: emissive = albedo × k, plus warm uplight fading with height (mirror-aware: the
// pond's mirrored copy sits below WY and is lit as its original)
function uplit(mat, { k = 0, up = 0, upY = 0, fall = 3, col = 0xffb070, wrap = 0.35, centre = [0, 0, 0], key = '' } = {}) {
  const U = { uSL: { value: k }, uUpK: { value: up }, uUpY: { value: upY }, uUpF: { value: fall }, uUpCol: { value: new THREE.Color(col) }, uUpW: { value: wrap }, uUpC: { value: new THREE.Vector3(...centre) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vUWP; varying vec3 vUWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vUWP = (wm * vec4(transformed, 1.0)).xyz; vUWN = mat3(wm) * objectNormal; }`);
    sh.fragmentShader = `varying vec3 vUWP; varying vec3 vUWN; uniform float uSL; uniform float uUpK; uniform float uUpY; uniform float uUpF; uniform vec3 uUpCol; uniform float uUpW; uniform vec3 uUpC;\n` +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uSL;
        if (uUpK > 0.0) {
          vec3 wp = vUWP; if (wp.y < ${WY.toFixed(3)}) wp.y = ${(2 * WY).toFixed(3)} - wp.y;
          vec3 toC = uUpC - wp; toC.y = 0.0;
          vec3 hn = vec3(vUWN.x, 0.0, vUWN.z);
          float face = dot(hn, toC) / (length(hn) * length(toC) + 1e-3);
          float up = exp(-max(wp.y - uUpY, 0.0) / uUpF);
          totalEmissiveRadiance += diffuseColor.rgb * uUpCol * uUpK * up * (uUpW + (1.0 - uUpW) * clamp(face, 0.0, 1.0));
        }`);
  };
  mat.customProgramCacheKey = () => 'fesUp' + key;
  return mat;
}

/* ---------------- sky: shared GLSL (dome + the env canvas use the same palette) ---------------- */
const MOON = new THREE.Vector3(0.42, 0.5, -0.76).normalize();
const SKY_GLSL = /* glsl */`
uniform float uTime; uniform vec3 uMoon;
vec3 h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vn3(p); p = p * 2.07 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return v; }
// 0 along the court's long axis (beyond the baselines), 1 out to the sides
float sideness(vec3 d) { return smoothstep(0.3, 0.85, abs(d.z) / (length(d.xz) + 1e-4)); }
vec3 skyGrad(vec3 d) {
  float e = max(d.y, 0.0), s = sideness(d);
  vec3 zen = vec3(0.004, 0.006, 0.026), mid = vec3(0.016, 0.014, 0.055);
  vec3 hzCool = vec3(0.06, 0.035, 0.085), hzWarm = vec3(0.30, 0.12, 0.05);
  vec3 c = mix(mid, zen, smoothstep(0.1, 0.8, e));
  vec3 hz = mix(hzCool, hzWarm, s);
  c = mix(c, hz, exp(-e / mix(0.07, 0.13, s)));
  // a broad warm glow over the lantern fields (the sky full of lanterns lights the haze)
  c += vec3(0.07, 0.03, 0.012) * s * exp(-e / 0.35);
  return c;
}
`;
function paintSkyCanvas() {
  const w = 256, h = 128, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let j = 0; j < h; j++) {
    const el = (0.5 - (j + 0.5) / h) * Math.PI, ce = Math.cos(el), se = Math.sin(el);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w - 0.5) * TAU, dx = ce * Math.cos(phi), dz = ce * Math.sin(phi);
      const e = Math.abs(se), s = smooth(0.3, 0.85, Math.abs(dz) / (Math.hypot(dx, dz) + 1e-4));
      let col = mix([0.016, 0.014, 0.055], [0.004, 0.006, 0.026], smooth(0.1, 0.8, e));
      col = mix(col, mix([0.06, 0.035, 0.085], [0.30, 0.12, 0.05], s), Math.exp(-e / (0.07 + 0.06 * s)));
      col = col.map((v, q) => v + [0.07, 0.03, 0.012][q] * s * Math.exp(-e / 0.35));
      if (se < 0) col = col.map((v, q) => v * 0.5 + [0.03, 0.018, 0.012][q]);       // the lantern-lit ground
      const ang = Math.acos(Math.max(-1, Math.min(1, dx * MOON.x + se * MOON.y + dz * MOON.z)));
      col = col.map((v, q) => v + [0.5, 0.52, 0.6][q] * (Math.exp(-ang / 0.05) * 0.6 + Math.exp(-ang / 0.3) * 0.05));
      const k = (j * w + i) * 4;
      for (let q = 0; q < 3; q++) img.data[k + q] = Math.min(255, Math.pow(Math.max(0, col[q]), 1 / 2.2) * 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
let skyTex = null;

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildFestivalUltra(ctx, uTime) {
  const { F } = ctx;
  const R = rng(9191);
  const root = new THREE.Group(); root.name = 'festival-ultra';
  const ticks = [];
  const kw = F.W / 7.0;
  const CAM = { x: F.hl + 6.9 * kw, y: 5.3 * kw };
  const uCam = { value: new THREE.Vector2(CAM.x, CAM.y) };
  const clearAt = (x, y, z) => camClearJS(CAM, x, y, z);
  const SIDE = F.outZ + 8;                                   // the stall rows (as on High)
  const WALK0 = F.outZ + 1.9, WALK1 = SIDE - 2.5;            // the side walkways (canopy posts stand on these lines)
  // the pond + temple lie beyond the −z stalls; the drum stage beyond the +z stalls
  const POND = { x: 0, z: -(SIDE + 31), hx: 34, hz: 12.5, r: 9 };
  const pondSD = (x, z) => { const qx = Math.abs(x - POND.x) - (POND.hx - POND.r), qz = Math.abs(z - POND.z) - (POND.hz - POND.r); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - POND.r; };
  const TZ = POND.z - POND.hz - 21;                         // the viharn's centre
  const STAGE_Z = SIDE + 11.5;

  const texLoad = (path, srgb = true, rep = 1) => { const t = ctx.texLoader.load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(rep, rep); return t; };

  const MAT = {
    vc: vcMat({ roughness: 0.8 }),
    vcD: vcMat({ roughness: 0.85, side: THREE.DoubleSide }),
    canvasIn: uplit(vcMat({ roughness: 0.9, side: THREE.DoubleSide }), { k: 0.55, key: 'cin' }),     // lit-from-inside stall canvas
    stageWood: uplit(vcMat({ roughness: 0.75 }), { k: 0.06, up: 0.9, upY: 1.2, fall: 3.5, col: 0xffa860, centre: [0, 0, 0], key: 'stg' }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3.2) }),
    bulbR: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a4a).multiplyScalar(2.6) }),
    wire: new THREE.LineBasicMaterial({ color: 0x0c0806 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0xa88a4a, roughness: 0.6 }),
  };

  /* =====================================================================
     1. SKY DOME — follows the camera; stars, milky way, full moon, warm lantern haze at the sides. Below the horizon it is
        the mirror of the sky (seen only through the pond).
     ===================================================================== */
  {
    const geo = new THREE.SphereGeometry(360, 64, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uTime, uMoon: { value: MOON } },
      vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: SKY_GLSL + `
        varying vec3 vDir;
        float starLayer(vec3 d, float sc, float dens, float px) {
          vec3 p = d * sc, c = floor(p), h = h33(c);
          if (h.x > dens) return 0.0;
          vec3 sd = normalize(c + 0.2 + 0.6 * h.zxy);
          float ang = length(d - sd);
          float r0 = 0.00045, r = max(r0, px * 0.9);
          float b = (0.25 + 0.75 * h.y * h.y) * (r0 * r0) / (r * r);
          float tw = 0.65 + 0.35 * sin(uTime * (0.7 + 2.5 * h.z) + h.x * 61.0);
          return b * tw * exp(-ang * ang / (r * r));
        }
        void main() {
          vec3 d = normalize(vDir);
          bool below = d.y < 0.0;
          vec3 s = below ? vec3(d.x, -d.y, d.z) : d;
          float px = max(length(fwidth(d)), 1e-5);
          vec3 c = skyGrad(s);
          float e = s.y;
          // milky way: a dusty band across the sky, faint
          vec3 mwN = normalize(vec3(0.55, 0.25, 0.8));
          float band = dot(s, mwN);
          float mw = exp(-band * band / 0.018) * smoothstep(0.02, 0.3, e);
          float dust = fbm3(s * 9.0), cl = fbm3(s * 22.0 + 7.0);
          c += vec3(0.05, 0.05, 0.075) * mw * (0.35 + 0.9 * cl) * smoothstep(0.25, 0.65, dust);
          // stars (fewer in the haze low down; dimmer beyond the baselines' low sky)
          float st = starLayer(s, 220.0, 0.3, px) * 2.4 + starLayer(s, 470.0, 0.12, px) * 1.4 + starLayer(s, 900.0, 0.05, px) * 1.0;
          st *= smoothstep(0.0, 0.25, e) * (1.0 + 1.5 * mw);
          c += vec3(0.92, 0.95, 1.0) * st;
          // full moon (Yi Peng falls on the full moon), mottled, with a soft halo
          float ma = acos(clamp(dot(s, uMoon), -1.0, 1.0));
          float disc = smoothstep(0.021 + px, 0.021 - px, ma);
          float mott = 0.78 + 0.22 * fbm3(s * 160.0);
          c = mix(c, vec3(1.0, 0.96, 0.86) * 1.7 * mott, disc);
          c += vec3(0.55, 0.58, 0.7) * (exp(-ma / 0.06) * 0.08 + exp(-ma / 0.35) * 0.018) * (1.0 - disc);
          if (below) c = c * 0.62 + vec3(0.004, 0.005, 0.012);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.frustumCulled = false; dome.renderOrder = -10;
    dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
    root.add(dome);
  }

  /* =====================================================================
     2. GROUND — the field (finer near the court, smooth, grass with trampled dirt), rolling hills, a hole for the pond
     ===================================================================== */
  const groundY = (x, z) => {
    const d = Math.hypot(x / 1.3, z);
    let y = -0.12 + Math.max(0, d - 90) * 0.18 * (0.6 + 0.4 * Math.sin(x * 0.03 + z * 0.02));
    if (d > 40) y += Math.min(1, (d - 40) / 30) * (0.35 * Math.sin(x * 0.07 + 1.3) * Math.sin(z * 0.06) + 0.2 * Math.sin(x * 0.17 + z * 0.13));
    return y;
  };
  {
    const xs = [], zs = [];
    const axis = (fine, half, nFine, nCoarse, out) => {
      for (let i = 0; i <= nCoarse; i++) out.push(-half + (half - fine) * (i / nCoarse));
      for (let i = 1; i < nFine; i++) out.push(-fine + 2 * fine * (i / nFine));
      for (let i = 0; i <= nCoarse; i++) out.push(fine + (half - fine) * (i / nCoarse));
    };
    axis(52, 230, 104, 26, xs); axis(78, 200, 156, 20, zs);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), sd = new Float32Array(nx * nz);
    const c = new THREE.Color(), grass = new THREE.Color(0x56703a), dirt = new THREE.Color(0x8a6a48), far = new THREE.Color(0x3a5230);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = xs[i], z = zs[j];
      let y = groundY(x, z);
      const s = pondSD(x, z); sd[k] = s;
      pos.set([x, y, z], k * 3); uv.set([x / 3.2, z / 3.2], k * 2);
      // trampled ground: the walkways round the court, the stall lanes, the path to the pond + temple, the stage front
      const ax = Math.abs(x), az = Math.abs(z);
      let tr = 0;
      tr = Math.max(tr, (1 - smooth(F.outX + 6, F.outX + 14, ax)) * (1 - smooth(SIDE + 2, SIDE + 6, az)));
      tr = Math.max(tr, (1 - smooth(60, 70, ax)) * smooth(SIDE - 4, SIDE - 1, az) * (1 - smooth(SIDE + 3, SIDE + 7, az)) * 0.8);
      tr = Math.max(tr, (1 - smooth(3, 6, Math.abs(x))) * (z < 0 ? 1 : 0) * (1 - smooth(-TZ + 10, -TZ + 16, az)));
      tr = Math.max(tr, (1 - smooth(10, 16, ax)) * (z > 0 ? 1 : 0) * smooth(SIDE, SIDE + 3, az) * (1 - smooth(STAGE_Z + 2, STAGE_Z + 6, az)));
      const n = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2) * Math.sin(z * 0.41 + x * 0.11);
      c.copy(grass).lerp(far, smooth(60, 140, Math.hypot(x, z))).lerp(dirt, Math.min(1, tr * (0.75 + 0.35 * n)));
      c.offsetHSL(0, 0, (R() - 0.5) * 0.04);
      col.set([c.r, c.g, c.b], k * 3);
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      if (Math.min(sd[a], sd[b], sd[d], sd[e]) < 1.4) continue;     // the pond (its stone rim hides the edge)
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const map = texLoad('assets/temple-ultra/leafy_grass_diff.jpg'), nor = texLoad('assets/temple-ultra/leafy_grass_nor_gl.jpg', false);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nor, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 });
    // the texture is a mid-grey-green leafy grass: use it as detail on the vertex colours (so dirt stays dirt)
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= clamp(lum * 2.4, 0.45, 1.5);`);
    };
    mat.customProgramCacheKey = () => 'fesGround';
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; root.add(m);
  }

  /* =====================================================================
     3. LANTERN MOTION (shared by the sky lanterns, their glows and their reflections)
     aL = (x0, z0, phase 0..1, rise speed m/s)   aD = (drift x, drift z per metre risen, size, hold s)   aY = start height
     ===================================================================== */
  const LANTERN_GLSL = /* glsl */`
    uniform float uTime; uniform float uMir;
    attribute vec4 aL; attribute vec4 aD; attribute float aY;
    ${WEDGE_GLSL}
    vec3 lanternPos(out float vis, out float life) {
      float sp = aL.w, rise = 170.0 / sp, hold = aD.w, cyc = hold + rise;
      float t = mod(uTime + aL.z * cyc, cyc);
      float up = max(t - hold, 0.0);
      float h = sp * up * up / (up + 5.0);
      life = up / rise;
      float sw = min(h * 0.04, 1.6);
      vec3 p = vec3(aL.x + aD.x * h + sin(uTime * 0.21 + aL.z * 37.0) * sw, aY + h, aL.y + aD.y * h + cos(uTime * 0.17 + aL.z * 23.0) * sw);
      float fin = hold > 0.0 ? smoothstep(0.0, 1.2, t) : smoothstep(0.0, 8.0, up);
      vis = fin * (1.0 - smoothstep(0.72, 1.0, life)) * camClear(p);
      return p;
    }`;

  /* ---------------- lantern release sites ---------------- */
  // fields beside the court where people release lanterns (never beyond the baselines): the +z field past the stage,
  // the pond banks and lawns on −z, and the far meadows on both sides
  const okSite = (x, z) => Math.abs(z) > 0.72 * (Math.abs(x) + CAM.x) + 8 && pondSD(x, z) > 2 && !(z < 0 && Math.abs(x) < 26 && z < TZ + 22 && z > TZ - 24);
  const fieldSite = () => {
    for (let n = 0; n < 200; n++) {
      const s = R() < 0.5 ? -1 : 1, x = (R() - 0.5) * 150, z = s * (SIDE + 14 + Math.pow(R(), 0.8) * 90);
      if (okSite(x, z) && !(s > 0 && Math.abs(x) < 14 && z < STAGE_Z + 6)) return [x, z];
    }
    return [0, 60];
  };

  /* =====================================================================
     4. CROWDS — instanced figures posed in the vertex shader
     modes: 0 watch (looks up at the lanterns) · 1 release a sky lantern · 2 cheer / clap · 3 walk · 4 drum · 5 dance (fon lep)
            6 kneel (floating a krathong) · 7 hold a lantern at the chest
     ===================================================================== */
  const crowd = [];        // { x, y, z, ry, mode, ph, cyc, hold, sx, sy, skin, shirt, pants, hair, variant, far, lit }
  const releasers = [];    // { x, y, z, ph, cyc, hold } → their lanterns
  const skins = [0x8a5a3a, 0xb07a52, 0xc99a72, 0x6b4a30, 0xa06a44], hairs = [0x0d0a08, 0x16100c, 0x221812, 0x2a2420];
  const shirtsBright = [0xf2f0ea, 0xd83a2a, 0x1f6fd8, 0xe8b82a, 0x2fa04a, 0x8a2a8a, 0x2a2a2a, 0xff8ac0, 0x1f8a8a, 0xe86a2a, 0xf2e2b8, 0x5a3a8a];
  const pants = [0x1a1c24, 0x2a2a30, 0x3a3226, 0x1c2a3c, 0x4a3a2a, 0xe8e2d4];
  const person = (o) => {
    const p = { y: -0.12, sx: 0.92 + R() * 0.16, sy: 0.9 + R() * 0.14, skin: skins[Math.floor(R() * skins.length)], shirt: shirtsBright[Math.floor(R() * shirtsBright.length)],
      pants: pants[Math.floor(R() * pants.length)], hair: hairs[Math.floor(R() * hairs.length)], variant: Math.floor(R() * 3), ph: R(), cyc: 1, hold: 0, len: 1, speed: 1, lit: 0.2, ...o };
    if (p.mode === 1) {
      // hold the lantern overhead for a few seconds, let go, watch it climb (its flight lasts ~170 m / speed)
      p.hold = 5 + R() * 3; p.speed = 0.85 + R() * 0.4; p.cyc = p.hold + 170 / p.speed;
      releasers.push(p);
    }
    crowd.push(p); return p;
  };
  // the walkways beside the court (replacing the High crowd): watching, cheering, a few with lanterns, some strolling
  for (const s of [-1, 1]) for (let i = 0; i < 95; i++) {
    const x = (R() * 2 - 1) * 60, z = s * (WALK0 + 0.6 + R() * (WALK1 - WALK0 - 0.4));
    if (Math.abs(x) < F.outX + 1.0 && Math.abs(z) < F.outZ + 2.4) continue;
    const r = R();
    const mode = r < 0.5 ? 0 : r < 0.68 ? 2 : r < 0.8 ? 7 : 3;
    const ry = mode === 3 ? (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (s > 0 ? Math.PI : 0) + (R() - 0.5) * 1.4;
    person({ x, z, ry, mode, far: Math.abs(x) > 13, len: 3 + R() * 6, speed: 0.8 + R() * 0.4, lit: 0.32 });
  }
  // stall-keepers behind their counters are added with the stalls (below)
  // far crowds: release fields (+z past the stage, the meadows), the pond banks; groups of friends releasing together
  {
    const groupAt = (cx, cz, n, rel = 0.55) => {
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, r = Math.sqrt(R()) * (1.2 + n * 0.18), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (pondSD(x, z) < 1.2) continue;
        const m = R() < rel ? 1 : R() < 0.75 ? 0 : 7;
        person({ x, y: groundY(x, z), z, ry: R() * TAU, mode: m, far: true, lit: m === 0 ? 0.15 : 0.35 });
      }
    };
    for (let g = 0; g < 26; g++) { const [x, z] = fieldSite(); groupAt(x, z, 4 + Math.floor(R() * 6)); }
    // the pond's near bank and the lawns either side of it
    for (let g = 0; g < 10; g++) {
      const sx = R() < 0.5 ? -1 : 1, x = sx * (POND.hx + 5 + R() * 18), z = POND.z + (R() - 0.5) * 24;
      groupAt(x, z, 3 + Math.floor(R() * 5), 0.6);
    }
    for (let i = 0; i < 16; i++) {                         // kneeling at the ghat steps, floating krathong
      const x = (R() - 0.5) * 11, z = POND.z + POND.hz + 0.15;
      person({ x, y: 0.12 - 0.45 * (0.5 + 0.5 * Math.sin(i)), z: z - 0.3 - (i % 2) * 0.7, ry: Math.PI, mode: 6, far: true, lit: 0.3 });
    }
    for (let i = 0; i < 26; i++) {                         // strollers on the bank paths
      const sx = R() < 0.5 ? -1 : 1, x = sx * (POND.hx + 2.5), z = POND.z - 10 + R() * 14;
      person({ x, y: groundY(x, z), z, ry: R() < 0.5 ? 0 : Math.PI, mode: 3, far: true, len: 8 + R() * 8, lit: 0.18 });
    }
  }

  /* =====================================================================
     5. STALLS — striped canopies with scalloped valances, lit inside, counters with goods, keepers; the −z row opens on a
        gateway to the pond, the +z row on the drum stage
     ===================================================================== */
  const bulbs = [];        // [x, y, z, warm?]
  const festoon = [];      // [[a, b, sag, n]] bulb strings
  const wires = [];        // line segments (pairs of Vector3)
  const stallSpots = [];
  {
    const B = vcBatch();
    const tentCols = [0xd83a2a, 0x1f6fd8, 0xe8b82a, 0x2fa04a, 0x8a2a8a, 0xe86a2a, 0x1f8a8a];
    for (const s of [-1, 1]) for (let x = -63; x <= 63; x += 6.3) {
      const gap = s < 0 ? 11 : 10.5;
      if (Math.abs(x) < gap) continue;
      stallSpots.push([x, s * (SIDE + 1 + R() * 1.2), s, tentCols[Math.floor(R() * tentCols.length)]]);
    }
    const W2 = 2.0, D2 = 1.75, EH = 2.35, RH = 1.25;
    for (const [x, z, s, col] of stallSpots) {
      const f = -s;                      // the stall faces the court (front at z + f·D2)
      const cA = new THREE.Color(col), cB = new THREE.Color(0xf4eee2);
      // posts
      for (const px of [-W2, W2]) for (const pz of [-D2, D2]) B.put(MAT.vc, P(new THREE.CylinderGeometry(0.045, 0.055, EH, 6), 0x9a7a44, x + px, EH / 2 - 0.12, z + pz));
      // striped gable canopy, ridge along x: 8 stripes per slope, built as strips (inside lit, outside lit by the night)
      const nS = 8;
      for (const side of [-1, 1]) for (let i = 0; i < nS; i++) {
        const x0 = x - W2 - 0.25 + (2 * W2 + 0.5) * (i / nS), x1 = x - W2 - 0.25 + (2 * W2 + 0.5) * ((i + 1) / nS);
        const zr = z, ze = z + side * (D2 + 0.35);
        const g = new THREE.BufferGeometry();
        // slight sag: midpoint of the slope pushed down 6 cm
        const pts = [], N = 3;
        for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N;
          const y0 = EH + RH * (1 - t0) - Math.sin(Math.PI * t0) * 0.08 - 0.12, y1 = EH + RH * (1 - t1) - Math.sin(Math.PI * t1) * 0.08 - 0.12;
          const z0 = zr + (ze - zr) * t0, z1 = zr + (ze - zr) * t1;
          pts.push(x0, y0, z0, x1, y0, z0, x0, y1, z1, x1, y0, z0, x1, y1, z1, x0, y1, z1);
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals();
        const cc = i % 2 ? cB : cA;
        B.put(MAT.canvasIn, paint(g.clone(), cc.clone().multiplyScalar(0.55).getHex()));
        B.put(MAT.vcD, paint(g, cc.getHex()));
      }
      // gable ends + scalloped valance along the front + back eaves
      for (const ex of [-1, 1]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([x + ex * (W2 + 0.25), EH - 0.12, z - D2 - 0.35, x + ex * (W2 + 0.25), EH - 0.12, z + D2 + 0.35, x + ex * (W2 + 0.25), EH + RH - 0.12, z], 3));
        g.computeVertexNormals(); B.put(MAT.vcD, paint(g, cB.getHex()));
      }
      for (const side of [-1, 1]) {
        const ze = z + side * (D2 + 0.36), sc = [];
        const n = 10;
        for (let i = 0; i < n; i++) {
          const xa = x - W2 - 0.25 + (2 * W2 + 0.5) * (i / n), xb = xa + (2 * W2 + 0.5) / n, xm = (xa + xb) / 2, yt = EH - 0.12, yb = yt - 0.28;
          const arc = 5;
          for (let k = 0; k < arc; k++) {
            const a0 = Math.PI * (k / arc), a1 = Math.PI * ((k + 1) / arc), r = (xb - xa) / 2;
            sc.push(xm, yt, ze, xm - Math.cos(a0) * r, yt - 0.12 - Math.sin(a0) * 0.16, ze, xm - Math.cos(a1) * r, yt - 0.12 - Math.sin(a1) * 0.16, ze);
          }
          sc.push(xa, yt, ze, xb, yt, ze, xm, yt - 0.12, ze);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sc, 3)); g.computeVertexNormals();
        B.put(MAT.vcD, paint(g, side === f ? cA.clone().lerp(new THREE.Color(0xffd27a), 0.3).getHex() : cA.getHex()));
      }
      // back + side cloth (lit from inside), counter with a cloth skirt, goods
      B.put(MAT.canvasIn, P(new THREE.PlaneGeometry(2 * W2, EH - 0.1), 0x8a7a64, x, EH / 2 - 0.1, z - f * D2, f > 0 ? 0 : Math.PI));
      B.put(MAT.vc, P(new THREE.BoxGeometry(2 * W2 - 0.4, 0.82, 0.62), 0x7a5232, x, 0.29, z + f * (D2 - 0.5)));
      B.put(MAT.canvasIn, P(new THREE.PlaneGeometry(2 * W2 - 0.38, 0.6), col, x, 0.3, z + f * (D2 - 0.18), f > 0 ? 0 : Math.PI));
      const goods = [0xff8a2a, 0xffe2a0, 0xd8382e, 0x7fbf3a, 0xf2c84a, 0xe86aa0, 0xffffff];
      for (let k = 0; k < 9; k++) {
        const gx = x - W2 + 0.5 + k * 0.42, gz = z + f * (D2 - 0.5) + (R() - 0.5) * 0.3, kind = Math.floor(R() * 3);
        if (kind === 0) B.put(MAT.canvasIn, P(new THREE.SphereGeometry(0.09, 7, 5), goods[k % goods.length], gx, 0.8, gz));
        else if (kind === 1) B.put(MAT.canvasIn, P(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 7), goods[(k + 3) % goods.length], gx, 0.8, gz));
        else B.put(MAT.canvasIn, P(new THREE.BoxGeometry(0.22, 0.08, 0.16), goods[(k + 5) % goods.length], gx, 0.74, gz, R()));
      }
      // a hand-lettered sign over the front, two hanging bulbs inside
      B.put(MAT.canvasIn, P(new THREE.BoxGeometry(1.6, 0.32, 0.04), 0xf2e2b8, x, EH + 0.05, z + f * (D2 + 0.39)));
      for (const bx of [-1, 1]) bulbs.push([x + bx * 0.9, EH - 0.35, z, 1]);
      // the keeper behind the counter
      person({ x: x + (R() - 0.5) * 1.6, z: z + f * (D2 - 1.25), ry: f > 0 ? 0 : Math.PI, mode: R() < 0.5 ? 2 : 0, far: Math.abs(x) > 15, lit: 0.55 });
    }
    // string lights along the stall fronts
    for (const s of [-1, 1]) {
      const row = stallSpots.filter((p) => p[2] === s).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i], b = row[i + 1];
        if (b[0] - a[0] > 8) continue;
        festoon.push([new THREE.Vector3(a[0] + W2, EH + 0.05, a[1] - s * (D2 + 0.4)), new THREE.Vector3(b[0] - W2, EH + 0.05, b[1] - s * (D2 + 0.4)), 0.25, 5]);
      }
    }
    B.build(root);
  }

  /* =====================================================================
     6. KHOM CANOPIES — Lanna hanging lanterns strung densely over the side walkways, the path to the temple and behind
        the stalls. Instanced (one draw call), lit paper in the shader, swaying.
     ===================================================================== */
  const khoms = [];          // [x, y, z, colour, dim, type]
  {
    const B = vcBatch();
    const posts = [];
    const KC = [0xff5a2e, 0xffae42, 0xffd27a, 0xff7a5a, 0xfff0c8, 0xff4a6a, 0xffc060];
    const string = (a, b, sag, step, colFn, dimFn, type = 0) => {
      const n = Math.max(2, Math.round(a.distanceTo(b) / step)), pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; pts.push(p); }
      for (let i = 0; i < n; i++) wires.push(pts[i], pts[i + 1]);
      for (let i = 1; i < n; i++) { const p = pts[i]; khoms.push([p.x, p.y, p.z, colFn(i), dimFn(p), type]); }
    };
    const postAt = (x, z, h) => { posts.push([x, z, h]); B.put(MAT.vc, P(new THREE.CylinderGeometry(0.07, 0.09, h + 0.15, 7), 0x9a7a44, x, h / 2 - 0.12, z)); B.put(MAT.vc, P(new THREE.SphereGeometry(0.11, 8, 6), 0xdba54c, x, h + 0.05, z)); };
    const pick = () => KC[Math.floor(R() * KC.length)];
    const dimOf = (p) => 0.3 + 0.7 * clearAt(p.x, p.y - 0.3, p.z);
    // side walkways: posts on both edges every ~4 m, wires criss-crossing between them (a lattice of lanterns)
    const X1 = F.outX + 6, H = 6.4;
    const fl = [F.outX + 1.4];                  // keep clear of the floodlight poles
    for (const s of [-1, 1]) {
      const xs = [];
      for (let x = -X1; x <= X1 + 0.01; x += (2 * X1) / 8) xs.push(x);
      const za = s * WALK0, zb = s * WALK1;
      for (const x of xs) for (const z of [za, zb]) {
        const nearFl = fl.some((fx) => Math.abs(Math.abs(x) - fx) < 0.8 && Math.abs(Math.abs(z) - (F.outZ + 1.6)) < 0.8);
        postAt(nearFl ? x + Math.sign(x || 1) * 0.9 : x, z, H);
      }
      for (let i = 0; i < xs.length - 1; i++) {
        const x0 = xs[i], x1 = xs[i + 1];
        string(new THREE.Vector3(x0, H, za), new THREE.Vector3(x1, H, zb), 0.4, 0.8, pick, dimOf);
        string(new THREE.Vector3(x0, H, zb), new THREE.Vector3(x1, H, za), 0.4, 0.8, pick, dimOf);
      }
      for (const z of [za, (za + zb) / 2, zb]) string(new THREE.Vector3(-X1, H + 0.05, z), new THREE.Vector3(X1, H + 0.05, z), 0.6, 0.85, pick, dimOf, z === (za + zb) / 2 ? 1 : 0);
    }
    // over the path from the gateway to the pond (−z): a tunnel of lanterns
    {
      const z0 = -(SIDE + 3), z1 = POND.z + POND.hz + 2.5, n = 6;
      for (let k = 0; k <= n; k++) { const z = z0 + (z1 - z0) * (k / n); for (const x of [-3.2, 3.2]) postAt(x, z, 4.6); }
      for (let k = 0; k < n; k++) {
        const za = z0 + (z1 - z0) * (k / n), zb = z0 + (z1 - z0) * ((k + 1) / n);
        string(new THREE.Vector3(-3.2, 4.6, za), new THREE.Vector3(3.2, 4.6, zb), 0.5, 0.6, pick, () => 1);
        string(new THREE.Vector3(3.2, 4.6, za), new THREE.Vector3(-3.2, 4.6, zb), 0.5, 0.6, pick, () => 1);
        string(new THREE.Vector3(-3.2, 4.6, za), new THREE.Vector3(3.2, 4.6, za), 0.45, 0.65, pick, () => 1, 1);
      }
    }
    // the lanes behind the stalls (seen over the tents): long strings from mast to mast
    for (const s of [-1, 1]) {
      const z = s * (SIDE + 6.5);
      for (let x = -60; x <= 60; x += 12) postAt(x, z, 6.2);
      for (let x = -60; x < 60; x += 12) {
        if (s < 0 && Math.abs(x + 6) < 10) continue;          // the temple path crosses here
        string(new THREE.Vector3(x, 6.2, z), new THREE.Vector3(x + 12, 6.2, z), 1.1, 1.0, pick, dimOf, (x / 12) & 1);
      }
    }
    B.build(root);
    // the gateway arch to the pond (two red posts, a curved gilded beam, a big khom cluster)
    {
      const G = vcBatch();
      const gz = -(SIDE + 0.6);
      for (const sx of [-1, 1]) {
        G.put(MAT.stageWood, P(new THREE.CylinderGeometry(0.17, 0.2, 5.4, 10), 0x8a1e17, sx * 3.6, 2.58, gz));
        G.put(MAT.stageWood, P(new THREE.CylinderGeometry(0.3, 0.34, 0.5, 10), 0xdba54c, sx * 3.6, 0.13, gz));
      }
      const beam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-4.4, 5.3], [-2, 5.85], [0, 6.0], [2, 5.85], [4.4, 5.3]].map(([x, y]) => new THREE.Vector3(x, y, gz))), 24, 0.14, 7);
      G.put(MAT.stageWood, paint(beam, 0xdba54c));
      G.put(MAT.stageWood, P(new THREE.BoxGeometry(7.6, 0.22, 0.24), 0x8a1e17, 0, 5.05, gz));
      G.build(root);
      for (let i = 0; i < 7; i++) khoms.push([-3 + i, 5.0, gz, KC[i % KC.length], 1, 1]);
    }
  }
  {
    // khom geometry: hook string, gilded top collar, ribbed paper drum, flared skirt, paper fringe (aP: 0 paper, 1 trim, 2 fringe)
    const parts = [];
    const tagP = (g, part) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); n.setAttribute('aP', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count).fill(part), 1)); parts.push(n); };
    tagP(new THREE.LatheGeometry(V2([[0.0, -0.24], [0.2, -0.28], [0.24, -0.33]]), 9), 1);
    tagP(new THREE.LatheGeometry(V2([[0.24, -0.33], [0.28, -0.47], [0.27, -0.62], [0.24, -0.72]]), 9), 0);
    tagP(new THREE.LatheGeometry(V2([[0.24, -0.72], [0.36, -0.8], [0.0, -0.78]]), 9), 1);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, g = new THREE.PlaneGeometry(0.05, 0.24); g.translate(0, -0.92, 0); g.rotateY(-a); g.translate(Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31); tagP(g, 2); }
    const geo = new THREE.InstancedBufferGeometry().copy(mergeGeometries(parts));
    const n = khoms.length;
    const aK = new Float32Array(n * 4), aC = new Float32Array(n * 4), c = new THREE.Color();
    khoms.forEach(([x, y, z, col, dim, type], i) => { aK.set([x, y, z, R() * 100], i * 4); c.set(col); aC.set([c.r, c.g, c.b, dim * (type ? 1.15 : 1)], i * 4); });
    geo.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute vec4 aK; attribute vec4 aC; attribute float aP; varying vec3 vL; varying vec3 vN; varying float vP; varying vec4 vC; varying vec3 vV;
        void main() {
          vec3 p = position; float ph = aK.w;
          float ax = sin(uTime * 0.9 + ph) * 0.05 + sin(uTime * 2.1 + ph * 1.7) * 0.015, az = cos(uTime * 0.7 + ph * 1.3) * 0.05;
          p.yz = mat2(cos(ax), sin(ax), -sin(ax), cos(ax)) * p.yz; p.xy = mat2(cos(az), sin(az), -sin(az), cos(az)) * p.xy;
          float sp = aP > 1.5 ? 1.0 : 0.0;           // the fringe flutters a little more
          p.x += sp * sin(uTime * 3.0 + ph + position.y * 6.0) * 0.02 * (-0.8 - position.y);
          vL = position; vN = normal; vP = aP; vC = aC;
          vec4 wp = modelMatrix * vec4(p + aK.xyz, 1.0);
          vV = cameraPosition - wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `varying vec3 vL; varying vec3 vN; varying float vP; varying vec4 vC; varying vec3 vV;
        void main() {
          float a = atan(vL.z, vL.x);
          vec3 col;
          if (vP < 0.5) {
            float rib = smoothstep(0.75, 1.0, abs(cos(a * 5.0)));
            float mid = 1.0 - pow(abs((vL.y + 0.53) / 0.2), 2.0) * 0.45;
            float band = smoothstep(0.012, 0.0, abs(vL.y + 0.42)) + smoothstep(0.012, 0.0, abs(vL.y + 0.64));
            col = vC.rgb * (2.1 * mid) * (1.0 - 0.45 * rib) + vec3(0.8, 0.3, 0.05) * band;
          } else if (vP < 1.5) {
            float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV + 1e-4))), 2.0);
            col = vec3(0.55, 0.32, 0.08) * (0.35 + 0.9 * fr) + vC.rgb * 0.25;
          } else {
            col = vC.rgb * (0.45 + 0.9 * (vL.y + 1.04));
          }
          gl_FragColor = vec4(col * vC.a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    root.add(mesh);
    // wires
    const wg = new THREE.BufferGeometry().setFromPoints(wires);
    root.add(new THREE.LineSegments(wg, MAT.wire));
  }

  /* =====================================================================
     7. DRUM STAGE (+z, facing the court): teak platform, Lanna pavilion roof, painted backdrop, klong drums, drummers,
        fon lep dancers, lantern clusters
     ===================================================================== */
  {
    const B = vcBatch();
    const z0 = STAGE_Z, W = 8, D = 3.6, H = 1.25;
    const fz = -1;                                         // the front faces −z (the court)
    const wd = MAT.stageWood;
    B.put(wd, P(new THREE.BoxGeometry(2 * W, H, 2 * D), 0x5a3a24, 0, H / 2 - 0.12, z0));
    B.put(wd, P(new THREE.BoxGeometry(2 * W + 0.3, 0.12, 2 * D + 0.3), 0x6b4a30, 0, H - 0.06, z0));
    B.put(wd, P(new THREE.BoxGeometry(2 * W + 0.32, 0.22, 0.08), 0xdba54c, 0, H - 0.25, z0 + fz * (D + 0.17)));
    for (let i = 0; i < 4; i++) B.put(wd, P(new THREE.BoxGeometry(4.2, 0.2, 0.42), 0x6b4a30, 0, 0.1 + i * 0.28 - 0.12, z0 + fz * (D + 0.4 + (3 - i) * 0.4)));   // steps
    // red + gold pillars and the pavilion roof (two tiers, gilded gables, chofa)
    const PH = 6.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.put(wd, P(new THREE.CylinderGeometry(0.2, 0.22, PH, 10), 0x8a1e17, sx * (W - 0.4), H + PH / 2, z0 + sz * (D - 0.4)));
      B.put(wd, P(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 10), 0xdba54c, sx * (W - 0.4), H + 0.12, z0 + sz * (D - 0.4)));
      B.put(wd, P(new THREE.CylinderGeometry(0.26, 0.2, 0.4, 10), 0xdba54c, sx * (W - 0.4), H + PH - 0.2, z0 + sz * (D - 0.4)));
    }
    const gable = (y0, hw, hd, rise, col, edge) => {
      // two slopes (ridge along x) + gilded triangular pediments at both ends
      for (const sd of [-1, 1]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-hw, y0, z0 + sd * hd, hw, y0, z0 + sd * hd, -hw + 0.6, y0 + rise, z0, hw, y0, z0 + sd * hd, hw - 0.6, y0 + rise, z0, -hw + 0.6, y0 + rise, z0], 3));
        if (sd > 0) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) { for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } } }
        g.computeVertexNormals(); B.put(MAT.vcD, paint(g, col));
        B.put(wd, P(new THREE.BoxGeometry(2 * hw + 0.1, 0.12, 0.14), edge, 0, y0 - 0.04, z0 + sd * hd));
      }
      for (const ex of [-1, 1]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([ex * (hw - 0.55), y0, z0 - hd * 0.92, ex * (hw - 0.55), y0, z0 + hd * 0.92, ex * (hw - 0.6), y0 + rise - 0.05, z0], 3));
        g.computeVertexNormals(); B.put(wd, paint(g, 0xc8902c));
      }
      // chofa finials curling up at both ridge ends + gilded bargeboards
      for (const ex of [-1, 1]) {
        B.put(wd, paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0], [0.12, 0.3], [0.05, 0.62], [-0.2, 0.75]].map(([a, b]) => new THREE.Vector3(ex * (hw - 0.6 + a), y0 + rise + b, z0))), 10, 0.06, 5), 0xf0c050));
        for (const sd of [-1, 1]) B.put(wd, paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(ex * (hw - 0.6), y0 + rise, z0), new THREE.Vector3(ex * (hw - 0.55), y0 + rise * 0.5, z0 + sd * hd * 0.5), new THREE.Vector3(ex * (hw - 0.5), y0 + 0.05, z0 + sd * hd), new THREE.Vector3(ex * (hw - 0.45), y0 + 0.35, z0 + sd * (hd + 0.2))]), 12, 0.05, 4), 0xf0c050));
      }
    };
    gable(H + PH, W + 0.9, D + 1.3, 2.1, 0x7a2418, 0xdba54c);
    gable(H + PH + 2.0, W - 1.8, D + 0.3, 1.9, 0x8a2a1a, 0xdba54c);
    // the painted backdrop: deep red with a gilded sun-and-lotus motif (canvas texture)
    {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#3a0a0a'); gr.addColorStop(1, '#6a1410'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#e8b04a'; g.lineWidth = 3;
      g.beginPath(); g.arc(256, 150, 70, Math.PI, 0); g.stroke();
      for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; g.beginPath(); g.moveTo(256 + Math.cos(a) * 80, 150 + Math.sin(a) * 80); g.lineTo(256 + Math.cos(a) * 118, 150 + Math.sin(a) * 118); g.stroke(); }
      g.fillStyle = '#e8b04a';
      for (let i = 0; i < 7; i++) { const a = Math.PI + ((i + 0.5) / 7) * Math.PI; g.beginPath(); g.ellipse(256 + Math.cos(a) * 40, 150 + Math.sin(a) * 40, 7, 26, a + Math.PI / 2, 0, TAU); g.fill(); }
      for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 16, 228); g.lineTo(x + 32, 256); g.fill(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 22); g.lineTo(x + 32, 0); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 });
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(2 * W - 1.2, PH - 0.6), m);
      bd.position.set(0, H + (PH - 0.6) / 2, z0 + D - 0.5); bd.rotation.y = Math.PI; root.add(bd);
    }
    // drums: three klong sabat chai on low stands across the front, a giant klong on its cart at one side
    const drumGeo = (r, len) => new THREE.LatheGeometry(V2([[0, -len / 2], [r * 0.92, -len / 2], [r, -len * 0.3], [r * 1.05, 0], [r, len * 0.3], [r * 0.92, len / 2], [0, len / 2]]), 20);
    const drums = [];
    for (const dx of [-4.4, -1.5, 1.5, 4.4]) {
      const y = H + 0.95;
      B.put(wd, P(drumGeo(0.42, 0.75), 0x9a1e16, dx, y, z0 - 0.4, 0, Math.PI / 2 - 0.35));
      for (const off of [-0.25, 0.25]) B.put(wd, P(new THREE.TorusGeometry(0.43, 0.025, 5, 20), 0xdba54c, dx, y + Math.sin(0.35) * off, z0 - 0.4 + Math.cos(0.35) * off, 0, -0.35));
      B.put(wd, P(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20), 0xd8c8a0, dx, y + Math.sin(0.35) * 0.375, z0 - 0.4 - Math.cos(0.35) * 0.375, 0, Math.PI / 2 - 0.35));
      for (const lx of [-0.3, 0.3]) B.put(wd, P(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5), 0x3a2416, dx + lx, H + 0.33, z0 - 0.4));
      drums.push([dx, z0 - 1.25]);
    }
    {
      const gx = W + 3.4, gz = z0 - 1, y = 1.6;
      B.put(wd, P(drumGeo(1.05, 1.9), 0x7a1a12, gx, y, gz, Math.PI / 2, Math.PI / 2));
      for (const off of [-0.6, 0, 0.6]) B.put(wd, P(new THREE.TorusGeometry(1.06, 0.04, 6, 28), 0xdba54c, gx + off, y, gz, Math.PI / 2));
      for (const ex of [-1, 1]) B.put(wd, P(new THREE.CylinderGeometry(1.0, 1.0, 0.02, 28), 0xd8c8a0, gx + ex * 0.95, y, gz, 0, 0, Math.PI / 2));
      B.put(wd, P(new THREE.BoxGeometry(2.6, 0.18, 1.6), 0x4a2a18, gx, 0.45, gz));
      for (const ex of [-1, 1]) for (const ez of [-1, 1]) B.put(wd, P(new THREE.TorusGeometry(0.32, 0.06, 6, 14), 0x3a2416, gx + ex * 0.9, 0.3, gz + ez * 0.85));
      for (const ex of [-1, 1]) B.put(wd, P(new THREE.BoxGeometry(0.12, 1.4, 1.2), 0x5a3220, gx + ex * 0.6, 1.0, gz));
      person({ x: gx - 1.7, z: gz, ry: Math.PI / 2, mode: 4, far: false, lit: 0.6 });
    }
    // drummers behind the drums, dancers in front of the backdrop
    for (const [dx, dz] of drums) person({ x: dx, y: H - 0.12, z: dz, ry: 0, mode: 4, far: false, lit: 0.65, shirt: 0xc8302a, pants: 0x1a1414 });
    for (const dx of [-5.6, -2.9, 2.9, 5.6]) person({ x: dx, y: H - 0.12, z: z0 + 1.6, ry: Math.PI, mode: 5, far: false, lit: 0.7, shirt: 0xe8a830, pants: 0x8a1e3a, variant: 1 });
    // khom clusters hanging under the eaves + string lights along the front
    for (let i = 0; i < 9; i++) khoms.push([-W + 1 + i * ((2 * W - 2) / 8), H + PH - 0.3, z0 - D - 0.2, [0xffae42, 0xff5a2e, 0xffd27a][i % 3], 1, 1]);
    festoon.push([new THREE.Vector3(-W - 0.9, H + PH - 0.05, z0 - D - 1.25), new THREE.Vector3(W + 0.9, H + PH - 0.05, z0 - D - 1.25), 0.4, 26]);
    B.build(root);
    // the crowd in front of the stage
    for (let i = 0; i < 46; i++) {
      const x = (R() - 0.5) * 18, z = z0 - D - 2.2 - R() * 4.2;
      if (Math.abs(z) < SIDE + 2.6) continue;
      person({ x, z, ry: (R() - 0.5) * 0.8, mode: R() < 0.55 ? 2 : 0, far: R() < 0.5, lit: 0.45 });
    }
  }

  /* =====================================================================
     8. THE TEMPLE + POND (−z): a Lanna viharn with stepped three-tier roofs, a golden chedi, white chedis, a low wall,
        lamps, big trees — all floodlit — and their mirror image in the pond
     ===================================================================== */
  const mirrorables = [];      // meshes to be mirrored in the pond
  {
    const plasterT = texLoad('assets/temple-ultra/clay_plaster_diff.jpg');
    const roofT = texLoad('assets/temple/roof_diff.jpg');
    const C = [0, 0, POND.z + 10];
    const M = {
      plaster: uplit(new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.85, map: plasterT }), { up: 0.38, upY: 0.8, fall: 3.5, col: 0xffc890, wrap: 0.3, centre: C, key: 'pl' }),
      gold: uplit(new THREE.MeshStandardMaterial({ color: 0xe0a848, metalness: 0.85, roughness: 0.32 }), { k: 0.05, up: 0.9, upY: 0.5, fall: 7, col: 0xffc070, wrap: 0.5, centre: C, key: 'gd' }),
      red: uplit(new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.6 }), { up: 0.5, upY: 1, fall: 4, col: 0xffb070, centre: C, key: 'rd' }),
      roof: uplit(new THREE.MeshStandardMaterial({ color: 0x8a3a20, roughness: 0.55, map: roofT, side: THREE.DoubleSide }), { k: 0.0, up: 0.1, upY: 4, fall: 2, col: 0xffb070, wrap: 0.6, centre: C, key: 'rf' }),
      roofG: uplit(new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.55, side: THREE.DoubleSide }), { up: 0.35, upY: 4, fall: 3, col: 0xffb070, wrap: 0.6, centre: C, key: 'rg' }),
      win: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(1.6) }),
      leaf: uplit(new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 0.9 }), { up: 0.45, upY: 0, fall: 6, col: 0xffb070, wrap: 0.4, centre: C, key: 'lf' }),
      bark: new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.9 }),
    };
    const roofUV = (g, s = 0.5) => { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * s; uv[i * 2 + 1] = (p.getY(i) + p.getZ(i)) * s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
    const T = new Map();
    const put = (mat, geo) => { if (!T.has(mat)) T.set(mat, []); const n = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); T.get(mat).push(n); };
    const tz = TZ, ty = 1.0;                       // viharn centre z, terrace top
    // terrace + wall
    put(M.plaster, place(new THREE.BoxGeometry(26, ty + 0.12, 40), 0, (ty - 0.12) / 2, tz - 2));
    put(M.gold, place(new THREE.BoxGeometry(26.1, 0.12, 40.1), 0, ty - 0.05, tz - 2));
    for (let i = 0; i < 6; i++) put(M.plaster, place(new THREE.BoxGeometry(8, 0.17, 0.5), 0, 0.03 + i * 0.17, tz + 18 + (5 - i) * 0.5));                 // front steps
    // naga balustrades either side of the steps: undulating bodies rising to rearing heads
    for (const sx of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(sx * 4.3, 0.55 + t * (ty + 0.1) + Math.sin(t * Math.PI * 3) * 0.08, tz + 21.2 - t * 3.6)); }
      pts.unshift(new THREE.Vector3(sx * 4.3, 1.5, tz + 22.2), new THREE.Vector3(sx * 4.3, 0.75, tz + 21.8));
      put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.17, 8));
      put(M.gold, place(new THREE.ConeGeometry(0.36, 0.9, 7), sx * 4.3, 1.75, tz + 22.25, 0, -0.5));
      for (let k = 0; k < 5; k++) put(M.gold, place(new THREE.ConeGeometry(0.08, 0.55, 5), sx * 4.3 + (k - 2) * 0.13, 2.0 + Math.cos((k - 2) * 0.6) * 0.1, tz + 22.05, 0, -0.3, (k - 2) * -0.35));
    }
    // walls + windows (lit inside)
    const WX = 6, WZ0 = tz - 13, WZ1 = tz + 11, WH = 4.6;
    put(M.plaster, place(new THREE.BoxGeometry(2 * WX, WH, WZ1 - WZ0), 0, ty + WH / 2, (WZ0 + WZ1) / 2));
    put(M.plaster, place(new THREE.BoxGeometry(2 * WX + 0.5, 0.6, WZ1 - WZ0 + 0.5), 0, ty + 0.3, (WZ0 + WZ1) / 2));
    for (let z = WZ0 + 2.2; z < WZ1 - 1; z += 2.9) for (const sx of [-1, 1]) {
      put(M.win, place(new THREE.PlaneGeometry(1.0, 1.9), sx * (WX + 0.02), ty + 2.2, z, sx * Math.PI / 2));
      put(M.gold, place(new THREE.BoxGeometry(0.12, 2.3, 1.35), sx * (WX + 0.04), ty + 2.2, z));
      put(M.gold, place(new THREE.ConeGeometry(0.8, 0.7, 4).rotateY(Math.PI / 4).scale(0.15, 1, 1), sx * (WX + 0.06), ty + 3.65, z));
    }
    // the open porch: red columns with gilded capitals, the great door glowing
    for (const x of [-4.6, -1.7, 1.7, 4.6]) {
      put(M.red, place(new THREE.CylinderGeometry(0.3, 0.34, 5.0, 14), x, ty + 2.5, WZ1 + 3.6));
      put(M.gold, place(new THREE.CylinderGeometry(0.42, 0.3, 0.5, 14), x, ty + 4.9, WZ1 + 3.6));
      put(M.gold, place(new THREE.CylinderGeometry(0.38, 0.42, 0.3, 14), x, ty + 0.15, WZ1 + 3.6));
    }
    put(M.win, place(new THREE.PlaneGeometry(2.4, 3.4), 0, ty + 1.7, WZ1 + 0.02));
    put(M.gold, place(new THREE.BoxGeometry(3.0, 3.9, 0.12), 0, ty + 1.95, WZ1 + 0.0));
    put(M.gold, place(new THREE.ConeGeometry(1.9, 1.4, 4).rotateY(Math.PI / 4).scale(1, 1, 0.08), 0, ty + 4.5, WZ1 + 0.05));
    put(M.plaster, place(new THREE.BoxGeometry(2 * WX + 0.4, 0.4, 4.4), 0, ty + 0.2, WZ1 + 2.2));
    // roofs: Lanna-style — low sweeping, stepped down in tiers toward the front, with a skirt of lean-to roofs at the sides
    const roofTier = (z0, z1, hw, ye, yr, mat = M.roof) => {
      const g = new THREE.BufferGeometry(), sag = (t) => -Math.sin(Math.PI * t) * 0.25;
      const pos = [], N = 4;
      for (const sd of [-1, 1]) for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        const xa = sd * hw * (1 - t0), xb = sd * hw * (1 - t1), ya = ye + (yr - ye) * t0 + sag(t0), yb = ye + (yr - ye) * t1 + sag(t1);
        const A = [xa, ya, z0], B2 = [xa, ya, z1], Cc = [xb, yb, z0], D2 = [xb, yb, z1];
        if (sd > 0) pos.push(...A, ...Cc, ...B2, ...B2, ...Cc, ...D2); else pos.push(...A, ...B2, ...Cc, ...B2, ...D2, ...Cc);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); roofUV(g, 0.45);
      put(mat, g);
      // green glazed border along the eaves, gilded bargeboards + pediment at the front gable, chofa + hang hong
      for (const sd of [-1, 1]) put(M.roofG, place(new THREE.BoxGeometry(0.5, 0.1, z1 - z0), sd * (hw - 0.25), ye + 0.05, (z0 + z1) / 2, 0, 0, sd * Math.atan2(yr - ye, hw) * -1));
      for (const zz of [z0, z1]) {
        const ped = new THREE.BufferGeometry();
        ped.setAttribute('position', new THREE.Float32BufferAttribute([-hw + 0.6, ye + 0.15, zz, hw - 0.6, ye + 0.15, zz, 0, yr - 0.15, zz], 3)); ped.computeVertexNormals();
        put(M.red, ped);                                          // lacquered gable, gilded rays + a gilded medallion
        for (let r = 0; r < 5; r++) { const a = Math.PI * (0.15 + 0.7 * (r / 4)), L = (yr - ye) * 0.55; put(M.gold, place(new THREE.BoxGeometry(0.08, L, 0.06), Math.cos(a) * L * 0.5, ye + 0.3 + Math.sin(a) * L * 0.5, zz + Math.sign(zz - tz) * 0.04, 0, 0, a - Math.PI / 2)); }
        put(M.gold, place(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 14), 0, ye + 0.45 + (yr - ye) * 0.3, zz + Math.sign(zz - tz) * 0.05, 0, Math.PI / 2));
        for (const sd of [-1, 1]) {
          put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, yr + 0.05, zz), new THREE.Vector3(sd * hw * 0.5, (ye + yr) / 2 + 0.05 - 0.15, zz), new THREE.Vector3(sd * (hw - 0.1), ye + 0.1, zz), new THREE.Vector3(sd * (hw + 0.2), ye + 0.55, zz)]), 20, 0.09, 5));
        }
        put(M.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0], [0, 0.4], [-0.05, 0.85], [0.1, 1.15], [0.35, 1.25]].map(([a, b]) => new THREE.Vector3(0, yr + b, zz + Math.sign(zz - tz) * (a + 0.05)))), 12, 0.09, 6));
      }
    };
    roofTier(WZ0 + 1.5, WZ1 - 1.5, 7.6, ty + 5.0, ty + 11.0);
    roofTier(WZ1 - 2.0, WZ1 + 2.0, 7.0, ty + 4.5, ty + 9.9);
    roofTier(WZ1 + 1.6, WZ1 + 5.0, 6.2, ty + 4.0, ty + 8.6);
    roofTier(WZ0 - 1.8, WZ0 + 2.0, 7.0, ty + 4.5, ty + 9.9);
    for (const sd of [-1, 1]) {                                   // lean-to skirt roofs down the sides
      const g = new THREE.BufferGeometry(), x0 = sd * (WX + 0.2), x1 = sd * (WX + 3.2), y0 = ty + WH + 0.4, y1 = ty + WH - 1.0;
      const A = [x0, y0, WZ0], B2 = [x0, y0, WZ1], Cc = [x1, y1, WZ0], D2 = [x1, y1, WZ1];
      g.setAttribute('position', new THREE.Float32BufferAttribute(sd > 0 ? [...A, ...B2, ...Cc, ...Cc, ...B2, ...D2] : [...A, ...Cc, ...B2, ...Cc, ...D2, ...B2], 3));
      g.computeVertexNormals(); roofUV(g, 0.45); put(M.roof, g);
      put(M.roofG, place(new THREE.BoxGeometry(0.45, 0.1, WZ1 - WZ0), x1, y1 + 0.03, (WZ0 + WZ1) / 2));
      for (let z = WZ0 + 1; z <= WZ1 - 1; z += 3) put(M.red, place(new THREE.CylinderGeometry(0.16, 0.18, WH - 1.0, 8), sd * (WX + 3.0), ty + (WH - 1.0) / 2, z));
    }
    // golden chedi (Lanna: square stepped base, round bell, rings, a tall spire with a gilded parasol) and two white ones
    const chedi = (x, z, s, mat, matTop) => {
      for (let i = 0; i < 3; i++) put(mat, place(new THREE.BoxGeometry((5.6 - i * 0.9) * s, 0.8 * s, (5.6 - i * 0.9) * s), x, (0.4 + i * 0.8) * s, z));
      put(mat, place(new THREE.CylinderGeometry(1.9 * s, 2.1 * s, 0.9 * s, 8), x, 2.85 * s, z, Math.PI / 8));
      put(matTop, place(new THREE.LatheGeometry(V2([[2.05, 0], [1.9, 0.3], [1.7, 0.35], [1.75, 0.6], [1.55, 0.7], [1.6, 1.0], [1.95, 1.6], [2.0, 2.4], [1.85, 3.1], [1.45, 3.7], [0.95, 4.1], [0.7, 4.25], [0.75, 4.5], [0.62, 4.6], [0.6, 5.0], [0.45, 5.6], [0.4, 6.3], [0.3, 7.4], [0.22, 8.6], [0.12, 9.6], [0.04, 10.2], [0, 10.4]]), 28), x, 3.3 * s, z, 0, 0, 0, s));
      for (let i = 0; i < 6; i++) put(matTop, place(new THREE.TorusGeometry((0.55 - i * 0.05) * s, 0.06 * s, 5, 18), x, (3.3 + 5.6 + i * 0.35) * s, z, 0, Math.PI / 2));
      put(matTop, place(new THREE.ConeGeometry(0.45 * s, 0.18 * s, 12), x, (3.3 + 8.1) * s, z));
    };
    chedi(17, tz - 8, 1.75, M.gold, M.gold);
    chedi(-15, tz - 3, 0.9, M.plaster, M.gold);
    chedi(-21, tz - 11, 0.75, M.plaster, M.gold);
    // the low temple wall with gilded caps, and lamp posts along the bank
    for (const [x0, z0, x1, z1] of [[-13, tz + 17.5, -4.6, tz + 17.5], [4.6, tz + 17.5, 13, tz + 17.5], [-13, tz + 17.5, -13, tz - 21], [13, tz + 17.5, 13, tz - 21]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      put(M.plaster, place(new THREE.BoxGeometry(len, 1.1, 0.4), (x0 + x1) / 2, ty + 0.55, (z0 + z1) / 2, ry));
      put(M.gold, place(new THREE.BoxGeometry(len, 0.08, 0.5), (x0 + x1) / 2, ty + 1.14, (z0 + z1) / 2, ry));
      for (let t = 0; t <= len; t += 2.4) { const px = x0 + (x1 - x0) * (t / len), pz = z0 + (z1 - z0) * (t / len); put(M.plaster, place(new THREE.BoxGeometry(0.5, 1.5, 0.5), px, ty + 0.75, pz)); put(M.gold, place(new THREE.ConeGeometry(0.3, 0.5, 4), px, ty + 1.75, pz, Math.PI / 4)); }
    }
    const lampHeads = [];
    for (const sx of [-1, 1]) for (let x = 6; x <= 30; x += 6) {
      const z = POND.z - POND.hz - 2.2;
      put(M.red, place(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8), sx * x, 1.08, z));
      put(M.gold, place(new THREE.ConeGeometry(0.3, 0.35, 6), sx * x, 2.75, z));
      lampHeads.push([sx * x, 2.45, z]);
    }
    for (const [x, y, z] of lampHeads) put(M.win, place(new THREE.BoxGeometry(0.3, 0.42, 0.3), x, y, z));
    // big trees (rain trees / bodhi) beside the viharn and along the pond
    const trees = [[-26, tz + 8, 1.3], [27, tz + 10, 1.2], [-34, POND.z - 4, 1.0], [38, POND.z + 2, 1.1], [-40, POND.z + 9, 0.85], [44, POND.z - 9, 0.9], [-6, tz - 24, 1.2], [9, tz - 23, 1.0]];
    const fairy = [];
    for (const [x, z, s] of trees) {
      const y0 = groundY(x, z);
      put(M.bark, place(new THREE.CylinderGeometry(0.35 * s, 0.6 * s, 6 * s, 9), x, y0 + 3 * s, z));
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + x; put(M.bark, place(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3.6 * s, 6), x + Math.cos(a) * 1.0 * s, y0 + 6.6 * s, z + Math.sin(a) * 1.0 * s, 0, Math.cos(a) * 0.6, -Math.sin(a) * 0.6)); }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + x, r = k === 0 ? 0 : 3.4 * s, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, by = y0 + (k === 0 ? 9.5 : 8.0 + R() * 1.5) * s;
        const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); const nn = 1 + 0.16 * Math.sin(v.x * 5 + k) * Math.sin(v.y * 4 + x) + 0.1 * Math.sin(v.z * 9 + v.x * 3); p.setXYZ(i, v.x * nn, v.y * nn, v.z * nn); }
        g.computeVertexNormals();
        put(M.leaf, place(g, bx, by, bz, 0, 0, 0, 1).scale(1, 1, 1).applyMatrix4(new THREE.Matrix4().makeTranslation(-bx, -by, -bz)).applyMatrix4(new THREE.Matrix4().makeScale(3.4 * s, 2.0 * s, 3.4 * s)).applyMatrix4(new THREE.Matrix4().makeTranslation(bx, by, bz)));
        for (let f = 0; f < 14; f++) { const u = R() * TAU, v = R() * 0.9; fairy.push([bx + Math.cos(u) * Math.cos(v) * 3.4 * s * 1.02, by - Math.sin(v) * 2.0 * s * 0.9, bz + Math.sin(u) * Math.cos(v) * 3.4 * s * 1.02]); }
      }
    }
    const temple = new THREE.Group(); temple.name = 'fes-temple';
    for (const [mat, list] of T) { const m = new THREE.Mesh(mergeGeometries(list), mat); temple.add(m); mirrorables.push(m); }
    root.add(temple);
    // fairy lights in the big trees + the lamp glows
    for (const f of fairy) bulbs.push([...f, 2]);
    for (const [x, y, z] of lampHeads) bulbs.push([x, y, z, 3]);
    // khom along the viharn's front eave
    for (let i = 0; i < 9; i++) khoms.push([-5.2 + i * 1.3, ty + 4.0, WZ1 + 5.2, [0xffd27a, 0xffae42, 0xff7a5a][i % 3], 1, 1]);
  }
  // (the khom instanced mesh was built above, before the stage + temple added theirs) — rebuild it with every khom
  {
    const old = root.children.find((o) => o.isMesh && o.geometry.isInstancedBufferGeometry && o.geometry.attributes.aK);
    const n = khoms.length, geo = old.geometry;
    const aK = new Float32Array(n * 4), aC = new Float32Array(n * 4), c = new THREE.Color();
    const RR = rng(77);
    khoms.forEach(([x, y, z, col, dim, type], i) => { aK.set([x, y, z, RR() * 100], i * 4); c.set(col); aC.set([c.r, c.g, c.b, dim * (type ? 1.15 : 1)], i * 4); });
    geo.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    geo.instanceCount = n;
    mirrorables.push(old);
  }

  /* ---------------- the pond: stone rim + ghat steps, water, krathong, the mirror world below ---------------- */
  {
    const B = vcBatch();
    const stone = uplit(vcMat({ roughness: 0.85 }), { up: 0.25, upY: 0, fall: 1.5, col: 0xffb070, centre: [0, 0, POND.z], key: 'stn' });
    // rim: a band of flagstones following the rounded-rectangle outline, with an inner face down to the water
    const outline = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, dx = Math.cos(a), dz = Math.sin(a);
      // walk out from the centre to the outline along the ray
      let lo = 0, hi = 60;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (pondSD(POND.x + dx * m, POND.z + dz * m) < 0) lo = m; else hi = m; }
      outline.push([POND.x + dx * lo, POND.z + dz * lo, dx, dz]);
    }
    const rimPos = [], rimCol = [];
    const cs = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % N];
      // outward normal from the SDF gradient
      const nrm = (x, z) => { const e = 0.05, gx = pondSD(x + e, z) - pondSD(x - e, z), gz = pondSD(x, z + e) - pondSD(x, z - e), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; };
      const [n0x, n0z] = nrm(x0, z0), [n1x, n1z] = nrm(x1, z1);
      const yT = 0.14, W = 2.3;
      const q = (a, b, c2, d, col) => { rimPos.push(...a, ...b, ...c2, ...c2, ...b, ...d); for (let k = 0; k < 6; k++) rimCol.push(col.r, col.g, col.b); };
      cs.set(0x8a8478).offsetHSL(0, 0, (R() - 0.5) * 0.06);
      q([x0 - n0x * 0.3, yT, z0 - n0z * 0.3], [x0 + n0x * W, yT, z0 + n0z * W], [x1 - n1x * 0.3, yT, z1 - n1z * 0.3], [x1 + n1x * W, yT, z1 + n1z * W], cs);
      cs.set(0x5a5650);
      q([x0 - n0x * 0.3, WY - 0.05, z0 - n0z * 0.3], [x0 - n0x * 0.3, yT, z0 - n0z * 0.3], [x1 - n1x * 0.3, WY - 0.05, z1 - n1z * 0.3], [x1 - n1x * 0.3, yT, z1 - n1z * 0.3], cs);
      cs.set(0x6a665e);
      q([x0 + n0x * W, yT, z0 + n0z * W], [x0 + n0x * W, -0.3, z0 + n0z * W], [x1 + n1x * W, yT, z1 + n1z * W], [x1 + n1x * W, -0.3, z1 + n1z * W], cs);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rimCol, 3)); rg.computeVertexNormals();
    B.put(stone, rg);
    // ghat steps down to the water on the near bank, where people float their krathong
    const gz = POND.z + POND.hz;
    for (let i = 0; i < 4; i++) B.put(stone, P(new THREE.BoxGeometry(12, 0.2, 0.55), 0x9a9488, 0, 0.04 - i * 0.18, gz - 0.2 - i * 0.55));
    B.build(root);
    // water: dark, see-through at steep angles onto the mirror world (strong reflection at grazing angles), rippled
    const wnor = texLoad('assets/pond/water_nor.jpg', false);
    const wmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime, uNor: { value: wnor } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform sampler2D uNor; varying vec3 vW;
        void main(){
          vec3 n1 = texture2D(uNor, vW.xz * 0.06 + vec2(uTime * 0.008, uTime * 0.005)).xzy * 2.0 - 1.0;
          vec3 n2 = texture2D(uNor, vW.xz * 0.15 - vec2(uTime * 0.011, -uTime * 0.007)).xzy * 2.0 - 1.0;
          vec3 n = normalize(vec3(0.0, 1.0, 0.0) + (n1 + n2) * vec3(0.06, 0.0, 0.06));
          vec3 v = cameraPosition - vW; float vl = length(v); v = v / max(vl, 1e-3);
          float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
          float ripple = (n.x + n.z) * 3.0;
          // opacity: the water's own dark body, minus what the reflection lets through
          float a = clamp(0.62 - 0.5 * fres + ripple * 0.05, 0.12, 0.8);
          vec3 col = vec3(0.006, 0.01, 0.018) + vec3(0.25, 0.12, 0.05) * max(ripple, 0.0) * 0.08;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const wg = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z))), 1);
    wg.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wg, wmat); water.position.y = WY; water.renderOrder = 6; root.add(water);
  }

  /* =====================================================================
     9. KRATHONG — banana-leaf floats with a candle, incense and marigolds, drifting slowly round the pond (+ reflections)
     ===================================================================== */
  {
    const parts = [];
    const tagP = (g, part) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); n.setAttribute('aP', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count).fill(part), 1)); parts.push(n); };
    tagP(new THREE.CylinderGeometry(0.24, 0.2, 0.07, 9, 1, false), 0);                                  // banana-trunk base
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, g = new THREE.ConeGeometry(0.07, 0.2, 3, 1, true); g.rotateX(0.5); g.translate(0, 0.1, 0.18); g.rotateY(a); tagP(g, 0); }   // folded leaf petals
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; tagP(new THREE.SphereGeometry(0.045, 5, 3).translate(Math.cos(a) * 0.11, 0.07, Math.sin(a) * 0.11), 1); }   // marigolds
    tagP(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 5, 1, true).translate(0, 0.11, 0), 2);         // candle
    tagP(new THREE.ConeGeometry(0.02, 0.07, 5, 1, true).translate(0, 0.215, 0), 3);                      // flame
    for (const s of [-1, 1]) tagP(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3, 1, true).translate(s * 0.05, 0.13, 0.02), 2);   // incense
    const base = mergeGeometries(parts);
    const n = 120, aK = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // orbit (an ellipse within the pond) radius fraction, start angle, speed (some clockwise), bob phase
      const k = 0.15 + 0.8 * Math.sqrt(R());
      aK.set([k, R() * TAU, (0.004 + R() * 0.007) * (R() < 0.7 ? 1 : -1), R() * 10], i * 4);
    }
    const mk = (mir) => {
      const geo = new THREE.InstancedBufferGeometry().copy(base);
      geo.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); geo.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime, uMir: { value: mir ? 1 : 0 } },
        vertexShader: `uniform float uTime; uniform float uMir; attribute vec4 aK; attribute float aP; varying float vP; varying float vH; varying float vF;
          void main() {
            float a = aK.y + uTime * aK.z;
            vec3 c = vec3(${POND.x.toFixed(2)} + cos(a) * ${(POND.hx - 2.2).toFixed(2)} * aK.x, ${WY.toFixed(3)} + 0.015 + sin(uTime * 1.3 + aK.w) * 0.01, ${POND.z.toFixed(2)} + sin(a) * ${(POND.hz - 1.8).toFixed(2)} * aK.x);
            vec3 p = position;
            float ry = aK.w + uTime * 0.05; p.xz = mat2(cos(ry), sin(ry), -sin(ry), cos(ry)) * p.xz;
            if (aP > 2.5) p.x += sin(uTime * 11.0 + aK.w * 7.0) * 0.006 * (position.y - 0.18) * 10.0;
            vec3 w = c + p * 1.25;
            if (uMir > 0.5) w.y = ${(2 * WY).toFixed(3)} - w.y;
            vP = aP; vH = position.y; vF = 0.85 + 0.15 * sin(uTime * 13.0 + aK.w * 5.0) * sin(uTime * 7.3 + aK.w);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: `varying float vP; varying float vH; varying float vF;
          void main() {
            vec3 c;
            float lit = 0.25 + 1.1 * smoothstep(0.0, 0.12, vH);       // the candle lights the petals from above
            if (vP < 0.5) c = vec3(0.06, 0.16, 0.05) * lit;
            else if (vP < 1.5) c = vec3(0.9, 0.42, 0.04) * lit;
            else if (vP < 2.5) c = vec3(0.95, 0.9, 0.8) * 0.9;
            else c = vec3(1.0, 0.62, 0.22) * 5.0 * vF;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    };
    root.add(mk(false)); root.add(mk(true));
    // a soft pool of candlelight on the water round each krathong
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    g.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); g.instanceCount = n;
    const gm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute vec4 aK; varying vec2 vUv; varying float vF;
        void main() {
          float a = aK.y + uTime * aK.z;
          vec3 c = vec3(${POND.x.toFixed(2)} + cos(a) * ${(POND.hx - 2.2).toFixed(2)} * aK.x, ${WY.toFixed(3)} + 0.01, ${POND.z.toFixed(2)} + sin(a) * ${(POND.hz - 1.8).toFixed(2)} * aK.x);
          vUv = uv; vF = 0.85 + 0.15 * sin(uTime * 13.0 + aK.w * 5.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + position * 2.4, 1.0);
        }`,
      fragmentShader: `varying vec2 vUv; varying float vF;
        void main() { float d = length(vUv - 0.5) * 2.0; float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.85, 1.0, d)); gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a * 0.32 * vF, 1.0); }`,
    });
    const glow = new THREE.Mesh(g, gm); glow.frustumCulled = false; glow.renderOrder = 7; root.add(glow);
  }

  /* =====================================================================
     10. SKY LANTERNS — khom loi (instanced, GPU-animated) + a glow sprite each + far-off lanterns as points
     ===================================================================== */
  const lanternAttrs = (() => {
    const L = [];
    for (const p of releasers) {
      const out = Math.sign(p.z) || -1;
      L.push({ x: p.x + Math.sin(p.ry) * 0.12, z: p.z + Math.cos(p.ry) * 0.12, y: p.y + 2.05 * p.sy, ph: p.ph, sp: p.speed, dx: (R() - 0.5) * 0.25, dz: out * (0.25 + R() * 0.35), s: 0.9 + R() * 0.2, hold: p.hold });
    }
    for (let i = 0; i < 820; i++) {
      const [x, z] = fieldSite(), out = Math.sign(z);
      L.push({ x, z, y: groundY(x, z) + 1.5, ph: R(), sp: 0.7 + R() * 0.7, dx: (R() - 0.5) * 0.3, dz: out * (0.2 + R() * 0.45), s: 0.85 + R() * 0.35, hold: 0 });
    }
    const n = L.length, aL = new Float32Array(n * 4), aD = new Float32Array(n * 4), aY = new Float32Array(n), aH = new Float32Array(n);
    L.forEach((l, i) => { aL.set([l.x, l.z, l.ph, l.sp], i * 4); aD.set([l.dx, l.dz, l.s, l.hold], i * 4); aY[i] = l.y; aH[i] = R(); });
    return { n, aL, aD, aY, aH };
  })();
  const setLanternAttrs = (geo) => {
    const A = lanternAttrs;
    geo.setAttribute('aL', new THREE.InstancedBufferAttribute(A.aL, 4)); geo.setAttribute('aD', new THREE.InstancedBufferAttribute(A.aD, 4));
    geo.setAttribute('aY', new THREE.InstancedBufferAttribute(A.aY, 1)); geo.setAttribute('aH', new THREE.InstancedBufferAttribute(A.aH, 1));
    geo.instanceCount = A.n;
  };
  {
    const parts = [];
    const tagP = (g, part) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); n.setAttribute('aP', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count).fill(part), 1)); parts.push(n); };
    tagP(new THREE.LatheGeometry(V2([[0.3, 0], [0.36, 0.45], [0.385, 0.8], [0.3, 0.98], [0.0, 1.05]]), 9), 0);
    tagP(new THREE.CircleGeometry(0.09, 6).rotateX(Math.PI / 2).translate(0, 0.06, 0), 1);
    const geo = new THREE.InstancedBufferGeometry().copy(mergeGeometries(parts));
    setLanternAttrs(geo);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { uTime, uCam, uMir: { value: 0 } },
      vertexShader: LANTERN_GLSL + `
        attribute float aP; attribute float aH; varying float vP; varying float vY; varying float vV; varying float vH; varying float vA;
        void main() {
          float vis, life; vec3 c = lanternPos(vis, life);
          float s = aD.z * smoothstep(0.0, 0.25, vis);
          vec3 p = position * s;
          float tilt = sin(uTime * 0.6 + aL.z * 40.0) * 0.06; p.xy = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * p.xy;
          vP = aP; vY = position.y; vV = vis; vH = aH; vA = atan(position.z, position.x);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + p, 1.0);
        }`,
      fragmentShader: `uniform float uTime; varying float vP; varying float vY; varying float vV; varying float vH; varying float vA;
        void main() {
          vec3 paper = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.58, 0.22), vH);
          float fl = 0.88 + 0.12 * sin(uTime * 9.0 + vH * 60.0) * sin(uTime * 5.3 + vH * 20.0);
          float rib = smoothstep(0.8, 1.0, abs(cos(vA * 4.0)));
          vec3 c = vP > 0.5 ? vec3(1.0, 0.85, 0.5) * 6.0 : paper * (1.7 - 1.0 * vY) * (1.0 - 0.3 * rib);
          gl_FragColor = vec4(c * fl * vV, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; root.add(mesh);
    // glows (and their reflections in the pond)
    const pg = new THREE.InstancedBufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    setLanternAttrs(pg);
    const glowMat = (mir) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uCam, uMir: { value: mir } },
      vertexShader: LANTERN_GLSL + `
        attribute float aH; varying float vV;
        void main() {
          float vis, life; vec3 c = lanternPos(vis, life);
          c.y += 0.45 * aD.z;
          if (uMir > 0.5) c.y = ${(2 * WY).toFixed(3)} - c.y;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          vV = vis * (0.85 + 0.15 * sin(uTime * 7.0 + aH * 50.0));
          gl_PointSize = clamp(2.6 * aD.z * 420.0 / -mv.z, 2.0, 90.0) * step(0.002, vis);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vV;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.8, 1.0, d)); gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * a * 0.55 * vV, 1.0); }`,
    });
    // a Points object drawn from an InstancedBufferGeometry: one point per instance
    const glow = new THREE.Points(pg, glowMat(0)); glow.frustumCulled = false; glow.renderOrder = 3; root.add(glow);
    const glowM = new THREE.Points(pg, glowMat(1)); glowM.frustumCulled = false; glowM.renderOrder = 5; root.add(glowM);
  }
  // far-off lanterns: thousands of points rising from the villages and hills, out to the horizon on every side
  {
    const n = 2600, pos = new Float32Array(n * 3), aL = new Float32Array(n * 4), aD = new Float32Array(n * 4), aY = new Float32Array(n), aH = new Float32Array(n);
    // clustered: release sites (villages) scattered round the horizon, lanterns streaming up and away from each
    const sites = [];
    for (let i = 0; i < 46; i++) {
      let a, r, x, z, k = 0;
      do { a = R() * TAU; r = 130 + R() * 170; x = Math.cos(a) * r * 1.15; z = Math.sin(a) * r; k++; } while (k < 50 && camClearJS(CAM, x, 30, z) < 0.5);
      sites.push([x, z, 5 + R() * 20]);
    }
    for (let i = 0; i < n; i++) {
      const s = sites[Math.floor(Math.pow(R(), 1.3) * sites.length)], spread = s[2];
      const x = s[0] + (R() - 0.5) * spread * 2, z = s[1] + (R() - 0.5) * spread * 2, d = Math.hypot(x, z);
      aL.set([x, z, R(), 0.8 + R() * 0.9], i * 4);
      aD.set([x / d * 0.35 + (R() - 0.5) * 0.2, z / d * 0.35 + (R() - 0.5) * 0.2, 0.8 + R() * 0.5, 0], i * 4);
      aY[i] = groundY(x, z) + 1; aH[i] = R();
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geo.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 4)); geo.setAttribute('aD', new THREE.InstancedBufferAttribute(aD, 4));
    geo.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1)); geo.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 1));
    geo.instanceCount = n;
    void pos;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uCam, uMir: { value: 0 } },
      vertexShader: LANTERN_GLSL + `
        attribute float aH; varying float vV; varying float vS;
        void main() {
          float vis, life; vec3 c = lanternPos(vis, life);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float px = 1.1 * aD.z * 600.0 / -mv.z;               // the lantern's own size in pixels (tiny)
          vS = clamp(px, 0.0, 1.0);
          vV = vis * (0.8 + 0.2 * sin(uTime * 6.0 + aH * 40.0));
          gl_PointSize = max(px * 3.0, 2.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vV; varying float vS;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float core = exp(-d * d * 10.0), halo = exp(-d * d * 2.5) * (1.0 - d);
          gl_FragColor = vec4(vec3(1.0, 0.52, 0.2) * (core * 1.05 + halo * 0.35) * vV * (0.55 + 0.45 * vS), 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; root.add(pts);
  }

  /* =====================================================================
     11. THE CROWD — instanced figures (near: detailed; far: simple), posed in the vertex shader
     ===================================================================== */
  root.add(makeFestivalCrowd(crowd, uTime));
  // the lanterns people hold at the chest (mode 7): a small warm paper lantern each
  {
    const holders = crowd.filter((p) => p.mode === 7);
    const pos = [], sd = [];
    for (const p of holders) { pos.push(p.x + Math.sin(p.ry) * 0.36 * p.sx, p.y + 1.02 * p.sy, p.z + Math.cos(p.ry) * 0.36 * p.sx); sd.push(R()); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ vec3 p = position + vec3(0.0, sin(uTime * 1.3 + seed * 20.0) * 0.02, 0.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.85 + 0.15 * sin(uTime * 8.0 + seed * 30.0); gl_PointSize = clamp(0.9 * 600.0 / -mv.z, 3.0, 70.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(0.32, 0.22, d) * 1.4 + exp(-d * d * 3.0) * 0.35 * (1.0 - d);
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * a * vA, 1.0); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3; root.add(pts);
  }

  /* =====================================================================
     12. STRING LIGHTS + BULBS (instanced) — stall fronts, stage, fairy lights in the temple trees, lamps
     ===================================================================== */
  {
    const w0 = wires.length;
    for (const [a, b, sag, n] of festoon) {
      const pts = [];
      for (let i = 0; i <= n * 2; i++) { const t = i / (n * 2), p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; pts.push(p); }
      for (let i = 0; i < pts.length - 1; i++) wires.push(pts[i], pts[i + 1]);
      for (let i = 1; i < n * 2; i += 2) bulbs.push([pts[i].x, pts[i].y - 0.05, pts[i].z, i % 4 === 1 ? 0 : 1]);
    }
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires.slice(w0)), MAT.wire));
    const ico = new THREE.IcosahedronGeometry(0.05, 0);
    const mkGeo = (list) => {
      const geo = new THREE.InstancedBufferGeometry().copy(ico), a = new Float32Array(list.length * 4);
      list.forEach(([x, y, z, k], i) => a.set([x, y, z, k], i * 4));
      geo.setAttribute('aB', new THREE.InstancedBufferAttribute(a, 4)); geo.instanceCount = list.length; return geo;
    };
    const geo = mkGeo(bulbs), geoM = mkGeo(bulbs.filter((b) => b[2] < -(SIDE + 2)));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uCam, uMir: { value: 0 } },
      vertexShader: `uniform float uTime; uniform float uMir; attribute vec4 aB; varying vec3 vC; ${WEDGE_GLSL}
        void main() {
          float k = aB.w, s = k > 2.5 ? 2.6 : k > 1.5 ? 0.7 : 1.0;
          vC = k > 2.5 ? vec3(1.0, 0.7, 0.35) * 3.0 : k > 1.5 ? vec3(1.0, 0.82, 0.55) * (2.0 + 1.2 * sin(uTime * 2.0 + aB.x * 3.0 + aB.z)) : k > 0.5 ? vec3(1.0, 0.78, 0.45) * 3.2 : vec3(1.0, 0.45, 0.25) * 2.8;
          vC *= 0.35 + 0.65 * camClear(aB.xyz);
          vec3 w = aB.xyz + position * s;
          if (uMir > 0.5) w.y = ${(2 * WY).toFixed(3)} - w.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; root.add(m);
    const mm = new THREE.Mesh(geoM, mat.clone()); mm.material.uniforms = { uTime, uCam, uMir: { value: 1 } }; mm.frustumCulled = false; root.add(mm);
  }

  /* =====================================================================
     13. THE MIRROR WORLD below the pond (temple, khom, bulbs are drawn mirrored about the water line; seen only through
         the hole in the ground the pond fills)
     ===================================================================== */
  {
    const mir = new THREE.Group(); mir.name = 'fes-mirror';
    mir.scale.y = -1; mir.position.y = 2 * WY;
    for (const m of mirrorables) {
      if (m.geometry.isInstancedBufferGeometry) {
        // the khom shader places instances in world space: mirror it with a clone of the material flipping y
        const mat = m.material.clone();
        mat.uniforms = { uTime };
        const src = m.geometry, keep = [];
        for (let i = 0; i < src.instanceCount; i++) if (src.attributes.aK.array[i * 4 + 2] < -(SIDE + 2)) keep.push(i);
        const geo = new THREE.InstancedBufferGeometry(); geo.index = src.index;
        for (const k of ['position', 'normal', 'aP']) geo.setAttribute(k, src.attributes[k]);
        for (const k of ['aK', 'aC']) { const a = new Float32Array(keep.length * 4); keep.forEach((i, j) => a.set(src.attributes[k].array.subarray(i * 4, i * 4 + 4), j * 4)); geo.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4)); }
        geo.instanceCount = keep.length;
        mat.vertexShader = m.material.vertexShader.replace('gl_Position = projectionMatrix * viewMatrix * wp;', `wp.y = ${(2 * WY).toFixed(3)} - wp.y; gl_Position = projectionMatrix * viewMatrix * wp;`);
        const c = new THREE.Mesh(geo, mat); c.frustumCulled = false; root.add(c);
      } else {
        const c = new THREE.Mesh(m.geometry, m.material); mir.add(c);
      }
    }
    root.add(mir);
  }

  /* =====================================================================
     14. THE WIDER WORLD — tree lines, mountains with a lit temple, village lights, fireflies
     ===================================================================== */
  {
    // tree line: lumpy canopies (instanced) on trunks, ringing the field beyond the release meadows
    const spots = [];
    for (let i = 0; i < 220; i++) {
      const a = R() * TAU, r = 95 + R() * 60, x = Math.cos(a) * r * 1.3, z = Math.sin(a) * r;
      spots.push([x, groundY(x, z), z, 1.0 + R() * 0.9]);
    }
    for (let i = 0; i < 70; i++) {                          // clumps nearer in at the sides (behind the release fields)
      const s = R() < 0.5 ? -1 : 1, x = (R() - 0.5) * 170, z = s * (70 + R() * 30);
      if (pondSD(x, z) < 8 || (s < 0 && Math.abs(x) < 30 && z > TZ - 30)) continue;
      spots.push([x, groundY(x, z), z, 0.8 + R() * 0.7]);
    }
    const canopy = new THREE.IcosahedronGeometry(1, 1), p = canopy.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); const k = 1 + 0.18 * Math.sin(v.x * 4.3) * Math.sin(v.y * 3.7 + 1) + 0.1 * Math.sin(v.z * 7.1 + v.x * 2.3); p.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k); }
    canopy.computeVertexNormals();
    const leaf = new THREE.MeshStandardMaterial({ color: 0x1e3220, roughness: 0.95 });
    const im = new THREE.InstancedMesh(canopy, leaf, spots.length * 2), tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.45, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.9 }), spots.length);
    const c = new THREE.Color();
    spots.forEach(([x, y, z, s], i) => {
      _o.position.set(x, y + 2.5 * s, z); _o.rotation.set(0, 0, 0); _o.scale.set(0.8 * s, 5 * s, 0.8 * s); _o.updateMatrix(); tr.setMatrixAt(i, _o.matrix);
      for (let k = 0; k < 2; k++) {
        const a = R() * TAU, r = k ? 1.8 * s : 0;
        _o.position.set(x + Math.cos(a) * r, y + (5.6 + (k ? -0.6 : 0.8)) * s, z + Math.sin(a) * r); _o.rotation.set(0, R() * TAU, 0);
        _o.scale.set((2.6 + R()) * s, (2.2 + R() * 0.6) * s, (2.6 + R()) * s); _o.updateMatrix();
        im.setMatrixAt(i * 2 + k, _o.matrix); im.setColorAt(i * 2 + k, c.setHSL(0.27 + R() * 0.06, 0.35, 0.16 + R() * 0.08));
      }
    });
    im.computeBoundingSphere(); tr.computeBoundingSphere();
    root.add(im, tr);
    // mountains: two ridgelines all round (low beyond the baselines), a lit temple on the +z peak, village lights
    const ridge = (r, hMax, seed, col) => {
      const N = 220, pos = [], cols = [], cc = new THREE.Color(col), top = cc.clone().lerp(new THREE.Color(0x2a1a2a), 0.4);
      const RR = rng(seed);
      const ph = [RR() * 10, RR() * 10, RR() * 10];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, dx = Math.cos(a), dz = Math.sin(a);
        const side = Math.pow(Math.abs(dz), 1.5);
        const h = hMax * (0.35 + 0.65 * side) * (0.55 + 0.25 * Math.sin(a * 3 + ph[0]) + 0.15 * Math.sin(a * 7 + ph[1]) + 0.08 * Math.sin(a * 17 + ph[2]));
        pos.push(dx * r * 1.12, -6, dz * r, dx * r * 1.12, h, dz * r);
        cols.push(cc.r, cc.g, cc.b, top.r, top.g, top.b);
      }
      const idx = [];
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -5; return m;
    };
    root.add(ridge(300, 46, 5, 0x0c0a16), ridge(235, 30, 9, 0x0a0a12));
    const vl = [];
    for (let i = 0; i < 520; i++) {
      const a = R() * TAU, dz = Math.sin(a);
      if (Math.abs(dz) < 0.45) continue;
      const r = 228 + R() * 66;
      vl.push([Math.cos(a) * r * 1.12, 1 + R() * 14 * Math.abs(dz), dz * r]);
    }
    vl.push([10, 44, 300], [12, 45.5, 300], [8, 44.5, 300]);         // the temple on the mountain
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vl.flat(), 3));
    const vm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float s = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5); vA = 0.5 + 0.5 * s; gl_PointSize = position.y > 40.0 ? 9.0 : 2.0 + 1.5 * s; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.7, 0.35) * exp(-d * d * 4.0) * vA * 0.9, 1.0); }`,
    });
    const vp = new THREE.Points(vg, vm); vp.frustumCulled = false; root.add(vp);
    // fireflies round the pond and the trees, faint motes under the canopies
    const ff = [];
    for (let i = 0; i < 70; i++) { const a = R() * TAU; ff.push([POND.x + Math.cos(a) * (POND.hx + 2 + R() * 10), 0.5 + R() * 2, POND.z + Math.sin(a) * (POND.hz + 2 + R() * 6)]); }
    for (let i = 0; i < 40; i++) { const s = R() < 0.5 ? -1 : 1; ff.push([(R() - 0.5) * 120, 0.6 + R() * 2.5, s * (SIDE + 4 + R() * 12)]); }
    root.add(makeFireflies(ff, uTime, [1.0, 0.85, 0.45]));
  }

  const look = {
    sky: (skyTex ||= paintSkyCanvas()), envI: 0.4, bgI: 1, fog: 0x1a1222,
    key: 0xb8c4ff, keyI: 0.8, keyPos: [MOON.x * 40, MOON.y * 40, MOON.z * 40], hemiSky: 0x4a4a7a, hemiGround: 0x4a2a18, hemiI: 0.6,
    exposure: 1.1, bloom: 0.62, spots: 1,
  };
  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update, look: { night: look, day: look }, fog: { night: [45, 380], day: [45, 380] } };
}

/* =====================================================================
   CROWD — instanced posed figures. Near: the market's detailed figures (market-crowd.js figureGeometry); far: a simple
   figure with the same bones. One draw call per body variant.
   ===================================================================== */
function tagBP(geo, bone, part) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = bone; a[i * 2 + 1] = part; }
  g.setAttribute('aBP', new THREE.BufferAttribute(a, 2));
  return g;
}
function tinyFigure() {
  const Pp = [];
  const cyl = (r0, r1, h, x, y, z, seg = 5) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, true).translate(x, y, z);
  for (const s of [1, -1]) {
    const L = s > 0 ? 0 : 1, hx = s * 0.092, ax = s * 0.205;
    Pp.push(tagBP(cyl(0.075, 0.06, 0.4, hx, 0.69, 0), 2 + L, 2));
    Pp.push(tagBP(cyl(0.058, 0.05, 0.46, hx, 0.27, 0), 4 + L, 2));
    Pp.push(tagBP(cyl(0.05, 0.042, 0.32, ax, 1.21, 0, 4), 6 + L, 1));
    Pp.push(tagBP(cyl(0.04, 0.035, 0.3, ax + s * 0.012, 0.92, 0.01, 4), 8 + L, 0));
  }
  Pp.push(tagBP(new THREE.CylinderGeometry(0.17, 0.15, 0.62, 6, 1, true).scale(1, 1, 0.65).translate(0, 1.15, 0), 0, 1));
  Pp.push(tagBP(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 6, 1, true).scale(1, 1, 0.7).translate(0, 0.86, 0), 0, 2));
  Pp.push(tagBP(new THREE.SphereGeometry(0.105, 6, 4).translate(0, 1.6, 0.01), 1, 0));
  Pp.push(tagBP(new THREE.SphereGeometry(0.112, 6, 2, 0, TAU, 0, Math.PI * 0.5).rotateX(-0.4).translate(0, 1.615, 0), 1, 3));
  return mergeGeometries(Pp);
}
const POSE_GLSL = /* glsl */`
uniform float uTime;
attribute vec2 aBP;
attribute vec4 iA;       // mode, phase, speed, path length
attribute vec4 iB;       // cycle (s), hold (s), lit, -
attribute vec3 iSkin; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iHair;
varying vec3 vCol; varying float vLit;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void rotAbout(inout vec3 p, inout vec3 n, vec3 piv, mat3 R) { p = R * (p - piv) + piv; n = R * n; }
vec3 gPos; vec3 gNrm;
void poseFigure() {
  vec3 p = position, n = normal;
  float bone = aBP.x, mode = iA.x, ph = iA.y;
  float t = uTime + ph * 37.0;
  float thL = 0.0, thR = 0.0, knL = 0.05, knR = 0.05, shL = 0.0, shR = 0.0, abL = 0.06, abR = 0.06, elL = -0.12, elR = -0.12;
  float hYaw = 0.0, hPitch = 0.0, lean = 0.0, twist = 0.0;
  vec3 root = vec3(0.0); float yaw = 0.0;
  if (mode < 0.5) {                                   // watch: weight shifts, looks about and up at the lanterns
    hYaw = sin(t * 0.23) * 0.7 + sin(t * 0.61) * 0.2; hPitch = -0.25 - 0.2 * smoothstep(0.2, 0.9, sin(t * 0.13 + 1.0));
    float shift = sin(t * 0.4); root.x = shift * 0.025; twist = shift * 0.05;
    knL = 0.05 + 0.07 * max(shift, 0.0); knR = 0.05 + 0.07 * max(-shift, 0.0);
    float arms = step(0.5, fract(ph * 5.0));          // hands behind the back / at the sides
    shL = mix(0.05, 0.3, arms); shR = shL; elL = mix(-0.15, -0.9, arms); elR = elL;
  } else if (mode < 1.5) {                            // release a sky lantern: raise it, hold it overhead, let go, watch it climb
    float cyc = iB.x, hold = iB.y, c = mod(uTime + ph * cyc, cyc);
    float up = smoothstep(0.0, 1.0, c) * (1.0 - smoothstep(hold, hold + 1.4, c));
    shL = mix(-0.2, -2.75, up); shR = shL; abL = mix(0.06, 0.32, up); abR = abL; elL = mix(-0.3, -0.35, up); elR = elL;
    float after = smoothstep(hold, hold + 1.5, c) * (1.0 - smoothstep(hold + 25.0, hold + 40.0, c));
    hPitch = -0.35 * up - 0.75 * after; lean = -0.06 * after;
    hYaw = sin(t * 0.3) * 0.2 * (1.0 - up);
    if (after > 0.5) { shR = mix(shR, -2.2, smoothstep(0.6, 0.9, sin(t * 0.7)) * 0.6); elR = -0.4; }   // point / wave at it
  } else if (mode < 2.5) {                            // cheer + clap
    float cl = abs(sin(t * 5.5));
    shL = -0.9; shR = -0.9; abL = -0.2 + 0.35 * cl; abR = abL; elL = -1.0; elR = -1.0;
    float up = smoothstep(0.7, 0.95, sin(t * 0.27));
    shL = mix(shL, -2.6, up); shR = mix(shR, -2.6, up); elL = mix(elL, -0.2, up); elR = elL;
    hPitch = -0.1 - 0.2 * up; root.y = abs(sin(t * 5.5)) * 0.02 * up;
  } else if (mode < 3.5) {                            // walk (ping-pong along local +z)
    float v = iA.z, L = iA.w, Tw = L / v, Tt = 1.3, cyc = 2.0 * (Tw + Tt);
    float c = mod(t, cyc), s = 0.0, w = 0.0;
    if (c < Tw) { s = c * v; w = 1.0; }
    else if (c < Tw + Tt) { s = L; yaw = 3.14159 * smoothstep(0.0, 1.0, (c - Tw) / Tt); }
    else if (c < 2.0 * Tw + Tt) { s = L - (c - Tw - Tt) * v; yaw = 3.14159; w = 1.0; }
    else { s = 0.0; yaw = 3.14159 + 3.14159 * smoothstep(0.0, 1.0, (c - 2.0 * Tw - Tt) / Tt); }
    float amp = w * clamp(min(s, L - s) / 0.6, 0.0, 1.0);
    float phi = s * 3.14159 / 0.72;
    thL = -sin(phi) * 0.42 * amp; thR = sin(phi) * 0.42 * amp;
    knL = (0.08 + 0.75 * pow(max(cos(phi), 0.0), 2.0)) * amp + 0.05; knR = (0.08 + 0.75 * pow(max(-cos(phi), 0.0), 2.0)) * amp + 0.05;
    shL = -thL * 0.75; shR = -thR * 0.75; elL = -0.2 - 0.2 * amp; elR = elL;
    root.y = -abs(cos(phi)) * 0.025 * amp; root.z = s;
    twist = sin(phi) * 0.08 * amp; lean = 0.04;
    hYaw = sin(t * 0.37) * 0.3; hPitch = -0.15 + 0.1 * sin(t * 0.21);
  } else if (mode < 4.5) {                            // drum: alternate strokes, the whole body in it
    float b = t * 7.2;
    float sL = pow(max(sin(b), 0.0), 3.0), sR = pow(max(sin(b + 3.14159), 0.0), 3.0);
    shL = -1.25 + 0.55 * sL; shR = -1.25 + 0.55 * sR; elL = -0.9 + 0.5 * sL; elR = -0.9 + 0.5 * sR; abL = 0.25; abR = 0.25;
    lean = 0.2 + 0.05 * sin(b * 0.5); knL = 0.2; knR = 0.2; root.y = -0.04 - 0.02 * abs(sin(b));
    hPitch = 0.2; hYaw = sin(t * 0.5) * 0.15;
  } else if (mode < 5.5) {                            // fon lep: slow, graceful arm waves, knees soft, a sway
    float w = t * 0.9;
    abL = 1.0 + 0.35 * sin(w); abR = 1.0 + 0.35 * sin(w + 2.0);
    shL = -0.4 + 0.5 * sin(w * 0.5); shR = -0.4 + 0.5 * sin(w * 0.5 + 3.0); elL = -0.9 - 0.4 * sin(w + 1.0); elR = -0.9 - 0.4 * sin(w + 3.0);
    knL = 0.3 + 0.1 * sin(w); knR = 0.3 - 0.1 * sin(w); thL = -0.15; thR = -0.15; root.y = -0.06;
    twist = sin(w * 0.5) * 0.25; yaw = sin(w * 0.25) * 0.5; hYaw = -twist * 0.8; hPitch = 0.1;
  } else if (mode < 6.5) {                            // kneel at the water, setting a krathong afloat
    root.y = -0.42; thL = -1.5; thR = -1.5; knL = 2.4; knR = 2.4; lean = 0.55;
    float r = 0.5 + 0.5 * sin(t * 0.35);
    shL = -0.7 - 0.4 * r; shR = shL; elL = -0.2; elR = -0.2; abL = -0.15; abR = -0.15; hPitch = 0.55;
  } else {                                            // hold a small lantern at the chest
    shL = -0.75; shR = -0.55; abL = -0.25; abR = 0.0; elL = -1.1; elR = -0.5;
    hPitch = 0.15 + 0.15 * sin(t * 0.3); hYaw = sin(t * 0.21) * 0.3; root.x = sin(t * 0.4) * 0.02;
  }
  if (bone > 3.5 && bone < 5.5) { bool l = bone < 4.5; rotAbout(p, n, vec3(l ? 0.092 : -0.092, 0.5, 0.0), rotX(l ? knL : knR)); }
  if (bone > 1.5 && bone < 5.5) { bool l = (bone < 2.5) || (bone > 3.5 && bone < 4.5); rotAbout(p, n, vec3(l ? 0.092 : -0.092, 0.88, 0.0), rotX(l ? thL : thR)); }
  if (bone > 7.5) { bool l = bone < 8.5; rotAbout(p, n, vec3(l ? 0.215 : -0.215, 1.07, 0.0), rotX(l ? elL : elR)); }
  if (bone > 5.5) { bool l = (bone < 6.5) || (bone > 7.5 && bone < 8.5); rotAbout(p, n, vec3(l ? 0.2 : -0.2, 1.37, 0.0), rotZ(l ? abL : -abR) * rotX(l ? shL : shR)); }
  if (bone > 0.5 && bone < 1.5) rotAbout(p, n, vec3(0.0, 1.47, 0.0), rotY(hYaw) * rotX(hPitch));
  if (bone < 1.5 || bone > 5.5) rotAbout(p, n, vec3(0.0, 0.9, 0.0), rotY(twist) * rotX(lean));
  rotAbout(p, n, vec3(0.0), rotY(yaw));
  gPos = p + root; gNrm = n;
  float part = aBP.y;
  vCol = part < 0.5 ? iSkin : part < 1.5 ? iShirt : part < 2.5 ? iPants : part < 3.5 ? iHair : part < 4.5 ? vec3(0.06, 0.055, 0.05) : iShirt * 0.45 + vec3(0.12, 0.08, 0.05);
  // lantern light: from above (released lanterns), the canopies; a touch more on the upper body
  vLit = iB.z * (0.6 + 0.4 * smoothstep(0.8, 1.6, position.y));
}
`;
function makeFestivalCrowd(spots, uTime) {
  const grp = new THREE.Group(); grp.name = 'festival-crowd';
  const c = new THREE.Color();
  for (let v = 0; v < 4; v++) {
    const far = v === 3;
    const list = spots.filter((s) => (far ? s.far : !s.far && s.variant === v));
    if (!list.length) continue;
    const geo = far ? tinyFigure() : figureGeometry(v, false);
    const n = list.length;
    const A = new Float32Array(n * 4), Bb = new Float32Array(n * 4), sk = new Float32Array(n * 3), sh = new Float32Array(n * 3), pa = new Float32Array(n * 3), ha = new Float32Array(n * 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    mat.onBeforeCompile = (shd) => {
      shd.uniforms.uTime = uTime;
      shd.vertexShader = POSE_GLSL + shd.vertexShader
        .replace('#include <beginnormal_vertex>', 'poseFigure();\nvec3 objectNormal = gNrm;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      shd.fragmentShader = 'varying vec3 vCol; varying float vLit;\n' + shd.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vCol, opacity );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * vLit;');
    };
    mat.customProgramCacheKey = () => 'fesCrowd';
    const im = new THREE.InstancedMesh(geo, mat, n);
    list.forEach((s, i) => {
      _o.position.set(s.x, s.y, s.z); _o.rotation.set(0, s.ry, 0); _o.scale.set(s.sx, s.sy, s.sx * 0.98); _o.updateMatrix();
      im.setMatrixAt(i, _o.matrix);
      A.set([s.mode, s.ph, s.speed || 1, s.len || 1], i * 4);
      Bb.set([s.cyc || 1, s.hold || 0, s.lit || 0.2, 0], i * 4);
      sk.set(c.set(s.skin).toArray(), i * 3); sh.set(c.set(s.shirt).toArray(), i * 3); pa.set(c.set(s.pants).toArray(), i * 3); ha.set(c.set(s.hair).toArray(), i * 3);
    });
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(Bb, 4));
    geo.setAttribute('iSkin', new THREE.InstancedBufferAttribute(sk, 3));
    geo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(sh, 3));
    geo.setAttribute('iPants', new THREE.InstancedBufferAttribute(pa, 3));
    geo.setAttribute('iHair', new THREE.InstancedBufferAttribute(ha, 3));
    im.computeBoundingSphere();
    im.boundingSphere.radius += 20;
    grp.add(im);
  }
  return grp;
}
