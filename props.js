// Shared building blocks for the city / water maps: river & sea water, Thai shophouse facades (lit windows at night),
// neon signs, skyline towers with window grids, festoon light strings, floodlight poles and boundary railings.
// Everything is low-poly + canvas-textured (no downloads beyond the pond's water/plank textures).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

/** Glossy animated water (two scrolling ripple layers of the pond's normal map). */
export function makeWater(texLoader, uTime, { w, d, color = 0x2c4a3a, opacity = 0.9, repeat = [12, 8] }) {
  const wn = texLoader.load('assets/pond/water_nor.jpg');
  wn.wrapS = wn.wrapT = THREE.RepeatWrapping; wn.repeat.set(repeat[0], repeat[1]);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: opacity < 1, opacity, envMapIntensity: 1.2, depthWrite: opacity >= 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec3 mapN = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.012, uTime * 0.004 ) ).xyz * 2.0 - 1.0;
       mapN += texture2D( normalMap, vNormalMapUv * 1.43 + vec2( uTime * 0.009, -uTime * 0.006 ) ).xyz * 2.0 - 1.0;
       mapN = normalize( mapN );`);
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** Thai shophouse facade textures: [colour map, glow map]. Ground-floor shutters + a sign band + upper windows. */
const FACADE_COLORS = ['#e9d3a4', '#cfe0d8', '#e6b8a8', '#d8c6e6', '#f0e2c0', '#bcd6e8', '#e8c88e', '#c9d9b0'];
export function facadeTextures(seed, floors = 3, bays = 3) {
  const R = rnd(seed);
  const W = 128 * bays, H = 96 * floors + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const e = document.createElement('canvas'); e.width = W; e.height = H;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  const wall = FACADE_COLORS[Math.floor(R() * FACADE_COLORS.length)];
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${(R() * 0.06).toFixed(3)})`; g.fillRect(R() * W, R() * H, 2 + R() * 30, 2 + R() * 40); }   // weathering
  for (let f = 0; f < floors; f++) {
    const y0 = H - 96 * (f + 1);
    for (let b = 0; b < bays; b++) {
      const x0 = b * 128;
      if (f === 0) {
        g.fillStyle = '#6f7378'; g.fillRect(x0 + 8, y0 + 18, 112, 78);                     // roller shutter / open shopfront
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 14; k++) g.fillRect(x0 + 8, y0 + 20 + k * 5.5, 112, 1.5);
        if (R() < 0.6) { g.fillStyle = '#2a2420'; g.fillRect(x0 + 14, y0 + 30, 100, 66); ge.fillStyle = R() < 0.5 ? '#ffcf7a' : '#fff1d0'; ge.fillRect(x0 + 14, y0 + 30, 100, 66); }
        // sign band
        const sc = ['#c0392b', '#1f5fa8', '#e2a400', '#1f7a4a', '#7a2a8a'][Math.floor(R() * 5)];
        g.fillStyle = sc; g.fillRect(x0 + 4, y0 + 2, 120, 16);
        g.fillStyle = '#fff'; for (let k = 0; k < 6; k++) g.fillRect(x0 + 14 + k * 17, y0 + 6, 10, 8);
        ge.fillStyle = sc; ge.fillRect(x0 + 4, y0 + 2, 120, 16);
      } else {
        g.fillStyle = '#3a3430'; g.fillRect(x0 + 34, y0 + 20, 60, 58);                     // window
        const lit = R() < 0.55;
        g.fillStyle = lit ? '#5a5040' : '#2a3038'; g.fillRect(x0 + 38, y0 + 24, 52, 50);
        if (lit) { ge.fillStyle = ['#ffd27a', '#ffe6b0', '#bfe0ff'][Math.floor(R() * 3)]; ge.fillRect(x0 + 38, y0 + 24, 52, 50); }
        g.fillStyle = '#2f5f4a'; g.fillRect(x0 + 22, y0 + 20, 12, 58); g.fillRect(x0 + 94, y0 + 20, 12, 58);   // shutters
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 30, y0 + 80, 68, 5);                                     // sill shadow
        if (R() < 0.4) { g.fillStyle = '#5a7a3a'; g.fillRect(x0 + 36, y0 + 74, 56, 8); }                         // plant box
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y0, W, 3);
  }
  g.fillStyle = '#7a6a5a'; g.fillRect(0, 0, W, 40);                                                            // parapet
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return [mk(c, true), mk(e, true)];
}

