// KARST BEACH — ULTRA: golden-hour SUNSET. Built lazily the first time Ultra is on (see the ULTRA contract in main.js) and
// shown only on Ultra. It replaces the whole night beach (`lite` in beach.js: sand, sea, karsts, boats, palms, huts, people,
// fire dancers) with a bay that opens toward +x — the open sea lies beyond the far end of the court as seen from the main
// match camera, and the sun sets into it a little right of centre:
//  • a sky dome (sunset gradient, a low warm sun half in the sea, drifting clouds lit from below) + a painted copy of it as
//    the environment light (main.js `look` hook: sky, fog, key/hemi light, exposure, bloom while Ultra is on);
//  • a sea shader (sky reflection, a glittering sun path, rolling foam lines and a lacy swash on the wet sand);
//  • sand with ripples and a wet sheen at the water's edge, dunes and jungle behind;
//  • karst towers on both sides and inland (fluted, streaked limestone with jungle on their ledges), islands far out;
//  • detailed coconut palms (curved ringed trunks, drooping leaflets, coconuts, sway, backlit fronds), long-tail boats on
//    the sand and at anchor, stilt huts, driftwood, rocks, tide pools, sea birds, sparkles on the sun path, far-off boats.
// GAMEPLAY RULE: nothing new stands on or above the court + free zone or in the spectators' walking area (x ±24, z ±16);
// the sun sits half in the sea (below where the ball flies), right of centre; the sky just above the horizon stays a
// saturated orange→violet gradient; birds, boats and sparkles keep clear of the centre of either match camera's view.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU } from './temple-ultra.js';

const SEA_Y = -0.62;
const SUN_AZ = 0.36, SUN_EL = 0.004;                     // the sun's disc: ~20° right of the main camera's view, half set
const SUN = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_AZ), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_AZ));
// the key light comes from the same side but higher, and swung a little further right so its glint on the glossy court
// falls on the sand beyond the right-hand rail instead of on the court (from the main camera)
const KEY_EL = 0.23, KEY_AZ = 0.7;
const KEY_POS = [40 * Math.cos(KEY_EL) * Math.cos(KEY_AZ), 40 * Math.sin(KEY_EL), 40 * Math.cos(KEY_EL) * Math.sin(KEY_AZ)];
// the sky palette (linear, before exposure) — deep + saturated so ACES keeps it orange / violet rather than peach
const PAL = {
  hA: [0.26, 0.06, 0.15], hS: [0.82, 0.13, 0.014],     // horizon: away from the sun / toward it
  mA: [0.1, 0.04, 0.19], mS: [0.38, 0.055, 0.065],      // low sky
  zA: [0.014, 0.022, 0.085], zS: [0.03, 0.024, 0.095],  // zenith
  glow: [1.0, 0.36, 0.06],
};
const v3 = (a) => `vec3(${a.map((v) => v.toFixed(3)).join(', ')})`;
// the bay: sand starts to shelve into the sea at shoreX(z) (a U opening toward +x, headlands on both sides)
const shoreX = (z) => Math.min(30 + 0.0042 * z * z + 22 * Math.exp(-(((Math.abs(z) - 80) / 20) ** 2)), 230);
const SHELF = 0.09;
const WET = (-0.12 - SEA_Y) / SHELF;                     // metres from shoreX to the mean waterline
const _o = new THREE.Object3D();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------------- shared GLSL: noise, the sunset sky gradient, the far sea ---------------- */
const SKY_GLSL = /* glsl */`
uniform vec3 uSun; uniform float uTime;
float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1.0, 0.0)), f.x), mix(bh(i + vec2(0.0, 1.0)), bh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float towardSun(vec3 d){ vec2 h = normalize(d.xz + vec2(1e-5)); return dot(h, normalize(uSun.xz)); }
vec3 skyGrad(vec3 d){
  float e = max(d.y, 0.0);
  // orange only in a band either side of the sun; crimson → magenta → violet beyond it, so the centre of the main camera's
  // view (where the ball flies, ~20° left of the sun) stays a deep pink-violet the yellow ball stands out against
  float daz = acos(clamp(towardSun(d), -1.0, 1.0));
  float tw = exp(-daz * daz / 0.12) * 0.85 + 0.15 * pow(towardSun(d) * 0.5 + 0.5, 2.0);
  vec3 h = mix(${v3(PAL.hA)}, ${v3(PAL.hS)}, tw);     // horizon: magenta-violet → deep orange
  vec3 m = mix(${v3(PAL.mA)}, ${v3(PAL.mS)}, tw);     // low sky: violet → crimson
  vec3 z = mix(${v3(PAL.zA)}, ${v3(PAL.zS)}, tw);     // zenith: deep blue
  vec3 c = mix(h, m, smoothstep(0.0, 0.14, e));
  c = mix(c, z, smoothstep(0.08, 0.75, e));
  float ang = acos(clamp(dot(normalize(d), uSun), -1.0, 1.0));
  c += ${v3(PAL.glow)} * (0.38 * exp(-ang * ang / 0.008) + 0.13 * exp(-ang / 0.3)) * (1.0 - 0.6 * smoothstep(0.0, 0.5, e));
  return c;
}
// aerial haze: the low sky at that bearing
vec3 skyHaze(vec3 d){ return skyGrad(vec3(d.x, clamp(d.y, 0.0, 0.04) + 0.012, d.z)) * 0.92; }
// the open sea far away (also what the dome shows below the horizon, past the end of the sea mesh)
vec3 seaFar(vec3 d){
  vec3 r = vec3(d.x, max(-d.y, 0.0) + 0.035, d.z);
  vec3 c = mix(vec3(0.015, 0.02, 0.04), skyGrad(normalize(r)) * 0.8, 0.8);
  vec2 h = normalize(d.xz + vec2(1e-5)), s = normalize(uSun.xz);
  float daz = acos(clamp(dot(h, s), -1.0, 1.0));
  float dep = max(-d.y, 0.0);
  float path = exp(-pow(daz / (0.012 + dep * 0.9), 2.0)) * exp(-dep / 0.06);
  float tw = 0.65 + 0.35 * vn(vec2(daz * 900.0, dep * 2600.0 + uTime * 1.7));
  return c + vec3(1.0, 0.36, 0.08) * path * 0.9 * tw;
}
`;

