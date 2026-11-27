// LOTUS POND — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on Ultra.
// It replaces the pond's low-poly pieces (`lite` in pond.js: water, lotus, bridges, salas, chedis, willows, frangipani, the
// fake lamp streaks, the candle boats + mist) with a lotus pond in full bloom on a moonlit night:
//  • mirror-dark water: a real planar reflection of the salas, bridges, lamps, willows, hills and moon, softly rippled and
//    smeared into streaks, see-through where you look down into it (the koi glide under the surface);
//  • lotus in bloom: cupped flowers of three rings of curved petals (white → pink tips) around a golden seed pod, glowing
//    softly from within; buds on tall stems; floating pads with veins; raised bowl-shaped lotus leaves;
//  • floating lotus lanterns (krathong) with candles and incense, drifting on slow loops, mirrored in the water;
//  • arched teak bridges (single planks, lacquered stringers, balustrades with lotus-bud finials, timber bents);
//  • two open Thai salas: lacquered columns with lotus capitals, naga brackets, a layered glazed roof (curved slopes,
//    telescoped gables, a skirt tier), carved pediments, bargeboards with bai raka fins, chofa + hang hong finials,
//    a painted ceiling and paper lanterns;
//  • detailed weeping willows (hanging leafy strands that sway) and frangipani in flower; island chedis;
//  • the world beyond: a moonlit white chedi ensemble behind each sala (kept calm: no floodlights on the ball's line),
//    floodlit golden chedis and a viharn off to the sides, three layers of hills with hilltop temples and village lights,
//    sky lanterns rising far away, a painted night sky (moon glow, the Milky Way) and the moon itself;
//  • mist drifting on the water, fireflies in the willows and reeds.
// GAMEPLAY RULE: nothing new on or over the court + free zone (nor on the spectators' walkway ring); everything bright
// stays ≥ ~17° off the axis of both match cameras (`offAxis`), so the band the ball flies through stays dark and calm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, rng, V3, enhance, softTexture } from './temple-ultra.js';
import { makeFireflies } from './life.js';

const REFL = 6;                          // layer: what the water mirrors
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const MOON_AZ = Math.atan2(-14, -7), MOON_EL = 0.5;      // same bearing as the night key light (main.js LIGHT_POS)

// is (x, z) far enough off the axis of both match cameras (at x = ±14.6 looking along ∓x) to carry something bright?
function offAxis(x, z, deg = 17) {
  const t = Math.tan((deg * Math.PI) / 180);
  for (const cx of [-14.6, 14.6]) { const fwd = cx < 0 ? x - cx : cx - x; if (fwd > 0 && Math.abs(z) < fwd * t) return false; }
  return true;
}

/* ---------------- geometry helpers ---------------- */
// replace zero / NaN normals (degenerate triangles) so no shader ever normalizes a zero vector
function fixNormals(g) {
  const n = g.attributes.normal; if (!n) return g;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i), l = Math.hypot(x, y, z);
    if (!(l > 1e-6)) n.setXYZ(i, 0, 1, 0); else if (Math.abs(l - 1) > 1e-3) n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}
// non-indexed copy with position / normal / uv / color (vertex colour `col` if given, white if it has none)
function vc(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  fixNormals(g);
  if (col !== undefined && col !== null) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    _c.set(col);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  } else if (!g.attributes.color) {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  }
  return g;
}
const mergeVC = (list) => mergeGeometries(list.map((g) => vc(g)));
// transformed copy (Euler order YXZ: tilt in local space, then yaw)
function T(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  return g.applyMatrix4(_o.matrix);
}
// a box from a to b (any direction), w × h cross-section
function beam(a, b, w, h, roll = 0) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.BoxGeometry(w, L, h);
  g.translate(0, L / 2, 0);
  if (L > 1e-6) g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.multiplyScalar(1 / L)));
  if (roll) g.rotateY(roll);
  g.translate(a.x, a.y, a.z);
  return g.toNonIndexed();
}
// tapered tube through `pts` (radius r0 → r1)
function taperTube(pts, r0, r1, tubular = 10, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position, n = g.attributes.normal, P = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, P);
    const r = r0 + (r1 - r0) * (i / tubular);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; p.setXYZ(k, P.x + n.getX(k) * r, P.y + n.getY(k) * r, P.z + n.getZ(k) * r); }
  }
  return g;
}
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
// a curved petal / leaf: base at the origin, growing up +y, cupped (edges toward -z), tip bending out (+z); colour base → tip
function petalGeo(len, wid, { cup = 0.5, bend = 0.15, segL = 5, segW = 4, base = 0xffffff, tip = 0xffffff, tipPow = 1.6, point = 0.7 } = {}) {
  const pos = [], col = [], uv = [], idx = [];
  const cb = new THREE.Color(base), ct = new THREE.Color(tip), cc = new THREE.Color();
  for (let i = 0; i <= segL; i++) {
    const u = i / segL, w = Math.max(wid * 0.05, wid * Math.pow(Math.max(Math.sin(Math.PI * (0.1 + 0.9 * u)), 0), point) * (1 - 0.2 * u));
    cc.copy(cb).lerp(ct, Math.pow(u, tipPow));
    for (let j = 0; j <= segW; j++) {
      const v = (j / segW) * 2 - 1;
      pos.push(v * w, u * len, -cup * v * v * w + bend * len * u * u);
      col.push(cc.r, cc.g, cc.b); uv.push(j / segW, u);
    }
  }
  for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) {
    const a = i * (segW + 1) + j, b = a + segW + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); fixNormals(g);
  return g.toNonIndexed();
}
// a ring of petals around the y axis, opened by `tilt` (0 = upright)
function petalRing(out, n, len, wid, tilt, r0, y0, rot, opts) {
  const p = petalGeo(len, wid, opts);
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU;
    const g = p.clone(); g.rotateX(tilt); g.translate(0, y0, r0); g.rotateY(a);
    out.push(g);
  }
}
// merge per material; meshes can join the mirror pass
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, { cast = false, receive = false, refl = true } = {}) {
      const out = [];
      for (const [mat, list] of m) {
        if (!list.length) continue;
        const mesh = new THREE.Mesh(mergeVC(list), mat); mesh.castShadow = cast; mesh.receiveShadow = receive;
        if (refl && !mat.userData.noRefl) mesh.layers.enable(REFL);
        parent.add(mesh); out.push(mesh);
      }
      m.clear();
      return out;
    },
  };
}
// instanced copies: items [x, y, z, ry, s, rx, rz, sy]
function inst(geo, mat, list, parent, { colors = null, refl = false, cast = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((it, i) => {
    const [x, y, z, ry = 0, s = 1, rx = 0, rz = 0, sy = s] = it;
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz, 'YXZ'); _o.scale.set(s, sy, s); _o.updateMatrix();
    im.setMatrixAt(i, _o.matrix);
    if (colors) im.setColorAt(i, colors(i, it));
  });
  im.computeBoundingSphere(); im.castShadow = cast;
  if (refl) im.layers.enable(REFL);
  parent.add(im);
  return im;
}