/** Bake a colour into a geometry (vertex colours) so lots of small differently-coloured props merge into ONE draw call. */
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...opts });

/** A row of shophouses along x from x0..x1 at z, facing ±z (`face` = +1 faces +z). Merged: ~8 draw calls per row. Returns { group, mats } */
export function shophouseRow({ x0, x1, z, y = 0, face = 1, depth = 7, seed = 1, minF = 2, maxF = 4, bayW = 4.2 }) {
  const R = rnd(seed);
  const g = new THREE.Group();
  const variants = [];
  for (let i = 0; i < 6; i++) {
    const floors = minF + Math.floor(R() * (maxF - minF + 1)), bays = 2 + Math.floor(R() * 2);
    const [map, glow] = facadeTextures(seed * 31 + i, floors, bays);
    variants.push({ floors, bays, mat: new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }), geos: [] });
  }
  const bodies = [], awnings = [];
  const awnCols = [0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400, 0x8a2a6a];
  let x = x0;
  while (x < x1) {
    const v = variants[Math.floor(R() * variants.length)];
    const wdt = v.bays * bayW, hgt = v.floors * 3.2 + 1.2;
    const cx = x + wdt / 2, cz = z - face * depth / 2;
    const body = new THREE.BoxGeometry(wdt, hgt, depth); body.translate(cx, y + hgt / 2, cz);
    bodies.push(paint(body, [0xb8a690, 0xc4b49c, 0xa89880][Math.floor(R() * 3)]));
    const front = new THREE.PlaneGeometry(wdt, hgt);
    if (face < 0) front.rotateY(Math.PI);
    front.translate(cx, y + hgt / 2, z + face * 0.01);
    v.geos.push(front);
    const aw = new THREE.BoxGeometry(wdt - 0.4, 0.08, 1.4); aw.rotateX(-face * 0.25); aw.translate(cx, y + 2.9, z + face * 0.65);
    awnings.push(paint(aw, awnCols[Math.floor(R() * awnCols.length)]));
    x += wdt + 0.15;
  }
  const mats = [];
  for (const v of variants) if (v.geos.length) { g.add(new THREE.Mesh(mergeGeometries(v.geos), v.mat)); mats.push(v.mat); }
  g.add(new THREE.Mesh(mergeGeometries(bodies), vcMat({ roughness: 0.9 })));
  g.add(new THREE.Mesh(mergeGeometries(awnings), vcMat()));
  return { group: g, mats };
}

