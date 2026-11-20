// TEMPLE COURTYARD — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js) and shown only on
// Ultra. It replaces the courtyard's low-poly pieces (`lite` in main.js: frangipani, chedis, columns, stone lanterns,
// festoon lanterns) with detailed ones, dresses the halls (naga stair rails, bai raka fins, gilded door + window frames,
// eave lights), fills the world beyond the walls (outer grounds, rain trees and palms, neighbouring viharns, a floodlit
// golden chedi past each hall, layered mountains with a hilltop temple and valley lights) and adds subtle life (falling
// frangipani, incense smoke, moths at the lamps, fireflies, motes in the floodlights).
// GAMEPLAY RULE: nothing new stands on or above the court + free zone, between either camera and the court, or near
// the ball's flight. Particles keep to the edges, are faint, and never cross the court.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFireflies } from './life.js';

const TAU = Math.PI * 2;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
const _o = new THREE.Object3D();
function place(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  return g.applyMatrix4(_o.matrix);
}
// merge pieces with possibly different attribute sets (keeps position / normal / uv only)
function merge(list) {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(clean);
}
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    build(parent, { cast = false, receive = false } = {}) {
      for (const [mat, list] of m) { const mesh = new THREE.Mesh(merge(list), mat); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); }
      m.clear();
    },
  };
}

/* ---------------- materials: triplanar plaster + "floodlit" warm uplighting baked into the shader ----------------
   Night temples are lit from below by warm floodlights: surfaces glow warm near their base and fade with height,
   strongest on faces turned toward the courtyard. Done in the shader (no extra lights → no cost per light). */
