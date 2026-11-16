// THE HILL TRIBE TERRACE — the 2v2 venue. Built only the first time a 2v2 match starts and shown only in 2v2.
// The court sits on a flat terrace on a mountain saddle at sunset. Toward the sunset (+z) and off both ends, rice terraces
// step down into a misty valley with ridge after ridge of mountains beyond and a golden chedi on a hilltop; behind (−z) a
// stilt-house village climbs the slope. Wild yellow sunflowers, pink mountain cherry trees, banana + bamboo, haystacks and a
// couple of water buffalo. Same visual language as the other venues: low-poly + flat-shaded, merged geometry, warm glowing
// lamps, red paper-lantern festoons on the floodlight poles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFlyers, makeFireflies, makeEmbers, personGeometry } from './life.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// ---- terrain: a flat platform around the court, terraces stepping DOWN toward the sunset + both ends, UP behind (village) ----
let PX = 13.6, PZ = 10.2;                   // flat platform half-extents (set from the court size at build time)
const PLAT_Y = -0.12;                       // = the court deck's base (F.deckDrop)
const STEP_W = 3.1, RISER = 0.7;
function rectDist(x, z) { const dx = Math.max(0, Math.abs(x) - PX), dz = Math.max(0, Math.abs(z) - PZ); return Math.hypot(dx, dz); }
function wob(x, z) { return 1.5 * Math.sin(x * 0.07 + z * 0.05) + 0.9 * Math.sin(x * 0.13 - z * 0.11 + 1.3) + 0.5 * Math.sin(z * 0.21 + 2.1); }
function stepsAt(x, z) {
  let d = rectDist(x, z);
  if (d <= 0) return { d: 0, s: 0 };
  d = Math.max(0.001, d + wob(x, z) * Math.min(1, d / 5));
  const i = Math.floor(d / STEP_W), f = d - i * STEP_W;
  return { d, s: i + smooth((f - (STEP_W - RISER)) / RISER) };
}
const riseAt = (x, z) => smooth((-z / (Math.hypot(x, z) + 1) - 0.25) / 0.45);   // 1 = behind the court (−z, uphill)
function heightAt(x, z) {
  const { d, s } = stepsAt(x, z);
  const down = Math.max(-28, -1.15 * s * (1 + Math.max(0, d - 30) * 0.015));   // terraces down to a valley floor
  const up = Math.min(14, 0.95 * s);                                            // the village slope tops out on a ridge
  const r = riseAt(x, z);
  return PLAT_Y + down * (1 - r) + up * r;
}

