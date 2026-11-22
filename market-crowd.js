// NIGHT MARKET ALLEY — ULTRA crowd. Smooth, jointed figures drawn with instancing (one draw call per body variant) and
// posed entirely in the vertex shader, so a couple of hundred people cost almost nothing on the CPU:
//   mode 0  browse   — weight shifts, looks over the goods, now and then reaches out to pick something up
//   mode 1  walk     — ping-pongs along a path (local +z) with a proper gait (legs locked to distance → no foot sliding)
//                      and an unhurried turn at each end
//   mode 2  cook     — vendor at a wok / pot: stirring arm, the other hand on the handle, head down
//   mode 3  sit      — diner on a plastic stool: knees up, elbows on the table, a spoon raised now and then
//   mode 4  phone    — standing, looking down at a phone (or chatting, hand to the ear)
// Per instance: mode, phase, speed, path length + skin / shirt / trousers / hair colours. Bodies vary in build through the
// instance matrix (width / height), and there are three body variants (short hair; long hair + shoulder bag; cap).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// bones: 0 body, 1 head, 2/3 thigh L/R, 4/5 shin L/R, 6/7 upper arm L/R, 8/9 forearm L/R
// parts: 0 skin, 1 shirt, 2 trousers, 3 hair, 4 shoes, 5 accent (bag / cap)
function tag(geo, bone, part) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = bone; a[i * 2 + 1] = part; }
  g.setAttribute('aBP', new THREE.BufferAttribute(a, 2));
  return g;
}
let LO = false;      // low-detail build for far-away figures
const S = (n, lo) => (LO ? lo : n);
const cap = (r, len, x, y, z, rx = 0, rz = 0, sx = 1, sz = 1) => {
  const g = new THREE.CapsuleGeometry(r, len, 1, LO ? 5 : 7);
  g.scale(sx, 1, sz); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); return g;
};