/* ---------------- painted textures ---------------- */
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// the night sky (equirect): deep blue, a moonlit glow, warm town glow low on the horizon off to the sides, stars, the Milky Way
function paintSky(R) {
  const W = 4096, H = 2048, w = 512, h = 256;
  const mx = Math.cos(MOON_EL) * Math.cos(MOON_AZ), my = Math.sin(MOON_EL), mz = Math.cos(MOON_EL) * Math.sin(MOON_AZ);
  const ramp = [[0, [36, 48, 86]], [0.05, [24, 33, 68]], [0.18, [14, 20, 46]], [0.45, [7, 10, 27]], [1, [3, 5, 14]]];
  const rampAt = (t) => { for (let i = 1; i < ramp.length; i++) if (t <= ramp[i][0]) { const k = (t - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0]); return ramp[i - 1][1].map((a, j) => a + (ramp[i][1][j] - a) * k); } return ramp[ramp.length - 1][1]; };
  const towns = [[0.95, 0.5], [-0.9, 0.45], [2.3, 0.6], [-2.25, 0.55], [1.6, 0.3], [-1.45, 0.35]];   // [azimuth, strength] — never along ±x
  const lo = document.createElement('canvas'); lo.width = w; lo.height = h;
  const lg = lo.getContext('2d'), img = lg.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const e = (0.5 - (j + 0.5) / h) * Math.PI, ce = Math.cos(e), se = Math.sin(e);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w - 0.5) * TAU, dx = ce * Math.cos(phi), dz = ce * Math.sin(phi);
      let c;
      if (e < 0) c = [9, 12, 22];
      else {
        c = rampAt(e / (Math.PI / 2)).slice();
        const a = Math.acos(Math.max(-1, Math.min(1, dx * mx + se * my + dz * mz)));
        const glow = 0.32 * Math.exp(-((a / 0.3) ** 2)) + 0.12 * Math.exp(-((a / 0.9) ** 2));
        c = [c[0] + 120 * glow, c[1] + 138 * glow, c[2] + 170 * glow];
        let tg = 0;
        for (const [az, k] of towns) { let d = Math.abs(phi - az); d = Math.min(d, TAU - d); tg += k * Math.exp(-((d / 0.3) ** 2)); }
        const low = Math.exp(-e / 0.05);
        c = [c[0] + 46 * tg * low, c[1] + 26 * tg * low, c[2] + 22 * tg * low];
      }
      const k = (j * w + i) * 4;
      img.data[k] = Math.min(255, c[0]); img.data[k + 1] = Math.min(255, c[1]); img.data[k + 2] = Math.min(255, c[2]); img.data[k + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lo, 0, 0, W, H);
  const px = (dx, dy, dz) => [(Math.atan2(dz, dx) / TAU + 0.5) * W, (0.5 - Math.asin(Math.max(-1, Math.min(1, dy))) / Math.PI) * H];
  // the Milky Way: a soft band of haze + dense faint stars along a great circle tilted across the sky (mostly toward ±z)
  const nrm = new THREE.Vector3(0.82, 0.38, 0.12).normalize(), ua = new THREE.Vector3(0, 1, 0).cross(nrm).normalize(), ub = nrm.clone().cross(ua);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const t = R() * TAU, off = (R() + R() + R() - 1.5) * 0.13;
    const d = ua.clone().multiplyScalar(Math.cos(t)).addScaledVector(ub, Math.sin(t)).addScaledVector(nrm, off).normalize();
    if (d.y < 0.04) continue;
    const [x, y] = px(d.x, d.y, d.z), r = 20 + R() * 52;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.03 * (1 - Math.abs(off) / 0.3) * Math.min(1, d.y * 5);
    gr.addColorStop(0, `rgba(150,160,200,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(150,160,200,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dark dust lanes along the band
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 160; i++) {
    const t = R() * TAU, off = (R() - 0.5) * 0.05;
    const d = ua.clone().multiplyScalar(Math.cos(t)).addScaledVector(ub, Math.sin(t)).addScaledVector(nrm, off).normalize();
    if (d.y < 0.1) continue;
    const [x, y] = px(d.x, d.y, d.z), r = 12 + R() * 28;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(5,7,16,0.16)'); gr.addColorStop(1, 'rgba(5,7,16,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'lighter';
  const star = (d, s, b, tint) => {
    if (d.y < 0.02) return;
    const [x, y] = px(d.x, d.y, d.z);
    const sx = s / Math.max(0.25, Math.sqrt(1 - d.y * d.y));       // equirect stretch toward the zenith
    const fade = Math.min(1, d.y * 8);
    g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${(b * fade).toFixed(3)})`;
    g.beginPath(); g.ellipse(x, y, sx, s, 0, 0, TAU); g.fill();
    if (b > 0.75 && s > 1.1) {
      const gr = g.createRadialGradient(x, y, 0, x, y, s * 4);
      gr.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${(0.25 * fade).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - s * 4 * sx / s, y - s * 4, s * 8 * sx / s, s * 8);
    }
  };
  const tints = [[255, 255, 255], [200, 215, 255], [255, 236, 210], [255, 214, 190]];
  for (let i = 0; i < 2600; i++) {
    const y = Math.pow(R(), 0.7), a = R() * TAU, r = Math.sqrt(1 - y * y);
    star(V3(r * Math.cos(a), y, r * Math.sin(a)), 0.5 + Math.pow(R(), 6) * 1.3, 0.3 + R() * 0.7, tints[Math.floor(R() * 4)]);
  }
  for (let i = 0; i < 2200; i++) {
    const t = R() * TAU, off = (R() + R() - 1) * 0.12;
    star(ua.clone().multiplyScalar(Math.cos(t)).addScaledVector(ub, Math.sin(t)).addScaledVector(nrm, off).normalize(), 0.45 + R() * 0.3, 0.15 + R() * 0.35, tints[Math.floor(R() * 2)]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
function moonTexture() {
  return canvas(256, 256, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r * 0.92, r * 0.9, 0, r, r, r * 0.96);
    gr.addColorStop(0, '#fffdf4'); gr.addColorStop(0.75, '#f1ead8'); gr.addColorStop(1, '#cfc6b2');
    g.fillStyle = gr; g.beginPath(); g.arc(r, r, r * 0.96, 0, TAU); g.fill();
    const R = rng(77);
    g.globalCompositeOperation = 'multiply';
    for (const [x, y, s] of [[0.38, 0.36, 0.2], [0.58, 0.3, 0.13], [0.62, 0.52, 0.17], [0.42, 0.62, 0.12], [0.3, 0.52, 0.09], [0.7, 0.68, 0.07]]) {
      const m = g.createRadialGradient(x * w, y * w, 0, x * w, y * w, s * w);
      m.addColorStop(0, 'rgba(170,165,160,0.9)'); m.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = m; g.beginPath(); g.arc(x * w, y * w, s * w, 0, TAU); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.85, x = r + Math.cos(a) * d, y = r + Math.sin(a) * d, s = 2 + R() * 7;
      g.fillStyle = 'rgba(200,195,185,0.7)'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(r, r, r * 0.96, 0, TAU); g.fill();
  });
}
// lily-pad / lotus-leaf texture: radiating veins on green, a darker rim
function padTexture() {
  const t = canvas(256, 256, (g, w) => {
    const r = w / 2, R = rng(31);
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, '#9cbf68'); gr.addColorStop(0.3, '#6f9a44'); gr.addColorStop(0.85, '#4b7a30'); gr.addColorStop(1, '#3a5f22');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '30,60,20' : '160,190,110'},${(0.05 + R() * 0.08).toFixed(2)})`; g.fillRect(R() * w, R() * w, 2 + R() * 4, 2 + R() * 4); }
    g.strokeStyle = 'rgba(190,220,140,0.55)'; g.lineCap = 'round';
    for (let k = 0; k < 21; k++) {
      const a = (k / 21) * TAU;
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(r, r);
      for (let s = 0.1; s <= 1.0; s += 0.1) { const aa = a + Math.sin(s * 5 + k) * 0.03; g.lineTo(r + Math.cos(aa) * r * s * 0.98, r + Math.sin(aa) * r * s * 0.98); }
      g.stroke();
      g.lineWidth = 1;
      for (const s of [0.45, 0.7]) for (const sd of [-1, 1]) {           // little forks
        const x0 = r + Math.cos(a) * r * s, y0 = r + Math.sin(a) * r * s, aa = a + sd * 0.45;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(aa) * r * 0.16, y0 + Math.sin(aa) * r * 0.16); g.stroke();
      }
    }
    g.fillStyle = 'rgba(210,230,150,0.8)'; g.beginPath(); g.arc(r, r, 5, 0, TAU); g.fill();
  });
  return t;
}
// willow strand: narrow leaves on a thread (alpha)
function strandTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d'), R = rng(91);
  g.clearRect(0, 0, 64, 512);
  g.strokeStyle = 'rgba(120,140,60,1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 512); g.stroke();
  for (let y = 6; y < 505; y += 9) {
    for (const sd of [-1, 1]) {
      const L = 14 + R() * 12, a = sd * (0.35 + R() * 0.35);
      const x0 = 32, y0 = y + sd * 3, x1 = x0 + Math.sin(a) * L, y1 = y0 + Math.cos(a) * L;
      const l = 0.75 + R() * 0.4;
      g.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(185 * l)},${Math.round(80 * l)})`;
      g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + Math.cos(a) * 4, (y0 + y1) / 2 - Math.sin(a) * 4, x1, y1);
      g.quadraticCurveTo((x0 + x1) / 2 - Math.cos(a) * 4, (y0 + y1) / 2 + Math.sin(a) * 4, x0, y0);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// carved pediment: gold flame scrolls on lacquer red, a lotus medallion
