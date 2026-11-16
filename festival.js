// LANTERN FESTIVAL — a field during Yi Peng. Festival tents and food stalls down both sides, bunting, a stage with big drums,
// canopies of Lanna "khom" lanterns hung on wires behind each end, a crowd, a far-off temple on the hill.
// NIGHT: hundreds of sky lanterns rising and drifting up into the stars, every hanging lantern lit, people holding lanterns.
// DAY: the festival setting up — bright tents, flags and kites in the breeze, lanterns not yet lit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, floodPoles, bambooFence, paint, vcMat, treeClumps } from './props.js';
import { personGeometry } from './life.js';

export function buildFestival(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'festival';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(8484);
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0xb89a52, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x3a2008 }),
    white: new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.85 }),
    vc: vcMat({ flatShading: true }),
  };
  const SIDE = F.outZ + 8;

  /* ---------------- the field + hills + a temple on the hill ---------------- */
  {
    const geo = new THREE.PlaneGeometry(420, 360, 80, 70); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x / 1.3, z);
      p.setY(i, -0.12 + Math.max(0, d - 90) * 0.18 * (0.6 + 0.4 * Math.sin(x * 0.03 + z * 0.02)));
      c.set(Math.abs(x) < F.outX + 3 && Math.abs(z) < F.outZ + 3 ? 0x7a6448 : 0x5f7a38).offsetHSL(0, 0, (R() - 0.5) * 0.08);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    m.receiveShadow = true; g.add(m);
    const trees = [];
    for (let i = 0; i < 110; i++) { const a = R() * Math.PI * 2, r = 70 + R() * 40; trees.push([Math.cos(a) * r * 1.3, -0.1, Math.sin(a) * r, 1.4 + R() * 1.4, R() * 6]); }
    g.add(treeClumps(trees, { leaf: 0x2f4a2a }));
    // a temple chedi on the hill off each end, floodlit at night
    const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(V2([[0, 0], [3, 0], [3, 0.7], [2.6, 0.7], [2.6, 1.4], [2.25, 1.4], [2.25, 2], [2.35, 2.3], [2.45, 3], [2.35, 3.9], [2, 4.7], [1.45, 5.35], [0.9, 5.75], [0.85, 6.1], [1, 6.1], [1, 6.6], [0.6, 6.6], [0.4, 8], [0.2, 10.6], [0, 12.5]]), 16);
    for (const sx of [-1, 1]) put(MAT.gold, body.clone().scale(1.8, 1.8, 1.8), sx * 125, 14, sx * 18);
    for (const sx of [-1, 1]) put(MAT.vc, paint(new THREE.ConeGeometry(30, 18, 9), 0x2f4a2a), sx * 125, 4, sx * 18);
  }

  /* ---------------- festival tents + food stalls down both sides, bunting overhead (not over the court) ---------------- */
  const tentCols = [0xd83a2a, 0xf2f2f2, 0x1f6fd8, 0xe8b82a, 0x2fa04a, 0x8a2a8a];
  for (const s of [-1, 1]) for (let x = -64; x <= 64; x += 6.2) {
    if (Math.abs(x) < 3.5) continue;
    const z = s * (SIDE + R() * 2), c = tentCols[Math.floor(R() * tentCols.length)];
    put(MAT.vc, paint(new THREE.ConeGeometry(3.4, 2.0, 4), c), x, 3.3, z, Math.PI / 4);
    put(MAT.vc, paint(new THREE.BoxGeometry(4.6, 2.3, 4.6), 0xf2ece0), x, 1.0, z);
    put(MAT.vc, paint(new THREE.BoxGeometry(3.0, 0.9, 0.7), 0xc8a060), x, 0.33, z - s * 2.6);
    for (let k = 0; k < 5; k++) put(MAT.vc, paint(new THREE.SphereGeometry(0.12, 5, 4), [0xff8a2a, 0xffe2a0, 0xd8382e, 0x7fbf3a][k % 4]), x - 1 + k * 0.5, 0.86, z - s * 2.6);
  }
  {
    const flags = [];
    for (const s of [-1, 1]) for (let x = -60; x < 60; x += 15) {
      const z = s * (SIDE - 3.5);
      const a = new THREE.Vector3(x, 5.2, z), b = new THREE.Vector3(x + 15, 5.2, z);
      put(MAT.wood, new THREE.CylinderGeometry(0.06, 0.07, 5.4, 5), x, 2.6, z);
      for (let i = 1; i < 18; i++) {
        const t = i / 18, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * 0.8;
        const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3)); f.computeVertexNormals();
        f.translate(p.x, p.y, p.z);
        flags.push(paint(f, tentCols[(i + (x | 0)) % tentCols.length]));
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(flags), vcMat({ side: THREE.DoubleSide })));
  }
  // stage with drums on the +z side, facing the court
  {
    const sz = SIDE + 12;
    put(MAT.vc, paint(new THREE.BoxGeometry(14, 1.2, 6), 0x5a3a24), 0, 0.48, sz);
    put(MAT.vc, paint(new THREE.BoxGeometry(14.4, 0.4, 0.4), 0xdba54c), 0, 7.2, sz - 2.8);
    for (const x of [-6.9, 6.9]) put(MAT.vc, paint(new THREE.BoxGeometry(0.4, 7, 0.4), 0x8a1e17), x, 3.5, sz - 2.8);
    for (const x of [-3, 0, 3]) {
      const drum = new THREE.CylinderGeometry(0.9, 0.9, 1.4, 14); drum.rotateZ(Math.PI / 2);
      put(MAT.vc, paint(drum, 0x8a1e17), x, 2.0, sz);
      put(MAT.vc, paint(new THREE.BoxGeometry(0.2, 1.0, 0.2), 0x3a2a1a), x, 1.1, sz);
    }
  }

  /* ---------------- canopies of Lanna "khom" lanterns behind each end + along the stalls ---------------- */
  const hang = [];
  {
    const wire = new THREE.LineBasicMaterial({ color: 0x140c0a });
    const lines = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
      const x = sx * (F.outX + 7 + k * 3.2);
      lines.push([new THREE.Vector3(x, 7.4, -(SIDE - 2)), new THREE.Vector3(x, 7.4, SIDE - 2), 22]);
    }
    for (const s of [-1, 1]) lines.push([new THREE.Vector3(-62, 6.2, s * (SIDE - 1.2)), new THREE.Vector3(62, 6.2, s * (SIDE - 1.2)), 70]);
    for (const [a, b, n] of lines) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * 1.4; pts.push(p); if (i > 0 && i < n) hang.push(p); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
    }
    for (const sx of [-1, 1]) for (const s of [-1, 1]) for (let k = 0; k < 6; k++) put(MAT.bamboo, new THREE.CylinderGeometry(0.08, 0.1, 7.6, 6), sx * (F.outX + 7 + k * 3.2), 3.7, s * (SIDE - 2));
    // khom: a ribbed drum with a flared skirt and a tassel
    const k1 = new THREE.CylinderGeometry(0.26, 0.3, 0.42, 10); k1.translate(0, 0, 0);
    const k2 = new THREE.CylinderGeometry(0.34, 0.2, 0.12, 10); k2.translate(0, -0.27, 0);
    const k3 = new THREE.ConeGeometry(0.05, 0.3, 4); k3.rotateX(Math.PI); k3.translate(0, -0.5, 0);
    const kGeo = mergeGeometries([k1.toNonIndexed(), k2.toNonIndexed(), k3.toNonIndexed()]);
    const im = new THREE.InstancedMesh(kGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.6) }), hang.length);
    const o = new THREE.Object3D(), cols = [0xff5a2e, 0xffae42, 0xffd27a, 0xff7a5a, 0xfff0c8].map((c) => new THREE.Color(c));
    hang.forEach((p, i) => { o.position.set(p.x, p.y - 0.4, p.z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, cols[i % cols.length]); });
    im.computeBoundingSphere();
    g.add(im);
  }

  /* ---------------- the crowd (one merged mesh) ---------------- */
  const handLanterns = [];
  {
    const pg = personGeometry();
    const parts = [];
    const shirts = [0xf2f2f2, 0xd83a2a, 0x1f6fd8, 0xe8b82a, 0x2fa04a, 0x8a2a8a, 0x2a2a2a, 0xff8ac0];
    for (let i = 0; i < 150; i++) {
      const s = i % 2 ? 1 : -1, x = (R() * 2 - 1) * 60, z = s * (F.outZ + 2.4 + R() * 3.4);
      if (Math.abs(x) < F.outX + 1.5 && Math.abs(z) < F.outZ + 2.6) continue;
      const sc = 0.88 + R() * 0.2, ry = R() * Math.PI * 2;
      for (const [geo, col] of [[pg.body, shirts[Math.floor(R() * shirts.length)]], [pg.head, [0x8a5a3a, 0xc99a72, 0x6b4a30][Math.floor(R() * 3)]]]) {
        const gg = geo.clone(); gg.scale(sc, sc, sc); gg.rotateY(ry); gg.translate(x, -0.12, z); parts.push(paint(gg, col));
      }
      if (R() < 0.3) handLanterns.push([x + Math.sin(ry) * 0.3, 1.3, z + Math.cos(ry) * 0.3]);
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), MAT.vc));
  }

  /* ---------------- fence + floodlights ---------------- */
  bambooFence(F, putS);
  floodPoles(ctx, g, { x: F.outX + 1.4, z: F.outZ + 1.6, base: -0.12, poleMat: MAT.bamboo, headMat: MAT.gold, glowMat: MAT.glow, put: putS });

  /* ---------------- NIGHT: sky lanterns rising, lanterns in people's hands ---------------- */
  const night = new THREE.Group(); fx.add(night);
  const sky = [];
  let skyMesh;
  {
    const lg = new THREE.CylinderGeometry(0.42, 0.3, 0.9, 8);
    skyMesh = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa04a).multiplyScalar(2.4) }), 420);
    skyMesh.frustumCulled = false;
    skyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < 420; i++) {
      const s = { x: (R() - 0.5) * 220, y: 3 + Math.pow(R(), 0.8) * 52, z: (R() - 0.5) * 170, v: 0.55 + R() * 0.7, ph: R() * 6, sc: 1.7 + R() * 1.1 };
      if (Math.abs(s.x) < 30 && Math.abs(s.z) < 20 && s.y < 12) s.y += 14;
      sky.push(s);
      skyMesh.setColorAt(i, c.set(0xffa04a).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.15));
    }
    night.add(skyMesh);
    const hl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 5), MAT.glow, handLanterns.length);
    const o = new THREE.Object3D();
    handLanterns.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); hl.setMatrixAt(i, o.matrix); });
    hl.computeBoundingSphere();
    night.add(hl);
  }
  /* ---------------- DAY: kites in the breeze ---------------- */
  const day = new THREE.Group(); g.add(day);
  const kites = [];
  {
    for (let i = 0; i < 6; i++) {
      const k = new THREE.Group();
      const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.7, 0, 0, 0, -1.2, 0, 0, 1, 0, 0, -1.2, 0, 0.7, 0, 0], 3)); body.computeVertexNormals();
      k.add(new THREE.Mesh(paint(body, tentCols[i % tentCols.length]), vcMat({ side: THREE.DoubleSide })));
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff })); tail.position.y = -2.6; k.add(tail);
      k.scale.setScalar(1.4);
      day.add(k);
      kites.push({ k, x: (R() - 0.5) * 120, z: (R() < 0.5 ? -1 : 1) * (40 + R() * 40), y: 24 + R() * 14, ph: R() * 6 });
    }
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  const o = new THREE.Object3D();
  let time = 0;
  function update(dt) {
    time += dt;
    if (night.visible && fx.visible) {
      for (let i = 0; i < sky.length; i++) {
        const s = sky[i];
        s.y += s.v * dt; s.x += Math.sin(time * 0.2 + s.ph) * 0.3 * dt + 0.25 * dt;
        if (s.y > 58) { s.y = 2 + Math.random() * 3; s.x = (Math.random() - 0.5) * 200; s.z = (Math.random() < 0.5 ? -1 : 1) * (F.outZ + 4 + Math.random() * 60); }   // keep them in the band the cameras see
        o.position.set(s.x, s.y, s.z); o.rotation.set(0, 0, Math.sin(time + s.ph) * 0.08);
        o.scale.setScalar(s.sc * (0.92 + 0.08 * Math.sin(time * 7 + s.ph)));
        o.updateMatrix(); skyMesh.setMatrixAt(i, o.matrix);
      }
      skyMesh.instanceMatrix.needsUpdate = true;
    }
    if (day.visible) for (const kt of kites) {
      kt.k.position.set(kt.x + Math.sin(time * 0.3 + kt.ph) * 4, kt.y + Math.sin(time * 0.7 + kt.ph) * 1.5, kt.z);
      kt.k.rotation.set(0, Math.PI / 2, Math.sin(time * 1.1 + kt.ph) * 0.25);
    }
  }
  function setTime(tod) { const n = tod !== 'day'; night.visible = n; day.visible = !n; }
  return { g, fx, update, setTime, fog: { day: [80, 400], night: [60, 320] } };
}