/* ---------------- the environment light: the same sky painted into a small equirect canvas ---------------- */
function paintSkyCanvas() {
  const w = 512, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sm = (a, b, x) => smooth(a, b, x);
  const sz = Math.hypot(SUN.x, SUN.z), sx = SUN.x / sz, szz = SUN.z / sz;
  const grad = (dx, dy, dz) => {
    const e = Math.max(dy, 0), hl = Math.hypot(dx, dz) || 1e-5;
    const ca = (dx / hl) * sx + (dz / hl) * szz, daz = Math.acos(Math.max(-1, Math.min(1, ca)));
    const tw = Math.exp(-daz * daz / 0.12) * 0.85 + 0.15 * Math.pow(ca * 0.5 + 0.5, 2);
    const H = mix(PAL.hA, PAL.hS, tw), M = mix(PAL.mA, PAL.mS, tw), Z = mix(PAL.zA, PAL.zS, tw);
    let col = mix(H, M, sm(0, 0.14, e)); col = mix(col, Z, sm(0.08, 0.75, e));
    const ang = Math.acos(Math.max(-1, Math.min(1, dx * SUN.x + dy * SUN.y + dz * SUN.z)));
    const k = (0.38 * Math.exp(-ang * ang / 0.008) + 0.13 * Math.exp(-ang / 0.3)) * (1 - 0.6 * sm(0, 0.5, e));
    return col.map((v, i) => v + PAL.glow[i] * k);
  };
  for (let j = 0; j < h; j++) {
    const el = (0.5 - (j + 0.5) / h) * Math.PI, ce = Math.cos(el), se = Math.sin(el);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w - 0.5) * TAU, dx = ce * Math.cos(phi), dz = ce * Math.sin(phi);
      let col;
      if (se >= 0) col = grad(dx, se, dz);
      else { const r = grad(dx, -se + 0.035, dz); col = mix([0.015, 0.02, 0.04], r.map((v) => v * 0.8), 0.8); }
      const k = (j * w + i) * 4;
      // linear → sRGB-ish encode (the texture is tagged sRGB)
      for (let q = 0; q < 3; q++) img.data[k + q] = Math.min(255, Math.pow(Math.max(0, col[q]), 1 / 2.2) * 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

let skyTex = null;                                       // painted once per page (main.js caches its environment map on it)

/* ---------------- material patch: world position, sky-coloured haze, optional detail / ripples / wet sand / sway / backlight ---------------- */
function patch(mat, U, o = {}) {
  const key = 'bu' + Object.keys(o).filter((k) => o[k]).join('-');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (o.det) sh.uniforms.uDet = { value: o.det };
    if (o.nor) sh.uniforms.uNorT = { value: o.nor };
    let vs = 'uniform float uTime; varying vec3 vSkyWP;\n' + (o.sway ? 'attribute float aFl;\n' : '') + sh.vertexShader;
    if (o.sway) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        float hh = max(position.y, 0.0), b = hh * hh * ${o.sway.toFixed(5)};
        transformed.x += (sin(uTime * 0.8 + ph) + 0.35 * sin(uTime * 1.9 + ph * 2.0)) * b;
        transformed.z += cos(uTime * 0.63 + ph * 1.3) * b * 0.6;
        transformed.y += sin(uTime * 2.4 + ph * 3.0 + aFl * 5.0) * 0.07 * aFl;
        transformed.x += sin(uTime * 2.1 + ph + aFl * 3.0) * 0.05 * aFl; }`);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 swp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          swp = instanceMatrix * swp;
        #endif
        vSkyWP = (modelMatrix * swp).xyz; }`);
    sh.vertexShader = vs;
    let fs = (o.det ? 'uniform sampler2D uDet;\n' : '') + (o.nor ? 'uniform sampler2D uNorT;\n' : '') + 'varying vec3 vSkyWP;\n' + SKY_GLSL + sh.fragmentShader;
    if (o.det) fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 an = abs(normalize(cross(dFdx(vSkyWP), dFdy(vSkyWP)))); an = pow(an, vec3(4.0)); an /= an.x + an.y + an.z;
        vec3 tx = texture2D(uDet, vSkyWP.zy * ${o.detS.toFixed(3)}).rgb * an.x + texture2D(uDet, vSkyWP.xz * ${o.detS.toFixed(3)}).rgb * an.y + texture2D(uDet, vSkyWP.xy * ${o.detS.toFixed(3)}).rgb * an.z;
        vec3 tx2 = texture2D(uDet, vSkyWP.xz * ${(o.detS * 0.17).toFixed(4)} + 0.37).rgb;
        float l = dot(tx, vec3(0.2126, 0.7152, 0.0722)) * 0.75 + dot(tx2, vec3(0.2126, 0.7152, 0.0722)) * 0.5;
        diffuseColor.rgb *= clamp(l * ${o.detK || '2.1'}, 0.55, 1.4); }`);
    if (o.leafy) fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
      { float lf = vn(vSkyWP.xz * 1.9 + vSkyWP.y * 1.3) * 0.55 + vn(vSkyWP.zy * 4.3 + vSkyWP.x * 1.7) * 0.45;
        diffuseColor.rgb *= 0.3 + 1.05 * smoothstep(0.2, 0.8, lf); }`);
    if (o.wet) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float seaNow = ${SEA_Y.toFixed(2)} + 0.045 * sin(uTime * 0.45);
      float wetK = 1.0 - smoothstep(0.0, 0.32, vSkyWP.y - seaNow);
      wetK *= smoothstep(-0.25, 0.02, vSkyWP.y - seaNow + 0.25);
      roughnessFactor = mix(roughnessFactor, 0.14, wetK);
      diffuseColor.rgb *= mix(1.0, 0.62, wetK);`);
    if (o.nor) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { float dd = length(vSkyWP - cameraPosition);
        vec3 nt = texture2D(uNorT, vSkyWP.xz * 0.55).xyz * 2.0 - 1.0;
        vec3 nt2 = texture2D(uNorT, vSkyWP.xz * 0.09 + 0.5).xyz * 2.0 - 1.0;
        float warp = vn(vSkyWP.xz * 0.35) * 6.0 + vn(vSkyWP.xz * 1.1) * 1.5;
        float rph = vSkyWP.x * 15.0 + vSkyWP.z * 5.0 + warp;
        float ramp = smoothstep(0.35, 0.75, vn(vSkyWP.xz * 0.12 + 3.0)) * 0.12 / (1.0 + dd * 0.12);
        vec2 pz = (nt.xy * 0.4 + nt2.xy * 0.3) / (1.0 + dd * 0.03) + vec2(cos(rph), cos(rph) * 0.33) * ramp;
        normal = normalize(normal + mat3(viewMatrix) * vec3(pz.x, 0.0, pz.y)); }`);
    if (o.trans) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 vd = normalize(vSkyWP - cameraPosition);
        float bl = pow(max(dot(vd, normalize(vec3(uSun.x, 0.25, uSun.z))), 0.0), 5.0);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.3) * ${o.trans.toFixed(2)} * bl; }`);
    fs = fs.replace('#include <fog_fragment>', `#ifdef USE_FOG
      { vec3 fd = normalize(vSkyWP - cameraPosition); float ff = smoothstep(fogNear, fogFar, vFogDepth);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHaze(fd), ff); }
      #endif`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/* ---------------- geometry helpers ---------------- */
