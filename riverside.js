// RIVERSIDE PIER — the court sits on a teak pier jutting into a wide river. Behind the court (−z) a quay street of shophouses with
// food stalls, string lights and noodle steam; across the water (+z) the far bank's shophouses and a temple prang; up and down
// the river (both ends) a bridge. Long-tail boats run up and down; floating-market canoes bob by the pier.
// DAY: busy river, sun on the water. NIGHT: windows + signs lit, lanterns on every boat, light streaks on the water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, makeWater, shophouseRow, festoons, floodPoles, boundaryRail, paint, vcMat } from './props.js';
import { personGeometry, makePeckers } from './life.js';
import { treeClumps } from './props.js';
import { buildRiversideUltra } from './riverside-ultra.js';

const WATER_Y = -1.25;

export function buildRiverside(ctx) {
  const { F, xf, makeBatch, texLoader, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'riverside';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(777);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  // pieces Ultra rebuilds (riverside-ultra.js) go in `lite` (hidden on Ultra): water, banks, deck + piles, shophouses, lamps, stalls,
  // trees, the far temples, bridges, boats and the flat light streaks
  const lite = new THREE.Group(); lite.name = 'riverside-lite'; g.add(lite);
  const fxLite = new THREE.Group(); fx.add(fxLite);
  const liteDecor = makeBatch(), liteSolid = makeBatch();
  const lampXs = [], stalls = [], treeSpots = [], reflect = [];   // (handed to Ultra; `reflect` = High pieces Ultra's water mirrors)
  const addR = (o) => { g.add(o); reflect.push(o); return o; };
  const putL = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => liteDecor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putLS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => liteSolid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const tex = (n, rep = 1, srgb = false) => { const t = texLoader.load(`assets/pond/${n}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const MAT = {
    teak: new THREE.MeshStandardMaterial({ map: tex('planks_diff.jpg', 1, true), normalMap: tex('planks_nor_gl.jpg'), color: 0xc49a72, roughness: 0.75 }),
    pile: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.95, flatShading: true }),
    paving: (() => { const t = texLoader.load('assets/temple/paving_diff.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 4); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, color: 0xd8ccb8, roughness: 0.92 }); })(),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x2c1805 }),
    white: new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.85, flatShading: true }),
    hull: new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 }),
    vc: vcMat(),
  };
  const QUAY_Z = -(F.outZ + 6.5);            // where the near bank's quay wall stands
  const FAR_Z = 62;                          // far bank

  /* ---------------- water + banks ---------------- */
  const water = makeWater(texLoader, uTime, { w: 420, d: 300, color: 0x2f4a3c, opacity: 1, repeat: [26, 18] });
  water.position.set(0, WATER_Y, 70);
  lite.add(water);
  // near quay: wall + street paving + kerb
  putL(MAT.stone, new THREE.BoxGeometry(400, 1.6, 1.2), 0, WATER_Y + 0.6, QUAY_Z);
  putL(MAT.paving, new THREE.BoxGeometry(400, 0.4, 40), 0, -0.05 - 0.2 + 0.2, QUAY_Z - 20.6);
  // far bank: embankment + ground
  putL(MAT.stone, new THREE.BoxGeometry(420, 2.2, 1.4), 0, WATER_Y + 0.9, FAR_Z);
  putL(MAT.paving, new THREE.BoxGeometry(420, 0.4, 60), 0, WATER_Y + 1.8, FAR_Z + 30);

  /* ---------------- the pier: deck around the court, pilings, a walkway to the quay ---------------- */
  const PX = F.outX + 2.6, PZ0 = QUAY_Z, PZ1 = F.outZ + 2.2;
  putLS(MAT.teak, new THREE.BoxGeometry(PX * 2, 0.22, PZ1 - PZ0), 0, -0.23, (PZ0 + PZ1) / 2);
  // pilings stop just under the deck (top at y = -0.36) — only the outer rows are visible
  const PILE_TOP = -0.36, PILE_BOT = WATER_Y - 2.6;
  for (const z of [PZ1 - 0.3, PZ0 + 0.6]) for (let x = -PX + 0.3; x <= PX - 0.29; x += 2.4) putL(MAT.pile, new THREE.CylinderGeometry(0.17, 0.19, PILE_TOP - PILE_BOT, 7), x, (PILE_TOP + PILE_BOT) / 2, z);
  for (const x of [-PX + 0.3, PX - 0.3]) for (let z = PZ0 + 3; z < PZ1 - 1; z += 2.4) putL(MAT.pile, new THREE.CylinderGeometry(0.17, 0.19, PILE_TOP - PILE_BOT, 7), x, (PILE_TOP + PILE_BOT) / 2, z);
  // fascia
  for (const [len, x, z, ry] of [[PX * 2, 0, PZ1, 0], [PZ1 - PZ0, -PX, (PZ0 + PZ1) / 2, Math.PI / 2], [PZ1 - PZ0, PX, (PZ0 + PZ1) / 2, Math.PI / 2]]) putLS(MAT.teak, new THREE.BoxGeometry(len, 0.4, 0.14), x, -0.35, z, ry);
  // boundary rail (teak posts, red rail) on the ball boundary
  boundaryRail(F, putS, { postMat: MAT.teak, railMat: MAT.red, step: 1.8 });
  // mooring posts + a tyre or two along the pier's river edge
  for (let x = -PX + 1.2; x < PX; x += 4.6) { putL(MAT.pile, new THREE.CylinderGeometry(0.14, 0.16, 1.4, 7), x, 0.4, PZ1 - 0.2); putL(MAT.white, new THREE.CylinderGeometry(0.16, 0.16, 0.06, 7), x, 1.12, PZ1 - 0.2); }

  /* ---------------- floodlights + festoons ---------------- */
  const poles = floodPoles(ctx, g, { x: F.outX + 1.2, z: F.outZ + 1.4, base: 0, poleMat: MAT.red, headMat: MAT.gold, glowMat: MAT.glow, put: putS });
  addR(festoons([[new THREE.Vector3(-poles[3][0], 6.5, F.outZ + 1.4), new THREE.Vector3(poles[3][0], 6.5, F.outZ + 1.4)],
    [new THREE.Vector3(-poles[3][0], 6.5, -(F.outZ + 1.4)), new THREE.Vector3(poles[3][0], 6.5, -(F.outZ + 1.4))]]));

  /* ---------------- quay street: shophouses, stalls, lamp posts with festoons ---------------- */
  const SHOP_Z = QUAY_Z - 12;
  const near = shophouseRow({ x0: -90, x1: 90, z: SHOP_Z, y: 0, face: 1, seed: 11, minF: 2, maxF: 4 });
  lite.add(near.group);
  const far = shophouseRow({ x0: -120, x1: 120, z: FAR_Z + 9, y: WATER_Y + 2, face: -1, seed: 23, minF: 2, maxF: 5, depth: 9 });
  lite.add(far.group);
  const shopMats = [...near.mats, ...far.mats];
  {
    const stallCols = [0xc0392b, 0x1f5fa8, 0x2f7a4a, 0xe2a400, 0xf2f2f2];
    lampXs.length = 0;
    for (let x = -46; x <= 46; x += 11.5) {
      if (Math.abs(x) < 1) continue;
      lampXs.push(x);
      putL(MAT.pile, new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), x, 2.1, QUAY_Z - 1.4);
      putL(MAT.glow, new THREE.SphereGeometry(0.22, 8, 6), x, 4.35, QUAY_Z - 1.4);
    }
    const pairs = [];
    for (let i = 0; i < lampXs.length - 1; i++) pairs.push([new THREE.Vector3(lampXs[i], 4.2, QUAY_Z - 1.4), new THREE.Vector3(lampXs[i + 1], 4.2, QUAY_Z - 1.4)]);
    addR(festoons(pairs, { sag: 0.6, n: 14, colors: [0xffe2a0, 0xfff0c8], size: 0.09, bright: 3 }));
    // food stalls under umbrellas between the lamps
    for (let x = -52; x <= 52; x += 5.5) {
      if (Math.abs(x) < PX + 1 && R() < 0.5) continue;
      const z = QUAY_Z - 4.5 - R() * 3;
      stalls.push([x, z]);
      putL(MAT.white, new THREE.BoxGeometry(1.8, 0.85, 0.9), x, 0.42, z);
      putL(MAT.vc, paint(new THREE.ConeGeometry(1.5, 0.6, 10, 1), stallCols[Math.floor(R() * stallCols.length)]), x, 2.45, z);
      putL(MAT.pile, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), x, 1.2, z);
      for (let k = 0; k < 4; k++) putL(MAT.vc, paint(new THREE.SphereGeometry(0.12, 6, 5), [0xff8a2a, 0x7fbf3a, 0xe8d24a, 0xd8382e][k]), x - 0.6 + k * 0.4, 0.95, z);
      putL(MAT.glow, new THREE.SphereGeometry(0.08, 6, 5), x, 2.1, z);
    }
  }

  /* ---------------- people: crowds along the quay + at the stalls, spectators on the pier ---------------- */
  {
    const pg = personGeometry(), pgh = personGeometry({ hat: true });
    const parts = [];
    const shirts = [0x3a6ad8, 0xd84a3a, 0xf2f2f2, 0x2f9a5a, 0xe8b82a, 0x7a4ab8, 0x2a2a2a, 0xff8ac0];
    const skins = [0x8a5a3a, 0xc99a72, 0x6b4a30];
    const person = (x, z, ry, hat = false, sc = 1) => {
      const pp = hat ? pgh : pg;
      const list = [[pp.body, shirts[Math.floor(R() * shirts.length)]], [pp.head, skins[Math.floor(R() * 3)]]];
      if (hat) list.push([pp.hat, 0xd8b25a]);
      for (const [geo, col] of list) { const gg = geo.clone(); gg.scale(sc, sc, sc); gg.rotateY(ry); gg.translate(x, 0.12, z); parts.push(paint(gg, col)); }
    };
    for (let i = 0; i < 90; i++) {
      const x = (R() - 0.5) * 150, z = QUAY_Z - 1.6 - R() * 9.5;
      if (Math.abs(x) < PX + 1 && z > QUAY_Z - 3) continue;
      person(x, z, R() * 6, R() < 0.2, 0.88 + R() * 0.2);
    }
    // spectators along the pier's open edges, facing the court
    for (const sx of [-1, 1]) for (let z = PZ0 + 1.5; z < PZ1 - 0.6; z += 1.1) if (R() < 0.6) {
      const x = sx * (F.outX + 1.6 + R() * 0.6), g2 = new THREE.Group();
      person(x, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, R() < 0.3, 0.9 + R() * 0.15);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => { p.translate(0, -0.24, 0); return p; })), vcMat({ flatShading: true }));
    g.add(mesh); reflect.push(mesh);
    g.add(makePeckers(Array.from({ length: 14 }, () => [(R() - 0.5) * 60, 0.12, QUAY_Z - 2 - R() * 4, R() * 6]), 0x8c90a2).g);
  }
  // planter trees along the quay
  {
    const spots = [];
    for (let x = -80; x <= 80; x += 14) { if (Math.abs(x) < PX + 2) continue; spots.push([x, 0.15, QUAY_Z - 10.2, 0.8 + R() * 0.3, R() * 6]); treeSpots.push(x); putL(MAT.white, new THREE.CylinderGeometry(0.9, 0.8, 0.5, 10), x, 0.4, QUAY_Z - 10.2); }
    lite.add(treeClumps(spots, { leaf: 0x3a6a32 }));
  }

  /* ---------------- far bank: a temple prang among trees, a riverside sala ---------------- */
  {
    const prang = new THREE.LatheGeometry([[0, 0], [5.5, 0], [5.5, 1.2], [4.6, 1.2], [4.4, 3.5], [3.6, 3.7], [3.4, 6.5], [2.6, 6.8], [2.2, 10], [1.4, 11], [1.0, 14], [0.4, 16.5], [0.15, 19], [0, 21]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
    for (const [x, s] of [[34, 1.25], [-58, 0.9]]) {
      putL(MAT.white, prang.clone().scale(s, s, s), x, WATER_Y + 2, FAR_Z + 26);
      putL(MAT.gold, new THREE.ConeGeometry(0.3 * s, 3 * s, 6), x, WATER_Y + 2 + 21 * s, FAR_Z + 26);
    }
    const crown = new THREE.IcosahedronGeometry(2.2, 0); crown.scale(1.2, 0.9, 1.2);
    for (let i = 0; i < 26; i++) {
      const x = -130 + i * 10 + R() * 4, z = FAR_Z + 14 + R() * 18;
      putL(MAT.green, crown.clone().scale(1 + R() * 0.8, 1 + R() * 0.8, 1 + R() * 0.8), x, WATER_Y + 2 + 6 + R() * 3, z);
      putL(MAT.pile, new THREE.CylinderGeometry(0.25, 0.35, 7, 6), x, WATER_Y + 2 + 3.5, z);
    }
  }

  /* ---------------- bridges up and down the river (one off each end) ---------------- */
  for (const [bx, style] of [[150, 'steel'], [-150, 'arch']]) {
    const span = FAR_Z - QUAY_Z + 20, cz = (FAR_Z + QUAY_Z) / 2;
    putL(MAT.stone, new THREE.BoxGeometry(6, 1, span), bx, 4.5, cz);
    for (const s of [-1, 1]) putL(MAT.red, new THREE.BoxGeometry(0.2, 1.0, span), bx + s * 2.9, 5.4, cz);
    if (style === 'arch') {
      for (let i = 0; i <= 12; i++) { const t = i / 12, z = QUAY_Z + t * (FAR_Z - QUAY_Z); putL(MAT.stone, new THREE.BoxGeometry(5.6, 1.2, (FAR_Z - QUAY_Z) / 12 + 0.2), bx, WATER_Y + 1 + Math.sin(Math.PI * t) * 3.2, z); }
    } else {
      for (const s of [-1, 1]) for (let i = 0; i <= 10; i++) { const z = QUAY_Z + (i / 10) * (FAR_Z - QUAY_Z); putL(MAT.white, new THREE.BoxGeometry(0.25, 6, 0.25), bx + s * 2.8, 8, z); }
      for (const s of [-1, 1]) putL(MAT.white, new THREE.BoxGeometry(0.3, 0.3, span), bx + s * 2.8, 11, cz);
    }
    for (let z = QUAY_Z; z <= FAR_Z; z += 9) for (const s of [-1, 1]) { putL(MAT.pile, new THREE.CylinderGeometry(0.06, 0.06, 2, 5), bx + s * 2.6, 6, z); putL(MAT.glow, new THREE.SphereGeometry(0.2, 7, 5), bx + s * 2.6, 7.1, z); }
    for (const z of [QUAY_Z + 18, FAR_Z - 18]) putL(MAT.stone, new THREE.BoxGeometry(4, 6.5, 5), bx, WATER_Y + 2.2, z);   // piers
  }

  /* ---------------- boats ---------------- */
  const boats = [];
  {
    const hullGeo = (() => {
      const L = 7, W = 0.9;
      const shape = new THREE.Shape(); shape.moveTo(-L / 2, 0); shape.quadraticCurveTo(-L / 2 + 0.6, W / 2, 0, W / 2); shape.quadraticCurveTo(L / 2 - 0.3, W / 2, L / 2 + 0.6, 0.05);
      shape.lineTo(L / 2 + 0.6, -0.05); shape.quadraticCurveTo(L / 2 - 0.3, -W / 2, 0, -W / 2); shape.quadraticCurveTo(-L / 2 + 0.6, -W / 2, -L / 2, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
      geo.rotateX(Math.PI / 2); geo.translate(0, 0.6, 0);
      return geo;
    })();
    const canopyCols = [0x1f5fa8, 0xc0392b, 0x2f7a4a, 0xe2a400];
    const person = personGeometry({ hat: true });
    const mkBoat = (kind, i) => {
      const parts = [], glows = [];
      const P = (geo, col, x = 0, y = 0, z = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { geo.scale(sx, sy, sz); geo.rotateZ(rz); geo.translate(x, y, z); parts.push(paint(geo, col)); };
      const hg = hullGeo.clone();
      if (kind === 'canoe') hg.scale(0.55, 0.7, 0.8);
      parts.push(paint(hg, kind === 'canoe' ? 0x4a3020 : [0x3a6a8a, 0x8a3a2a, 0x2f6a4a][i % 3]));
      if (kind === 'longtail') {
        P(new THREE.BoxGeometry(3.2, 0.06, 1.1), canopyCols[i % 4], 0.2, 1.75, 0);
        for (const [x, z] of [[-1.3, 0.45], [-1.3, -0.45], [1.7, 0.45], [1.7, -0.45]]) P(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 4), 0x3b2a1f, x, 1.17, z);
        P(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), 0x3b2a1f, -4.4, 0.8, 0, 1.3);
        P(new THREE.BoxGeometry(0.6, 0.45, 0.45), 0x8a8f96, -3, 1.15, 0);
        P(new THREE.SphereGeometry(0.16, 6, 5), 0xff7fbf, 4.0, 0.95, 0);
        const l = new THREE.SphereGeometry(0.16, 8, 6); l.translate(0.2, 1.6, 0); glows.push(l);
      } else {
        for (let k = 0; k < 6; k++) P(new THREE.SphereGeometry(0.14, 6, 5), [0xff8a2a, 0x7fbf3a, 0xe8d24a, 0xd8382e, 0xffffff, 0x8a3a8a][k], -1 + k * 0.35, 0.95, (k % 2 - 0.5) * 0.3);
        const l = new THREE.SphereGeometry(0.1, 7, 5); l.translate(1.5, 1.2, 0); glows.push(l);
      }
      const rx = kind === 'canoe' ? -1.6 : -2.4, sc = 0.85;
      for (const [geo, col] of [[person.body, 0x3a4a6a], [person.head, 0x8a5a3a], [person.hat, 0xd8b25a]]) { const gg = geo.clone(); gg.scale(sc, sc, sc); gg.translate(rx, 0.5, 0); parts.push(paint(gg, col)); }
      const b = new THREE.Group();
      b.add(new THREE.Mesh(mergeGeometries(parts), MAT.vc));
      b.add(new THREE.Mesh(mergeGeometries(glows.map((x) => x.toNonIndexed())), MAT.glow));
      lite.add(b);
      return b;
    };
    for (let i = 0; i < 5; i++) {
      const b = mkBoat('longtail', i);
      boats.push({ b, x: -140 + R() * 280, z: 14 + i * 7 + R() * 3, v: (i % 2 ? -1 : 1) * (5 + R() * 4), bob: R() * 6 });
    }
    for (let i = 0; i < 6; i++) {
      const b = mkBoat('canoe', i);
      const side = i % 2 ? 1 : -1;
      boats.push({ b, x: side * (PX + 4 + R() * 26), z: PZ1 + 1.6 + R() * 6, v: (R() - 0.5) * 0.6, bob: R() * 6, drift: true, home: side * (PX + 4 + R() * 26) });
    }
    // a little floating market crowded against the quay wall on both sides of the pier
    for (let i = 0; i < 12; i++) {
      const b = mkBoat('canoe', i + 6);
      const side = i % 2 ? 1 : -1, x = side * (PX + 3 + Math.floor(i / 2) * 5.2 + R() * 1.5);
      boats.push({ b, x, z: QUAY_Z + 1.6 + (i % 3) * 1.3, v: (R() - 0.5) * 0.3, bob: R() * 6, drift: true, home: x });
    }
  }

  /* ---------------- night: light streaks on the water under the lamps + boats ---------------- */
  {
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const list = [...poles.map(([x, z]) => [x, z + (z > 0 ? 2.5 : 0), 1.2, 6]), ...Array.from({ length: 22 }, (_, i) => [-110 + i * 10.5, FAR_Z - 4, 0.9, 7])];
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb35c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }), list.length);
    const o = new THREE.Object3D();
    list.forEach(([x, z, sx, sz], i) => { o.position.set(x, WATER_Y + 0.02, z); o.scale.set(sx, 1, sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere(); im.renderOrder = 3;
    fxLite.add(im);
  }

  decor.build(g);
  { const sg = new THREE.Group(); g.add(sg); solid.build(sg, { castShadow: true, receiveShadow: true }); reflect.push(sg); }
  liteDecor.build(lite);
  liteSolid.build(lite, { castShadow: true, receiveShadow: true });

  let time = 0, ultra = null;
  function update(dt, pr) {
    time += dt;
    uTime.value = time;
    if (ultra && ultra.group.visible) ultra.update(dt, time, pr);
    if (lite.visible) for (const bt of boats) {
      bt.x += bt.v * dt;
      if (!bt.drift && Math.abs(bt.x) > 160) bt.x = -Math.sign(bt.x) * 160;
      if (bt.drift && Math.abs(bt.x - bt.home) > 3) bt.v = -bt.v;
      bt.b.position.set(bt.x, WATER_Y - 0.25 + Math.sin(time * 1.4 + bt.bob) * 0.05, bt.z);
      bt.b.rotation.set(Math.sin(time * 1.1 + bt.bob) * 0.03, bt.v >= 0 ? 0 : Math.PI, Math.sin(time * 0.9 + bt.bob) * 0.02);
    }
  }
  function setTime(tod) {
    const night = tod !== 'day';
    for (const m of shopMats) m.emissiveIntensity = night ? 1.1 : 0;
  }
  // ULTRA (riverside-ultra.js): the river bends away at both ends; mirror-reflecting animated water with boat wakes; a teak pier
  // of real planks, piles, bracing and rope; detailed shophouses, a floodlit prang and golden chedi, two lit bridges, a city skyline
  // and its glow off to the sides; boats, barges and ferries on the river; mist, moths, fireflies and egrets
  const out = { g, fx, update, setTime, lite };
  out.buildUltra = () => {
    ultra = buildRiversideUltra({ ...ctx, WATER_Y, QUAY_Z, FAR_Z, PX, PZ0, PZ1, lampXs, stalls, treeSpots, poles, uTime });
    for (const o of reflect) o.traverse((m) => { if (m.isMesh) m.layers.enable(ultra.REFL_LAYER); });   // the pier's festoons, floodlights and crowd show in the water
    return ultra.group;
  };
  out.onUltra = (on) => { fxLite.visible = !on; out.fog = on ? { night: [55, 385] } : undefined; ctx.applyFog(); };
  return out;
}
