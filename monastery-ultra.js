// CLOUD MONASTERY — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on
// Ultra. Replaces the low-poly pieces (`lite` in monastery.js) with:
//  • real stone: flagstone paving and ashlar retaining walls / stairs (Poly Haven textures), warm where the lanterns are;
//  • a smooth, craggy summit — stratified cliffs and ledges, pines on the ledges — melting into the clouds below;
//  • a living sea of cloud: a billowing, slowly rolling moonlit surface that fades into the horizon glow;
//  • a ring of jagged snow peaks rising through it, far ranges behind, and three neighbouring monasteries on the peaks;
//  • a detailed golden chedi (ringed spire, lotus mouldings) on a stone podium, floodlit; proper viharns; naga balustrades;
//  • quiet night life: a candle procession of monks climbing the naga stairs, sky lanterns drifting up far off to the
//    sides, mist curling round the cliffs, moths at the lanterns.
// GAMEPLAY RULE: nothing new on or above the court; nothing bright or busy behind the ball's flight in the two match
// cameras (which look along ±x): everything lit or moving sits ≥ 25° off the ±x axis, or below the terrace walls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, V2, merge, softTexture, TAU } from './temple-ultra.js';
import { personGeometry } from './life.js';

const _o = new THREE.Object3D();
const DEG = Math.PI / 180;
const MOON = new THREE.Vector3(-7, 15, -14).normalize();          // main.js LIGHT_POS.night — the moon in the painted sky

/* ---------------- tiny value noise (deterministic) ---------------- */
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
  const ridged = (x, y, o = 5) => {
    let s = 0, a = 0.5, w = 1, t = 0;
    for (let i = 0; i < o; i++) { let n = 1 - Math.abs(n2(x, y) * 2 - 1); n *= n * w; w = Math.min(1, Math.max(0, n * 1.8)); s += n * a; t += a; a *= 0.5; x = x * 2.07 + 3.1; y = y * 2.07 + 9.7; }
    return s / t;
  };
  return { n2, fbm, ridged };
}