function colorize(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new THREE.Color(c);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function xfm(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix();
  return geo.applyMatrix4(_o.matrix);
}
// merge keeping position / normal / color (+ aFl when present)
function mergeC(list, extra = []) {
  const keep = ['position', 'normal', 'color', ...extra];
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!keep.includes(k)) n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    for (const k of extra) if (!n.attributes[k]) n.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n.attributes.position.count), 1));
    if (!n.attributes.color) colorize(n, 0xffffff);
    return n;
  });
  return mergeGeometries(clean);
}
// a triangle-list geometry from flat arrays
function triGeo(pos, col, fl) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (fl) g.setAttribute('aFl', new THREE.Float32BufferAttribute(fl, 1));
  g.computeVertexNormals();
  return g;
}
function inst(geo, mat, list, { cast = false, receive = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach(([x, y, z, s = 1, ry = 0, rx = 0, rz = 0, sy], i) => {
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(s, sy === undefined ? s : sy, s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
  });
  im.castShadow = cast; im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}

/* ---------------- coconut palm: curved ringed trunk + coconuts (one geometry), crown of fronds (another) ---------------- */
function palmGeo(R, { h = 9, lean = 0.32, nFr = 16, hi = true }) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const curve = (t) => V(h * lean * (t - 0.42 * t * t) + h * 0.03 * Math.sin(t * 5), h * t, h * 0.02 * Math.sin(t * 3.3));
  // trunk
  const SEG = hi ? 40 : 18, RAD = hi ? 9 : 6, RINGS = Math.round(h * 2.6);
  const tp = [], tc = [];
  const ring = [];
  for (let j = 0; j <= SEG; j++) {
    const t = j / SEG, p = curve(t), q = curve(Math.min(1, t + 0.01)).sub(curve(Math.max(0, t - 0.01))).normalize();
    const n1 = V(-q.y, q.x, 0).normalize(), n2 = V(0, 0, 1);
    const f = (t * RINGS) % 1;
    const r = (0.2 * (1 - 0.38 * t) + 0.16 * Math.exp(-t * 16)) * (1 + 0.07 * Math.pow(f, 3) - 0.025);
    const shade = 0.72 + 0.28 * (1 - Math.pow(f, 4)) - (f > 0.92 ? 0.25 : 0);
    const base = new THREE.Color().setRGB(0.42, 0.36, 0.29).lerp(new THREE.Color(0.3, 0.26, 0.19), t * 0.6).multiplyScalar(shade);
    if (t > 0.94) base.lerp(new THREE.Color(0.36, 0.3, 0.14), 0.6);
    const rr = [];
    for (let i = 0; i <= RAD; i++) {
      const a = (i / RAD) * TAU;
      rr.push([p.clone().addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r), base.clone().multiplyScalar(0.92 + 0.08 * Math.cos(a + 1))]);
    }
    ring.push(rr);
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < RAD; i++) {
    const a = ring[j][i], b = ring[j][i + 1], c = ring[j + 1][i], d = ring[j + 1][i + 1];
    for (const [v, cc] of [a, c, b, b, c, d]) { tp.push(v.x, v.y, v.z); tc.push(cc.r, cc.g, cc.b); }
  }
  const top = curve(1);
  const trunk = [triGeo(tp, tc)];
  // the crown "boot" and coconuts
  if (hi) {
    const boot = new THREE.SphereGeometry(0.34, 10, 7); boot.scale(1, 0.9, 1); trunk.push(colorize(xfm(boot, top.x, top.y - 0.05, top.z), 0x5a4a26));
    const nC = 4 + Math.floor(R() * 5);
    for (let k = 0; k < nC; k++) {
      const a = (k / nC) * TAU + R(), rr = 0.3 + R() * 0.08;
      const cg = new THREE.IcosahedronGeometry(0.13 + R() * 0.03, 0); cg.scale(1, 1.15, 1);
      trunk.push(colorize(xfm(cg, top.x + Math.cos(a) * rr, top.y - 0.3 - R() * 0.15, top.z + Math.sin(a) * rr), R() < 0.6 ? 0x4c5a1e : 0x6a4a22));
    }
  }
  // fronds
  const fp = [], fc = [], ff = [];
  const up = V(0, 1, 0);
  const push = (v, c, fl) => { fp.push(v.x, v.y, v.z); fc.push(c.r, c.g, c.b); ff.push(fl); };
  for (let k = 0; k < nFr + 2; k++) {
    const dead = k >= nFr;                             // two dead fronds hanging down the trunk
    const layer = dead ? 1.2 : (k % 3) / 2 + R() * 0.2;  // 0 = young + upright, 1 = old + drooping
    const az = k * 2.39996 + R() * 0.3;
    const dirH = V(Math.cos(az), 0, Math.sin(az));
    const el0 = dead ? -1.25 : 0.95 - layer * 1.05;
    const L = (dead ? 2.6 : 3.4 + R() * 1.2) * (h / 9) ** 0.3;
    const droop = dead ? 0.05 : 0.07 + layer * 0.08;
    const P = (s) => top.clone().addScaledVector(dirH, L * s * Math.cos(el0)).addScaledVector(up, L * s * Math.sin(el0) - droop * (L * s) ** 2);
    const leafA = dead ? new THREE.Color(0.42, 0.31, 0.16) : new THREE.Color(0.16, 0.27, 0.08).lerp(new THREE.Color(0.3, 0.33, 0.1), layer * 0.6);
    const leafB = dead ? new THREE.Color(0.35, 0.25, 0.12) : new THREE.Color(0.24, 0.37, 0.12).lerp(new THREE.Color(0.38, 0.36, 0.14), layer * 0.5);
    const rach = new THREE.Color(0.52, 0.47, 0.24);
    // rachis: a thin ribbon
    const RS = hi ? 8 : 4;
    for (let s = 0; s < RS; s++) {
      const a = P(s / RS), b = P((s + 1) / RS), tng = b.clone().sub(a).normalize(), side = tng.clone().cross(up).normalize();
      const w0 = 0.05 * (1 - s / RS), w1 = 0.05 * (1 - (s + 1) / RS);
      const a0 = a.clone().addScaledVector(side, -w0), a1 = a.clone().addScaledVector(side, w0), b0 = b.clone().addScaledVector(side, -w1), b1 = b.clone().addScaledVector(side, w1);
      const f0 = s / RS, f1 = (s + 1) / RS;
      push(a0, rach, f0); push(b0, rach, f1); push(a1, rach, f0); push(a1, rach, f0); push(b0, rach, f1); push(b1, rach, f1);
    }
    // leaflets
    const NL = dead ? (hi ? 12 : 6) : (hi ? 30 : 13);
    for (let j = 0; j < NL; j++) {
      const s = 0.1 + 0.88 * (j / (NL - 1)), a = P(s), tng = P(Math.min(1, s + 0.02)).sub(P(Math.max(0, s - 0.02))).normalize();
      const side = tng.clone().cross(up).normalize();
      const len = (dead ? 0.6 : 1.25) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, s * 1.08))) * (0.9 + R() * 0.2);
      const hang = Math.min(1.35, (dead ? 1.6 : 0.3 + 1.0 * s + layer * 0.35) * 0.8);
      for (const sd of [-1, 1]) {
        const dir = side.clone().multiplyScalar(sd * Math.cos(hang)).addScaledVector(tng, 0.55).addScaledVector(up, -Math.sin(hang) + (s < 0.3 ? 0.2 : 0)).normalize();
        const tip = a.clone().addScaledVector(dir, len).addScaledVector(up, -0.26 * len * (0.5 + s));
        const fl = Math.min(1, s * 1.05);
        if (hi) {
          const mid = a.clone().addScaledVector(dir, len * 0.45).addScaledVector(up, -0.02 * len);
          const wv = tng.clone().multiplyScalar(0.034);
          const m0 = mid.clone().sub(wv), m1 = mid.clone().add(wv).addScaledVector(up, 0.02);
          const b0 = a.clone().addScaledVector(tng, -0.02), b1 = a.clone().addScaledVector(tng, 0.03);
          const cA = leafA, cB = leafB.clone().multiplyScalar(0.9 + R() * 0.2);
          push(b0, cA, fl); push(m0, cB, fl); push(b1, cA, fl);
          push(b1, cA, fl); push(m0, cB, fl); push(m1, cB, fl);
          push(m0, cB, fl); push(tip, cB, fl); push(m1, cB, fl);
        } else {
          const w = tng.clone().multiplyScalar(0.06);
          push(a.clone().sub(w), leafA, fl); push(tip, leafB, fl); push(a.clone().add(w), leafA, fl);
        }
      }
    }
  }
  return { trunk: mergeC(trunk), fronds: triGeo(fp, fc, ff), top };
}

