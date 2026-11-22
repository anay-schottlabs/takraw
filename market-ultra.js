// NIGHT MARKET ALLEY — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on
// Ultra; it replaces everything in market.js's `lite` (all but the boundary rail + floodlights) with a living night market:
//  • a wet asphalt street (Poly Haven texture) with puddles that catch the stall light, raised kerbs painted red / white;
//  • shophouses with real depth — open, lit shopfronts with interiors, sign bands, cornices, window hoods, balconies with
//    laundry and plants, AC units, blade signs, flickering neon, rooftop water tanks — and taller blocks + towers behind;
//  • side alleys between the shophouses, strung with bulbs, lanterns, wires and laundry, with their own little stalls and
//    people wandering in and out, opening onto a lit back street where scooters pass;
//  • dense stalls under glowing tarps and umbrellas: noodle carts, grills, wok stations, fruit pyramids, clothes racks,
//    trinkets, drinks and sweets — menu lightboxes, price cards, plastic tables + stools, coolers, gas tanks;
//  • overhead: bulb strings zig-zagging over the stall rows, swinging paper lanterns, power poles with cable tangles,
//    a few dark wires crossing the street high up (≥ 9 m over the court);
//  • life: steam, grill smoke + embers, wok flames, moths at the bulbs, cats, an animated crowd (market-crowd.js).
// Light: every stall bulb / tube / lantern / shop is painted into a top-down LIGHT MAP; all Ultra materials sample it, so
// the tarps, goods, people, facades and puddles are lit by the market itself with no real lights (no per-light cost).
// GAMEPLAY RULE: nothing on or above the court + free zone (+1.5 m), nothing bright behind the court's long axis; the only
// things crossing the street are thin dark wires above 9 m. All the bright life is in the stall rows and alleys.
import * as THREE from 'three';
import { rng, softTexture, TAU } from './temple-ultra.js';
import { makeEmbers } from './life.js';
import { makeAtlas, makeNeon } from './market-atlas.js';
import { makeCrowd } from './market-crowd.js';

const _o = new THREE.Object3D();
const _v = new THREE.Vector3();
const LMX = 112.0, LMZ = 56.0, LMS = 9;           // light map: world rect ±LMX × ±LMZ at LMS px / m

