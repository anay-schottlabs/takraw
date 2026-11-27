// PARIS NIGHT — the court is set up on a stone esplanade on the Right Bank, looking across the Seine at the Eiffel Tower
// (the Trocadéro view: court → quay → Pont d'Iéna → tower, all on one axis at x = 0, square to the match cameras).
//   −z: a row of Haussmann buildings — limestone, wrought-iron balconies, mansard roofs with dormers and chimney pots, lit
//       windows — with two café terraces under awnings, plane trees, street lamps, a Morris column and a Guimard métro.
//   +z: benches and lamps along the quay parapet, the Seine with bateaux-mouches gliding by, the Pont d'Iéna, and on the far
//       bank the floodlit tower (gold lattice, a rotating beacon, and the white sparkle for ten seconds every 50 s).
//   ±x: both ends of the esplanade close with a double row of plane trees, so the match cameras (`game` / `game2`, looking
//       along x) see calm dark foliage behind the ball; the tower and everything bright sit well off their axes.
// Everything static is merged per material (makeBatch) or instanced; eye candy (halos, light pools, reflections, the beacon,
// the sparkle, haze) lives in `fx`, which is hidden on Low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, makeWater, floodPoles, paint, vcMat } from './props.js';
import { personGeometry } from './life.js';

const GY = -0.12;                       // esplanade paving (the court deck sits 0.12 above it)
const WATER_Y = -4.6;                   // the Seine
const GF = 4.4, FL = 3.0, BAY = 2.9;    // Haussmann: ground floor, upper floors, window bay (m)
const HT = GF + 5 * FL;                 // facade height the texture atlas covers (ground + 5 floors)
const TOWER_H = 96;
const SPARKLE_EVERY = 50, SPARKLE_FOR = 10, SPARKLE_AT = 14;   // seconds

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const canvasTex = (c, { srgb = true, repeat = false, aniso = 4 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
};
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b);   // linear colour (may exceed 1 for glow)

/** Flat quad (non-indexed, normal + uv): corners a b c d counter-clockwise seen from the front. */
function quad(a, b, c, d, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]].flat(), 2));
  g.computeVertexNormals();
  return g;
}
/** Triangle fan polygon (non-indexed, normal + uv from x/z or z/y). */
function fan(pts) {
  const p = [];
  for (let i = 1; i < pts.length - 1; i++) p.push(pts[0], pts[i], pts[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.z * 0.5, v.y * 0.5]), 2));
  g.computeVertexNormals();
  return g;
}
/** A box beam from a to b (square section t). */
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bz = new THREE.Vector3(0, 0, 1), _bd = new THREE.Vector3(), _bc = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function beam(a, b, t) {
  _bd.subVectors(b, a); const len = _bd.length();
  if (len < 1e-4) return null;
  const g = new THREE.BoxGeometry(t, t, len).toNonIndexed();
  _bq.setFromUnitVectors(_bz, _bd.multiplyScalar(1 / len));
  g.applyMatrix4(_bm.compose(_bc.addVectors(a, b).multiplyScalar(0.5), _bq, _one));
  return g;
}

/* ============================== textures ============================== */

/** Haussmann facades: 4 variants in a 2048² atlas (2 × 2), each 8 bays × (ground floor + 5 floors). [colour, emissive] */
function facadeAtlas(seed) {
  const R = rnd(seed), S = 2048, VW = 1024, VH = 1024, PY = VH / HT, PX = 128 / BAY;
  const c = canvas(S, S), e = canvas(S, S), g = c.getContext('2d'), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const stone = ['#d3c6ab', '#dccfb4', '#cdbfa2', '#d8cbb1'];
  const warm = () => ['#ffcf86', '#ffe0a8', '#ffc070', '#ffd9a0', '#ffe8c0', '#a8c4ff'][Math.floor(R() * (R() < 0.1 ? 6 : 5))];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * VW, oy = Math.floor(v / 2) * VH;
    const Y = (m) => oy + VH - m * PY;
    g.fillStyle = stone[v]; g.fillRect(ox, oy, VW, VH);
    for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(70,58,44,${(R() * 0.06).toFixed(3)})`; g.fillRect(ox + R() * VW, oy + R() * VH, 2 + R() * 50, 6 + R() * 80); }
    g.fillStyle = 'rgba(70,60,50,0.4)';
    for (let m = 0.55; m < GF; m += 0.55) g.fillRect(ox, Y(m) - 1, VW, 3);                 // rusticated ground floor
    g.fillStyle = 'rgba(80,70,60,0.13)';
    for (let m = GF + 0.5; m < HT; m += 0.5) g.fillRect(ox, Y(m), VW, 1);                   // ashlar courses
    for (let b = 0; b < 8; b++) {
      const cx = ox + b * 128 + 64;
      // ---- ground floor: café / shop / closed shopfront / carriage door, with a sign band
      const kind = v === 0 ? (b === 4 ? 'door' : 'cafe') : (() => { const r = R(); return r < 0.18 ? 'door' : r < 0.55 ? 'shop' : r < 0.7 ? 'cafe' : 'closed'; })();
      const ow = 2.35 * PX, x0 = cx - ow / 2, top = Y(3.3), bot = Y(0.12);
      const frame = ['#3b1c1a', '#1d3327', '#1b2535', '#2a2420'][Math.floor(R() * 4)];
      if (kind === 'door') {
        const dw = 2.0 * PX, dx = cx - dw / 2, dt = Y(3.7);
        g.fillStyle = 'rgba(255,248,230,0.3)'; g.fillRect(dx - 8, dt - 8, dw + 16, bot - dt + 8);
        g.fillStyle = ['#1c2a36', '#24301f', '#3a2418'][Math.floor(R() * 3)]; g.fillRect(dx, dt, dw, bot - dt);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - 1.5, dt + 30, 3, bot - dt - 30);
        for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(dx + 6, dt + 34 + k * ((bot - dt - 40) / 4), dw / 2 - 10, (bot - dt - 52) / 4); g.strokeRect(cx + 4, dt + 34 + k * ((bot - dt - 40) / 4), dw / 2 - 10, (bot - dt - 52) / 4); }
        ge.fillStyle = '#6a4a22'; ge.fillRect(dx + 4, dt + 4, dw - 8, 22);                    // lit fanlight
        g.fillStyle = '#7a6040'; g.fillRect(dx + 4, dt + 4, dw - 8, 22);
      } else if (kind === 'closed') {
        g.fillStyle = frame; g.fillRect(x0, top, ow, bot - top);
        g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 18; k++) g.fillRect(x0 + 4, top + 6 + k * ((bot - top - 8) / 18), ow - 8, 2);
      } else {
        g.fillStyle = frame; g.fillRect(x0 - 6, top - 6, ow + 12, bot - top + 6);
        const glass = kind === 'cafe' ? ['#ffb766', '#ffc27a'][Math.floor(R() * 2)] : ['#ffe2b0', '#fff2d8', '#ffd38f'][Math.floor(R() * 3)];
        g.fillStyle = '#8a6a44'; g.fillRect(x0, top, ow, bot - top - 26);
        ge.fillStyle = glass; ge.fillRect(x0, top, ow, bot - top - 26);
        ge.fillStyle = 'rgba(0,0,0,0.32)';
        for (let k = 0; k < (kind === 'cafe' ? 3 : 4); k++) {                               // patrons / goods silhouettes
          const px = x0 + 8 + R() * (ow - 24), ph = kind === 'cafe' ? 26 + R() * 18 : 12 + R() * 22;
          if (kind === 'cafe') { ge.beginPath(); ge.arc(px + 8, bot - 26 - ph - 8, 7, 0, Math.PI * 2); ge.fill(); ge.fillRect(px, bot - 26 - ph, 16, ph); }
          else ge.fillRect(px, bot - 26 - ph, 14 + R() * 14, ph);
        }
        g.fillStyle = frame; g.fillRect(x0, bot - 26, ow, 26);                                // stall riser
        for (const cc of [g, ge]) { cc.fillStyle = cc === g ? frame : '#000'; cc.fillRect(cx - 2, top, 4, bot - top); for (const t of [0.22]) cc.fillRect(x0, top + (bot - top) * t, ow, 3); }
      }
      // sign band
      if (kind !== 'door') {
        const sb = Y(3.95), sh = Y(3.42) - sb;
        g.fillStyle = frame; g.fillRect(x0 - 6, sb, ow + 12, sh);
        g.fillStyle = '#d8b060'; ge.fillStyle = '#5a4018';
        const n = 4 + Math.floor(R() * 5), lw = 9, gap = 4, tw = n * (lw + gap);
        for (let k = 0; k < n; k++) { g.fillRect(cx - tw / 2 + k * (lw + gap), sb + sh * 0.25, lw, sh * 0.5); ge.fillRect(cx - tw / 2 + k * (lw + gap), sb + sh * 0.25, lw, sh * 0.5); }
      }
      // ---- upper floors: tall French windows with stone surrounds; painted balconettes on floors 1, 3, 4
      for (let f = 1; f <= 5; f++) {
        const fy = GF + (f - 1) * FL, wm = f === 5 ? 1.05 : 1.2, w = wm * PX, wx = cx - w / 2;
        const wt = Y(fy + (f === 5 ? 2.25 : 2.45)), wb = Y(fy + 0.32), hpx = wb - wt;
        g.fillStyle = 'rgba(255,248,232,0.33)'; g.fillRect(wx - 7, wt - 7, w + 14, hpx + 9);
        g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(wx - 10, wb + 2, w + 20, 5);
        if (f === 2) {                                                                          // pediments on the "étage noble"
          g.fillStyle = 'rgba(255,248,232,0.45)'; g.beginPath();
          if (b % 2) { g.moveTo(wx - 12, wt - 10); g.lineTo(cx, wt - 30); g.lineTo(wx + w + 12, wt - 10); }
          else { g.moveTo(wx - 12, wt - 10); g.quadraticCurveTo(cx, wt - 36, wx + w + 12, wt - 10); }
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(60,50,40,0.4)'; g.fillRect(wx - 12, wt - 10, w + 24, 3);
        } else { g.fillStyle = 'rgba(255,248,232,0.5)'; g.fillRect(cx - 5, wt - 13, 10, 13); }
        const lit = R() < 0.44;
        if (lit) {
          g.fillStyle = '#8a6a44'; g.fillRect(wx, wt, w, hpx);
          ge.fillStyle = warm(); ge.fillRect(wx, wt, w, hpx);
          ge.fillStyle = 'rgba(0,0,0,0.38)'; ge.fillRect(wx, wt, w * 0.2, hpx); ge.fillRect(wx + w * 0.8, wt, w * 0.2, hpx);   // curtains
          if (R() < 0.3) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(wx + w * 0.3, wt + hpx * 0.35, w * 0.25, hpx * 0.5); }
        } else {
          const gr = g.createLinearGradient(0, wt, 0, wb); gr.addColorStop(0, '#34404c'); gr.addColorStop(1, '#151a21');
          g.fillStyle = gr; g.fillRect(wx, wt, w, hpx);
        }
        for (const cc of [g, ge]) {
          cc.fillStyle = cc === g ? '#e4ddcc' : '#000';
          cc.fillRect(wx, wt, w, 2); cc.fillRect(wx, wb - 2, w, 2); cc.fillRect(wx, wt, 2, hpx); cc.fillRect(wx + w - 2, wt, 2, hpx);
          cc.fillRect(cx - 1.5, wt, 3, hpx); cc.fillRect(wx, wt + hpx * 0.34, w, 2); cc.fillRect(wx, wt + hpx * 0.67, w, 2);
        }
        if (f === 1 || f === 3 || f === 4) {                                                    // balconette railing
          const bw = w + 10, bx = cx - bw / 2, bt = Y(fy + 1.25), bb = Y(fy + 0.3);
          for (const cc of [g, ge]) {
            cc.fillStyle = cc === g ? '#141619' : '#000';
            cc.fillRect(bx, bt, bw, 3); cc.fillRect(bx, bb - 3, bw, 3); cc.fillRect(bx, bt + (bb - bt) * 0.55, bw, 2);
            for (let x = bx; x <= bx + bw; x += 5) cc.fillRect(x, bt, 1.4, bb - bt);
          }
        }
      }
    }
    // the street lamps' warm wash on the lower floors (emissive)
    const gr = ge.createLinearGradient(0, Y(0), 0, Y(10));
    gr.addColorStop(0, 'rgba(255,160,80,0.2)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    ge.globalCompositeOperation = 'lighter'; ge.fillStyle = gr; ge.fillRect(ox, Y(10), VW, Y(0) - Y(10)); ge.globalCompositeOperation = 'source-over';
  }
  return [canvasTex(c, { aniso: 8 }), canvasTex(e, { aniso: 8 })];
}

/** Wrought-iron balcony railing, as an alpha map (1 m wide tile). */
function railingAlpha() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.fillRect(0, 0, 256, 14); g.fillRect(0, 244, 256, 12); g.fillRect(0, 170, 256, 7);
  for (let x = 0; x < 256; x += 16) g.fillRect(x + 6, 0, 4, 256);
  g.lineWidth = 4;
  for (let x = 0; x < 256; x += 32) {                                                   // scrolls between the bars
    g.beginPath(); g.arc(x + 16, 207, 12, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(x + 16, 92, 10, 40, 0, 0, Math.PI * 2); g.stroke();
  }
  const t = canvasTex(c, { srgb: false, repeat: true, aniso: 4 });
  return t;
}

/** Eiffel lattice panel: border, big X, a finer diagonal mesh (white on transparent; tinted gold by the material). */
function latticeTex() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.moveTo(128, 0); g.lineTo(0, 128); g.stroke();
  g.globalAlpha = 0.5; g.lineWidth = 2; g.beginPath();
  for (let k = -128; k <= 128; k += 18) { g.moveTo(k, 0); g.lineTo(k + 128, 128); g.moveTo(128 - k, 0); g.lineTo(-k, 128); }
  g.stroke();
  g.globalAlpha = 0.85; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  return canvasTex(c, { repeat: true });
}

/** Zinc roofing: standing seams. */
function zincTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#7c8792'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(30,36,44,${(Math.random() * 0.08).toFixed(3)})`; g.fillRect(Math.random() * 256, Math.random() * 256, 30, 6 + Math.random() * 40); }
  for (let x = 0; x < 256; x += 64) { g.fillStyle = '#a4aeb8'; g.fillRect(x, 0, 4, 256); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, 0, 3, 256); }
  return canvasTex(c, { repeat: true });
}

