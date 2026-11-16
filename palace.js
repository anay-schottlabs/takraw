// PALACE GARDEN — a formal royal-style garden (inspired by the style, not a replica of any real palace). Marble terraces, long
// reflecting pools with fountains down both sides, clipped topiary + flower parterres, a gilded multi-tiered pavilion with a tall
// spire behind each end flanked by guardian giants, rows of golden chedis, and a white crenellated wall all round.
// DAY: dazzling gilding and white plaster. NIGHT: everything floodlit gold, fountains + pools lit from below, lamp posts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, makeWater, floodPoles, boundaryRail, paint, vcMat } from './props.js';

export function buildPalace(ctx) {
  const { F, xf, makeBatch, texLoader, glowTexture, slope, poly, ornamentTexture } = ctx;
  const g = new THREE.Group(); g.name = 'palace';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(9595);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const roofTex = texLoader.load('assets/temple/roof_diff.jpg'), roofNor = texLoader.load('assets/temple/roof_nor_gl.jpg');
  for (const t of [roofTex, roofNor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  roofTex.colorSpace = THREE.SRGBColorSpace;
  const gilt = new THREE.MeshStandardMaterial({ color: 0xe8b85a, metalness: 0.85, roughness: 0.28, emissive: 0x6a4410, emissiveIntensity: 0.3 });
  const MAT = {
    marble: new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.35 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.85 }),
    gold: gilt,
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    roofO: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0xe8743a, roughness: 0.5, side: THREE.DoubleSide }),
    roofG: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0x3f8a6a, roughness: 0.5, side: THREE.DoubleSide }),
    orn: new THREE.MeshStandardMaterial({ map: ornamentTexture(), roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(1.8) }),
    vc: vcMat({ flatShading: true }),
  };
  const PX = F.outX + 6, PZ = F.outZ + 4;            // marble terrace around the court
  const POOL_Z0 = PZ + 1.2, POOL_Z1 = PZ + 7.5;      // reflecting pools (both sides)
  const HALL_X = F.outX + 26;

  /* ---------------- ground: marble terrace, lawns, walks ---------------- */
  {
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = '#f2ece2'; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(150,130,110,0.35)'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 126); x.strokeRect(1, 1, 63, 63); x.strokeRect(64, 64, 63, 63);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(PX / 1.5, (PZ + 14) / 1.5); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const terrace = new THREE.Mesh(new THREE.PlaneGeometry(PX * 2 + 60, (PZ + 14) * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, color: 0xffffff }));
    terrace.rotation.x = -Math.PI / 2; terrace.position.y = -0.1; terrace.receiveShadow = true; g.add(terrace);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(400, 320), new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.95 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.14; g.add(lawn);
  }
  /* ---------------- reflecting pools + fountains ---------------- */
  const jets = [];
  for (const s of [-1, 1]) {
    const zc = s * (POOL_Z0 + POOL_Z1) / 2, len = (F.outX + 14) * 2, wid = POOL_Z1 - POOL_Z0;
    const w = makeWater(texLoader, uTime, { w: len, d: wid, color: 0x1f4a6a, opacity: 1, repeat: [len / 6, wid / 6] });
    w.position.set(0, -0.04, zc); g.add(w);                                    // above the marble terrace plane (y −0.1)
    for (const [l, d, x, z] of [[len + 0.8, 0.4, 0, s * POOL_Z0], [len + 0.8, 0.4, 0, s * POOL_Z1], [0.4, wid, -len / 2, zc], [0.4, wid, len / 2, zc]]) put(MAT.marble, new THREE.BoxGeometry(l, 0.36, d), x, 0.08, z);
    for (let x = -len / 2 + 5; x < len / 2 - 4; x += 7) {
      put(MAT.gold, new THREE.CylinderGeometry(0.3, 0.45, 0.4, 10), x, 0.05, zc);
      jets.push([x, zc]);
    }
  }
  {
    const jet = new THREE.CylinderGeometry(0.04, 0.14, 1.8, 6, 1, true); jet.translate(0, 0.9, 0);
    const im = new THREE.InstancedMesh(jet, new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.6, depthWrite: false }), jets.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
    g.add(im);
    var jetMesh = im;
    const lights = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9fd8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), jets.length);
    const o = new THREE.Object3D();
    jets.forEach(([x, z], i) => { o.position.set(x, -0.02, z); o.updateMatrix(); lights.setMatrixAt(i, o.matrix); });
    lights.computeBoundingSphere(); lights.renderOrder = 3; fx.add(lights);
  }

  // lily pads drifting in the pools
  {
    const pad = new THREE.CircleGeometry(0.45, 12, 0.3, Math.PI * 2 - 0.6); pad.rotateX(-Math.PI / 2);
    for (const s of [-1, 1]) for (let i = 0; i < 26; i++) {
      const x = (R() - 0.5) * (F.outX + 12) * 2, z = s * (POOL_Z0 + 0.6 + R() * (POOL_Z1 - POOL_Z0 - 1.2));
      if (jets.some(([jx, jz]) => Math.hypot(x - jx, z - jz) < 1.2)) continue;
      put(MAT.vc, paint(pad.clone(), R() < 0.8 ? 0x3f7a32 : 0x5a8a3a), x, -0.02, z, R() * 6);
      if (R() < 0.25) put(MAT.vc, paint(new THREE.ConeGeometry(0.16, 0.24, 6), 0xff8fb8), x + 0.1, 0.1, z, 0, Math.PI);
    }
  }

  /* ---------------- topiary + parterres + lamp posts ---------------- */
  {
    const greens = [0x2f6a2f, 0x3a7a34, 0x2a5a2a];
    for (const s of [-1, 1]) for (let x = -(F.outX + 14); x <= F.outX + 14; x += 4.5) {
      const z = s * (POOL_Z1 + 1.6);
      if ((Math.round(x / 4.5) & 1) === 0) put(MAT.vc, paint(new THREE.ConeGeometry(0.75, 2.6, 8), greens[0]), x, 1.2, z);
      else { put(MAT.vc, paint(new THREE.SphereGeometry(0.75, 8, 6), greens[1]), x, 0.75, z); put(MAT.vc, paint(new THREE.SphereGeometry(0.5, 8, 6), greens[2]), x, 1.75, z); }
      put(MAT.vc, paint(new THREE.CylinderGeometry(0.5, 0.55, 0.4, 8), 0xf2ece2), x, 0.1, z);
    }
    // flower parterres beyond the topiary
    const flowerCols = [0xd83a5a, 0xf2c12e, 0xf2f2f2, 0xff7aa8, 0x8a4ad8];
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 5, 4), vcMat(), 1);
    void fl;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = -24 + i * 16, z = s * (POOL_Z1 + 6);
      put(MAT.vc, paint(new THREE.BoxGeometry(12, 0.3, 4.5), 0x2f6a2f), x, 0.03, z);
      for (let k = 0; k < 40; k++) put(MAT.vc, paint(new THREE.SphereGeometry(0.16, 5, 4), flowerCols[(k + i) % flowerCols.length]), x - 5.5 + (k % 10) * 1.2, 0.26, z - 1.6 + Math.floor(k / 10) * 1.05);
    }
    for (const s of [-1, 1]) for (let x = -(F.outX + 12); x <= F.outX + 12; x += 8) {
      const z = s * (PZ + 0.5);
      put(MAT.gold, new THREE.CylinderGeometry(0.06, 0.09, 2.8, 8), x, 1.3, z);
      put(MAT.glow, new THREE.SphereGeometry(0.22, 10, 8), x, 2.85, z);
      put(MAT.gold, new THREE.ConeGeometry(0.2, 0.3, 8), x, 3.15, z);
    }
  }

  /* ---------------- the gilded pavilions behind each end, with guardian giants ---------------- */
  {
    const hall = [];
    const P = (mat, geo, ...t) => hall.push([mat, xf(geo, ...t)]);
    const W = 16, D = 14;                                   // local: front at x = 0, extends to +x
    P(MAT.marble, new THREE.BoxGeometry(D + 4, 1.4, W + 4), D / 2, 0.6, 0);
    for (let k = 0; k < 4; k++) P(MAT.marble, new THREE.BoxGeometry(1.2, 0.35 * (k + 1), 6), -1.6 - (3 - k) * 0.9 + 0.3, 0.175 * (k + 1) - 0.1, 0);
    P(MAT.plaster, new THREE.BoxGeometry(D - 2, 5.2, W - 3), D / 2, 3.9, 0);
    P(MAT.gold, new THREE.BoxGeometry(D - 1.8, 0.25, W - 2.8), D / 2, 1.4, 0);
    for (const z of [-W / 2 + 1, -3, 3, W / 2 - 1]) { P(MAT.gold, new THREE.CylinderGeometry(0.32, 0.38, 5.4, 10), 0.4, 4.0, z); P(MAT.red, new THREE.BoxGeometry(0.7, 0.4, 0.7), 0.4, 6.8, z); }
    for (const z of [-2.5, 2.5]) P(MAT.glow, new THREE.PlaneGeometry(1.6, 3.2), 0.99, 3.0, z, -Math.PI / 2);
    // three telescoping roof tiers (orange with green borders), ornament gables, gold rakes + chofa
    const tiers = [[-0.4, D + 0.4, W / 2 + 1.3, 6.6, 10.2], [1.4, D - 1.4, W / 2 - 0.6, 9.0, 12.4], [3.4, D - 3.4, W / 2 - 2.4, 11.2, 14.4]];
    for (const [x0, x1, ze, ye, yr] of tiers) for (const s of [-1, 1]) {
      P(MAT.roofO, slope(x0, x1, s * ze, ye, 0, yr));
      P(MAT.roofG, slope(x0, x1, s * (ze - 0.05), ye + 0.03, s * (ze - 0.9), ye + 0.5));
    }
    for (const [x0, , ze, ye, yr] of tiers) {
      P(MAT.orn, poly([[x0 + 0.02, ye, -ze], [x0 + 0.02, ye, ze], [x0 + 0.02, yr, 0]], [[0, 0], [1, 0], [0.5, 1]]));
      const L = Math.hypot(ze, yr - ye), a = Math.atan2(yr - ye, ze);
      for (const s of [-1, 1]) P(MAT.gold, new THREE.BoxGeometry(0.2, 0.3, L + 0.3), x0, (ye + yr) / 2, s * ze / 2, 0, s * a);
      const pts = [[0, 0], [-0.12, 0.45], [-0.05, 0.9], [0.25, 1.2], [0.55, 1.15], [0.6, 0.95]].map(([dx, dy]) => new THREE.Vector3(x0 - dx, yr + dy, 0));
      P(MAT.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.1, 6));
    }
    // the spire: stacked gilded tiers up to a needle
    let y = 14.2;
    for (let k = 0; k < 7; k++) { const r = 2.4 - k * 0.3; P(MAT.gold, new THREE.CylinderGeometry(r * 0.8, r, 1.4, 8), D / 2, y + 0.7, 0); y += 1.4; }
    P(MAT.gold, new THREE.ConeGeometry(0.5, 7, 8), D / 2, y + 3.5, 0);
    for (const sx of [-1, 1]) {
      const M = new THREE.Matrix4().makeRotationY(sx > 0 ? 0 : Math.PI).setPosition(sx * HALL_X, -0.1, 0);
      for (const [mat, geo] of hall) decor.put(mat, geo.clone().applyMatrix4(M));
    }
    for (const [, geo] of hall) geo.dispose();
    // guardian giants (yaksha) flanking each pavilion's stairs: club, crown, fierce colours
    const giant = (x, z, col) => {
      const parts = [];
      const add = (geo, c, px, py, pz) => { geo.translate(px, py, pz); parts.push(paint(geo, c)); };
      add(new THREE.BoxGeometry(1.6, 1.4, 1.6), 0xf2ece2, 0, 0.7, 0);                         // plinth
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.32, 0.38, 2.2, 7), col, s * 0.42, 2.5, 0);
      add(new THREE.CylinderGeometry(0.9, 0.7, 2.8, 8), col, 0, 4.9, 0);
      add(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 8), 0xdba54c, 0, 3.6, 0);
      add(new THREE.SphereGeometry(0.62, 10, 8), col, 0, 6.9, 0);
      add(new THREE.ConeGeometry(0.55, 2.2, 8), 0xdba54c, 0, 8.4, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.2, 0.22, 2.2, 6), col, s * 1.05, 5.1, 0.2);
      const club = new THREE.CylinderGeometry(0.22, 0.12, 4.6, 7); add(club, 0x5a3a24, 0.0, 3.3, 0.9);
      const geo = mergeGeometries(parts); geo.translate(x, -0.1, z);
      decor.put(MAT.vc, geo);
    };
    for (const sx of [-1, 1]) for (const s of [-1, 1]) giant(sx * (HALL_X - 2.5), s * 4.6, s > 0 ? 0x2f8a5a : 0xb83a2a);
  }

  /* ---------------- golden chedis + prang towers along the sides, crenellated wall ---------------- */
  {
    const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const ch = new THREE.LatheGeometry(V2([[0, 0], [2.2, 0], [2.2, 0.6], [1.9, 0.6], [1.9, 1.2], [1.6, 1.4], [1.75, 2.2], [1.65, 3], [1.4, 3.6], [0.9, 4.1], [0.6, 4.4], [0.65, 4.8], [0.4, 5], [0.3, 6.4], [0.12, 7.8], [0, 9]]), 14);
    for (const s of [-1, 1]) for (let x = -40; x <= 40; x += 10) put(MAT.gold, ch, x, 0, s * (POOL_Z1 + 13));
    const prang = new THREE.LatheGeometry(V2([[0, 0], [3.2, 0], [3.2, 1], [2.6, 1.1], [2.5, 3.5], [2, 3.7], [1.9, 6.2], [1.4, 6.5], [1.2, 9], [0.7, 10], [0.5, 12.5], [0.2, 14.5], [0, 16]]), 8);
    for (const [x, z] of [[-58, 30], [58, -30], [-58, -30], [58, 30]]) { put(MAT.plaster, prang, x, 0, z); put(MAT.gold, new THREE.ConeGeometry(0.25, 3, 6), x, 17, z); }
    for (const [len, x, z, ry] of [[200, 0, -62, 0], [200, 0, 62, 0], [124, -98, 0, Math.PI / 2], [124, 98, 0, Math.PI / 2]]) {
      put(MAT.plaster, new THREE.BoxGeometry(len, 5, 1.2), x, 2.4, z, ry);
      const n = Math.floor(len / 2.4);
      for (let i = 0; i < n; i++) { const t = -len / 2 + 1.2 + i * 2.4; put(MAT.plaster, new THREE.BoxGeometry(1.1, 1.0, 1.2), x + Math.cos(ry) * t, 5.4, z - Math.sin(ry) * t, ry); }
    }
  }

  /* ---------------- white + gold balustrade on the boundary, floodlights ---------------- */
  boundaryRail(F, putS, { postMat: MAT.marble, railMat: MAT.gold, panelMat: MAT.plaster, step: 1.6, postW: 0.14 });
  floodPoles(ctx, g, { x: F.outX + 1.4, z: F.outZ + 1.6, base: -0.1, poleMat: MAT.gold, headMat: MAT.gold, glowMat: MAT.glow, put: putS });

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  const o = new THREE.Object3D();
  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    jets.forEach(([x, z], i) => { o.position.set(x, 0.2, z); o.scale.set(1, 0.85 + 0.2 * Math.sin(time * 3 + i), 1); o.updateMatrix(); jetMesh.setMatrixAt(i, o.matrix); });
    jetMesh.instanceMatrix.needsUpdate = true;
  }
  function setTime(tod) { gilt.emissiveIntensity = tod === 'day' ? 0.15 : 0.75; }
  return { g, fx, update, setTime, fog: { day: [80, 420], night: [50, 260] } };
}