export function figureGeometry(variant = 0, lo = false) {
  LO = lo;
  const P = [];
  const female = variant === 1, capHat = variant === 2;
  for (const s of [1, -1]) {
    const L = s > 0 ? 0 : 1;                      // +x is the figure's left (it faces +z)
    const hx = s * 0.092;
    P.push(tag(cap(0.074, 0.3, hx, 0.69, 0, 0, 0, 1, 1), 2 + L, 2));                                   // thigh
    P.push(tag(cap(0.056, 0.34, hx, 0.3, 0.0), 4 + L, 2));                // shin
    { const sh = new THREE.CapsuleGeometry(0.048, 0.12, 1, S(6, 4)); sh.rotateX(Math.PI / 2); sh.scale(1.05, 0.8, 1); sh.translate(hx, 0.045, 0.035); P.push(tag(sh, 4 + L, 4)); }   // shoe
    const ax = s * 0.205;
    P.push(tag(cap(0.05, 0.1, ax, 1.32, 0, 0, s * 0.05), 6 + L, 1));                                    // sleeve
    P.push(tag(cap(0.041, 0.2, ax + s * 0.008, 1.17, 0, 0, s * 0.05), 6 + L, 0));                        // upper arm (skin below sleeve)
    P.push(tag(cap(0.036, 0.2, ax + s * 0.012, 0.96, 0.01), 8 + L, 0));                                // forearm
    { const h = new THREE.SphereGeometry(0.042, S(6, 4), S(4, 3)); h.scale(0.8, 1.15, 0.6); h.translate(ax + s * 0.014, 0.8, 0.012); P.push(tag(h, 8 + L, 0)); }   // hand
    { const sh = new THREE.SphereGeometry(0.06, S(8, 5), S(6, 4)); sh.translate(ax - s * 0.02, 1.365, 0); P.push(tag(sh, 0, 1)); }   // shoulder
  }
  // hips + torso (lathe, flattened front-to-back), neck, head, hair
  { const h = new THREE.SphereGeometry(0.16, S(10, 6), S(6, 4)); h.scale(1.1, 0.72, 0.78); h.translate(0, 0.9, 0); P.push(tag(h, 0, 2)); }
  {
    const prof = [[0.001, 0.86], [0.15, 0.9], [0.142, 0.98], [0.135, 1.06], [0.15, 1.16], [0.17, 1.27], [0.175, 1.35], [0.15, 1.42], [0.07, 1.46], [0.001, 1.465]];
    const t = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * (female ? 0.95 : 1), y)), S(10, 6));
    t.scale(1, 1, female ? 0.66 : 0.62);
    if (female) { const p = t.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 1.17 && y < 1.36 && p.getZ(i) > 0) p.setZ(i, p.getZ(i) * 1.18); } }
    P.push(tag(t, 0, 1));
  }
  P.push(tag(new THREE.CylinderGeometry(0.042, 0.048, 0.12, S(8, 5)).translate(0, 1.49, 0), 1, 0));
  { const h = new THREE.SphereGeometry(0.104, S(12, 7), S(9, 5)); h.scale(0.9, 1.06, 1.0); h.translate(0, 1.6, 0.012); P.push(tag(h, 1, 0)); }
  if (!LO) {
    { const n = new THREE.SphereGeometry(0.018, 5, 3); n.scale(0.8, 1, 1.1); n.translate(0, 1.59, 0.112); P.push(tag(n, 1, 0)); }   // nose
    for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.02, 5, 3); e.scale(0.5, 1, 0.8); e.translate(s * 0.094, 1.6, 0.0); P.push(tag(e, 1, 0)); }   // ears
    for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.009, 5, 3); e.scale(1.1, 0.75, 0.6); e.translate(s * 0.033, 1.612, 0.099); P.push(tag(e, 1, 4)); }   // eyes
  }
  {
    const hair = new THREE.SphereGeometry(0.112, S(12, 7), S(6, 3), 0, Math.PI * 2, 0, Math.PI * (female ? 0.62 : 0.5));
    hair.rotateX(-0.42); hair.scale(0.93, 1.04, 1.04); hair.translate(0, 1.615, 0.0);
    P.push(tag(hair, 1, 3));
    if (female) {
      const back = new THREE.CapsuleGeometry(0.075, 0.2, S(2, 1), S(8, 5)); back.scale(1.25, 1, 0.55); back.translate(0, 1.47, -0.075); P.push(tag(back, 1, 3));
      const bag = new THREE.BoxGeometry(0.06, 0.24, 0.2); bag.translate(0.22, 0.98, -0.02); P.push(tag(bag, 0, 5));
      const strap = new THREE.BoxGeometry(0.02, 0.46, 0.02); strap.rotateZ(0.5); strap.translate(0.1, 1.24, 0.0); P.push(tag(strap, 0, 5));
    }
  }
  if (capHat) {
    const c = new THREE.SphereGeometry(0.116, S(14, 8), S(6, 3), 0, Math.PI * 2, 0, Math.PI * 0.45); c.translate(0, 1.625, 0); P.push(tag(c, 1, 5));
    const b = new THREE.CylinderGeometry(0.09, 0.09, 0.012, S(10, 6), 1, false, -Math.PI / 2, Math.PI); b.scale(1, 1, 1.1); b.translate(0, 1.66, 0.09); P.push(tag(b, 1, 5));
  }
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  return g;
}