/** Café awnings: two rows — [slope stripes + valance with the name] for each café. */
function awningTex() {
  const c = canvas(1024, 512), g = c.getContext('2d');
  const cafes = [{ a: '#8e1b1f', b: '#efe4cc', name: 'CAFÉ DE LA SEINE' }, { a: '#1c4a34', b: '#e8dcc0', name: 'BRASSERIE DU TAKRAW' }];
  cafes.forEach((cf, i) => {
    const y0 = i * 256;
    g.fillStyle = cf.a; g.fillRect(0, y0, 1024, 192);
    if (i === 0) { g.fillStyle = cf.b; for (let x = 0; x < 1024; x += 64) g.fillRect(x, y0, 32, 192); }
    else { g.fillStyle = cf.b; for (let x = 0; x < 1024; x += 48) g.fillRect(x, y0, 5, 192); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y0 + 184, 1024, 8);
    g.fillStyle = cf.a; g.fillRect(0, y0 + 192, 1024, 64);
    g.fillStyle = cf.b; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(cf.name, 512, y0 + 224);
  });
  return canvasTex(c, { aniso: 8 });
}

/** Posters around the Morris column / on the kiosk. */
function posterTex() {
  const c = canvas(1024, 256), g = c.getContext('2d');
  g.fillStyle = '#1f3a2c'; g.fillRect(0, 0, 1024, 256);
  const P = [['OPÉRA', '#b8222a', '#f2e2b0'], ['TAKRAW', '#f2c12e', '#1a1a1a'], ['CIRQUE', '#1f5fa8', '#ffffff'], ['JAZZ', '#111111', '#ff9a3a'],
    ['CINÉMA', '#e8e0d0', '#8a1e17'], ['EXPO', '#2f8a5a', '#f2f2f2'], ['BALLET', '#6a2a8a', '#ffd0f0'], ['THÉÂTRE', '#d86a2a', '#1a1a1a']];
  P.forEach(([t, bg, fg], i) => {
    const x = i * 128 + 6;
    g.fillStyle = bg; g.fillRect(x, 10, 116, 236);
    g.fillStyle = fg; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.fillText(t, x + 58, 52);
    g.fillRect(x + 18, 80, 80, 3);
    g.globalAlpha = 0.6; for (let k = 0; k < 6; k++) g.fillRect(x + 20, 110 + k * 20, 40 + ((i * 7 + k * 13) % 36), 6); g.globalAlpha = 1;
    g.beginPath(); g.arc(x + 58, 210, 18, 0, Math.PI * 2); g.fill();
  });
  return canvasTex(c, { aniso: 4 });
}

/** The cabin windows of a bateau-mouche: warm light, mullions, passengers. */
function cabinTex() {
  const c = canvas(512, 64), g = c.getContext('2d'), R = rnd(31);
  const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#ffe6b8'); gr.addColorStop(1, '#ffb45a');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 64);
  g.fillStyle = 'rgba(40,24,16,0.85)';
  for (let i = 0; i < 26; i++) { const x = R() * 512; g.beginPath(); g.arc(x, 34, 5, 0, Math.PI * 2); g.fill(); g.fillRect(x - 6, 38, 12, 26); }
  g.fillStyle = '#2a2a30'; for (let x = 0; x < 512; x += 32) g.fillRect(x, 0, 4, 64);
  g.fillRect(0, 0, 512, 5); g.fillRect(0, 52, 512, 12);
  return canvasTex(c, { repeat: true });
}

/** METROPOLITAIN sign. */
function metroTex() {
  const c = canvas(512, 96), g = c.getContext('2d');
  g.fillStyle = '#1f3a2c'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#e8d070'; g.fillRect(8, 8, 496, 80);
  g.fillStyle = '#1f3a2c'; g.fillRect(14, 14, 484, 68);
  g.fillStyle = '#f0d878'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('METROPOLITAIN', 256, 50);
  return canvasTex(c);
}

/* ============================== the map ============================== */