function pedimentTexture() {
  const t = canvas(512, 256, (g, w, h) => {
    g.fillStyle = '#5e130e'; g.fillRect(0, 0, w, h);
    const gold = (a) => `rgba(232,182,86,${a})`;
    g.strokeStyle = gold(0.95); g.lineWidth = 3;
    for (let i = -8; i < 16; i++) {                          // lattice of little flame motifs
      for (let j = 0; j < 6; j++) {
        const x = i * 36 + (j % 2) * 18, y = h - 20 - j * 36;
        g.beginPath(); g.moveTo(x, y + 10); g.quadraticCurveTo(x - 9, y - 2, x, y - 14); g.quadraticCurveTo(x + 9, y - 2, x, y + 10); g.stroke();
        g.beginPath(); g.arc(x, y + 14, 3, 0, TAU); g.stroke();
      }
    }
    // medallion
    const cx = w / 2, cy = h * 0.62;
    g.fillStyle = '#5e130e'; g.beginPath(); g.arc(cx, cy, 62, 0, TAU); g.fill();
    g.lineWidth = 5; g.strokeStyle = gold(1); g.beginPath(); g.arc(cx, cy, 60, 0, TAU); g.stroke();
    g.fillStyle = gold(1);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(14, -30, 0, -52); g.quadraticCurveTo(-14, -30, 0, -8); g.fill();
      g.restore();
    }
    g.beginPath(); g.arc(cx, cy, 10, 0, TAU); g.fill();
    g.lineWidth = 8; g.strokeStyle = gold(1); g.strokeRect(4, 4, w - 8, h - 8);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// painted sala ceiling: gold stars on deep red, framed
function ceilingTexture() {
  const t = canvas(256, 256, (g, w) => {
    g.fillStyle = '#4a0f0c'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#e0ad52';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = 32 + i * 64, y = 32 + j * 64;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.18) * 7, y + Math.sin(a - 0.18) * 7); g.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.lineTo(x + Math.cos(a + 0.18) * 7, y + Math.sin(a + 0.18) * 7); g.fill();
      }
    }
    g.strokeStyle = '#c99a48'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, w - 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildPondUltra(ctx) {
  const { F, texLoader, glowTexture, scene, WATER_Y, FLOOR_Y, BANK_Y, A, B, rim, pondR, deckX, deckZ, SALA_X, SALA_Y, ISLANDS,
    poles, stoneLanterns, frangiSpots, willowSpots, uTime, reflect } = ctx;
  const root = new THREE.Group(); root.name = 'pond-ultra';
  const ticks = [];
  const R = rng(7319);
  const uPR = { value: 1 };

  const onDeck = (x, z, m = 0) => Math.abs(x) < deckX + m && Math.abs(z) < deckZ + m;
  const onBridge = (x, z, m = 0) => Math.abs(z) < 1.4 + m && Math.abs(x) > deckX - 1 && Math.abs(x) < SALA_X + 1;
  const nearIsland = (x, z, m = 0) => ISLANDS.some(([ix, iz]) => Math.hypot(x - ix, z - iz) < 3.0 + m);
  const nearPole = (x, z, m = 0.9) => poles.some(([px, pz]) => Math.hypot(x - px, z - pz) < m);

  const load = (path, srgb, rep = 1) => {
    const t = texLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const plaster = load('assets/temple-ultra/clay_plaster_diff.jpg', true);
  const glowCol = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const UP = { upY: SALA_Y, upCentre: [0, 0, 0] };
  const M = {
    teak: enhance(new THREE.MeshStandardMaterial({ map: load('assets/pond/planks_diff.jpg', true), normalMap: load('assets/pond/planks_nor_gl.jpg'), color: 0xc8956a, roughness: 0.62, vertexColors: true }), { upK: 0.16, upFall: 2.5, upWrap: 0.5, upCol: 0xffb060, ...UP }),
    wood: new THREE.MeshStandardMaterial({ map: load('assets/temple-ultra/bark_brown_02_diff.jpg', true), color: 0x6a5040, roughness: 0.85, vertexColors: true }),
    red: enhance(new THREE.MeshStandardMaterial({ color: 0x7c1a13, roughness: 0.36, vertexColors: true }), { upK: 0.3, upFall: 2.2, upWrap: 0.45, upCol: 0xffa050, ...UP }),
    gold: enhance(new THREE.MeshStandardMaterial({ color: 0xdcaa4e, metalness: 0.85, roughness: 0.3, emissive: 0x24140a, vertexColors: true }), { upK: 0.42, upFall: 3, upWrap: 0.5, upCol: 0xffb050, ...UP }),
    plaster: enhance(new THREE.MeshStandardMaterial({ color: 0xe9dfcf, roughness: 0.85, vertexColors: true }), { tri: plaster, triScale: 0.4, triAmt: 0.9, upK: 0.12, upFall: 3, upWrap: 0.5, upCol: 0xffb070, ...UP }),
    moonWhite: enhance(new THREE.MeshStandardMaterial({ color: 0xd8d6dc, roughness: 0.82, vertexColors: true }), { tri: plaster, triScale: 0.25, triAmt: 0.8 }),
    floodGold: enhance(new THREE.MeshStandardMaterial({ color: 0xe2ad4c, metalness: 0.75, roughness: 0.32, emissive: 0x2a1606, vertexColors: true }), { upK: 1.25, upFall: 16, upWrap: 0.55, upCol: 0xffb85a, upY: BANK_Y, upCentre: [0, 0, 0] }),
    roof: new THREE.MeshStandardMaterial({ map: load('assets/temple/roof_diff.jpg', true), normalMap: load('assets/temple/roof_nor_gl.jpg'), vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }),
    ped: new THREE.MeshStandardMaterial({ map: pedimentTexture(), roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x2a0a04 }),
    ceil: new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.9, vertexColors: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8f8576, roughness: 0.92, vertexColors: true }),
    paper: new THREE.MeshBasicMaterial({ color: glowCol(0xffc27a, 1.45), vertexColors: true }),
    window: new THREE.MeshBasicMaterial({ color: glowCol(0xffb35c, 1.1), vertexColors: true }),
    silh: new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 1, vertexColors: true }),
  };
  M.ped.map.repeat.set(1, 1);
  for (const k of ['floodGold', 'silh', 'window']) M[k].userData.noRefl = true;   // far off to the sides: not worth a mirror pass
  const Bq = batch();                    // static architecture, merged per material, mirrored in the water

  /* =====================================================================
     1. WATER — a planar mirror (only the REFL layer), rippled, see-through where you look down into it
     ===================================================================== */
  const mirror = { rt: new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }), cam: new THREE.PerspectiveCamera(), mat: new THREE.Matrix4(), busy: false };
  mirror.cam.layers.set(REFL);
  scene.traverse((o) => { if (o.isLight) o.layers.enable(REFL); });        // lit, not black, in the mirror
  {
    const nor = load('assets/pond/water_nor.jpg');
    const U = { uNor: { value: nor }, uRefl: { value: mirror.rt.texture }, uReflMat: { value: mirror.mat }, uWY: { value: WATER_Y }, uTime };
    const m = new THREE.MeshStandardMaterial({ color: 0x03100f, roughness: 0.1, metalness: 0.0, envMapIntensity: 0.05, transparent: true, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uTime; uniform sampler2D uNor; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uWY;
        varying vec3 vWP;
        vec3 gN;
        vec3 pdNormal(vec2 p) {
          vec3 a = texture2D(uNor, p * 0.11 + vec2(uTime * 0.004, uTime * 0.003)).xyz * 2.0 - 1.0;
          vec3 b = texture2D(uNor, p * 0.27 + vec2(-uTime * 0.006, uTime * 0.005)).xyz * 2.0 - 1.0;
          vec3 c = texture2D(uNor, p * 0.035 + 0.41).xyz * 2.0 - 1.0;
          vec2 d = a.xy * 0.45 + b.xy * 0.3 + c.xy * 0.35;
          d += vec2(sin(p.x * 0.31 + p.y * 0.11 + uTime * 0.6), sin(p.y * 0.27 - uTime * 0.5 + p.x * 0.07)) * 0.04;
          return normalize(vec3(-d.x * 0.32, 1.0, -d.y * 0.32));
        }
        ` + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n gN = pdNormal(vWP.xz);')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
        .replace('#include <opaque_fragment>', `{
            vec3 V = cameraPosition - vWP; V = V / max(length(V), 1e-4);
            float cosT = clamp(dot(gN, V), 0.0, 1.0);
            float fr = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
            vec4 rc = uReflMat * vec4(vWP.x, uWY, vWP.z, 1.0);
            vec2 ruv = rc.xy / max(rc.w, 1e-4) + gN.xz * vec2(0.022, 0.03);
            float st = 0.002 + 0.008 * (1.0 - cosT);
            vec3 refl = vec3(0.0); float ws = 0.0;
            for (int k = -3; k <= 3; k++) { float w = exp(-float(k * k) * 0.22); refl += texture2D(uRefl, clamp(ruv + vec2(gN.x * 0.004 * float(k), float(k) * st), 0.001, 0.999)).rgb * w; ws += w; }
            refl /= ws;
            refl = min(refl, vec3(24.0));
            outgoingLight = outgoingLight * (1.0 - fr * 0.5) + refl * (0.22 + 0.78 * fr);
            diffuseColor.a = mix(0.6, 0.985, clamp(fr * 1.6 + 0.12, 0.0, 1.0));
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'pondMirror';
    const water = new THREE.Mesh(new THREE.PlaneGeometry(A * 2 + 6, B * 2 + 6), m);
    water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
    water.renderOrder = 2;
    root.add(water);
    const v2 = new THREE.Vector2(), cp = new THREE.Vector3(), cq = new THREE.Quaternion(), dir = new THREE.Vector3(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    water.onBeforeRender = (renderer, sc, camera) => {
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
      renderer.render(sc, mc);
      renderer.xr.enabled = prevXR; renderer.shadowMap.autoUpdate = prevSh;
      renderer.setRenderTarget(prevRT);
      mirror.busy = false;
    };
  }
  // the High pieces worth seeing in the mirror: festoon lanterns, lamp heads, the lacquered poles + stone-lantern roofs
  for (const r of reflect) r.traverse((o) => {
    if (!(o.isMesh || o.isLine) || o.parent === null) return;
    let p = o; while (p) { if (p.name === 'pond-lite' || p === root) return; p = p.parent; }
    const mt = o.material;
    if (!mt || mt.transparent) return;
    const bright = mt.isMeshBasicMaterial && Math.max(mt.color.r, mt.color.g, mt.color.b) > 1.05;
    if (bright || o.isLine || (mt.color && mt.color.getHex() === 0x8a1e17 && !mt.map)) o.layers.enable(REFL);
  });

  /* =====================================================================
     2. LOTUS — floating pads, raised leaves, flowers in bloom, buds
     ===================================================================== */
  const flowerPts = [];
  {
    const free = (x, z, m) => pondR(x, z) < 0.93 && !onDeck(x, z, 0.9 + m) && !onBridge(x, z, 0.3 + m) && !nearIsland(x, z, 0.4 + m) && !nearPole(x, z, 0.9 + m);
    const clusters = [];
    let guard = 0;
    while (clusters.length < 34 && guard++ < 4000) {
      const x = (R() * 2 - 1) * (A - 3), z = (R() * 2 - 1) * (B - 3);
      if (pondR(x, z) > 0.88 || onDeck(x, z, 1.4) || onBridge(x, z, 0.8) || nearIsland(x, z, 1.2)) continue;
      clusters.push([x, z, 1.3 + R() * 2.4]);
    }
    const pads = [], leaves = [], flowers = [], buds = [], stems = [];
    for (const [cx, cz, sd] of clusters) {
      const n = 14 + Math.floor(R() * 20);
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, r = Math.sqrt(R()) * sd * 1.6;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!free(x, z, 0)) continue;
        if (pads.some((p) => Math.hypot(p[0] - x, p[2] - z) < 0.32 * (p[4] + 0.6))) continue;
        const s = 0.5 + R() * 0.75, roll = R();
        if (roll < 0.15) {                                      // a raised lotus leaf on its stalk
          const h = 0.25 + R() * 0.8;
          leaves.push([x, WATER_Y + h, z, R() * TAU, s * 0.95, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4]);
          stems.push([x, WATER_Y - 0.5, z, 0, 1, 0, 0, h + 0.5]);
        } else pads.push([x, WATER_Y + 0.012 + (i % 3) * 0.002, z, R() * TAU, s]);
        const calm = !offAxis(x, z, 9);                            // no glowing blooms straight behind either end
        if (roll > 0.72 && !calm) {
          const h = 0.15 + R() * 0.55, fs = 0.9 + R() * 0.55, fx = x + (R() - 0.5) * 0.3, fz = z + (R() - 0.5) * 0.3;
          flowers.push([fx, WATER_Y + h, fz, R() * TAU, fs, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25]);
          stems.push([fx, WATER_Y - 0.5, fz, 0, 1, 0, 0, h + 0.5]);
          flowerPts.push([fx, WATER_Y + h + 0.1 * fs, fz, fs]);
        } else if (roll > 0.6 && roll <= 0.72) {
          const h = 0.35 + R() * 0.6, fx = x - 0.2, fz = z + 0.15;
          if (!free(fx, fz, 0)) continue;
          buds.push([fx, WATER_Y + h, fz, R() * TAU, 0.85 + R() * 0.4, (R() - 0.5) * 0.3, 0]);
          stems.push([fx, WATER_Y - 0.5, fz, 0, 1, 0, 0, h + 0.5]);
        }
      }
    }
    // floating pad: notched disc, edges lifting, gently wavy
    const padGeo = (() => {
      const pos = [], uv = [], idx = [], RS = [0.03, 0.3, 0.68, 1.0], NA = 22, a0 = 0.14, a1 = TAU - 0.14;
      for (let i = 0; i < RS.length; i++) for (let j = 0; j <= NA; j++) {
        const r = RS[i], a = a0 + (a1 - a0) * (j / NA), x = Math.cos(a) * r * 0.5, z = Math.sin(a) * r * 0.5;
        pos.push(x, 0.018 * r ** 4 + 0.008 * Math.sin(a * 7) * r ** 3, z); uv.push(0.5 + x, 0.5 - z);
      }
      for (let i = 0; i < RS.length - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); fixNormals(g);
      return g;
    })();
    // raised leaf: a shallow bowl with a rippled rim
    const leafGeo = (() => {
      const pos = [], uv = [], idx = [], RS = [0.03, 0.3, 0.68, 1.0], NA = 28;
      for (let i = 0; i < RS.length; i++) for (let j = 0; j <= NA; j++) {
        const r = RS[i], a = (j / NA) * TAU, x = Math.cos(a) * r * 0.55, z = Math.sin(a) * r * 0.55;
        pos.push(x, 0.16 * r * r + 0.045 * Math.sin(a * 9) * r ** 3, z); uv.push(0.5 + x / 1.1, 0.5 - z / 1.1);
      }
      for (let i = 0; i < RS.length - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); fixNormals(g);
      return g;
    })();
    const ptex = padTexture();
    const padMat = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.42, side: THREE.DoubleSide });
    padMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
          transformed.y += sin(uTime * 0.8 + ph) * 0.01;
        #endif`);
    };
    const greens = () => _c.setHSL(0.24 + R() * 0.07, 0.35 + R() * 0.2, 0.42 + R() * 0.2).clone();
    const pi = inst(padGeo, padMat, pads, root, { colors: greens }); pi.receiveShadow = true;
    inst(leafGeo, padMat, leaves, root, { colors: greens });
    const stemGeo = new THREE.CylinderGeometry(0.011, 0.016, 1, 5, 1, true).translate(0, 0.5, 0);
    inst(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4d7030, roughness: 0.8 }), stems, root);

    // the flower: three rings of cupped petals (white base → pink tip), golden stamens, a green-gold seed pod
    const fl = [];
    const PINK = 0xff6f9e, BASE = 0xfff4ec;
    petalRing(fl, 9, 0.2, 0.085, 1.0, 0.02, 0, 0.0, { cup: 0.55, bend: 0.12, base: BASE, tip: PINK, segL: 4, segW: 3 });
    petalRing(fl, 8, 0.19, 0.08, 0.62, 0.02, 0.01, 0.35, { cup: 0.6, bend: 0.1, base: BASE, tip: PINK, segL: 4, segW: 3 });
    petalRing(fl, 6, 0.16, 0.07, 0.3, 0.015, 0.02, 0.15, { cup: 0.7, bend: 0.02, base: BASE, tip: 0xff8fb4, segL: 3, segW: 3 });
    const petals = mergeVC(fl);
    const heart = [];
    heart.push(vc(lathe([[0, 0.05], [0.04, 0.05], [0.055, 0.075], [0.05, 0.095], [0, 0.098]], 10), 0xc8c04a));
    for (let k = 0; k < 12; k++) {                              // stamens
      const a = (k / 12) * TAU, s = new THREE.CylinderGeometry(0.005, 0.005, 0.07, 3, 1, true).translate(0, 0.035, 0);
      s.rotateX(0.5); s.translate(0, 0.045, 0.045); s.rotateY(a);
      heart.push(vc(s, 0xffc23a));
    }
    const heartGeo = mergeVC(heart);
    const glowPatch = (k) => (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'varying float vFl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFl = 0.0;
        #ifdef USE_INSTANCING
          vFl = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
        #endif`);
      sh.fragmentShader = 'uniform float uTime; varying float vFl;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${k.toFixed(2)} * (0.85 + 0.15 * sin(uTime * 0.7 + vFl));`);
    };
    const flMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
    flMat.onBeforeCompile = glowPatch(0.34); flMat.customProgramCacheKey = () => 'pondPetal';
    const hMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    hMat.onBeforeCompile = glowPatch(0.4); hMat.customProgramCacheKey = () => 'pondHeart';
    const tints = [0xffffff, 0xfff0f4, 0xffd6e4, 0xffc0d6, 0xffffff];
    inst(petals, flMat, flowers, root, { colors: (i) => _c.set(tints[i % tints.length]).clone() });
    inst(heartGeo, hMat, flowers, root);
    // buds: a closed teardrop of petals
    const bd = [];
    petalRing(bd, 5, 0.2, 0.07, 0.06, 0.0, 0, 0, { cup: 0.9, bend: -0.12, base: 0xfde8e0, tip: 0xff5d92, segL: 5, segW: 3, point: 0.9 });
    const budGeo = mergeVC(bd);
    inst(budGeo, flMat, buds, root);
    // a soft halo above every bloom
    const pos = new Float32Array(flowerPts.length * 3), sz = new Float32Array(flowerPts.length);
    flowerPts.forEach(([x, y, z, s], i) => { pos.set([x, y, z], i * 3); sz[i] = s; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
    const hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPR },
      vertexShader: `uniform float uTime; uniform float uPR; attribute float sz; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.16 * (0.85 + 0.15 * sin(uTime * 0.7 + position.x * 1.3 + position.z * 0.7)) * smoothstep(2.0, 6.0, -mv.z);
          gl_PointSize = uPR * 0.75 * sz * 520.0 / max(-mv.z, 0.5); }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vec3(1.0, 0.55, 0.72) * a * vA, a * vA); }` });
    const halo = new THREE.Points(geo, hm); halo.frustumCulled = false; root.add(halo);
  }

  /* =====================================================================
     3. BRIDGES — arched teak, from each baseline to a sala (same walking surface as High)
     ===================================================================== */
  {
    const W = 2.2;
    const yAt = (t) => SALA_Y * t + Math.sin(Math.PI * t) * 1.25;
    const finial = lathe([[0, 0], [0.075, 0], [0.075, 0.04], [0.05, 0.06], [0.07, 0.11], [0.075, 0.16], [0.055, 0.22], [0.03, 0.27], [0, 0.31]], 8);
    const bal = new THREE.CylinderGeometry(0.02, 0.02, 1, 6).translate(0, 0.5, 0);
    for (const sx of [-1, 1]) {
      const x0 = sx * deckX, x1 = sx * SALA_X;
      const N = 120, P = [], L = [0];
      for (let i = 0; i <= N; i++) { const t = i / N; P.push(V3(x0 + (x1 - x0) * t, yAt(t), 0)); if (i) L.push(L[i - 1] + P[i].distanceTo(P[i - 1])); }
      const total = L[N];
      const at = (d) => {                                    // point + slope angle at arc length d
        let i = 1; while (i < N && L[i] < d) i++;
        const k = (d - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-6), p = P[i - 1].clone().lerp(P[i], k);
        return [p, Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x)];
      };
      // planks
      for (let d = 0.11; d < total - 0.05; d += 0.215) {
        const [p, ang] = at(d);
        Bq.put(M.teak, T(new THREE.BoxGeometry(0.2, 0.06, W), p.x, p.y - 0.03, 0, 0, 0, ang));
      }
      // stringers + handrails following the arch
      for (let i = 0; i < N; i += 2) {
        const a = P[i], b = P[Math.min(N, i + 2)];
        for (const sz of [-1, 1]) {
          const z = sz * (W / 2 + 0.04);
          Bq.put(M.red, beam(V3(a.x, a.y - 0.08, z), V3(b.x, b.y - 0.08, z), 0.12, 0.3));
          Bq.put(M.gold, beam(V3(a.x, a.y - 0.215, z + sz * 0.065), V3(b.x, b.y - 0.215, z + sz * 0.065), 0.035, 0.035));
          Bq.put(M.teak, beam(V3(a.x, a.y + 0.95, z - sz * 0.06), V3(b.x, b.y + 0.95, z - sz * 0.06), 0.1, 0.07));
          Bq.put(M.red, beam(V3(a.x, a.y + 0.32, z - sz * 0.06), V3(b.x, b.y + 0.32, z - sz * 0.06), 0.05, 0.06));
        }
      }
      // posts with lotus-bud finials; balusters between
      const nPost = Math.round(total / 1.4);
      for (let k = 0; k <= nPost; k++) {
        const [p] = at((k / nPost) * total * 0.999 + 0.0005);
        for (const sz of [-1, 1]) {
          const z = sz * (W / 2 - 0.02);
          Bq.put(M.red, T(new THREE.BoxGeometry(0.12, 1.08, 0.12), p.x, p.y + 0.5, z));
          Bq.put(M.gold, T(new THREE.BoxGeometry(0.15, 0.04, 0.15), p.x, p.y + 1.04, z));
          Bq.put(M.gold, T(finial, p.x, p.y + 1.06, z));
        }
      }
      for (let d = 0.2; d < total - 0.1; d += 0.2) {
        const [p] = at(d);
        for (const sz of [-1, 1]) Bq.put(M.teak, T(bal, p.x, p.y + 0.35, sz * (W / 2 - 0.02), 0, 0, 0, 1, 0.58, 1));
      }
      // timber bents under the arch
      for (let t = 0.12; t < 0.95; t += 0.16) {
        const x = x0 + (x1 - x0) * t, y = yAt(t) - 0.22;
        for (const sz of [-1, 1]) Bq.put(M.dark, T(new THREE.CylinderGeometry(0.1, 0.12, y - FLOOR_Y, 7), x, (y + FLOOR_Y) / 2, sz * 0.85));
        Bq.put(M.dark, T(new THREE.BoxGeometry(0.2, 0.16, W + 0.1), x, y - 0.05, 0));
        if (y - WATER_Y > 0.7) for (const sz of [-1, 1]) Bq.put(M.dark, beam(V3(x, WATER_Y + 0.1, -sz * 0.85), V3(x, y - 0.15, sz * 0.85), 0.06, 0.06));
      }
    }
  }

  /* =====================================================================
     4. SALAS — open Thai pavilions on the bank behind each baseline (same footprint as High)
     ===================================================================== */
  // one gabled roof tier: ridge along x (xa → xb) at yr; eaves at z = ±ze, height ye; concave slopes; glazed green border
  const prof = (s) => Math.pow(s, 1.45);
  function roofTier(put, xa, xb, ze, ye, yr, { gA = true, gB = true, border = 0.55, nx = 12, ns = 8, finA = -1, finB = 1 } = {}) {
    const xs = [xa, xa + border]; for (let i = 1; i < nx; i++) xs.push(xa + border + ((xb - xa - 2 * border) * i) / nx); xs.push(xb - border, xb);
    const ss = [0, 0.09]; for (let i = 1; i <= ns; i++) ss.push(0.09 + (0.91 * i) / ns);
    const pos = [], col = [], uv = [];
    const O = new THREE.Color(0xd2642c), G = new THREE.Color(0x2f7a4a), O2 = new THREE.Color(0xc0562a);
    for (const sg of [-1, 1]) for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ss.length - 1; j++) {
      const q = [[xs[i], ss[j]], [xs[i + 1], ss[j]], [xs[i + 1], ss[j + 1]], [xs[i], ss[j + 1]]].map(([x, s]) => [x, ye + (yr - ye) * prof(s), sg * ze * (1 - s), s]);
      const green = i === 0 || i === xs.length - 2 || j === 0;
      const c = green ? G : (j % 2 ? O : O2);
      const tri = sg > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of tri) { const [x, y, z, s] = q[k]; pos.push(x, y, z); col.push(c.r, c.g, c.b); uv.push(x / 1.4, (s * Math.hypot(ze, yr - ye)) / 1.4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    put(M.roof, g);
    put(M.gold, T(new THREE.BoxGeometry(xb - xa + 0.06, 0.12, 0.2), (xa + xb) / 2, yr + 0.05, 0));                  // ridge
    for (const sg of [-1, 1]) put(M.gold, T(new THREE.BoxGeometry(xb - xa, 0.1, 0.05), (xa + xb) / 2, ye - 0.04, sg * (ze + 0.01)));   // eave board
    const gable = (xg, out) => {
      // pediment: a fan following the curved roof line
      const n = 10, pts = [];
      for (let k = 0; k <= n; k++) { const s = k / n; pts.push([-ze * 0.96 * (1 - s), ye + (yr - ye) * prof(s) - 0.1]); }
      for (let k = n - 1; k >= 0; k--) { const s = k / n; pts.push([ze * 0.96 * (1 - s), ye + (yr - ye) * prof(s) - 0.1]); }
      const p = [], u = [];
      const c0 = [0, ye - 0.02];
      for (let k = 0; k < pts.length - 1; k++) for (const [z, y] of [c0, pts[k], pts[k + 1]]) { p.push(xg - out * 0.08, y, z); u.push(z / (2 * ze) + 0.5, (y - ye) / (yr - ye)); }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); pg.computeVertexNormals();
      put(M.ped, pg);
      // bargeboards up both rakes + bai raka fins
      for (const sg of [-1, 1]) {
        const m = 9;
        for (let k = 0; k < m; k++) {
          const s0 = k / m, s1 = (k + 1) / m;
          const a = V3(xg, ye + (yr - ye) * prof(s0) + 0.05, sg * ze * (1 - s0) * 1.01), b = V3(xg, ye + (yr - ye) * prof(s1) + 0.05, sg * ze * (1 - s1) * 1.01);
          put(M.gold, beam(a, b, 0.09, 0.24));
          const mid = a.clone().lerp(b, 0.5), dz = b.z - a.z, dy = b.y - a.y, l = Math.hypot(dz, dy) || 1;
          const nz = -dy / l * sg * -1, ny = Math.abs(dz) / l;                     // outward-up normal of the rake
          const fin = new THREE.BufferGeometry();
          fin.setAttribute('position', new THREE.Float32BufferAttribute([
            xg, mid.y - dy * 0.3 + 0.08, mid.z - dz * 0.3, xg, mid.y + dy * 0.3 + 0.08, mid.z + dz * 0.3, xg, mid.y + 0.08 + ny * 0.3 + dy * 0.25, mid.z + nz * 0.3 + dz * 0.25], 3));
          fin.computeVertexNormals();
          put(M.gold, fin);
        }
        // hang hong: a curl at the foot of each rake
        put(M.gold, taperTube([V3(xg, ye + 0.05, sg * ze), V3(xg + out * 0.05, ye + 0.05, sg * (ze + 0.25)), V3(xg + out * 0.1, ye + 0.32, sg * (ze + 0.38)), V3(xg + out * 0.1, ye + 0.5, sg * (ze + 0.25))], 0.07, 0.025, 10, 6));
      }
      // chofa: a slender bird's-head horn at the apex
      put(M.gold, taperTube([V3(xg, yr, 0), V3(xg + out * 0.04, yr + 0.45, 0), V3(xg + out * 0.22, yr + 0.85, 0), V3(xg + out * 0.48, yr + 0.92, 0), V3(xg + out * 0.62, yr + 0.8, 0)], 0.1, 0.025, 14, 7));
    };
    if (gA) gable(xa + 0.1, finA);
    if (gB) gable(xb - 0.1, finB);
  }
  {
    const D = 9.6, HW = 4.6;
    const parts = [];
    const put = (mat, geo) => parts.push([mat, geo]);
    put(M.teak, T(new THREE.BoxGeometry(D, 0.3, HW * 2), D / 2, SALA_Y - 0.15, 0));
    put(M.gold, T(new THREE.BoxGeometry(D + 0.04, 0.05, HW * 2 + 0.04), D / 2, SALA_Y - 0.03, 0));
    put(M.red, T(new THREE.BoxGeometry(D + 0.1, 0.16, HW * 2 + 0.1), D / 2, SALA_Y - 0.22, 0));
    for (const x of [0.3, 2.7, 4.8, 6.9, 9.3]) for (const z of [-HW + 0.3, -2.2, 0, 2.2, HW - 0.3]) put(M.dark, T(new THREE.CylinderGeometry(0.14, 0.16, SALA_Y - FLOOR_Y, 8), x, (SALA_Y + FLOOR_Y) / 2 - 0.3, z));
    // columns: lotus bases, lacquered shafts with gold bands, lotus capitals
    const colX = [0.6, 2.7, 4.8, 6.9, 9.0], colY = SALA_Y, CH = 3.2;
    const base = lathe([[0, 0], [0.3, 0], [0.3, 0.06], [0.24, 0.1], [0.28, 0.2], [0.22, 0.3], [0.2, 0.34], [0, 0.34]], 16);
    const cap = lathe([[0, 0], [0.19, 0], [0.24, 0.06], [0.3, 0.16], [0.3, 0.22], [0.25, 0.26], [0.33, 0.34], [0.33, 0.42], [0, 0.42]], 16);
    const shaft = new THREE.CylinderGeometry(0.17, 0.19, CH, 12);
    const band = new THREE.CylinderGeometry(0.195, 0.195, 0.06, 12);
    for (const x of colX) for (const sg of [-1, 1]) {
      const z = sg * (HW - 0.45);
      put(M.gold, T(base, x, colY, z));
      put(M.red, T(shaft, x, colY + CH / 2 + 0.2, z));
      put(M.gold, T(band, x, colY + 0.7, z)); put(M.gold, T(band, x, colY + 2.9, z));
      put(M.gold, T(cap, x, colY + CH + 0.08, z));
      // naga bracket out to the eave
      put(M.gold, taperTube([V3(x, colY + 2.75, sg * (HW - 0.3)), V3(x, colY + 3.1, sg * (HW + 0.05)), V3(x, colY + 3.25, sg * (HW + 0.45)), V3(x, colY + 3.5, sg * (HW + 0.75))], 0.07, 0.03, 10, 6));
    }
    const yb = colY + CH + 0.5;
    for (const sg of [-1, 1]) {
      put(M.red, T(new THREE.BoxGeometry(D + 0.3, 0.3, 0.28), D / 2, yb, sg * (HW - 0.45)));
      put(M.gold, T(new THREE.BoxGeometry(D + 0.3, 0.05, 0.3), D / 2, yb - 0.13, sg * (HW - 0.45)));
      put(M.gold, T(new THREE.BoxGeometry(D + 0.3, 0.05, 0.3), D / 2, yb + 0.13, sg * (HW - 0.45)));
    }
    for (const x of colX) put(M.red, T(new THREE.BoxGeometry(0.22, 0.24, HW * 2 - 0.6), x, yb, 0));
    // painted ceiling
    { const c = new THREE.PlaneGeometry(D + 0.2, HW * 2 - 0.4); c.rotateX(Math.PI / 2); const u = c.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 4.5, u.getY(i) * 4); put(M.ceil, T(c, D / 2, yb + 0.16, 0)); }
    // low balustrades along the sides
    const bl = lathe([[0, 0], [0.05, 0], [0.05, 0.05], [0.035, 0.1], [0.055, 0.25], [0.03, 0.4], [0.05, 0.45], [0.05, 0.5], [0, 0.5]], 8);
    for (const sg of [-1, 1]) {
      const z = sg * (HW - 0.45);
      for (let i = 0; i < colX.length - 1; i++) {
        const xa = colX[i] + 0.3, xb = colX[i + 1] - 0.3;
        for (let x = xa; x <= xb + 1e-6; x += 0.22) put(M.plaster, T(bl, x, colY, z));
        put(M.red, T(new THREE.BoxGeometry(xb - xa + 0.1, 0.07, 0.14), (xa + xb) / 2, colY + 0.54, z));
      }
    }
    // the roof: main tier, a skirt tier down both sides, telescoped lower tiers at the front + back
    const ye = colY + CH + 0.65, yr = colY + CH + 3.95;
    roofTier(put, -0.55, D + 0.55, HW + 0.85, ye, yr, { finA: -1, finB: 1 });
    for (const sg of [-1, 1]) {
      const zi = sg * (HW + 0.5), zo = sg * (HW + 1.65), yi = ye - 0.18, yo = ye - 0.88;
      const pos = [], col = [], uv = [], O = new THREE.Color(0xd2642c), G = new THREE.Color(0x2f7a4a);
      const xs = [0.2, 0.75]; for (let i = 1; i < 10; i++) xs.push(0.75 + ((D - 1.5 - 0.4) * i) / 10); xs.push(D - 0.75, D - 0.2);
      const ss = [0, 0.75, 1];
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < 2; j++) {
        const q = [[xs[i], ss[j]], [xs[i + 1], ss[j]], [xs[i + 1], ss[j + 1]], [xs[i], ss[j + 1]]].map(([x, s]) => [x, yi + (yo - yi) * s, zi + (zo - zi) * s]);
        const c = j === 1 || i === 0 || i === xs.length - 2 ? G : O;
        for (const k of (sg > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3])) { const [x, y, z] = q[k]; pos.push(x, y, z); col.push(c.r, c.g, c.b); uv.push(x / 1.4, Math.abs(z) / 1.4); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals(); put(M.roof, g);
      put(M.gold, T(new THREE.BoxGeometry(D - 0.4, 0.08, 0.05), D / 2, yo - 0.03, zo));
    }
    roofTier(put, -1.45, 0.9, HW + 0.55, ye - 0.38, yr - 0.95, { gB: false, finA: -1, nx: 4 });
    roofTier(put, D - 0.9, D + 1.45, HW + 0.55, ye - 0.38, yr - 0.95, { gA: false, finB: 1, nx: 4 });
    // paper lanterns down the middle (soft: they sit on the ball's line of sight)
    const lan = lathe([[0, -0.3], [0.12, -0.28], [0.22, -0.18], [0.25, 0], [0.22, 0.18], [0.12, 0.28], [0, 0.3]], 14);
    for (const x of [2.4, 4.8, 7.2]) {
      put(M.paper, T(lan, x, colY + 2.35, 0));
      put(M.gold, T(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), x, colY + 2.67, 0));
      put(M.gold, T(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), x, colY + 2.03, 0));
      put(M.gold, T(new THREE.CylinderGeometry(0.012, 0.012, yb - colY - 2.7, 4), x, (yb + colY + 2.7) / 2, 0));
    }
    for (const sx of [-1, 1]) {
      _m.makeRotationY(sx > 0 ? 0 : Math.PI).setPosition(sx * SALA_X, 0, 0);
      for (const [mat, geo] of parts) Bq.put(mat, geo.clone().applyMatrix4(_m));
    }
    // warm light from the lanterns on the floor
    const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffa64d, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    inst(pg, pm, [-1, 1].map((sx) => [sx * (SALA_X + 4.8), SALA_Y + 0.02, 0, 0, 7.5]), root).renderOrder = 3;
  }

  /* =====================================================================
     5. CHEDIS — on the islands, a moonlit ensemble behind each sala (no floodlights on the ball's line), gilded ones off to the sides
     ===================================================================== */
  // unit chedi (≈ 12.5 m tall at s = 1): stepped square plinth, a bell on moulded rings, a harmika, a ringed spire
  const chediMake = (lo) => {
    const body = [], gold = [];
    for (const [w, h, y] of [[6.0, 0.55, 0], [5.3, 0.5, 0.55], [4.7, 0.45, 1.05]]) {
      body.push(T(new THREE.BoxGeometry(w, h, w), 0, y + h / 2, 0));
      body.push(T(new THREE.BoxGeometry(w + 0.12, 0.08, w + 0.12), 0, y + h - 0.04, 0));
    }
    const bell = [[0, 1.5], [2.25, 1.5], [2.25, 1.62], [2.1, 1.66], [2.1, 1.82], [1.98, 1.86], [1.98, 2.0], [1.88, 2.04]];
    for (let k = 0, nb = lo ? 7 : 14; k <= nb; k++) { const a = k / nb; bell.push([0.95 + 1.0 * Math.pow(Math.cos(a * Math.PI / 2), 0.75), 2.1 + 3.2 * a]); }
    bell.push([0.9, 5.4], [0, 5.4]);
    body.push(lathe(bell, lo ? 16 : 40));
    body.push(T(new THREE.BoxGeometry(1.6, 0.55, 1.6), 0, 5.68, 0));
    body.push(T(new THREE.BoxGeometry(1.75, 0.1, 1.75), 0, 5.98, 0));
    const sp = [[0, 6.0], [0.62, 6.0]];
    for (let k = 0; k < 9; k++) { const r = 0.62 - k * 0.042, y = 6.05 + k * 0.42; sp.push([r + 0.07, y + 0.05], [r + 0.07, y + 0.16], [r, y + 0.22], [r - 0.02, y + 0.42]); }
    sp.push([0.2, 9.9], [0.26, 10.2], [0.2, 10.5], [0.08, 10.7], [0.05, 11.6], [0.015, 12.4], [0, 12.6]);
    gold.push(lathe(sp, lo ? 10 : 24));
    return { body: mergeVC(body), gold: mergeVC(gold) };
  };
  const chediParts = chediMake(false), chediLo = chediMake(true);
  const chedi = (x, y, z, s, bodyMat, goldMat = M.gold, parts = Math.hypot(x, z) > 40 ? chediLo : chediParts) => {
    Bq.put(bodyMat, T(parts.body, x, y, z, 0, 0, 0, s));
    Bq.put(goldMat, T(parts.gold, x, y, z, 0, 0, 0, s));
  };
  for (const [ix, iz] of ISLANDS) chedi(ix, BANK_Y + 0.05, iz, 0.42, M.plaster);
  for (const sx of [-1, 1]) {
    chedi(sx * 60, BANK_Y, 0, 1.7, M.moonWhite, M.moonWhite);          // straight behind each sala: moonlit only
    chedi(sx * 54, BANK_Y, 14, 0.95, M.moonWhite, M.moonWhite);
    chedi(sx * 54, BANK_Y, -14, 0.95, M.moonWhite, M.moonWhite);
    // off to the sides (≥ 20° off both cameras' axis): floodlit golden chedis + a viharn
    for (const sz of [-1, 1]) {
      const cx = sx * 72, cz = sz * 40;
      if (!offAxis(cx, cz, 20)) continue;
      chedi(cx, BANK_Y, cz, 2.3, M.floodGold, M.floodGold);
      for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) chedi(cx + dx, BANK_Y, cz + dz, 0.55, M.floodGold, M.floodGold);
    }
  }
  // the moonlit ensembles: low cloister walls with tiled copings round each far chedi
  for (const sx of [-1, 1]) {
    const cx = sx * 58;
    for (const [len, x, z, ry] of [[30, cx, -21, 0], [30, cx, 21, 0], [42, cx + sx * 15, 0, Math.PI / 2]]) {
      Bq.put(M.moonWhite, T(new THREE.BoxGeometry(len, 2.2, 0.5), x, BANK_Y + 1.1, z, ry));
      Bq.put(M.red, T(new THREE.BoxGeometry(len + 0.3, 0.25, 0.9), x, BANK_Y + 2.3, z, ry));
    }
  }
  // a viharn beside each golden chedi (thai roof, warm windows) — off axis
  {
    const parts = [];
    const put = (mat, geo) => parts.push([mat, geo]);
    const L = 18, HWv = 5;
    put(M.plaster, T(new THREE.BoxGeometry(L, 1.0, HWv * 2 + 1.4), L / 2, 0.5, 0));
    put(M.plaster, T(new THREE.BoxGeometry(L - 1, 5.2, HWv * 2), L / 2, 3.6, 0));
    for (let i = 0; i < 6; i++) for (const sg of [-1, 1]) put(M.window, T(new THREE.BoxGeometry(0.9, 1.9, 0.05), 2 + i * 2.8, 3.4, sg * (HWv + 0.01)));
    for (let i = 0; i < 7; i++) for (const sg of [-1, 1]) put(M.plaster, T(new THREE.BoxGeometry(0.45, 5.2, 0.45), 0.6 + i * 2.8, 3.6, sg * (HWv + 0.9)));
    roofTier(put, -0.6, L + 0.6, HWv + 1.6, 6.4, 12.5, { nx: 10, ns: 6 });
    roofTier(put, -2.4, 1.6, HWv + 1.1, 5.7, 10.6, { gB: false, nx: 3, ns: 5 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 72, cz = sz * 40;
      if (!offAxis(cx, cz, 20)) continue;
      _m.makeRotationY(sx > 0 ? Math.PI : 0).setPosition(cx - sx * 11, BANK_Y, cz);
      for (const [mat, geo] of parts) Bq.put(mat === M.gold ? M.floodGold : mat, geo.clone().applyMatrix4(_m));
    }
  }

  /* =====================================================================
     6. TREES — weeping willows (hanging strands that sway) and frangipani in flower, in High's places
     ===================================================================== */
  {
    const bark = new THREE.MeshStandardMaterial({ map: load('assets/temple-ultra/bark_brown_02_diff.jpg', true), normalMap: load('assets/temple-ultra/bark_brown_02_nor_gl.jpg'), color: 0x8a7462, roughness: 0.9 });
    const sway = (amp) => (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          #endif
          float hang = uv.y * uv.y;
          ph += position.x * 0.9 + position.z * 0.7;
          transformed.x += (sin(uTime * 0.8 + ph) * 0.6 + sin(uTime * 1.9 + ph * 2.0) * 0.25) * ${amp.toFixed(3)} * hang;
          transformed.z += cos(uTime * 0.6 + ph * 1.3) * ${(amp * 0.6).toFixed(3)} * hang;
        }`);
    };
    // weeping willow
    {
      const RW = rng(404);
      const wood = [], strands = [];
      wood.push(taperTube([V3(0, -0.3, 0), V3(0.15, 1.4, 0.05), V3(0.55, 2.7, -0.05), V3(0.9, 3.4, 0)], 0.36, 0.22, 10, 8));
      const top = V3(0.9, 3.4, 0);
      const sw = [];
      for (let b = 0; b < 8; b++) {
        const a = (b / 8) * TAU + RW() * 0.4, out = 1.6 + RW() * 1.6, lean = Math.cos(a) > 0 ? 1.3 : 0.8;
        const p1 = V3(top.x + Math.cos(a) * out * 0.35 * lean, top.y + 1.0 + RW() * 0.8, Math.sin(a) * out * 0.35);
        const p2 = V3(top.x + Math.cos(a) * out * 0.8 * lean, top.y + 1.6 + RW() * 0.8, Math.sin(a) * out * 0.8);
        const p3 = V3(top.x + Math.cos(a) * out * 1.25 * lean, top.y + 1.1 + RW() * 0.6, Math.sin(a) * out * 1.25);
        wood.push(taperTube([top.clone(), p1, p2, p3], 0.14, 0.04, 10, 6));
        const crv = new THREE.CatmullRomCurve3([top.clone(), p1, p2, p3]);
        for (let k = 0; k < 26; k++) sw.push(crv.getPointAt(0.25 + (0.75 * k) / 26).add(V3((RW() - 0.5) * 0.5, (RW() - 0.5) * 0.3, (RW() - 0.5) * 0.5)));
      }
      for (let k = 0; k < 40; k++) { const a = RW() * TAU, r = RW() * 1.2; sw.push(V3(top.x + Math.cos(a) * r, top.y + 1.7 + RW() * 0.9, Math.sin(a) * r)); }
      const cA = new THREE.Color(0x9cb84a), cB = new THREE.Color(0x56782a), cc = new THREE.Color();
      for (const p of sw) {
        const len = Math.min(p.y + 0.05, 1.8 + RW() * 2.4), segs = 4, w = 0.2 + RW() * 0.06, rot = RW() * Math.PI;
        cc.copy(cA).lerp(cB, RW());
        const drift = V3((RW() - 0.5) * 0.3, 0, (RW() - 0.5) * 0.3);
        for (const r2 of [rot, rot + Math.PI / 2]) {
          const pos = [], uv = [], col = [];
          const dx = Math.cos(r2) * w / 2, dz = Math.sin(r2) * w / 2;
          for (let i = 0; i < segs; i++) for (const [ia, ib] of [[i, i + 1]]) {
            const quad = [];
            for (const [ii, sd] of [[ia, -1], [ia, 1], [ib, 1], [ib, -1]]) {
              const v = ii / segs, y = p.y - v * len, d = drift.clone().multiplyScalar(v * v);
              quad.push([p.x + d.x + sd * dx, y, p.z + d.z + sd * dz, (sd + 1) / 2, v]);
            }
            for (const k of [0, 1, 2, 0, 2, 3]) { const q = quad[k]; pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); col.push(cc.r, cc.g, cc.b); }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          g.computeVertexNormals();
          strands.push(g);
        }
      }
      const sm = new THREE.MeshStandardMaterial({ map: strandTexture(), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75 });
      sm.onBeforeCompile = sway(0.22); sm.customProgramCacheKey = () => 'pondWillow';
      sm.map.wrapS = THREE.ClampToEdgeWrapping;
      const spots = willowSpots.map(([x, z, s, r]) => [x, BANK_Y, z, r, s * 1.05]);
      inst(mergeVC(wood), bark, spots, root, { refl: true, cast: false });
      inst(mergeVC(strands), sm, spots, root, { refl: true });
    }
    // frangipani: crooked limbs, leaf rosettes at the tips, clusters of five-petalled flowers
    {
      const RF = rng(515);
      const wood = [], leaves = [], flowers = [];
      const leaf = petalGeo(0.36, 0.085, { cup: 0.35, bend: 0.22, base: 0x3f6a2a, tip: 0x5a8a34, segL: 5, segW: 2, point: 0.55 });
      const pet = petalGeo(0.06, 0.03, { cup: 0.2, bend: 0.25, base: 0xffd24a, tip: 0xfffaf0, tipPow: 0.6, segL: 3, segW: 2, point: 0.5 });
      const flower = mergeVC(Array.from({ length: 5 }, (_, k) => { const g = pet.clone(); g.rotateZ(0.25); g.rotateX(1.25); g.rotateY((k / 5) * TAU); return g; }));
      const grow = (a, dir, len, r, depth) => {
        const b = a.clone().addScaledVector(dir, len);
        const mid = a.clone().lerp(b, 0.5).add(V3((RF() - 0.5) * 0.2, 0.05, (RF() - 0.5) * 0.2));
        wood.push(taperTube([a, mid, b], r, r * 0.68, 6, 7));
        if (depth === 0) {
          const nl = 9;
          for (let k = 0; k < nl; k++) { const g = leaf.clone(); g.rotateX(0.9 + RF() * 0.4); g.rotateY((k / nl) * TAU + RF() * 0.3); g.translate(b.x, b.y, b.z); leaves.push(g); }
          const nf = 5 + Math.floor(RF() * 4);
          for (let k = 0; k < nf; k++) {
            const a2 = RF() * TAU, rr = RF() * 0.12, g = flower.clone();
            g.rotateX((RF() - 0.5) * 0.6); g.rotateY(RF() * TAU); g.translate(b.x + Math.cos(a2) * rr, b.y + 0.12 + RF() * 0.08, b.z + Math.sin(a2) * rr);
            flowers.push(g);
          }
          return;
        }
        const n = depth === 2 ? 4 : 2 + Math.floor(RF() * 2);
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * TAU + RF() * 0.8, up = 0.55 + RF() * 0.35;
          const d = V3(Math.cos(ang) * (1 - up) + dir.x * 0.3, up, Math.sin(ang) * (1 - up) + dir.z * 0.3).normalize();
          grow(b, d, len * (0.7 + RF() * 0.2), r * 0.62, depth - 1);
        }
      };
      grow(V3(0, -0.2, 0), V3(0.05, 1, 0).normalize(), 1.6, 0.2, 2);
      const spots = frangiSpots.map(([x, z, s, r]) => [x, BANK_Y, z, r, s * 1.05]);
      inst(mergeVC(wood), bark, spots, root, { refl: true });
      const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
      inst(mergeVC(leaves), lm, spots, root, { refl: true });
      const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x3a3020 });
      inst(mergeVC(flowers), fm, spots, root, { colors: (i) => _c.set(i % 3 === 1 ? 0xffc0d0 : 0xffffff).clone() });
    }
  }

  /* =====================================================================
     7. THE WORLD BEYOND — hills, hilltop temples, village lights, the moon, sky lanterns
     ===================================================================== */
  {
    const hills = [];
    const ring = (rx, rz, hMin, hMax, seed, colB, colTop, fringe) => {
      const RH = rng(seed), N = 300, ph = Array.from({ length: 6 }, () => RH() * TAU);
      const H = (a) => {
        let v = 0.5 + 0.28 * Math.sin(2 * a + ph[0]) + 0.17 * Math.sin(5 * a + ph[1]) + 0.1 * Math.sin(11 * a + ph[2]) + 0.05 * Math.sin(23 * a + ph[3]);
        v = Math.max(0, Math.min(1, v));
        return hMin + (hMax - hMin) * v * v + fringe * (0.5 + 0.5 * Math.sin(97 * a + ph[4])) * (0.5 + 0.5 * Math.sin(151 * a + ph[5]));
      };
      const pos = [], col = [];
      const cB = new THREE.Color(colB), cT = new THREE.Color(colTop);
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
        const P = (a, k, y) => [Math.cos(a) * rx * k, y, Math.sin(a) * rz * k];
        const h0 = H(a0), h1 = H(a1);
        const rows = [[0.9, BANK_Y - 1, cB], [0.965, null, cB], [1.0, 'top', cT], [1.05, 'back', cB]];
        for (let r = 0; r < rows.length - 1; r++) {
          const yA = (row, h) => (row[1] === 'top' ? h : row[1] === 'back' ? h * 0.55 : row[1] === null ? h * 0.62 : row[1]);
          const q = [[...P(a0, rows[r][0], yA(rows[r], h0)), rows[r][2]], [...P(a1, rows[r][0], yA(rows[r], h1)), rows[r][2]],
            [...P(a1, rows[r + 1][0], yA(rows[r + 1], h1)), rows[r + 1][2]], [...P(a0, rows[r + 1][0], yA(rows[r + 1], h0)), rows[r + 1][2]]];
          for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], q[k][1], q[k][2]); col.push(q[k][3].r, q[k][3].g, q[k][3].b); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      hills.push(g);
      return H;
    };
    const H1 = ring(105, 88, 3, 16, 11, 0x0b1018, 0x141d2a, 2.2);
    const H2 = ring(150, 130, 8, 34, 23, 0x101826, 0x1a2638, 1.2);
    ring(215, 190, 14, 60, 37, 0x18223a, 0x22304a, 0.6);
    const hm = new THREE.MeshBasicMaterial({ vertexColors: true });
    const hmesh = new THREE.Mesh(mergeGeometries(hills), hm); hmesh.layers.enable(REFL); root.add(hmesh);
    // hilltop temples (dark silhouettes, a few lit windows) + village lights at the foot of the near hills — all off axis
    const lights = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3, x = Math.cos(a) * 150 * 0.985, z = Math.sin(a) * 130 * 0.985;
      if (!offAxis(x, z, 24)) continue;
      const y = H2(a) * 0.98, s = 0.7 + R() * 0.5;
      Bq.put(M.silh, T(chediLo.body, x, y - 1, z, 0, 0, 0, s));
      Bq.put(M.silh, T(chediLo.gold, x, y - 1, z, 0, 0, 0, s));
      for (let k = 0; k < 6; k++) lights.push([x + (R() - 0.5) * 8, y + R() * 2, z + (R() - 0.5) * 8, 1]);
    }
    for (let i = 0; i < 420; i++) {
      const a = R() * TAU, k = 0.8 + R() * 0.15, x = Math.cos(a) * 105 * k, z = Math.sin(a) * 88 * k;
      if (!offAxis(x, z, 22)) continue;
      const y = BANK_Y + R() * Math.max(0.5, H1(a) * 0.35);
      lights.push([x, y, z, 0]);
    }
    const pos = new Float32Array(lights.length * 3), kind = new Float32Array(lights.length);
    lights.forEach(([x, y, z, k], i) => { pos.set([x, y, z], i * 3); kind[i] = k + R() * 0.9; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    const lm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPR },
      vertexShader: `uniform float uTime; uniform float uPR; attribute float kind; varying vec3 vC;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.75 + 0.25 * sin(uTime * (0.5 + fract(kind * 7.0)) + kind * 40.0);
          vC = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.85, 0.55), fract(kind * 3.0)) * tw * 0.9;
          gl_PointSize = uPR * clamp(140.0 / -mv.z, 1.2, 4.0); }`,
      fragmentShader: `varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vC * a, a); }` });
    const lp = new THREE.Points(geo, lm); lp.frustumCulled = false; root.add(lp);

    // the moon + its halo
    const md = V3(Math.cos(MOON_EL) * Math.cos(MOON_AZ), Math.sin(MOON_EL) * 0.6, Math.cos(MOON_EL) * Math.sin(MOON_AZ)).normalize();
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: moonTexture(), color: glowCol(0xfff6e6, 1.5), transparent: true, fog: false, depthWrite: false }));
    moon.position.copy(md).multiplyScalar(330); moon.lookAt(0, 0, 0); moon.layers.enable(REFL); moon.renderOrder = -1;
    root.add(moon);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x8090b8, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.position.copy(md).multiplyScalar(335); halo.lookAt(0, 0, 0); halo.renderOrder = -1; root.add(halo);

    // sky lanterns (khom loi) rising far off to the sides
    {
      const n = 46, p = new Float32Array(n * 3), sd = new Float32Array(n * 2);
      let i = 0, guard = 0;
      while (i < n && guard++ < 2000) {
        const a = R() * TAU, r = 70 + R() * 70, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85;
        if (!offAxis(x, z, 28)) continue;
        p.set([x, 0, z], i * 3); sd.set([R(), 0.5 + R() * 0.6], i * 2); i++;
      }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(p, 3)); g2.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
      const m2 = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPR },
        vertexShader: `uniform float uTime; uniform float uPR; attribute vec2 sd; varying float vA;
          void main() { float H = 90.0; float t = mod(uTime * sd.y * 0.9 + sd.x * H, H);
            vec3 p = position + vec3(sin(uTime * 0.05 + sd.x * 9.0) * 6.0 + t * 0.35, 4.0 + t, cos(uTime * 0.04 + sd.x * 7.0) * 6.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            vA = smoothstep(0.0, 8.0, t) * (1.0 - smoothstep(55.0, 90.0, t)) * (0.8 + 0.2 * sin(uTime * 3.0 + sd.x * 50.0));
            gl_PointSize = uPR * clamp(260.0 / -mv.z, 1.5, 6.0); }`,
        fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.6, 0.25) * a * vA * 1.4, a * vA); }` });
      const sl = new THREE.Points(g2, m2); sl.frustumCulled = false; root.add(sl);
    }
  }

  /* =====================================================================
     8. LIFE ON THE WATER — lotus lanterns, mist, fireflies
     ===================================================================== */
  // floating lotus lanterns: each drifts on its own slow loop in open water, off the ball's line
  {
    const L = [];
    const bodyParts = [];
    bodyParts.push(vc(new THREE.CylinderGeometry(0.2, 0.17, 0.07, 14).translate(0, 0.035, 0), 0x3f6a2a));
    for (let k = 0; k < 8; k++) { const c = new THREE.ConeGeometry(0.06, 0.2, 4); c.rotateX(Math.PI / 2); c.translate(0, 0.04, 0.22); c.rotateY((k / 8) * TAU + 0.2); bodyParts.push(vc(c, 0x4f7a32)); }
    const pr = [];
    petalRing(pr, 8, 0.13, 0.06, 0.75, 0.1, 0.06, 0, { cup: 0.6, bend: 0.1, base: 0xfff8f0, tip: 0xff9cc0, segL: 4, segW: 3 });
    petalRing(pr, 6, 0.11, 0.05, 0.4, 0.06, 0.07, 0.5, { cup: 0.6, bend: 0.05, base: 0xfff8f0, tip: 0xffb8d0, segL: 4, segW: 3 });
    bodyParts.push(...pr);
    bodyParts.push(vc(new THREE.CylinderGeometry(0.022, 0.024, 0.12, 8).translate(0, 0.13, 0), 0xfff4dc));
    for (let k = 0; k < 3; k++) bodyParts.push(vc(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 3).translate(0.05 * Math.cos(k * 2), 0.18, 0.05 * Math.sin(k * 2)), 0x8a3a20));
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x3a2418 });
    const flame = new THREE.ConeGeometry(0.018, 0.07, 6).translate(0, 0.225, 0);
    let guard = 0;
    while (L.length < 24 && guard++ < 3000) {
      const cx = (R() * 2 - 1) * (A - 5), cz = (R() * 2 - 1) * (B - 4), ax = 1 + R() * 3, az = 0.8 + R() * 2;
      let ok = true;
      for (let k = 0; k < 12 && ok; k++) {
        const t = (k / 12) * TAU, x = cx + Math.cos(t) * ax, z = cz + Math.sin(t) * az;
        if (pondR(x, z) > 0.86 || onDeck(x, z, 1.2) || onBridge(x, z, 1.2) || nearIsland(x, z, 0.8) || nearPole(x, z, 1.2) || !offAxis(x, z, 12)) ok = false;
      }
      if (ok && L.every((l) => Math.hypot(l.cx - cx, l.cz - cz) > 3.5)) L.push({ cx, cz, ax, az, ph: R() * TAU, sp: (0.025 + R() * 0.03) * (R() < 0.5 ? -1 : 1), s: 1.15 + R() * 0.3 });
    }
    const body = new THREE.InstancedMesh(mergeVC(bodyParts), bm, L.length);
    const fl = new THREE.InstancedMesh(flame, new THREE.MeshBasicMaterial({ color: glowCol(0xffd690, 3.0) }), L.length);
    for (const m of [body, fl]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; root.add(m); }
    fl.layers.enable(REFL);
    // halos + light on the water
    const hp = new Float32Array(L.length * 3);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    const hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPR },
      vertexShader: `uniform float uTime; uniform float uPR; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.55 + 0.1 * sin(uTime * 11.0 + position.x * 3.0) + 0.06 * sin(uTime * 23.0 + position.z * 5.0);
          gl_PointSize = uPR * 1.1 * 520.0 / max(-mv.z, 0.5); }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a; gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * a * vA, a * vA); }` });
    const halos = new THREE.Points(hg, hm); halos.frustumCulled = false; root.add(halos);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffa050, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), L.length);
    pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pool.frustumCulled = false; pool.renderOrder = 3; root.add(pool);
    ticks.push((t) => {
      L.forEach((l, i) => {
        const a = l.ph + t * l.sp, x = l.cx + Math.cos(a) * l.ax, z = l.cz + Math.sin(a) * l.az, y = WATER_Y + 0.005 + Math.sin(t * 1.1 + l.ph) * 0.01;
        _o.position.set(x, y, z); _o.rotation.set(Math.sin(t * 0.9 + l.ph) * 0.03, a * 0.6, Math.cos(t * 0.8 + l.ph) * 0.03); _o.scale.setScalar(l.s); _o.updateMatrix();
        body.setMatrixAt(i, _o.matrix);
        const fk = 0.85 + 0.15 * Math.sin(t * 13 + l.ph * 5) + 0.08 * Math.sin(t * 29 + l.ph);
        _o.scale.set(l.s, l.s * fk, l.s); _o.updateMatrix(); fl.setMatrixAt(i, _o.matrix);
        hp[i * 3] = x; hp[i * 3 + 1] = y + 0.27 * l.s; hp[i * 3 + 2] = z;
        _o.position.set(x, WATER_Y + 0.006, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(2.2); _o.updateMatrix(); pool.setMatrixAt(i, _o.matrix);
      });
      body.instanceMatrix.needsUpdate = fl.instanceMatrix.needsUpdate = pool.instanceMatrix.needsUpdate = true;
      hg.attributes.position.needsUpdate = true;
    });
  }
  // mist: soft wisps lying on the water, drifting (camera-facing, faded near the camera)
  {
    const spots = [];
    for (let i = 0; i < 46; i++) {
      let x, z;
      if (i % 3) { const t = R() * TAU, [rx, rz] = rim(t), k = 0.78 + R() * 0.18; x = rx * k; z = rz * k; }
      else { x = (R() * 2 - 1) * A * 0.85; z = (R() * 2 - 1) * B * 0.85; }
      if (onDeck(x, z, 3) || pondR(x, z) > 1.05 || !offAxis(x, z, 10)) continue;
      spots.push([x, z, 5 + R() * 7, R() * TAU]);
    }
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = new THREE.PlaneGeometry(1, 1).index; ig.setAttribute('position', new THREE.PlaneGeometry(1, 1).attributes.position);
    ig.setAttribute('aM', new THREE.InstancedBufferAttribute(new Float32Array(spots.flat()), 4));
    ig.instanceCount = spots.length;
    const mm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: { uTime, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: `uniform float uTime; attribute vec4 aM; varying vec2 vP; varying float vA; varying float vS;
        #include <fog_pars_vertex>
        void main() {
          vec3 c = vec3(aM.x + sin(uTime * 0.03 + aM.w) * 2.5, ${(WATER_Y + 0.05).toFixed(2)} + aM.z * 0.09, aM.y + cos(uTime * 0.025 + aM.w) * 1.5);
          vec4 mvPosition = viewMatrix * vec4(c, 1.0);
          mvPosition.xy += position.xy * vec2(aM.z, aM.z * 0.24);
          gl_Position = projectionMatrix * mvPosition;
          vP = position.xy; vS = aM.w;
          vA = smoothstep(4.0, 14.0, -mvPosition.z);
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vP; varying float vA; varying float vS;
        #include <fog_pars_fragment>
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float e = 1.0 - smoothstep(0.15, 0.5, length(vP * vec2(1.0, 1.5)));
          float w = n(vP * vec2(5.0, 9.0) + vec2(uTime * 0.05 + vS, vS)) * 0.6 + n(vP * vec2(11.0, 17.0) - vec2(uTime * 0.03, 0.0)) * 0.4;
          float a = e * w * vA * 0.13;
          gl_FragColor = vec4(vec3(0.62, 0.68, 0.86), a);
          #include <fog_fragment>
        }` });
    const mist = new THREE.Mesh(ig, mm); mist.frustumCulled = false; mist.renderOrder = 5; root.add(mist);
  }
  // fireflies in the willows, reeds and on the islands (kept off the ball's line)
  {
    const pts = [];
    for (const [x, z] of willowSpots) for (let k = 0; k < 22; k++) pts.push([x + (R() - 0.5) * 6, BANK_Y + 0.6 + R() * 3.5, z + (R() - 0.5) * 6]);
    for (const [x, z] of ISLANDS) for (let k = 0; k < 18; k++) pts.push([x + (R() - 0.5) * 7, BANK_Y + 0.4 + R() * 2.5, z + (R() - 0.5) * 7]);
    for (let k = 0; k < 140; k++) { const t = R() * TAU, [rx, rz] = rim(t), s = 0.92 + R() * 0.2; pts.push([rx * s, WATER_Y + 0.4 + R() * 2.0, rz * s]); }
    const ok = pts.filter(([x, , z]) => offAxis(x, z, 12) && !onDeck(x, z, 2));
    const ff = makeFireflies(ok, uTime, [0.85, 1.0, 0.5]);
    root.add(ff);
    ticks.push(() => { ff.material.uniforms.uScale.value = uPR.value * 0.8; });
  }

  Bq.build(root, { refl: true });
  // the warm lit materials don't need the mirror's lights to look right; nothing else to do
  const skyTex = paintSky(rng(1234));
  const look = { night: { sky: skyTex, envI: 0.3, bgI: 1.0, fog: 0x0e1730, hemiSky: 0x40508a, hemiGround: 0x121219, hemiI: 0.5, exposure: 1.1, bloom: 0.62 } };
  look.day = look.night;
  const fog = { night: [38, 300], day: [38, 300] };
  function update(dt, t, pr = 1) { uPR.value = pr; for (const f of ticks) f(t, dt); }
  return { group: root, update, look, fog };
}