const SHADER_HEAD = `
uniform float uTime;
attribute vec2 aBP;
attribute vec4 iA;
attribute vec3 iSkin; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iHair;
varying vec3 vCol;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void rotAbout(inout vec3 p, inout vec3 n, vec3 piv, mat3 R) { p = R * (p - piv) + piv; n = R * n; }
vec3 gPos; vec3 gNrm;
void poseFigure() {
  vec3 p = position, n = normal;
  float bone = aBP.x, mode = iA.x, ph = iA.y;
  float t = uTime + ph * 23.0;
  float thL = 0.0, thR = 0.0, knL = 0.0, knR = 0.0, shL = 0.0, shR = 0.0, abL = 0.0, abR = 0.0, elL = -0.12, elR = -0.12;
  float hYaw = 0.0, hPitch = 0.0, lean = 0.0, twist = 0.0;
  vec3 root = vec3(0.0); float yaw = 0.0;
  if (mode < 0.5) {                                   // browse
    float look = sin(t * 0.31) * 0.6 + sin(t * 0.83) * 0.2;
    hYaw = look; hPitch = 0.28 + sin(t * 0.47) * 0.08; lean = 0.08 + 0.04 * sin(t * 0.21);
    float shift = sin(t * 0.43);
    root.x = shift * 0.025; twist = shift * 0.05;
    thL = 0.04 * shift; thR = -0.04 * shift; knL = 0.06 + 0.06 * max(shift, 0.0); knR = 0.06 + 0.06 * max(-shift, 0.0);
    float reach = smoothstep(0.55, 0.95, sin(t * 0.19 + ph * 3.0));
    shR = -1.05 * reach; elR = -0.12 - 0.55 * reach; abR = 0.0;
    shL = -0.15; elL = -0.6 - 0.2 * reach;            // other hand holding a bag / phone at the waist
    abL = 0.05; abR = 0.05;
  } else if (mode < 1.5) {                            // walk (ping-pong along local +z)
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
    shL = -thL * 0.75; shR = -thR * 0.75; elL = -0.2 - 0.2 * amp; elR = -0.2 - 0.2 * amp; abL = 0.07; abR = 0.07;
    root.y = -abs(cos(phi)) * 0.025 * amp; root.z = s;
    twist = sin(phi) * 0.08 * amp; lean = 0.04;
    hYaw = sin(t * 0.37) * 0.25; hPitch = 0.05;
  } else if (mode < 2.5) {                            // cook
    float st = t * 4.2;
    shR = -0.95 + sin(st) * 0.18; abR = 0.15 + cos(st) * 0.12; elR = -0.95 + cos(st) * 0.22;
    shL = -0.7; elL = -1.1; abL = -0.1;
    lean = 0.18; hPitch = 0.42; hYaw = sin(t * 0.3) * 0.25; twist = sin(st) * 0.04;
    knL = 0.05; knR = 0.08;
  } else if (mode < 3.5) {                            // sit
    root.y = -0.42;
    thL = -1.45; thR = -1.38; knL = 1.4; knR = 1.5;
    float eat = smoothstep(0.6, 0.95, sin(t * 0.55 + ph * 5.0));
    shL = -0.75; elL = -0.9; abL = -0.1;
    shR = -0.8 - 0.35 * eat; elR = -0.85 - 0.9 * eat; abR = 0.1;
    lean = 0.2 - 0.08 * eat; hPitch = 0.35 - 0.25 * eat; hYaw = sin(t * 0.27) * 0.3 * (1.0 - eat);
  } else {                                            // phone / chat
    float call = step(0.5, fract(ph * 7.0));
    shR = mix(-0.55, -0.35, call); elR = mix(-1.45, -2.3, call); abR = mix(0.05, 0.35, call);
    shL = mix(-0.4, -0.05, call); elL = mix(-1.2, -0.2, call);
    hPitch = mix(0.5, 0.05, call); hYaw = mix(0.0, sin(t * 0.4) * 0.5, call);
    float shift = sin(t * 0.35); root.x = shift * 0.02; knL = 0.05 + 0.08 * max(shift, 0.0); knR = 0.05 + 0.08 * max(-shift, 0.0);
  }
  // limbs (child joint first, then parent)
  if (bone > 3.5 && bone < 5.5) { bool l = bone < 4.5; rotAbout(p, n, vec3(l ? 0.092 : -0.092, 0.5, 0.0), rotX(l ? knL : knR)); }
  if (bone > 1.5 && bone < 5.5) { bool l = (bone < 2.5) || (bone > 3.5 && bone < 4.5); rotAbout(p, n, vec3(l ? 0.092 : -0.092, 0.88, 0.0), rotX(l ? thL : thR)); }
  if (bone > 7.5) { bool l = bone < 8.5; rotAbout(p, n, vec3(l ? 0.215 : -0.215, 1.07, 0.0), rotX(l ? elL : elR)); }
  if (bone > 5.5) { bool l = (bone < 6.5) || (bone > 7.5 && bone < 8.5); rotAbout(p, n, vec3(l ? 0.2 : -0.2, 1.37, 0.0), rotZ(l ? abL : -abR) * rotX(l ? shL : shR)); }
  if (bone > 0.5 && bone < 1.5) rotAbout(p, n, vec3(0.0, 1.47, 0.0), rotY(hYaw) * rotX(hPitch));
  if (bone < 1.5 || bone > 5.5) rotAbout(p, n, vec3(0.0, 0.9, 0.0), rotY(twist) * rotX(lean));
  // whole body: turn, then step along the path
  rotAbout(p, n, vec3(0.0), rotY(yaw));
  gPos = p + root; gNrm = n;
  // colour by part
  float part = aBP.y;
  vCol = part < 0.5 ? iSkin : part < 1.5 ? iShirt : part < 2.5 ? iPants : part < 3.5 ? iHair : part < 4.5 ? vec3(0.06, 0.055, 0.05) : iShirt * 0.45 + vec3(0.12, 0.08, 0.05);
}
`;