export function buildParis(ctx) {
  const { F, xf, makeBatch, texLoader, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'paris';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(1889);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putW = (mat, geo) => decor.put(mat, geo.index ? geo.toNonIndexed() : geo);    // already in world space
  const tex = (n, rep, srgb) => { const t = texLoader.load(n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

  const [facadeMap, facadeGlow] = facadeAtlas(75);
  const railA = railingAlpha();
  const MAT = {
    paving: new THREE.MeshStandardMaterial({ map: tex('assets/temple/paving_diff.jpg', 1, true), normalMap: tex('assets/temple/paving_nor_gl.jpg', 1), color: 0xcfc6b8, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb4a688, roughness: 0.9, emissive: 0x150e07 }),
    party: new THREE.MeshStandardMaterial({ color: 0x8c8270, roughness: 0.95 }),
    facade: new THREE.MeshStandardMaterial({ map: facadeMap, emissiveMap: facadeGlow, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.9 }),
    zinc: new THREE.MeshStandardMaterial({ map: zincTex(), color: 0x8a96a4, roughness: 0.45, metalness: 0.45 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x131518, alphaMap: railA, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }),
    railGreen: new THREE.MeshStandardMaterial({ color: 0x1f3a2c, alphaMap: railA, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.45, metalness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a84a, roughness: 0.3, metalness: 0.9, emissive: 0x2a1a06 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.5, metalness: 0.6 }),
    awning: new THREE.MeshStandardMaterial({ map: awningTex(), roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.0 }),
    poster: (() => { const t = posterTex(); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.8 }); })(),
    metroSign: new THREE.MeshBasicMaterial({ map: metroTex(), color: new THREE.Color(0.9, 0.9, 0.9) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(1.8) }),
    glowVC: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2, 2, 2) }),
    grass: new THREE.MeshStandardMaterial({ color: 0x24361f, roughness: 1 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 }),
    vc: vcMat(),
    vcFlat: vcMat({ flatShading: true }),
  };
  MAT.awning.emissiveMap = MAT.awning.map;
  const OX = F.outX, OZ = F.outZ;
  const PAR_Z = OZ + 8.5;                 // quay parapet (centre line)
  const RIV0 = PAR_Z + 0.25, RIV1 = RIV0 + 50;   // the Seine
  const BLD_Z = -(OZ + 10);               // our row of buildings (facades face +z)
  const FAR_Z = RIV1 + 15;                // the far bank's row (facades face −z)
  const SIDE_Z = -(OZ + 4.6);             // trees + lamps along the café pavement
  const TREE_X = OX + 15;                 // the plane-tree rows closing both ends
  const TZ = RIV1 + 118;                  // the tower (x = 0)
  const MX = OX + 7.5, MZ = -(OZ + 5.2);  // métro entrance (stairs run along x)

  /* ---------------- ground: esplanade paving (with the métro hole), far bank, gardens ---------------- */
  const worldUV = (geo, tile) => {                                   // tile the paving in world space (no seams between slabs)
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.5) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    return geo;
  };
  const slab = (mat, x0, x1, z0, z1, top = GY, th = 0.4, tile = 3) => putW(mat, worldUV(xf(new THREE.BoxGeometry(x1 - x0, th, z1 - z0), (x0 + x1) / 2, top - th / 2, (z0 + z1) / 2), tile));
  {
    const zA = BLD_Z - 1, zB = PAR_Z + 0.25, hx = 1.85, hz = 0.9;
    slab(MAT.paving, -230, 230, zA, MZ - hz);
    slab(MAT.paving, -230, 230, MZ + hz, zB);
    slab(MAT.paving, -230, MX - hx, MZ - hz, MZ + hz);
    slab(MAT.paving, MX + hx, 230, MZ - hz, MZ + hz);
    // far bank: quay road, gardens of the Champ de Mars around the tower axis
    slab(MAT.paving, -240, 240, RIV1 - 0.25, RIV1 + 12, GY + 0.3, 0.7, 4);
    slab(MAT.gravel, -240, 240, RIV1 + 12, TZ + 90, GY + 0.28, 0.6, 4);
    for (const s of [-1, 1]) slab(MAT.grass, s > 0 ? 8 : -40, s > 0 ? 40 : -8, RIV1 + 22, TZ - 36, GY + 0.33, 0.6, 4);
  }

  /* ---------------- the quays + parapets ---------------- */
  {
    putW(MAT.stone, xf(new THREE.BoxGeometry(460, GY - WATER_Y + 1.2, 0.6), 0, (GY + WATER_Y - 1.2) / 2, PAR_Z));
    putW(MAT.stone, xf(new THREE.BoxGeometry(480, GY + 0.3 - WATER_Y + 1.2, 0.6), 0, (GY + 0.3 + WATER_Y - 1.2) / 2, RIV1));
    for (const [x0, x1] of [[-230, -7.3], [7.3, 230]]) {
      const len = x1 - x0, cx = (x0 + x1) / 2;
      put(MAT.stone, new THREE.BoxGeometry(len, 0.95, 0.46), cx, GY + 0.475, PAR_Z);
      put(MAT.stone, new THREE.BoxGeometry(len, 0.12, 0.62), cx, GY + 1.0, PAR_Z);
      put(MAT.stone, new THREE.BoxGeometry(len, 0.7, 0.4), cx, GY + 0.65, RIV1);
    }
  }
  const water = makeWater(texLoader, uTime, { w: 470, d: RIV1 - RIV0 + 0.6, color: 0x16222e, opacity: 1, repeat: [34, 4] });
  water.position.set(0, WATER_Y, (RIV0 + RIV1) / 2);
  g.add(water);

  /* ---------------- Pont d'Iéna: three segmental stone arches on the tower axis ---------------- */
  const ARCH = [];                                                        // [a, b] spans (z), for the boat lanes
  {
    const ys = WATER_Y + 0.6, rise = 3.3, span = 15, pier = 2.5;
    for (let i = 0; i < 3; i++) { const a = RIV0 + i * (span + pier); ARCH.push([a, a + span]); }
    const sh = new THREE.Shape();
    sh.moveTo(RIV0 - 0.6, WATER_Y - 1.2); sh.lineTo(RIV0 - 0.6, GY); sh.lineTo(RIV1 + 0.6, GY + 0.3); sh.lineTo(RIV1 + 0.6, WATER_Y - 1.2);
    for (let i = ARCH.length - 1; i >= 0; i--) {
      const [a, b] = ARCH[i], half = (b - a) / 2, mid = (a + b) / 2, Rr = (half * half + rise * rise) / (2 * rise), cy = ys + rise - Rr;
      const th = Math.atan2(ys - cy, half);
      sh.lineTo(b, WATER_Y - 1.2); sh.lineTo(b, ys);
      sh.absarc(mid, cy, Rr, th, Math.PI - th, false);
      sh.lineTo(a, WATER_Y - 1.2);
    }
    sh.lineTo(RIV0 - 0.6, WATER_Y - 1.2);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 14, bevelEnabled: false, curveSegments: 14 });
    bg.clearGroups(); bg.rotateY(-Math.PI / 2); bg.translate(7, 0, 0);
    putW(MAT.stone, bg);
    // parapets, cornice, cutwaters, and the lamp standards
    for (const s of [-1, 1]) {
      const len = RIV1 - RIV0 + 1.2, cz = (RIV0 + RIV1) / 2;
      put(MAT.stone, new THREE.BoxGeometry(0.5, 0.9, len), s * 6.8, GY + 0.6, cz, 0, Math.atan2(0.3, len));
      put(MAT.stone, new THREE.BoxGeometry(0.75, 0.3, len), s * 7.05, GY - 0.25, cz, 0, Math.atan2(0.3, len));
      for (let i = 0; i < 2; i++) {
        const z = ARCH[i][1] + pier / 2;
        put(MAT.stone, new THREE.CylinderGeometry(1.25, 1.25, GY - WATER_Y + 1.0, 3), s * 7.4, (GY + WATER_Y - 1.2) / 2 - 0.4, z, s > 0 ? 0 : Math.PI);
        put(MAT.bronze, new THREE.SphereGeometry(0.55, 8, 6), s * 7.25, GY - 1.4, z);       // the eagles' medallions
      }
    }
  }

  /* ---------------- Haussmann rows: facades, cornices, balconies, mansard roofs, dormers, chimneys ---------------- */
  const glowPts = [];                                                     // lamp halos (fx Points)
  const pools = [];                                                       // light pools on the paving (fx)
  const dormerVC = [], dormerGlow = [];
  function building(bx0, nb, z, face, v, nf, h0 = GY) {
    const w = nb * BAY, bx1 = bx0 + w, h = h0 + GF + nf * FL;
    const o = Math.floor(R() * (8 - nb + 1));
    const ox = (v % 2) * 0.5, oy = Math.floor(v / 2) * 0.5;
    const u0 = ox + (o * 128) / 2048, u1 = ox + ((o + nb) * 128) / 2048;
    const vb = 1 - (oy + 0.5), vt = vb + ((GF + nf * FL) / HT) * 0.5;
    const L = face > 0 ? bx0 : bx1, Rt = face > 0 ? bx1 : bx0;
    const V = (x, y, d) => new THREE.Vector3(x, y, z - face * d);
    putW(MAT.facade, quad(V(L, h0, 0), V(Rt, h0, 0), V(Rt, h, 0), V(L, h, 0), [[u0, vb], [u1, vb], [u1, vt], [u0, vt]]));
    put(MAT.party, new THREE.BoxGeometry(w, h - h0, 13), (bx0 + bx1) / 2, (h + h0) / 2, z - face * 6.56);
    // cornice + string course
    put(MAT.stone, new THREE.BoxGeometry(w + 0.06, 0.4, 0.62), (bx0 + bx1) / 2, h - 0.08, z + face * 0.2);
    put(MAT.stone, new THREE.BoxGeometry(w, 0.24, 0.3), (bx0 + bx1) / 2, h0 + GF + 0.04, z + face * 0.1);
    // continuous balconies on the 2nd and top floors: stone slab + consoles + wrought-iron railing
    for (const f of [2, nf]) {
      const y = h0 + GF + (f - 1) * FL + 0.02, bw = w - 0.5;
      put(MAT.stone, new THREE.BoxGeometry(bw, 0.16, 0.86), (bx0 + bx1) / 2, y, z + face * 0.43);
      for (let i = 0; i < nb; i++) put(MAT.stone, new THREE.BoxGeometry(0.18, 0.34, 0.5), bx0 + (i + 0.5) * BAY + 0.95, y - 0.24, z + face * 0.25);
      const zr = z + face * 0.84;
      putW(MAT.rail, quad(new THREE.Vector3(L + face * 0.25, y + 0.08, zr), new THREE.Vector3(Rt - face * 0.25, y + 0.08, zr), new THREE.Vector3(Rt - face * 0.25, y + 1.08, zr), new THREE.Vector3(L + face * 0.25, y + 1.08, zr), [[0, 0], [bw, 0], [bw, 1], [0, 1]]));
    }
    // mansard: steep lower slope (dormers), shallow upper slope, flat top; end caps close height steps between neighbours
    const P = [[0.45, h + 0.1], [1.55, h + 3.5], [4.2, h + 4.5], [13, h + 4.5]];
    for (let i = 0; i < 3; i++) {
      const [d0, y0] = P[i], [d1, y1] = P[i + 1], sl = Math.hypot(d1 - d0, y1 - y0) / 2;
      putW(MAT.zinc, quad(V(L, y0, d0), V(Rt, y0, d0), V(Rt, y1, d1), V(L, y1, d1), [[0, 0], [w / 2, 0], [w / 2, sl], [0, sl]]));
    }
    for (const xe of [bx0, bx1]) {
      const pts = [V(xe, h + 0.1, 0.45), ...P.slice(1).map(([d, y]) => V(xe, y, d)), V(xe, h + 0.1, 13)];
      if ((xe === bx0) === (face > 0)) pts.reverse();
      putW(MAT.zinc, fan(pts));
    }
    // dormers (one per bay, over the windows) + chimney stacks with clay pots
    for (let i = 0; i < nb; i++) {
      if (R() < 0.12) continue;
      const x = bx0 + (i + 0.5) * BAY, zf = z - face * 0.8;
      const body = new THREE.BoxGeometry(1.3, 1.9, 1.4); body.translate(0, 0, -face * 0.7);
      dormerVC.push(paint(xf(body, x, h + 1.45, zf), 0xcfc3a8));
      const roof = new THREE.CylinderGeometry(0.85, 0.85, 1.6, 3); roof.rotateX(-Math.PI / 2); roof.scale(1, 0.55, 1); roof.translate(0, 0, -face * 0.7);
      dormerVC.push(paint(xf(roof, x, h + 2.62, zf), 0x56606c));
      const pane = new THREE.PlaneGeometry(0.78, 1.22);
      if (R() < 0.42) dormerGlow.push(paint(xf(pane, x, h + 1.32, zf + face * 0.02, face > 0 ? 0 : Math.PI), [0x5a4426, 0x6a5030, 0x4a4a5a][Math.floor(R() * 3)]));
      else dormerVC.push(paint(xf(pane, x, h + 1.32, zf + face * 0.02, face > 0 ? 0 : Math.PI), 0x1a2028));
    }
    for (const xe of [bx0 + 0.45, bx1 - 0.45]) {
      if (R() < 0.3) continue;
      const d = 6 + R() * 4;
      dormerVC.push(paint(xf(new THREE.BoxGeometry(0.7, 2.0, 2.4), xe, h + 5.4, z - face * d), 0xb48a6c));
      dormerVC.push(paint(xf(new THREE.BoxGeometry(0.8, 0.12, 2.5), xe, h + 6.42, z - face * d), 0x9a8270));
      for (let k = 0; k < 4; k++) dormerVC.push(paint(xf(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 6), xe, h + 6.7, z - face * (d - 0.9 + k * 0.6)), 0xc0643a));
    }
    return { bx1, h };
  }
  function row(x0, x1, z, face, pickV, skip = () => false) {
    let x = x0;
    while (x < x1 - 4) {
      const nb = Math.min(5 + Math.floor(R() * 3), Math.max(2, Math.round((x1 - x) / BAY)));
      if (skip(x, x + nb * BAY)) { x += nb * BAY; continue; }
      const nf = R() < 0.25 ? 4 : 5;
      building(x, nb, z, face, pickV(x, x + nb * BAY), nf);
      x += nb * BAY;
    }
  }
  const cafes = [];                                                       // [x0, x1, which]
  {
    // our row: the two buildings nearest the middle get café ground floors (variant 0)
    let k = 0;
    row(-171, 171, BLD_Z, 1, (a, b) => {
      const mid = (a + b) / 2;
      if (Math.abs(mid) < 15 && b - a > 13 && cafes.length < 2 && ((mid < 0 && !cafes.some((c) => c[0] < 0)) || (mid >= 0 && !cafes.some((c) => c[0] >= 0)))) { cafes.push([a + 0.4, b - 0.4, cafes.length]); return 0; }
      return 1 + (k++ % 3);
    });
    // the far bank (the Champ de Mars gap stays open around the tower axis)
    let j = 0;
    row(-200, 200, FAR_Z, -1, () => j++ % 4, (a, b) => b > -46 && a < 46);
  }
  decor.put(MAT.vc, mergeGeometries(dormerVC));
  decor.put(MAT.glowVC, mergeGeometries(dormerGlow));

  /* ---------------- café terraces: awnings, heaters, bistro chairs + tables, patrons ---------------- */
  const vcParts = [];                                                     // little painted props → one mesh
  const glowParts = [];                                                   // little glowing bits → one mesh
  const addVC = (geo, col, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => vcParts.push(paint(xf(geo, x, y, z, ry, rx, rz), col));
  const addGlow = (geo, col, x = 0, y = 0, z = 0, ry = 0) => glowParts.push(paint(xf(geo, x, y, z, ry), col));
  const people = [];                                                      // [geo, colour] in world space
  const pg = personGeometry();
  const shirts = [0x2a2a30, 0x8a1e1e, 0xe8e2d4, 0x1f3a5a, 0x4a3a2a, 0x6a6a6a, 0x2f4a3a, 0xc8a870, 0x5a2a4a];
  const skins = [0xe8c0a0, 0xc99a72, 0x8a5a3a, 0xf0d0b8, 0x6b4a30];
  const standing = (x, z, ry, sc = 1) => {
    for (const [geo, col] of [[pg.body, shirts[Math.floor(R() * shirts.length)]], [pg.head, skins[Math.floor(R() * skins.length)]]]) {
      const gg = geo.clone(); gg.scale(sc, sc, sc); gg.rotateY(ry); gg.translate(x, GY, z); people.push(paint(gg, col));
    }
  };
  const seatedGeo = (() => {
    const P = [];
    const add = (geo, x, y, z, rx = 0) => { geo.rotateX(rx); geo.translate(x, y, z); P.push(geo.toNonIndexed()); };
    add(new THREE.CylinderGeometry(0.17, 0.15, 0.56, 7), 0, 0.82, -0.04);
    add(new THREE.SphereGeometry(0.17, 7, 5).scale(1.25, 0.5, 0.75), 0, 1.07, -0.04);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.075, 0.07, 0.44, 6), sx * 0.09, 0.5, 0.16, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 6), sx * 0.09, 0.25, 0.38);
      add(new THREE.CylinderGeometry(0.05, 0.045, 0.5, 5), sx * 0.22, 0.8, 0.08, 0.6);
    }
    const body = mergeGeometries(P);
    const head = new THREE.SphereGeometry(0.11, 8, 6).toNonIndexed(); head.translate(0, 1.24, -0.03);
    return { body, head };
  })();
  const seated = (x, z, ry) => {
    for (const [geo, col] of [[seatedGeo.body, shirts[Math.floor(R() * shirts.length)]], [seatedGeo.head, skins[Math.floor(R() * skins.length)]]]) {
      const gg = geo.clone(); gg.rotateY(ry); gg.translate(x, GY, z); people.push(paint(gg, col));
    }
  };
  const chair = (x, z, ry, col) => {
    addVC(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), col, x, GY + 0.46, z);
    for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) addVC(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 4), 0x1a1a1a, x + Math.cos(ry) * dx + Math.sin(ry) * dz, GY + 0.23, z - Math.sin(ry) * dx + Math.cos(ry) * dz);
    const back = new THREE.TorusGeometry(0.19, 0.03, 4, 10, Math.PI); back.translate(0, 0.0, 0);
    addVC(back, col, x - Math.sin(ry) * 0.18, GY + 0.62, z - Math.cos(ry) * 0.18, ry);
  };
  const table = (x, z) => {
    addVC(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12), 0xe8e4dc, x, GY + 0.74, z);
    addVC(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5), 0x1a1a1a, x, GY + 0.37, z);
    addVC(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 8), 0x1a1a1a, x, GY + 0.02, z);
    if (R() < 0.6) addVC(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 6), [0xd8c070, 0x8a1a2a, 0xf2f2f2][Math.floor(R() * 3)], x + 0.08, GY + 0.82, z);
  };
  for (const [x0, x1, which] of cafes) {
    const yT = GY + 3.65, yB = GY + 2.75, D = 2.9, zf = BLD_Z, zo = BLD_Z + D;
    const v0 = which * 0.5;                                               // atlas row (flipY: row 0 is the top half)
    const vA = 1 - v0, vS = 1 - v0 - 0.375, vV = 1 - v0 - 0.5;
    putW(MAT.awning, quad(new THREE.Vector3(x0, yB, zo), new THREE.Vector3(x1, yB, zo), new THREE.Vector3(x1, yT, zf + 0.05), new THREE.Vector3(x0, yT, zf + 0.05), [[0, vS], [1, vS], [1, vA], [0, vA]]));
    putW(MAT.awning, quad(new THREE.Vector3(x0, yB - 0.42, zo), new THREE.Vector3(x1, yB - 0.42, zo), new THREE.Vector3(x1, yB, zo), new THREE.Vector3(x0, yB, zo), [[0, vV], [1, vV], [1, vS], [0, vS]]));
    for (const xe of [x0, x1]) putW(MAT.awning, quad(new THREE.Vector3(xe, yB, zo), new THREE.Vector3(xe, yT, zf + 0.05), new THREE.Vector3(xe, yB, zf + 0.05), new THREE.Vector3(xe, yB, zo), [[0, vS], [0.05, vA], [0.05, vS], [0, vS]]));
    for (let x = x0 + 1.2; x < x1 - 1; x += 3.1) addGlow(new THREE.BoxGeometry(0.9, 0.08, 0.12), 0x5a1a06, x, yB - 0.1, zo - 0.35);   // radiant heaters
    // chairs face the street in rows, tables in front (the Parisian way)
    const cols = which === 0 ? [0xb8452f, 0xd8b070] : [0x2f6a4a, 0xd8c8a0];
    for (const [zc, zt] of [[zf + 0.75, zf + 1.3], [zf + 2.05, zf + 2.6]]) {
      for (let x = x0 + 0.6; x < x1 - 0.5; x += 1.4) {
        table(x + 0.35, zt);
        for (const dx of [0, 0.7]) {
          chair(x + dx, zc, 0, cols[Math.floor(R() * 2)]);
          if (R() < 0.42) seated(x + dx, zc + 0.02, 0);
        }
      }
    }
    // a waiter and a couple of standing patrons by the door; chalkboard menus
    standing(x0 + (x1 - x0) * 0.5, zo + 0.5, Math.PI * 0.9, 1.0);
    for (const xb of [x0 + 0.2, x1 - 0.2]) {
      const ab = new THREE.BoxGeometry(0.62, 0.95, 0.04);
      addVC(ab, 0x15181a, xb, GY + 0.5, zo + 0.35, 0, 0.18);
      addVC(new THREE.BoxGeometry(0.66, 0.06, 0.06), 0x6a4a2a, xb, GY + 0.98, zo + 0.27);
    }
    pools.push([(x0 + x1) / 2, (zf + zo) / 2 + 0.6, (x1 - x0) * 0.62, 5.5, 0.55]);
  }

  /* ---------------- street furniture: lamps, benches, plane trees, Morris column, kiosk, Wallace fountain, métro ---------------- */
  const lamp = (x, z, { tall = 4.2, base = GY } = {}) => {
    const iron = 0x1d2621;
    addVC(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 8), iron, x, base + 0.27, z);
    addVC(new THREE.CylinderGeometry(0.15, 0.2, 0.25, 8), iron, x, base + 0.66, z);
    addVC(new THREE.CylinderGeometry(0.06, 0.09, tall - 0.8, 8), iron, x, base + 0.8 + (tall - 0.8) / 2, z);
    addVC(new THREE.SphereGeometry(0.1, 8, 5), iron, x, base + tall, z);
    addVC(new THREE.CylinderGeometry(0.3, 0.15, 0.08, 4), iron, x, base + tall + 0.08, z, Math.PI / 4);
    addGlow(new THREE.CylinderGeometry(0.27, 0.16, 0.5, 4, 1, true), 0xffcf8a, x, base + tall + 0.36, z, Math.PI / 4);
    addVC(new THREE.ConeGeometry(0.34, 0.26, 4), iron, x, base + tall + 0.74, z, Math.PI / 4);
    addVC(new THREE.SphereGeometry(0.06, 6, 4), iron, x, base + tall + 0.92, z);
    glowPts.push([x, base + tall + 0.38, z]);
  };
  const bench = (x, z, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (dx, dz) => [x + c * dx + s * dz, z - s * dx + c * dz];
    for (let k = 0; k < 3; k++) { const [px, pz] = at(0, -0.18 + k * 0.17); addVC(new THREE.BoxGeometry(1.8, 0.04, 0.12), 0x2c4a32, px, GY + 0.46, pz, ry); }
    for (let k = 0; k < 2; k++) { const [px, pz] = at(0, -0.33 - k * 0.02); addVC(new THREE.BoxGeometry(1.8, 0.12, 0.04), 0x2c4a32, px, GY + 0.66 + k * 0.17, pz, ry, -0.2); }
    for (const dx of [-0.75, 0.75]) { const [px, pz] = at(dx, -0.05); addVC(new THREE.BoxGeometry(0.06, 0.46, 0.5), 0x1a1d1c, px, GY + 0.23, pz, ry); const [qx, qz] = at(dx, -0.33); addVC(new THREE.BoxGeometry(0.06, 0.5, 0.05), 0x1a1d1c, qx, GY + 0.68, qz, ry, -0.2); }
  };
  // the café pavement (−z): lamps between plane trees; the quay (+z): lamps and benches facing the river
  for (const x of [0, -9, 9]) { lamp(x, SIDE_Z); pools.push([x, SIDE_Z, 6, 6, 0.32]); }
  for (const x of [-15, 15, -23, 23]) { lamp(x, PAR_Z - 0.75); pools.push([x, PAR_Z - 1.6, 5.5, 5, 0.28]); }
  for (const x of [-11.6, 11.6, -19, 19]) bench(x, PAR_Z - 1.7, Math.PI);
  // on the bridge: lamp standards along both parapets
  for (const s of [-1, 1]) for (let z = RIV0 + 4; z < RIV1; z += 8.5) lamp(s * 6.8, z, { tall: 3.4, base: GY + 1.05 + 0.3 * (z - RIV0) / (RIV1 - RIV0) });
  // far quay lamps
  for (let x = -190; x <= 190; x += 13) { if (Math.abs(x) < 10) continue; lamp(x, RIV1 + 1.6, { base: GY + 0.3 }); }
  // equestrian statues on pedestals at both ends of the bridge
  for (const z of [PAR_Z - 1.2, RIV1 + 1.3]) for (const s of [-1, 1]) {
    const x = s * 8.9, base = z > 0 && z > RIV1 ? GY + 0.3 : GY, face = z > RIV1 ? -1 : 1;
    put(MAT.stone, new THREE.BoxGeometry(1.9, 0.5, 3.2), x, base + 0.25, z);
    put(MAT.stone, new THREE.BoxGeometry(1.5, 3.0, 2.8), x, base + 2.0, z);
    put(MAT.stone, new THREE.BoxGeometry(1.8, 0.3, 3.1), x, base + 3.6, z);
    const hy = base + 3.75;
    put(MAT.bronze, new THREE.CylinderGeometry(0.36, 0.38, 1.6, 8), x, hy + 1.15, z, 0, Math.PI / 2);
    put(MAT.bronze, new THREE.CylinderGeometry(0.17, 0.26, 0.95, 6), x, hy + 1.6, z + face * 0.85, 0, -face * 0.6);
    put(MAT.bronze, new THREE.BoxGeometry(0.2, 0.26, 0.55), x, hy + 2.0, z + face * 1.2, 0, -face * 0.3);
    for (const [dx, dz, a] of [[-0.2, 0.55, -0.5], [0.2, 0.6, 0.1], [-0.2, -0.6, 0.15], [0.2, -0.55, -0.1]]) put(MAT.bronze, new THREE.CylinderGeometry(0.07, 0.06, 1.0, 5), x + dx, hy + 0.45, z + face * dz, 0, face * a);
    put(MAT.bronze, new THREE.CylinderGeometry(0.05, 0.12, 0.8, 5), x, hy + 0.85, z - face * 0.95, 0, face * 0.5);
    put(MAT.bronze, new THREE.CylinderGeometry(0.15, 0.18, 0.75, 7), x, hy + 1.85, z - face * 0.05);
    put(MAT.bronze, new THREE.SphereGeometry(0.13, 7, 5), x, hy + 2.35, z - face * 0.05);
    put(MAT.bronze, new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), x + 0.2, hy + 2.3, z + face * 0.1, 0, face * 0.3);
  }
  // Morris column (−x end of the café pavement)
  {
    const x = -(OX + 7.5), z = SIDE_Z - 0.4, green = 0x1f3a2c;
    addVC(new THREE.CylinderGeometry(0.82, 0.9, 0.45, 16), green, x, GY + 0.22, z);
    put(MAT.poster, new THREE.CylinderGeometry(0.7, 0.7, 2.6, 20, 1, true), x, GY + 1.75, z);
    addVC(new THREE.CylinderGeometry(0.84, 0.74, 0.28, 16), green, x, GY + 3.18, z);
    addVC(new THREE.CylinderGeometry(0.74, 0.74, 0.42, 16), green, x, GY + 3.52, z);
    addVC(new THREE.SphereGeometry(0.8, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), green, x, GY + 3.72, z);
    addVC(new THREE.ConeGeometry(0.12, 0.5, 8), green, x, GY + 4.45, z);
    addVC(new THREE.SphereGeometry(0.1, 8, 5), 0xc8a050, x, GY + 4.75, z);
  }
  // newspaper kiosk (−x, quay side) and a Wallace fountain (+x, quay side)
  {
    const x = -(OX + 8), z = OZ + 4.4, green = 0x1f3a2c;
    addVC(new THREE.CylinderGeometry(1.15, 1.2, 2.0, 8), green, x, GY + 1.0, z, Math.PI / 8);
    put(MAT.poster, new THREE.CylinderGeometry(1.17, 1.17, 0.75, 8, 1, true), x, GY + 2.35, z, Math.PI / 8);
    addVC(new THREE.ConeGeometry(1.6, 0.95, 8), green, x, GY + 3.2, z, Math.PI / 8);
    addVC(new THREE.ConeGeometry(0.16, 0.6, 8), green, x, GY + 3.9, z);
    addGlow(new THREE.BoxGeometry(1.0, 0.7, 0.05), 0x7a6a40, x, GY + 1.3, z - 1.14);
  }
  {
    const x = OX + 7, z = OZ + 4.2, green = 0x1f3a2c;
    addVC(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8), green, x, GY + 0.45, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      addVC(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), green, x + Math.cos(a) * 0.25, GY + 1.5, z + Math.sin(a) * 0.25);
      addVC(new THREE.SphereGeometry(0.07, 6, 4), green, x + Math.cos(a) * 0.25, GY + 2.15, z + Math.sin(a) * 0.25);
    }
    addVC(new THREE.SphereGeometry(0.48, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), green, x, GY + 2.25, z);
    addVC(new THREE.ConeGeometry(0.1, 0.45, 6), green, x, GY + 2.75, z);
  }
  // Guimard métro entrance: stairwell, green iron balustrade, two lily lamps + the METROPOLITAIN sign at the open end (+x)
  {
    const hx = 1.85, hz = 0.9, green = 0x1f3a2c;
    for (const s of [-1, 1]) addVC(new THREE.BoxGeometry(hx * 2, 3.2, 0.12), 0xd8d4c8, MX, GY - 1.6, MZ + s * (hz - 0.06));
    addVC(new THREE.BoxGeometry(0.12, 3.2, hz * 2), 0xd8d4c8, MX - hx + 0.06, GY - 1.6, MZ);
    for (let k = 0; k < 12; k++) addVC(new THREE.BoxGeometry(0.3, 0.2, hz * 2 - 0.2), k % 2 ? 0x9a948a : 0x8a847a, MX + hx - 0.15 - k * 0.3, GY - 0.1 - k * 0.22, MZ);
    addGlow(new THREE.PlaneGeometry(hz * 2 - 0.25, 1.2), 0x8a7a5a, MX - hx + 0.15, GY - 2.4, MZ, Math.PI / 2);
    const H = 0.95, ra = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); putW(MAT.railGreen, quad(new THREE.Vector3(x0, GY, z0), new THREE.Vector3(x1, GY, z1), new THREE.Vector3(x1, GY + H, z1), new THREE.Vector3(x0, GY + H, z0), [[0, 0], [len, 0], [len, 1], [0, 1]])); };
    ra(MX - hx, MZ - hz, MX + hx, MZ - hz); ra(MX - hx, MZ + hz, MX + hx, MZ + hz); ra(MX - hx, MZ - hz, MX - hx, MZ + hz);
    for (const [x0, z0, x1, z1] of [[MX - hx, MZ - hz, MX + hx, MZ - hz], [MX - hx, MZ + hz, MX + hx, MZ + hz], [MX - hx, MZ - hz, MX - hx, MZ + hz]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      addVC(new THREE.BoxGeometry(len, 0.06, 0.08), green, (x0 + x1) / 2, GY + H, (z0 + z1) / 2, ry);
    }
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(MX + hx, GY, MZ + s * hz), new THREE.Vector3(MX + hx, GY + 1.4, MZ + s * (hz + 0.05)), new THREE.Vector3(MX + hx, GY + 2.5, MZ + s * (hz - 0.05)), new THREE.Vector3(MX + hx + 0.05, GY + 3.05, MZ + s * (hz - 0.35))]);
      vcParts.push(paint(new THREE.TubeGeometry(curve, 14, 0.055, 6), green));
      addGlow(new THREE.SphereGeometry(0.13, 8, 6).scale(0.9, 1.6, 0.9), 0xff5a14, MX + hx + 0.06, GY + 3.12, MZ + s * (hz - 0.42));
      glowPts.push([MX + hx + 0.06, GY + 3.12, MZ + s * (hz - 0.42), 0.5]);
    }
    addVC(new THREE.BoxGeometry(0.06, 0.07, hz * 2 - 0.2), green, MX + hx, GY + 2.36, MZ);
    put(MAT.metroSign, new THREE.PlaneGeometry(hz * 2 - 0.3, 0.32), MX + hx + 0.04, GY + 2.58, MZ, Math.PI / 2);
    put(MAT.metroSign, new THREE.PlaneGeometry(hz * 2 - 0.3, 0.32), MX + hx - 0.04, GY + 2.58, MZ, -Math.PI / 2);
  }

  /* ---------------- plane trees (instanced): the café pavement, both ends of the esplanade, the far quay, the Champ de Mars ---------------- */
  const treeNear = [], treeFar = [];
  for (const x of [-4.5, 4.5, -13.5, 13.5, -22.5, 22.5]) treeNear.push([x, SIDE_Z, 1]);
  for (const sx of [-1, 1]) for (const dx of [0, 5.5]) for (let z = BLD_Z + 2.4; z <= PAR_Z - 0.8; z += 4.3) treeNear.push([sx * (TREE_X + dx + (R() - 0.5) * 0.3), z + (R() - 0.5) * 0.4, 1.05 + R() * 0.15]);
  for (let x = -200; x <= 200; x += 10) if (Math.abs(x) > 12) treeFar.push([x + (R() - 0.5) * 2, RIV1 + 6, 1.1]);
  for (const sx of [-1, 1]) for (const dx of [14, 24, 34]) for (let z = RIV1 + 18; z < TZ + 40; z += 11) if (Math.abs(z - TZ) > 30 || dx > 20) treeFar.push([sx * dx, z, 1.2]);
  {
    const trunk = (() => {
      const P = [];
      const t = new THREE.CylinderGeometry(0.16, 0.24, 4.4, 7); t.translate(0, 2.2, 0); P.push(paint(t, 0x847f6c));
      for (let k = 0; k < 3; k++) { const b = new THREE.CylinderGeometry(0.07, 0.12, 2.2, 5); b.translate(0, 1.1, 0); b.rotateZ(0.5); b.rotateY(k * 2.1); b.translate(0, 4.2, 0); P.push(paint(b, 0x6e6a5c)); }
      const grate = new THREE.CylinderGeometry(0.7, 0.7, 0.03, 12); grate.translate(0, 0.015, 0); P.push(paint(grate, 0x15171a));
      return mergeGeometries(P);
    })();
    const canopy = (detail, n) => {
      const P = [], RR = rnd(5 + detail);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + RR(), r = k === 0 ? 0 : 1.3 + RR() * 0.5;
        const b = new THREE.IcosahedronGeometry(1.5 + RR() * 0.5, detail);
        b.scale(1.05, 0.8, 1.05); b.translate(Math.cos(a) * r, 6.6 + RR() * 1.6 + (k === 0 ? 0.8 : 0), Math.sin(a) * r);
        const nb = b.toNonIndexed(), pos = nb.attributes.position, col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const t = THREE.MathUtils.clamp((pos.getY(i) - 5.2) / 4.2, 0, 1), j = 0.85 + RR() * 0.3;
          col[i * 3] = (0.19 - 0.12 * t) * j; col[i * 3 + 1] = (0.27 - 0.15 * t) * j; col[i * 3 + 2] = (0.1 - 0.05 * t) * j;   // lamp-lit underside, dark crown
        }
        nb.setAttribute('color', new THREE.BufferAttribute(col, 3));
        P.push(nb);
      }
      return mergeGeometries(P);
    };
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const o = new THREE.Object3D();
    for (const [spots, cg] of [[treeNear, canopy(1, 6)], [treeFar, canopy(0, 5)]]) {
      const ti = new THREE.InstancedMesh(trunk, MAT.vc, spots.length), ci = new THREE.InstancedMesh(cg, leafMat, spots.length);
      spots.forEach(([x, z, s], i) => {
        o.position.set(x, z > RIV1 ? GY + 0.3 : GY, z); o.rotation.set(0, R() * 6.28, 0); o.scale.set(s, s * (0.92 + R() * 0.16), s); o.updateMatrix();
        ti.setMatrixAt(i, o.matrix); ci.setMatrixAt(i, o.matrix);
      });
      ti.computeBoundingSphere(); ci.computeBoundingSphere();
      g.add(ti, ci);
    }
  }

  /* ---------------- people: strollers along the quay, on the bridge, by the métro and the cafés ---------------- */
  for (let i = 0; i < 22; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (OX + 3.5 + R() * 18), z = PAR_Z - 0.6 - R() * 0.5;
    if (Math.abs(x) < 7.5) continue;
    standing(x, z, Math.PI + (R() - 0.5) * 1.2, 0.9 + R() * 0.15);
  }
  for (let i = 0; i < 8; i++) standing((R() < 0.5 ? -1 : 1) * (4.8 + R() * 1.2), RIV0 + 2 + R() * 44, R() * 6.28, 0.92 + R() * 0.12);
  for (let i = 0; i < 6; i++) standing(MX + 3 + R() * 3, MZ + (R() - 0.5) * 3, R() * 6.28, 0.9 + R() * 0.15);
  for (let i = 0; i < 6; i++) standing(-(OX + 10 + R() * 6), BLD_Z + 1.2 + R() * 2.5, R() * 6.28, 0.9 + R() * 0.15);
  for (let i = 0; i < 30; i++) { const x = (R() - 0.5) * 300; if (Math.abs(x) < 12) continue; standing(x, RIV1 + 3 + R() * 6, R() * 6.28, 0.95); people[people.length - 1].translate(0, 0.3, 0); people[people.length - 2].translate(0, 0.3, 0); }
  g.add(new THREE.Mesh(mergeGeometries(people), MAT.vcFlat));

  /* ---------------- boundary: a low black wrought-iron railing with gilded finials; floodlights ---------------- */
  {
    const bx = OX + 0.05, bz = OZ + 0.05, H = 0.8;
    for (const [len, x, z, ry] of [[OX * 2 + 0.1, 0, -bz, 0], [OX * 2 + 0.1, 0, bz, 0], [OZ * 2, -bx, 0, Math.PI / 2], [OZ * 2, bx, 0, Math.PI / 2]]) {
      putS(MAT.iron, new THREE.BoxGeometry(len + 0.08, 0.06, 0.08), x, H - 0.03, z, ry);
      putS(MAT.iron, new THREE.BoxGeometry(len, 0.04, 0.05), x, 0.12, z, ry);
      putS(MAT.rail, new THREE.PlaneGeometry(len, H - 0.16).translate(0, 0, 0), x, 0.12 + (H - 0.16) / 2, z, ry);
      const n = Math.round(len / 1.6);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i / n) * len, px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
        putS(MAT.iron, new THREE.BoxGeometry(0.07, H, 0.07), px, H / 2, pz, ry);
        putS(MAT.gold, new THREE.SphereGeometry(0.055, 8, 6), px, H + 0.05, pz);
      }
    }
  }
  floodPoles(ctx, g, { x: OX + 1.3, z: OZ + 1.5, base: 0, poleMat: MAT.iron, headMat: MAT.iron, glowMat: MAT.glow, put: putS });

  /* ---------------- bateaux-mouches (instanced, moving) ---------------- */
  const boats = [];
  const boatIMs = [];
  {
    const L = 26, W = 5.4, hull = [], cab = [], glow = [];
    const sh = new THREE.Shape();
    sh.moveTo(-L / 2, -W / 2); sh.lineTo(L / 2 - 4.5, -W / 2); sh.quadraticCurveTo(L / 2, -W / 2 + 0.4, L / 2, 0); sh.quadraticCurveTo(L / 2, W / 2 - 0.4, L / 2 - 4.5, W / 2); sh.lineTo(-L / 2, W / 2); sh.lineTo(-L / 2, -W / 2);
    const hg = new THREE.ExtrudeGeometry(sh, { depth: 1.3, bevelEnabled: false, curveSegments: 6 }); hg.clearGroups();
    hg.rotateX(-Math.PI / 2); hg.translate(0, -0.6, 0);
    hull.push(paint(hg, 0xe6e2da));
    const band = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false, curveSegments: 6 }); band.clearGroups();
    band.rotateX(-Math.PI / 2); band.scale(1.01, 1, 1.02); band.translate(0, -0.15, 0);
    hull.push(paint(band, 0x1f2c44));
    hull.push(paint(new THREE.BoxGeometry(L - 1.5, 0.08, W - 0.3).translate(-0.3, 0.72, 0), 0x6a5a48));
    const cg = new THREE.BoxGeometry(L - 9, 1.5, W - 0.9);
    { const uv = cg.attributes.uv, n = cg.attributes.normal; for (let i = 0; i < uv.count; i++) if (Math.abs(n.getZ(i)) > 0.5) uv.setX(i, uv.getX(i) * 5); }
    cg.translate(-1.5, 1.52, 0); cab.push(cg.toNonIndexed());
    hull.push(paint(new THREE.BoxGeometry(L - 8.6, 0.12, W - 0.55).translate(-1.5, 2.33, 0), 0xdcd8d0));
    hull.push(paint(new THREE.BoxGeometry(2.2, 1.6, 2.4).translate(L / 2 - 5.8, 1.55, 0), 0xe6e2da));     // wheelhouse
    for (let k = 0; k < 8; k++) for (const s of [-1, 1]) hull.push(paint(new THREE.BoxGeometry(0.05, 0.8, 0.05).translate(-L / 2 + 0.6 + k * 0.5, 1.15, s * (W / 2 - 0.25)), 0x2a2a2a));
    hull.push(paint(new THREE.BoxGeometry(4, 0.05, 0.05).translate(-L / 2 + 2.3, 1.55, W / 2 - 0.25), 0x2a2a2a));
    hull.push(paint(new THREE.BoxGeometry(4, 0.05, 0.05).translate(-L / 2 + 2.3, 1.55, -(W / 2 - 0.25)), 0x2a2a2a));
    for (const s of [-1, 1]) glow.push(paint(new THREE.BoxGeometry(L - 9, 0.07, 0.07).translate(-1.5, 2.42, s * (W / 2 - 0.3)), 0xffe2b0));
    glow.push(paint(new THREE.SphereGeometry(0.12, 6, 4).translate(L / 2 - 5.8, 2.6, 0), 0xffffff));
    glow.push(paint(new THREE.SphereGeometry(0.09, 6, 4).translate(L / 2 - 1, 1.0, -W / 2 + 0.6), 0xff2010));
    glow.push(paint(new THREE.SphereGeometry(0.09, 6, 4).translate(L / 2 - 1, 1.0, W / 2 - 0.6), 0x10ff40));
    const cabMat = new THREE.MeshBasicMaterial({ map: cabinTex(), color: new THREE.Color(1.25, 1.2, 1.1) });
    const lanes = [[(ARCH[0][0] + ARCH[0][1]) / 2, 1, -70], [(ARCH[0][0] + ARCH[0][1]) / 2, 1, 40], [(ARCH[1][0] + ARCH[1][1]) / 2, -1, 10]];
    for (const [z, dir, x] of lanes) boats.push({ x, z, dir, v: 3.6 + R() * 0.8, ph: R() * 6 });
    for (const [geo, mat] of [[mergeGeometries(hull), MAT.vc], [mergeGeometries(cab), cabMat], [mergeGeometries(glow), MAT.glowVC]]) {
      const im = new THREE.InstancedMesh(geo, mat, boats.length); im.frustumCulled = false;
      g.add(im); boatIMs.push(im);
    }
    // the cabin light on the water (fx)
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0xffb460).multiplyScalar(0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const si = new THREE.InstancedMesh(sg, sm, boats.length * 2); si.frustumCulled = false; si.renderOrder = 3;
    fx.add(si); boatIMs.push(si);
  }

  /* ---------------- the Eiffel Tower ---------------- */
  const tower = buildTower(TOWER_H, glowTexture, R);
  tower.group.position.set(0, GY + 0.3, TZ);
  g.add(tower.group);
  for (const o of tower.fx) { o.position.add(tower.group.position); fx.add(o); }

  /* ---------------- merged props + fx (halos, light pools, reflections) ---------------- */
  decor.put(MAT.vc, mergeGeometries(vcParts));
  decor.put(MAT.glowVC, mergeGeometries(glowParts));
  {
    const pos = new Float32Array(glowPts.length * 3);
    glowPts.forEach(([x, y, z], i) => pos.set([x, y, z], i * 3));
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const halos = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: glowTexture(), color: 0xffb866, size: 1.5, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    fx.add(halos);
    // warm pools of lamplight on the paving
    const qg = new THREE.PlaneGeometry(1, 1); qg.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0xffa850), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    const pi = new THREE.InstancedMesh(qg, pm, pools.length);
    const o = new THREE.Object3D();
    pools.forEach(([x, z, sx, sz, k], i) => { o.position.set(x, GY + 0.015, z); o.scale.set(sx, 1, sz * (k > 0.4 ? 1 : 1)); o.updateMatrix(); pi.setMatrixAt(i, o.matrix); pi.setColorAt(i, new THREE.Color(k, k, k)); });
    pi.computeBoundingSphere(); pi.renderOrder = 1;
    fx.add(pi);
    // the far quay's lamps + the bridge lamps, stretched on the water
    const streaks = [];
    for (let x = -190; x <= 190; x += 13) { if (Math.abs(x) < 10) continue; const s = new THREE.PlaneGeometry(0.9, 9); s.rotateX(-Math.PI / 2); s.translate(x, WATER_Y + 0.04, RIV1 - 5); streaks.push(s); }
    for (const s of [-1, 1]) for (let z = RIV0 + 4; z < RIV1; z += 8.5) { const q = new THREE.PlaneGeometry(1.1, 5); q.rotateX(-Math.PI / 2); q.translate(s * 9.2, WATER_Y + 0.04, z - 2); streaks.push(q); }
    const stm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0xffb050).multiplyScalar(0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const st = new THREE.Mesh(mergeGeometries(streaks), stm); st.renderOrder = 3;
    fx.add(st);
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  /* ---------------- animation ---------------- */
  let time = 0, forced = null;
  const bo = new THREE.Object3D();
  function update(dt) {
    time += dt;
    uTime.value = time;
    boats.forEach((b, i) => {
      b.x += b.dir * b.v * dt;
      if (b.x > 105) b.x -= 210; else if (b.x < -105) b.x += 210;
      bo.position.set(b.x, WATER_Y + Math.sin(time * 0.9 + b.ph) * 0.04, b.z);
      bo.rotation.set(Math.sin(time * 0.7 + b.ph) * 0.008, b.dir > 0 ? 0 : Math.PI, 0); bo.scale.set(1, 1, 1);
      bo.updateMatrix();
      for (let k = 0; k < 3; k++) boatIMs[k].setMatrixAt(i, bo.matrix);
      if (fx.visible) {
        for (const s of [-1, 1]) { bo.position.set(b.x - b.dir * 1.5, WATER_Y + 0.05, b.z + s * 5.5); bo.rotation.set(0, 0, 0); bo.scale.set(22, 1, 7); bo.updateMatrix(); boatIMs[3].setMatrixAt(i * 2 + (s > 0 ? 1 : 0), bo.matrix); }
      }
    });
    for (const im of boatIMs) im.instanceMatrix.needsUpdate = true;
    if (!fx.visible) return;
    // the sparkle: ten seconds every SPARKLE_EVERY (fading in / out over half a second)
    const ph = (time - SPARKLE_AT + SPARKLE_EVERY * 100) % SPARKLE_EVERY;
    const on = forced !== null ? forced : Math.min(1, Math.max(0, Math.min(ph, SPARKLE_FOR - ph) * 2));
    tower.sparkle.material.uniforms.uOn.value = ph < SPARKLE_FOR || forced ? on : 0;
    tower.sparkle.material.uniforms.uTime.value = time;
    tower.sparkle.visible = tower.sparkle.material.uniforms.uOn.value > 0.001;
    tower.beacon.rotation.y = time * 0.55;
  }
  function setTime() {
    MAT.facade.emissiveIntensity = 0.95;
    MAT.awning.emissiveIntensity = 0.12;
  }
  const out = { g, fx, update, setTime, fog: { night: [36, 250] } };
  out.sparkle = (v) => { forced = v === undefined ? null : v ? 1 : 0; };   // testing hook: force the sparkle on / off / back to its schedule
  return out;
}