/** Neon sign: a glowing canvas word on a dark backing. Returns { mesh, mat } */
export function neonSign(text, color = '#ff3fa0', w = 3, h = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = '#120c14'; g.fillRect(0, 0, c.width, c.height);
  g.font = `800 ${Math.round(c.height * 0.62)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, c.width / 2, c.height / 2 + 4);
  g.globalAlpha = 1; g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.5 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return { mesh, mat };
}

/** Skyline: many towers merged into a few draw calls. Window grids are a shared texture; lit windows are an emissive map. */
export function skyline({ count = 160, rMin = 60, rMax = 190, hMin = 18, hMax = 110, seed = 5, base = -60, avoid = () => false }) {
  const R = rnd(seed);
  const mk = (lit) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = lit ? '#000' : '#3d4a5a'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      if (lit) { if (R() < 0.45) { g.fillStyle = ['#ffd890', '#fff0c8', '#bfe0ff', '#ffc070'][Math.floor(R() * 4)]; g.fillRect(x * 16 + 3, y * 8 + 2, 10, 5); } }
      else { g.fillStyle = R() < 0.5 ? '#8fb2cc' : '#6f8aa2'; g.fillRect(x * 16 + 3, y * 8 + 2, 10, 5); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return t;
  };
  const map = mk(false), glow = mk(true);
  const geos = [], tops = [];
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, r = rMin + Math.pow(R(), 0.8) * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid(x, z)) continue;
    const w = 10 + R() * 16, d = 10 + R() * 16, h = hMin + Math.pow(R(), 2.2) * (hMax - hMin);
    const b = new THREE.BoxGeometry(w, h - base, d);
    const uv = b.attributes.uv, nrm = b.attributes.normal;
    for (let k = 0; k < uv.count; k++) {
      const horiz = Math.abs(nrm.getX(k)) > 0.5 ? d : w;
      uv.setXY(k, uv.getX(k) * horiz / 8, uv.getY(k) * (h - base) / 6.5);
    }
    b.translate(x, (h + base) / 2, z);
    b.rotateY(0);
    geos.push(b.toNonIndexed());
    if (h > hMax * 0.55) tops.push([x, h, z]);
  }
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, metalness: 0.4 });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  return { mesh, mat, tops };
}

/** Paper-lantern festoons between pairs of points; returns an InstancedMesh (bulbs) + the wires. */
export function festoons(pairs, { sag = 1.1, n = 30, colors = [0xff5a2e, 0xffae42, 0xffd27a], bright = 3.4, size = 0.17 } = {}) {
  const g = new THREE.Group();
  const wireMat = new THREE.LineBasicMaterial({ color: 0x140c0a });
  const pts = [];
  for (const [a, b] of pairs) {
    const line = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      line.push(p);
      if (i > 0 && i < n) pts.push(p);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
  }
  const lg = new THREE.SphereGeometry(size, 10, 8); lg.scale(1, 1.25, 1);
  const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(bright) }), pts.length);
  const o = new THREE.Object3D(), cc = colors.map((c) => new THREE.Color(c));
  pts.forEach((p, i) => { o.position.set(p.x, p.y - size * 1.4, p.z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, cc[i % cc.length]); });
  im.computeBoundingSphere();
  g.add(im);
  return g;
}

/** Four floodlight poles at the court corners (each with a spot light, registered for quality + time of day). */
export function floodPoles(ctx, g, { x, z, base = 0, h = 6.6, poleMat, headMat, glowMat, put }) {
  const { spotLights, quality } = ctx;
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * x, pz = sz * z;
    put(poleMat, new THREE.CylinderGeometry(0.11, 0.15, h, 8), px, base + h / 2, pz);
    put(glowMat, new THREE.BoxGeometry(0.34, 0.42, 0.34), px, base + h - 0.25, pz);
    put(headMat, new THREE.ConeGeometry(0.28, 0.5, 6), px, base + h + 0.2, pz);
    const spot = new THREE.SpotLight(0xffd2a0, 12, 44, 0.58, 0.7, 1.2);
    spot.position.set(px, base + h - 0.3, pz);
    spot.target.position.set(sx * 3, 0, sz * 1);
    spot.visible = quality().spots;
    spotLights.push(spot);
    g.add(spot, spot.target);
    out.push([px, pz]);
  }
  return out;
}

/** A simple rail on the ball boundary: posts + top rail (+ optional mid rail / panel). Uses `put(mat, geo, x,y,z, ry)`. */
export function boundaryRail(F, put, { postMat, railMat, panelMat = null, H = 0.8, step = 1.6, postW = 0.1 }) {
  const bx = F.outX + 0.05, bz = F.outZ + 0.05;
  for (const [len, x, z, ry] of [[F.outX * 2 + 0.1, 0, -bz, 0], [F.outX * 2 + 0.1, 0, bz, Math.PI], [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, -Math.PI / 2]]) {
    put(railMat, new THREE.BoxGeometry(len + 0.1, 0.07, 0.12), x, H - 0.035, z, ry);
    put(railMat, new THREE.BoxGeometry(len, 0.05, 0.06), x, H * 0.5, z, ry);
    if (panelMat) put(panelMat, new THREE.BoxGeometry(len, H * 0.42, 0.03), x, H * 0.22, z, ry);
    const n = Math.round(len / step);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      put(postMat, new THREE.BoxGeometry(postW, H, postW), x + Math.cos(ry) * t, H / 2, z - Math.sin(ry) * t, ry);
    }
  }
}

/** Bamboo fence on the ball boundary: woven kick panel, two bamboo rails, posts with nodes (same look as the terrace). */
export function bambooFence(F, put, { light = 0xc8a85e, dark = 0x8f7438 } = {}) {
  const BH = 0.8;
  const wovenTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      x.fillStyle = (i + j) % 2 ? '#b8954e' : '#9a7a3c'; x.fillRect(i * 8, j * 8, 8, 8);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i * 8, j * 8 + ((i + j) % 2 ? 0 : 6), 8, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const woven = new THREE.MeshStandardMaterial({ map: wovenTex, roughness: 0.85 });
  const rail = new THREE.MeshStandardMaterial({ color: light, roughness: 0.6 });
  const post = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7 });
  const bx = F.outX + 0.06, bz = F.outZ + 0.06;
  for (const [len, x, z, ry] of [[F.outX * 2 + 0.12, 0, -bz, 0], [F.outX * 2 + 0.12, 0, bz, Math.PI], [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, -Math.PI / 2]]) {
    const pg = new THREE.BoxGeometry(len, 0.44, 0.05);
    const u = pg.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * len * 1.6, u.getY(i) * 0.44 * 1.6);
    put(woven, pg, x, 0.22, z, ry);
    for (const y of [0.5, BH - 0.04]) put(rail, new THREE.CylinderGeometry(0.045, 0.045, len, 7), x, y, z, ry, 0, Math.PI / 2);
    const n = Math.round(len / 1.5);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len, px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
      put(post, new THREE.CylinderGeometry(0.06, 0.065, BH + 0.12, 7), px, (BH + 0.12) / 2, pz);
      put(post, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 7), px, BH * 0.55, pz);
    }
  }
}

/** Instanced, swaying low-poly palm trees at `spots` ([[x,y,z,scale,rotY,lean],…]). */
export function palms(spots, uTime, { trunk = 0x7a6248, frond = 0x3f7a3a } = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tr = [], fr = [];
  let p = V(0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const q = V(Math.sin(i * 0.28) * 0.9, (i + 1) * 1.2, 0), d = q.clone().sub(p);
    const c = new THREE.CylinderGeometry(0.19 - i * 0.012, 0.2 - i * 0.012, d.length(), 6);
    c.translate(0, d.length() / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); c.translate(p.x, p.y, p.z);
    tr.push(c.toNonIndexed()); p = q;
  }
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(0.6, 3.0, 1, 6);
    const pa = f.attributes.position;
    for (let k = 0; k < pa.count; k++) { const y = pa.getY(k) + 1.5; pa.setXYZ(k, pa.getX(k) * (1 - y / 3.4), -0.13 * y * y + 0.1 * y, y); }
    f.computeVertexNormals(); f.rotateY((i / 9) * Math.PI * 2); f.translate(p.x, p.y, p.z);
    fr.push(f.toNonIndexed());
  }
  for (const a of [...tr, ...fr]) a.deleteAttribute('uv');
  const sway = (m, k) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
         transformed.x += sin(uTime * 0.9 + ph) * ${k} * position.y * position.y;
         transformed.z += cos(uTime * 0.7 + ph) * ${k} * 0.6 * position.y * position.y;`);
    };
    return m;
  };
  const g = new THREE.Group();
  const o = new THREE.Object3D();
  for (const [geo, mat] of [[mergeGeometries(tr), sway(new THREE.MeshStandardMaterial({ color: trunk, roughness: 0.9, flatShading: true }), '0.0016')],
    [mergeGeometries(fr), sway(new THREE.MeshStandardMaterial({ color: frond, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), '0.0016')]]) {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, y, z, s, r, lean = 0], i) => { o.position.set(x, y, z); o.rotation.set(0, r, lean); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Leafy low-poly tree clumps (instanced): trunk + 4 icosahedron blobs. */
export function treeClumps(spots, { leaf = 0x2f4a2a, bark = 0x5a4a3c, scaleY = 1 } = {}) {
  const blobs = [];
  for (const [x, y, z, r] of [[0, 2.6, 0, 1.3], [0.9, 2.2, 0.4, 0.95], [-0.8, 2.3, -0.3, 1.0], [0.1, 3.4, -0.2, 0.85]]) { const b = new THREE.IcosahedronGeometry(r, 0); b.translate(x, y * scaleY, z); blobs.push(b); }
  const geo = mergeGeometries(blobs);
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 2 * scaleY, 6); trunk.translate(0, scaleY, 0);
  const g = new THREE.Group(), o = new THREE.Object3D(), c = new THREE.Color();
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);
  const it = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: bark, roughness: 0.9 }), spots.length);
  spots.forEach(([x, y, z, s, r], i) => {
    o.position.set(x, y, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix();
    im.setMatrixAt(i, o.matrix); it.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.set(leaf).offsetHSL((Math.sin(i * 12.9898) * 0.5) * 0.04, 0, (Math.sin(i * 78.233) * 0.5) * 0.12));
  });
  im.computeBoundingSphere(); it.computeBoundingSphere();
  g.add(im, it);
  return g;
}