/** spots: [{ x, y, z, ry, mode, phase, speed, len, sx, sy, skin, shirt, pants, hair, variant }] → Group of InstancedMeshes */
export function makeCrowd(spots, uTime, lightPatch) {
  const grp = new THREE.Group(); grp.name = 'market-crowd';
  const o = new THREE.Object3D();
  // groups: body variant × detail; the far (low-detail) figures are split by end of the street so the end behind each
  // match camera is frustum-culled
  for (let v = 0; v < 9; v++) {
    const lo = v >= 3, end = v < 3 ? 0 : v < 6 ? -1 : 1;
    const list = spots.filter((s) => s.variant === v % 3 && !!s.far === lo && (!lo || Math.sign(s.x) === end));
    if (!list.length) continue;
    const geo = figureGeometry(v % 3, lo);
    const n = list.length;
    const A = new Float32Array(n * 4), sk = new Float32Array(n * 3), sh = new Float32Array(n * 3), pa = new Float32Array(n * 3), ha = new Float32Array(n * 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
    const U = { uTime };
    mat.onBeforeCompile = (shd) => {
      Object.assign(shd.uniforms, U);
      shd.vertexShader = SHADER_HEAD + shd.vertexShader
        .replace('#include <beginnormal_vertex>', 'poseFigure();\nvec3 objectNormal = gNrm;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      shd.fragmentShader = 'varying vec3 vCol;\n' + shd.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vCol, opacity );');
      if (lightPatch) lightPatch(shd);
    };
    mat.customProgramCacheKey = () => 'mkCrowd';
    const im = new THREE.InstancedMesh(geo, mat, n);
    const c = new THREE.Color();
    list.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z); o.rotation.set(0, s.ry, 0); o.scale.set(s.sx, s.sy, s.sx * 0.98); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      A.set([s.mode, s.phase, s.speed || 1, s.len || 1], i * 4);
      sk.set(c.set(s.skin).toArray(), i * 3); sh.set(c.set(s.shirt).toArray(), i * 3); pa.set(c.set(s.pants).toArray(), i * 3); ha.set(c.set(s.hair).toArray(), i * 3);
    });
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    geo.setAttribute('iSkin', new THREE.InstancedBufferAttribute(sk, 3));
    geo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(sh, 3));
    geo.setAttribute('iPants', new THREE.InstancedBufferAttribute(pa, 3));
    geo.setAttribute('iHair', new THREE.InstancedBufferAttribute(ha, 3));
    im.computeBoundingSphere();
    im.boundingSphere.radius += 22;            // walkers stray up to ~20 m from their start
    grp.add(im);
  }
  return grp;
}
