// BANGKOK ROOFTOP — the court on top of a tower. Glass + steel railing on the ball boundary, a concrete roof with water tanks,
// AC units, potted palms and a little neon rooftop bar; a skyline of towers all round, a golden prang lit up across the city,
// and the street grid far below. DAY: hazy blue city, glass glinting. NIGHT: thousands of lit windows, glowing streets,
// red aircraft beacons blinking on the tallest towers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, skyline, festoons, floodPoles, boundaryRail, neonSign, paint, vcMat } from './props.js';
import { buildRooftopUltra } from './rooftop-ultra.js';

const STREET_Y = -64;

export function buildRooftop(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'rooftop';
  const fx = new THREE.Group(); g.add(fx);
  const lite = new THREE.Group(); lite.name = 'rooftop-lite'; g.add(lite);   // everything the Ultra city + roof replace
  const R = rnd(9090);
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.95 }),
    parapet: new THREE.MeshStandardMaterial({ color: 0xb4aea4, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa2aa, metalness: 0.8, roughness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(3) }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x3a2008 }),
    vc: vcMat(),
  };
  const RX = F.outX + 5.5, RZ = F.outZ + 5.5;       // roof half-extents

  /* ---------------- the roof + the tower under it ---------------- */
  // the slab is a frame round the court deck (main.js: ±(outX+0.4) × ±(outZ+0.4), 12 cm tall) + a lower piece under it:
  // a slab top just under the court floor showed through it in a big triangle (depth precision at grazing angles)
  {
    const hx = F.outX + 0.4, hz = F.outZ + 0.4;
    for (const sz of [-1, 1]) putS(MAT.concrete, new THREE.BoxGeometry(RX * 2, 0.3, RZ - hz), 0, -0.27, sz * (RZ + hz) / 2);
    for (const sx of [-1, 1]) putS(MAT.concrete, new THREE.BoxGeometry(RX - hx, 0.3, hz * 2), sx * (RX + hx) / 2, -0.27, 0);
    putS(MAT.concrete, new THREE.BoxGeometry(hx * 2, 0.3, hz * 2), 0, -0.62, 0);
  }
  for (const [len, x, z, ry] of [[RX * 2 + 0.6, 0, -RZ - 0.15, 0], [RX * 2 + 0.6, 0, RZ + 0.15, 0], [RZ * 2, -RX - 0.15, 0, Math.PI / 2], [RZ * 2, RX + 0.15, 0, Math.PI / 2]]) {
    putS(MAT.parapet, new THREE.BoxGeometry(len, 1.1, 0.3), x, 0.43, z, ry);
    putS(MAT.steel, new THREE.BoxGeometry(len, 0.05, 0.34), x, 1.0, z, ry);
  }
  const tower = skyline({ count: 1, rMin: 0, rMax: 0, hMin: -0.42, hMax: -0.42, base: STREET_Y, seed: 1 });   // reuse the window texture
  {
    const geo = new THREE.BoxGeometry(RX * 2 + 0.6, -0.42 - STREET_Y, RZ * 2 + 0.6);
    const uv = geo.attributes.uv, nrm = geo.attributes.normal;
    for (let k = 0; k < uv.count; k++) { const h = Math.abs(nrm.getX(k)) > 0.5 ? RZ * 2 : RX * 2; uv.setXY(k, uv.getX(k) * h / 8, uv.getY(k) * (-0.42 - STREET_Y) / 6.5); }
    geo.translate(0, (STREET_Y - 0.42) / 2, 0);
    { const ix = Array.from(geo.index.array); ix.splice(12, 6); geo.setIndex(ix); geo.clearGroups(); }   // no top face: it sat 30 cm under the slab top and showed through it
    tower.mesh.geometry.dispose();
    tower.mesh.geometry = geo;
    lite.add(tower.mesh);
  }
  // roof gear: water tanks on stands, AC units, vents, potted palms, a rooftop bar
  for (const [x, z] of [[RX - 2, RZ - 2], [-RX + 2, -RZ + 2]]) {
    put(MAT.vc, paint(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 12), 0x5f7f9a), x, 3.0, z);
    put(MAT.vc, paint(new THREE.ConeGeometry(1.15, 0.5, 12), 0x4f6a82), x, 4.25, z);
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) put(MAT.steel, new THREE.BoxGeometry(0.1, 2.0, 0.1), x + dx, 1.0, z + dz);
  }
  for (let i = 0; i < 6; i++) {
    const x = -RX + 3 + i * ((RX * 2 - 6) / 5), z = (i % 2 ? 1 : -1) * (RZ - 1.4);
    if (Math.abs(x) > RX - 3.5 && Math.abs(z) > RZ - 3) continue;
    put(MAT.vc, paint(new THREE.BoxGeometry(1.2, 0.8, 0.7), 0xd6d6d0), x, 0.28, z);
    put(MAT.vc, paint(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), 0x3a3a3a), x - 0.25, 0.3, z + (z > 0 ? -0.36 : 0.36), 0, Math.PI / 2);
  }
  {
    const trunk = new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6);
    for (const [x, z] of [[-RX + 1.2, RZ - 1.2], [RX - 1.2, -RZ + 1.2], [-RX + 1.2, 0], [RX - 1.2, 0]]) {
      put(MAT.vc, paint(new THREE.CylinderGeometry(0.4, 0.32, 0.6, 10), 0xb06a3a), x, 0.18, z);
      put(MAT.vc, paint(trunk.clone(), 0x6a5a3a), x, 1.2, z);
      for (let k = 0; k < 6; k++) {
        const f = new THREE.ConeGeometry(0.16, 1.2, 4); f.rotateZ(Math.PI / 2 - 0.6); f.translate(0.55, 0, 0); f.rotateY((k / 6) * Math.PI * 2);
        put(MAT.vc, paint(f, 0x3f7a3a), x, 2.0, z);
      }
    }
  }
  // the little bar on the −z side: counter, stools, umbrella, neon
  const neon = [];
  let prangMat = null;
  {
    const bz = -RZ + 1.5;
    put(MAT.vc, paint(new THREE.BoxGeometry(5, 1.1, 0.8), 0x2a2a30), 0, 0.33, bz);
    put(MAT.vc, paint(new THREE.BoxGeometry(5.2, 0.08, 1.0), 0xc8a060), 0, 0.92, bz);
    for (let i = -2; i <= 2; i++) put(MAT.vc, paint(new THREE.CylinderGeometry(0.18, 0.12, 0.75, 8), 0x8a2a3a), i * 1.0, 0.15, bz + 0.9);
    const n = neonSign('SKY BAR', '#3fe0ff', 3.4, 0.9); n.mesh.position.set(0, 2.3, -RZ + 0.05); lite.add(n.mesh); neon.push(n.mat);
    const n2 = neonSign('TAKRAW', '#ff3fa0', 3.0, 0.8); n2.mesh.position.set(-RX + 0.05, 2.0, -RZ / 2); n2.mesh.rotation.y = Math.PI / 2; lite.add(n2.mesh); neon.push(n2.mat);
  }
  // glass + steel railing on the ball boundary
  boundaryRail(F, putS, { postMat: MAT.steel, railMat: MAT.steel, panelMat: null, step: 1.6, postW: 0.07 });
  {
    const bx = F.outX + 0.05, bz = F.outZ + 0.05;
    for (const [len, x, z, ry] of [[F.outX * 2, 0, -bz, 0], [F.outX * 2, 0, bz, 0], [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, Math.PI / 2]])
      put(MAT.glass, new THREE.BoxGeometry(len, 0.72, 0.02), x, 0.38, z, ry);
  }

  /* ---------------- floodlights + string lights ---------------- */
  const poles = floodPoles(ctx, g, { x: F.outX + 1.4, z: F.outZ + 1.6, base: 0, poleMat: MAT.steel, headMat: MAT.steel, glowMat: MAT.glow, put: putS });
  g.add(festoons([[new THREE.Vector3(-poles[3][0], 6.4, F.outZ + 1.6), new THREE.Vector3(poles[3][0], 6.4, F.outZ + 1.6)],
    [new THREE.Vector3(-poles[3][0], 6.4, -(F.outZ + 1.6)), new THREE.Vector3(poles[3][0], 6.4, -(F.outZ + 1.6))]],
  { colors: [0xfff0c8, 0xffe0a0], size: 0.11, sag: 0.9 }));

  /* ---------------- the city ---------------- */
  // we're near the top: most of the city is BELOW the roof, with a handful of taller towers poking up
  const TINTS = [0xffffff, 0xd8e4f0, 0xc8d8c8, 0xf0e2c8, 0xb8c8e0, 0xe8d0c0, 0xa8b8c0, 0xf2f2e8];   // glass / concrete / sandstone / teal
  const nearCity = skyline({ count: 240, rMin: 46, rMax: 150, hMin: -56, hMax: -8, base: STREET_Y, seed: 314, tints: TINTS,
    avoid: (x, z) => Math.abs(x) < 36 && Math.abs(z) < 30 });                 // everything close is below the roof → a view
  const city = skyline({ count: 150, rMin: 165, rMax: 340, hMin: -30, hMax: 95, base: STREET_Y, seed: 2718, tints: TINTS });   // far towers rise up
  lite.add(nearCity.mesh, city.mesh);
  const beacons = [];
  for (const [x, h, z] of city.tops) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), MAT.beacon); b.position.set(x, h + 1, z); lite.add(b); beacons.push(b); }
  // roof clutter on the nearby towers (we look down on them): penthouses, water tanks, AC units, antennas, the odd helipad
  {
    const parts = [];
    const P = (geo, col, x, y, z) => { geo.translate(x, y, z); parts.push(paint(geo, col)); };
    nearCity.boxes.forEach(([x, h, z, w, d], i) => {
      P(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), 0x8a8a86, x, h + 0.25, z);                       // parapet cap
      if (i % 3 === 0) P(new THREE.BoxGeometry(w * 0.35, 2.8, d * 0.35), 0xb8b4ac, x - w * 0.18, h + 1.4, z + d * 0.1);   // stair penthouse
      if (i % 2 === 0) { P(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 10), 0x6a8aa8, x + w * 0.25, h + 2.2, z - d * 0.25); for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) P(new THREE.BoxGeometry(0.1, 1.3, 0.1), 0x555555, x + w * 0.25 + dx, h + 0.65, z - d * 0.25 + dz); }
      for (let k = 0; k < 3; k++) if ((i + k) % 2) P(new THREE.BoxGeometry(1.2, 0.8, 0.8), 0xd6d6d0, x - w * 0.3 + k * 1.6, h + 0.65, z - d * 0.3);
      if (i % 5 === 1) P(new THREE.CylinderGeometry(0.06, 0.08, 6, 4), 0x9a9a9a, x + w * 0.3, h + 3.2, z + d * 0.3);
      if (i % 11 === 4) { P(new THREE.CylinderGeometry(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 0.12, 20), 0x3a3e44, x, h + 0.56, z); P(new THREE.BoxGeometry(Math.min(w, d) * 0.08, 0.02, Math.min(w, d) * 0.45), 0xf2f2f2, x, h + 0.64, z); }
    });
    lite.add(new THREE.Mesh(mergeGeometries(parts), vcMat({ flatShading: true })));
  }
  // big lit billboards on a few towers facing the court
  for (const [x, y, z, ry, txt, col] of [[-70, 4, 60, Math.PI * 0.8, 'COCONUT', '#ffd23f'], [80, 6, -70, -Math.PI * 0.2, 'TUK TUK TOURS', '#3fe0ff'], [-90, -2, -55, Math.PI * 0.2, 'MANGO STICKY RICE', '#ff6a3f'], [95, 0, 55, -Math.PI * 0.8, 'SIAM TAKRAW', '#ff3fa0']]) {
    const b = neonSign(txt, col, 18, 5); b.mesh.position.set(x, y + 6, z); b.mesh.rotation.y = ry; lite.add(b.mesh); neon.push(b.mat);
    for (const dx of [-5, 5]) put(MAT.steel, new THREE.BoxGeometry(0.7, y + 4 - STREET_Y, 0.7), x + Math.cos(ry) * dx, (y + 4 + STREET_Y) / 2, z - Math.sin(ry) * dx);   // tall pylons from the street
  }

  // a few landmark towers: stepped spire tower + a slim needle
  {
    for (const [x, z, s] of [[150, 60, 1], [-170, -40, 0.8]]) {
      let y = STREET_Y, w = 22 * s;
      for (let i = 0; i < 6; i++) { const h = 40 * s; put(MAT.steel, new THREE.BoxGeometry(w, h, w), x, y + h / 2, z); y += h; w *= 0.78; }
      put(MAT.steel, new THREE.CylinderGeometry(0.4, 1.2, 40 * s, 6), x, y + 20 * s, z);
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), MAT.beacon); b.position.set(x, y + 40 * s, z); lite.add(b); beacons.push(b);
    }
  }
  // golden prang across the city, floodlit
  {
    const prang = new THREE.LatheGeometry([[0, 0], [14, 0], [14, 3], [11.5, 3], [11, 9], [9, 9.5], [8.5, 17], [6.5, 17.6], [5.5, 26], [3.5, 28.5], [2.5, 36], [1, 42], [0.4, 48], [0, 54]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    const pm = new THREE.MeshStandardMaterial({ color: 0xe8c07a, metalness: 0.5, roughness: 0.4, emissive: 0x8a5a18, emissiveIntensity: 0.4 });
    const p = new THREE.Mesh(prang, pm); p.position.set(-30, STREET_Y + 10, 210); lite.add(p);
    neon.push(pm); prangMat = pm;
  }
  // the street grid far below (roads glow at night)
  const streetMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const e = document.createElement('canvas'); e.width = e.height = 256;
    const x = c.getContext('2d'), xe = e.getContext('2d');
    x.fillStyle = '#3a3c40'; x.fillRect(0, 0, 256, 256); xe.fillStyle = '#000'; xe.fillRect(0, 0, 256, 256);
    x.fillStyle = '#26282c'; x.fillRect(0, 112, 256, 32); x.fillRect(112, 0, 32, 256);
    x.fillStyle = '#d8c060'; for (let i = 0; i < 256; i += 16) { x.fillRect(i, 127, 8, 2); x.fillRect(127, i, 2, 8); }
    xe.fillStyle = '#ffb860'; for (let i = 0; i < 256; i += 12) { xe.fillRect(i, 113, 3, 3); xe.fillRect(i, 140, 3, 3); xe.fillRect(113, i, 3, 3); xe.fillRect(140, i, 3, 3); }
    xe.fillStyle = '#ff4030'; for (let i = 0; i < 18; i++) xe.fillRect(Math.random() * 256, 120 + Math.random() * 6, 4, 2);
    xe.fillStyle = '#fff4d0'; for (let i = 0; i < 18; i++) xe.fillRect(120 + Math.random() * 6, Math.random() * 256, 2, 4);
    const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.colorSpace = THREE.SRGBColorSpace; return t; };
    return new THREE.MeshStandardMaterial({ map: mk(c), emissiveMap: mk(e), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  })();
  const street = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), streetMat);
  street.rotation.x = -Math.PI / 2; street.position.y = STREET_Y;
  lite.add(street);

  decor.build(lite);
  solid.build(g, { castShadow: true, receiveShadow: true });

  let time = 0, ultra = null, ultraOn = false;
  function update(dt) {
    time += dt;
    if (ultraOn && ultra) { ultra.update(dt, time); return; }      // the High city is hidden on Ultra
    const on = Math.sin(time * 3) > 0.2;
    for (let i = 0; i < beacons.length; i++) beacons[i].visible = on !== (i % 2 === 0);
  }
  function setTime(tod) {
    const night = tod !== 'day';
    city.mat.emissiveIntensity = night ? 1.25 : 0;
    nearCity.mat.emissiveIntensity = night ? 1.25 : 0;
    tower.mat.emissiveIntensity = night ? 1.0 : 0;
    streetMat.emissiveIntensity = night ? 1.6 : 0;
    neon.forEach((m) => { const prang = m === prangMat; m.emissiveIntensity = night ? (prang ? 1.1 : 1.6) : (prang ? 0.15 : 0.5); });
    MAT.beacon.visible = night;
    for (const b of beacons) b.material.visible = night;
  }
  // ULTRA (see rooftop-ultra.js): a vast night city replaces `lite` — sky, haze and light restyled through `look`
  const out = { g, fx, update, setTime, lite, fog: { day: [140, 820], night: [170, 900] } };
  const fog0 = out.fog;
  out.buildUltra = () => { ultra = buildRooftopUltra(ctx); return ultra.group; };
  out.onUltra = (on) => {
    ultraOn = on;
    out.fog = on && ultra ? ultra.fog : fog0;
    out.look = on && ultra ? ultra.look : undefined;
    if (ctx.applyFog) ctx.applyFog();
  };
  return out;
}