export function buildTerrace(ctx) {
  const { F, xf, makeBatch, slope, poly, glowTexture, spotLights, quality } = ctx;
  PX = F.outX + 2.9; PZ = F.outZ + 3.7;
  const g = new THREE.Group();
  g.name = 'hill-terrace';
  const fx = new THREE.Group();
  g.add(fx);
  const R = rng(4242);
  const uTime = { value: 0 };
  const MAT = {
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 }),
    darkwood: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.9 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0xc8a85e, roughness: 0.6 }),
    bambooDark: new THREE.MeshStandardMaterial({ color: 0x8f7438, roughness: 0.7 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.9 }),
    thatch: new THREE.MeshStandardMaterial({ color: 0x8c6a3c, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x5a3a10 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8a48b, roughness: 0.92, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    straw: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 1, flatShading: true }),
  };
  const decor = makeBatch();
  const solid = makeBatch();
  const o = new THREE.Object3D(), col = new THREE.Color();

  /* ---------------- terrain (one flat-shaded heightfield, coloured per face) ---------------- */
  {
    const W = 300, D = 230, nx = 200, nz = 150;
    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    const ng = geo.toNonIndexed();
    const pos = ng.attributes.position, colors = new Float32Array(pos.count * 3);
    const paddy = [0x86a63c, 0x7a9a34, 0x94b043, 0x6f9230, 0xb6a24a];
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const { d, s } = stepsAt(cx, cz), i = Math.floor(s), frac = s - i, up = riseAt(cx, cz);
      if (d <= 0.01) col.set(rectDist(cx, cz) <= 0 && Math.abs(cx) < F.outX + 0.6 && Math.abs(cz) < F.outZ + 0.6 ? 0x7a5c40 : 0x6c7d38);   // packed earth / grass
      else if (frac > 0.05 && frac < 0.95) col.set(up > 0.5 ? 0x5d6a2c : (i % 2 ? 0x6b4e30 : 0x5a6a2c));                 // terrace walls
      else if (d > 70) col.set(0x2f4a2a);                                                                                      // forested valley
      else if (up > 0.5) col.set(i % 3 === 1 ? 0x7d6a3a : 0x6f8234);                                                            // village gardens
      else if (i % 4 === 2 && d < 55) col.set(0xb79aa8);                                                                         // flooded paddy mirroring the sky
      else col.set(paddy[(i * 7 + Math.floor((Math.atan2(cz, cx) + 4) * 2)) % paddy.length]);
      col.offsetHSL(0, 0, (R() - 0.5) * 0.03);
      for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (t + k) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ng.deleteAttribute('uv');
    ng.computeVertexNormals();
    const terrain = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    terrain.receiveShadow = true;
    g.add(terrain);
    geo.dispose();
  }

  /* ---------------- mountains: layered ridges all the way round (fog turns the far ones to haze) ---------------- */
  const ranges = [];
  let hillMatRef = null;
  {
    const range = (rx, rz, h0, h1, color, seed) => {
      const r = rng(seed), n = 220, pos = [];
      const peak = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const hh = h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(t * 3 + seed) * Math.sin(t * 7 + seed * 0.3)) + r() * (h1 - h0) * 0.35;
        peak.push([Math.cos(t) * rx, hh, Math.sin(t) * rz]);
      }
      for (let i = 0; i < n; i++) {
        const [ax, ay, az] = peak[i], [bx, by, bz] = peak[i + 1];
        const base = -40;
        pos.push(ax, base, az, bx, base, bz, ax, ay, az, ax, ay, az, bx, base, bz, bx, by, bz);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mm = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, side: THREE.DoubleSide });
      ranges.push(mm);
      g.add(new THREE.Mesh(geo, mm));
    };
    range(118, 105, 6, 20, 0x3e3a4e, 11);       // kept low so there's plenty of sky (stars at night) over them
    range(158, 140, 14, 32, 0x5a4766, 23);
    range(205, 185, 24, 46, 0x7a5a7c, 37);

    // a nearer hill off each end with a golden chedi on top, catching the last light
    const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(V2([[0, 0], [3.0, 0], [3.0, 0.7], [2.6, 0.7], [2.6, 1.4], [2.25, 1.4], [2.25, 2.0],
      [2.35, 2.3], [2.45, 3.0], [2.35, 3.9], [2.0, 4.7], [1.45, 5.35], [0.9, 5.75], [0.85, 6.1], [1.0, 6.1], [1.0, 6.6], [0.6, 6.6]]), 20);
    const spire = new THREE.LatheGeometry(V2([[0.6, 6.6], [0.62, 6.8], [0.5, 6.8], [0.52, 7.0], [0.42, 7.4], [0.44, 7.6],
      [0.34, 8.0], [0.36, 8.2], [0.26, 8.7], [0.28, 8.9], [0.17, 9.6], [0.12, 10.6], [0.06, 11.6], [0.02, 12.3], [0, 12.5]]), 12);
    const goldGlow = new THREE.MeshStandardMaterial({ color: 0xe8b65a, metalness: 0.6, roughness: 0.35, emissive: 0x8a5a18 });
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x32452c, roughness: 1, flatShading: true });
    hillMatRef = hillMat;
    for (const [sx, hz] of [[1, 46], [-1, -44]]) {           // off to the side so it never sits right behind the far baseline
      const hx = sx * 104;
      // a rolling, flat-shaded hill (not a cone): squashed half-sphere with a bit of noise
      const hill = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const hp = hill.attributes.position;
      for (let i = 0; i < hp.count; i++) { const k = 1 + (R() - 0.5) * 0.12; hp.setXYZ(i, hp.getX(i) * k, hp.getY(i), hp.getZ(i) * k); }
      hill.scale(24, 24, 20);
      hill.computeVertexNormals();
      const hm = new THREE.Mesh(hill, hillMat); hm.position.set(hx, -16, hz); g.add(hm);
      const top = 7.6;
      const c1 = new THREE.Mesh(body, goldGlow); c1.position.set(hx, top, hz); c1.scale.setScalar(1.15); g.add(c1);
      const c2 = new THREE.Mesh(spire, goldGlow); c2.position.copy(c1.position); c2.scale.setScalar(1.15); g.add(c2);
    }
  }

  /* ---------------- bamboo fence on the ball boundary (same place + height as the courtyard balustrade) ---------------- */
  {
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
    const bx = F.outX + 0.06, bz = F.outZ + 0.06;
    for (const [len, x, z, ry] of [[F.outX * 2 + 0.12, 0, -bz, 0], [F.outX * 2 + 0.12, 0, bz, Math.PI], [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, -Math.PI / 2]]) {
      const pg = new THREE.BoxGeometry(len, 0.44, 0.05);
      const u = pg.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * len * 1.6, u.getY(i) * 0.44 * 1.6);
      solid.put(woven, xf(pg, x, 0.22, z, ry));
      for (const y of [0.5, BH - 0.04]) solid.put(MAT.bamboo, xf(new THREE.CylinderGeometry(0.045, 0.045, len, 7), x, y, z, ry, 0, Math.PI / 2));
      const n = Math.round(len / 1.5);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i / n) * len, px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
        solid.put(MAT.bambooDark, xf(new THREE.CylinderGeometry(0.06, 0.065, BH + 0.12, 7), px, (BH + 0.12) / 2, pz));
        solid.put(MAT.bambooDark, xf(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 7), px, BH * 0.55, pz));   // node
      }
    }
  }

  /* ---------------- floodlight poles (bamboo-lashed timber) + paper-lantern festoons ---------------- */
  const POLE = 6.6, poles = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (F.outX + 1.7), pz = sz * (F.outZ + 2.9);
    poles.push([px, pz]);
    decor.put(MAT.stone, xf(new THREE.BoxGeometry(0.7, 0.4, 0.7), px, PLAT_Y + 0.2, pz));
    decor.put(MAT.wood, xf(new THREE.CylinderGeometry(0.12, 0.16, POLE, 8), px, PLAT_Y + POLE / 2, pz));
    for (const y of [1.2, 2.6, 4.0, 5.4]) decor.put(MAT.bamboo, xf(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8), px, PLAT_Y + y, pz));
    decor.put(MAT.glow, xf(new THREE.BoxGeometry(0.3, 0.42, 0.3), px, PLAT_Y + POLE - 0.25, pz));
    decor.put(MAT.thatch, xf(new THREE.ConeGeometry(0.42, 0.55, 6), px, PLAT_Y + POLE + 0.2, pz));
    const spot = new THREE.SpotLight(0xffd2a0, 12, 40, 0.55, 0.7, 1.2);
    spot.position.set(px, PLAT_Y + POLE - 0.3, pz);
    spot.target.position.set(sx * 3, 0, sz * 1);
    spot.visible = quality().spots;
    spotLights.push(spot);
    g.add(spot, spot.target);
  }
  {
    const wireMat = new THREE.LineBasicMaterial({ color: 0x140c0a });
    const pts = [];
    for (const sz of [-1, 1]) {
      const a = new THREE.Vector3(-(F.outX + 1.7), PLAT_Y + POLE - 0.1, sz * (F.outZ + 2.9)), b = new THREE.Vector3(F.outX + 1.7, PLAT_Y + POLE - 0.1, sz * (F.outZ + 2.9));
      const n = 30, line = [];
      for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * 1.1; line.push(p); if (i > 0 && i < n) pts.push(p); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
    }
    const lg = new THREE.SphereGeometry(0.17, 10, 8); lg.scale(1, 1.25, 1);
    const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3.4) }), pts.length);
    const warm = [new THREE.Color(0xff5a2e), new THREE.Color(0xffae42), new THREE.Color(0xffd27a)];
    pts.forEach((p, i) => { o.position.set(p.x, p.y - 0.24, p.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, warm[i % 3]); });
    im.computeBoundingSphere();
    g.add(im);
  }

  /* ---------------- the village: stilt houses up the slope behind the court ---------------- */
  const houses = [[-17, -17.5, 0.3], [-5, -19.5, -0.1], [7, -18.5, 0.15], [18, -21, -0.25], [-11, -26, 0.1], [2, -28, -0.2], [13, -29.5, 0.3], [-21, -31, 0.05]];
  const chimneys = [];
  {
    const house = [];
    const put = (mat, geo, ...t) => house.push([mat, xf(geo, ...t)]);
    const W = 4.6, Dp = 3.6, ST = 1.4, WH = 1.9;
    for (const x of [-W / 2 + 0.2, 0, W / 2 - 0.2]) for (const z of [-Dp / 2 + 0.2, Dp / 2 - 0.2]) put(MAT.darkwood, new THREE.CylinderGeometry(0.09, 0.11, ST + 0.4, 6), x, (ST - 0.4) / 2, z);
    put(MAT.wood, new THREE.BoxGeometry(W + 1.2, 0.16, Dp + 0.4), 0.6, ST, 0);                         // floor + porch
    put(MAT.wall, new THREE.BoxGeometry(W, WH, Dp), 0, ST + WH / 2, 0);                                 // woven bamboo walls
    put(MAT.glow, new THREE.PlaneGeometry(0.8, 1.3), W / 2 + 0.005, ST + 0.75, -0.5, Math.PI / 2);      // lamp-lit doorway
    put(MAT.glow, new THREE.PlaneGeometry(0.55, 0.45), W / 2 + 0.005, ST + 1.15, 0.9, Math.PI / 2);     // window
    put(MAT.glow, new THREE.PlaneGeometry(0.55, 0.45), 0.8, ST + 1.15, Dp / 2 + 0.005);
    for (let k = 0; k < 4; k++) put(MAT.darkwood, new THREE.BoxGeometry(0.06, 0.06, 0.7), W / 2 + 0.9 + k * 0.28, ST - 0.18 - k * 0.32, -0.5);   // ladder rungs
    // steep thatched roof, deep eaves, and the crossed "kalae" gable horns of northern houses
    const ye = ST + WH - 0.05, yr = ST + WH + 2.3, ov = 0.9;
    for (const s of [-1, 1]) put(MAT.thatch, slope(-W / 2 - ov, W / 2 + ov, s * (Dp / 2 + ov), ye - 0.35, 0, yr, 1.5));
    for (const X of [-W / 2 - ov, W / 2 + ov]) {
      put(MAT.wall, poly([[X * 0.98, ye - 0.3, -Dp / 2 - 0.2], [X * 0.98, ye - 0.3, Dp / 2 + 0.2], [X * 0.98, yr - 0.1, 0]], [[0, 0], [1, 0], [0.5, 1]]));
      for (const s of [-1, 1]) put(MAT.wood, new THREE.BoxGeometry(0.08, 1.1, 0.12), X, yr + 0.35, s * 0.28, 0, s * 0.6);
    }
    for (const [hx, hz, ry] of houses) {
      const y = heightAt(hx, hz);
      const M = new THREE.Matrix4().makeRotationY(-Math.PI / 2 + ry).setPosition(hx, y, hz);   // doorways face the court
      for (const [mat, geo] of house) decor.put(mat, geo.clone().applyMatrix4(M));
      chimneys.push([hx + Math.sin(ry) * 0.5, y + ST + WH + 2.0, hz + 0.8]);
    }
    for (const [, geo] of house) geo.dispose();
    // granary huts + the village's spirit gate (two posts, two beams, little carved birds)
    for (const [gx, gz] of [[-1, -23.5], [11, -24], [-15, -24]]) {
      const y = heightAt(gx, gz);
      for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) decor.put(MAT.darkwood, xf(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 5), gx + dx, y + 0.6, gz + dz));
      decor.put(MAT.wall, xf(new THREE.BoxGeometry(1.8, 1.2, 1.8), gx, y + 1.8, gz));
      decor.put(MAT.thatch, xf(new THREE.ConeGeometry(1.7, 1.6, 4), gx, y + 3.2, gz, Math.PI / 4));
    }
    const gy = heightAt(0, -13.4);
    for (const s of [-1, 1]) decor.put(MAT.darkwood, xf(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 6), s * 1.6, gy + 1.7, -13.4));
    for (const y of [2.9, 3.3]) decor.put(MAT.darkwood, xf(new THREE.BoxGeometry(4.2, 0.14, 0.18), 0, gy + y, -13.4));
    for (let i = -3; i <= 3; i++) decor.put(MAT.wood, xf(new THREE.ConeGeometry(0.07, 0.3, 4), i * 0.55, gy + 3.55, -13.4, 0, 0, Math.PI / 2));
  }

  /* ---------------- life on the terraces: haystacks, water buffalo, a bench by the court ---------------- */
  {
    const stacks = [[22, 13], [27, 19], [-23, 14], [-29, 20], [20, -8], [-21, -6], [33, 6], [-34, 4]];
    for (const [x, z] of stacks) {
      const y = heightAt(x, z);
      decor.put(MAT.straw, xf(new THREE.ConeGeometry(1.0, 1.9, 7), x, y + 0.95, z));
      decor.put(MAT.wood, xf(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 4), x, y + 2.1, z));
    }
    // water buffalo (low-poly): body, head, curved horns, legs
    const buff = [];
    const bput = (geo) => buff.push(geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo);
    const bodyG = new THREE.SphereGeometry(1, 8, 6); bodyG.scale(0.62, 0.55, 1.2); bodyG.translate(0, 1.15, 0); bput(bodyG);
    const headG = new THREE.SphereGeometry(1, 7, 5); headG.scale(0.3, 0.32, 0.45); headG.translate(0, 1.15, 1.35); bput(headG);
    for (const s of [-1, 1]) {
      const horn = new THREE.TorusGeometry(0.42, 0.06, 5, 8, Math.PI * 0.9); horn.rotateY(Math.PI / 2); horn.rotateZ(s * 0.3); horn.translate(s * 0.28, 1.45, 1.2); bput(horn);
      for (const lz of [-0.75, 0.7]) { const l = new THREE.CylinderGeometry(0.1, 0.08, 0.85, 5); l.translate(s * 0.32, 0.43, lz); bput(l); }
    }
    for (const b of buff) if (b.attributes.uv) b.deleteAttribute('uv');
    const buffGeo = mergeGeometries(buff);
    const im = new THREE.InstancedMesh(buffGeo, new THREE.MeshStandardMaterial({ color: 0x3e3a3c, roughness: 0.9, flatShading: true }), 3);
    [[24, 9.5, 2.2], [-26, 11, 0.6], [30, -2, -1.2]].forEach(([x, z, r], i) => { o.position.set(x, heightAt(x, z), z); o.rotation.set(0, r, 0); o.scale.setScalar(1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere();
    g.add(im);
    // bench + water jugs at the side of the court
    for (const sz of [-1]) {
      decor.put(MAT.wood, xf(new THREE.BoxGeometry(3.2, 0.1, 0.5), 0, PLAT_Y + 0.48, sz * (F.outZ + 2.2)));
      for (const x of [-1.4, 1.4]) decor.put(MAT.darkwood, xf(new THREE.BoxGeometry(0.1, 0.48, 0.45), x, PLAT_Y + 0.24, sz * (F.outZ + 2.2)));
      for (const x of [-0.6, 0.1, 0.7]) decor.put(MAT.stone, xf(new THREE.SphereGeometry(0.18, 7, 5), x, PLAT_Y + 0.7, sz * (F.outZ + 2.2)));
    }
  }

  /* ---------------- trees + plants ---------------- */
  {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.9 });
    const place = (geo, mat, spots, sway = 0) => {
      const m = mat;
      if (sway) m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.x += sin(uTime * 1.4 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4) * ${sway.toFixed(3)} * position.y * position.y;`);
      };
      const im = new THREE.InstancedMesh(geo, m, spots.length);
      spots.forEach(([x, z, s, r], i) => { o.position.set(x, heightAt(x, z), z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.computeBoundingSphere();
      g.add(im);
      return im;
    };
    const limbs = (list, a, b, r0, r1) => {
      const d = b.clone().sub(a), c = new THREE.CylinderGeometry(r1, r0, d.length(), 6);
      c.translate(0, d.length() / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
      c.translate(a.x, a.y, a.z);
      list.push(c.toNonIndexed());
    };
    const free = (x, z) => !(Math.abs(z) < 9 && Math.abs(x) > 12) && rectDist(x, z) > 0.5;   // keep both ends' views open
    // pink mountain cherry (nang phaya suea khrong) — the north's winter bloom
    {
      const br = [], bl = [];
      const fork = V(0, 1.6, 0);
      limbs(br, V(0, 0, 0), fork, 0.2, 0.15);
      for (const [x, y, z] of [[1.4, 3.0, 0.3], [-1.2, 3.2, 0.6], [0.2, 3.5, -1.3], [-0.4, 2.8, -0.6]]) {
        const mid = V(x, y, z);
        limbs(br, fork, mid, 0.12, 0.07);
        for (let k = 0; k < 3; k++) {
          const b = new THREE.IcosahedronGeometry(0.85 - k * 0.15, 0); b.scale(1.2, 0.75, 1.2);
          b.translate(x * (1 + k * 0.25), y + 0.4 + k * 0.25, z * (1 + k * 0.25)); bl.push(b);
        }
      }
      const spots = [];
      while (spots.length < 14) {
        const x = (R() * 2 - 1) * 34, z = -6 - R() * 30;
        if (!free(x, z) || houses.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 4)) continue;
        spots.push([x, z, 0.85 + R() * 0.4, R() * 6]);
      }
      for (const [x, z] of [[16, 15], [-17, 16], [10, 22], [-9, 24]]) spots.push([x, z, 1.0, R() * 6]);
      place(mergeGeometries(br), bark, spots);
      place(mergeGeometries(bl), new THREE.MeshStandardMaterial({ color: 0xf28fb6, emissive: 0x4a1830, roughness: 0.7, flatShading: true }), spots);
    }
    // banana plants
    {
      const st = [], lv = [];
      limbs(st, V(0, 0, 0), V(0, 2.0, 0), 0.16, 0.12);
      for (let i = 0; i < 6; i++) {
        const f = new THREE.PlaneGeometry(0.55, 2.0, 1, 4);
        const pa = f.attributes.position;
        for (let k = 0; k < pa.count; k++) { const y = pa.getY(k) + 1.0; pa.setXYZ(k, pa.getX(k) * (1 - Math.abs(y - 1) / 1.6), 0, y); pa.setY(k, -0.18 * y * y + 0.2 * y); }
        f.computeVertexNormals(); f.rotateY((i / 6) * Math.PI * 2 + 0.3); f.translate(0, 2.0, 0);
        lv.push(f);
      }
      const spots = [];
      while (spots.length < 18) {
        const x = (R() * 2 - 1) * 30, z = (R() * 2 - 1) * 26;
        if (!free(x, z) || rectDist(x, z) > 9) continue;
        spots.push([x, z, 0.8 + R() * 0.5, R() * 6]);
      }
      place(mergeGeometries(st), new THREE.MeshStandardMaterial({ color: 0x6b7a35, roughness: 0.8 }), spots);
      place(mergeGeometries(lv), new THREE.MeshStandardMaterial({ color: 0x5f8f2e, roughness: 0.75, side: THREE.DoubleSide, flatShading: true }), spots, 0.02);
    }
    // bamboo clumps
    {
      const st = [], lv = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2, r = 0.25 + (i % 3) * 0.2, h = 5.5 + (i % 4) * 1.1;
        const base = V(Math.cos(a) * r, 0, Math.sin(a) * r), top = V(Math.cos(a) * (r + 0.9), h, Math.sin(a) * (r + 0.9));
        limbs(st, base, top, 0.06, 0.05);
        for (let k = 0; k < 3; k++) { const l = new THREE.IcosahedronGeometry(0.55, 0); l.scale(1.3, 0.5, 1.3); l.translate(top.x * (0.75 + k * 0.1), h * (0.72 + k * 0.12), top.z * (0.75 + k * 0.1)); lv.push(l); }
      }
      const spots = [[-15.5, -12, 1, 0], [15.5, -12.5, 1.1, 1], [-26, -15, 1, 2], [26, -16, 0.9, 3], [-30, -26, 1.1, 1], [30, -27, 1, 2]];
      place(mergeGeometries(st), new THREE.MeshStandardMaterial({ color: 0x8a9a3a, roughness: 0.7 }), spots);
      place(mergeGeometries(lv), new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 0.8, flatShading: true }), spots, 0.004);
    }
    // forest on the far slopes: rounded tree clumps
    {
      const blobs = [];
      for (const [x, y, z, r] of [[0, 2.6, 0, 1.3], [0.9, 2.2, 0.4, 0.95], [-0.8, 2.3, -0.3, 1.0], [0.1, 3.4, -0.2, 0.85]]) { const b = new THREE.IcosahedronGeometry(r, 0); b.translate(x, y, z); blobs.push(b); }
      const geo = mergeGeometries(blobs);
      const spots = [];
      for (let i = 0; i < 260; i++) {
        const a = R() * Math.PI * 2, r = 46 + R() * 50, x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
        if (Math.abs(z) < 16 && Math.abs(x) > 40 && Math.abs(x) < 100) continue;          // keep a clear line to each golden chedi
        spots.push([x, z, 1.4 + R() * 1.6, R() * 6]);
      }
      const im = place(geo, new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.9, flatShading: true }), spots);
      spots.forEach((_, i) => im.setColorAt(i, col.set(0x2f4a2a).offsetHSL((R() - 0.5) * 0.05, 0, (R() - 0.5) * 0.1)));
    }
    // wild Mexican sunflowers (bua tong) blanketing the slopes — the hills' famous November yellow
    {
      const petals = [];
      for (let i = 0; i < 10; i++) { const p = new THREE.SphereGeometry(1, 5, 3); p.scale(0.04, 0.012, 0.1); p.translate(0, 0, 0.09); p.rotateY((i / 10) * Math.PI * 2); petals.push(p.toNonIndexed()); }
      const head = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8); petals.push(head.toNonIndexed());
      for (const pg of petals) pg.deleteAttribute('uv');
      const fgeo = mergeGeometries(petals); fgeo.rotateX(-0.5); fgeo.translate(0, 0.9, 0);
      const stem = new THREE.CylinderGeometry(0.012, 0.015, 0.9, 4); stem.translate(0, 0.45, 0); stem.deleteAttribute('uv');
      const plant = mergeGeometries([stem.toNonIndexed(), fgeo]);
      const spots = [];
      let tries = 0;
      while (spots.length < 700 && tries++ < 8000) {
        const x = (R() * 2 - 1) * 48, z = (R() * 2 - 1) * 40;
        const { s } = stepsAt(x, z), frac = s - Math.floor(s);
        if (!free(x, z) || rectDist(x, z) < 1.5) continue;
        if (!(frac > 0.08 && frac < 0.92) && R() < 0.75) continue;                       // mostly on the terrace banks
        spots.push([x, z, 0.8 + R() * 0.7, R() * 6]);
      }
      place(plant, new THREE.MeshStandardMaterial({ color: 0xf2c12e, emissive: 0x4a3404, roughness: 0.7, flatShading: true }), spots, 0.06);
    }
    // grass tufts around the platform edge
    {
      const bl = [];
      for (let i = 0; i < 7; i++) { const b = new THREE.BufferGeometry(); const a = (i / 7) * Math.PI * 2; b.setAttribute('position', new THREE.Float32BufferAttribute([Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, -Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05, Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25], 3)); b.computeVertexNormals(); bl.push(b); }
      const spots = [];
      while (spots.length < 380) {
        const x = (R() * 2 - 1) * 26, z = (R() * 2 - 1) * 20;
        if (Math.abs(x) < F.outX + 0.6 && Math.abs(z) < F.outZ + 0.6) continue;
        spots.push([x, z, 0.7 + R() * 0.7, R() * 6]);
      }
      place(mergeGeometries(bl), new THREE.MeshStandardMaterial({ color: 0x7a8a3a, roughness: 0.9, side: THREE.DoubleSide }), spots, 0.12);
    }
  }

  /* ---------------- warm light pools under the floodlights / around the village ---------------- */
  {
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const list = [...poles.map(([x, z]) => [x, PLAT_Y + 0.02, z, 2.6]), ...houses.map(([x, z]) => [x + 2.8, heightAt(x + 2.8, z) + 0.05, z, 2.4])];
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffa64d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), list.length);
    list.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.set(s, 1, s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere();
    g.add(im);
  }

  /* ---------------- valley mist, cooking smoke, birds heading home ---------------- */
  const mist = [];
  {
    const mg = new THREE.PlaneGeometry(1, 1); mg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 60 + (i % 3) * 18;
      const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
      if (z < -30) continue;                                       // not over the village slope
      const m = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xe6cfe0, transparent: true, opacity: 0.16 + (i % 3) * 0.05, depthWrite: false }));
      m.scale.set(46 + (i % 4) * 10, 1, 22 + (i % 3) * 6);
      m.position.set(x, heightAt(x, z) + 3 + (i % 3) * 2.5, z);
      m.renderOrder = 4;
      fx.add(m);
      mist.push({ m, x, z, ph: i * 1.3 });
    }
  }
  const smoke = [];
  {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xcfc6c8, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(mat.clone()); s.visible = false;
      fx.add(s);
      smoke.push({ s, t: Math.random(), src: chimneys[i % 3] });
    }
  }
  const flocks = [];
  {
    const bird = new THREE.BufferGeometry();
    bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.7, 0.1, -0.05, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.7, 0.1, -0.05], 3));
    bird.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x1c1420, side: THREE.DoubleSide });
    for (let f = 0; f < 2; f++) {
      const fg = new THREE.Group(), birds = [];
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(bird, bm);
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        b.position.set(side * row * 1.4, row * 0.2, -row * 1.6);
        fg.add(b); birds.push(b);
      }
      fg.scale.setScalar(1.6);
      fx.add(fg);
      flocks.push({ g: fg, birds, t: f * 0.5, dir: f ? -1 : 1, z: f ? 26 : 40, y: f ? 22 : 30 });
    }
  }

  /* ---------------- DAY: farmers in the paddies, butterflies over the sunflowers ---------------- */
  const dayLife = new THREE.Group(), nightLife = new THREE.Group();
  g.add(dayLife); fx.add(nightLife);
  const farmers = [];
  {
    const parts = personGeometry({ hat: true });
    const shirt = [0x2f4f7a, 0x6a2f2f, 0x3f5f3a, 0x5a4a6a];
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6 });
    const hatM = new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.9, flatShading: true });
    const fspots = [[20, 7, 1.2], [26, 14, -2.0], [-22, 9, 2.4], [-27, 17, 0.5], [15, 17.5, 3.0], [-14, 18, -1.0]];
    fspots.forEach(([x, z, r], i) => {
      const f = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(parts.body, new THREE.MeshStandardMaterial({ color: shirt[i % shirt.length], roughness: 0.85, flatShading: true })));
      body.add(new THREE.Mesh(parts.head, skin), new THREE.Mesh(parts.hat, hatM));
      f.add(body);
      f.position.set(x, heightAt(x, z), z); f.rotation.y = r;
      dayLife.add(f);
      farmers.push({ body, ph: R() * 6 });
    });
  }
  const bfHomes = [];
  for (let i = 0; i < 16; i++) {
    const x = (R() * 2 - 1) * 30, z = (R() * 2 - 1) * 26;
    if (rectDist(x, z) < 2) continue;
    bfHomes.push([x, heightAt(x, z) + 0.8 + R() * 0.6, z]);
  }
  const butterflies = makeFlyers(bfHomes, 'butterfly');
  dayLife.add(butterflies.g);
  /* ---------------- NIGHT: fireflies over the terraces, embers from the village fires ---------------- */
  {
    const pts = [];
    for (let i = 0; i < 160; i++) {
      const x = (R() * 2 - 1) * 34, z = (R() * 2 - 1) * 30;
      if (rectDist(x, z) < 1) continue;
      pts.push([x, heightAt(x, z) + 0.5 + R() * 2.2, z]);
    }
    nightLife.add(makeFireflies(pts, uTime));
    nightLife.add(makeEmbers(chimneys.map(([x, y, z]) => [x, y - 0.4, z]), uTime, 10));
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  /* ---------------- per-frame life ---------------- */
  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    if (dayLife.visible) {
      butterflies.update(dt, time);
      for (const f of farmers) f.body.rotation.x = 0.55 + Math.sin(time * 0.9 + f.ph) * 0.18;      // bent over, planting
    }
    if (!fx.visible) return;
    for (const m of mist) { m.m.position.x = m.x + Math.sin(time * 0.03 + m.ph) * 6; m.m.position.z = m.z + Math.cos(time * 0.025 + m.ph) * 3; }
    for (const sm of smoke) {
      if (!sm.src) continue;
      sm.t += dt / 6;
      if (sm.t >= 1) sm.t -= 1;
      const t = sm.t;
      sm.s.visible = true;
      sm.s.position.set(sm.src[0] + Math.sin(t * 4 + sm.src[2]) * 0.4 + t * 1.5, sm.src[1] + t * 6, sm.src[2] + t * 0.8);
      sm.s.scale.setScalar(0.6 + t * 3.2);
      sm.s.material.opacity = 0.28 * Math.sin(Math.PI * t);
    }
    for (const fl of flocks) {
      fl.t += dt / 38;                                   // a slow pass across the sky every ~40 s
      if (fl.t > 1) fl.t -= 1;
      const x = (fl.t * 2 - 1) * 160 * fl.dir;
      fl.g.position.set(x, fl.y + Math.sin(fl.t * 9) * 1.5, fl.z);
      fl.g.rotation.y = fl.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      fl.birds.forEach((b, i) => { b.scale.y = 0.4 + 0.6 * Math.abs(Math.sin(time * 6 + i)); });
    }
  }

  const RANGE_COLORS = { day: [0x7f9c8a, 0xa6bcc4, 0xc6d6e2], night: [0x161a2c, 0x20263e, 0x2a3150] };   // hazier + bluer with distance by day
  function setTime(tod) {
    dayLife.visible = tod === 'day';
    nightLife.visible = tod !== 'day';
    ranges.forEach((m, i) => m.color.set(RANGE_COLORS[tod === 'day' ? 'day' : 'night'][i]));
    if (hillMatRef) hillMatRef.color.set(tod === 'day' ? 0x4f6a3e : 0x1c2a1c);
    for (const fl of flocks) fl.g.visible = tod === 'day';
    for (const m of mist) m.m.material.opacity = (tod === 'day' ? 0.1 : 0.2);
  }
  return { g, fx, update, setTime };
}