/* ---------------- shared GLSL ---------------- */
// the painted night sky's colour just above the horizon (main.js paintSky, SKY_STYLE.night), so far things melt into it
const SKY_GLSL = `
  vec3 s2l(vec3 c) { return pow((c / 255.0 + 0.055) / 1.055, vec3(2.4)); }
  vec3 rampN(float t) { return t < 0.05 ? mix(vec3(44.,54.,96.), vec3(30.,38.,76.), t / 0.05) : t < 0.22 ? mix(vec3(30.,38.,76.), vec3(16.,22.,50.), (t - 0.05) / 0.17) : mix(vec3(16.,22.,50.), vec3(4.,6.,16.), (t - 0.22) / 0.78); }
  vec3 rampF(float t) { return t < 0.06 ? mix(vec3(34.,42.,82.), vec3(22.,28.,60.), t / 0.06) : t < 0.28 ? mix(vec3(22.,28.,60.), vec3(12.,16.,38.), (t - 0.06) / 0.22) : mix(vec3(12.,16.,38.), vec3(3.,5.,14.), (t - 0.28) / 0.72); }
  vec3 skyAt(vec3 d) {
    float e = asin(clamp(d.y, -1.0, 1.0)), t = max(e, 0.0) / 1.5707963;
    vec2 m = normalize(vec2(${MOON.x.toFixed(4)}, ${MOON.z.toFixed(4)}));
    float toward = pow((clamp(dot(d.xz, m), -1.0, 1.0) + 1.0) * 0.5, 1.6);
    return s2l(mix(rampF(t), rampN(t), toward));
  }`;
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
const SNOISE = `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

/* ---------------- stone / rock material: triplanar greyscale detail + bump, warm lantern light, mist near the clouds ---------------- */
function stoneShader(mat, o) {
  const U = {
    uTri: { value: o.tri || null }, uTS: { value: o.triScale ?? 0.4 }, uTA: { value: o.triAmt ?? 1 }, uBump: { value: o.bump ?? 1 }, uMean: { value: o.mean ?? 0.45 },
    uLamps: { value: o.lamps || [new THREE.Vector3(0, -999, 0)] }, uLampK: { value: o.lampK ?? 0 }, uLampR: { value: o.lampR ?? 5 },
    uLampCol: { value: new THREE.Color(o.lampCol ?? 0xffa860) },
    uUpK: { value: o.upK ?? 0 }, uUpY: { value: o.upY ?? 0 }, uUpFall: { value: o.upFall ?? 4 }, uUpCol: { value: new THREE.Color(o.upCol ?? 0xffb060) },
    uUpC: { value: new THREE.Vector3(...(o.upFrom || [0, -50, 0])) }, uUpWrap: { value: o.upFrom ? (o.upWrap ?? 0.3) : 1 },
    uMistY: { value: new THREE.Vector2(o.mistY0 ?? -999, o.mistY1 ?? -1000) }, uMist: { value: new THREE.Color(o.mist ?? 0x2a3456) },
    uHaze: { value: new THREE.Vector2(o.haze0 ?? 1e5, o.haze1 ?? 2e5) },
  };
  const NL = (o.lamps || [0]).length;
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWP = (wm * vec4(transformed, 1.0)).xyz; vec3 wn = mat3(wm) * objectNormal; vWN = dot(wn, wn) > 1e-12 ? normalize(wn) : vec3(0.0, 1.0, 0.0); }`);
    sh.fragmentShader = `varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uTri; uniform float uTS; uniform float uTA; uniform float uBump; uniform float uMean; uniform vec3 uUpC; uniform float uUpWrap;
      uniform vec3 uLamps[${NL}]; uniform float uLampK; uniform float uLampR; uniform vec3 uLampCol;
      uniform float uUpK; uniform float uUpY; uniform float uUpFall; uniform vec3 uUpCol;
      uniform vec2 uMistY; uniform vec3 uMist; uniform vec2 uHaze;
      ${SKY_GLSL}
      float triLum(vec3 p, vec3 n, float s) {
        vec3 bw = pow(abs(n), vec3(4.0)); bw /= max(bw.x + bw.y + bw.z, 1e-6);
        vec3 t = texture2D(uTri, p.zy * s).rgb * bw.x + texture2D(uTri, p.xz * s).rgb * bw.y + texture2D(uTri, p.xy * s).rgb * bw.z;
        return dot(t, vec3(0.2126, 0.7152, 0.0722));
      }
      vec3 perturbB(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
        vec3 dx = dFdx(surf_pos), dy = dFdy(surf_pos);
        if (dot(dx, dx) < 1e-14 || dot(dy, dy) < 1e-14) return surf_norm;          // (degenerate pixel: no bump, never NaN)
        vec3 vSigmaX = normalize(dx); vec3 vSigmaY = normalize(dy); vec3 vN = surf_norm;
        vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
        float fDet = dot(vSigmaX, R1) * fd; vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
        vec3 r = abs(fDet) * surf_norm - vGrad;
        return dot(r, r) > 1e-14 ? normalize(r) : surf_norm;
      }
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float triH = 0.5;
        if (uTA > 0.0) {
          triH = triLum(vWP, vWN, uTS);
          float macro = triLum(vWP + 31.0, vWN, uTS * 0.23);
          diffuseColor.rgb *= mix(1.0, clamp(triH / uMean, 0.5, 1.55) * clamp(1.0 + (macro / uMean - 1.0) * 0.7, 0.72, 1.25), uTA);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uBump > 0.0 && uTA > 0.0) normal = perturbB(-vViewPosition, normal, vec2(dFdx(triH), dFdy(triH)) * uBump, faceDirection);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uLampK > 0.0) {
          vec3 acc = vec3(0.0);
          for (int i = 0; i < ${NL}; i++) {
            vec3 d = uLamps[i] - vWP; float l2 = dot(d, d);
            float f = uLampR * uLampR / (l2 + uLampR * uLampR * 0.35);
            acc += vec3(f * f) * (0.35 + 0.65 * clamp(dot(normalize(vWN), d * inversesqrt(l2 + 1e-4)), 0.0, 1.0));
          }
          totalEmissiveRadiance += diffuseColor.rgb * uLampCol * uLampK * acc;
        }
        if (uUpK > 0.0) {
          float face = clamp(dot(normalize(vWN), normalize(uUpC - vWP)), 0.0, 1.0);
          totalEmissiveRadiance += diffuseColor.rgb * uUpCol * uUpK * exp(-max(vWP.y - uUpY, 0.0) / uUpFall) * (uUpWrap + (1.0 - uUpWrap) * face);
        }`)
      .replace('#include <fog_fragment>', `
        { float mk = smoothstep(uMistY.x, uMistY.y, vWP.y); gl_FragColor.rgb = mix(gl_FragColor.rgb, uMist, mk * 0.9); }
        { vec3 dv = vWP - cameraPosition; float hk = smoothstep(uHaze.x, uHaze.y, length(dv));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyAt(normalize(vec3(dv.x, 0.0, dv.z))), hk * 0.92); }
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'monU' + (o.key || '') + NL;
  return mat;
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildMonasteryUltra(ctx, uTime) {
  const { F, texLoader, TX, TZ, CLOUD_Y } = ctx;
  const root = new THREE.Group(); root.name = 'monastery-ultra';
  const ticks = [];
  const R = rng(4242);
  const N = noise2(77);
  const load = (name, srgb, rep = 1) => {
    const t = texLoader.load(`assets/monastery-ultra/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const wallTex = load('wall_diff.jpg', false), cliffTex = load('cliff_diff.jpg', false);
  const roofTex = texLoader.load('assets/temple/roof_diff.jpg'); roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.anisotropy = 16;
  const cz = TZ + 14;                                     // the great chedi (as in monastery.js)
  // the terrace lanterns (monastery.js: red posts with a glowing globe) — they warm the paving and walls round them
  const lamps = [];
  for (let x = -TX + 3; x < TX - 2; x += 6) for (const s of [-1, 1]) lamps.push(new THREE.Vector3(x, 2.6, s * (TZ - 1.2)));
  const UP = { upY: -0.2, upCol: 0xffb468 };

  const B = new Map();                                    // static pieces merged per material
  const put = (mat, geo) => { if (!B.has(mat)) B.set(mat, []); B.get(mat).push(geo); };
  const at = (geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => {
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); return g.applyMatrix4(_o.matrix);
  };

  const M = {
    wall: stoneShader(new THREE.MeshStandardMaterial({ color: 0xb4ab9c, roughness: 0.92 }),
      { key: 'wall', tri: wallTex, mean: 0.471, triScale: 0.42, bump: 1.6, lamps, lampK: 0.55, lampR: 3.2, ...UP, upK: 0.12, upFall: 1.6 }),
    gold: stoneShader(new THREE.MeshStandardMaterial({ color: 0xf2c66c, metalness: 0.85, roughness: 0.3, emissive: 0x140d02 }),
      { key: 'gold', triAmt: 0, upK: 0.95, upY: 0, upFall: 10, upCol: 0xffd08e, upFrom: [0, -2, TZ + 2], upWrap: 0.18 }),
    plaster: stoneShader(new THREE.MeshStandardMaterial({ color: 0xf0e8dc, roughness: 0.85 }),
      { key: 'pl', tri: wallTex, mean: 0.471, triScale: 0.9, triAmt: 0.35, bump: 0.4, upK: 0.3, upY: -0.2, upFall: 2.5, upCol: 0xffc890, upFrom: [0, -2, TZ + 2], upWrap: 0.3 }),
    red: stoneShader(new THREE.MeshStandardMaterial({ color: 0xa02a1e, roughness: 0.5, side: THREE.DoubleSide }), { key: 'roof', tri: roofTex, mean: 0.825, triScale: 0.9, triAmt: 0.8, bump: 0.8, upK: 0.5, upY: 0, upFall: 4, upCol: 0xffb070, upFrom: [0, -2, TZ + 2], upWrap: 0.3 }),
    green: stoneShader(new THREE.MeshStandardMaterial({ color: 0x2f7450, roughness: 0.45, side: THREE.DoubleSide }), { key: 'roof', tri: roofTex, mean: 0.825, triScale: 0.9, triAmt: 0.8, bump: 0.8, upK: 0.5, upY: 0, upFall: 4, upCol: 0xffb070, upFrom: [0, -2, TZ + 2], upWrap: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(1.8) }),
    dim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(1.15) }),
  };

  /* ---------------- 1. STONE — flagstone paving, ashlar walls + parapets, both stairs (same boxes as High) ---------------- */
  {
    const pm = new THREE.MeshStandardMaterial({ map: load('floor_diff.jpg', true), normalMap: load('floor_nor_gl.jpg', false), color: 0xc2c8d4, roughness: 0.86, normalScale: new THREE.Vector2(0.7, 0.7) });
    for (const t of [pm.map, pm.normalMap]) t.repeat.set(TX * 2 / 2.6, TZ * 2 / 2.6);
    stoneShader(pm, { key: 'pave', triAmt: 0, lamps, lampK: 0.45, lampR: 3.4 });
    const pav = new THREE.Mesh(new THREE.BoxGeometry(TX * 2, 0.4, TZ * 2), pm);
    pav.position.y = -0.32; pav.receiveShadow = true; root.add(pav);
    for (const [len, x, z, ry] of [[TX * 2 + 0.8, 0, -TZ, 0], [TX * 2 + 0.8, 0, TZ, 0], [TZ * 2, -TX, 0, Math.PI / 2], [TZ * 2, TX, 0, Math.PI / 2]]) {
      put(M.wall, at(new THREE.BoxGeometry(len, 6, 0.8), x, -3.2, z, ry));
      put(M.wall, at(new THREE.BoxGeometry(len, 0.7, 0.9), x, 0.25, z, ry));
    }
    const steps = 72, drop = 0.42, run = 0.8, W = 4.4;
    for (let k = 0; k < steps; k++) put(M.wall, at(new THREE.BoxGeometry(W, 0.42, run + 0.05), 0, -0.3 - k * drop, -TZ - 0.4 - k * run));
    for (let k = 0; k < 6; k++) put(M.wall, at(new THREE.BoxGeometry(6, 0.3, 0.6), 0, -0.2 + k * 0.3, TZ + 0.5 + k * 0.6));
    // the upper court beyond the +z wall: a stone podium the shrines + chedi platform stand on (outside the terrace walls)
    put(M.wall, at(new THREE.BoxGeometry(TX * 2 + 0.8, 6.2, 9.0), 0, -3.25, TZ + 4.9));
    put(M.wall, at(new THREE.BoxGeometry(23, 6.4, 16.6), 0, -3.4, cz + 2.8));
  }

  /* ---------------- 2. THE SUMMIT — stratified cliffs and ledges falling into the clouds ---------------- */
  const STEPS = 72;                                       // High's 46 steps, carried on down into the clouds
  const stairY = (z) => { const k = Math.max(0, (-TZ - 0.4 - z) / 0.8); return -0.3 - k * 0.42; };
  const sdBox = (x, z, x0, x1, z0, z1) => { const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1); return Math.hypot(dx, dz); };
  const fall = (s, k = 1) => (40 * (1 - Math.exp(-s / (15 * k))) + 0.22 * s) * 1;
  const summitAt = (x, z) => {
    const warp = (N.fbm(x * 0.025 + 3, z * 0.025 - 7, 3) - 0.5) * 16;
    const sT = sdBox(x, z, -TX - 0.4, TX + 0.4, -TZ - 0.4, TZ + 0.4);
    const sP = sdBox(x, z, -TX - 0.4, TX + 0.4, TZ, TZ + 9.4);
    const sC = sdBox(x, z, -11.5, 11.5, cz - 5.5, cz + 11.1);
    let s = Math.min(sT, sP, sC);
    const top = -5.4;
    s = Math.max(0, s + warp * Math.min(1, s / 10));
    let y = top - fall(s);
    // the spur the naga stairs ride down
    const zz = Math.min(-TZ, Math.max(z, -TZ - 0.4 - (STEPS - 1) * 0.8));
    const sS = Math.max(0, Math.abs(x) - 3.0) + Math.max(0, zz - z) * 1.0;
    const yS = Math.min(stairY(zz) - 0.7, stairY(zz) - 0.7 - fall(sS, 0.45) * 0.8 + (N.ridged(x * 0.07, z * 0.07, 3) - 0.45) * 3 * Math.min(1, sS / 5));
    // strata: flat ledges and steep risers, broken up by crags
    const H = 6.5 + (N.n2(x * 0.02, z * 0.02) - 0.5) * 3;
    const q = (y + 200) / H, fq = q - Math.floor(q);
    const st = (Math.floor(q) + (fq < 0.62 ? 0 : (fq - 0.62) / 0.38)) * H - 200;
    const ss = Math.min(sT, sP, sC);
    const edge = Math.min(1, ss / 4);
    y = y + (st - y) * 0.7 * edge;
    y += (N.ridged(x * 0.05, z * 0.05, 4) - 0.45) * 5.5 * Math.min(1, ss / 8) + (N.fbm(x * 0.22, z * 0.22, 3) - 0.5) * 1.6 * edge;
    return Math.max(Math.min(y, top + 0.6), yS);
  };
  let rockGeo;
  {
    const axis = (half, dense, denseHalf, coarse) => {
      const pts = [0]; let v = 0;
      while (v < half) { const t = Math.max(0, (v - denseHalf) / (half - denseHalf)); v += dense + (coarse - dense) * t; pts.push(Math.min(v, half)); }
      return [...pts.slice(1).reverse().map((q) => -q), ...pts];
    };
    const xs = axis(150, 0.5, 42, 5.5), zs = axis(160, 0.5, 70, 5.5).map((z) => z - 10);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = xs[i]; pos[k + 1] = summitAt(xs[i], zs[j]); pos[k + 2] = zs[j]; }
    const idx = [];
    const low = CLOUD_Y - 12;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[d * 3 + 1], pos[e * 3 + 1]) < low) continue;   // drowned in cloud
      const cx = (xs[i] + xs[i + 1]) / 2, czz = (zs[j] + zs[j + 1]) / 2;
      if (Math.abs(cx) < TX - 0.5 && Math.abs(czz) < TZ - 0.5) continue;                              // under the paving
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(nx * nz * 3), c = new THREE.Color();
    const rock = new THREE.Color(0x8a8478), rock2 = new THREE.Color(0x6e6a62), moss = new THREE.Color(0x3a4a30), soil = new THREE.Color(0x4a4434);
    for (let i = 0; i < nx * nz; i++) {
      const ny = nrm.getY(i), x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      c.copy(rock).lerp(rock2, N.n2(x * 0.06, z * 0.06 + y * 0.05));
      const flat = THREE.MathUtils.smoothstep(ny, 0.62, 0.86);
      c.lerp(N.n2(x * 0.3, z * 0.3) > 0.4 ? moss : soil, flat * 0.85);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeo = { pos, nrm, nx, nz, xs, zs };
    const m = stoneShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      { key: 'rock', tri: cliffTex, mean: 0.357, triScale: 0.13, bump: 2.2, mistY0: -24, mistY1: CLOUD_Y - 2, mist: 0x313c62, haze0: 120, haze1: 260 });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; root.add(mesh);
  }

  /* ---------------- 3. PINES on the ledges (instanced, three shapes) ---------------- */
  {
    const variant = (seed, tiers) => {
      const r = rng(seed), parts = [];
      const trunk = new THREE.CylinderGeometry(0.09, 0.16, 2.2, 7); trunk.translate(0, 1.1, 0);
      parts.push([trunk, 0x3a2c22]);
      let y = 1.0, rad = 1.55, h = 1.9;
      for (let t = 0; t < tiers; t++) {
        const pr = [[0.02, y + h], [rad * 0.42, y + h * 0.55], [rad, y - 0.05], [rad * 0.84, y - 0.14], [0.1, y + 0.15]];
        const g = new THREE.LatheGeometry(V2(pr.reverse()), 12); g.rotateY(r() * TAU);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.13 * Math.sin(a * 5 + t * 2 + seed) + 0.06 * Math.sin(a * 11 + seed); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
        g.computeVertexNormals();
        parts.push([g, t % 2 ? 0x22392a : 0x1d3324]);
        y += h * 0.55; rad *= 0.76; h *= 0.9;
      }
      const geos = parts.map(([g, cc]) => {
        const n = g.index ? g.toNonIndexed() : g, a = new Float32Array(n.attributes.position.count * 3), c = new THREE.Color(cc);
        for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
        n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.deleteAttribute('uv'); return n;
      });
      return mergeGeometries(geos);
    };
    const vars = [variant(3, 5), variant(9, 6), variant(21, 4)];
    const spots = [[], [], []];
    const { pos, nrm, nx, nz } = rockGeo;
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i, x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      if (nrm.getY(k) < 0.8 || y > -6.5 || y < CLOUD_Y + 2) continue;
      if (R() > 0.012) continue;
      if (Math.abs(x) < 5.2 && z < -TZ) continue;                                         // keep the stairs clear
      const sc = 0.75 + R() * 0.7;
      if (Math.abs(x) < 26 && Math.abs(z) < 18 && y + 7 * sc > -1.5) continue;           // nothing pokes above the terrace walls
      if (sdBox(x, z, -TX - 1, TX + 1, -TZ - 1, cz + 12) < 0.8) continue;
      spots[(i + j) % 3].push([x, y - 0.25, z, sc, R() * TAU]);
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    stoneShader(mat, { key: 'pine', triAmt: 0, mistY0: -26, mistY1: CLOUD_Y - 1, mist: 0x313c62, haze0: 120, haze1: 260 });
    vars.forEach((geo, vi) => {
      const list = spots[vi]; if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const c = new THREE.Color();
      list.forEach(([x, y, z, s, ry], i) => { _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.set(s, s * (0.9 + R() * 0.35), s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, c.setHSL(0, 0, 0.8 + R() * 0.4)); });
      im.computeBoundingSphere(); im.castShadow = false; root.add(im);
    });
  }

  /* ---------------- 4. THE SEA OF CLOUD — a billowing, slowly rolling moonlit surface + the horizon glow ---------------- */
  const CLOUD_GLSL = `
    uniform float uTime;
    float billow(vec2 p) {
      vec2 q = p * 0.0105 + vec2(uTime * 0.0035, uTime * 0.0012);
      float h = 0.0, a = 1.0;
      for (int i = 0; i < 4; i++) { h += a * abs(snoise(vec3(q, uTime * 0.006 + float(i) * 7.31))); q = q * 2.07 + vec2(17.1, 3.7); a *= 0.47; }
      return h;
    }`;
  {
    const NR = 150, NS = 320, r0 = 24, r1 = 362;
    const pos = new Float32Array((NR + 1) * (NS + 1) * 3), idx = [];
    for (let j = 0; j <= NR; j++) {
      const r = r0 * Math.pow(r1 / r0, j / NR);
      for (let i = 0; i <= NS; i++) { const a = (i / NS) * TAU, k = (j * (NS + 1) + i) * 3; pos[k] = Math.cos(a) * r; pos[k + 1] = 0; pos[k + 2] = Math.sin(a) * r; }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NS; i++) { const a = j * (NS + 1) + i, b = a + 1, d = a + NS + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CLOUD_Y, 0), r1 + 10);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime, uY: { value: CLOUD_Y }, uMoon: { value: MOON } },
      vertexShader: `${SNOISE}${CLOUD_GLSL}
        uniform float uY; varying vec3 vWP; varying vec3 vN; varying float vH;
        void main() {
          vec3 p = position;
          float r = length(p.xz);
          float amp = 17.0 * smoothstep(380.0, 120.0, r) + 6.0;
          float h = billow(p.xz);
          float e = 2.2 + r * 0.012;
          float hx = billow(p.xz + vec2(e, 0.0)), hz = billow(p.xz + vec2(0.0, e));
          p.y = uY + (h - 0.55) * amp;
          vN = normalize(vec3(-(hx - h) * amp / e, 1.0, -(hz - h) * amp / e));
          vH = h;
          vec4 wp = modelMatrix * vec4(p, 1.0); vWP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `${SKY_GLSL}
        uniform vec3 uMoon; uniform float uTime; varying vec3 vWP; varying vec3 vN; varying float vH;
        float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          vec3 dv = vWP - cameraPosition; float dist = length(dv); vec3 V = dv / dist;
          // fine puffy detail, fading out with distance so it never shimmers
          vec2 q = vWP.xz * 0.09 + vec2(uTime * 0.03, uTime * 0.01);
          float d1 = vn(q), d2 = vn(q * 2.3 + 5.1);
          float fade = 1.0 - smoothstep(40.0, 220.0, dist);
          vec3 n = normalize(vN + vec3(d1 - 0.5, 0.0, d2 - 0.5) * 0.55 * fade);
          float wrap = clamp(dot(n, uMoon) * 0.5 + 0.5, 0.0, 1.0);
          float ao = smoothstep(0.08, 0.75, vH);                                  // creases between the heaps sink into shadow
          vec3 shadowC = vec3(0.010, 0.014, 0.036), litC = vec3(0.085, 0.104, 0.19);
          vec3 c = mix(shadowC, litC, pow(wrap, 1.6) * (0.35 + 0.65 * ao));
          c *= 0.85 + 0.3 * mix(0.5, d1 * 0.6 + d2 * 0.4, fade);
          // silver lining: rims glow when you look toward the moon
          float rim = pow(1.0 - clamp(dot(n, -V), 0.0, 1.0), 3.0);
          float toward = pow(max(dot(normalize(V.xz), normalize(uMoon.xz)), 0.0), 3.0);
          c += vec3(0.10, 0.12, 0.2) * rim * (0.25 + 0.75 * toward) * ao;
          // haze into the horizon glow of the painted sky
          float hk = smoothstep(60.0, 520.0, dist);
          c = mix(c, skyAt(normalize(vec3(V.x, 0.0, V.z))), hk);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sea = new THREE.Mesh(geo, m); sea.name = 'cloud-sea'; root.add(sea);
  }
  {
    // the horizon band: the painted sky's own colour, opaque up to ~6° and fading by ~10° — hides the far tree line the
    // shared sky has painted round the horizon and lets the cloud sea melt into the glow
    const band = new THREE.Mesh(new THREE.CylinderGeometry(368, 368, 150, 96, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: 'varying vec3 vWP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: `${SKY_GLSL}
        varying vec3 vWP;
        void main() { vec3 d = normalize(vWP - cameraPosition); float e = asin(d.y) * 57.2958;
          float a = 1.0 - smoothstep(5.5, 10.0, e);
          gl_FragColor = vec4(skyAt(d), a); }`,
    }));
    band.position.y = 0; band.renderOrder = -1; root.add(band);
    const cam = ctx.camera;
    if (cam) ticks.push(() => { band.position.x = cam.position.x; band.position.z = cam.position.z; });   // always the same distance away, like the sky
  }

  /* ---------------- 5. THE PEAKS — jagged snow peaks through the cloud, far ranges behind ---------------- */
  // azimuth a (0 = +x, the far end in the −x player's camera); everything keeps ≥ 25° off the ±x axis
  const peakDefs = [
    // [azimuth°, distance, height above the cloud tops, base radius, seed, monastery?]
    [33, 215, 92, 78, 1], [58, 150, 64, 52, 2, 'A'], [88, 255, 128, 96, 3], [118, 185, 78, 62, 4], [146, 285, 104, 86, 5],
    [-36, 235, 98, 80, 6], [-66, 168, 70, 56, 7, 'B'], [-104, 282, 138, 100, 8], [-128, 160, 58, 46, 9, 'C'], [-151, 250, 92, 74, 10],
    [47, 320, 72, 70, 11], [74, 330, 98, 88, 12], [131, 335, 86, 80, 13], [-48, 330, 80, 72, 14], [-86, 340, 108, 90, 15], [-118, 338, 90, 80, 16],
  ];
  const peakSurf = [];                                      // per peak: (x, z) → y, for things that stand on it
  const monasteries = [];
  {
    const parts = [];
    const snow = new THREE.Color(0xeef2fa), rockC = new THREE.Color(0x4a4a50), rockD = new THREE.Color(0x34353c), forest = new THREE.Color(0x1a2a22);
    for (const [deg, dist, H, Rb, seed, mon] of peakDefs) {
      const a0 = deg * DEG, px = Math.cos(a0) * dist, pz = Math.sin(a0) * dist;
      const NS = dist > 300 ? 64 : 112, NR = dist > 300 ? 22 : 40;
      const base = CLOUD_Y - 14, sOff = seed * 13.7;
      const heightAt = (r, a) => {
        const t = Math.min(1, r / Rb);
        const ridge = N.ridged(Math.cos(a) * 1.6 + sOff, Math.sin(a) * 1.6 + t * 0.9, 4);
        let prof = Math.pow(1 - t, 1.55 + 0.4 * Math.sin(a * 3 + seed)) * (0.72 + 0.5 * ridge);
        if (mon) prof = Math.min(prof, 0.86 - t * 0.0) * (t < 0.1 ? 1 : 1);
        const det = (N.fbm(px * 0.01 + Math.cos(a) * r * 0.06, pz * 0.01 + Math.sin(a) * r * 0.06, 4) - 0.5) * 0.12 * (1 - t);
        return base + (H + 14) * (prof + det);
      };
      // a monastery peak gets a flat shoulder for its buildings
      const topFlat = mon ? heightAt(0, 0) * 0 + base + (H + 14) * 0.8 : Infinity;
      const pos = [], col = [], idx = [];
      const wobAt = (a) => 1 + 0.18 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 7 + seed * 2);
      for (let j = 0; j <= NR; j++) {
        const t = Math.pow(j / NR, 1.35), r = t * Rb;
        for (let i = 0; i <= NS; i++) {
          const a = (i / NS) * TAU;
          const wob = wobAt(a);
          let y = heightAt(r, a);
          if (mon && y > topFlat) y = topFlat + (y - topFlat) * 0.08;
          pos.push(px + Math.cos(a) * r * wob, y, pz + Math.sin(a) * r * wob);
        }
      }
      for (let j = 0; j < NR; j++) for (let i = 0; i < NS; i++) { const a = j * (NS + 1) + i, b = a + 1, d = a + NS + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const nr = g.attributes.normal, c = new THREE.Color();
      const snowLine = CLOUD_Y + H * 0.36;
      for (let i = 0; i < pos.length / 3; i++) {
        const y = pos[i * 3 + 1], ny = nr.getY(i), x = pos[i * 3], z = pos[i * 3 + 2];
        c.copy(rockC).lerp(rockD, N.n2(x * 0.05, z * 0.05));
        const sn = THREE.MathUtils.smoothstep(y - snowLine + (N.n2(x * 0.08, z * 0.08) - 0.5) * 16 + (ny - 0.55) * 30, -2, 6);
        c.lerp(snow, sn * (mon ? 0.4 : 1));
        c.lerp(forest, THREE.MathUtils.smoothstep(CLOUD_Y + 16 - y, 0, 10) * 0.8);
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      parts.push(g);
      peakSurf.push({ px, pz, Rb, heightAt, wobAt });
      if (mon) monasteries.push({ id: mon, x: px, z: pz, y: topFlat, Rb, deg });
    }
    // far ranges all the way round, low and hazy (lowest straight past each end of the court)
    for (const [R0, R1, hb, ha, seed] of [[300, 345, 4, 30, 2.1], [330, 358, 12, 44, 5.3]]) {
      const NS = 720, NR = 6, pos = [], col = [], idx = [], c = new THREE.Color(0x2a3048);
      for (let i = 0; i <= NS; i++) {
        const a = (i / NS) * TAU;
        const off = Math.min(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))));
        const calm = THREE.MathUtils.smoothstep(off, 0.25, 0.6) * 0.75 + 0.25;
        const crest = CLOUD_Y + hb + ha * calm * (0.35 + 0.65 * N.ridged(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 5));
        for (let j = 0; j <= NR; j++) {
          const t = j / NR, r = R0 + (R1 - R0) * t, prof = Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) * (1 - Math.max(0, t - 0.62) / 0.38 * 0.6);
          pos.push(Math.cos(a) * r, CLOUD_Y - 12 + (crest - CLOUD_Y + 12) * prof, Math.sin(a) * r);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      parts.push(g.toNonIndexed());
    }
    const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const m = stoneShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, fog: false }),
      { key: 'peak', tri: cliffTex, mean: 0.357, triScale: 0.035, triAmt: 0.7, bump: 1.2, mistY0: CLOUD_Y + 10, mistY1: CLOUD_Y - 4, mist: 0x2c3658, haze0: 140, haze1: 560 });
    root.add(new THREE.Mesh(geo, m));
  }

  /* ---------------- 6. CHEDIS — the great golden chedi, its four satellites, the neighbours' chedis ---------------- */
  function chediGeo(segs = 96) {
    const sq = (pts) => { const g = new THREE.LatheGeometry(V2(pts), 4); g.rotateY(Math.PI / 4); return g; };
    const Q = Math.SQRT2;
    const white = [], gold = [];
    // three square, stepped tiers with cornice lips
    white.push(sq([[0, 0], [7.0 * Q, 0], [7.0 * Q, 1.0], [7.15 * Q, 1.05], [7.15 * Q, 1.2], [6.3 * Q, 1.2], [6.3 * Q, 2.0], [6.42 * Q, 2.05], [6.42 * Q, 2.2], [5.6 * Q, 2.2], [5.6 * Q, 2.85], [5.7 * Q, 2.9], [5.7 * Q, 3.0], [0, 3.0]]));
    // round lotus mouldings, the bell, a square harmika, the ringed spire, banana-bud, finial
    gold.push(new THREE.LatheGeometry(V2([[0, 3.0], [5.0, 3.0], [5.15, 3.12], [5.15, 3.28], [4.9, 3.4], [4.85, 3.6], [5.0, 3.72], [5.0, 3.86], [4.72, 3.98], [4.7, 4.18], [4.84, 4.3], [4.84, 4.42], [4.6, 4.55],
      [4.75, 4.9], [4.95, 5.6], [5.02, 6.5], [4.92, 7.6], [4.62, 8.8], [4.1, 9.9], [3.35, 10.9], [2.5, 11.7], [1.85, 12.2], [1.6, 12.45], [0, 12.5]]), segs));
    gold.push(sq([[0, 12.45], [1.75 * Q, 12.45], [1.75 * Q, 12.6], [1.6 * Q, 12.7], [1.6 * Q, 13.8], [1.85 * Q, 13.9], [1.85 * Q, 14.1], [0, 14.1]]));
    const ring = [[0, 14.1], [1.15, 14.1]]; let y = 14.25, r = 1.15;
    for (let k = 0; k < 12; k++) { ring.push([r + 0.12, y], [r + 0.13, y + 0.1], [r + 0.08, y + 0.16], [r - 0.02, y + 0.2]); y += 0.4; r *= 0.9; }
    ring.push([r, y], [r * 1.25, y + 0.5], [r * 1.18, y + 1.2], [r * 0.75, y + 2.1], [r * 0.4, y + 3.0], [0.1, y + 3.6], [0.15, y + 3.7], [0.06, y + 4.6], [0.1, y + 4.75], [0.03, y + 6.2], [0, y + 6.6]);
    gold.push(new THREE.LatheGeometry(V2(ring), Math.max(24, segs / 2)));
    // a band of upturned lotus petals round the foot of the bell
    const np = Math.round(segs / 2);
    for (let k = 0; k < np; k++) {
      const p = new THREE.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2); p.scale(0.24, 0.5, 0.1); p.rotateX(-0.28);
      p.translate(0, 0, 4.72); p.rotateY((k / np) * TAU); p.translate(0, 4.45, 0); gold.push(p);
    }
    return { white: merge(white), gold: merge(gold) };
  }
  {
    const big = chediGeo(128);
    put(M.plaster, at(big.white, 0, 0.2, cz));
    put(M.gold, at(big.gold, 0, 0.2, cz));
    for (const [x, z] of [[-9, cz - 9], [9, cz - 9], [-9, cz + 9], [9, cz + 9]]) { put(M.plaster, at(big.white, x, 0.2, z, 0, 0, 0, 0.28)); put(M.gold, at(big.gold, x, 0.2, z, 0, 0, 0, 0.28)); }
    // the platform (High's plaster box) with a gilded edge band and a row of little lamps round its rim
    put(M.plaster, at(new THREE.BoxGeometry(22, 2.4, 22), 0, -1.0, cz));
    put(M.gold, at(new THREE.BoxGeometry(22.3, 0.12, 22.3), 0, 0.2, cz));
    const lampsG = [];
    for (let k = 0; k < 60; k++) { const t = k / 60, side = Math.floor(t * 4), u = (t * 4 - side) * 21 - 10.5; const [lx, lz] = [[u, -10.8], [10.8, u], [-u, 10.8], [-10.8, -u]][side]; lampsG.push(new THREE.SphereGeometry(0.12, 8, 6).translate(lx, 0.42, cz + lz)); }
    put(M.dim, merge(lampsG));
    // a soft warm halo behind the spire (sideways from both match cameras)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, 256), color: 0xffb870, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(0, 13, cz + 2); halo.scale.set(40, 40, 1); root.add(halo);
  }

  /* ---------------- 7. VIHARNS — the two shrine halls on the upper court (same spots as High's boxes) ---------------- */
  function viharn() {
    const g = { pl: [], ro: [], rg: [], gd: [], gl: [], rd: [], st: [] };
    const L = 6, D = 4;
    g.st.push(new THREE.BoxGeometry(L + 1.0, 0.45, D + 1.0).translate(0, 0.0, 0));
    g.pl.push(new THREE.BoxGeometry(L, 2.6, D).translate(0, 1.5, 0));
    g.rd.push(new THREE.BoxGeometry(L + 0.06, 0.18, D + 0.06).translate(0, 0.35, 0));
    g.gl.push(new THREE.PlaneGeometry(1.1, 1.75).rotateY(Math.PI).translate(0, 1.1, -D / 2 - 0.02));
    for (const x of [-1.9, 1.9]) g.gl.push(new THREE.PlaneGeometry(0.55, 0.85).rotateY(Math.PI).translate(x, 1.6, -D / 2 - 0.02));
    g.gd.push(new THREE.BoxGeometry(1.4, 0.16, 0.08).translate(0, 2.05, -D / 2 - 0.05), new THREE.BoxGeometry(0.12, 1.9, 0.08).translate(-0.62, 1.1, -D / 2 - 0.05), new THREE.BoxGeometry(0.12, 1.9, 0.08).translate(0.62, 1.1, -D / 2 - 0.05));
    let eY = 2.75, half = D / 2 + 0.9, ridge = 4.9;
    for (let t = 0; t < 2; t++) {
      const x0 = -L / 2 - 0.9 + t * 0.7, x1 = L / 2 + 0.9 - t * 0.7;
      for (const s of [-1, 1]) {
        const q = new THREE.BufferGeometry();
        q.setAttribute('position', new THREE.Float32BufferAttribute([x0, eY, s * half, x1, eY, s * half, x1, ridge, 0, x0, eY, s * half, x1, ridge, 0, x0, ridge, 0], 3));
        q.computeVertexNormals();
        (t === 1 ? g.ro : g.rg).push(q);
        g.gd.push(new THREE.BoxGeometry(x1 - x0, 0.08, 0.1).translate((x0 + x1) / 2, eY, s * half));
      }
      for (const x of [x0, x1]) {
        const ped = new THREE.BufferGeometry();
        ped.setAttribute('position', new THREE.Float32BufferAttribute([x + (x < 0 ? 0.25 : -0.25), eY, -half + 0.3, x + (x < 0 ? 0.25 : -0.25), eY, half - 0.3, x + (x < 0 ? 0.25 : -0.25), ridge - 0.1, 0], 3));
        ped.computeVertexNormals(); g.rd.push(ped);
        for (const s of [-1, 1]) g.gd.push(new THREE.BoxGeometry(0.1, 0.14, Math.hypot(half, ridge - eY) + 0.15).rotateX(s * Math.atan2(ridge - eY, half)).translate(x, (eY + ridge) / 2, s * half / 2));
        const dir = x < 0 ? -1 : 1;
        g.gd.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, ridge, 0), new THREE.Vector3(x + dir * 0.15, ridge + 0.4, 0), new THREE.Vector3(x - dir * 0.05, ridge + 0.75, 0), new THREE.Vector3(x - dir * 0.3, ridge + 0.7, 0)]), 10, 0.055, 6));
        for (const s of [-1, 1]) g.gd.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, eY + 0.05, s * half), new THREE.Vector3(x + dir * 0.1, eY + 0.3, s * (half + 0.15)), new THREE.Vector3(x, eY + 0.45, s * (half + 0.05))]), 6, 0.045, 5));
      }
      g.gd.push(new THREE.BoxGeometry(x1 - x0, 0.1, 0.12).translate((x0 + x1) / 2, ridge + 0.04, 0));
      eY += 0.75; half -= 0.95; ridge += 0.55;
    }
    const out = {}; for (const k of Object.keys(g)) if (g[k].length) out[k] = merge(g[k]); return out;
  }
  {
    const v = viharn();
    const MM = { pl: M.plaster, ro: M.red, rg: M.green, gd: M.gold, gl: M.dim, rd: M.red, st: M.wall };
    for (const sx of [-1, 1]) for (const [k, geo] of Object.entries(v)) put(MM[k], at(geo, sx * (TX - 6), 0.0, TZ + 6));
  }

  /* ---------------- 8. NAGA BALUSTRADES — smooth scaled serpents down the stairs, five-headed rearing hoods at the top ---------------- */
  {
    const steps = 72, drop = 0.42, run = 0.8, W = 4.4, sz0 = -TZ;
    const nagaM = new THREE.MeshStandardMaterial({ color: 0x2f8a5a, roughness: 0.38, metalness: 0.25, emissive: 0x05140c });
    nagaM.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 u = vUv * vec2(400.0, 10.0); u.x += floor(u.y) * 0.5; vec2 f = fract(u) - 0.5;
          float sc = smoothstep(0.42, 0.28, length(f * vec2(1.0, 1.25)));
          float belly = smoothstep(0.62, 0.72, abs(fract(vUv.y + 0.25) - 0.5) * 2.0);
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.65 + 0.45 * sc), vec3(0.86, 0.66, 0.3), belly * 0.85); }`);
      sh.vertexShader = sh.vertexShader;
    };
    nagaM.defines = { USE_UV: '' };
    nagaM.customProgramCacheKey = () => 'nagaU';
    const bodies = [], fins = [];
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= steps; k += 2) pts.push(new THREE.Vector3(s * (W / 2 + 0.35), 0.4 - k * drop, sz0 - 0.4 - k * run));
      const curve = new THREE.CatmullRomCurve3(pts);
      bodies.push(new THREE.TubeGeometry(curve, 300, 0.32, 20));
      // a crest of small gilded flame fins along the spine
      for (let i = 0; i < 110; i++) {
        const t = (i + 0.5) / 110, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
        const f = new THREE.ConeGeometry(0.09, 0.34, 6); f.rotateX(-0.6); f.translate(0, 0.17, 0);
        _o.position.set(p.x, p.y + 0.28, p.z); _o.rotation.set(Math.atan2(-tg.y, Math.hypot(tg.x, tg.z)) * 0, 0, 0); _o.lookAt(p.x + tg.x, p.y + 0.28 + tg.y, p.z + tg.z); _o.updateMatrix();
        fins.push(f.applyMatrix4(_o.matrix));
      }
      // the rearing neck (High's footprint) and a fan of five heads
      const hx = s * (W / 2 + 0.35), hz = sz0 + 0.2;
      const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(hx, 0.2, hz - 0.6), new THREE.Vector3(hx, 0.9, hz - 0.1), new THREE.Vector3(hx, 2.0, hz), new THREE.Vector3(hx, 2.45, hz + 0.08)]);
      bodies.push(new THREE.TubeGeometry(neck, 24, 0.36, 20));
      bodies.push(new THREE.SphereGeometry(0.36, 20, 10, 0, TAU, 0, Math.PI / 2).translate(hx, 2.45, hz + 0.08));
      for (let i = -2; i <= 2; i++) {
        const ax = hx + i * 0.3, ay = 2.75 - Math.abs(i) * 0.2, az = hz + 0.15 + Math.abs(i) * 0.02;
        const head = new THREE.SphereGeometry(0.17, 16, 10); head.scale(0.9, 0.8, 1.5); head.rotateX(-0.35);
        bodies.push(head.translate(ax, ay, az + 0.12));
        const nk = new THREE.CylinderGeometry(0.1, 0.13, 0.5, 10); nk.rotateZ(-i * 0.22); bodies.push(nk.translate(ax - i * 0.05, ay - 0.25, az));
        const crown = new THREE.ConeGeometry(0.08, 0.42, 8); crown.rotateX(-0.25); crown.rotateZ(-i * 0.25);
        fins.push(crown.translate(ax + i * 0.03, ay + 0.3, az));
        for (const e of [-1, 1]) fins.push(new THREE.SphereGeometry(0.035, 6, 4).translate(ax + e * 0.1, ay + 0.06, az + 0.28));
      }
      // the gilded hood fan behind the heads
      const fan = new THREE.CylinderGeometry(0.95, 0.95, 0.06, 28, 1, false, -Math.PI / 2 - 0.95, 1.9); fan.rotateX(Math.PI / 2); fan.rotateZ(Math.PI);
      fins.push(fan.translate(hx, 2.15, hz - 0.08));
    }
    root.add(new THREE.Mesh(merge(bodies), nagaM));
    put(M.gold, merge(fins));
  }

  /* ---------------- 9. NEIGHBOURING MONASTERIES on three peaks — small floodlit chedis, roofs, lit windows, lantern paths ---------------- */
  const farLights = [];                                   // [x, y, z, warm, size]
  {
    const small = chediGeo(48);
    const halos = [];
    for (const m of monasteries) {
      const s = 0.55;
      put(M.plaster, at(small.white, m.x, m.y - 0.5, m.z, 0, 0, 0, s));
      put(M.gold, at(small.gold, m.x, m.y - 0.5, m.z, 0, 0, 0, s));
      // a hall or two beside it
      const out = Math.atan2(-m.z, -m.x);               // facing the summit
      const v = viharn();
      for (const [k, geo] of Object.entries(v)) if (k !== 'st') put({ pl: M.plaster, ro: M.red, rg: M.green, gd: M.gold, gl: M.dim, rd: M.red }[k], at(geo, m.x + Math.cos(out + 1.2) * 9, m.y - 0.3, m.z + Math.sin(out + 1.2) * 9, -out + Math.PI / 2, 0, 0, 1.3));
      for (let k = 0; k < 26; k++) { const a = R() * TAU, rr = 5 + R() * 9; farLights.push([m.x + Math.cos(a) * rr, m.y + 0.6 + R() * 1.5, m.z + Math.sin(a) * rr, R() < 0.85, 1]); }
      // a lantern path zig-zagging down the slope toward the clouds
      const peak = peakSurf.find((p) => Math.abs(p.px - m.x) < 1 && Math.abs(p.pz - m.z) < 1);
      for (let k = 0; k < 60; k++) {
        const t = k / 60, r = 4 + t * m.Rb * 0.55, a = out + 0.6 * Math.sin(t * 18);
        const y = peak.heightAt(r, a), w = peak.wobAt(a);
        if (y < CLOUD_Y + 4) break;
        farLights.push([m.x + Math.cos(a) * r * w, Math.min(m.y, y) + 0.8, m.z + Math.sin(a) * r * w, true, 0.8]);
      }
      halos.push([m.x, m.y + 6, m.z]);
    }
    const hm = new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffa858, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const [x, y, z] of halos) { const h = new THREE.Sprite(hm); h.position.set(x, y, z); h.scale.set(34, 34, 1); root.add(h); }
  }
  {
    const pos = [], seed = [], col = [], sz = [];
    for (const [x, y, z, warm, s] of farLights) { pos.push(x, y, z); seed.push(R()); col.push(1, warm ? 0.7 + R() * 0.14 : 0.95, warm ? 0.36 + R() * 0.14 : 0.88); sz.push(s); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('sz', new THREE.Float32BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; attribute float sz; varying float vA; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.7 + 0.3 * sin(uTime * (0.5 + seed * 1.5) + seed * 50.0); gl_PointSize = max(1.6, sz * 420.0 / -mv.z); }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vC * a * 1.4, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
  }

  /* ---------------- build the merged static pieces ---------------- */
  for (const [mat, list] of B) {
    const mesh = new THREE.Mesh(merge(list), mat);
    mesh.castShadow = mat === M.wall || mat === M.plaster; mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------- 10. NIGHT LIFE ---------------- */
  // a candle procession: monks in saffron climbing the naga stairs out of the clouds, each carrying a flame
  {
    const steps = 72, NMONK = 30, path = (u) => { const k = (1 - u) * (steps - 1); return [-TZ - 0.4 - k * 0.8, -0.3 - k * 0.42 + 0.21]; };
    const pg = personGeometry({ robe: true });
    const body = merge([pg.body, pg.head]);
    const colA = new Float32Array(body.attributes.position.count * 3);
    const nb = pg.body.index ? pg.body.toNonIndexed().attributes.position.count : pg.body.attributes.position.count;
    for (let i = 0; i < body.attributes.position.count; i++) { const c = new THREE.Color(i < nb ? 0xd8701a : 0x8c5e40); colA.set([c.r, c.g, c.b], i * 3); }
    body.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    const mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: 0x2a1004 });
    const im = new THREE.InstancedMesh(body, mm, NMONK);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; root.add(im);
    const monks = [];
    for (let i = 0; i < NMONK; i++) monks.push({ u: i / NMONK, side: i % 2 ? 1 : -1, ph: R() * TAU });
    const fpos = new Float32Array(NMONK * 3), fa = new Float32Array(NMONK);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fg.setAttribute('alpha', new THREE.BufferAttribute(fa, 1));
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float alpha; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = alpha * (0.8 + 0.2 * sin(uTime * 13.0 + position.z * 7.0) * sin(uTime * 7.3 + position.x * 3.0)); gl_PointSize = max(2.0, 30.0 / -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.72, 0.35) * a * 2.2, a); }` });
    const fp = new THREE.Points(fg, fm); fp.frustumCulled = false; root.add(fp);
    ticks.push((t) => {
      monks.forEach((m, i) => {
        const u = (m.u + t * 0.003) % 1;                         // ~5.5 min from the clouds to the top
        const [z, y] = path(u);
        // they turn back into the mist before the top steps (the terrace itself stays clear)
        const vis = THREE.MathUtils.smoothstep(u, 0.0, 0.1) * (1 - THREE.MathUtils.smoothstep(u, 0.9, 0.94));
        const x = m.side * 1.05;
        _o.position.set(x, y + Math.abs(Math.sin(t * 2.4 + m.ph)) * 0.04, z); _o.rotation.set(0, Math.PI, 0); _o.scale.setScalar(vis < 0.02 ? 0 : 0.95); _o.updateMatrix();
        im.setMatrixAt(i, _o.matrix);
        fpos.set([x + 0.22 * m.side * -1, y + 1.05, z + 0.25], i * 3); fa[i] = vis;
      });
      im.instanceMatrix.needsUpdate = true; fg.attributes.position.needsUpdate = true; fg.attributes.alpha.needsUpdate = true;
    });
  }
  // sky lanterns (khom loi) drifting up far off to the sides, from the neighbouring monasteries
  {
    const n = 54, pos = new Float32Array(n * 3), sd = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const m = monasteries[i % monasteries.length], a = R() * TAU, r = 6 + R() * 20;
      pos.set([m.x + Math.cos(a) * r, m.y + 2, m.z + Math.sin(a) * r], i * 3); sd[i * 2] = R(); sd[i * 2 + 1] = (0.6 + R() * 0.8) * Math.sign(m.z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute vec2 sd; varying float vA;
        void main(){ float t = fract(uTime * 0.006 * abs(sd.y) + sd.x);
          vec3 p = position + vec3(sin(uTime * 0.05 + sd.x * 40.0) * 6.0, t * 95.0, cos(uTime * 0.04 + sd.x * 20.0) * 6.0 + sign(sd.y) * t * 26.0);   // drifting away from the ±x axis
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.6, 1.0, t)) * (0.75 + 0.25 * sin(uTime * 3.0 + sd.x * 60.0));
          gl_PointSize = max(1.5, 380.0 / -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q * vec2(1.0, 0.8)); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a * 1.8, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
  }
  // mist curling round the cliffs below the terrace walls (hidden from the match cameras by the walls themselves)
  {
    const n = 90, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x, z, y;
      for (let tries = 0; tries < 20; tries++) { const a = R() * TAU, r = 28 + R() * 40; x = Math.cos(a) * r * 1.1; z = Math.sin(a) * r + (Math.sin(a) > 0 ? 8 : 0); y = -12 - R() * 26; if (summitAt(x, z) < y + 2) break; }
      pos.set([x, y, z], i * 3); sd[i] = R();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uMap: { value: softTexture(0, 64) } },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float t = fract(uTime * 0.012 + seed);
          vec3 p = position + vec3(sin(uTime * 0.04 + seed * 30.0) * 5.0, t * 9.0, cos(uTime * 0.035 + seed * 20.0) * 5.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = sin(t * 3.14159) * 0.14; gl_PointSize = min(900.0, (10.0 + seed * 8.0) * 900.0 / -mv.z); }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.42, 0.48, 0.68) * a, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
  }
  // moths fluttering round the terrace lanterns
  {
    const per = 3, n = lamps.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const l = lamps[Math.floor(i / per)]; pos.set([l.x, l.y, l.z], i * 3); sd[i] = R(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float a = uTime * (1.7 + seed * 1.3) + seed * 30.0;
          vec3 p = position + vec3(cos(a) * 0.4, sin(uTime * 2.3 + seed * 9.0) * 0.16 + sin(a * 2.7) * 0.07, sin(a * 1.3) * 0.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.25 * sin(uTime * 23.0 + seed * 50.0); gl_PointSize = 24.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
  }
  // incense curling up in front of the two viharns
  {
    const src = [];
    for (const sx of [-1, 1]) for (const dx of [-0.5, 0.5]) src.push([sx * (TX - 6) + dx, 0.9, TZ + 3.6]);
    const per = 8, n = src.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set(src[Math.floor(i / per)], i * 3); sd[i] = R(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uMap: { value: softTexture(0, 64) } },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float life = 7.0; float t = mod(uTime + seed * life, life) / life;
          vec3 p = position + vec3(sin(uTime * 0.7 + seed * 20.0 + t * 4.0) * 0.25 * t, t * 2.8, cos(uTime * 0.5 + seed * 13.0 + t * 3.0) * 0.25 * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.15, t) * (1.0 - t) * 0.07; gl_PointSize = (0.25 + t * 0.9) * 700.0 / -mv.z; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.82, 0.8, 0.86) * a, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
    // a candle rack glowing at the foot of each
    const cr = [];
    for (const [x, y, z] of src) cr.push(new THREE.BoxGeometry(0.5, 0.05, 0.12).translate(x, y - 0.05, z));
    root.add(new THREE.Mesh(merge(cr), M.glow));
  }

  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update };
}
