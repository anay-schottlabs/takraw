// NIGHT MARKET ALLEY — the court is squeezed into a market street. Shophouses with neon signs on both sides; stalls with
// umbrellas, produce, grills (smoke + embers) and noodle pots (steam); plastic tables and stools; shoppers; tuk-tuks parked
// at both ends under a neon gateway arch. DAY = the morning market (bright umbrellas, produce, shoppers); NIGHT = neon, bulbs,
// glowing grills and crowds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, shophouseRow, festoons, floodPoles, boundaryRail, neonSign, paint, vcMat } from './props.js';
import { makeEmbers, personGeometry } from './life.js';

export function buildMarket(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'market';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(4141);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0x45464a, roughness: 0.92 }),
    kerb: new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.7, roughness: 0.4 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(2.2) }),
    vc: vcMat(),
    vcFlat: vcMat({ flatShading: true }),
  };
  const SIDE = F.outZ + 7.5;                // building fronts
  const LEN = 95;

  /* ---------------- street, kerbs, buildings ---------------- */
  put(MAT.asphalt, new THREE.BoxGeometry(LEN * 2, 0.2, SIDE * 2 + 2), 0, -0.22, 0);
  for (const s of [-1, 1]) put(MAT.kerb, new THREE.BoxGeometry(LEN * 2, 0.16, 2.6), 0, -0.04, s * (SIDE - 1.3));
  const rowA = shophouseRow({ x0: -LEN, x1: LEN, z: -SIDE, face: 1, seed: 71, minF: 3, maxF: 5, depth: 8 });
  const rowB = shophouseRow({ x0: -LEN, x1: LEN, z: SIDE, face: -1, seed: 83, minF: 3, maxF: 5, depth: 8 });
  g.add(rowA.group, rowB.group);
  const shopMats = [...rowA.mats, ...rowB.mats];
  // a second, taller layer behind for depth
  const backA = shophouseRow({ x0: -LEN, x1: LEN, z: -SIDE - 14, face: 1, seed: 97, minF: 5, maxF: 8, depth: 6 });
  const backB = shophouseRow({ x0: -LEN, x1: LEN, z: SIDE + 14, face: -1, seed: 103, minF: 5, maxF: 8, depth: 6 });
  g.add(backA.group, backB.group);
  shopMats.push(...backA.mats, ...backB.mats);

  /* ---------------- neon signs on the facades ---------------- */
  const neon = [];
  const words = ['NOODLES', 'ส้มตำ', 'MASSAGE', 'KARAOKE', 'BBQ', 'ข้าวมันไก่', 'MANGO', 'โรตี', 'TEA', 'SATAY', '7 DAYS', 'ผัดไทย'];
  const cols = ['#ff3fa0', '#3fe0ff', '#ffd23f', '#7cff6a', '#ff6a3f', '#c77dff'];
  for (let i = 0; i < 18; i++) {
    const s = i % 2 ? 1 : -1, x = -LEN + 8 + i * ((LEN * 2 - 16) / 17) + (R() - 0.5) * 3;
    if (Math.abs(x) < 4) continue;
    const n = neonSign(words[i % words.length], cols[i % cols.length], 2.6 + R() * 1.4, 0.75);
    const vertical = R() < 0.35;
    if (vertical) { n.mesh.scale.set(0.35, 2.4, 1); }
    n.mesh.position.set(x, 4.6 + R() * 4, s * (SIDE - 0.06));
    n.mesh.rotation.y = s > 0 ? Math.PI : 0;
    g.add(n.mesh);
    neon.push(n.mat);
  }

  /* ---------------- stalls: umbrellas / tarps, tables of produce, grills, noodle pots, stools ---------------- */
  const grills = [];
  const umb = [0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400, 0xf2f2f2, 0x8a2a6a];
  const fruit = [0xff8a2a, 0x7fbf3a, 0xe8d24a, 0xd8382e, 0xffffff, 0x8a3a8a, 0xff5a8a];
  const bulbs = [];
  for (const s of [-1, 1]) {
    for (let x = -LEN + 4; x <= LEN - 4; x += 3.4 + R() * 1.2) {
      const z = s * (F.outZ + 3.4 + R() * 1.6);
      if (Math.abs(x) < F.outX + 0.5 && Math.abs(z) < F.outZ + 2.6) continue;
      const kind = R();
      put(MAT.vc, paint(new THREE.BoxGeometry(1.9, 0.8, 0.9), 0xd8d2c4), x, 0.4, z);
      if (kind < 0.45) {                                                          // produce table
        for (let k = 0; k < 7; k++) put(MAT.vc, paint(new THREE.SphereGeometry(0.13, 6, 5), fruit[Math.floor(R() * fruit.length)]), x - 0.75 + k * 0.25, 0.93, z + (R() - 0.5) * 0.4);
      } else if (kind < 0.75) {                                                   // grill
        put(MAT.vc, paint(new THREE.BoxGeometry(1.2, 0.15, 0.5), 0x2a2a2a), x, 0.88, z);
        for (let k = 0; k < 5; k++) put(MAT.vc, paint(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), 0x8a5a2a), x - 0.4 + k * 0.2, 1.0, z, 0, 0, Math.PI / 2);
        grills.push([x, 1.05, z]);
      } else {                                                                    // noodle pots
        put(MAT.vc, paint(new THREE.CylinderGeometry(0.3, 0.28, 0.4, 10), 0xb8bcc0), x - 0.4, 1.0, z);
        put(MAT.vc, paint(new THREE.CylinderGeometry(0.25, 0.23, 0.35, 10), 0xb8bcc0), x + 0.4, 0.98, z);
        grills.push([x, 1.25, z]);
      }
      if (R() < 0.6) {                                                            // umbrella
        put(MAT.vc, paint(new THREE.ConeGeometry(1.6, 0.6, 10), umb[Math.floor(R() * umb.length)]), x, 2.55, z);
        put(MAT.vc, paint(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), 0x6a6a6a), x, 1.3, z);
      } else {                                                                    // tarp on poles
        put(MAT.vc, paint(new THREE.BoxGeometry(2.6, 0.05, 2.0), umb[Math.floor(R() * umb.length)]), x, 2.5, z, 0, s * 0.12);
        for (const dx of [-1.2, 1.2]) put(MAT.vc, paint(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 5), 0x6a6a6a), x + dx, 1.25, z - s * 0.8);
      }
      bulbs.push([x, 2.15, z]);
      // stools + a table in front (toward the street)
      if (R() < 0.5) {
        const tz = z - s * 1.4;
        put(MAT.vc, paint(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10), [0x1f6fd8, 0xd83a2a, 0xe8c02a][Math.floor(R() * 3)]), x + 0.5, 0.7, tz);
        put(MAT.vc, paint(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), 0x6a6a6a), x + 0.5, 0.35, tz);
        for (const [dx, dz] of [[-0.1, 0.55], [1.1, 0.0], [0.5, -0.55]]) put(MAT.vc, paint(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 8), [0xd83a2a, 0x1f6fd8, 0x2fa04a][Math.floor(R() * 3)]), x + dx, 0.21, tz + dz);
      }
    }
  }
  // hanging bulbs over the stalls (glow → bloom at night)
  {
    const bg = new THREE.SphereGeometry(0.09, 6, 5);
    const im = new THREE.InstancedMesh(bg, MAT.glow, bulbs.length);
    const o = new THREE.Object3D();
    bulbs.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere();
    g.add(im);
  }
  // shoppers along the stalls (one merged mesh)
  {
    const pg = personGeometry({ hat: false });
    const parts = [];
    const shirts = [0x3a6ad8, 0xd84a3a, 0xf2f2f2, 0x2f9a5a, 0xe8b82a, 0x7a4ab8, 0x2a2a2a];
    for (let i = 0; i < 70; i++) {
      const s = i % 2 ? 1 : -1, x = (R() * 2 - 1) * (LEN - 6), z = s * (F.outZ + 1.4 + R() * 1.3);
      if (Math.abs(x) < F.outX + 1.2) continue;
      const sc = 0.88 + R() * 0.2, ry = R() * Math.PI * 2;
      for (const [geo, col] of [[pg.body, shirts[Math.floor(R() * shirts.length)]], [pg.head, [0x8a5a3a, 0xc99a72, 0x6b4a30][Math.floor(R() * 3)]]]) {
        const gg = geo.clone(); gg.scale(sc, sc, sc); gg.rotateY(ry); gg.translate(x, -0.12, z); parts.push(paint(gg, col));
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), MAT.vcFlat));
  }

  /* ---------------- both ends: a neon gateway arch over the street + parked tuk-tuks ---------------- */
  const tuk = (x, z, ry, col) => {
    const P = [];
    const add = (geo, c, px, py, pz) => { geo.translate(px, py, pz); P.push(paint(geo, c)); };
    add(new THREE.BoxGeometry(1.4, 0.7, 1.2), col, 0, 0.75, 0);
    add(new THREE.BoxGeometry(1.0, 0.6, 1.0), col, 1.1, 0.7, 0);
    add(new THREE.BoxGeometry(2.6, 0.08, 1.35), 0x1a1a1a, 0.4, 1.95, 0);
    for (const [px, pz] of [[-0.5, 0.6], [-0.5, -0.6], [1.5, 0.55], [1.5, -0.55], [1.5, 0]]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), 0x1a1a1a, px, 1.5, pz);
    for (const [px, pz] of [[-0.4, 0.62], [-0.4, -0.62], [1.4, 0]]) { const w = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 10); w.rotateX(Math.PI / 2); add(w, 0x151515, px, 0.28, pz); }
    const geo = mergeGeometries(P);
    geo.rotateY(ry); geo.translate(x, -0.12, z);
    decor.put(MAT.vc, geo);
  };
  for (const sx of [-1, 1]) {
    const ax = sx * (F.outX + 26);
    for (const s of [-1, 1]) {
      put(MAT.vc, paint(new THREE.BoxGeometry(0.6, 8, 0.6), 0x8a1e17), ax, 4, s * (SIDE - 1.6));
      put(MAT.vc, paint(new THREE.BoxGeometry(0.8, 0.3, 0.8), 0xdba54c), ax, 8.1, s * (SIDE - 1.6));
    }
    put(MAT.vc, paint(new THREE.BoxGeometry(0.5, 1.6, SIDE * 2 - 2.6), 0x2a1a24), ax, 8.6, 0);
    const sign = neonSign(sx > 0 ? 'ตลาดนัด  NIGHT MARKET' : 'NIGHT MARKET  ตลาดนัด', '#ffd23f', SIDE * 2 - 4, 1.3);
    sign.mesh.position.set(ax - sx * 0.27, 8.6, 0); sign.mesh.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(sign.mesh); neon.push(sign.mat);
    tuk(sx * (F.outX + 8), -(SIDE - 3.2), sx > 0 ? 0.3 : Math.PI - 0.3, 0x1f8ad8);
    tuk(sx * (F.outX + 12), SIDE - 3.0, sx > 0 ? -0.2 : Math.PI + 0.2, 0x2fa04a);
    tuk(sx * (F.outX + 34), -(SIDE - 3.4), sx > 0 ? 0.1 : Math.PI, 0xd83a2a);
  }

  /* ---------------- boundary barrier, floodlights, festoons along the sides ---------------- */
  boundaryRail(F, putS, { postMat: MAT.steel, railMat: MAT.steel, panelMat: new THREE.MeshStandardMaterial({ color: 0xd84a2a, roughness: 0.6 }), step: 2.0, postW: 0.08 });
  const poles = floodPoles(ctx, g, { x: F.outX + 1.3, z: F.outZ + 1.5, base: 0, poleMat: MAT.steel, headMat: MAT.steel, glowMat: MAT.glow, put: putS });
  {
    const pairs = [];
    for (const s of [-1, 1]) for (let x = -LEN + 6; x < LEN - 6; x += 12) {
      if (Math.abs(x) < F.outX + 2 && Math.abs(x + 12) < F.outX + 14) continue;
      pairs.push([new THREE.Vector3(x, 5.6, s * (SIDE - 0.4)), new THREE.Vector3(x + 12, 5.6, s * (SIDE - 0.4))]);
    }
    for (const s of [-1, 1]) pairs.push([new THREE.Vector3(-poles[3][0], 6.4, s * (F.outZ + 1.5)), new THREE.Vector3(poles[3][0], 6.4, s * (F.outZ + 1.5))]);
    g.add(festoons(pairs, { sag: 0.8, n: 16, colors: [0xff5a2e, 0xffae42, 0xffd27a, 0xff3fa0], size: 0.12 }));
  }

  /* ---------------- grill smoke + embers, noodle steam ---------------- */
  const smoke = [];
  {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xd8d0d0, transparent: true, opacity: 0, depthWrite: false });
    grills.slice(0, 24).forEach(([x, y, z], i) => {
      for (let k = 0; k < 2; k++) { const s = new THREE.Sprite(mat.clone()); fx.add(s); smoke.push({ s, src: [x, y, z], t: (k / 2 + i * 0.13) % 1 }); }
    });
    fx.add(makeEmbers(grills.filter((_, i) => i % 2 === 0).slice(0, 14), uTime, 6));
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    if (!fx.visible) return;
    for (const sm of smoke) {
      sm.t += dt / 3.5; if (sm.t > 1) sm.t -= 1;
      const t = sm.t;
      sm.s.position.set(sm.src[0] + Math.sin(t * 5 + sm.src[2]) * 0.3, sm.src[1] + t * 3.2, sm.src[2]);
      sm.s.scale.setScalar(0.4 + t * 1.8);
      sm.s.material.opacity = 0.32 * Math.sin(Math.PI * t);
    }
  }
  function setTime(tod) {
    const night = tod !== 'day';
    for (const m of shopMats) m.emissiveIntensity = night ? 1.1 : 0;
    for (const m of neon) m.emissiveIntensity = night ? 1.7 : 0.25;
  }
  return { g, fx, update, setTime };
}