/* ============================== the Eiffel Tower ============================== */
// H = height to the antenna tip. Four curved lattice legs (chords + lattice panels) up to the 2nd floor, one tapering shaft
// above, the 1st-level arches, three platforms with lit galleries, the campanile, the rotating beacon, and the sparkle.
// Unlit gold (MeshBasic, fog off) — it reads as floodlit from the court however far the fog reaches.
function buildTower(H, glowTexture, R) {
  const group = new THREE.Group(); group.name = 'eiffel';
  const Wt = [[0, 0.19], [0.06, 0.163], [0.12, 0.137], [0.17, 0.112], [0.25, 0.084], [0.35, 0.06], [0.45, 0.047], [0.55, 0.037], [0.65, 0.029], [0.75, 0.023], [0.836, 0.018]];
  const W = (u) => { for (let i = 1; i < Wt.length; i++) if (u <= Wt[i][0]) { const [u0, w0] = Wt[i - 1], [u1, w1] = Wt[i]; return (w0 + ((w1 - w0) * (u - u0)) / (u1 - u0)) * H; } return Wt[Wt.length - 1][1] * H; };
  const S = (u) => (0.042 - 0.012 * Math.min(1, u / 0.35)) * H;
  const C = (u) => W(u) - S(u);
  const beams = [], panels = [], spark = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const gold = (u, k = 1) => lin(0.82 * k, (0.36 + 0.18 * u) * k, (0.07 + 0.12 * u) * k);   // sodium-lamp gold
  const addBeam = (a, b, t, col, sp = true) => {
    const gg = beam(a, b, t); if (!gg) return;
    beams.push(paint(gg, col));
    if (sp) { const n = Math.ceil(a.distanceTo(b) / 2.2); for (let i = 0; i < n; i++) spark.push(new THREE.Vector3().lerpVectors(a, b, R())); }
  };
  const addPanel = (p0, p1, p2, p3, reps = 1) => {
    panels.push(quad(p0, p1, p2, p3, [[0, 0], [reps, 0], [reps, 1], [0, 1]]));
    for (let i = 0; i < 3; i++) { const s = R(), t = R(); spark.push(new THREE.Vector3().lerpVectors(new THREE.Vector3().lerpVectors(p0, p1, s), new THREE.Vector3().lerpVectors(p3, p2, s), t)); }
  };
  const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // ---- the four legs
  const LU = [0, 0.03, 0.06, 0.09, 0.12, 0.145, 0.17, 0.2, 0.23, 0.26, 0.29, 0.32, 0.35];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = (u, a, b) => { const c = C(u), s = S(u); return V(sx * c + a * s, u * H, sz * c + b * s); };
    for (let k = 0; k < LU.length - 1; k++) {
      const u0 = LU[k], u1 = LU[k + 1];
      for (let j = 0; j < 4; j++) {
        const [a, b] = CORN[j], [a2, b2] = CORN[(j + 1) % 4];
        addBeam(corner(u0, a, b), corner(u1, a, b), 0.0062 * H, gold(u0));
        const p0 = corner(u0, a, b), p1 = corner(u0, a2, b2), p2 = corner(u1, a2, b2), p3 = corner(u1, a, b);
        addPanel(p0, p1, p2, p3, 1);
        addBeam(p0, p1, 0.0036 * H, gold(u0, 0.85), false);
      }
    }
    // the masonry pier under each foot
    beams.push(paint(xf0(new THREE.BoxGeometry(2.6 * S(0), 0.02 * H, 2.6 * S(0)), sx * C(0), 0.01 * H, sz * C(0)), lin(0.55, 0.36, 0.18)));
  }
  // ---- the shaft above the 2nd floor
  const SU = [0.35, 0.39, 0.43, 0.47, 0.51, 0.55, 0.59, 0.63, 0.67, 0.71, 0.75, 0.79, 0.836];
  const sc = (u, a, b) => V(a * W(u), u * H, b * W(u));
  for (let k = 0; k < SU.length - 1; k++) {
    const u0 = SU[k], u1 = SU[k + 1];
    for (let j = 0; j < 4; j++) {
      const [a, b] = CORN[j], [a2, b2] = CORN[(j + 1) % 4];
      addBeam(sc(u0, a, b), sc(u1, a, b), 0.0052 * H, gold(u0));
      addPanel(sc(u0, a, b), sc(u0, a2, b2), sc(u1, a2, b2), sc(u1, a, b), 1);
      addBeam(sc(u0, a, b), sc(u0, a2, b2), 0.003 * H, gold(u0, 0.85), false);
    }
  }
  // ---- the decorative arches between the legs (in the outer face planes)
  for (let side = 0; side < 4; side++) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * Math.PI, y = (0.045 + 0.105 * Math.sin(th)) * H, u = y / H;
      const along = Math.cos(th) * (C(0.045) - S(0.045)), out = W(u) * 0.995;
      pts.push(side === 0 ? V(along, y, out) : side === 1 ? V(along, y, -out) : side === 2 ? V(out, y, along) : V(-out, y, along));
    }
    for (let i = 0; i < pts.length - 1; i++) addBeam(pts[i], pts[i + 1], 0.0065 * H, gold(0.1, 1.15));
    // lattice spandrel between the arch and the 1st floor
    for (let i = 0; i < pts.length - 1; i += 2) {
      const a = pts[i], b = pts[i + 2] || pts[pts.length - 1], up = 0.165 * H;
      const ta = a.clone(); ta.y = up; const tb = b.clone(); tb.y = up;
      const fixOut = (p) => { const o = W(p.y / H) * 0.995; if (side === 0) p.z = o; else if (side === 1) p.z = -o; else if (side === 2) p.x = o; else p.x = -o; return p; };
      fixOut(ta); fixOut(tb);
      if (ta.y - a.y > 0.4) panels.push(quad(a, b, tb, ta, [[0, 0], [1, 0], [1, (ta.y - a.y) / (0.03 * H)], [0, (ta.y - a.y) / (0.03 * H)]]));
    }
  }
  // ---- platforms (lit galleries), campanile, beacon housing, antenna
  const frame = (u, outer, inner, th, col, colBand) => {
    const y = u * H;
    for (const [w, d, x, z] of [[2 * outer, outer - inner, 0, (outer + inner) / 2], [2 * outer, outer - inner, 0, -(outer + inner) / 2], [outer - inner, 2 * inner, (outer + inner) / 2, 0], [outer - inner, 2 * inner, -(outer + inner) / 2, 0]]) {
      beams.push(paint(xf0(new THREE.BoxGeometry(w, th, d), x, y, z), col));
      if (colBand) beams.push(paint(xf0(new THREE.BoxGeometry(w + (d > w ? 0.6 : 0), th * 0.32, d + (w > d ? 0.6 : 0)), x, y - th * 0.05, z), colBand));
    }
    for (let i = 0; i < 40; i++) { const a = R() * Math.PI * 2; spark.push(V(Math.cos(a) * outer, y, Math.sin(a) * outer).clampLength(0, outer * 1.2)); }
  };
  frame(0.17, W(0.17) + 0.012 * H, 0.06 * H, 0.026 * H, gold(0.17, 1.15), lin(1.35, 0.8, 0.32));
  frame(0.35, W(0.35) + 0.009 * H, 0.022 * H, 0.02 * H, gold(0.35, 1.15), lin(1.35, 0.8, 0.32));
  const top = 0.836 * H;
  beams.push(paint(xf0(new THREE.BoxGeometry(0.052 * H, 0.022 * H, 0.052 * H), 0, top, 0), gold(0.84, 1.15)));
  beams.push(paint(xf0(new THREE.BoxGeometry(0.03 * H, 0.032 * H, 0.03 * H), 0, top + 0.027 * H, 0), lin(1.7, 1.25, 0.7)));
  beams.push(paint(xf0(new THREE.ConeGeometry(0.019 * H, 0.024 * H, 8), 0, top + 0.055 * H, 0), gold(0.9, 1.1)));
  beams.push(paint(xf0(new THREE.CylinderGeometry(0.006 * H, 0.007 * H, 0.016 * H, 8), 0, top + 0.074 * H, 0), lin(2.4, 2.1, 1.6)));
  beams.push(paint(xf0(new THREE.CylinderGeometry(0.0018 * H, 0.003 * H, H - (top + 0.082 * H), 5), 0, (H + top + 0.082 * H) / 2, 0), gold(1, 0.9)));
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const latMat = new THREE.MeshBasicMaterial({ map: latticeTex(), color: lin(0.9, 0.36, 0.07), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bm = new THREE.Mesh(mergeGeometries(beams), beamMat);
  const lm = new THREE.Mesh(mergeGeometries(panels), latMat); lm.renderOrder = 2;
  group.add(bm, lm);

  // ---- fx: the beacon (two rotating beams), a warm haze around the floodlit base, the sparkle
  const fx = [];
  const beacon = new THREE.Group(); beacon.position.set(0, top + 0.074 * H, 0);
  {
    const L = H * 1.5, cone = new THREE.ConeGeometry(0.06 * H, L, 14, 1, true);
    cone.translate(0, -L / 2, 0); cone.rotateZ(Math.PI / 2);
    const nb = cone.toNonIndexed(), p = nb.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, 1 - p.getX(i) / L), k = 0.12 * t * t; col[i * 3] = k; col[i * 3 + 1] = k * 0.92; col[i * 3 + 2] = k * 0.75; }
    nb.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const two = mergeGeometries([nb, nb.clone().rotateY(Math.PI)]);
    beacon.add(new THREE.Mesh(two, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    fx.push(beacon);
  }
  for (const [y, sx, sy, op] of [[0.1, 0.62, 0.36, 0.3], [0.3, 0.32, 0.42, 0.16], [0.62, 0.16, 0.5, 0.08]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a3a, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set(0, y * H, 0); s.scale.set(sx * H, sy * H, 1); fx.push(s);
  }
  // the sparkle: thousands of strobes over the whole tower
  const n = spark.length, pos = new Float32Array(n * 3), aPh = new Float32Array(n), aRate = new Float32Array(n);
  spark.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); aPh[i] = R() * 100; aRate[i] = 2.5 + R() * 5; });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sgeo.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1));
  sgeo.setAttribute('aRate', new THREE.BufferAttribute(aRate, 1));
  const smat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uPx: { value: 720 } },
    vertexShader: `uniform float uTime, uOn, uPx; attribute float aPh, aRate; varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float s = max(sin(uTime * aRate + aPh), 0.0);
        float f = pow(s, 22.0);
        vI = f * uOn;
        float d = max(-mv.z, 1.0);
        gl_PointSize = clamp(1.3 * uPx / d, 1.5, 9.0) * (0.55 + 0.9 * f);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vI;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = clamp(1.0 - dot(d, d) * 4.0, 0.0, 1.0);
        gl_FragColor = vec4(vec3(1.6, 1.65, 1.9) * r * r * vI, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparkle = new THREE.Points(sgeo, smat);
  const _sz = new THREE.Vector2();
  sparkle.onBeforeRender = (renderer) => { smat.uniforms.uPx.value = renderer.getDrawingBufferSize(_sz).y || 720; };
  sparkle.visible = false;
  fx.push(sparkle);
  return { group, fx, sparkle, beacon };
}
const _x0 = new THREE.Object3D();
function xf0(geo, x, y, z) { _x0.position.set(x, y, z); _x0.rotation.set(0, 0, 0); _x0.updateMatrix(); const g = geo.index ? geo.toNonIndexed() : geo; return g.applyMatrix4(_x0.matrix); }