/* ---------------- karst tower: a fluted, undercut limestone column with a rounded jungle top ---------------- */
function karstGeo(R, { x, z, h, r, base = -6, segA = 44, segY = 40, lean = 0, squash = 1 }) {
  const ph = [R() * 6, R() * 6, R() * 6, R() * 6, R() * 6];
  const pos = [], col = [];
  const P = [];
  const lx = (R() - 0.5) * lean, lz = (R() - 0.5) * lean;
  for (let j = 0; j <= segY; j++) {
    const t = j / segY, y = base + t * (h - base);
    const yr = y;                                           // world height
    let prof = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
    prof *= 0.84 + 0.12 * Math.sin(t * 5.3 + ph[0]) + 0.06 * Math.sin(t * 13 + ph[1]) + 0.035 * Math.sin(t * 29 + ph[2])
      + 0.12 * Math.exp(-(((t - 0.62 - 0.1 * Math.sin(ph[3])) / 0.07) ** 2));     // an overhanging bulge high up
    const notch = 1 - 0.22 * Math.exp(-(((yr - SEA_Y - 1.1) / 1.0) ** 2));   // the sea-cut notch at the waterline
    const row = [];
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * TAU;
      const lobes = 0.17 * Math.sin(a * 2 + ph[2] + t * 1.5) + 0.1 * Math.sin(a * 3 + ph[3] + t * 4) + 0.05 * Math.sin(a * 5 + t * 7 + ph[4]);
      const flute = 0.05 * Math.sin(a * 11 + ph[1] + t * 2.4) + 0.03 * Math.sin(a * 23 + ph[0] + t * 6) + 0.015 * Math.sin(a * 47 + ph[2] + t * 9)
        - 0.1 * Math.pow(Math.max(0, Math.sin(a * 7 + ph[4] + Math.sin(t * 6) * 0.3)), 10);   // deep vertical gullies
      const ledge = 0.06 * Math.max(0, Math.sin(t * 19 + a * 2 + ph[3])) + 0.03 * Math.max(0, Math.sin(t * 41 + a * 3 + ph[1]));
      const rr = r * prof * notch * (1 + lobes + flute + ledge) * (j === segY ? 0 : 1);
      row.push(new THREE.Vector3(x + Math.cos(a) * rr * squash + lx * t * h, y, z + Math.sin(a) * rr + lz * t * h));
    }
    P.push(row);
  }
  const idx = [];
  for (let j = 0; j < segY; j++) for (let i = 0; i < segA; i++) {
    const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  for (const row of P) for (const v of row) pos.push(v.x, v.y, v.z);
  const uvs = [], rep = Math.max(2, Math.round((TAU * r) / 5));
  for (let j = 0; j <= segY; j++) for (let i = 0; i <= segA; i++) uvs.push((i / segA) * rep, P[j][i].y / 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // limestone colours: cream / grey with orange + black streaks running down from the top, dark wet base, green ledges
  const n = g.attributes.normal, c = new THREE.Color(), cream = new THREE.Color(0.6, 0.55, 0.48), orange = new THREE.Color(0.62, 0.33, 0.17),
    black = new THREE.Color(0.11, 0.1, 0.1), green = new THREE.Color(0.1, 0.17, 0.06), wet = new THREE.Color(0.16, 0.14, 0.12);
  const tops = [];
  for (let j = 0; j <= segY; j++) for (let i = 0; i <= segA; i++) {
    const k = j * (segA + 1) + i, t = j / segY, a = (i / segA) * TAU, y = pos[k * 3 + 1];
    const s1 = Math.sin(a * 7 + ph[0]) * 0.5 + Math.sin(a * 13 + ph[2]) * 0.3 + Math.sin(a * 29 + ph[4]) * 0.2;
    const s2 = Math.sin(a * 5 + ph[3]) * 0.6 + Math.sin(a * 17 + ph[1]) * 0.4;
    c.copy(cream).offsetHSL(0, 0, (R() - 0.5) * 0.04 + 0.04 * Math.sin(y * 1.3 + Math.sin(a * 3) * 2));   // bedding
    c.lerp(orange, Math.min(1, Math.max(0, s1) * 0.9) * (0.4 + 0.6 * t));
    c.lerp(black, Math.min(1, Math.max(0, s2 - 0.2) * 1.3) * Math.min(1, t * 1.6));
    const ny = n.getY(k);
    if (ny > 0.42 && t > 0.15) c.lerp(green, Math.min(1, (ny - 0.42) * 2.2));
    if (t > 0.86) c.lerp(green, 0.85);
    if (y < SEA_Y + 2.2) c.lerp(wet, 0.75);
    col.push(c.r, c.g, c.b);
    if ((ny > 0.38 && t > 0.3) || t > 0.8) tops.push([pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], t]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // keep a handful of spots for jungle clumps: a crown on the top + some ledges
  const pick = (list, n) => { const out = []; for (let i = 0; i < n && list.length; i++) out.push(list.splice(Math.floor(R() * list.length), 1)[0]); return out; };
  const crown = tops.filter((p) => p[3] > 0.8), ledges = tops.filter((p) => p[3] <= 0.8);
  return { geo: g, tops: [...pick(crown, Math.round(10 + r * 0.6)), ...pick(ledges, Math.round(6 + r * 0.7))] };
}

/* ---------------- long-tail boat (one geometry per paint scheme) ---------------- */
function longtailGeo(R, hullCol, trimCol, canopy) {
  const L = 8, W = 1.25, N = 18;
  const st = [];
  for (let k = 0; k <= N; k++) {
    const u = k / N, x = -L / 2 + u * L;
    const w = (W / 2) * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * u)), 0.55) * (u > 0.97 ? 0.2 : 1);
    const sheer = 0.72 + 1.6 * Math.pow(u, 7) + 0.08 * (1 - u);
    const keel = 0.05 + 0.5 * Math.pow(u, 4);
    st.push({ x, w, sheer, keel });
  }
  const pos = [], col = [];
  const hc = new THREE.Color(hullCol), tc = new THREE.Color(trimCol), dark = new THREE.Color(0x2a2018), wood = new THREE.Color(0x7a5434);
  const sect = (s) => [[0, s.keel, dark], [s.w * 0.78, s.keel + 0.16, hc], [s.w, s.keel + (s.sheer - s.keel) * 0.6, hc], [s.w * 1.02, s.sheer - 0.06, tc], [s.w * 1.02, s.sheer, tc]];
  for (let k = 0; k < N; k++) {
    const A = sect(st[k]), B = sect(st[k + 1]);
    for (const sd of [-1, 1]) for (let i = 0; i < A.length - 1; i++) {
      const p = (S, s, q) => [S.x, q[1], q[0] * sd];
      const a0 = p(st[k], st[k], A[i]), a1 = p(st[k], st[k], A[i + 1]), b0 = p(st[k + 1], st[k + 1], B[i]), b1 = p(st[k + 1], st[k + 1], B[i + 1]);
      const quad = sd > 0 ? [a0, b0, a1, a1, b0, b1] : [a0, a1, b0, a1, b1, b0];
      const cs = sd > 0 ? [A[i][2], B[i][2], A[i + 1][2], A[i + 1][2], B[i][2], B[i + 1][2]] : [A[i][2], A[i + 1][2], B[i][2], A[i + 1][2], B[i + 1][2], B[i][2]];
      quad.forEach((v, q) => { pos.push(...v); col.push(cs[q].r, cs[q].g, cs[q].b); });
    }
  }
  const parts = [triGeo(pos, col)];
  // floor boards inside, thwarts, garlands on the bow, the long-tail engine + shaft
  const floor = new THREE.BoxGeometry(L * 0.8, 0.04, W * 0.7); parts.push(colorize(xfm(floor, -0.2, 0.28, 0), wood));
  for (const x of [-2.2, -0.6, 1.0, 2.2]) parts.push(colorize(xfm(new THREE.BoxGeometry(0.16, 0.05, W * 0.92), x, 0.62, 0), wood));
  const bow = st[N - 1];
  for (const [c, dy] of [[0xff3f7f, 0], [0xffd23f, -0.12], [0x3fa0ff, -0.24], [0xffffff, -0.36]]) {
    const tg = new THREE.TorusGeometry(0.1, 0.035, 4, 8); tg.rotateY(Math.PI / 2);
    parts.push(colorize(xfm(tg, bow.x - 0.05, bow.sheer + dy - 0.1, 0), c));
  }
  const rib = new THREE.ConeGeometry(0.16, 0.6, 5); rib.rotateZ(Math.PI); parts.push(colorize(xfm(rib, bow.x + 0.05, bow.sheer - 0.55, 0), 0xff5f9f));
  parts.push(colorize(xfm(new THREE.BoxGeometry(0.7, 0.5, 0.5), -3.55, 0.95, 0), 0x6f747a));
  const shaft = new THREE.CylinderGeometry(0.04, 0.04, 4.2, 5); shaft.rotateZ(1.32); parts.push(colorize(xfm(shaft, -5.5, 0.55, 0), 0x3a3633));
  const tiller = new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4); tiller.rotateZ(-1.0); parts.push(colorize(xfm(tiller, -2.9, 1.35, 0), 0x3a3633));
  if (canopy) {
    parts.push(colorize(xfm(new THREE.BoxGeometry(2.8, 0.05, W * 1.1), -0.4, 1.75, 0), canopy));
    for (const [x, z] of [[-1.7, 0.48], [-1.7, -0.48], [0.9, 0.48], [0.9, -0.48]]) parts.push(colorize(xfm(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), x, 1.15, z), 0x3b2a1f));
  }
  return mergeC(parts);
}