function enhance(mat, o = {}) {
  const U = {
    uTri: { value: o.tri || null }, uTS: { value: o.triScale ?? 0.35 }, uTA: { value: o.tri ? (o.triAmt ?? 1) : 0 },
    uUpCol: { value: new THREE.Color(o.upCol ?? 0xffa860) }, uUpK: { value: o.upK ?? 0 }, uUpY: { value: o.upY ?? 0 },
    uUpFall: { value: o.upFall ?? 4 }, uUpC: { value: new THREE.Vector3(...(o.upCentre || [0, 0, 0])) }, uUpWrap: { value: o.upWrap ?? 0.3 },
  };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWP = (wm * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(wm) * objectNormal);
      }`);
    sh.fragmentShader = `varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uTri; uniform float uTS; uniform float uTA;
      uniform vec3 uUpCol; uniform float uUpK; uniform float uUpY; uniform float uUpFall; uniform vec3 uUpC; uniform float uUpWrap;
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uTA > 0.0) {
          vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 tx = texture2D(uTri, vWP.zy * uTS).rgb * bw.x + texture2D(uTri, vWP.xz * uTS).rgb * bw.y + texture2D(uTri, vWP.xy * uTS).rgb * bw.z;
          float lum = dot(tx, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb *= mix(1.0, clamp(lum * 2.1, 0.55, 1.35), uTA);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uUpK > 0.0) {
          vec3 toC = uUpC - vWP; toC.y = 0.0;
          float face = clamp(dot(normalize(vWN), normalize(toC + vec3(1e-4))), 0.0, 1.0);
          float h = max(vWP.y - uUpY, 0.0);
          float up = exp(-h / uUpFall);
          totalEmissiveRadiance += diffuseColor.rgb * uUpCol * uUpK * up * (uUpWrap + (1.0 - uUpWrap) * face);
        }`);
  };
  mat.customProgramCacheKey = () => 'enh' + (o.tri ? 't' : '') + (o.upK ? 'u' : '');
  return mat;
}

// soft round sprite texture (smoke / glow / petals' halo)
function softTexture(inner = 0.0, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2;
  const gr = g.createRadialGradient(r, r, r * inner, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* ---------------- the court's keep-out zone (court + free zone + the space above it and toward both cameras) ---------------- */
function keepOut(F, x, z, pad = 0.8) {
  if (Math.abs(x) < F.outX + pad && Math.abs(z) < F.outZ + pad) return true;      // court + free zone
  if (Math.abs(z) < 4.5 && Math.abs(x) < F.outX + 9) return true;                  // the corridor to each baseline camera
  return false;
}

/* =====================================================================
   BUILDER
   ===================================================================== */
export function buildTempleUltra(ctx, uTime) {
  const { F, texLoader } = ctx;
  const T = ctx.temple, y0 = T.y0, M = T.mats, HX = T.HALL_X;
  const root = new THREE.Group(); root.name = 'temple-ultra';
  const ticks = [];
  const R = rng(20251119);

  const load = (name, srgb, rep = 1) => {
    const t = texLoader.load(`assets/temple-ultra/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const plasterTex = load('clay_plaster_diff.jpg', true);
  const UP = { upCol: 0xffcf9a, upY: y0, upCentre: [0, 0, 0] };
  const mat = {
    plaster: enhance(new THREE.MeshStandardMaterial({ color: 0xf1e4cf, roughness: 0.9 }), { tri: plasterTex, triScale: 0.3, upK: 0.42, upFall: 2.6, upWrap: 0.25, ...UP }),
    stone: enhance(new THREE.MeshStandardMaterial({ color: 0xb7a189, roughness: 0.92 }), { tri: plasterTex, triScale: 0.6, triAmt: 0.9, upK: 0.3, upFall: 1.4, ...UP }),
    gold: enhance(new THREE.MeshStandardMaterial({ color: 0xe0aa50, metalness: 0.85, roughness: 0.3, emissive: 0x1c0f02 }), { upK: 0.9, upFall: 5, upWrap: 0.45, ...UP }),
    red: enhance(new THREE.MeshStandardMaterial({ color: 0x8c1f17, roughness: 0.42 }), { upK: 0.3, upFall: 2.5, ...UP }),
    glaze: new THREE.MeshStandardMaterial({ color: 0x3f8f62, roughness: 0.35, metalness: 0.1 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.9) }),
  };
  const B = batch();
  let lanternParts = null;                // static detail (no shadows: everything here is outside the shadow frustum or tiny)

  /* ---------------- 1. COLUMNS — tapered, with a gilded lotus (bua) capital and base ring ---------------- */
  function columnParts(H, r0, r1) {
    const prof = [[r0 * 1.3, 0], [r0 * 1.3, 0.1], [r0 * 1.12, 0.16], [r0 * 1.04, 0.24]];
    for (let i = 0; i <= 10; i++) { const t = i / 10, y = 0.24 + t * (H - 0.74); prof.push([r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.012, y]); }
    prof.push([r1, H - 0.42]);
    const shaft = new THREE.LatheGeometry(V2(prof), 28);
    const gold = [];
    gold.push(place(new THREE.TorusGeometry(r0 * 1.08, 0.028, 6, 28), 0, 0.2, 0, 0, Math.PI / 2));
    gold.push(new THREE.LatheGeometry(V2([[r1 * 0.98, H - 0.44], [r1 * 1.35, H - 0.33], [r1 * 1.7, H - 0.18], [r1 * 1.75, H - 0.1], [r1 * 1.5, H - 0.04], [r1 * 1.2, H]]), 28));
    const petal = new THREE.SphereGeometry(1, 6, 4); petal.scale(0.055, 0.15, 0.03);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; gold.push(place(petal, Math.cos(a) * r1 * 1.45, H - 0.28, Math.sin(a) * r1 * 1.45, -a + Math.PI / 2, 0, 0.45).rotateY(0)); }
    const red = [new THREE.CylinderGeometry(r1 * 1.04, r1 * 1.04, 0.1, 28).translate(0, H - 0.5, 0), new THREE.CylinderGeometry(r0 * 1.06, r0 * 1.06, 0.06, 28).translate(0, 0.3, 0)];
    return { shaft, gold: merge(gold), red: merge(red) };
  }
  function instanceParts(parts, mats, spots) {      // spots: [x, y, z]
    for (const [k, m] of mats) {
      const im = new THREE.InstancedMesh(parts[k], m, spots.length);
      spots.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
      im.computeBoundingSphere(); root.add(im);
    }
  }
  const hallPt = (s, hx, hy, hz) => (s > 0 ? [HX + hx, y0 + hy, hz] : [-HX - hx, y0 + hy, -hz]);
  {
    const PM = [['shaft', mat.plaster], ['gold', mat.gold], ['red', mat.red]];
    const gal = [];
    for (const sz of [-1, 1]) for (let x = -25; x <= 25.01; x += 2.5) gal.push([x, y0 + 0.35, sz * 14.1]);
    instanceParts(columnParts(3.3, 0.2, 0.17), PM, gal);
    const tall = [], short = [];
    for (const s of [-1, 1]) {
      for (const z of [-4.6, -2.6, 2.6, 4.6]) tall.push(hallPt(s, -2.7, 1.0, z));
      for (const x of [-2.7, 0, 2.7, 5.4, 8.1, 10.8, 13.0]) for (const sz of [-1, 1]) short.push(hallPt(s, x, 1.0, sz * 7.7));
    }
    instanceParts(columnParts(4.82, 0.27, 0.22), PM, tall);
    instanceParts(columnParts(3.95, 0.25, 0.2), PM, short);
  }

  /* ---------------- 2. CORNER CHEDIS — redented square terraces, lotus mouldings, bell, gilded ringed spire ---------------- */
  function chediParts(sc = 1) {
    const sq = (pts) => { const g = new THREE.LatheGeometry(V2(pts.map(([r, y]) => [r * Math.SQRT2 * sc, y * sc])), 4); g.rotateY(Math.PI / 4); return g; };
    const rd = (pts, seg = 72) => new THREE.LatheGeometry(V2(pts.map(([r, y]) => [r * sc, y * sc])), seg);
    const white = [], gold = [];
    white.push(sq([[0, 0], [3.0, 0], [3.0, 0.5], [2.9, 0.58], [2.9, 0.62]]));
    white.push(sq([[2.75, 0.62], [2.75, 1.05], [2.65, 1.12], [2.65, 1.16]]));
    white.push(sq([[2.5, 1.16], [2.5, 1.55], [2.4, 1.62], [0, 1.62]]));
    white.push(rd([[2.25, 1.62], [2.3, 1.7], [2.18, 1.82], [2.28, 1.92], [2.16, 2.04], [2.3, 2.16], [2.42, 2.4], [2.48, 2.8], [2.46, 3.2],
      [2.36, 3.6], [2.18, 4.0], [1.92, 4.4], [1.62, 4.8], [1.3, 5.15], [1.0, 5.45], [0.86, 5.62], [0.8, 5.75], [0, 5.75]]));
    gold.push(rd([[2.33, 2.16], [2.47, 2.3], [2.5, 2.42], [2.43, 2.5]], 72));                               // gilded lotus band round the bell
    white.push(sq([[0.78, 5.75], [0.78, 6.15], [0.86, 6.2], [0.86, 6.28], [0.7, 6.32], [0, 6.32]]));      // harmika
    const ring = [[0.62, 6.32]];
    let y = 6.36, r = 0.6;
    for (let k = 0; k < 9; k++) { ring.push([r + 0.05, y], [r + 0.05, y + 0.09], [r - 0.02, y + 0.13]); y += 0.24 - k * 0.008; r *= 0.86; }
    ring.push([0.13, y], [0.1, y + 0.6], [0.06, y + 1.4], [0.11, y + 1.55], [0.06, y + 1.72], [0.02, y + 2.3], [0, y + 2.45]);
    gold.push(rd(ring, 40));
    return { white: merge(white), gold: merge(gold) };
  }
  {
    const p = chediParts(1);
    const spots = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([sx * 34, y0, sz * 12.8]);
    instanceParts({ white: p.white, gold: p.gold }, [['white', mat.plaster], ['gold', mat.gold]], spots);
    // a ring of little oil lamps round each chedi's base
    const lamp = new THREE.SphereGeometry(0.05, 8, 6);
    const pts = [];
    for (const [x, , z] of spots) for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; pts.push(place(lamp, x + Math.cos(a) * 4.45, y0 + 0.06, z + Math.sin(a) * 4.45)); }
    B.put(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(3) }), merge(pts));
  }

  /* ---------------- 3. STONE LANTERNS — octagonal plinth, turned shaft, open firebox, curved pagoda cap ---------------- */
  {
    const st = [], gd = [], gl = [], rd = [];
    const oct = (pts) => { const g = new THREE.LatheGeometry(V2(pts), 8); g.rotateY(Math.PI / 8); return g; };
    st.push(oct([[0, 0], [0.38, 0], [0.38, 0.14], [0.33, 0.2], [0.27, 0.24], [0, 0.24]]));
    st.push(new THREE.LatheGeometry(V2([[0.16, 0.24], [0.13, 0.32], [0.12, 0.5], [0.15, 0.56], [0.12, 0.62], [0.11, 0.9], [0.15, 0.98], [0.2, 1.06], [0.3, 1.12], [0, 1.12]]), 20));
    st.push(new THREE.BoxGeometry(0.6, 0.07, 0.6).translate(0, 1.155, 0));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) st.push(new THREE.BoxGeometry(0.07, 0.38, 0.07).translate(dx * 0.22, 1.38, dz * 0.22));
    st.push(new THREE.BoxGeometry(0.56, 0.05, 0.56).translate(0, 1.595, 0));
    gl.push(new THREE.BoxGeometry(0.3, 0.3, 0.3).translate(0, 1.37, 0));
    const cap = new THREE.LatheGeometry(V2([[0, 1.6], [0.5, 1.6], [0.52, 1.64], [0.44, 1.68], [0.3, 1.76], [0.18, 1.88], [0.1, 2.0], [0.06, 2.06], [0, 2.06]]), 4);
    cap.rotateY(Math.PI / 4); rd.push(cap);
    gd.push(new THREE.LatheGeometry(V2([[0, 2.04], [0.05, 2.06], [0.08, 2.12], [0.06, 2.2], [0.02, 2.3], [0, 2.34]]), 14));
    const parts = { st: merge(st), gd: merge(gd), gl: merge(gl), rd: merge(rd) };
    lanternParts = parts;
    const spots = T.stoneLanterns.map(([x, z]) => [x, y0, z]);
    instanceParts(parts, [['st', mat.stone], ['gd', mat.gold], ['gl', mat.glow], ['rd', mat.red]], spots);
  }

  /* ---------------- 3b. CLOISTER BUDDHAS — a row of seated gilded images along both gallery back walls ---------------- */
  {
    const fig = [];
    fig.push(new THREE.LatheGeometry(V2([[0, 0], [0.42, 0], [0.42, 0.1], [0.36, 0.14], [0.4, 0.2], [0.44, 0.26], [0.38, 0.3], [0, 0.3]]), 24));   // lotus throne
    fig.push(new THREE.SphereGeometry(1, 14, 7).scale(0.38, 0.13, 0.26).translate(0, 0.4, 0.04));                                             // crossed legs
    fig.push(new THREE.LatheGeometry(V2([[0, 0.38], [0.2, 0.4], [0.22, 0.55], [0.19, 0.72], [0.2, 0.8], [0.12, 0.86], [0.06, 0.88], [0, 0.88]]), 20).scale(1, 1, 0.75));   // torso
    fig.push(new THREE.SphereGeometry(0.105, 12, 8).translate(0, 0.98, 0.01));                                                                   // head
    fig.push(new THREE.ConeGeometry(0.035, 0.16, 10).translate(0, 1.13, 0.01));                                                                   // flame (ushnisha)
    fig.push(new THREE.SphereGeometry(1, 12, 8).scale(0.16, 0.05, 0.12).translate(0, 0.47, 0.14));                                               // hands in the lap
    const geo = merge(fig);
    const spots = [];
    for (const sz of [-1, 1]) for (let x = -23.75; x <= 23.76; x += 2.5) spots.push([x, sz]);
    const im = new THREE.InstancedMesh(geo, mat.gold, spots.length);
    spots.forEach(([x, sz], i) => { _o.position.set(x, y0 + 0.35, sz * 17.25); _o.rotation.set(0, sz > 0 ? Math.PI : 0, 0); _o.scale.setScalar(1.15); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
    im.computeBoundingSphere(); root.add(im);
  }

  /* ---------------- 4. FRANGIPANI — forked candelabra limbs, leaf rosettes at the tips, five-petal flowers ---------------- */
  const tipsWorld = [];                       // canopy points (petals fall from here)
  {
    const leafGeo = (() => {                  // one leaf along +X: pointed oval, folded at the midrib, drooping at the tip
      const L = 0.62, W = 0.1, nx = 7, nz = 1, pos = [], idx = [], uv = [];
      for (let i = 0; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
        const t = i / nx, w = W * Math.sin(Math.PI * Math.pow(t, 0.8)) * (j / nz);
        pos.push(t * L, -Math.abs(w) * 0.35 - t * t * 0.09, w); uv.push(t, j / (2 * nz) + 0.5);
      }
      const row = 2 * nz + 1;
      for (let i = 0; i < nx; i++) for (let j = 0; j < 2 * nz; j++) { const a = i * row + j; idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    })();
    const flower = (() => {
      const pet = [], ctr = [];
      for (let k = 0; k < 5; k++) {
        const p = new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2); p.scale(0.034, 0.012, 0.018); p.translate(0.03, 0, 0);
        _o.position.set(0, 0, 0); _o.rotation.set(0.25, (k / 5) * TAU, 0.18); _o.scale.setScalar(1); _o.updateMatrix(); p.applyMatrix4(_o.matrix);
        pet.push(p);
      }
      ctr.push(new THREE.SphereGeometry(0.012, 5, 3).translate(0, 0.006, 0));
      return { pet: merge(pet), ctr: merge(ctr) };
    })();
    const variant = (seed) => {
      const r = rng(seed), bark = [], leaf = [], pet = [], ctr = [], tips = [];
      const limb = (a, b, r0, r1) => {
        const d = new THREE.Vector3().subVectors(b, a), L = d.length();
        const c = new THREE.CylinderGeometry(r1, r0, L, 12, 3, true);
        const uv = c.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L * 1.5);
        c.translate(0, L / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())); c.translate(a.x, a.y, a.z);
        bark.push(c, new THREE.SphereGeometry(r1 * 1.12, 10, 6).translate(b.x, b.y, b.z));
      };
      const rosette = (p) => {
        tips.push(p.clone());
        const n = 16 + Math.floor(r() * 5);
        for (let j = 0; j < n; j++) {
          _o.position.copy(p); _o.rotation.set(0, j * 2.39996 + r() * 0.3, 0.85 - (j / n) * 1.05); _o.scale.setScalar(0.85 + r() * 0.35); _o.updateMatrix();
          leaf.push(leafGeo.clone().applyMatrix4(_o.matrix));
        }
        const nf = 6 + Math.floor(r() * 5);
        for (let k = 0; k < nf; k++) {
          const a = r() * TAU, rr = r() * 0.09;
          _o.position.set(p.x + Math.cos(a) * rr, p.y + 0.1 + r() * 0.08, p.z + Math.sin(a) * rr); _o.rotation.set((r() - 0.5) * 0.7, r() * TAU, (r() - 0.5) * 0.7); _o.scale.setScalar(1.9); _o.updateMatrix();
          pet.push(flower.pet.clone().applyMatrix4(_o.matrix)); ctr.push(flower.ctr.clone().applyMatrix4(_o.matrix));
        }
      };
      const base = V3(0, 0, 0), knee = V3(0.06, 0.9, 0.02), fork = V3(0.12, 1.55, -0.04);
      limb(base, knee, 0.21, 0.18); limb(knee, fork, 0.18, 0.15);
      const nMain = 4 + Math.floor(r() * 2);
      for (let i = 0; i < nMain; i++) {
        const a = (i / nMain) * TAU + r() * 0.6, out = 0.8 + r() * 0.5;
        const mid = V3(fork.x + Math.cos(a) * out, fork.y + 0.75 + r() * 0.45, fork.z + Math.sin(a) * out);
        limb(fork, mid, 0.12, 0.095);
        for (const da of [-0.45, 0.45]) {
          const o2 = 0.45 + r() * 0.35;
          const tip = V3(mid.x + Math.cos(a + da) * o2, mid.y + 0.55 + r() * 0.35, mid.z + Math.sin(a + da) * o2);
          limb(mid, tip, 0.085, 0.065);
          if (r() < 0.55) {
            for (const db of [-0.35, 0.35]) {
              const t2 = V3(tip.x + Math.cos(a + da + db) * 0.28, tip.y + 0.32 + r() * 0.15, tip.z + Math.sin(a + da + db) * 0.28);
              limb(tip, t2, 0.06, 0.05); rosette(t2);
            }
          } else rosette(tip);
        }
      }
      return { bark: merge(bark), leaf: merge(leaf), pet: merge(pet), ctr: merge(ctr), tips };
    };
    const vars = [variant(11), variant(29), variant(47)];
    const barkMat = new THREE.MeshStandardMaterial({ map: load('bark_brown_02_diff.jpg', true), normalMap: load('bark_brown_02_nor_gl.jpg', false), color: 0x9a8a7a, roughness: 0.95 });
    const sway = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          { float h = max(position.y - 1.6, 0.0); vec3 ip = instanceMatrix[3].xyz;
            transformed.x += sin(uTime * 1.1 + ip.x * 0.37 + position.y * 1.7) * 0.022 * h;
            transformed.z += cos(uTime * 0.9 + ip.z * 0.41 + position.x * 2.1) * 0.022 * h; }`);
      };
      m.customProgramCacheKey = () => 'sway';
      return m;
    };
    const leafMat = sway(new THREE.MeshStandardMaterial({ color: 0x4f8a3e, emissive: 0x08140a, roughness: 0.55, side: THREE.DoubleSide }));
    const petMat = sway(new THREE.MeshStandardMaterial({ color: 0xfff7ea, emissive: 0x7a6e5c, roughness: 0.55, side: THREE.DoubleSide }));
    const ctrMat = sway(new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0x4a3000, roughness: 0.5 }));
    const byVar = [[], [], []];
    T.trees.forEach(([x, z], i) => byVar[i % 3].push([x, z, i]));
    vars.forEach((v, vi) => {
      const list = byVar[vi]; if (!list.length) return;
      for (const [geo, m, cast] of [[v.bark, barkMat, true], [v.leaf, leafMat, true], [v.pet, petMat, false], [v.ctr, ctrMat, false]]) {
        const im = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach(([x, z, i], k) => {
          _o.position.set(x, y0, z); _o.rotation.set(0, i * 2.4, 0); _o.scale.setScalar(1.05 + (i % 3) * 0.12); _o.updateMatrix();
          im.setMatrixAt(k, _o.matrix);
          if (m === leafMat) for (const t of v.tips) tipsWorld.push(t.clone().applyMatrix4(_o.matrix));
        });
        im.castShadow = cast; im.computeBoundingSphere(); root.add(im);
      }
    });
  }

  /* ---------------- 5. FESTOON PAPER LANTERNS — ribbed, with gilded caps ---------------- */
  if (T.festoonPts) {
    const body = new THREE.LatheGeometry(V2([[0.02, -0.2], [0.09, -0.19], [0.15, -0.13], [0.18, -0.04], [0.18, 0.04], [0.15, 0.13], [0.09, 0.19], [0.02, 0.2]]), 32);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.07 * Math.pow(Math.abs(Math.cos(a * 5)), 3); p.setX(i, x * k); p.setZ(i, z * k); }
    body.computeVertexNormals();
    const caps = merge([new THREE.CylinderGeometry(0.06, 0.07, 0.04, 16).translate(0, 0.21, 0), new THREE.CylinderGeometry(0.07, 0.06, 0.04, 16).translate(0, -0.21, 0), new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6).translate(0, -0.29, 0)]);
    const pts = T.festoonPts;
    const lan = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3.2) }), pts.length);
    const cap = new THREE.InstancedMesh(caps, mat.gold, pts.length);
    const warm = [new THREE.Color(0xff5a2e), new THREE.Color(0xffae42), new THREE.Color(0xffd27a)];
    pts.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, i * 0.7, 0); _o.scale.setScalar(1); _o.updateMatrix(); lan.setMatrixAt(i, _o.matrix); cap.setMatrixAt(i, _o.matrix); lan.setColorAt(i, warm[i % 3]); });
    lan.computeBoundingSphere(); cap.computeBoundingSphere();
    root.add(lan, cap);
  }

  /* ---------------- 6. HALL DRESSING — naga stair rails, bai raka fins, gilded arches, gold bands, eave lights ---------------- */
  {
    const H = batch(), bulbs = [];
    // naga: a glazed serpent down each side of the front steps, rearing into a five-headed gilded hood at the bottom
    const nagaBody = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-2.4, 1.38], [-3.4, 1.34], [-4.6, 0.96], [-5.6, 0.56], [-6.1, 0.42], [-6.36, 0.58], [-6.42, 1.0], [-6.32, 1.42]].map(([x, y]) => V3(x, y, 0))), 64, 0.12, 14);
    const fins = [];
    for (let i = 0; i < 18; i++) { const t = i / 18, x = -2.5 - t * 3.6, y = 1.36 - Math.max(0, (x + 3.4) * -0.36) - 0.0; fins.push(new THREE.ConeGeometry(0.035, 0.14, 4).translate(x, y + 0.12, 0)); }
    const hood = [];
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.42, hx = -6.36, hy = 1.5 + Math.cos(a) * 0.32, hz = Math.sin(a) * 0.42;
      hood.push(new THREE.SphereGeometry(0.11, 12, 8).scale(1.5, 0.8, 0.9).translate(hx - 0.1, hy, hz));
      hood.push(new THREE.ConeGeometry(0.035, 0.22, 6).translate(hx, hy + 0.17, hz));
    }
    hood.push(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(-6.3, 1.42, 0));
    const plinth = new THREE.BoxGeometry(0.62, 0.42, 0.62).translate(-6.36, 0.21, 0);
    // bai raka: gilded fins along both front rakes; hang hong: curled tips at the eaves
    const raka = [];
    const rake = (X, ze, ye, yr) => {
      for (const s of [-1, 1]) {
        const len = Math.hypot(ze, yr - ye), n = Math.floor(len / 0.3), th = Math.atan2(s * (yr - ye), ze);
        for (let i = 1; i < n; i++) { const t = i / n; raka.push(new THREE.ConeGeometry(0.075, 0.3, 3).rotateX(th).translate(X - 0.02, ye + (yr - ye) * t + 0.12, s * ze * (1 - t))); }
        raka.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(X, ye + 0.05, s * ze), V3(X, ye + 0.05, s * (ze + 0.35)), V3(X, ye + 0.4, s * (ze + 0.55)), V3(X, ye + 0.62, s * (ze + 0.42))]), 16, 0.045, 8));
        for (let i = 0; i <= n; i++) { const t = i / n; bulbs.push([X - 0.1, ye + (yr - ye) * t - 0.08, s * ze * (1 - t)]); }
      }
    };
    rake(-3.05, 6.0, 5.9, 10.2);
    rake(-1.65, 6.6, 6.2, 11.0);
    for (const s of [-1, 1]) for (let x = -2.9; x <= 13.3; x += 0.45) bulbs.push([x, 4.38, s * 8.5]);
    // gilded pointed arch (sum) over the door, small ones over each window, gold bands round the cella
    const arch = (w, h, apex, t) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.bezierCurveTo(-w, h + apex * 0.55, -w * 0.25, h + apex * 0.7, 0, h + apex); sh.bezierCurveTo(w * 0.25, h + apex * 0.7, w, h + apex * 0.55, w, h); sh.lineTo(w, 0); sh.lineTo(w - t, 0);
      sh.lineTo(w - t, h); sh.bezierCurveTo(w - t, h + apex * 0.45, w * 0.2, h + apex * 0.6, 0, h + apex - t * 1.3); sh.bezierCurveTo(-w * 0.2, h + apex * 0.6, -w + t, h + apex * 0.45, -w + t, h); sh.lineTo(-w + t, 0); sh.closePath();
      return new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 24 });
    };
    const door = arch(1.42, 3.1, 1.55, 0.2).rotateY(-Math.PI / 2).translate(1.44, 1.05, 0);
    const wins = [];
    for (const x of [3.5, 6, 8.5, 11]) for (const sz of [-1, 1]) wins.push(arch(0.62, 1.7, 0.7, 0.1).rotateY(sz > 0 ? 0 : Math.PI).translate(x, 2.25, sz * 5.04));
    const bands = [];
    for (const y of [1.25, 5.2]) { bands.push(new THREE.BoxGeometry(11.06, 0.07, 10.06).translate(7, y, 0)); }
    for (const s of [-1, 1]) {
      const Mh = new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).setPosition(s * HX, y0, 0);
      const A = (g) => g.clone().applyMatrix4(Mh);
      for (const sz of [-1, 1]) {
        const flip = new THREE.Matrix4().makeScale(1, 1, sz).premultiply(Mh).multiply(new THREE.Matrix4().makeTranslation(0, 0, 2.78));
        const F2 = (g) => { const c = g.clone().applyMatrix4(flip); if (sz < 0) { const ix = c.index; if (!ix) { const p = c.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = [p.getX(i), p.getY(i), p.getZ(i)]; p.setXYZ(i, p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)); p.setXYZ(i + 1, ...a); } } c.computeVertexNormals(); } return c; };
        H.put(mat.glaze, F2(nagaBody.toNonIndexed())); H.put(mat.gold, F2(merge(fins))); H.put(mat.gold, F2(merge(hood))); H.put(mat.stone, F2(plinth.toNonIndexed()));
      }
      H.put(mat.gold, A(merge(raka))); H.put(mat.gold, A(door)); H.put(mat.gold, A(merge(wins))); H.put(mat.gold, A(merge(bands)));
      for (const [x, y, z] of bulbs) {
        const w = s > 0 ? [HX + x, y0 + y, z] : [-HX - x, y0 + y, -z];
        bulbs.w = bulbs.w || []; bulbs.w.push(w);
      }
    }
    H.build(root);
    // eave / rake outline lights on the halls, and a dimmer run along both gallery eaves
    const bulbGeo = new THREE.SphereGeometry(0.045, 6, 4);
    const allB = [...bulbs.w];
    for (const sz of [-1, 1]) for (let x = -26; x <= 26.01; x += 0.9) allB.push([x, y0 + 3.8, sz * 13.42]);
    const im = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(2.6) }), allB.length);
    allB.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
    im.computeBoundingSphere(); root.add(im);
  }

  /* ---------------- 7. BEYOND THE WALLS ---------------- */
  // outer grounds: dark grass out to the horizon (the courtyard paving sits on top)
  {
    const gm = new THREE.MeshStandardMaterial({ map: load('leafy_grass_diff.jpg', true, 140), normalMap: load('leafy_grass_nor_gl.jpg', false, 140), color: 0x5d6a4a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(560, 64), gm);
    ground.rotation.x = -Math.PI / 2; ground.position.y = y0 - 0.03; ground.receiveShadow = false;
    root.add(ground);
  }
  // neighbouring viharns and salas: multi-tier roofs with chofa and gilded gables, floodlit, lamp-lit doors
  const world = batch();
  function viharn(sc, tiers = 2) {
    const g = { pl: [], st: [], ro: [], rg: [], gd: [], orn: [], gl: [], rd: [] };
    const L = 14, Wd = 8;
    g.st.push(new THREE.BoxGeometry(L + 2, 0.9, Wd + 2).translate(L / 2, 0.45, 0));
    g.pl.push(new THREE.BoxGeometry(L, 4.0, Wd).translate(L / 2, 2.9, 0));
    g.rd.push(new THREE.BoxGeometry(L + 2.1, 0.12, Wd + 2.1).translate(L / 2, 0.86, 0));
    g.gl.push(new THREE.PlaneGeometry(1.8, 2.6).rotateY(-Math.PI / 2).translate(-0.02, 2.2, 0));
    for (const x of [2.5, 5.5, 8.5, 11.5]) for (const s of [-1, 1]) g.gl.push(new THREE.PlaneGeometry(0.7, 1.2).rotateY(s > 0 ? 0 : Math.PI).translate(x, 2.9, s * (Wd / 2 + 0.02)));
    let eY = 5.0, half = Wd / 2 + 1.6, ridge = 9.6;
    for (let t = 0; t < tiers; t++) {
      const x0 = -1.4 + t * 1.2, x1 = L + 1.4 - t * 1.2;
      for (const s of [-1, 1]) {
        const q = new THREE.BufferGeometry();
        q.setAttribute('position', new THREE.Float32BufferAttribute([x0, eY, s * half, x1, eY, s * half, x1, ridge, 0, x0, eY, s * half, x1, ridge, 0, x0, ridge, 0], 3));
        q.computeVertexNormals();
        (t === tiers - 1 ? g.ro : g.rg).push(q);
      }
      const ped = new THREE.BufferGeometry();
      ped.setAttribute('position', new THREE.Float32BufferAttribute([x0 + 0.02, eY, -half, x0 + 0.02, eY, half, x0 + 0.02, ridge, 0], 3));
      ped.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2.6, 0, 1.3, 1.6], 2)); ped.computeVertexNormals();
      g.orn.push(ped);
      for (const s of [-1, 1]) g.gd.push(new THREE.BoxGeometry(0.16, 0.24, Math.hypot(half, ridge - eY) + 0.2).rotateX(s * Math.atan2(ridge - eY, half)).translate(x0 - 0.05, (eY + ridge) / 2, s * half / 2));
      g.gd.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(x0, ridge, 0), V3(x0 - 0.2, ridge + 0.6, 0), V3(x0 + 0.1, ridge + 1.05, 0), V3(x0 + 0.45, ridge + 0.95, 0)]), 12, 0.08, 6));
      g.gd.push(new THREE.BoxGeometry(x1 - x0, 0.14, 0.18).translate((x0 + x1) / 2, ridge + 0.05, 0));
      eY += 1.0; half -= 1.1; ridge += 0.9;
    }
    const out = {};
    for (const k of Object.keys(g)) if (g[k].length) out[k] = merge(g[k]).scale(sc, sc, sc);
    return out;
  }
  {
    const MM = { pl: mat.plaster, st: mat.stone, ro: M.roofO, rg: M.roofG, gd: mat.gold, orn: M.orn, gl: mat.glow, rd: mat.red };
    // [x, z, facing (ry), scale, tiers] — all outside the courtyard walls (|z| > 18.5 or |x| > 42.5)
    const sites = [[-24, 31, -Math.PI / 2, 1.0, 3], [10, 36, -Math.PI / 2, 1.15, 2], [34, 30, -Math.PI / 2 - 0.3, 0.9, 2],
      [-12, -33, Math.PI / 2, 1.1, 3], [22, -38, Math.PI / 2, 0.95, 2], [-38, -30, Math.PI / 2 + 0.3, 0.85, 2],
      [62, 34, Math.PI, 0.8, 2], [-60, -36, 0, 0.8, 2], [58, -40, -Math.PI * 0.8, 0.75, 3], [-64, 40, Math.PI * 0.2, 0.8, 2]];
    const lampSpots = [], pools = [];
    for (const [x, z, ry, sc, tiers] of sites) {
      const v = viharn(sc, tiers);
      for (const [k, geo] of Object.entries(v)) world.put(MM[k], place(geo, x, y0, z, ry));
      // a pair of stone lanterns at the door and warm light pooled on the grass in front
      const loc = (lx, lz) => { const c = Math.cos(ry), s2 = Math.sin(ry); return [x + (lx * c + lz * s2) * sc, z + (-lx * s2 + lz * c) * sc]; };
      for (const lz of [-2.2, 2.2]) { const [px, pz] = loc(-2.6, lz); lampSpots.push([px, y0, pz]); pools.push([px, pz, 2.2]); }
      const [dx, dz] = loc(-3.2, 0); pools.push([dx, dz, 4.5]);
    }
    instanceParts(lanternParts, [['st', mat.stone], ['gd', mat.gold], ['gl', mat.glow], ['rd', mat.red]], lampSpots);
    const pc = document.createElement('canvas'); pc.width = pc.height = 128;
    { const g = pc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    const pim = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), color: new THREE.Color(0xffb066).multiplyScalar(0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), pools.length);
    pools.forEach(([px, pz, r], i) => { _o.position.set(px, y0 + 0.02, pz); _o.rotation.set(0, 0, 0); _o.scale.set(r, 1, r); _o.updateMatrix(); pim.setMatrixAt(i, _o.matrix); });
    pim.computeBoundingSphere(); root.add(pim);
  }
  // the great golden chedi past each hall (each player sees one rising behind their opponent), flanked by two white ones
  {
    const BIG = 5.8, big = chediParts(BIG), mid = chediParts(1.9);
    const halo = new THREE.SpriteMaterial({ map: softTexture(0, 256), color: new THREE.Color(0xffb35a), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const goldBright = enhance(new THREE.MeshStandardMaterial({ color: 0xe8b04e, metalness: 0.8, roughness: 0.32, emissive: 0x2a1604 }), { upK: 2.2, upFall: 22, upWrap: 0.5, upY: y0, upCol: 0xffae5a, upCentre: [0, 0, 0] });
    for (const s of [-1, 1]) {
      const x = s * 100, z = -s * 40;   // off to one side of each far hall: in view, but never behind the ball's flight (the centre of the screen)
      world.put(goldBright, place(big.white, x, y0, z)); world.put(goldBright, place(big.gold, x, y0, z));
      for (const off of [22, 38]) { const zz = z - s * off; world.put(mat.plaster, place(mid.white, x - s * 10, y0, zz)); world.put(mat.gold, place(mid.gold, x - s * 10, y0, zz)); }   // two white chedis further out still
      const h = new THREE.Sprite(halo); h.position.set(x, y0 + 30, z); h.scale.set(64, 64, 1); root.add(h);
      // a terrace of lamps round its base
      const lamps = [];
      for (let k = 0; k < 72; k++) { const a = (k / 72) * TAU, rr = 3.0 * BIG * 1.5; lamps.push(new THREE.SphereGeometry(0.22, 8, 6).translate(x + Math.cos(a) * rr, y0 + 0.4, z + Math.sin(a) * rr)); }
      world.put(mat.glow, merge(lamps));
    }
  }
  world.build(root);
  // rain trees (wide umbrella canopies) and coconut palms around the outside of the walls
  {
    const canopy = new THREE.IcosahedronGeometry(1, 3);
    const pp = canopy.attributes.position, nrm = new THREE.Vector3();
    for (let i = 0; i < pp.count; i++) {
      nrm.set(pp.getX(i), pp.getY(i), pp.getZ(i)).normalize();
      const n = 1 + 0.16 * Math.sin(nrm.x * 7.1 + nrm.z * 3.3) * Math.cos(nrm.y * 6.3 + nrm.x * 2.1) + 0.08 * Math.sin(nrm.z * 13.7 + nrm.y * 9.1);
      pp.setXYZ(i, nrm.x * n, Math.max(nrm.y, -0.25) * n, nrm.z * n);
    }
    canopy.computeVertexNormals();
    canopy.scale(1, 0.48, 1);
    const trunk = merge([new THREE.CylinderGeometry(0.035, 0.07, 1, 8).translate(0, 0.5, 0)]);
    const spots = [];
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, r = 24 + R() * 70;
      const x = Math.cos(a) * r * 1.35, z = Math.sin(a) * r;
      if (Math.abs(x) < 44 && Math.abs(z) < 20) continue;               // inside the walls
      if (Math.abs(x) > 72 && Math.abs(z) > 14 && Math.abs(z) < 84) continue;   // keep the great chedis clear
      spots.push([x, z, 5 + R() * 4, 7 + R() * 5]);
    }
    const leafM = new THREE.MeshStandardMaterial({ color: 0x24371f, roughness: 0.9 });
    const barkM = new THREE.MeshStandardMaterial({ color: 0x3a2f27, roughness: 0.95 });
    const cIm = new THREE.InstancedMesh(canopy, leafM, spots.length), tIm = new THREE.InstancedMesh(trunk, barkM, spots.length);
    spots.forEach(([x, z, rad, h], i) => {
      _o.position.set(x, y0 + h, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.set(rad, rad, rad); _o.updateMatrix(); cIm.setMatrixAt(i, _o.matrix);
      _o.position.set(x, y0, z); _o.scale.set(rad, h, rad); _o.updateMatrix(); tIm.setMatrixAt(i, _o.matrix);
    });
    cIm.computeBoundingSphere(); tIm.computeBoundingSphere();
    root.add(cIm, tIm);
    // palms: curved ringed trunks + feathery fronds that sway
    const palmT = [], palmF = [];
    {
      const curve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0.3, 4, 0), V3(1.0, 8, 0), V3(1.9, 11.5, 0)]);
      palmT.push(new THREE.TubeGeometry(curve, 24, 0.17, 8));
      const top = V3(1.9, 11.5, 0);
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU, droop = 0.55 + (k % 3) * 0.2;
        const fp = [], fi = [];
        const N = 14;
        for (let i = 0; i <= N; i++) {
          const t = i / N, d = t * 3.4, y = Math.sin(t * Math.PI * 0.6) * 0.9 - t * t * 2.4 * droop, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04;
          fp.push(d, y, -w, d, y + 0.08, 0, d, y, w);
        }
        for (let i = 0; i < N; i++) { const b = i * 3; fi.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi); fg.computeVertexNormals();
        _o.position.copy(top); _o.rotation.set(0, a, 0.15); _o.scale.setScalar(1); _o.updateMatrix();
        palmF.push(fg.applyMatrix4(_o.matrix));
      }
    }
    const palmSpots = [];
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU, r = 30 + R() * 55, x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r;
      if ((Math.abs(x) < 44 && Math.abs(z) < 20) || (Math.abs(x) > 72 && Math.abs(z) > 14 && Math.abs(z) < 84)) continue;
      palmSpots.push([x, z, R() * TAU, 0.9 + R() * 0.45]);
    }
    const fM = new THREE.MeshStandardMaterial({ color: 0x2c4a26, roughness: 0.8, side: THREE.DoubleSide });
    fM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float h = max(position.y - 10.5, 0.0); vec3 ip = instanceMatrix[3].xyz;
          transformed.x += sin(uTime * 0.8 + ip.x * 0.2 + position.z) * 0.08 * h; transformed.y += sin(uTime * 1.3 + ip.z * 0.3 + position.x) * 0.04 * h; }`);
    };
    fM.customProgramCacheKey = () => 'palm';
    const tM = new THREE.MeshStandardMaterial({ color: 0x5a4c3e, roughness: 0.95 });
    for (const [geo, m] of [[merge(palmT), tM], [merge(palmF), fM]]) {
      const im = new THREE.InstancedMesh(geo, m, palmSpots.length);
      palmSpots.forEach(([x, z, ry, sc], i) => { _o.position.set(x, y0, z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(sc); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
      im.computeBoundingSphere(); root.add(im);
    }
  }
  // mountains: three layered ridges all the way round, moonlit blue going darker as they come closer;
  // a little floodlit temple on the highest peak, village lights twinkling along the lower slopes
  const lightPts = [];
  {
    const layers = [[340, 78, 0x1a2140, 1], [285, 54, 0x121834, 2], [225, 34, 0x0b0f22, 3]];
    let peak = null;
    for (const [rad, hMax, col, seed] of layers) {
      const r = rng(seed * 97), ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
      const N = 360, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        let h = 0.55 + 0.25 * Math.sin(a * 3 + ph[0]) + 0.13 * Math.sin(a * 7 + ph[1]) + 0.07 * Math.sin(a * 17 + ph[2]) + 0.035 * Math.sin(a * 41 + ph[3]);
        h = Math.max(0.08, h) * hMax;
        const x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad;
        pos.push(x, -20, z, x, h, z);
        if (seed === 2 && (!peak || h > peak.h)) peak = { x, z, h };
        if (seed === 3 && i % 2 === 0) for (let k = 0; k < 3; k++) if (r() < 0.55) { const f = 0.05 + r() * 0.35; lightPts.push([x * (1 - r() * 0.04), h * f, z * (1 - r() * 0.04)]); }
      }
      for (let i = 0; i < N; i++) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = -2;
      root.add(m);
    }
    if (peak) {
      const tiny = chediParts(1.6);
      const t1 = new THREE.Mesh(place(tiny.white, peak.x * 0.985, peak.h - 1.5, peak.z * 0.985), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(1.4), fog: false }));
      const t2 = new THREE.Mesh(place(tiny.gold, peak.x * 0.985, peak.h - 1.5, peak.z * 0.985), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2.2), fog: false }));
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffb060, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      h.position.set(peak.x * 0.985, peak.h + 6, peak.z * 0.985); h.scale.set(40, 40, 1);
      root.add(t1, t2, h);
    }
  }
  {
    const geo = new THREE.BufferGeometry(), pos = [], seed = [], col = [];
    for (const [x, y, z] of lightPts) { pos.push(x, y, z); seed.push(R()); const w = R() < 0.75; col.push(1, w ? 0.72 : 0.92, w ? 0.4 : 0.8); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.55 + 0.45 * sin(uTime * (0.6 + seed * 1.7) + seed * 40.0); gl_PointSize = 2.6; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(vC * a * 1.4, a); }`,
      vertexColors: true });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; p.renderOrder = -1; root.add(p);
  }
  // a few high, thin moonlit clouds drifting very slowly
  {
    const cm = new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0x8a96c8, transparent: true, opacity: 0.09, depthWrite: false, fog: false });
    const clouds = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(cm); const a = R() * TAU, r = 200 + R() * 80;
      s.position.set(Math.cos(a) * r, 70 + R() * 70, Math.sin(a) * r); s.scale.set(140 + R() * 120, 22 + R() * 18, 1);
      s.renderOrder = -3; root.add(s); clouds.push([s, a, r]);
    }
    ticks.push((t) => { for (const [s, a, r] of clouds) { const b = a + t * 0.0025; s.position.x = Math.cos(b) * r; s.position.z = Math.sin(b) * r; } });
  }

  /* ---------------- 8. SUBTLE LIFE (all off the court, faint) ---------------- */
  // falling frangipani: a blossom now and then drifts down from a canopy, settles on the paving, fades
  {
    const fl = (() => {
      const pet = [];
      for (let k = 0; k < 5; k++) { const p = new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2); p.scale(0.04, 0.014, 0.021); p.translate(0.034, 0, 0); p.rotateY((k / 5) * TAU); p.rotateX(0.0); pet.push(p); }
      return merge(pet);
    })();
    const N = 36, im = new THREE.InstancedMesh(fl, new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0x4a4034, roughness: 0.6, side: THREE.DoubleSide }), N);
    const P = [];
    const spawn = (p, first) => {
      const t = tipsWorld[Math.floor(R() * tipsWorld.length)] || V3(19.5, 3, 10.6);
      p.pos = t.clone().add(V3((R() - 0.5) * 0.6, 0.1, (R() - 0.5) * 0.6));
      if (Math.abs(p.pos.z) < F.outZ + 1.2) p.pos.z = Math.sign(p.pos.z || 1) * (F.outZ + 1.2);
      p.v = 0.32 + R() * 0.22; p.ph = R() * TAU; p.spin = (R() - 0.5) * 3; p.rest = 0; p.life = first ? R() * 14 : 0; p.wait = first ? R() * 10 : 3 + R() * 9; p.s = 0.9 + R() * 0.4;
    };
    for (let i = 0; i < N; i++) { const p = {}; spawn(p, true); P.push(p); }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
    root.add(im);
    ticks.push((t, dt) => {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        let sc = p.s;
        if (p.wait > 0) { p.wait -= dt; sc = 0; }
        else if (p.pos.y > y0 + 0.02) {
          p.pos.y -= p.v * dt; p.pos.x += Math.sin(t * 1.3 + p.ph) * 0.25 * dt; p.pos.z += Math.cos(t * 0.9 + p.ph) * 0.2 * dt;
          if (Math.abs(p.pos.z) < F.outZ + 1.0) p.pos.z = Math.sign(p.pos.z) * (F.outZ + 1.0);   // never drift onto the court
        } else { p.rest += dt; if (p.rest > 8) sc = p.s * Math.max(0, 1 - (p.rest - 8) / 2); if (p.rest > 10) spawn(p, false); }
        _o.position.copy(p.pos); _o.rotation.set(Math.sin(t * 2 + p.ph) * (p.rest ? 0 : 0.9), t * p.spin + p.ph, p.rest ? 0 : Math.cos(t * 1.7 + p.ph) * 0.6);
        _o.scale.setScalar(sc); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }
  // incense smoke curling up from the candle rows on both halls' steps and from the stone lanterns
  {
    const src = [];
    for (const s of [-1, 1]) for (const z of [-1.8, -0.6, 0.6, 1.8]) src.push([s * (HX - 4.0), y0 + 0.85, z]);
    for (const [x, z] of T.stoneLanterns) src.push([x, y0 + 2.2, z]);
    const per = 7, n = src.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = src[Math.floor(i / per)]; pos.set(s, i * 3); sd[i] = R(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uMap: { value: softTexture(0, 64) } },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float life = 6.0; float t = mod(uTime + seed * life, life) / life;
          vec3 p = position + vec3(sin(uTime * 0.7 + seed * 20.0 + t * 4.0) * 0.25 * t, t * 2.6, cos(uTime * 0.5 + seed * 13.0 + t * 3.0) * 0.25 * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.15, t) * (1.0 - t) * 0.075; gl_PointSize = (0.25 + t * 0.9) * 700.0 / -mv.z; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.82, 0.8, 0.86) * a, a); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; root.add(pts);
  }
  // moths fluttering round the pole lamps and stone lanterns; fireflies drifting in the galleries and out among the trees
  {
    const homes = [...T.polePos.map(([x, z]) => [x, y0 + T.POLE - 0.2, z, 0.5]), ...T.stoneLanterns.map(([x, z]) => [x, y0 + 1.45, z, 0.35])];
    const per = 3, n = homes.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const h = homes[Math.floor(i / per)]; pos.set(h.slice(0, 3), i * 3); sd[i * 2] = R(); sd[i * 2 + 1] = h[3]; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute vec2 sd; varying float vA;
        void main(){ float s = sd.x, r = sd.y; float a = uTime * (1.6 + s * 1.4) + s * 30.0;
          vec3 p = position + vec3(cos(a) * r, sin(uTime * 2.3 + s * 9.0) * 0.18 + sin(a * 2.7) * 0.08, sin(a * 1.3) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.25 * sin(uTime * 23.0 + s * 50.0); gl_PointSize = 26.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; root.add(pts);
    const ff = [];
    for (let i = 0; i < 50; i++) { const sz = R() < 0.5 ? -1 : 1; ff.push([(R() - 0.5) * 50, y0 + 0.8 + R() * 2.4, sz * (14.6 + R() * 2.8)]); }
    for (let i = 0; i < 70; i++) { const a = R() * TAU, r = 26 + R() * 30; const x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r; if (Math.abs(x) < 44 && Math.abs(z) < 20) continue; ff.push([x, y0 + 0.6 + R() * 3, z]); }
    root.add(makeFireflies(ff, uTime));
  }

  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update };
}

/* ---------------- Ultra look for the courtyard's own surfaces (main.js materials): plaster texture + warm floodlit bases ---------------- */
export function ultraSurfaces(ctx, on) {
  const M = ctx.temple.mats, y0 = ctx.temple.y0;
  if (!M.__ultra) {
    const t = ctx.texLoader.load('assets/temple-ultra/clay_plaster_diff.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
    const UP = { upCol: 0xffcf9a, upY: y0, upCentre: [0, 0, 0] };
    enhance(M.plaster, { tri: t, triScale: 0.3, upK: 0.4, upFall: 2.6, upWrap: 0.25, ...UP });
    enhance(M.stone, { tri: t, triScale: 0.6, triAmt: 0.9, upK: 0.28, upFall: 1.4, ...UP });
    enhance(M.gold, { upK: 0.85, upFall: 5, upWrap: 0.45, ...UP });
    enhance(M.red, { upK: 0.28, upFall: 2.5, ...UP });
    for (const k of ['roofO', 'roofG']) enhance(M[k], { upK: 0.18, upFall: 1.2, upWrap: 0.6, upCol: 0xffcf9a, upY: y0 + 3.8, upCentre: [0, 0, 0] });
    for (const k of ['plaster', 'stone', 'gold', 'red', 'roofO', 'roofG']) { M[k].userData.base = { tA: M[k].userData.U.uTA.value, uK: M[k].userData.U.uUpK.value }; M[k].needsUpdate = true; }
    M.__ultra = true;
  }
  for (const k of ['plaster', 'stone', 'gold', 'red', 'roofO', 'roofG']) {
    const U = M[k].userData.U, b = M[k].userData.base;
    U.uTA.value = on ? b.tA : 0; U.uUpK.value = on ? b.uK : 0;
  }
}
