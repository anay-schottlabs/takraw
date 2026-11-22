// CLOUD MONASTERY — the court on the summit terrace of a mountain monastery, high above a sea of clouds. Other peaks rise
// through the clouds (one with its own little chedi); a great golden chedi stands on the +z side of the summit with smaller
// shrines; on the −z side a long naga-serpent staircase plunges down into the clouds; rows of prayer bells line the terrace edge.
// DAY: bright white clouds rolling below, monks on the terrace. NIGHT: moonlit clouds, the chedi floodlit, lanterns + bells glint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, floodPoles, boundaryRail, paint, vcMat, treeClumps } from './props.js';
import { personGeometry } from './life.js';
import { buildMonasteryUltra } from './monastery-ultra.js';

const CLOUD_Y = -44;

export function buildMonastery(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'monastery';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(1212);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  // pieces Ultra rebuilds (monastery-ultra.js) — paving, walls + stairs, the mountain, the cloud sea, the distant peaks,
  // the golden chedi + shrines, the naga balustrades — go in `lite`, which is hidden while Ultra is on
  const lite = new THREE.Group(); lite.name = 'monastery-lite'; g.add(lite);
  const liteB = makeBatch();
  const putL = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => liteB.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const gilt = new THREE.MeshStandardMaterial({ color: 0xe8b85a, metalness: 0.85, roughness: 0.28, emissive: 0x6a4410, emissiveIntensity: 0.3 });
  const MAT = {
    stone: new THREE.MeshStandardMaterial({ color: 0xa8a092, roughness: 0.95 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x5a5a52, roughness: 0.95, flatShading: true }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.85 }),
    gold: gilt,
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(1.8) }),
    vc: vcMat({ flatShading: true }),
  };
  const TX = F.outX + 7, TZ = F.outZ + 7;               // summit terrace half-extents

  /* ---------------- the summit: paved terrace, retaining walls, the mountain beneath ---------------- */
  {
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = '#b4ab9c'; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `rgba(0,0,0,${(Math.random() * 0.08).toFixed(3)})`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
      x.strokeStyle = 'rgba(60,50,40,0.35)'; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(TX / 2, TZ / 2); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const pav = new THREE.Mesh(new THREE.BoxGeometry(TX * 2, 0.4, TZ * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    pav.position.y = -0.32; pav.receiveShadow = true; lite.add(pav);
    for (const [len, x, z, ry] of [[TX * 2 + 0.8, 0, -TZ, 0], [TX * 2 + 0.8, 0, TZ, 0], [TZ * 2, -TX, 0, Math.PI / 2], [TZ * 2, TX, 0, Math.PI / 2]]) {
      putL(MAT.stone, new THREE.BoxGeometry(len, 6, 0.8), x, -3.2, z, ry);
      putL(MAT.stone, new THREE.BoxGeometry(len, 0.7, 0.9), x, 0.25, z, ry);                          // low parapet
    }
    // the mountain: a craggy cone falling away into the clouds
    const m = new THREE.CylinderGeometry(Math.max(TX, TZ) + 2.5, 110, 80, 14, 6, true);        // a frustum: its top edge meets the terrace walls
    const p = m.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 34) { const k = 1 + (R() - 0.5) * 0.25; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    m.computeVertexNormals();
    const mm = new THREE.Mesh(m, MAT.rock); mm.position.y = -6 - 40; mm.scale.set(1, 1, 0.85); lite.add(mm);
    const trees = [];
    for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, r = TX + 6 + R() * 22; const y = -6 - (r - TX) * 0.95; trees.push([Math.cos(a) * r, y, Math.sin(a) * r * 0.85, 0.9 + R() * 0.7, R() * 6]); }
    lite.add(treeClumps(trees, { leaf: 0x2f5a32 }));
  }

  /* ---------------- the sea of clouds + distant peaks ---------------- */
  const cloudGroup = new THREE.Group(); lite.add(cloudGroup);
  {
    const puffs = [];
    for (let i = 0; i < 340; i++) {
      const a = R() * Math.PI * 2, r = 75 + Math.pow(R(), 0.7) * 360;
      const s = 8 + R() * 20;
      const b = new THREE.IcosahedronGeometry(1, 1); b.scale(s * 1.4, s * 0.75, s * 1.2);                 // big billowing heaps, not a flat sheet
      b.translate(Math.cos(a) * r, CLOUD_Y + (R() - 0.3) * 14, Math.sin(a) * r);
      b.deleteAttribute('uv');
      // shade each heap: blue-grey underneath, bright on top
      const pos = b.attributes.position, col = new Float32Array(pos.count * 3), lo = new THREE.Color(0x9aa8bc), hi = new THREE.Color(0xffffff), c = new THREE.Color();
      let minY = Infinity, maxY = -Infinity; for (let k = 0; k < pos.count; k++) { minY = Math.min(minY, pos.getY(k)); maxY = Math.max(maxY, pos.getY(k)); }
      for (let k = 0; k < pos.count; k++) { c.copy(lo).lerp(hi, Math.pow((pos.getY(k) - minY) / (maxY - minY + 1e-6), 0.7)); col.set([c.r, c.g, c.b], k * 3); }
      b.setAttribute('color', new THREE.BufferAttribute(col, 3));
      puffs.push(b);
    }
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: false, emissive: 0x404858, emissiveIntensity: 0.4 });
    cloudGroup.add(new THREE.Mesh(mergeGeometries(puffs), cm));
    var cloudMat = cm;
    // a flat cloud floor so there are never holes to the ground
    const floor = new THREE.Mesh(new THREE.CircleGeometry(700, 40), new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 1, emissive: 0x30384a, emissiveIntensity: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = CLOUD_Y - 2; lite.add(floor);
    var floorMat = floor.material;
    // a hazy cloud bank all round the horizon: hides the far tree line painted in the shared sky and melts the clouds into it
    const grad = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 256;
      const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.24, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.32, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(c); return t;
    })();
    const bank = new THREE.Mesh(new THREE.CylinderGeometry(350, 350, 220, 48, 1, true),        // inside the camera's 400 m far plane
      new THREE.MeshBasicMaterial({ map: grad, color: 0xe6edf6, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }));
    bank.position.y = -10; bank.renderOrder = -1; lite.add(bank);              // opaque up to ~6° above the horizon, fading out by ~10°
    var bankMat = bank.material;
    // distant peaks rising through the clouds (one with a tiny white chedi)
    for (const [x, z, h, r] of [[150, 90, 70, 40], [-170, 60, 85, 50], [120, -150, 60, 36], [-110, -130, 95, 55], [230, -20, 75, 45], [-240, -10, 65, 42], [20, 220, 80, 50], [-30, -230, 70, 44]]) {
      const pk = new THREE.ConeGeometry(r, h, 9, 3);
      const pp = pk.attributes.position; for (let i = 0; i < pp.count; i++) if (pp.getY(i) < h / 2 - 0.1) { pp.setX(i, pp.getX(i) * (0.85 + R() * 0.3)); pp.setZ(i, pp.getZ(i) * (0.85 + R() * 0.3)); }
      pk.computeVertexNormals();
      putL(MAT.rock, pk, x, CLOUD_Y + h / 2 - 30, z);                      // only the tops break through the clouds
      putL(MAT.vc, paint(new THREE.ConeGeometry(r * 0.35, h * 0.3, 9), 0x2f5a32), x, CLOUD_Y + h - 30 - h * 0.12, z);
    }
    const tiny = new THREE.LatheGeometry([[0, 0], [2, 0], [1.6, 1.5], [1.2, 3], [0.5, 4], [0.2, 6], [0, 7.5]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    putL(MAT.plaster, tiny, -110, CLOUD_Y + 95 - 30, -130);
  }

  /* ---------------- the great golden chedi + shrines on the +z side ---------------- */
  {
    const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(V2([[0, 0], [7, 0], [7, 1.6], [6, 1.6], [6, 3.2], [5.2, 3.2], [5.2, 4.6], [5.4, 5.3], [5.6, 7], [5.4, 9], [4.6, 10.8], [3.4, 12.3], [2.1, 13.2], [2, 14], [2.3, 14], [2.3, 15.2], [1.4, 15.2], [1.1, 18], [0.6, 21], [0.25, 24], [0, 27]]), 24);
    const cz = TZ + 14;
    putL(MAT.plaster, new THREE.BoxGeometry(22, 2.4, 22), 0, -1.0, cz);
    putL(MAT.gold, body, 0, 0.2, cz);
    for (const [x, z] of [[-9, cz - 9], [9, cz - 9], [-9, cz + 9], [9, cz + 9]]) putL(MAT.gold, body.clone().scale(0.28, 0.28, 0.28), x, 0.2, z);
    // stairs from the terrace up to the chedi platform
    for (let k = 0; k < 6; k++) putL(MAT.stone, new THREE.BoxGeometry(6, 0.3, 0.6), 0, -0.2 + k * 0.3, TZ + 0.5 + k * 0.6);
    // shrine halls flanking (red + gold, small)
    for (const sx of [-1, 1]) {
      const x = sx * (TX - 6), z = TZ + 6;
      putL(MAT.plaster, new THREE.BoxGeometry(6, 3, 4), x, 1.2, z);
      for (const s of [-1, 1]) putL(MAT.red, new THREE.BoxGeometry(6.6, 0.15, 3.0), x, 3.6, z + s * 1.2, 0, s * 0.6);
      putL(MAT.gold, new THREE.BoxGeometry(6.6, 0.2, 0.25), x, 4.4, z);
      putL(MAT.glow, new THREE.PlaneGeometry(1.2, 1.8), x, 1.1, z - 2.01, Math.PI);
    }
  }

  /* ---------------- the naga staircase plunging down on the −z side ---------------- */
  {
    const steps = 46, sz0 = -TZ, drop = 0.42, run = 0.8, W = 4.4;
    for (let k = 0; k < steps; k++) putL(MAT.stone, new THREE.BoxGeometry(W, 0.42, run + 0.05), 0, -0.3 - k * drop, sz0 - 0.4 - k * run);
    // the two serpent balustrades: green-gold scaled bodies running down, rearing heads at the top
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= steps; k += 2) pts.push(new THREE.Vector3(s * (W / 2 + 0.35), 0.4 - k * drop, sz0 - 0.4 - k * run));
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.32, 8);
      putL(MAT.vc, paint(tube, 0x2f8a5a), 0, 0, 0);
      const ridge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(0, 0.3, 0)))), 60, 0.1, 5);
      putL(MAT.gold, ridge, 0, 0, 0);
      // rearing head with a fan of five hoods
      const hx = s * (W / 2 + 0.35), hz = sz0 + 0.2;
      putL(MAT.vc, paint(new THREE.CylinderGeometry(0.34, 0.38, 2.2, 8), 0x2f8a5a), hx, 1.3, hz);
      for (let i = -2; i <= 2; i++) {
        const h = new THREE.ConeGeometry(0.32, 1.4, 6); h.rotateX(-0.5 + Math.abs(i) * 0.1);
        putL(MAT.gold, h, hx + i * 0.32, 2.9 - Math.abs(i) * 0.25, hz + 0.1, 0, 0, -i * 0.25);
      }
    }
  }

  /* ---------------- prayer bells along the terrace edge (sway) + lanterns ---------------- */
  const bells = [];
  let bellMesh;
  {
    for (const s of [-1, 1]) for (let x = -TX + 1; x <= TX - 1; x += 0.9) {
      if (s < 0 && Math.abs(x) < 3.5) continue;              // the stair opening
      bells.push([x, 1.5, s * (TZ - 0.15)]);
    }
    for (const sx of [-1, 1]) for (let z = -TZ + 1; z <= TZ - 1; z += 0.9) bells.push([sx * (TX - 0.15), 1.5, z]);
    for (const s of [-1, 1]) put(MAT.red, new THREE.BoxGeometry(TX * 2, 0.08, 0.08), 0, 1.9, s * (TZ - 0.15));
    for (const sx of [-1, 1]) put(MAT.red, new THREE.BoxGeometry(0.08, 0.08, TZ * 2), sx * (TX - 0.15), 1.9, 0);
    for (const [x, z] of [[-TX + 0.3, -TZ + 0.3], [TX - 0.3, -TZ + 0.3], [-TX + 0.3, TZ - 0.3], [TX - 0.3, TZ - 0.3]]) put(MAT.red, new THREE.BoxGeometry(0.16, 2.0, 0.16), x, 1.0, z);
    const bg = new THREE.CylinderGeometry(0.05, 0.12, 0.2, 8); bg.translate(0, -0.25, 0);
    bellMesh = new THREE.InstancedMesh(bg, gilt, bells.length);
    bellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bellMesh.frustumCulled = false;
    g.add(bellMesh);
    for (let x = -TX + 3; x < TX - 2; x += 6) for (const s of [-1, 1]) { put(MAT.red, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), x, 1.2, s * (TZ - 1.2)); put(MAT.glow, new THREE.SphereGeometry(0.2, 8, 6), x, 2.6, s * (TZ - 1.2)); }
  }

  /* ---------------- monks on the terrace ---------------- */
  {
    const pg = personGeometry({ robe: true });
    const parts = [];
    for (const [x, z, r] of [[-TX + 3, TZ - 2.4, 0.4], [TX - 3.5, TZ - 2.2, -0.3], [-TX + 2.5, -TZ + 2.6, 2.8], [6, TZ + 2.2, 3.1], [-5, TZ + 2.6, 2.9]]) {
      for (const [geo, col] of [[pg.body, 0xe07a1a], [pg.head, 0x9c6b47]]) { const gg = geo.clone(); gg.rotateY(r); gg.translate(x, -0.12, z); parts.push(paint(gg, col)); }
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), MAT.vc));
  }

  /* ---------------- boundary rail, floodlights ---------------- */
  boundaryRail(F, putS, { postMat: MAT.red, railMat: MAT.gold, step: 1.6, postW: 0.1 });
  floodPoles(ctx, g, { x: F.outX + 1.4, z: F.outZ + 1.6, base: -0.12, poleMat: MAT.red, headMat: MAT.gold, glowMat: MAT.glow, put: putS });

  decor.build(g);
  liteB.build(lite);
  solid.build(g, { castShadow: true, receiveShadow: true });

  const o = new THREE.Object3D();
  let time = 0, ultra = null;
  function update(dt) {
    time += dt;
    uTime.value = time;
    if (ultra && ultra.group.visible) ultra.update(dt, time);
    cloudGroup.rotation.y += dt * 0.004;                     // the cloud sea drifts slowly round the summit
    bells.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.rotation.set(Math.sin(time * 1.8 + i * 0.7) * 0.25, 0, Math.cos(time * 1.3 + i) * 0.15); o.updateMatrix(); bellMesh.setMatrixAt(i, o.matrix); });
    bellMesh.instanceMatrix.needsUpdate = true;
  }
  function setTime(tod) {
    const day = tod === 'day';
    gilt.emissiveIntensity = day ? 0.15 : 0.8;
    cloudMat.emissive.set(day ? 0x404858 : 0x1a2440); cloudMat.emissiveIntensity = day ? 0.4 : 0.35;
    floorMat.emissive.set(day ? 0x30384a : 0x101830);
    bankMat.color.set(day ? 0xe6edf6 : 0x1c2438);
  }
  // ULTRA (monastery-ultra.js): textured stone, a smooth craggy summit with pines, a moonlit billowing cloud sea, a ring of
  // snow peaks with distant monasteries, a detailed golden chedi + viharns, naga balustrades, and quiet night life
  const FOG = { day: [90, 650], night: [70, 420] };
  const out = { g, fx, update, setTime, lite, fog: FOG };
  out.buildUltra = () => { ultra = buildMonasteryUltra({ ...ctx, TX, TZ, CLOUD_Y, bells }, uTime); return ultra.group; };
  out.onUltra = (on) => { out.fog = on ? { ...FOG, night: [90, 520] } : FOG; if (ctx.applyFog) ctx.applyFog(); };
  return out;
}