/* ---------------- stilt hut with a layered thatch hip roof ---------------- */
function hutGeo(R, wide = 1) {
  const parts = [], glow = [];
  const W = 3.4 * wide, D = 2.8;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) parts.push(colorize(xfm(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), dx * (W / 2 - 0.15), 0.42, dz * (D / 2 - 0.15)), 0x5a4330));
  parts.push(colorize(xfm(new THREE.BoxGeometry(W + 0.5, 0.12, D + 0.9), 0, 0.98, 0.3), 0x7a5a3a));
  const wall = new THREE.Color(0xb8955e);
  parts.push(colorize(xfm(new THREE.BoxGeometry(W, 1.75, D), 0, 1.92, 0), wall));
  for (let i = 0; i < 6; i++) parts.push(colorize(xfm(new THREE.BoxGeometry(W + 0.02, 0.04, D + 0.02), 0, 1.2 + i * 0.3, 0), 0x8a6a40));
  parts.push(colorize(xfm(new THREE.BoxGeometry(0.8, 1.35, 0.04), -0.6 * wide, 1.72, D / 2 + 0.01), 0x3a2618));
  glow.push(xfm(new THREE.PlaneGeometry(0.9, 0.62), 0.75 * wide, 2.05, D / 2 + 0.02));
  glow.push(xfm(new THREE.PlaneGeometry(0.62, 0.62), W / 2 + 0.02, 2.05, 0, Math.PI / 2));
  // railing on the veranda
  for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) parts.push(colorize(xfm(new THREE.BoxGeometry(0.05, 0.05, 0.85), x, 1.55, D / 2 + 0.3), 0x5a4330));
  parts.push(colorize(xfm(new THREE.BoxGeometry(W + 0.45, 0.05, 0.05), 0, 1.55, D / 2 + 0.72), 0x5a4330));
  // hip roof: three layers of thatch, each a 4-sided pyramid stretched to the hut's footprint
  const thatch = [new THREE.Color(0x857152), new THREE.Color(0x726048), new THREE.Color(0x8f7b58)];
  for (let l = 0; l < 3; l++) {
    const cone = new THREE.ConeGeometry(1, 1, 4, 1, true); cone.rotateY(Math.PI / 4);
    cone.scale((W / 2 + 0.9 - l * 0.25) * 1.414, 2.1 - l * 0.35, (D / 2 + 0.9 - l * 0.25) * 1.414);
    parts.push(colorize(xfm(cone, 0, 3.75 + l * 0.32, 0), thatch[l]));
  }
  parts.push(colorize(xfm(new THREE.BoxGeometry(W * 0.55, 0.14, 0.18), 0, 4.95, 0), 0x6a4c2a));
  return { body: mergeC(parts), glow: mergeGeometries(glow.map((g) => { g.deleteAttribute('uv'); return g; })) };
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildBeachUltra(ctx, uTime) {
  const { F, texLoader, glowTexture } = ctx;
  const root = new THREE.Group(); root.name = 'beach-ultra';
  const R = rng(4242);
  const ticks = [];
  const U = { uSun: { value: SUN.clone() }, uTime };
  const load = (name, srgb) => {
    const t = texLoader.load(`assets/beach-ultra/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const sandDiff = load('coast_sand_diff.jpg', true), sandNor = load('coast_sand_nor_gl.jpg'), rockDiff = load('rock_face_diff.jpg', true), rockNor = load('rock_face_nor_gl.jpg');
  const inWalk = (x, z, pad = 0) => Math.abs(x) < 24 + pad && Math.abs(z) < 16 + pad;          // the spectators' walking area

  /* ---------------- 1. SKY DOME ---------------- */
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: U, depthWrite: false, fog: false, side: THREE.BackSide,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p; gl_Position.z = p.w * 0.99999; }`,
      fragmentShader: SKY_GLSL + `varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 c;
          if (d.y < 0.0) c = seaFar(d);
          else {
            c = skyGrad(d);
            // the sun: a warm disc, flattened by the thick air at the horizon, half in the sea
            vec2 h = normalize(d.xz), s = normalize(uSun.xz);
            float daz = acos(clamp(dot(h, s), -1.0, 1.0)), del = asin(d.y) - asin(uSun.y);
            float r = length(vec2(daz, del * 1.22));
            float disc = 1.0 - smoothstep(0.0145, 0.0165, r);
            vec3 sunC = mix(vec3(1.9, 0.36, 0.03), vec3(2.4, 0.68, 0.07), smoothstep(-0.008, 0.012, del)) * (1.0 - 0.25 * smoothstep(0.006, 0.016, r));
            c = mix(c, sunC, disc);
            // drifting cloud streaks lit from below: gold near the sun, pink + violet away from it
            if (d.y > 0.012) {
              vec2 p = d.xz / (d.y + 0.05);
              vec2 q = p * vec2(0.42, 1.25) + vec2(uTime * 0.006, uTime * 0.002);
              float n = fbm(q) + 0.45 * fbm(q * 2.9 + vec2(3.1, 7.7)) - 0.22;
              float band = smoothstep(0.035, 0.12, d.y) * (1.0 - smoothstep(0.38, 0.85, d.y));
              float cov = smoothstep(0.5, 0.82, n) * band;
              float tw = pow(towardSun(d) * 0.5 + 0.5, 2.0);
              float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
              vec3 lit = mix(vec3(0.46, 0.1, 0.2), vec3(0.95, 0.24, 0.06), tw);
              vec3 shade = mix(vec3(0.05, 0.025, 0.08), vec3(0.14, 0.04, 0.05), tw);
              float under = 1.0 - smoothstep(0.55, 0.95, n);
              vec3 cc = mix(shade, lit, 0.35 + 0.65 * under * (1.0 - smoothstep(0.05, 0.6, d.y) * 0.5));
              cc += vec3(1.0, 0.36, 0.06) * exp(-ang / 0.16) * 0.7 * (1.0 - smoothstep(0.6, 0.9, n));
              c = mix(c, cc, cov * 0.9);
            }
          }
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(360, 64, 40), mat);
    dome.frustumCulled = false; dome.renderOrder = -100;
    root.add(dome);
  }

  /* ---------------- 2. TERRAIN: sand, wet edge, dunes, jungle floor, headlands ---------------- */
  const groundAt = (x, z) => {
    const sx = shoreX(z), inland = sx - x;
    let y = -0.12;
    if (x < -26) { const t = -26 - x; y += Math.min(t * 0.035, 2.4) + smooth(0, 25, t) * (0.35 * Math.sin(z * 0.11 + x * 0.05) + 0.25 * Math.sin(z * 0.31 - x * 0.17)); }
    if (x < -70) y += (-70 - x) * 0.09;
    const az = Math.abs(z);
    if (az > 20) y += smooth(20, 70, az) * smooth(0, 18, inland) * (0.8 + 0.5 * Math.sin(x * 0.07 + z * 0.05) + 0.3 * Math.sin(x * 0.21));
    if (az > 150) y += (az - 150) * 0.06 * smooth(0, 30, inland);
    if (x > sx) y = Math.max(-6, y - (x - sx) * SHELF);
    return y;
  };
  {
    const axis = (lo, hi, dense, d0, d1, coarse) => {        // dense spacing on [d0, d1], growing toward the ends
      const pts = [];
      let x = lo;
      while (x < hi) {
        pts.push(x);
        const out = x < d0 ? d0 - x : x > d1 ? x - d1 : 0;
        x += dense + (coarse - dense) * Math.min(1, out / 120);
      }
      pts.push(hi);
      return pts;
    };
    const xs = axis(-260, 270, 0.6, -36, 56, 12), zs = axis(-280, 280, 0.65, -40, 40, 12);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), colA = new Float32Array(nx * nz * 3), c = new THREE.Color();
    const dry = new THREE.Color(0.86, 0.74, 0.56), damp = new THREE.Color(0.66, 0.54, 0.4), under = new THREE.Color(0.42, 0.36, 0.28),
      grass = new THREE.Color(0.32, 0.36, 0.17), jungle = new THREE.Color(0.13, 0.2, 0.09);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i, y = groundAt(x, z), inland = shoreX(z) - x;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      c.copy(dry).offsetHSL(0, 0, (Math.sin(x * 0.8 + z * 0.3) * 0.5 + Math.sin(x * 0.13 - z * 0.27) * 0.5) * 0.025);
      c.lerp(damp, smooth(-4, 3, -inland) * 0.8);
      if (y < SEA_Y) c.lerp(under, smooth(SEA_Y, SEA_Y - 1, y));
      const veg = Math.max(smooth(-46, -60, x + Math.sin(z * 0.13) * 5), smooth(26, 40, inland + Math.sin(x * 0.2 + z * 0.1) * 5) * smooth(70, 110, Math.abs(z)) * 0.8);
      if (veg > 0) c.lerp(grass, veg).lerp(jungle, veg * smooth(0.5, 1, veg) * 0.8);
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
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 1.0 }), U, { det: sandDiff, detS: 0.35, detK: '2.0', nor: sandNor, wet: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------- 3. SEA ---------------- */
  {
    const wn = texLoader.load('assets/pond/water_nor.jpg'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uNor: { value: wn } }, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime; varying vec3 vWP;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); wp.y += 0.045 * sin(uTime * 0.45); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: SKY_GLSL + `uniform sampler2D uNor; varying vec3 vWP;
        float shoreX(float z){ float a = abs(z); return min(30.0 + 0.0042 * z * z + 22.0 * exp(-pow((a - 80.0) / 20.0, 2.0)), 230.0); }
        void main(){
          vec3 toP = vWP - cameraPosition; float dist = length(toP); vec3 V = toP / dist;
          vec2 uv = vWP.xz;
          vec3 n1 = texture2D(uNor, uv * 0.05 + vec2(uTime * 0.011, uTime * 0.004)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNor, uv * 0.13 + vec2(-uTime * 0.008, uTime * 0.012)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNor, uv * 0.012 + vec2(uTime * 0.003, -uTime * 0.002)).xyz * 2.0 - 1.0;
          float fade = 1.0 / (1.0 + dist * 0.01);
          vec2 sl = (n1.xy * 0.5 + n2.xy * 0.35 * fade + n3.xy * 0.6) * 0.32;
          sl.x += 0.06 * cos(vWP.x * 0.21 - uTime * 0.85 + sin(vWP.z * 0.05) * 2.0);
          vec3 N = normalize(vec3(sl.x, 1.0, sl.y));
          vec3 Rf = reflect(V, N); Rf.y = abs(Rf.y) + 0.012; Rf = normalize(Rf);
          float fr = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          float seaNow = ${SEA_Y.toFixed(2)} + 0.045 * sin(uTime * 0.45);
          float sx = shoreX(vWP.z);
          float sand = -0.12 - max(vWP.x - sx, 0.0) * ${SHELF.toFixed(3)};
          float depth = seaNow - sand;
          vec3 deep = vec3(0.012, 0.03, 0.05), shallow = vec3(0.07, 0.12, 0.11);
          vec3 body = mix(shallow, deep, smoothstep(0.1, 2.5, depth)) * vec3(1.2, 0.85, 0.95);
          vec3 col = mix(body, skyGrad(Rf) * 0.9, fr);
          float sd = max(dot(Rf, uSun), 0.0);
          float spark = pow(sd, 2200.0) * 4.0 + pow(sd, 260.0) * 0.45 + pow(sd, 30.0) * 0.05;
          col += vec3(1.0, 0.4, 0.1) * min(spark, 2.4);
          // foam: rolling crest lines and the lacy edge of the swash
          float d = vWP.x - (sx + ${WET.toFixed(3)});
          float ph = d / 7.5 + uTime * 0.1;
          float k = fract(ph);
          float crest = smoothstep(0.0, 0.04, k) * (1.0 - smoothstep(0.04, 0.22, k));
          crest *= smoothstep(0.3, 0.7, vn(vec2(vWP.z * 0.3, floor(ph) * 7.13) + vec2(vWP.x * 0.15, 0.0)));
          crest *= (1.0 - smoothstep(3.0, 24.0, d)) * smoothstep(-0.5, 1.5, d);
          float lace = vn(vWP.xz * vec2(1.6, 0.9) + vec2(uTime * 0.15, 0.0)) * 0.6 + vn(vWP.xz * 4.0) * 0.4;
          float edge = 1.0 - smoothstep(0.0, 0.05 + 0.07 * lace, depth);
          edge = max(edge, (1.0 - smoothstep(0.05, 0.2, depth)) * smoothstep(0.55, 0.75, lace) * 0.7);
          float foam = max(edge * 0.85, crest * 0.7);
          vec3 foamC = mix(vec3(0.62, 0.38, 0.42), vec3(0.95, 0.55, 0.32), pow(towardSun(V) * 0.5 + 0.5, 2.0)) * 0.75;
          col = mix(col, foamC, foam);
          // far away: the open sea (matches the sky dome below the horizon)
          col = mix(col, seaFar(V), smoothstep(150.0, 340.0, dist));
          float alpha = max(smoothstep(0.0, 0.5, depth), foam);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(760, 820); geo.rotateX(-Math.PI / 2); geo.translate(20 + 380, 0, 0);
    const sea = new THREE.Mesh(geo, mat);
    sea.position.y = SEA_Y; sea.renderOrder = 2;
    root.add(sea);
  }

  /* ---------------- 4. KARST TOWERS (both sides + inland), islands far out ---------------- */
  const vegSpots = [];
  {
    const rockMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.8, normalMap: rockNor, normalScale: new THREE.Vector2(1.4, 1.4) }), U, { det: rockDiff, detS: 0.11, detK: '2.3' });
    const list = [];
    // [x, z, height, radius, lean, squash]
    const T = [
      // left (−z) side
      [44, -52, 62, 13, 0.1, 1], [82, -74, 88, 17, 0.12, 0.9], [26, -78, 46, 10, 0.1, 1], [118, -44, 44, 9, 0.18, 1], [150, -120, 104, 22, 0.1, 1],
      [70, -128, 70, 15, 0.1, 1], [-8, -96, 74, 18, 0.1, 1.2], [200, -70, 38, 8, 0.15, 1],
      // right (+z) side (the sun sits at about z = 0.38·x — keep the towers clear of it)
      [40, 58, 58, 12, 0.1, 1], [92, 92, 92, 18, 0.12, 0.9], [24, 86, 44, 10, 0.1, 1], [156, 132, 110, 24, 0.1, 1], [-6, 104, 80, 19, 0.1, 1.2],
      [72, 140, 66, 14, 0.12, 1],
      // inland, behind the −x end (what the second camera looks at): a broken wall of towers, taller to the sides
      // (low in the middle so the second camera still sees the evening sky above the jungle)
      [-96, -88, 96, 18, 0.08, 1], [-150, -64, 58, 14, 0.1, 1], [-118, 96, 104, 20, 0.08, 1], [-160, 58, 52, 13, 0.1, 1.1],
      [-210, -130, 118, 26, 0.06, 1], [-215, 135, 112, 26, 0.06, 1], [-250, -36, 44, 15, 0.08, 1.2], [-235, 30, 30, 12, 0.1, 1],
    ];
    for (const [x, z, h, r, lean, sq] of T) {
      const g0 = groundAt(x, z);
      const k = karstGeo(R, { x, z, h: g0 + h, r, base: Math.min(g0, SEA_Y) - 6, lean, squash: sq, segA: Math.hypot(x, z) < 130 ? 64 : 44, segY: Math.hypot(x, z) < 130 ? 60 : 40 });
      list.push(k.geo);
      vegSpots.push(...k.tops);
      // a smaller shoulder tower beside most of them
      if (r > 10 && R() < 0.8) {
        const a = R() * TAU, d = r * (0.9 + R() * 0.4);
        const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
        if (!inWalk(x2, z2, 8)) {
          const k2 = karstGeo(R, { x: x2, z: z2, h: groundAt(x2, z2) + h * (0.45 + R() * 0.25), r: r * 0.55, base: Math.min(groundAt(x2, z2), SEA_Y) - 6, lean: 0.15, segA: 36, segY: 32 });
          list.push(k2.geo); vegSpots.push(...k2.tops.slice(0, 10));
        }
      }
    }
    // islands far out on the horizon, to either side of the sun
    for (const [x, z, h, r] of [[300, -150, 48, 16], [330, -105, 30, 11], [300, -78, 18, 7], [320, 180, 44, 15], [290, 212, 34, 12]]) {
      const k = karstGeo(R, { x, z, h, r, base: SEA_Y - 4, segA: 24, segY: 18, lean: 0.1 });
      list.push(k.geo);
    }
    const geo = mergeGeometries(list);
    const mesh = new THREE.Mesh(geo, rockMat);
    root.add(mesh);
  }

  /* ---------------- 5. JUNGLE: canopy clumps on the karsts' ledges + tops, the hinterland and the headlands ---------------- */
  {
    const clump = (() => {
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const b = new THREE.IcosahedronGeometry(0.6 + (k % 3) * 0.12, 0);
        const pa = b.attributes.position, nn = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) {                    // round normals: soft canopy domes, not faceted rocks
          const v = new THREE.Vector3().fromBufferAttribute(pa, i).normalize(); nn.set([v.x, v.y, v.z], i * 3);
          pa.setY(i, pa.getY(i) * 0.8);
        }
        b.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
        const a = k * 1.3; b.translate(Math.cos(a) * 0.45 * (k ? 1 : 0), 0.15 + (k % 2) * 0.25, Math.sin(a) * 0.45 * (k ? 1 : 0));
        parts.push(colorize(b, new THREE.Color(0.11, 0.2, 0.06).offsetHSL(0.02 * (k - 2), 0, 0.015 * k)));
      }
      const g = mergeC(parts);
      const c = g.attributes.color, p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 0.65 + 0.45 * Math.min(1, Math.max(0, p.getY(i) + 0.3)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
      return g;
    })();
    const spots = [];
    for (const [x, y, z, t] of vegSpots) spots.push([x, y - 0.6, z, (t > 0.8 ? 5.5 : 2.8) * (0.7 + R() * 0.6), R() * TAU]);
    // hinterland jungle behind the dunes: broadleaf trees (trunk + a dome of leaf clusters), undergrowth between them
    const trees = [];
    for (let i = 0; i < 520; i++) {
      const x = -50 - Math.pow(R(), 1.5) * 200, z = (R() - 0.5) * 520;
      trees.push([x, groundAt(x, z) - 0.2, z, 0.8 + R() * 0.7, R() * TAU, 0, 0, 0.7 + R() * 0.7]);
      if (R() < 0.45) spots.push([x + (R() - 0.5) * 8, groundAt(x, z) - 0.4, z + (R() - 0.5) * 8, 2 + R() * 2, R() * TAU]);
    }
    for (let i = 0; i < 420; i++) {                         // the headlands: scrub + trees
      const z = (R() < 0.5 ? -1 : 1) * (40 + Math.pow(R(), 0.8) * 220), sx = shoreX(z), x = -40 + R() * (sx - 45);
      if (sx - x < 26 || inWalk(x, z, 10)) continue;
      if (Math.abs(z) > 75 && R() < 0.5) trees.push([x, groundAt(x, z) - 0.2, z, 0.8 + R() * 0.6, R() * TAU, 0, 0, 0.6 + R() * 0.6]);
      else spots.push([x, groundAt(x, z) - 0.3, z, 1.6 + R() * 2.2, R() * TAU]);
    }
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), U, { trans: 0.5, leafy: true });
    root.add(inst(clump, mat, spots));
    const tree = (() => {
      const parts = [];
      const tr = new THREE.CylinderGeometry(0.22, 0.36, 7, 6, 1, true); tr.translate(0, 3.5, 0); parts.push(colorize(tr, 0x4a3c30));
      for (const [bx, by, bz] of [[0, 7.6, 0], [2.0, 6.9, 0.6], [-1.8, 7.0, -0.9], [0.5, 6.8, 2.0], [-0.7, 6.9, 1.9], [0.9, 7.1, -2.0], [0, 8.6, 0.2]]) {
        const b = new THREE.IcosahedronGeometry(1.0, 0), pa = b.attributes.position, nn = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pa, i).normalize(); nn.set([v.x, v.y, v.z], i * 3); pa.setXYZ(i, pa.getX(i) * 1.7, pa.getY(i) * 1.0, pa.getZ(i) * 1.7); }
        b.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); b.translate(bx, by, bz);
        parts.push(colorize(b, new THREE.Color(0.1, 0.19, 0.06).offsetHSL((bx * 0.01), 0, by > 8 ? 0.03 : 0)));
      }
      return mergeC(parts);
    })();
    root.add(inst(tree, mat, trees));
  }

  /* ---------------- 6. PALMS ---------------- */
  {
    const frondMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.7 }), U, { sway: 0.0012, trans: 0.9 });
    const trunkMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), U, { sway: 0.0012 });
    const variants = [{ h: 9.5, lean: 0.34 }, { h: 11.5, lean: 0.22 }, { h: 7.5, lean: 0.42 }];
    const near = [[], [], []], far = [[], [], []];
    const add = (x, z, face, s = 1) => {
      const v = Math.floor(R() * 3);
      const y = groundAt(x, z) - 0.05;
      const e = [x, y, z, s * (0.85 + R() * 0.3), face + (R() - 0.5) * 0.9];
      (Math.hypot(x, z) < 50 ? near : far)[v].push(e);
    };
    // the top of the beach on both sides of the court (leaning out toward the water) — clear of the walking area
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 13; i++) {
        const x = -30 + i * 5.6 + (R() - 0.5) * 2.5, z = sz * (18.5 + R() * 9 + Math.max(0, x) * 0.12);
        if (shoreX(z) - x < 8) continue;
        add(x, z, Math.atan2(-sz * 0.3, 1));
      }
      for (let i = 0; i < 14; i++) {                       // the curve of the bay
        const z = sz * (32 + i * 6 + R() * 3), x = shoreX(z) - 10 - R() * 14;
        add(x, z, Math.atan2(sz * 0.6, 1));
      }
    }
    // inland grove behind the −x end (huts among them)
    for (let i = 0; i < 36; i++) {
      const x = -27 - R() * 34, z = (R() - 0.5) * 120;
      if (inWalk(x, z, 2.5) || Math.abs(z) < 12) continue;          // keep the view past the court clear from the second camera
      add(x, z, R() * TAU);
    }
    variants.forEach((v, i) => {
      const hi = palmGeo(R, { ...v, hi: true }), lo = palmGeo(R, { ...v, hi: false, nFr: 13 });
      if (near[i].length) { root.add(inst(hi.trunk, trunkMat, near[i])); root.add(inst(hi.fronds, frondMat, near[i])); }
      if (far[i].length) { root.add(inst(lo.trunk, trunkMat, far[i])); root.add(inst(lo.fronds, frondMat, far[i])); }
    });
  }

  /* ---------------- 7. BEACH LIFE: long-tail boats, huts, driftwood, rocks, tide pools ---------------- */
  const boats = [];
  {
    const boatMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), U, {});
    const schemes = [[0x1f6a8a, 0xf2f2e8, 0xc0392b], [0xb8462a, 0x2a5a8a, null], [0x2f7a5a, 0xf2d24a, 0x1f5fa8]];
    const geos = schemes.map(([h, t, c]) => longtailGeo(R, h, t, c));
    const per = [[], [], []];
    // pulled up on the sand (bows to the sea) and at anchor in the shallows — none straight behind the court
    const spots = [[28, -13, -0.1, true], [30.5, -19, 0.15, true], [27.5, 21, -0.2, true], [31, 14, 0.1, true], [36, -27, 0.05, true],
      [52, -16, 0.4, false], [58, 26, -0.6, false], [70, -36, 0.9, false], [64, 42, -0.3, false], [84, -22, 0.2, false]];
    spots.forEach(([x, z, ry, beached], i) => {
      const xx = beached ? Math.min(x, shoreX(z) + WET - 3.2) : x;
      const y = beached ? groundAt(xx, z) + 0.02 : SEA_Y - 0.28;
      const b = { v: i % 3, x: xx, z, ry, y, beached, ph: R() * 6, tilt: beached ? (R() - 0.5) * 0.12 : 0 };
      b.i = per[b.v].length; per[b.v].push(b); boats.push(b);
    });
    const ims = per.map((list, v) => { const im = inst(geos[v], boatMat, list.map((b) => [b.x, b.y, b.z, 1, b.ry])); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im; });
    ticks.push((t) => {
      for (const b of boats) {
        if (b.beached) continue;
        _o.position.set(b.x, b.y + Math.sin(t * 1.1 + b.ph) * 0.06, b.z);
        _o.rotation.set(Math.sin(t * 0.9 + b.ph) * 0.035, b.ry + Math.sin(t * 0.21 + b.ph) * 0.06, Math.sin(t * 0.75 + b.ph) * 0.03);
        _o.scale.setScalar(1); _o.updateMatrix(); ims[b.v].setMatrixAt(b.i, _o.matrix);
      }
      for (const im of ims) im.instanceMatrix.needsUpdate = true;
    });
    for (const b of boats) if (b.beached) { _o.position.set(b.x, b.y, b.z); _o.rotation.set(b.tilt, b.ry, 0.04); _o.scale.setScalar(1); _o.updateMatrix(); ims[b.v].setMatrixAt(b.i, _o.matrix); }

    // stilt huts: a row inland behind the −x end (gap behind the court) and a few along the top of the beach
    const hutMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), U, {});
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa850).multiplyScalar(1.5), side: THREE.DoubleSide });
    const hut = hutGeo(R, 1), bar = hutGeo(R, 1.6);
    const hutSpots = [[-36, -32, 0.3], [-41, -21, -0.2], [-37, 22, 0.15], [-43, 34, -0.3], [-50, -48, 0.5], [-52, 50, -0.4], [-12, -30, 0.1], [6, 33, Math.PI + 0.2], [-14, 30, Math.PI - 0.1]];
    const hutL = hutSpots.map(([x, z, ry]) => [x, groundAt(x, z) - 0.1, z, 1, ry + (x < -20 ? Math.PI / 2 : 0)]);
    root.add(inst(hut.body, hutMat, hutL)); root.add(inst(hut.glow, glowMat, hutL));
    const barL = [[-30, -44, groundAt(-30, -44), 0.5]].map(([x, z, y, ry]) => [x, y - 0.1, z, 1, ry]);
    root.add(inst(bar.body, hutMat, barL)); root.add(inst(bar.glow, glowMat, barL));

    // driftwood, rocks + tide pools on the beach (all beyond the walking area)
    const wood = [];
    for (const [x, z, ry, s] of [[26, 8, 0.6, 1.1], [33, -8, -0.4, 0.9], [25.5, -24, 1.2, 1.3], [29, 30, -1.0, 1], [38, 36, 0.4, 1.2], [40, -40, -0.8, 1]]) {
      const parts = [];
      const log = new THREE.CylinderGeometry(0.16, 0.24, 3.6 * s, 7, 4); const p = log.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 0.9) * 0.18);
      log.rotateZ(Math.PI / 2); parts.push(colorize(log, 0x8a7a66));
      const br = new THREE.CylinderGeometry(0.05, 0.1, 1.2, 5); br.rotateZ(0.8); br.translate(1.0, 0.35, 0.1); parts.push(colorize(br, 0x7a6a56));
      const g = mergeC(parts); xfm(g, x, groundAt(x, z) + 0.12, z, ry, 0, 0.05);
      wood.push(g);
    }
    root.add(new THREE.Mesh(mergeC(wood), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), U, {})));

    const rockG = [0, 1, 2].map((s) => {
      const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, rr = rng(31 + s * 7);
      const ph = [rr() * 6, rr() * 6, rr() * 6];
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i), k = 1 + 0.18 * Math.sin(v.x * 3 + ph[0]) + 0.14 * Math.sin(v.y * 4 + ph[1]) + 0.1 * Math.sin(v.z * 5 + ph[2]);
        v.multiplyScalar(k); v.y *= 0.62; p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return colorize(g, 0x8a8276);
    });
    const rocks = [[], [], []], pools = [];
    const cluster = (cx, cz, n, sMax) => {
      for (let i = 0; i < n; i++) {
        const x = cx + (R() - 0.5) * 9, z = cz + (R() - 0.5) * 9;
        if (inWalk(x, z, 1)) continue;
        const s = 0.35 + R() * sMax;
        rocks[i % 3].push([x, groundAt(x, z) + s * 0.1, z, s, R() * TAU, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3]);
        if (R() < 0.3 && groundAt(x, z) > SEA_Y + 0.1) pools.push([x + s * 1.3, groundAt(x, z) + 0.03, z + (R() - 0.5) * 2, 0.6 + R() * 0.9, R() * TAU]);
      }
    };
    for (const sz of [-1, 1]) {
      cluster(shoreX(sz * 32) + 3, sz * 32, 9, 1.4);
      cluster(shoreX(sz * 50) + 4, sz * 50, 12, 2.0);
      cluster(shoreX(sz * 66) + 6, sz * 66, 16, 2.6);
      cluster(shoreX(sz * 80) + 8, sz * 80, 14, 3.0);
    }
    cluster(34, -36, 6, 1.0); cluster(33, 40, 6, 1.0);
    const rockMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), U, { det: rockDiff, detS: 0.5, detK: '2.0' });
    rocks.forEach((l, i) => { if (l.length) root.add(inst(rockG[i], rockMat, l)); });
    if (pools.length) {
      const pg = new THREE.CircleGeometry(1, 14); pg.rotateX(-Math.PI / 2);
      const pp = pg.attributes.position; for (let i = 1; i < pp.count; i++) { const k = 0.75 + 0.3 * Math.sin(i * 2.1); pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k * 0.7); }
      const poolMat = patch(new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6 }), U, {});
      root.add(inst(pg, poolMat, pools));
    }
  }

  /* ---------------- 8. LIFE: sea birds, sparkles on the sun path, boats far out ---------------- */
  {
    // birds: dark silhouettes gliding in wide circles off to the sides, wings flapping now and then
    const bg = new THREE.BufferGeometry();
    const bp = [0, 0, 0.35, 0, 0.03, -0.35, -0.08, 0, 0, 0, 0.03, -0.35, 0, 0, 0.35, 0.08, 0, 0,   // body
      0, 0, 0.12, -0.75, 0.1, -0.08, 0, 0, -0.12, 0, 0, 0.12, 0, 0, -0.12, 0.75, 0.1, -0.08,       // wings
      -0.75, 0.1, -0.08, -1.3, -0.05, -0.22, -0.6, 0.08, -0.2, 0.75, 0.1, -0.08, 0.6, 0.08, -0.2, 1.3, -0.05, -0.22];
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x1a0f14, side: THREE.DoubleSide, fog: false });
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
          float flap = sin(uTime * 7.0 + ph) * smoothstep(0.2, 0.6, sin(uTime * 0.5 + ph * 2.0));
          transformed.y += flap * abs(position.x) * 0.55; }`);
    };
    bm.customProgramCacheKey = () => 'bu-bird';
    const flock = [];
    for (let i = 0; i < 18; i++) {
      const sz = i % 2 ? 1 : -1;
      if (i < 12) flock.push({ cx: 70 + R() * 80, cz: sz * (55 + R() * 40), r: 8 + R() * 14, y: 9 + R() * 9, w: (0.1 + R() * 0.08) * (R() < 0.5 ? 1 : -1), a: R() * TAU, s: 0.8 + R() * 0.5 });   // over the karsts each side of the bay
      else flock.push({ cx: -90 - R() * 60, cz: sz * (40 + R() * 50), r: 10 + R() * 14, y: 18 + R() * 10, w: (0.08 + R() * 0.08) * (R() < 0.5 ? 1 : -1), a: R() * TAU, s: 0.9 + R() * 0.5 });   // over the jungle inland
    }
    const birds = new THREE.InstancedMesh(bg, bm, flock.length);
    birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); birds.frustumCulled = false;
    root.add(birds);
    ticks.push((t, dt) => {
      flock.forEach((b, i) => {
        b.a += b.w * dt;
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r * 0.7;
        _o.position.set(x, b.y + Math.sin(t * 0.3 + i) * 1.5, z);
        _o.rotation.set(0, -b.a - (b.w > 0 ? 0 : Math.PI), (b.w > 0 ? 1 : -1) * 0.25); _o.scale.setScalar(b.s); _o.updateMatrix();
        birds.setMatrixAt(i, _o.matrix);
      });
      birds.instanceMatrix.needsUpdate = true;
    });

    // sparkles: tiny warm glints twinkling on the sun path (as seen from the main camera, right of centre)
    {
      const N = 220, p = new Float32Array(N * 3), ph = new Float32Array(N);
      const C = new THREE.Vector3(-14.6, 5.3, 0);
      for (let i = 0; i < N; i++) {
        const d = 50 + Math.pow(R(), 0.7) * 260, sp = (R() - 0.5) * (0.012 + d * 0.00012) * 2.2;
        const az = SUN_AZ + sp;
        let x = C.x + Math.cos(az) * d, z = C.z + Math.sin(az) * d;
        if (x < shoreX(z) + WET + 4) x = shoreX(z) + WET + 4 + R() * 6;
        p.set([x, SEA_Y + 0.06, z], i * 3); ph[i] = R() * 100;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime, uMap: { value: glowTexture() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `uniform float uTime; attribute float aPh; varying float vA;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float tw = sin(uTime * (2.0 + fract(aPh) * 3.0) + aPh); vA = smoothstep(0.55, 1.0, tw);
            gl_PointSize = (2.0 + 2.5 * vA) * (110.0 / -mv.z) + 1.4; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; varying float vA;
          void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * 1.9 * vA * a, 1.0); }`,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3;
      root.add(pts);
    }

    // a few long-tails far out near the horizon (left of the sun), crawling along
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-3, 0, 0, 3.5, 0, 0, 4.2, 1.4, 0, -3, 0, 0, 4.2, 1.4, 0, -3, 0.7, 0, -1, 0.7, 0, 1.2, 0.7, 0, 0, 1.6, 0], 3));
      const m = new THREE.MeshBasicMaterial({ color: 0x1c1018, side: THREE.DoubleSide, fog: false });
      const far = [{ x: 230, z: -60, v: 1.2 }, { x: 260, z: -110, v: -0.9 }, { x: 205, z: -150, v: 0.7 }, { x: 250, z: 150, v: -0.8 }];
      const im = new THREE.InstancedMesh(g, m, far.length); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(im);
      ticks.push((t, dt) => {
        far.forEach((b, i) => {
          b.z += b.v * dt; if (b.z > -30 && b.z < 0) b.v = -Math.abs(b.v); if (b.z < -200) b.v = Math.abs(b.v);
          if (b.z < 120 && b.z > 0) b.v = Math.abs(b.v); if (b.z > 230) b.v = -Math.abs(b.v);
          _o.position.set(b.x, SEA_Y + 0.05 + Math.sin(t + i) * 0.1, b.z); _o.rotation.set(0, Math.PI / 2 * Math.sign(b.v), 0); _o.scale.setScalar(1.6); _o.updateMatrix();
          im.setMatrixAt(i, _o.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
      });
    }
  }

  const look = {
    sky: (skyTex ||= paintSkyCanvas()), envI: 0.7, bgI: 1, fog: 0x5a3048,
    key: 0xffa04a, keyI: 3.1, keyPos: KEY_POS, hemiSky: 0x6a5c9c, hemiGround: 0x7a4a2c, hemiI: 0.42,
    exposure: 1.0, bloom: 0.42, spots: 0.4,
  };
  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update, look: { night: look, day: look }, fog: { night: [45, 470], day: [45, 470] } };
}