export function buildMarketUltra(ctx, uTime) {
  const { F, texLoader, camera } = ctx;
  const root = new THREE.Group(); root.name = 'market-ultra';
  const SIDE = F.outZ + 7.5;                        // building fronts (same as market.js)
  const LEN = 104;                                  // street half-length
  const Z0 = F.outZ + 1.6;                          // stall customer zone starts here (≥ 1.5 m clear of the boundary)
  const GH = 3.6, FH = 3.2;                         // shophouse ground / upper storey heights
  const R = rng(31337);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const A = makeAtlas(77), NE = makeNeon();
  const ticks = [];

  /* ================= frames, buckets, helpers ================= */
  // Each side of the street is built in a local frame: +z points AWAY from the court (z = distance from the centre line),
  // so stalls / facades are written once. Side +1 is the world as-is; side −1 is turned 180° about y.
  const SF = new THREE.Matrix4();
  let sideSign = 1;
  const setSide = (s) => { sideSign = s; SF.identity(); if (s < 0) SF.makeRotationY(Math.PI); };
  const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(SF);
  const B = { prop: {}, atlas: {}, metal: {}, fabric: {}, glow: {} };   // bucket → chunk → geometries
  const WHITE = A.white;
  let CAT = 'misc'; const STATS = {}; root.userData.stats = STATS;
  const withCat = (c, fn) => { const o = CAT; CAT = c; try { return fn(); } finally { CAT = o; } };
  function put(bk, geo, col, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, uvr = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const r = uvr || WHITE, uv = g.attributes.uv;
    if (uvr || bk === 'atlas' || bk === 'fabric') for (let i = 0; i < n; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    const c = col && col.isColor ? col : new THREE.Color(col ?? 0xffffff), ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); _o.scale.set(1, 1, 1); _o.updateMatrix();
    g.applyMatrix4(_o.matrix).applyMatrix4(SF);
    // chunk along the street (35 m bins) so the part behind each match camera is frustum-culled; the back blocks + towers
    // form their own chunk
    g.computeBoundingBox();
    const bb = g.boundingBox, mx = (bb.min.x + bb.max.x) / 2, mz = (bb.min.z + bb.max.z) / 2;
    const ck = Math.abs(mz) > SIDE + 9 ? 'F' : Math.abs(mx) > LEN + 2 ? 'E' + Math.sign(mx) : String(Math.max(0, Math.min(5, Math.floor((mx + LEN + 1) / 35.5))));
    (B[bk][ck] || (B[bk][ck] = [])).push(g);
    STATS[CAT] = (STATS[CAT] || 0) + n / 3;
    return g;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // detail falls off with distance along the street from the court (where both match cameras and most views are)
  let LOD = 2;
  const lodAt = (x) => (Math.abs(x) < 32 ? 2 : Math.abs(x) < 60 ? 1 : 0);
  const seg = (n, min = 3) => Math.max(min, LOD === 2 ? n : LOD === 1 ? Math.round(n * 0.7) : Math.round(n * 0.45));
  const cyl = (rt, rb, h, n = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg(n, 4), 1, open);
  const sph = (r, a = 8, b = 6) => new THREE.SphereGeometry(r, seg(a, 4), seg(b, 3));
  const lathe = (pts, n = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg(n, 4));
  const plane = (w, h, sx = 1, sy = 1) => new THREE.PlaneGeometry(w, h, sx, sy);
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  // a sagging wire (tube) from a to b (local coords); returns the curve so bulbs / lanterns can be hung along it
  function wire(a, b, sag, r = 0.009, col = 0x16161a, segs = 10) {
    const pts = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts);
    withCat('wire', () => put('prop', new THREE.TubeGeometry(curve, LOD === 2 ? segs : Math.max(4, Math.round(segs * 0.6)), r, LOD === 2 ? 4 : 3, false), col));
    return curve;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const FLAG = new THREE.BufferGeometry().setFromPoints([V(-0.14, 0, 0), V(0.14, 0, 0), V(0, -0.3, 0)]); FLAG.computeVertexNormals();

  /* ---- light registry → light map; particles + crowd + lanterns collected in world coords ---- */
  const lights = [];
  const light = (x, y, z, hex, rad, k) => { const p = toW(x, y, z); lights.push([p.x, p.z, new THREE.Color(hex), rad, k]); };
  const steamSrc = [], smokeSrc = [], emberSrc = [], flameSrc = [], mothSrc = [];
  const crowd = [];
  const lanterns = [];          // [x, y, z, colour, size]
  const bulbs = [];             // world positions for moths
  const SKIN = [0xc99a72, 0xb98a62, 0xa87850, 0xd8aa82, 0x8f6444, 0xe0b894, 0xbf9068];
  const HAIR = [0x141010, 0x1e1612, 0x2a1e16, 0x3a2a1e, 0x0e0c0c, 0x4a3a30, 0x141010, 0x8a8580];
  const SHIRT = [0x2a3a5a, 0xe8e4dc, 0x5a5a5e, 0x7a2a2a, 0x3a5a3a, 0xc8a040, 0x1e1e22, 0x8aa0c0, 0xc87a8a, 0x4a6a8a, 0xa85a3a, 0xd8d0b0, 0x3a7a7a, 0x6a4a7a, 0xf0f0ea, 0x9a3040];
  const PANTS = [0x2a3550, 0x1e1e22, 0x5a5048, 0x3a3a40, 0x8a7a60, 0x4a5a7a, 0x2a2a2e, 0x6a6458];
  function person(x, y, z, ry, mode, o = {}) {
    const p = toW(x, y, z);
    const ax = Math.abs(p.x);
    if ((ax > 66 && R() < 0.6) || (ax > 40 && R() < 0.35) || (ax > 18 && R() < 0.15)) return;
    const big = R();
    crowd.push({ far: ax > 34 && (mode !== 1 || ax > 44), x: p.x, y: p.y, z: p.z, ry: ry + (sideSign < 0 ? Math.PI : 0), mode, phase: R(), speed: o.speed || 0.9 + R() * 0.45, len: o.len || 1,
      sx: (o.child ? 0.66 : 1) * (0.92 + big * 0.24), sy: (o.child ? 0.68 : 1) * (0.93 + R() * 0.12),
      skin: pick(SKIN), shirt: o.shirt ?? pick(SHIRT), pants: pick(PANTS), hair: R() < 0.07 ? 0x8a8580 : pick(HAIR),
      variant: o.variant ?? (R() < 0.45 ? 1 : R() < 0.3 ? 2 : 0) });
  }
  function bulb(x, y, z, cordTop = null, hex = 0xffd9a0, k = 0.5, rad = 3.0) { withCat('bulb', () => bulb0(x, y, z, cordTop, hex, k, rad)); }
  function bulb0(x, y, z, cordTop, hex, k, rad) {
    if (cordTop !== null) put('prop', cyl(0.006, 0.006, cordTop - y, 3), 0x111111, x, (cordTop + y) / 2 + 0.05, z);
    if (cordTop !== null) put('prop', cyl(0.022, 0.022, 0.05, 6), 0x2a2a2a, x, y + 0.075, z);
    const s = new THREE.SphereGeometry(0.048, LOD === 2 ? 6 : 5, LOD === 2 ? 4 : 3); s.scale(1, 1.25, 1);
    put('glow', s, hex, x, y, z);
    if (k > 0) light(x, y, z, hex, rad, k);
    const p = toW(x, y, z); bulbs.push([p.x, p.y, p.z]);
  }
  function tube(x, y, z, len, ry = 0, k = 0.55) {
    put('glow', box(len, 0.035, 0.035), 0xe6f4ff, x, y, z, ry);
    put('metal', box(len + 0.06, 0.02, 0.06), 0xc8ccd0, x, y + 0.03, z, ry);
    light(x, y, z, 0xd8ecff, 3.6, k);
  }
  function menuBoard(x, y, z, ry = 0, w = 0.62) {     // a backlit menu lightbox on a pole
    put('metal', box(w + 0.06, w + 0.06, 0.06), 0xd8d8d8, x, y, z, ry);
    put('atlas', plane(w, w), 0xffffff, x - Math.sin(ry) * 0.035, y, z - Math.cos(ry) * 0.035, ry + Math.PI, 0, 0, pick(A.menus));
    light(x, y - 0.6, z - 0.3, 0xfff2e0, 1.6, 0.25);
  }
  function priceCard(x, y, z, ry = Math.PI) {
    put('atlas', plane(0.12, 0.24), 0xffffff, x, y + 0.12, z, ry, 0, 0, pick(A.prices));
    put('prop', cyl(0.004, 0.004, 0.2, 3), 0x8a6a40, x, y - 0.05, z);
  }
  const stoolCols = [0xd83a2a, 0x1f6fd8, 0x2fa04a, 0xe86aa0, 0xe8c02a];
  function stool(x, z, col = pick(stoolCols)) {
    const g = lathe([[0.001, 0.45], [0.16, 0.45], [0.165, 0.43], [0.15, 0.4], [0.19, 0.02], [0.18, 0.0]], 12);
    put('prop', g, col, x, 0, z);
  }
  function table(x, z, round = R() < 0.5, diners = true) { withCat('table', () => table0(x, z, round, diners)); }
  function table0(x, z, round, diners) {
    const top = round ? cyl(0.38, 0.38, 0.03, 16) : box(0.72, 0.03, 0.72);
    put('prop', top, pick([0xe8e2d0, 0xd8e8f0, 0xf0d8d0, 0xd84a3a, 0x3a7ad8]), x, 0.72, z);
    put('metal', cyl(0.03, 0.03, 0.7, 6), 0x8a8e92, x, 0.36, z);
    put('metal', cyl(0.24, 0.26, 0.03, 10), 0x6a6e72, x, 0.015, z);
    // condiment caddy, tissue box, bowls
    put('metal', box(0.14, 0.05, 0.1), 0xb8bcc0, x + 0.12, 0.76, z);
    for (let k = 0; k < 4; k++) put('prop', cyl(0.02, 0.02, 0.07, 6), [0xc8301a, 0xe8e0d0, 0x7a5a2a, 0x2a8a3a][k], x + 0.07 + k * 0.035, 0.81, z);
    put('prop', box(0.12, 0.08, 0.09), 0xf0f0f0, x - 0.18, 0.775, z + 0.1);
    const seats = [];
    for (const [dx, dz] of [[-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]]) if (R() < 0.8) { stool(x + dx, z + dz); seats.push([x + dx, z + dz]); }
    if (diners) for (const [sx, sz] of seats) if (R() < 0.5) {
      const ry = Math.atan2(x - sx, z - sz);
      person(sx, 0.02, sz, ry, 3);
      const bw = lathe([[0.001, 0], [0.04, 0], [0.075, 0.05], [0.08, 0.06]], 10);
      put('prop', bw, pick([0xf0f0f0, 0xd84a3a, 0x3a8ad8]), sx + (x - sx) * 0.45, 0.735, sz + (z - sz) * 0.45);
    }
  }
  function cooler(x, z, ry = 0, col = pick([0xc8302a, 0x2a5ab8, 0x2a8a4a])) {
    put('prop', box(0.62, 0.38, 0.4), col, x, 0.19, z, ry);
    put('prop', box(0.64, 0.07, 0.42), 0xf0f0ea, x, 0.415, z, ry);
    put('prop', box(0.3, 0.03, 0.05), 0xe8e8e0, x, 0.47, z, ry);
  }
  function gasTank(x, z) {
    put('prop', lathe([[0.001, 0], [0.16, 0.0], [0.17, 0.05], [0.17, 0.42], [0.12, 0.5], [0.05, 0.52], [0.001, 0.52]], 12), pick([0xc8302a, 0x2a5ab8, 0x3a8a4a]), x, 0, z);
    put('metal', cyl(0.025, 0.025, 0.08, 6), 0x9a8a40, x, 0.56, z);
  }
  function crate(x, y, z, ry = 0, col = pick([0x2a6ad8, 0xd83a2a, 0x2fa04a, 0xe8c02a])) {
    put('prop', box(0.5, 0.3, 0.35), col, x, y + 0.15, z, ry);
    put('prop', box(0.46, 0.02, 0.31), shade(col, 0.5), x, y + 0.29, z, ry);
  }
  // simple garment shapes (local, centred on the hanger at the top), uv 0..1 over their bounding box
  function shapeGeo(pts) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(sh);
    g.computeBoundingBox(); const bb = g.boundingBox, uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    return g;
  }
  const TEE = shapeGeo([[-0.12, 0], [-0.3, -0.08], [-0.34, -0.22], [-0.22, -0.24], [-0.21, -0.68], [0.21, -0.68], [0.22, -0.24], [0.34, -0.22], [0.3, -0.08], [0.12, 0], [0.05, -0.05], [-0.05, -0.05]]);
  const DRESS = shapeGeo([[-0.1, 0], [-0.16, -0.05], [-0.16, -0.3], [-0.3, -0.95], [0.3, -0.95], [0.16, -0.3], [0.16, -0.05], [0.1, 0], [0, -0.08]]);
  const PANT = shapeGeo([[-0.22, 0], [0.22, 0], [0.26, -0.95], [0.06, -0.95], [0, -0.3], [-0.06, -0.95], [-0.26, -0.95]]);
  function garment(x, y, z, ry, kind = R()) {
    const g = kind < 0.5 ? TEE : kind < 0.75 ? DRESS : PANT;
    put('fabric', g, 0xffffff, x, y, z, ry + (R() - 0.5) * 0.25, 0, (R() - 0.5) * 0.08, pick(A.prints));
    put('metal', box(0.36, 0.012, 0.012), 0x6a6a6a, x, y + 0.005, z, ry);
  }

  /* ================= materials ================= */
  const lmCanvas = document.createElement('canvas');
  lmCanvas.width = Math.round(LMX * 2 * LMS); lmCanvas.height = Math.round(LMZ * 2 * LMS);
  const LMtex = new THREE.CanvasTexture(lmCanvas); LMtex.flipY = false;
  const LMU = { value: LMtex };
  const loadT = (path, srgb, rep = 1) => { const t = texLoader.load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const grime = loadT('assets/temple-ultra/clay_plaster_diff.jpg', true);
  // light-map + optional triplanar grime + optional puddles, patched into a standard material
  function litPatch(sh, U, o = {}) {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `{
        mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWP = (wm * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(wm) * objectNormal);
      }
      #include <project_vertex>`);
    let f = `varying vec3 vWP; varying vec3 vWN; uniform sampler2D uLM; uniform float uLMK; uniform float uUp; uniform float uLMH; uniform float uPud;
      uniform sampler2D uTri; uniform float uTS; uniform float uTA; float gPud = 0.0;
    ` + sh.fragmentShader;
    f = f.replace('#include <map_fragment>', `#include <map_fragment>
      ${o.tri ? `{ vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 tx = texture2D(uTri, vWP.zy * uTS).rgb * bw.x + texture2D(uTri, vWP.xz * uTS).rgb * bw.y + texture2D(uTri, vWP.xy * uTS).rgb * bw.z;
        diffuseColor.rgb *= mix(1.0, clamp(dot(tx, vec3(0.2126, 0.7152, 0.0722)) * 2.0, 0.62, 1.3), uTA); }` : ''}
      ${o.puddle ? `{ float n1 = texture2D(uTri, vWP.xz * 0.021).r, n2 = texture2D(uTri, vWP.xz * 0.067 + 0.37).r;
        gPud = smoothstep(0.5, 0.56, n1 * 0.75 + n2 * 0.35) * uPud * step(vWP.y, -0.05);
        diffuseColor.rgb *= mix(1.0, 0.42, gPud); }` : ''}`);
    if (o.puddle) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.06, gPud);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, normalize(vNormal), gPud * 0.85));');
    f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec2 luv = vec2((vWP.x + ${LMX.toFixed(1)}) / ${(2 * LMX).toFixed(1)}, (vWP.z + ${LMZ.toFixed(1)}) / ${(2 * LMZ).toFixed(1)}) + vWN.xz * 0.0035;
        vec3 lm = texture2D(uLM, luv).rgb;
        float fall = exp(-max(vWP.y - uLMH, 0.0) / 2.4);
        float face = mix(1.0, uUp, max(vWN.y, 0.0)) + 0.3 * max(-vWN.y, 0.0);
        vec3 L = (1.0 - exp(-lm * 2.6)) * uLMK * fall * face;
        totalEmissiveRadiance += diffuseColor.rgb * L ${o.puddle ? '+ L * gPud * 0.55' : ''}; }`);
    sh.fragmentShader = f;
  }
  const matU = [];
  function lit(mat, o = {}) {
    const U = { uLM: LMU, uLMK: { value: o.k ?? 1.25 }, uUp: { value: o.up ?? 0.55 }, uLMH: { value: o.h ?? 3.0 }, uPud: { value: 1 },
      uTri: { value: o.tri || o.puddle ? grime : null }, uTS: { value: o.triScale ?? 0.35 }, uTA: { value: o.triAmt ?? 0.85 } };
    U.base = o.k ?? 1.25; matU.push(U);
    mat.onBeforeCompile = (sh) => litPatch(sh, U, o);
    mat.customProgramCacheKey = () => 'mkU' + (o.tri ? 't' : '') + (o.puddle ? 'p' : '');
    return mat;
  }
  const M = {
    prop: lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })),
    atlas: lit(new THREE.MeshStandardMaterial({ vertexColors: true, map: A.map, emissiveMap: A.glow, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.88 }), { tri: true, triScale: 0.32, triAmt: 0.7 }),
    metal: lit(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.34 }), { k: 0.9 }),
    fabric: lit(new THREE.MeshStandardMaterial({ vertexColors: true, map: A.map, roughness: 0.85, side: THREE.DoubleSide }), { up: 0.6, k: 1.25 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0xffffff).multiplyScalar(2.4) }),
  };

  /* ================= 1. GROUND — wet asphalt with puddles, kerbs, sidewalks ================= */
  {
    const gw = LEN * 2 + 24, gd = (SIDE + 44) * 2;
    const diff = loadT('assets/market-ultra/asphalt_diff.jpg', true), nor = loadT('assets/market-ultra/asphalt_nor.jpg', false), rough = loadT('assets/market-ultra/asphalt_rough.jpg', false);
    for (const t of [diff, nor, rough]) t.repeat.set(gw / 3.2, gd / 3.2);
    const gm = lit(new THREE.MeshStandardMaterial({ color: 0x8c8c92, map: diff, normalMap: nor, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: rough, roughness: 1, envMapIntensity: 1.2 }), { puddle: true, up: 1, k: 1.5 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), gm);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true;
    root.add(ground);
  }

  /* ================= 2. EACH SIDE: shophouses, alleys, stalls, overhead ================= */
  const ALLEYS = { 1: [[-61, 4.2], [-33, 3.8], [19, 4.0], [47, 4.4], [80, 3.8]], [-1]: [[-76, 4.0], [-45, 4.2], [-21, 3.8], [31, 4.0], [62, 4.2]] };
  const WALL = [0xf4e6c8, 0xd8ecdf, 0xf0cdbf, 0xe0d4ee, 0xf6eccf, 0xcfe2f0, 0xf0d49e, 0xd6e6be, 0xe8e2da, 0xf2c8c8, 0xc8d8d8];
  const unitsBySide = { 1: [], [-1]: [] };

  function shophouse(...a) { withCat('shophouse', () => shophouse0(...a)); }
  function shophouse0(x0, x1, nf, s, alleyL, alleyR) {
    LOD = lodAt((x0 + x1) / 2);
    const w = x1 - x0, cx = (x0 + x1) / 2, top = GH + (nf - 1) * FH, tint = new THREE.Color(pick(WALL));
    const tBody = tint.clone().multiplyScalar(0.82);
    const Z = SIDE;
    unitsBySide[s].push([x0, x1, top]);
    // body (behind the ground-floor recess)
    put('atlas', box(w, top - 2.75, 8), tBody, cx, 2.75 + (top - 2.75) / 2, Z + 4, 0, 0, 0, A.plain);
    put('atlas', box(w, 2.75, 4.7), tBody, cx, 1.375, Z + 3.3 + 2.35, 0, 0, 0, A.plain);
    // upper storeys: window bay, cornice, sill, hood, balcony, AC, laundry
    for (let f = 1; f < nf; f++) {
      const y = GH + (f - 1) * FH;
      const bay = R() < 0.55 ? pick(A.bays.filter((b) => b.lit)) : pick(A.bays.filter((b) => !b.lit));
      put('atlas', plane(w, FH), tint, cx, y + FH / 2, Z - 0.005, Math.PI, 0, 0, bay.uv);
      put('atlas', box(w + 0.04, 0.16, 0.3), tint.clone().multiplyScalar(0.9), cx, y, Z - 0.15, 0, 0, 0, A.plain);
      put('atlas', box(w * 0.56, 0.06, 0.16), tint, cx, y + 0.86, Z - 0.08, 0, 0, 0, A.plain);
      put('atlas', box(w * 0.62, 0.07, 0.5), tint.clone().multiplyScalar(0.95), cx, y + 2.66, Z - 0.25, 0, -0.14, 0, A.plain);
      if (bay.lit && R() < 0.2) light(cx, y + 1.5, Z - 0.6, bay.warm ? 0xffc890 : 0xc8e0ff, 2.2, 0.18);
      const balcony = R() < 0.3;
      if (balcony) {
        const bw = w - 0.4, rc = pick([0x2f4a3a, 0xe8e8e2, 0x3a3a3e, 0x6a2a24]);
        put('atlas', box(bw, 0.12, 0.95), tint.clone().multiplyScalar(0.85), cx, y + 0.06, Z - 0.475, 0, 0, 0, A.plain);
        put('metal', box(bw, 0.045, 0.045), rc, cx, y + 1.08, Z - 0.93);
        put('metal', box(bw, 0.03, 0.03), rc, cx, y + 0.2, Z - 0.93);
        for (let k = 0; k <= Math.floor(bw / (LOD === 2 ? 0.13 : 0.22)); k++) put('metal', box(0.018, 0.88, 0.018), rc, cx - bw / 2 + k * (LOD === 2 ? 0.13 : 0.22), y + 0.64, Z - 0.93);
        for (const sx of [-1, 1]) put('metal', box(0.03, 0.9, 0.9), rc, cx + sx * bw / 2, y + 0.64, Z - 0.48);
        for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
          const px = cx - bw / 2 + 0.3 + R() * (bw - 0.6);
          put('prop', cyl(0.13, 0.1, 0.24, 8), pick([0xb8603a, 0x3a7a4a, 0xe8e8e0]), px, y + 0.24, Z - 0.6);
          const leaf = new THREE.IcosahedronGeometry(0.2 + R() * 0.12, 1); leaf.scale(1, 1.2, 1);
          put('prop', leaf, pick([0x2f6a2a, 0x3a7a32, 0x4a8a3a]), px, y + 0.55, Z - 0.6);
        }
        if (R() < 0.7) {                         // laundry on a line under the hood
          wire(V(cx - bw / 2, y + 2.25, Z - 0.8), V(cx + bw / 2, y + 2.25, Z - 0.8), 0.12, 0.005, 0x2a2a2a, 6);
          for (let k = 0; k < 3 + Math.floor(R() * 4); k++) { const gx = cx - bw / 2 + 0.4 + k * 0.55; if (gx > cx + bw / 2 - 0.3) break; garment(gx, y + 2.22 - 0.1 * Math.sin(Math.PI * (gx - cx + bw / 2) / bw), Z - 0.8, Math.PI, R() < 0.8 ? 0.1 : 0.9); }
        }
        if (R() < 0.15) { put('prop', lathe([[0.001, 0.32], [0.08, 0.3], [0.15, 0.2], [0.16, 0], [0.001, 0]], 10), 0xd8c890, cx + bw / 2 - 0.4, y + 1.7, Z - 0.75); }   // bird cage
      }
      if (R() < 0.42) {                          // AC unit on a bracket, beside the window
        const ax = cx + (R() < 0.5 ? -1 : 1) * (w * 0.38), ay = y + (balcony ? 1.6 : 0.55);
        put('prop', box(0.8, 0.55, 0.3), 0xe2e2dc, ax, ay, Z - 0.16);
        put('atlas', plane(0.78, 0.53), 0xffffff, ax, ay, Z - 0.312, Math.PI, 0, 0, A.ac);
        if (!balcony) for (const sx of [-0.3, 0.3]) put('metal', box(0.03, 0.03, 0.34), 0x4a4a4a, ax + sx, ay - 0.29, Z - 0.17);
      }
    }
    // parapet + coping, sometimes a stepped crest with the shop's name
    put('atlas', box(w + 0.02, 0.9, 0.3), tint, cx, top + 0.45, Z + 0.1, 0, 0, 0, A.plain);
    put('atlas', box(w + 0.12, 0.08, 0.42), tint.clone().multiplyScalar(0.85), cx, top + 0.94, Z + 0.1, 0, 0, 0, A.plain);
    if (R() < 0.25) { put('atlas', box(w * 0.5, 0.55, 0.26), tint, cx, top + 1.25, Z + 0.1, 0, 0, 0, A.plain); put('atlas', box(w * 0.5 + 0.1, 0.06, 0.36), tint.clone().multiplyScalar(0.85), cx, top + 1.55, Z + 0.1, 0, 0, 0, A.plain); }
    // rooftop: water tank, antenna, a little shack
    if (R() < 0.55) {
      const tx = cx + (R() - 0.5) * (w - 1.4), tz = Z + 2.5 + R() * 4;
      const steel = R() < 0.5;
      put(steel ? 'metal' : 'prop', lathe([[0.001, 0], [0.55, 0], [0.56, 0.05], [0.56, 1.0], [0.5, 1.12], [0.12, 1.18], [0.001, 1.18]], 14), steel ? 0xd8dadc : pick([0x2a5ab8, 0xd8d8d0, 0x2f8a5a]), tx, top + 0.55, tz);
      for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) put('metal', box(0.05, 0.55, 0.05), 0x5a5a5a, tx + dx, top + 0.27, tz + dz);
    }
    if (R() < 0.35) { const ax = cx + (R() - 0.5) * w * 0.6; put('metal', cyl(0.02, 0.03, 3.2, 5), 0x8a8a8a, ax, top + 1.6, Z + 4); for (let k = 0; k < 3; k++) put('metal', box(1.1 - k * 0.25, 0.025, 0.025), 0x8a8a8a, ax, top + 2.2 + k * 0.4, Z + 4); }
    if (R() < 0.15) { put('atlas', box(2.2, 2.2, 2.4), tint.clone().multiplyScalar(0.7), cx, top + 1.1, Z + 5.5, 0, 0, 0, A.plain); put('metal', box(2.6, 0.06, 2.8), 0x7a6a5a, cx, top + 2.25, Z + 5.5, 0, 0.08); }

    // ground floor: pillars, sign band, open lit shop (or a closed shutter), awning
    for (const px of [x0 + 0.16, x1 - 0.16]) put('atlas', box(0.32, GH, 0.42), tint, px, GH / 2, Z - 0.05, 0, 0, 0, A.plain);
    put('atlas', box(w, GH - 2.75, 0.3), tint, cx, (2.75 + GH) / 2, Z - 0.1, 0, 0, 0, A.plain);
    const sign = pick(A.signs);
    put('atlas', plane(w - 0.6, 0.62), 0xffffff, cx, (2.75 + GH) / 2, Z - 0.255, Math.PI, 0, 0, sign.uv);
    if (sign.lit) light(cx, 3.1, Z - 1, 0xfff0d8, 2.6, 0.2);
    const iw = w - 0.64;
    if (R() < 0.78) {
      const shop = Math.floor(R() * A.shops.length);
      put('atlas', plane(iw, 2.75), 0xffffff, cx, 1.375, Z + 3.25, Math.PI, 0, 0, A.shops[shop]);
      for (const sx of [-1, 1]) put('atlas', plane(3.3, 2.75), tint.clone().multiplyScalar(0.9), cx + sx * iw / 2, 1.375, Z + 1.6, sx * Math.PI / 2 * -1, 0, 0, A.plain);
      put('atlas', plane(iw, 3.3), tint.clone().multiplyScalar(0.7), cx, 2.75, Z + 1.6, 0, Math.PI / 2, 0, A.plain);
      put('prop', plane(iw, 3.3), pick([0xd8d0c0, 0xc8c0b0, 0xa89880, 0xe0dcd4]), cx, -0.1, Z + 1.6, 0, -Math.PI / 2);
      tube(cx, 2.7, Z + 1.4, Math.min(1.2, iw - 0.4), 0, 0.42);
      put('metal', cyl(0.16, 0.16, iw, 10), 0x8a8e92, cx, 2.6, Z + 0.12, 0, 0, Math.PI / 2);
      // a counter + shelving inside
      put('prop', box(iw * 0.45, 0.95, 0.55), pick([0x8a6a4a, 0xe8e4dc, 0x5a5a60]), cx + (R() - 0.5) * iw * 0.4, 0.47, Z + 2.2);
      for (const sx of [-1, 1]) if (R() < 0.6) {
        const sx0 = cx + sx * (iw / 2 - 0.25);
        put('prop', box(0.45, 1.9, 2.4), 0x6a6a6e, sx0, 0.95, Z + 1.9);
        for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) if (LOD > 0 || (k + j) % 2) put('prop', box(0.3, 0.25 + R() * 0.12, 0.4), pick([0xe84a3a, 0xf0c030, 0x3a8ad8, 0x5ac05a, 0xf08a2a, 0xffffff]), sx0 - sx * 0.05, 0.3 + k * 0.45, Z + 0.95 + j * 0.6);
      }
      if (R() < 0.35) person(cx + (R() - 0.5) * iw * 0.5, 0, Z + 2.75, Math.PI, 4);
    } else {
      put('atlas', plane(iw, 2.75), tint.clone().lerp(new THREE.Color(0xffffff), 0.5), cx, 1.375, Z + 0.15, Math.PI, 0, 0, A.shutter);
    }
    if (R() < 0.62) {                            // awning over the sidewalk
      const fab = R() < 0.6;
      const aw = plane(w - 0.15, 1.7, 4, 2);
      put('fabric', aw, fab ? 0xffffff : pick([0x9aa4aa, 0x6a8aa8, 0xb85a3a]), cx, 3.12, Z - 0.82, Math.PI, Math.PI / 2 + 0.26, 0, fab ? pick(A.tarps) : null);
      for (const sx of [x0 + 0.4, x1 - 0.4]) put('metal', box(0.04, 0.04, 1.6), 0x3a3a3a, sx, 3.05, Z - 0.8, 0, -0.27);
    }
    // the alley walls: windows, AC units and a pipe on the side facing the alley
    for (const [face, xs] of [[alleyL, x0], [alleyR, x1]]) {
      if (!face) continue;
      const dir = xs === x0 ? -1 : 1;
      for (let f = 1; f < nf; f++) for (const dz of [2.2, 5.6]) {
        const y = GH + (f - 1) * FH, ap = pick(A.apts);
        put('atlas', plane(2.6, 2.4), tint, xs + dir * 0.01, y + 1.5, Z + dz, dir * Math.PI / 2, 0, 0, ap.uv);
        if (R() < 0.3) { put('prop', box(0.3, 0.5, 0.75), 0xe2e2dc, xs + dir * 0.16, y + 0.5, Z + dz + 1.4); }
      }
      put('metal', cyl(0.05, 0.05, top, 6), 0x5a5a5a, xs + dir * 0.1, top / 2, Z + 0.6);
      // a small lit doorway into the alley
      put('atlas', plane(1.1, 2.2), 0xffffff, xs + dir * 0.01, 1.1, Z + 4.5, dir * Math.PI / 2, 0, 0, pick(A.shops));
      light(xs + dir * 0.6, 1.5, Z + 4.5, 0xffd8a0, 2.4, 0.3);
    }
  }

  function backBlock(...a) { return withCat('back', () => backBlock0(...a)); }
  function backBlock0(x0, x1, nf, Z) {             // the taller blocks behind the back street
    const w = x1 - x0, cx = (x0 + x1) / 2, top = GH + (nf - 1) * FH, tint = new THREE.Color(pick(WALL)).multiplyScalar(0.92);
    put('atlas', box(w, top, 10), tint.clone().multiplyScalar(0.8), cx, top / 2, Z + 5.01, 0, 0, 0, A.plain);
    const nb = Math.max(1, Math.round(w / 4.2)), bw = w / nb;
    for (let b = 0; b < nb; b++) {
      const bx = x0 + bw * (b + 0.5);
      put('atlas', plane(bw, 2.8), 0xffffff, bx, 1.4, Z - 0.005, Math.PI, 0, 0, R() < 0.7 ? pick(A.shops) : A.shutter);
      if (R() < 0.5) light(bx, 1.4, Z - 1.2, 0xffd8a8, 3, 0.35);
      put('atlas', box(bw, 0.8, 0.2), tint, bx, 3.2, Z - 0.1, 0, 0, 0, A.plain);
      put('atlas', plane(bw - 0.4, 0.55), 0xffffff, bx, 3.2, Z - 0.205, Math.PI, 0, 0, pick(A.signs).uv);
      for (let f = 1; f < nf; f++) put('atlas', plane(bw, FH), tint, bx, GH + (f - 1) * FH + FH / 2, Z - 0.005, Math.PI, 0, 0, pick(A.apts).uv);
    }
    for (let f = 1; f < nf; f++) put('atlas', box(w + 0.04, 0.14, 0.2), tint.clone().multiplyScalar(0.85), cx, GH + (f - 1) * FH, Z - 0.1, 0, 0, 0, A.plain);
    put('atlas', box(w + 0.1, 0.8, 0.3), tint, cx, top + 0.4, Z + 0.1, 0, 0, 0, A.plain);
    if (R() < 0.6) { const tx = cx + (R() - 0.5) * (w - 2); put('prop', lathe([[0.001, 0], [0.7, 0], [0.7, 1.3], [0.001, 1.4]], 12), pick([0x2a5ab8, 0xd8d8d0]), tx, top + 0.5, Z + 4); }
    return top;
  }

  const neonQuads = [];   // [geo] with aSeed
  function neon(x, y, z, ry, item, h, flick = 0) {
    const w = item.aspect ? h * item.aspect : h;
    const g = plane(w, h).toNonIndexed();
    const uv = g.attributes.uv, r = item.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.updateMatrix();
    g.applyMatrix4(_o.matrix).applyMatrix4(SF);
    const n = g.attributes.position.count, sd = new Float32Array(n * 2), sv = R();
    for (let i = 0; i < n; i++) { sd[i * 2] = sv; sd[i * 2 + 1] = flick; }
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 2));
    neonQuads.push(g);
    put('prop', box(w + 0.12, h + 0.12, 0.06), 0x141016, x - Math.sin(ry) * 0.04, y, z - Math.cos(ry) * 0.04, ry);
    const p = toW(x, y, z);
    lights.push([p.x, p.z, item.col.clone(), 3.2, flick > 1.5 ? 0.08 : 0.32]);
  }

  for (const s of [1, -1]) {
    setSide(s);
    const alleys = ALLEYS[s];
    const inAlley = (x, pad = 0) => alleys.find(([ax, aw]) => Math.abs(x - ax) < aw / 2 + pad);

    /* ---- sidewalk + kerb ---- */
    for (let k = 0; k < 6; k++) put('atlas', box(LEN * 2 / 6, 0.16, 2.6), 0xb8b0a4, -LEN + (k + 0.5) * LEN * 2 / 6, -0.04, SIDE - 1.3, 0, 0, 0, A.plain);
    for (let x = -LEN; x < LEN; x += 1) put('prop', box(1, 0.17, 0.16), (Math.round(x) & 1) ? 0xc8302a : 0xf0eee8, x + 0.5, -0.035, SIDE - 2.6);

    /* ---- front shophouses (gaps for the alleys) ---- */
    let x = -LEN;
    let prevAlley = true;
    while (x < LEN) {
      const al = alleys.find(([ax, aw]) => x >= ax - aw / 2 - 0.01 && x < ax + aw / 2);
      if (al) { x = al[0] + al[1] / 2; prevAlley = true; continue; }
      const next = alleys.filter(([ax, aw]) => ax - aw / 2 > x).sort((a, b) => a[0] - b[0])[0];
      const lim = next ? next[0] - next[1] / 2 : LEN;
      let w = 3.9 + R() * 0.9;
      if (lim - x - w < 3.2) w = lim - x;
      const nf = R() < 0.15 ? 3 : R() < 0.55 ? 4 : R() < 0.85 ? 5 : 6;
      shophouse(x, x + w, nf, s, prevAlley && x > -LEN + 1, Math.abs(x + w - lim) < 0.01 && !!next);
      prevAlley = false;
      x += w;
    }

    /* ---- back street + taller blocks ---- */
    const BZ = SIDE + 14;
    for (let xb = -LEN; xb < LEN;) { const w = 8 + R() * 9; backBlock(xb, Math.min(LEN, xb + w), 5 + Math.floor(R() * 5), BZ); xb += w; }
    for (let xl = -LEN + 8; xl < LEN; xl += 16 + R() * 8) {     // back-street lamps
      put('metal', cyl(0.06, 0.08, 6, 6), 0x5a5a5a, xl, 3, SIDE + 13.4);
      put('metal', box(0.08, 0.08, 1.2), 0x5a5a5a, xl, 5.95, SIDE + 12.9);
      put('glow', box(0.3, 0.08, 0.16), 0xffc070, xl, 5.88, SIDE + 12.4);
      light(xl, 4, SIDE + 11.5, 0xffb060, 6, 0.45);
    }
    // parked scooters in the back street
    for (let k = 0; k < 10; k++) { const sx = -LEN + 10 + R() * (LEN * 2 - 20); scooter(sx, SIDE + 13.0, Math.PI / 2 + (R() - 0.5) * 0.4); }
    // distant towers behind
    for (let k = 0; k < 9; k++) {
      const tx = -LEN + 10 + k * (LEN * 2 - 20) / 8 + (R() - 0.5) * 10, tz = SIDE + 34 + R() * 30, tw = 14 + R() * 12, nfT = 9 + Math.floor(R() * 12);
      const top = nfT * FH, tint = new THREE.Color(pick([0xb8bcc4, 0xc8c0b4, 0xa8b0b8]));
      put('atlas', box(tw, top, 14), tint.clone().multiplyScalar(0.6), tx, top / 2, tz + 7.01, 0, 0, 0, A.plain);
      const nb = Math.round(tw / 4.2), bw = tw / nb;
      for (let f = 0; f < nfT; f++) for (let b = 0; b < nb; b++) put('atlas', plane(bw, FH), tint, tx - tw / 2 + bw * (b + 0.5), f * FH + FH / 2, tz, Math.PI, 0, 0, pick(A.apts).uv);
      put('glow', sph(0.25, 6, 4), 0xff2a1a, tx, top + 0.4, tz + 5);
    }

    /* ---- neon: flat signs on the first floor, blade signs, a big one on some back-block roofs ---- */
    for (const [x0, x1, top] of unitsBySide[s]) {
      const cx = (x0 + x1) / 2;
      if (R() < 0.3 && top > 7) neon(cx + (R() - 0.5) * 0.6, GH + 1.2 + R() * 0.6, SIDE - 0.4, Math.PI, pick(NE.words), 0.55 + R() * 0.2, R() < 0.12 ? 1 : 0);
      else if (R() < 0.18) {
        const it = pick(NE.icons), bx = R() < 0.5 ? x0 + 0.3 : x1 - 0.3;
        neon(bx, GH + 1.6, SIDE - 0.7, Math.PI / 2 * (R() < 0.5 ? 1 : -1), it, 0.9, 0);
        put('metal', box(0.04, 0.04, 0.7), 0x2a2a2a, bx, GH + 2.0, SIDE - 0.35);
      }
    }
    for (let k = 0; k < 3; k++) { const nx = -70 + k * 55 + (R() - 0.5) * 20; if (Math.abs(nx) < 22) continue; neon(nx, 22 + R() * 4, SIDE + 15, Math.PI, pick(NE.words), 2.2, 0); }

    /* ---- power poles along the kerb, cable bundles, service drops ---- */
    const poleZ = SIDE - 2.3, poleXs = [];
    for (let px = -LEN + 6; px < LEN - 4; px += 15 + R() * 3) { if (inAlley(px, 1.5)) px += 4; poleXs.push(px); }
    for (const px of poleXs) {
      put('atlas', cyl(0.12, 0.2, 9.6, 6), 0xb0aca4, px, 4.8, poleZ, 0, 0, 0, A.plain);
      for (const [y, l] of [[8.9, 1.9], [8.2, 1.5], [7.4, 1.1]]) put('metal', box(0.09, 0.11, l), 0x4a4a4a, px, y, poleZ);
      if (R() < 0.45) { put('metal', cyl(0.3, 0.3, 0.85, 10), 0x7a8288, px, 6.6, poleZ + 0.4); put('metal', box(0.4, 0.06, 0.06), 0x4a4a4a, px, 6.2, poleZ + 0.25); }
      // coils of spare cable hanging on the pole (the Bangkok spaghetti)
      for (let k = 0; k < 2; k++) { const t = new THREE.TorusGeometry(0.28 + R() * 0.15, 0.03, 4, 14); put('prop', t, 0x141416, px + 0.05, 6.4 + k * 0.5, poleZ - 0.15, R(), 0.2, 0.4); }
    }
    for (let i = 0; i < poleXs.length - 1; i++) {
      const a = poleXs[i], b = poleXs[i + 1];
      for (let k = 0; k < 11; k++) {
        const y = 8.9 - (k % 4) * 0.35 - (k > 7 ? 1.1 : 0), dz = ((k % 3) - 1) * 0.35;
        wire(V(a, y, poleZ + dz), V(b, y - (R() - 0.5) * 0.2, poleZ + dz + (R() - 0.5) * 0.3), 0.5 + R() * 1.1, 0.011 + (k % 5 === 0 ? 0.01 : 0), 0x131316, 12);
      }
      // service drops to the shophouses
      for (let k = 0; k < 3; k++) { const fx = a + R() * (b - a); wire(V(a + 0.1, 7.8 - k * 0.3, poleZ), V(fx, 6.4 + R() * 1.2, SIDE - 0.05), 0.4, 0.008, 0x131316, 8); }
    }

    /* ---- stalls ---- */
    const poleWorldX = F.outX + 1.3;
    let sx = -LEN + 3.5, idx = 0;
    while (sx < LEN - 3) {
      const w = 2.5 + R() * 1.1, cx = sx + w / 2;
      sx += w + 0.2 + R() * 0.5;
      if (inAlley(cx, 1.2)) continue;
      stall(cx, w, idx++, Math.abs(Math.abs(cx) - poleWorldX) < 1.9);
    }
    // stall-row overhead: a bulb string along the canopy fronts, zig-zag strings to the facades, lanterns along the facades
    for (let x = -LEN + 4; x < LEN - 6; x += 6) {
      LOD = lodAt(x);
      if (inAlley(x + 3, 0.5)) continue;
      const c = wire(V(x, 3.25, Z0 + 1.0), V(x + 6, 3.25, Z0 + 1.0), 0.3, 0.007);
      for (let k = 1; k < 10; k++) { const p = c.getPoint(k / 10); bulb(p.x, p.y - 0.09, p.z, null, k % 3 === 0 ? 0xffc890 : 0xfff0d0, k % 3 === 0 ? 0.12 : 0, 2.5); }
    }
    for (let x = -LEN + 5; x < LEN - 5; x += 3.1) {
      LOD = lodAt(x);
      if (inAlley(x, 1.5)) continue;
      const up = Math.floor(x / 3.1) & 1;
      const a = V(x, 3.25, Z0 + 1.0), b = V(x + 1.55, 4.7, SIDE - 0.25);
      const c = up ? wire(a, b, 0.25, 0.006) : wire(V(x + 1.55, 3.25, Z0 + 1.0), V(x, 4.7, SIDE - 0.25), 0.25, 0.006);
      if (up) for (let k = 1; k < 7; k++) { const p = c.getPoint(k / 7); bulb(p.x, p.y - 0.08, p.z, null, pick([0xfff0d0, 0xffd0a0, 0xffe8c0, 0xff9ac0, 0x9ad8ff]), 0, 2); }
      else for (let k = 1; k < 6; k++) { const p = c.getPoint(k / 6); put('fabric', FLAG, pick([0xd83a2a, 0xf0c020, 0x2a6ad8, 0xf0f0f0, 0x2fa04a]), p.x, p.y - 0.02, p.z, Math.atan2(b.z - a.z, a.x - b.x) + Math.PI / 2); }
    }
    for (let x = -LEN + 3; x < LEN - 3; x += 2.6) {
      if (inAlley(x, 0.6)) continue;
      lanterns.push([...toW(x, 4.55, SIDE - 0.75).toArray(), pick([0xd8281a, 0xd8281a, 0xe8401a, 0xf0a020]), 1]);
      light(x, 4.2, SIDE - 0.9, 0xff6a3a, 2.4, 0.16);
    }
    // a second lantern line right over the stall canopies
    for (let x = -LEN + 4; x < LEN - 6; x += 6.6) {
      if (inAlley(x + 3.3, 1)) continue;
      LOD = lodAt(x);
      const c = wire(V(x, 4.15, Z0 + 2.6), V(x + 6.6, 4.15, Z0 + 2.6), 0.35, 0.006, 0x1a1a1a, 8);
      for (let k = 1; k < 3; k++) { const p = c.getPoint(k / 3); lanterns.push([...toW(p.x, p.y - 0.02, p.z).toArray(), pick([0xd8281a, 0xf0a020, 0xe8401a, 0xd83a7a]), 0.82]); light(p.x, 3.4, p.z, 0xff7a40, 1.8, 0.06); }
    }
    for (let x = -LEN + 3; x < LEN - 3; x += 7.8) {
      LOD = lodAt(x);
      put('metal', box(0.04, 0.04, 0.8), 0x2a2a2a, x, 4.75, SIDE - 0.4);
      wire(V(x, 4.75, SIDE - 0.75), V(Math.min(x + 7.8, LEN - 3), 4.75, SIDE - 0.75), 0.12, 0.006, 0x1a1a1a, 8);
    }

    /* ---- second row: goods spilling onto the sidewalk in front of the shops ---- */
    for (const [x0, x1] of unitsBySide[s]) {
      const cx = (x0 + x1) / 2, r = R(), zz = SIDE - 0.75;
      if (r < 0.2) { // clothes rack
        put('metal', box(2.2, 0.03, 0.03), 0x8a8a8a, cx, 1.75, zz); for (const dx of [-1.1, 1.1]) put('metal', cyl(0.015, 0.015, 1.75, 4), 0x8a8a8a, cx + dx, 0.875, zz);
        for (let k = 0; k < 7; k++) garment(cx - 0.9 + k * 0.3, 1.72, zz, Math.PI / 2 + (R() - 0.5) * 0.3, R());
      } else if (r < 0.35) { // stacked crates / baskets of goods
        for (let k = 0; k < 5; k++) crate(cx - 1 + (k % 3) * 0.55, Math.floor(k / 3) * 0.3, zz, 0);
      } else if (r < 0.45) { // drinks fridge (lit)
        put('prop', box(0.75, 1.85, 0.7), 0xc8202a, cx + 0.8, 0.92, zz + 0.1);
        put('atlas', plane(0.68, 1.6), 0xffffff, cx + 0.8, 0.98, zz - 0.255, Math.PI, 0, 0, A.fridge);
        light(cx + 0.8, 1, zz - 0.8, 0xe8f4ff, 2.4, 0.35);
      } else if (r < 0.55) { // shoe rack
        put('prop', box(1.6, 1.2, 0.35), 0x6a5a4a, cx, 0.6, zz + 0.1);
        for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) put('prop', box(0.12, 0.08, 0.25), pick([0xf0f0f0, 0x2a2a2a, 0xd83a2a, 0x3a6ad8, 0xe8c02a]), cx - 0.65 + j * 0.26, 0.12 + k * 0.3, zz - 0.05);
      } else if (r < 0.62) { // spirit house on its post, with offerings and a little light
        const px = x1 - 0.5;
        put('prop', cyl(0.06, 0.06, 1.3, 8), 0xe8e0d0, px, 0.65, zz);
        put('prop', box(0.6, 0.08, 0.5), 0xe8c060, px, 1.34, zz);
        put('prop', box(0.38, 0.38, 0.3), 0xf0e8d8, px, 1.57, zz);
        put('prop', new THREE.ConeGeometry(0.34, 0.32, 4), 0xc8302a, px, 1.92, zz, Math.PI / 4);
        put('prop', new THREE.ConeGeometry(0.05, 0.35, 6), 0xe8c060, px, 2.2, zz);
        for (let k = 0; k < 6; k++) put('prop', sph(0.035, 5, 4), pick([0xf0c020, 0xf08020, 0xffffff, 0xd8302a]), px - 0.2 + k * 0.08, 1.4, zz - 0.18);
        put('glow', sph(0.03, 5, 4), 0xffa040, px, 1.45, zz - 0.2); light(px, 1.4, zz - 0.3, 0xffa040, 1.2, 0.25);
        if (R() < 0.5) { const p = toW(px - 0.1, 1.5, zz - 0.2); steamSrc.push([p.x, p.y, p.z, 1]); }   // incense
      } else if (r < 0.72) { // potted plants + a bench with someone on their phone
        for (let k = 0; k < 3; k++) { const px = cx - 1 + k * 0.6; put('prop', cyl(0.18, 0.13, 0.32, 10), pick([0xb8603a, 0x2a6a8a]), px, 0.16, zz + 0.2); const lf = new THREE.IcosahedronGeometry(0.3, 1); lf.scale(1, 1.4, 1); put('prop', lf, pick([0x2f6a2a, 0x3a7a32]), px, 0.65, zz + 0.2); }
        put('prop', box(1.2, 0.06, 0.4), 0x8a5a3a, cx + 0.9, 0.45, zz); for (const dx of [-0.5, 0.5]) put('prop', box(0.05, 0.45, 0.35), 0x5a3a2a, cx + 0.9 + dx, 0.22, zz);
        if (R() < 0.6) person(cx + 0.9, 0.04, zz - 0.15, Math.PI, 3);
      } else if (r < 0.8) { scooter(cx, zz - 0.2, Math.PI / 2 + (R() - 0.5) * 0.5); }
    }

    /* ---- alleys ---- */
    for (const [ax, aw] of alleys) alley(ax, aw);

    /* ---- walkers on the sidewalk behind the stalls, browsing pause modes in the customer zone ---- */
    for (let k = 0; k < 16; k++) {
      const wx = -LEN + 8 + R() * (LEN * 2 - 30);
      if (Math.abs(wx) < F.outX + 4) continue;
      person(wx, 0.04, SIDE - 1.75 + (R() - 0.5) * 0.3, Math.PI / 2 * (R() < 0.5 ? 1 : -1), 1, { len: 8 + R() * 12 });
    }
  }

  /* ---------------- stall builder (local frame of the current side; front = −z, toward the court) ---------------- */
  function stall(...a) { withCat('stall', () => stall0(...a)); }
  function stall0(cx, w, idx, nearPole) {
    LOD = lodAt(cx);
    const types = ['noodle', 'grill', 'wok', 'fruit', 'clothes', 'trinket', 'drinks', 'sweets'];
    const type = types[(idx * 5 + Math.floor(R() * 3)) % types.length];
    CAT = 'stall:' + type;
    const food = ['noodle', 'grill', 'wok', 'drinks', 'sweets'].includes(type);
    const zF = Z0 + 1.33, zB = Z0 + 2.18, zc = (zF + zB) / 2, top = 0.84;
    const hw = w / 2 - 0.12;
    // counter: top, legs, a vinyl banner hung on the front
    put('prop', box(w - 0.2, 0.05, 0.85), pick([0xc8c0b0, 0xe8e2d4, 0x8a6a4a, 0xb8bcc0]), cx, top - 0.025, zc);
    for (const dx of [-hw + 0.05, hw - 0.05]) for (const dz of [zF + 0.06, zB - 0.06]) put('metal', box(0.035, top - 0.05, 0.035), 0x8a8e92, cx + dx, (top - 0.05) / 2, dz);
    const banner = pick(A.signs.filter((q) => !q.lit));
    put('atlas', plane(w - 0.3, 0.58), 0xffffff, cx, top - 0.34, zF - 0.012, Math.PI, 0, 0, banner.uv);
    // back prep table + the clutter behind
    put('prop', box(w - 0.5, 0.04, 0.5), 0x9a9a96, cx, 0.78, Z0 + 3.05);
    for (const dx of [-(w / 2 - 0.3), w / 2 - 0.3]) put('metal', box(0.03, 0.76, 0.03), 0x8a8e92, cx + dx, 0.38, Z0 + 3.05);
    if (R() < 0.6) crate(cx - w / 4, 0, Z0 + 3.05);
    if (R() < 0.5) cooler(cx + w / 4, Z0 + 3.0);
    for (let k = 0; k < 3; k++) put('prop', box(0.25, 0.2 + R() * 0.15, 0.2), pick([0xe8e0d0, 0x3a6ad8, 0xd83a2a, 0xf0c020]), cx - w / 2 + 0.5 + R() * (w - 1), 0.9, Z0 + 3.05);
    // canopy
    const style = R();
    const ftY = 2.45, bkY = 2.95, cz0 = Z0 + 1.0, cz1 = Z0 + 3.6;
    const canopyY = (z) => ftY + (z - cz0) / (cz1 - cz0) * (bkY - ftY);
    if (style < 0.58) {                          // sloped tarp with a sag and a front valance
      const g = plane(w + 0.35, cz1 - cz0, 6, 4);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      const sag = 0.08 + R() * 0.08;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / (w + 0.35) + 0.5, v = p.getZ(i) / (cz1 - cz0) + 0.5;
        p.setY(i, ftY + v * (bkY - ftY) - sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      }
      g.computeVertexNormals();
      put('fabric', g, 0xffffff, cx, 0, (cz0 + cz1) / 2, 0, 0, 0, pick(A.tarps));
      const val = plane(w + 0.35, 0.24, 8, 1);
      const vp = val.attributes.position;
      for (let i = 0; i < vp.count; i++) if (vp.getY(i) < 0) vp.setY(i, vp.getY(i) + 0.05 * Math.abs(Math.sin(vp.getX(i) * 6)));
      put('fabric', val, 0xffffff, cx, ftY - 0.11, cz0 - 0.005, Math.PI, 0, 0, pick(A.tarps));
      for (const dx of [-(w / 2 + 0.1), w / 2 + 0.1]) { put('metal', cyl(0.022, 0.022, ftY + 0.85, 6), 0x9a9ea2, cx + dx, (ftY + 0.85) / 2, cz0 + 0.05); put('metal', cyl(0.022, 0.022, bkY, 6), 0x9a9ea2, cx + dx, bkY / 2, cz1 - 0.3); }
    } else if (style < 0.85) {                   // market umbrella: panels in two colours, scalloped valance
      const r = Math.min(1.75, w * 0.62), uz = Z0 + 2.15, apex = 3.05, rim = 2.42;
      const g = new THREE.CylinderGeometry(0.04, r, apex - rim, 16, 3, true).toNonIndexed();
      const cA = new THREE.Color(pick([0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400, 0x8a2a6a, 0xe8641a])), cB = new THREE.Color(R() < 0.6 ? 0xf2f0ea : pick([0xc0392b, 0x1f5fa8, 0xe2a400]));
      const p = g.attributes.position, cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i += 3) {
        const mx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, mz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        const c = Math.floor(((Math.atan2(mz, mx) + Math.PI) / TAU) * 8) % 2 ? cA : cB;
        for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
      }
      for (let i = 0; i < p.count; i++) {        // panels bow down between the ribs
        const a = Math.atan2(p.getZ(i), p.getX(i)), rr = Math.hypot(p.getX(i), p.getZ(i));
        p.setY(i, p.getY(i) - Math.abs(Math.sin(a * 4)) * 0.06 * (rr / r));
      }
      g.computeVertexNormals();
      const pg = put('fabric', g, 0xffffff, cx, (apex + rim) / 2, uz);
      pg.attributes.color.array.set(cols);
      const val = new THREE.CylinderGeometry(r, r, 0.16, 16, 1, true);
      put('fabric', val, cA, cx, rim - 0.06, uz);
      put('metal', cyl(0.025, 0.025, apex, 6), 0x8a8e92, cx, apex / 2, uz);
      put('prop', cyl(0.25, 0.28, 0.12, 10), 0x3a3a3a, cx, 0.06, uz + 0.6);
    } else {                                     // pitched tarp (two slopes)
      const ridge = 3.15, rz = Z0 + 2.3, cA = pick(A.tarps);
      for (const [za, zb] of [[cz0, rz], [rz, cz1]]) {
        const g = plane(w + 0.3, Math.hypot(zb - za, ridge - (za === cz0 ? ftY : 2.6)), 4, 2);
        const ang = Math.atan2(ridge - (za === cz0 ? ftY : 2.6), zb - za);
        put('fabric', g, 0xffffff, cx, (ridge + (za === cz0 ? ftY : 2.6)) / 2, (za + zb) / 2, 0, za === cz0 ? -Math.PI / 2 - ang : -Math.PI / 2 + ang, 0, cA);
      }
      for (const dx of [-(w / 2 + 0.1), w / 2 + 0.1]) for (const zz of [cz0 + 0.05, cz1 - 0.3]) put('metal', cyl(0.022, 0.022, ftY + 0.85, 6), 0x9a9ea2, cx + dx, (ftY + 0.85) / 2, zz);
    }
    // lights: bare bulbs on cords and / or a fluorescent tube at the canopy front
    const nb = 1 + Math.floor(R() * 3);
    if (R() < 0.7) for (let k = 0; k < nb; k++) { const bx = cx + (nb === 1 ? 0 : (k / (nb - 1) - 0.5) * (w - 1)); const bz = Z0 + 1.9; bulb(bx, 2.12, bz, canopyY(bz) - 0.08, 0xffc880, 0.5, 3.2); }
    else { tube(cx, ftY - 0.2, cz0 + 0.25, Math.min(1.2, w - 0.6), 0, 0.5); bulb(cx + w * 0.3, 2.15, Z0 + 2.2, canopyY(Z0 + 2.2) - 0.08, 0xffc880, 0.35, 2.6); }
    // vendor
    const vx = cx + (R() - 0.5) * (w - 1.2);
    const vz = Z0 + 2.62;

    /* goods by type */
    if (type === 'noodle') {
      // glass cabinet (frame) with noodles + meatballs, two steaming pots, bowls, condiments, a gas tank, menu lightbox
      const gx = cx - w * 0.22;
      for (const dx of [-0.4, 0.4]) for (const dz of [-0.2, 0.2]) put('metal', box(0.02, 0.5, 0.02), 0xd8dadc, gx + dx, top + 0.25, zc + dz);
      put('metal', box(0.84, 0.02, 0.44), 0xd8dadc, gx, top + 0.5, zc);
      for (let k = 0; k < 10; k++) { const n = sph(0.06, 6, 4); n.scale(1.2, 0.5, 1); put('prop', n, pick([0xf0e0b0, 0xe8d090, 0xd8c080]), gx - 0.32 + (k % 5) * 0.16, top + 0.06, zc - 0.1 + Math.floor(k / 5) * 0.18); }
      for (let k = 0; k < 12; k++) put('prop', sph(0.025, 5, 4), pick([0x8a5a3a, 0xc8a080, 0xe86a5a]), gx - 0.3 + (k % 6) * 0.1, top + 0.3, zc - 0.05 + Math.floor(k / 6) * 0.1);
      put('metal', box(0.8, 0.012, 0.4), 0xd8dadc, gx, top + 0.26, zc);
      for (const [px, r] of [[cx + w * 0.12, 0.24], [cx + w * 0.32, 0.2]]) {
        put('metal', lathe([[0.001, 0], [r, 0], [r + 0.01, 0.02], [r + 0.01, 0.34], [r + 0.03, 0.36], [r, 0.37]], 16), 0xc8ccd0, px, top, zc);
        put('metal', lathe([[0.001, 0.4], [r * 0.6, 0.39], [r + 0.02, 0.36], [r - 0.02, 0.355]], 16), 0xb8bcc0, px, top, zc + 0.02, 0, -0.5);
        const p = toW(px, top + 0.42, zc); steamSrc.push([p.x, p.y, p.z, 1.3]);
      }
      put('metal', cyl(0.008, 0.008, 0.5, 4), 0x9a9a9a, cx + w * 0.12 + 0.15, top + 0.45, zc - 0.05, 0, 0.5, 0.3);
      for (let k = 0; k < 6; k++) put('prop', lathe([[0.001, 0], [0.05, 0], [0.085, 0.07], [0.09, 0.075]], 10), 0xf0f0ec, cx + w * 0.42 - 0.05, top + k * 0.03, zF + 0.2);
      gasTank(cx + w * 0.3, zc);
      menuBoard(cx - w / 2 + 0.1, 1.85, zF - 0.1, 0);
      put('metal', cyl(0.02, 0.02, 1.55, 5), 0x8a8e92, cx - w / 2 + 0.1, 0.78, zF - 0.06);
      person(cx + w * 0.22, 0, vz, Math.PI, 2);
    } else if (type === 'grill') {
      const gw = w * 0.62, gx = cx - w * 0.08;
      put('metal', box(gw, 0.2, 0.42), 0x3a3a3c, gx, top + 0.1, zc + 0.12);
      put('glow', box(gw - 0.08, 0.02, 0.34), 0x7a2008, gx, top + 0.19, zc + 0.12);
      for (let k = 0; k < Math.floor(gw / 0.07); k++) {
        const kx = gx - gw / 2 + 0.06 + k * 0.07;
        put('prop', box(0.03, 0.012, 0.5), 0xd8c8a0, kx, top + 0.23, zc + 0.12);
        if (LOD > 0) for (let j = 0; j < 4; j++) put('prop', box(0.045, 0.035, 0.06), pick([0x7a3a1a, 0x8a4a22, 0x6a2a12, 0xa8602a]), kx, top + 0.245, zc + 0.0 + j * 0.075);
      }
      for (let k = 0; k < 2; k++) { put('metal', box(0.4, 0.03, 0.28), 0xb8bcc0, cx + w * 0.34, top + 0.015, zc - 0.15 + k * 0.3); for (let j = 0; j < 6; j++) put('prop', box(0.3, 0.025, 0.025), 0xe8a0a0, cx + w * 0.34, top + 0.045, zc - 0.25 + k * 0.3 + j * 0.035); }
      light(gx, top + 0.5, zc, 0xff6a20, 2.2, 0.45);
      for (let k = 0; k < 3; k++) { const p = toW(gx - gw / 3 + k * gw / 3, top + 0.3, zc + 0.12); smokeSrc.push([p.x, p.y, p.z]); emberSrc.push([p.x, p.y, p.z]); }
      // a fan on a stand
      put('metal', cyl(0.015, 0.015, 1.0, 5), 0x6a6a6a, cx + w / 2 - 0.2, 0.5, zB + 0.25);
      put('prop', cyl(0.2, 0.2, 0.06, 14), 0x3a8ad8, cx + w / 2 - 0.2, 1.05, zB + 0.25, 0, Math.PI / 2 - 0.3);
      cooler(cx - w / 2 + 0.45, zF - 0.4, 0.1);
      menuBoard(cx + w / 2 - 0.15, 1.9, zF - 0.1, 0, 0.5); put('metal', cyl(0.02, 0.02, 1.65, 5), 0x8a8e92, cx + w / 2 - 0.15, 0.82, zF - 0.06);
      person(gx, 0, vz, Math.PI, 2);
    } else if (type === 'wok') {
      const wx = cx + w * 0.22;
      put('metal', cyl(0.2, 0.24, 0.16, 12), 0x2a2a2c, wx, top + 0.08, zc + 0.05);
      put('glow', new THREE.ConeGeometry(0.12, 0.08, 10), 0x3a5aff, wx, top + 0.18, zc + 0.05);
      put('metal', lathe([[0.001, 0], [0.12, 0.01], [0.24, 0.06], [0.32, 0.15], [0.33, 0.16]], 18), 0x1e1e20, wx, top + 0.2, zc + 0.05);
      put('metal', box(0.32, 0.025, 0.04), 0x3a2a1a, wx + 0.45, top + 0.36, zc + 0.05);
      { const p = toW(wx, top + 0.38, zc + 0.05); steamSrc.push([p.x, p.y, p.z, 1]); flameSrc.push([p.x, top + 0.24, p.z]); }
      light(wx, top + 0.3, zc, 0xff8a40, 1.6, 0.25);
      for (let k = 0; k < 8; k++) {
        const bx = cx - w * 0.38 + (k % 4) * 0.2, bz = zc - 0.15 + Math.floor(k / 4) * 0.25;
        put('prop', lathe([[0.001, 0], [0.05, 0], [0.08, 0.06], [0.085, 0.065]], 10), 0xf2f2f2, bx, top, bz);
        put('prop', cyl(0.07, 0.07, 0.01, 10), pick([0x3a9a3a, 0xe84a2a, 0xf0d040, 0xe8e0d0, 0x8a4a2a, 0xff8a6a]), bx, top + 0.05, bz);
      }
      for (let k = 0; k < 4; k++) { put('prop', cyl(0.035, 0.035, 0.22, 8), pick([0x5a2a10, 0xc83a1a, 0xe8d8a0, 0x1a1a1a]), cx - 0.05 + k * 0.08, top + 0.11, zB - 0.1); put('prop', cyl(0.012, 0.02, 0.05, 6), 0xd83a2a, cx - 0.05 + k * 0.08, top + 0.245, zB - 0.1); }
      gasTank(wx, zc + 0.1);
      menuBoard(cx - w / 2 + 0.1, 1.85, zF - 0.1, 0); put('metal', cyl(0.02, 0.02, 1.55, 5), 0x8a8e92, cx - w / 2 + 0.1, 0.78, zF - 0.06);
      person(wx, 0, vz, Math.PI, 2);
    } else if (type === 'fruit') {
      // stepped display covered in cloth; fruit pyramids, hanging bananas, price cards, a scale
      const cloth = pick([0x2a6a3a, 0x2a4a8a, 0x8a2a2a]);
      for (let t = 0; t < 3; t++) put('prop', box(w - 0.25, 0.14, 0.28), shade(cloth, 1 - t * 0.1), cx, top + 0.07 + t * 0.14, zF + 0.16 + t * 0.26);
      const kinds = [[0xff8a1a, 0.055, 1, 1], [0xf0c030, 0.06, 0.8, 1.35], [0xe83a6a, 0.065, 1, 1.2], [0x7fbf3a, 0.05, 1, 1], [0xc8201a, 0.03, 1, 1], [0x3a8a2a, 0.11, 1, 0.9], [0xd8b830, 0.07, 1, 1.5]];
      const sect = Math.max(2, Math.round((w - 0.3) / 0.55));
      for (let t = 0; t < 3; t++) for (let k = 0; k < sect; k++) {
        const [col, r, sy, sz] = pick(kinds);
        const px = cx - (w - 0.3) / 2 + (k + 0.5) * (w - 0.3) / sect, pz = zF + 0.16 + t * 0.26, py = top + 0.14 + t * 0.14;
        const cols = Math.min(3, Math.floor(0.5 / (r * 2))), rows = 2;
        for (let lv = 0; lv < (LOD > 0 ? 2 : 1); lv++) for (let i = 0; i < cols - lv; i++) for (let j = 0; j < rows - lv; j++) {
          const f = sph(r, 6, 4); f.scale(1, sy, sz);
          put('prop', f, new THREE.Color(col).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08), px - (cols - 1 - lv) * r + i * r * 2, py + r * sy + lv * r * 1.6 * sy, pz - (rows - 1 - lv) * r * 0.5 + j * r);
        }
        if (R() < 0.5) priceCard(px, py + 0.2, pz - 0.12);
      }
      if (LOD > 0) for (let k = 0; k < Math.floor(w / 0.9); k++) {    // banana bunches hanging from the canopy front
        const bx = cx - w / 2 + 0.5 + k * 0.9;
        put('prop', cyl(0.008, 0.008, 0.4, 3), 0x4a3a2a, bx, 2.1, zF - 0.05);
        put('prop', cyl(0.018, 0.022, 0.42, 5), 0x6a5a2a, bx, 1.82, zF - 0.05);
        const ripe = R() < 0.7 ? 0xd8b830 : 0x9aa83a;
        for (let t = 0; t < 3; t++) for (let j = 0; j < 6; j++) {
          const a = j / 6 * TAU + t * 0.5, b = new THREE.CapsuleGeometry(0.018, 0.08, 1, 4);
          b.translate(0, 0.05, 0); b.rotateX(0.55);
          put('prop', b, new THREE.Color(ripe).offsetHSL(0, 0, (R() - 0.5) * 0.08), bx + Math.sin(a) * 0.035, 1.7 + t * 0.09, zF - 0.05 + Math.cos(a) * 0.035, a);
        }
      }
      put('prop', box(0.3, 0.12, 0.25), 0xe8e8e0, cx + w / 2 - 0.3, top + 0.06, zB - 0.15);
      put('metal', cyl(0.1, 0.1, 0.02, 12), 0xc8ccd0, cx + w / 2 - 0.3, top + 0.14, zB - 0.15);
      person(vx, 0, vz, Math.PI, R() < 0.5 ? 4 : 0);
    } else if (type === 'clothes') {
      put('metal', box(w - 0.2, 0.025, 0.025), 0x8a8a8a, cx, 2.12, zF - 0.02);
      for (let k = 0; k < Math.floor((w - 0.4) / 0.36); k++) garment(cx - w / 2 + 0.35 + k * 0.36, 2.1, zF - 0.02, Math.PI, R());
      for (let k = 0; k < Math.floor((w - 0.4) / 0.42); k++) for (let j = 0; j < 2; j++) {
        const col = new THREE.Color(pick([0xc84a6a, 0x4a6ac8, 0xe8d0a0, 0x2a2a2a, 0x6ac8a8, 0xf0f0f0, 0x8a5a3a]));
        for (let l = 0; l < 3 + Math.floor(R() * 4); l++) put('prop', box(0.32, 0.035, 0.26), col.clone().offsetHSL(0, 0, (R() - 0.5) * 0.1), cx - w / 2 + 0.4 + k * 0.42, top + 0.02 + l * 0.037, zc - 0.18 + j * 0.36, (R() - 0.5) * 0.1);
      }
      for (let k = 0; k < 4; k++) { const h = cyl(0.11, 0.11, 0.08, 12); put('prop', h, pick([0xe8d8a0, 0x2a2a2a, 0xd83a2a]), cx + w / 2 - 0.3, top + 0.04 + k * 0.05, zB - 0.2); }
      person(vx, 0, vz, Math.PI, 4);
    } else if (type === 'trinket') {
      put('prop', box(w - 0.3, 1.25, 0.04), 0x2a2420, cx, top + 0.62, zB - 0.02);
      for (let k = 0; k < Math.floor((w - 0.4) / 0.19); k++) for (let j = 0; j < 4; j++) {
        const kind = (k + j) % 3;
        if (kind === 0) put('prop', box(0.08, 0.15, 0.015), pick([0xd83a8a, 0x3ab8d8, 0xf0d020, 0x2a2a2a, 0xffffff, 0x8a3ad8]), cx - w / 2 + 0.28 + k * 0.19, top + 0.25 + j * 0.26, zB - 0.06);
        else if (kind === 1) put('prop', box(0.11, 0.035, 0.01), 0x101010, cx - w / 2 + 0.28 + k * 0.19, top + 0.25 + j * 0.26, zB - 0.06);
        else put('prop', box(0.05, 0.05, 0.02), pick([0xf0c020, 0xd8d8e0, 0xd83a2a, 0x3a8ad8]), cx - w / 2 + 0.28 + k * 0.19, top + 0.22 + j * 0.26, zB - 0.06);
      }
      for (let t = 0; t < Math.floor((w - 0.3) / 0.45); t++) {
        const tx = cx - w / 2 + 0.38 + t * 0.45;
        put('prop', box(0.4, 0.03, 0.45), 0x2a1a3a, tx, top + 0.015, zc - 0.1);
        if (LOD > 0) for (let k = 0; k < 14; k++) put('prop', new THREE.SphereGeometry(0.018, 4, 2), pick([0xf0c020, 0xd8d8e0, 0xd83a8a, 0x3ad8a0, 0xff6a3a, 0xffffff]), tx - 0.16 + (k % 7) * 0.053, top + 0.045, zc - 0.25 + Math.floor(k / 7) * 0.2 + (R() - 0.5) * 0.05);
      }
      person(vx, 0, vz, Math.PI, 4);
    } else if (type === 'drinks') {
      for (let k = 0; k < Math.floor((w - 0.6) / 0.11); k++) {
        const col = pick([0xe8801a, 0xe8801a, 0x5aa83a, 0xe88aa8, 0x7a4a2a, 0xf0e0c0]);
        const px = cx - w / 2 + 0.35 + k * 0.11;
        put('prop', cyl(0.042, 0.034, 0.15, 7), col, px, top + 0.075, zF + 0.15);
        put('prop', cyl(0.02, 0.043, 0.03, 7), 0xf0f4f8, px, top + 0.165, zF + 0.15);
      }
      put('prop', cyl(0.3, 0.26, 0.36, 14, true), 0x2a6ad8, cx + w * 0.25, top + 0.18, zc + 0.15);
      for (let k = 0; k < 9; k++) put('prop', cyl(0.035, 0.035, 0.26, 8), pick([0x2a8a3a, 0xd83a2a, 0xf0d020, 0xe8e8e8, 0x3a6ad8]), cx + w * 0.25 + (k % 3 - 1) * 0.12, top + 0.3, zc + 0.15 + (Math.floor(k / 3) - 1) * 0.12, 0, (R() - 0.5) * 0.3);
      put('prop', cyl(0.07, 0.08, 0.25, 10), 0xe8e8e8, cx - w * 0.2, top + 0.125, zB - 0.15); put('prop', cyl(0.09, 0.07, 0.25, 10), 0xd8ecf0, cx - w * 0.2, top + 0.375, zB - 0.15);
      cooler(cx - w / 2 + 0.4, zF - 0.38);
      for (let k = 0; k < 3; k++) crate(cx + w / 2 - 0.4, k * 0.3, zF - 0.4, 0.1);
      menuBoard(cx, 2.05, zF - 0.06, 0, 0.55);
      person(vx, 0, vz, Math.PI, R() < 0.5 ? 4 : 0);
    } else {                                     // sweets: roti griddle + trays of desserts
      put('metal', cyl(0.34, 0.34, 0.04, 20), 0x2a2a2c, cx + w * 0.2, top + 0.12, zc); put('metal', cyl(0.25, 0.3, 0.1, 12), 0x5a5a5a, cx + w * 0.2, top + 0.05, zc);
      put('prop', cyl(0.18, 0.18, 0.008, 14), 0xe8c070, cx + w * 0.2, top + 0.145, zc);
      { const p = toW(cx + w * 0.2, top + 0.2, zc); steamSrc.push([p.x, p.y, p.z, 0.6]); }
      for (let t = 0; t < 4; t++) {
        const tx = cx - w * 0.38 + (t % 2) * 0.42, tz = zc - 0.18 + Math.floor(t / 2) * 0.36;
        put('metal', box(0.38, 0.03, 0.3), 0xc8ccd0, tx, top + 0.015, tz);
        for (let k = 0; k < 6; k++) put('prop', box(0.1, 0.05, 0.1), pick([0x7ad8a0, 0xf0a0c0, 0xf0e070, 0xffffff, 0xa0c0f0, 0xf0c060]), tx - 0.12 + (k % 3) * 0.12, top + 0.055, tz - 0.06 + Math.floor(k / 3) * 0.12);
      }
      for (let k = 0; k < 4; k++) put('prop', cyl(0.035, 0.035, 0.1, 8), 0xe8e0c0, cx + w * 0.42, top + 0.05, zc - 0.15 + k * 0.09);
      menuBoard(cx - w / 2 + 0.1, 1.85, zF - 0.1, 0); put('metal', cyl(0.02, 0.02, 1.55, 5), 0x8a8e92, cx - w / 2 + 0.1, 0.78, zF - 0.06);
      person(cx + w * 0.2, 0, vz, Math.PI, 2);
    }
    // customers: diners at a table in front of food stalls, browsers at the others
    if (food && !nearPole && R() < 0.7) table(cx + (R() - 0.5) * 0.4, Z0 + 0.62, R() < 0.5);
    else {
      const nbz = R() < 0.35 ? 2 : R() < 0.75 ? 1 : 0;
      for (let k = 0; k < nbz; k++) person(cx + (k - (nbz - 1) / 2) * 0.8 + (R() - 0.5) * 0.3, 0, Z0 + 0.75 + R() * 0.3, (R() - 0.5) * 0.5, 0, { child: R() < 0.08 });
    }
    if (R() < 0.3) stool(cx + w / 2 - 0.3, Z0 + 2.95);
  }

  /* ---------------- a parked scooter (local frame) ---------------- */
  function scooter(...a) { withCat('scooter', () => scooter0(...a)); }
  function scooter0(x, z, ry) {
    const body = pick([0xd8d8d8, 0x1a1a1e, 0xc8202a, 0x2a5ab8, 0xe8e0c8, 0x3a8a5a]);
    const P = (bk, g, c, px, py, pz, rx = 0, rz = 0) => { const q = new THREE.Vector3(px, py, pz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); put(bk, g, c, x + q.x, py + 0, z + q.z, ry, rx, rz); };
    for (const pz of [-0.62, 0.6]) { const t = new THREE.TorusGeometry(0.2, 0.06, 6, 14); t.rotateY(Math.PI / 2); P('prop', t, 0x111111, 0, 0.26, pz); P('metal', cyl(0.1, 0.1, 0.08, 10), 0xb8bcc0, 0, 0.26, pz, 0, Math.PI / 2); }
    P('prop', box(0.3, 0.32, 0.9), body, 0, 0.5, -0.15);
    P('prop', box(0.3, 0.1, 0.62), 0x1a1a1a, 0, 0.72, -0.25);
    P('prop', box(0.28, 0.55, 0.16), body, 0, 0.68, 0.42, 0.3);
    P('metal', cyl(0.02, 0.02, 0.62, 5), 0x2a2a2a, 0, 1.0, 0.5, 0, Math.PI / 2);
    P('prop', box(0.12, 0.1, 0.05), 0xe8e8e0, 0, 0.92, 0.56);
    for (const dx of [-0.26, 0.26]) P('metal', cyl(0.006, 0.006, 0.22, 3), 0x2a2a2a, dx, 1.12, 0.47);
  }

  /* ---------------- an alley (local frame): stalls, strings of bulbs + lanterns, wires, laundry, people ---------------- */
  function alley(...a) { withCat('alley', () => alley0(...a)); }
  function alley0(ax, aw) {
    LOD = lodAt(ax);
    const z0 = SIDE + 0.4, z1 = SIDE + 7.8, xl = ax - aw / 2, xr = ax + aw / 2;
    // a hanging sign at the mouth and a pair of lit signs on the walls
    for (const [sx, dir] of [[xl, 1], [xr, -1]]) {
      const sg = pick(A.signs.filter((q) => q.lit));
      put('atlas', plane(1.6, 0.42), 0xffffff, sx + dir * 0.03, 3.4, z0 + 0.6 + R() * 4, dir * Math.PI / 2, 0, Math.PI / 2, sg.uv);
    }
    // little stalls down one wall
    const wallX = R() < 0.5 ? xl : xr, dir = wallX === xl ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const zz = z0 + 1.3 + k * 2.3, tx = wallX + dir * 0.55;
      put('prop', box(0.75, 0.05, 1.5), pick([0xc8c0b0, 0x8a6a4a]), tx, 0.78, zz);
      for (const dz of [-0.65, 0.65]) put('metal', box(0.03, 0.76, 0.03), 0x8a8e92, tx, 0.38, zz + dz);
      const r = R();
      if (r < 0.35) for (let i = 0; i < 18; i++) put('prop', sph(0.055, 7, 5), pick([0xff8a1a, 0x7fbf3a, 0xe83a6a, 0xf0c030]), tx - 0.2 + (i % 3) * 0.13, 0.86 + Math.floor(i / 9) * 0.08, zz - 0.5 + (Math.floor(i / 3) % 3) * 0.3 + Math.floor(i / 9) * 0.05);
      else if (r < 0.7) for (let i = 0; i < 8; i++) put('prop', box(0.16, 0.2, 0.12), pick([0xe84a3a, 0xf0c030, 0x3a8ad8, 0x5ac05a, 0xffffff]), tx - 0.15 + (i % 2) * 0.25, 0.9, zz - 0.55 + Math.floor(i / 2) * 0.35);
      else { put('metal', cyl(0.24, 0.22, 0.3, 14), 0xc8ccd0, tx, 0.95, zz); const p = toW(tx, 1.15, zz); steamSrc.push([p.x, p.y, p.z, 1]); }
      const um = new THREE.ConeGeometry(1.0, 0.4, 12, 1, true);
      put('fabric', um, pick([0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400]), tx + dir * 0.2, 2.35, zz);
      put('metal', cyl(0.02, 0.02, 2.3, 5), 0x8a8e92, tx + dir * 0.2, 1.15, zz + 0.7);
      bulb(tx + dir * 0.3, 1.95, zz, 2.2, 0xffc880, 0.55, 3.2);
      if (R() < 0.7) stool(tx + dir * 0.65, zz + 0.3);
      person(wallX + dir * 0.18, 0, zz, dir > 0 ? Math.PI / 2 : -Math.PI / 2, R() < 0.5 ? 4 : 2);
      if (R() < 0.6) person(tx + dir * 0.8, 0, zz - 0.2, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    }
    // the other wall: crates, plants, a parked scooter, a cat asleep on a cooler
    const ow = -dir, oX = wallX === xl ? xr : xl;
    for (let k = 0; k < 4; k++) { const zz = z0 + 0.8 + k * 1.9; if (R() < 0.5) crate(oX + ow * 0.35, 0, zz, Math.PI / 2); else { put('prop', cyl(0.18, 0.13, 0.3, 10), 0xb8603a, oX + ow * 0.3, 0.15, zz); const lf = new THREE.IcosahedronGeometry(0.28, 1); put('prop', lf, 0x2f6a2a, oX + ow * 0.3, 0.55, zz); } }
    scooter(oX + ow * 0.5, z1 - 1.2, 0);
    // overhead: zig-zag bulb strings, a lantern line down the middle, a web of wires, laundry
    for (let k = 0; k < 6; k++) {
      const za = z0 + 0.3 + k * 1.3, zb = za + 1.3;
      const c = wire(V(xl + 0.02, 4.1 + (k % 2) * 0.4, za), V(xr - 0.02, 4.3 - (k % 2) * 0.3, zb), 0.35, 0.006);
      for (let j = 1; j < 6; j++) { const p = c.getPoint(j / 6); bulb(p.x, p.y - 0.08, p.z, null, pick([0xfff0d0, 0xffd0a0, 0xff9ac0]), j === 3 ? 0.4 : 0, 3.2); }
    }
    const lc = wire(V(ax, 4.6, z0 - 0.3), V(ax, 4.6, z1 + 0.5), 0.5, 0.006, 0x1a1a1a, 14);
    for (let j = 1; j < 6; j++) { const p = lc.getPoint(j / 6); lanterns.push([...toW(p.x, p.y - 0.05, p.z).toArray(), pick([0xd8281a, 0xe8401a, 0xf0a020, 0xd8281a]), 1]); }
    for (let k = 0; k < 10; k++) wire(V(xl, 5 + R() * 3, z0 + R() * 7), V(xr, 5 + R() * 3, z0 + R() * 7), 0.3 + R() * 0.6, 0.01, 0x131316, 8);
    {
      const ly = 6.3 + R() * 2, lz = z0 + 3 + R() * 3;
      wire(V(xl, ly, lz), V(xr, ly, lz + 0.4), 0.2, 0.005, 0x2a2a2a, 6);
      for (let j = 0; j < Math.floor(aw / 0.5) - 1; j++) garment(xl + 0.4 + j * 0.5, ly - 0.08, lz + (j * 0.5 / aw) * 0.4, Math.PI / 2 + 0.3, R() < 0.8 ? 0.1 : 0.9);
    }
    // people wandering in and out
    for (let k = 0; k < 4; k++) person(ax + (R() - 0.5) * (aw - 1.6), 0, SIDE - 0.6 + R() * 1.5, 0, 1, { len: 7 + R() * 5, speed: 0.75 + R() * 0.35 });
    light(ax, 0.5, z1 + 2, 0xffc890, 4, 0.35);
  }

  /* ================= 3. CROSSING WIRES (world frame, high), GATEWAY ARCHES, PARKED TUK-TUKS ================= */
  setSide(1);
  {
    const topAt = (s, x) => { const lx = s > 0 ? x : -x; const u = unitsBySide[s].find(([a, b]) => lx >= a && lx < b); return u ? u[2] : 0; };
    for (const x of [-82, -57, -34, -6, 9, 31, 56, 84]) {
      const ha = topAt(-1, x), hb = topAt(1, x);
      if (ha < 10.5 || hb < 10.5) continue;
      const n = Math.abs(x) < F.outX + 4 ? 1 : 2 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const ya = Math.min(ha - 0.4, 12.5) - k * 0.3, yb = Math.min(hb - 0.4, 12.5) - k * 0.25;
        const sag = Math.max(0.2, Math.min(ya, yb) - 9.4);
        wire(V(x + k * 0.4, ya, -SIDE + 0.05), V(x + k * 0.5 + 1.2, yb, SIDE - 0.05), Math.min(sag, 1.6), 0.011, 0x101012, 16);
      }
    }
  }
  for (const sx of [-1, 1]) {
    const ax = sx * 58, zz = SIDE - 2.0;
    for (const s of [-1, 1]) {
      put('prop', cyl(0.3, 0.32, 8.6, 16), 0x8a1e17, ax, 4.3, s * zz);
      put('prop', cyl(0.42, 0.46, 0.5, 16), 0xd8a54c, ax, 0.25, s * zz);
      put('prop', cyl(0.4, 0.36, 0.3, 16), 0xd8a54c, ax, 8.7, s * zz);
      for (let k = 0; k < 3; k++) lanterns.push([ax - sx * 0.45, 7.2 - k * 1.6, s * zz, 0xd8281a, 1.25]);
    }
    put('prop', box(0.5, 0.45, zz * 2 + 1), 0x8a1e17, ax, 8.9, 0);
    put('prop', box(0.55, 0.12, zz * 2 + 1.6), 0xd8a54c, ax, 9.2, 0);
    put('prop', box(0.36, 1.3, zz * 2 - 3), 0x241820, ax, 9.95, 0);
    // a little Thai gable on top, with gilded chofa finials
    for (const s of [-1, 1]) { const r = box(0.9, 0.12, zz + 0.8); put('prop', r, 0x6a1410, ax, 10.95, s * (zz + 0.8) / 2, 0, s * 0.16); }
    for (const s of [-1, 1]) put('prop', new THREE.ConeGeometry(0.1, 0.8, 6), 0xd8a54c, ax, 11.0, s * (zz + 1.1), 0, s * 0.9);
    const it = { uv: NE.words[0].uv, col: NE.words[0].col, aspect: NE.words[0].aspect };
    setSide(1);
    // the sign faces the court (dim by design: it sits behind the far baseline)
    const nm = pick([NE.words[4], NE.words[6]]);
    neon(ax - sx * 0.2, 9.95, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, nm, 0.95, 2);
    void it;
  }
  // parked tuk-tuks at the far ends
  const tuktuk = (x, z, ry, col) => {
    const P = (bk, g, c, px, py, pz, rx = 0, rz = 0) => { const q = new THREE.Vector3(px, py, pz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); put(bk, g, c, x + q.x, py, z + q.z, ry, rx, rz); };
    P('prop', new THREE.CapsuleGeometry(0.55, 0.6, 3, 10).rotateZ(Math.PI / 2).scale(1, 0.75, 1.05), col, -0.2, 0.7, 0);
    P('prop', box(0.9, 0.55, 0.9), col, 0.95, 0.65, 0);
    P('prop', box(2.5, 0.08, 1.38), 0x1a1a1a, 0.35, 1.95, 0);
    P('prop', box(2.4, 0.18, 1.32), shade(col, 0.6), 0.35, 1.84, 0);
    for (const [px, pz] of [[-0.75, 0.62], [-0.75, -0.62], [1.35, 0.5], [1.35, -0.5]]) P('metal', cyl(0.025, 0.025, 1.0, 5), 0x2a2a2a, px, 1.4, pz);
    for (const [px, pz] of [[-0.5, 0.64], [-0.5, -0.64], [1.45, 0]]) { const t = new THREE.TorusGeometry(0.23, 0.08, 6, 14); P('prop', t, 0x111111, px, 0.3, pz); }
    P('prop', box(0.6, 0.12, 1.1), 0x1a1a1a, -0.45, 0.95, 0);
    P('glow', sph(0.07, 8, 6), 0xfff0d0, 1.42, 0.9, 0.0);
  };
  for (const sx of [-1, 1]) {
    tuktuk(sx * 64, -(F.outZ + 0.9), sx > 0 ? 0.2 : Math.PI - 0.2, 0x1f8ad8);
    tuktuk(sx * 72, F.outZ + 1.1, sx > 0 ? -0.1 : Math.PI + 0.1, 0x2fa04a);
    tuktuk(sx * 86, -(F.outZ + 1.0), sx > 0 ? 0.05 : Math.PI, 0xd83a2a);
  }
  // the street ends: a cross row of shophouses closing each vista (dim, mostly dark windows)
  for (const sx of [-1, 1]) {
    const ex = sx * (LEN + 8);
    for (let zz = -SIDE - 20; zz < SIDE + 20;) {
      const w = 6 + R() * 6, nf = 4 + Math.floor(R() * 4), top = GH + (nf - 1) * FH, cz = zz + w / 2;
      put('atlas', box(10, top, w), new THREE.Color(pick(WALL)).multiplyScalar(0.5), ex + sx * 5, top / 2, cz, 0, 0, 0, A.plain);
      const nb = Math.max(1, Math.round(w / 4.2)), bw = w / nb;
      for (let f = 1; f < nf; f++) for (let b = 0; b < nb; b++) { const ap = R() < 0.6 ? pick(A.apts.filter((q) => !q.lit)) : pick(A.apts); put('atlas', plane(bw, FH), new THREE.Color(0x9a9a9a), ex - sx * 0.01, GH + (f - 1) * FH + FH / 2, zz + bw * (b + 0.5), -sx * Math.PI / 2, 0, 0, ap.uv); }
      zz += w;
    }
  }

  /* ================= 4. BUILD THE BATCHES + LIGHT MAP ================= */
  const meshes = {};
  for (const [k, chunks] of Object.entries(B)) for (const list of Object.values(chunks)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeAll(list), M[k]);
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }
  {
    const g = mergeAll(neonQuads, ['aSeed']);
    const nm = new THREE.MeshBasicMaterial({ map: NE.tex, color: new THREE.Color(0xffffff).multiplyScalar(2.1) });
    nm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime; attribute vec2 aSeed; varying float vFl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float s = aSeed.x, t = uTime;
          float hum = 0.93 + 0.07 * sin(t * 47.0 + s * 90.0) * sin(t * 3.1 + s * 20.0);
          float cyc = fract(t / (5.0 + s * 6.0) + s);
          float broken = step(0.5, aSeed.y) * step(aSeed.y, 1.5) * (step(0.82, cyc) * step(0.5, fract(sin(floor(t * 14.0) * 12.9898 + s * 78.2) * 43758.5)));
          vFl = hum * (1.0 - 0.85 * broken) * (aSeed.y > 1.5 ? 0.38 : 1.0); }`);
      sh.fragmentShader = 'varying float vFl;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= vFl;');
    };
    nm.customProgramCacheKey = () => 'mkNeon';
    const mesh = new THREE.Mesh(g, nm); mesh.matrixAutoUpdate = false; root.add(mesh);
    meshes.neon = mesh;
  }
  function mergeAll(list, extra = []) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    const keys = ['position', 'normal', 'uv', 'color', ...extra].filter((k) => list[0].attributes[k]);
    for (const k of keys) {
      const sz = list[0].attributes[k].itemSize, arr = new Float32Array(n * sz);
      let o = 0; for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
      out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
    }
    out.computeBoundingSphere();
    return out;
  }
  // paint the light map
  {
    const g = lmCanvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, lmCanvas.width, lmCanvas.height);
    g.globalCompositeOperation = 'lighter';
    for (const [x, z, col, rad, k] of lights) {
      const px = (x + LMX) * LMS, pz = (z + LMZ) * LMS, r = rad * LMS;
      const gr = g.createRadialGradient(px, pz, 0, px, pz, r);
      const c = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
      gr.addColorStop(0, `rgba(${c},${k})`); gr.addColorStop(0.35, `rgba(${c},${k * 0.55})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(px - r, pz - r, r * 2, r * 2);
    }
    // keep the court + free zone out of it (the court has its own floodlit look)
    g.globalCompositeOperation = 'source-over';
    LMtex.needsUpdate = true;
  }

  /* ================= 5. LANTERNS (instanced, swinging) ================= */
  {
    const P = [];
    const body = lathe([[0.001, -0.38], [0.1, -0.37], [0.2, -0.32], [0.255, -0.23], [0.27, -0.13], [0.255, -0.03], [0.2, 0.05], [0.1, 0.09], [0.001, 0.1]].map(([r, y]) => [r, y - 0.05]), 16);
    { const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - 0.05 * Math.pow(Math.abs(Math.cos(a * 4)), 6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } body.computeVertexNormals(); }
    const tagG = (g, em, col) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); const c = new THREE.Color(col), cnt = n.attributes.position.count, a = new Float32Array(cnt * 3), e = new Float32Array(cnt); for (let i = 0; i < cnt; i++) { a.set([c.r, c.g, c.b], i * 3); e[i] = em; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('aEm', new THREE.BufferAttribute(e, 1)); return n; };
    P.push(tagG(body.translate(0, -0.18, 0), 1, 0xffffff));
    P.push(tagG(cyl(0.12, 0.12, 0.06, 12).translate(0, -0.1, 0), 0, 0xc8a040));
    P.push(tagG(cyl(0.1, 0.1, 0.05, 12).translate(0, -0.64, 0), 0, 0xc8a040));
    P.push(tagG(cyl(0.012, 0.03, 0.26, 6).translate(0, -0.8, 0), 0, 0xe8b030));
    P.push(tagG(cyl(0.004, 0.004, 0.1, 3).translate(0, -0.03, 0), 0, 0x111111));
    const geo = mergeAll(P, ['aEm']);
    const n = lanterns.length;
    const iCol = new Float32Array(n * 3);
    const im = new THREE.InstancedMesh(geo, null, n);
    lanterns.forEach(([x, y, z, col, s], i) => { _o.position.set(x, y, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.setScalar(s * (0.9 + R() * 0.2)); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); iCol.set(new THREE.Color(col).toArray(), i * 3); });
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 3));
    const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const LU = { uTime, uLK: { value: 1.4 } };
    lm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, LU);
      sh.vertexShader = 'uniform float uTime; attribute float aEm; attribute vec3 iCol; varying float vEm;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float ph = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.37;
          float sw = sin(uTime * 1.25 + ph) * 0.07 + sin(uTime * 2.1 + ph * 1.7) * 0.025, sw2 = cos(uTime * 1.05 + ph * 1.3) * 0.05;
          mat3 Rs = mat3(1.0, 0.0, 0.0, 0.0, cos(sw), sin(sw), 0.0, -sin(sw), cos(sw)) * mat3(cos(sw2), sin(sw2), 0.0, -sin(sw2), cos(sw2), 0.0, 0.0, 0.0, 1.0);
          objectNormal = Rs * objectNormal;`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = Rs * transformed;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb = mix(vColor.rgb, iCol, aEm); vEm = aEm;');
      sh.fragmentShader = 'uniform float uLK; varying float vEm;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * (vEm * uLK + 0.15) * vec3(1.0, 0.78, 0.6);');
    };
    lm.customProgramCacheKey = () => 'mkLantern';
    im.material = lm;
    im.computeBoundingSphere(); im.frustumCulled = false;
    root.add(im);
    matU.push({ lantern: LU });
  }

  /* ================= 6. CROWD ================= */
  {
    STATS.nCrowd = crowd.length; STATS.nLantern = lanterns.length; STATS.nBulb = bulbs.length;
    for (const c of crowd) STATS['mode' + c.mode] = (STATS['mode' + c.mode] || 0) + 1;
    const U = { uLM: LMU, uLMK: { value: 1.1 }, uUp: { value: 0.6 }, uLMH: { value: 3.0 }, uPud: { value: 0 }, uTri: { value: null }, uTS: { value: 1 }, uTA: { value: 0 } };
    U.base = 1.1; matU.push(U);
    root.add(makeCrowd(crowd, uTime, (sh) => litPatch(sh, U, {})));
  }

  /* ================= 7. PARTICLES: steam, smoke, embers, wok flames, moths ================= */
  const uPx = { value: 600 };
  const soft = softTexture(0, 64);
  function puffs(srcs, per, o) {
    const pos = [], sd = [], kd = [];
    for (const s of srcs) for (let i = 0; i < per; i++) { pos.push(s[0], s[1], s[2]); sd.push(R()); kd.push(s[3] || 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    g.setAttribute('kind', new THREE.Float32BufferAttribute(kd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime, uPx, uTex: { value: soft }, uOp: { value: o.op } },
      vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; attribute float kind; varying float vA; varying float vT;
        void main() {
          float t = fract(uTime / ${o.life.toFixed(2)} + seed);
          vec3 p = position + vec3(sin(uTime * 0.6 + seed * 40.0) * ${o.wob.toFixed(2)} * t + t * ${o.drift.toFixed(2)}, t * ${o.rise.toFixed(2)} * kind, cos(uTime * 0.5 + seed * 25.0) * ${o.wob.toFixed(2)} * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(${o.size.toFixed(2)} * kind * (0.35 + t * ${o.grow.toFixed(2)}) * uPx / -mv.z, 400.0);
          vA = smoothstep(0.0, 0.12, t) * (1.0 - t); vT = t;
        }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uOp; varying float vA; varying float vT;
        void main() { float a = texture2D(uTex, gl_PointCoord).a * texture2D(uTex, gl_PointCoord).r * vA * uOp;
          vec3 c = mix(vec3(${o.c0.join(',')}), vec3(${o.c1.join(',')}), vT); gl_FragColor = vec4(c, a); }`,
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
  }
  const fxG = new THREE.Group(); root.add(fxG);
  if (steamSrc.length) fxG.add(puffs(steamSrc, 14, { life: 3.2, rise: 1.5, drift: 0.12, wob: 0.18, size: 0.55, grow: 1.6, op: 0.22, c0: ['1.0', '0.92', '0.82'], c1: ['0.75', '0.75', '0.8'] }));
  if (smokeSrc.length) fxG.add(puffs(smokeSrc, 12, { life: 5.0, rise: 3.6, drift: 0.5, wob: 0.4, size: 0.8, grow: 2.2, op: 0.2, c0: ['0.95', '0.72', '0.5'], c1: ['0.45', '0.45', '0.5'] }));
  if (emberSrc.length) fxG.add(makeEmbers(emberSrc, uTime, 6));
  if (flameSrc.length) {
    const pos = [], sd = [];
    for (const s of flameSrc) for (let i = 0; i < 5; i++) { pos.push(s[0] + (R() - 0.5) * 0.25, s[1], s[2] + (R() - 0.5) * 0.25); sd.push(R()); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPx, uTex: { value: soft } },
      vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; varying float vA;
        void main() { float f = 0.55 + 0.45 * sin(uTime * (17.0 + seed * 9.0) + seed * 60.0) * sin(uTime * 7.3 + seed * 20.0);
          vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.05 * f, 0.0), 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(0.26 * (0.6 + f * 0.6) * uPx / -mv.z, 200.0); vA = f; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main() { float a = texture2D(uTex, gl_PointCoord).r * vA; gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * a * 1.6, a); }` });
    const p = new THREE.Points(g, m); p.frustumCulled = false; fxG.add(p);
  }
  {
    const near = bulbs.filter(([x, , z]) => Math.abs(x) < 60 && (Math.abs(z) > F.outZ + 2.5));
    const pos = [], sd = [];
    for (let i = 0; i < near.length; i += 3) for (let k = 0; k < 2; k++) { pos.push(near[i][0], near[i][1], near[i][2]); sd.push(R()); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPx },
      vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; varying float vA;
        void main() { float t = uTime * (1.6 + seed * 1.4) + seed * 50.0;
          vec3 p = position + vec3(sin(t) * 0.22 + sin(t * 2.7) * 0.06, sin(t * 1.9) * 0.12 + 0.05, cos(t * 1.3) * 0.22);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, 0.035 * uPx / -mv.z); vA = 0.55 + 0.45 * sin(uTime * 38.0 + seed * 90.0); }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * vA * 0.8; gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a); }` });
    const p = new THREE.Points(g, m); p.frustumCulled = false; fxG.add(p);
  }

  /* ================= 8. CATS + PASSING SCOOTERS ================= */
  const pm = M.prop;
  function catGeo() {
    const P = [];
    const add = (g, col) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); const c = new THREE.Color(col), cnt = n.attributes.position.count, a = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) a.set([c.r, c.g, c.b], i * 3); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2)); P.push(n); };
    const fur = 0xd89a4a, belly = 0xf0e0c8;
    { const b = sph(0.13, 12, 8); b.scale(0.85, 1.15, 1.1); b.translate(0, 0.17, -0.02); add(b, fur); }
    { const c = sph(0.08, 10, 6); c.scale(0.9, 1.2, 0.7); c.translate(0, 0.16, 0.08); add(c, belly); }
    for (const s of [-1, 1]) { const l = new THREE.CapsuleGeometry(0.025, 0.12, 2, 6); l.translate(s * 0.045, 0.07, 0.1); add(l, fur); const h = sph(0.07, 8, 6); h.scale(0.7, 0.8, 1.2); h.translate(s * 0.07, 0.06, -0.05); add(h, fur); }
    return P;
  }
  const catHead = () => {
    const P = [];
    const add = (g, col) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); const c = new THREE.Color(col), cnt = n.attributes.position.count, a = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) a.set([c.r, c.g, c.b], i * 3); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2)); P.push(n); };
    { const h = sph(0.075, 12, 8); h.scale(1.05, 0.92, 0.95); add(h, 0xd89a4a); }
    { const m = sph(0.035, 8, 6); m.scale(1.2, 0.8, 1); m.translate(0, -0.02, 0.06); add(m, 0xf0e0c8); }
    for (const s of [-1, 1]) { const e = new THREE.ConeGeometry(0.03, 0.06, 4); e.translate(s * 0.042, 0.07, 0); add(e, 0xc88a3a); const ey = sph(0.012, 6, 4); ey.translate(s * 0.03, 0.012, 0.064); add(ey, 0x2a3a10); }
    return P;
  };
  const tailGeo = () => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(0, 0.02 + Math.sin(t * 2.2) * 0.12, -t * 0.26)); } const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.018, 6); const n = g.toNonIndexed(); n.deleteAttribute('uv'); const c = new THREE.Color(0xd89a4a), a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < n.attributes.position.count; i++) a.set([c.r, c.g, c.b], i * 3); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; };
  const cats = [];
  for (const [cx, cz, cr] of [[-17.5, SIDE - 1.6, 2.6], [23.0, -(SIDE - 1.4), -0.4]]) {
    const cg = new THREE.Group(); cg.position.set(cx, 0.04, cz); cg.rotation.y = cr;
    const bodyM = new THREE.Mesh(mergeAll(catGeo()), pm);
    const head = new THREE.Mesh(mergeAll(catHead()), pm); head.position.set(0, 0.34, 0.06);
    const tail = new THREE.Mesh(tailGeo(), pm); tail.position.set(0, 0.06, -0.14);
    cg.add(bodyM, head, tail); root.add(cg);
    cats.push({ head, tail, ph: R() * 10 });
  }
  // scooters riding along the back streets (seen through the alleys): body + rider silhouette + headlight
  const riders = [];
  {
    const P = [];
    const add = (g, col, x, y, z, rx = 0) => { g.rotateX(rx); g.translate(x, y, z); const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); const c = new THREE.Color(col), cnt = n.attributes.position.count, a = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) a.set([c.r, c.g, c.b], i * 3); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2)); P.push(n); };
    for (const z of [-0.6, 0.6]) { const t = new THREE.TorusGeometry(0.2, 0.06, 6, 12); t.rotateY(Math.PI / 2); add(t, 0x111111, 0, 0.26, z); }
    add(box(0.3, 0.35, 1.0), 0x2a5ab8, 0, 0.5, -0.1); add(box(0.3, 0.55, 0.16), 0x2a5ab8, 0, 0.7, 0.45, 0.3);
    add(new THREE.CapsuleGeometry(0.17, 0.4, 3, 8), 0x3a3a40, 0, 1.15, -0.15, -0.2); add(sph(0.13, 10, 8), 0xe8e8e8, 0, 1.6, -0.08);
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.06, 0.4, 2, 6), 0x2a3550, s * 0.13, 0.75, 0.05, Math.PI / 2 - 0.3);
    const g = mergeAll(P);
    const hl = mergeAll([(() => { const s = sph(0.07, 8, 6); s.translate(0, 0.95, 0.56); const n = s.toNonIndexed(); n.deleteAttribute('uv'); const a = new Float32Array(n.attributes.position.count * 3).fill(1); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; })()]);
    for (let k = 0; k < 4; k++) {
      const s = k % 2 ? 1 : -1, grp = new THREE.Group();
      grp.add(new THREE.Mesh(g, pm), new THREE.Mesh(hl, M.glow));
      root.add(grp);
      riders.push({ grp, s, z: s * (SIDE + 10.5 + (k > 1 ? 1.2 : 0)), dir: k > 1 ? 1 : -1, t: R(), speed: 6 + R() * 3 });
    }
  }

  /* ================= update / time of day ================= */
  function update(dt, t) {
    uPx.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 3) * 0.5 * camera.projectionMatrix.elements[5];
    for (const c of cats) {
      c.tail.rotation.y = Math.sin(t * 1.7 + c.ph) * 0.5;
      c.tail.rotation.x = Math.sin(t * 0.9 + c.ph) * 0.12;
      const look = Math.sin(t * 0.21 + c.ph);
      c.head.rotation.y = Math.abs(look) > 0.6 ? Math.sign(look) * 0.7 : look * 0.3;
      c.head.rotation.x = Math.sin(t * 0.13 + c.ph) > 0.85 ? 0.35 : 0;
    }
    for (const r of riders) {
      r.t += dt * r.speed / (LEN * 2 + 40);
      if (r.t > 1) r.t -= 1;
      const x = (r.t * (LEN * 2 + 40) - LEN - 20) * r.dir;
      r.grp.position.set(x, -0.1, r.z);
      r.grp.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  function setTime(tod) {
    const night = tod !== 'day';
    M.atlas.emissiveIntensity = night ? 1 : 0;
    for (const U of matU) { if (U.lantern) U.lantern.uLK.value = night ? 1.4 : 0.1; else U.uLMK.value = night ? U.base : U.base * 0.08; }
  }
  return { group: root, update, setTime };
}
