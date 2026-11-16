// KARST BEACH — a sand court on an Andaman beach. Turquoise sea toward +z with limestone karst towers standing out of the water,
// long-tail boats pulled up on the shore, a headland of karst cliffs off each end, palms + beach huts + straw umbrellas behind.
// DAY: bright sea, loungers, boats rocking in the shallows. NIGHT: tiki torches along the shore, fire dancers spinning fire,
// the beach bars' lanterns, moonlight on the water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, makeWater, festoons, floodPoles, boundaryRail, paint, vcMat, palms } from './props.js';
import { makeEmbers, personGeometry } from './life.js';

const SEA_Y = -0.62;
// the sand shelves from y −0.12 at SHORE−2 at 0.09 per metre, so it meets the sea here:

export function buildBeach(ctx) {
  const { F, xf, makeBatch, texLoader, glowTexture, slope } = ctx;
  const g = new THREE.Group(); g.name = 'beach';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(5151);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.9 }),
    thatch: new THREE.MeshStandardMaterial({ color: 0xb8925a, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.8) }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3.2) }),
    vc: vcMat(),
    vcFlat: vcMat({ flatShading: true }),
  };
  const SHORE = F.outZ + 9;                 // where the sand starts to shelve (sea toward +z)
  const WATERLINE = SHORE - 2 + (-0.12 - SEA_Y) / 0.09;

  /* ---------------- sand (gently shelving into the sea), sea, foam ---------------- */
  {
    const W = 520, D = 420, nx = 130, nz = 105;
    const geo = new THREE.PlaneGeometry(W, D, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 60);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const dune = z < -F.outZ - 6 ? Math.max(0, Math.sin(x * 0.05) * 0.4 + Math.sin(x * 0.13 + z * 0.1) * 0.25) * Math.min(1, (-F.outZ - 6 - z) / 12) : 0;
      const y = z < SHORE - 2 ? -0.12 + dune : -0.12 - (z - (SHORE - 2)) * 0.09;
      p.setY(i, Math.max(y, -4));
      const wet = THREE.MathUtils.clamp(1 - Math.abs(z - SHORE) / 3, 0, 1);
      c.set(0xead6a2).lerp(new THREE.Color(0xb8a070), wet * 0.8).offsetHSL(0, 0, (Math.sin(x * 1.3 + z * 0.7) * 0.5) * 0.03);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    sand.receiveShadow = true;
    g.add(sand);
    const sea = makeWater(texLoader, uTime, { w: 900, d: 700, color: 0x1f7f8f, opacity: 0.88, repeat: [50, 40] });
    sea.position.set(0, SEA_Y, SHORE + 340);
    g.add(sea);
  }
  // breaking foam: a white band that washes up and back along the shoreline
  const foamMat = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 70; i++) { x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(Math.random() * 256, 8 + Math.random() * 16, 2 + Math.random() * 10, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(30, 1);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8, depthWrite: false, color: 0xffffff });
  })();
  const foams = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(600, 3.6), foamMat.clone());
    f.rotation.x = -Math.PI / 2; f.renderOrder = 3;
    g.add(f);
    foams.push({ f, ph: i * Math.PI });
  }

  const crests = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(60 + Math.random() * 60, 0.9), foamMat.clone());
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3; g.add(m);
    crests.push({ m, x: -150 + i * 38 + Math.random() * 10, t: i / 9 });
  }

  /* ---------------- karst towers out in the sea + headlands off both ends ---------------- */
  {
    const rock = [], green = [];
    const karst = (x, z, h, r, seed) => {
      const kr = rnd(seed);
      const geo = new THREE.CylinderGeometry(r * 0.75, r, h, 10, 7);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / h + 0.5, a = Math.atan2(p.getZ(i), p.getX(i));
        const k = (0.85 + 0.25 * Math.sin(y * 9 + a * 3 + seed) + (kr() - 0.5) * 0.18) * (y > 0.85 ? 0.85 : 1) * (1 + 0.25 * Math.sin(y * 3.1));
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      geo.translate(x, h / 2 + SEA_Y - 2, z);
      geo.computeVertexNormals();
      const nonI = geo.toNonIndexed(), pp = nonI.attributes.position, cc = new Float32Array(pp.count * 3), c = new THREE.Color();
      for (let i = 0; i < pp.count; i++) { const yy = (pp.getY(i) - SEA_Y) / h; c.set(0xc8beaa).lerp(new THREE.Color(0x6a6458), Math.max(0, Math.sin(pp.getX(i) * 0.7 + yy * 14)) * 0.35 + (yy < 0.08 ? 0.4 : 0)); cc.set([c.r, c.g, c.b], i * 3); }
      nonI.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      nonI.deleteAttribute('uv');
      rock.push(nonI);
      for (let k = 0; k < 6; k++) {
        const b = new THREE.IcosahedronGeometry(r * (0.35 + kr() * 0.3), 0);
        const yy = h * (0.55 + kr() * 0.45);
        const a = kr() * Math.PI * 2;
        b.translate(x + Math.cos(a) * r * 0.6, yy + SEA_Y - 2, z + Math.sin(a) * r * 0.6);
        green.push(b);
      }
      const cap = new THREE.IcosahedronGeometry(r * 0.75, 1); cap.scale(1, 0.55, 1); cap.translate(x, h + SEA_Y - 2.2, z); green.push(cap);
    };
    const towers = [[38, SHORE + 55, 40, 8], [-55, SHORE + 80, 56, 11], [105, SHORE + 115, 72, 13], [-135, SHORE + 150, 66, 15], [8, SHORE + 190, 84, 17],
      [170, SHORE + 60, 38, 9], [-185, SHORE + 75, 48, 11], [-20, SHORE + 120, 30, 6], [70, SHORE + 32, 22, 4.5]];
    towers.forEach(([x, z, h, r], i) => karst(x, z, h, r, i * 7 + 3));
    for (const sx of [-1, 1]) {                                                // headlands closing each end of the bay
      karst(sx * 88, SHORE + 6, 34, 14, 91 + sx);
      karst(sx * 104, SHORE - 10, 46, 16, 97 + sx);
      karst(sx * 118, -18, 52, 18, 101 + sx);
    }
    g.add(new THREE.Mesh(mergeGeometries(rock), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
    g.add(new THREE.Mesh(mergeGeometries(green), new THREE.MeshStandardMaterial({ color: 0x3f6a32, roughness: 0.9, flatShading: true })));
  }

  /* ---------------- long-tail boats pulled up on the shore + two out on the water ---------------- */
  const boats = [];
  {
    const hullGeo = (() => {
      const L = 7.5, W = 1.0;
      const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.quadraticCurveTo(-L / 2 + 0.6, W / 2, 0, W / 2); s.quadraticCurveTo(L / 2 - 0.3, W / 2, L / 2 + 0.8, 0.05);
      s.lineTo(L / 2 + 0.8, -0.05); s.quadraticCurveTo(L / 2 - 0.3, -W / 2, 0, -W / 2); s.quadraticCurveTo(-L / 2 + 0.6, -W / 2, -L / 2, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.65, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, 0.65, 0);
      return geo;
    })();
    const hullCols = [0x2f6a8a, 0xb84a2a, 0x2f8a5a, 0xd8b84a, 0x8a3a8a];
    const mk = (i) => {
      const P = [];
      P.push(paint(hullGeo.clone(), hullCols[i % hullCols.length]));
      const bow = new THREE.ConeGeometry(0.12, 1.2, 5); bow.rotateZ(-0.9); bow.translate(4.3, 1.2, 0); P.push(paint(bow, 0x5a3a24));
      for (const c of [0xff4a8a, 0xffd23f, 0x3fa0ff]) { const r = new THREE.TorusGeometry(0.12, 0.04, 4, 8); r.translate(4.4, 1.55 - Math.random() * 0.3, 0); P.push(paint(r, c)); }   // ribbons on the bow
      const can = new THREE.BoxGeometry(2.6, 0.06, 1.2); can.translate(-0.3, 1.8, 0); P.push(paint(can, [0x1f5fa8, 0xc0392b, 0x2f7a4a][i % 3]));
      for (const [x, z] of [[-1.4, 0.5], [-1.4, -0.5], [0.9, 0.5], [0.9, -0.5]]) { const p = new THREE.CylinderGeometry(0.03, 0.03, 1.15, 4); p.translate(x, 1.2, z); P.push(paint(p, 0x3b2a1f)); }
      const tail = new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5); tail.rotateZ(1.3); tail.translate(-4.6, 0.85, 0); P.push(paint(tail, 0x3b2a1f));
      const eng = new THREE.BoxGeometry(0.6, 0.45, 0.45); eng.translate(-3.2, 1.15, 0); P.push(paint(eng, 0x8a8f96));
      const geo = mergeGeometries(P);
      const m = new THREE.Mesh(geo, MAT.vc);
      g.add(m);
      return m;
    };
    for (let i = 0; i < 6; i++) {
      const x = -48 + i * 17 + R() * 5;
      if (Math.abs(x) < F.outX + 4) continue;
      const m = mk(i);
      boats.push({ m, x, z: SHORE + 1.8 + R() * 1.5, ry: -Math.PI / 2 + (R() - 0.5) * 0.4, y: SEA_Y - 0.2, bob: R() * 6, still: true });
    }
    for (let i = 0; i < 2; i++) boats.push({ m: mk(i + 3), x: -120 + R() * 240, z: SHORE + 22 + i * 14, ry: 0, y: SEA_Y - 0.25, bob: R() * 6, v: (i ? -1 : 1) * 6 });
  }

  /* ---------------- behind the court: palms, beach huts, straw umbrellas + loungers ---------------- */
  {
    const spots = [];
    for (let i = 0; i < 34; i++) {
      const x = -95 + i * 5.7 + (R() - 0.5) * 3, z = -(F.outZ + 7 + R() * 16);
      spots.push([x, -0.12, z, 0.85 + R() * 0.45, R() * 6, (R() - 0.5) * 0.25]);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) spots.push([sx * (F.outX + 18 + i * 9 + R() * 3), -0.12, SHORE - 4 - R() * 6, 0.9 + R() * 0.4, R() * 6, sx * 0.2]);
    g.add(palms(spots, uTime));
    // beach huts on stilts with steep thatch roofs + lantern-lit bars
    for (const [x, rz] of [[-30, 0.1], [-12, -0.1], [10, 0.05], [30, -0.15], [52, 0.1], [-52, -0.05]]) {
      const z = -(F.outZ + 11);
      for (const [dx, dz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) put(MAT.wood, new THREE.CylinderGeometry(0.08, 0.09, 1.0, 5), x + dx, 0.38, z + dz);
      put(MAT.vc, paint(new THREE.BoxGeometry(3.6, 0.12, 2.8), 0x8a6a48), x, 0.9, z);
      put(MAT.vc, paint(new THREE.BoxGeometry(3.4, 1.8, 2.6), 0xc8a870), x, 1.86, z);
      for (const s of [-1, 1]) put(MAT.thatch, slope(-2.3, 2.3, s * 2.0, 2.6, 0, 4.3, 1), x, 0, z, rz);
      put(MAT.glow, new THREE.PlaneGeometry(1.0, 0.9), x, 1.9, z + 1.31);
    }
    for (let i = 0; i < 12; i++) {
      const x = -60 + i * 10.5 + (R() - 0.5) * 2;
      if (Math.abs(x) < F.outX + 2) continue;
      const z = i % 2 ? -(F.outZ + 4.4) : SHORE - 4.2;
      put(MAT.thatch, new THREE.ConeGeometry(1.5, 0.8, 9), x, 2.5, z);
      put(MAT.wood, new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), x, 1.1, z);
      for (const dx of [-0.8, 0.8]) put(MAT.vc, paint(new THREE.BoxGeometry(0.7, 0.12, 1.9), [0xf2f2f2, 0x3fa0d8, 0xe8b82a][i % 3]), x + dx, 0.25, z, 0, 0.12);
    }
  }

  /* ---------------- beachgoers: towels + sunbathers, people standing about, swimmers ---------------- */
  {
    const pg = personGeometry();
    const parts = [];
    const towel = [0xff4a8a, 0x3fa0ff, 0xffd23f, 0x2fd3a0, 0xff8a3a, 0xffffff];
    const swim = [0xd83a2a, 0x1f6fd8, 0x2a2a2a, 0xff8ac0, 0x2fa04a];
    const skin = [0x8a5a3a, 0xc99a72, 0x6b4a30, 0xe2b089];
    for (let i = 0; i < 30; i++) {
      const x = (R() - 0.5) * 120, z = SHORE - 3 - R() * 7;
      if (Math.abs(x) < F.outX + 3) continue;
      const tw = new THREE.BoxGeometry(0.9, 0.03, 1.9); tw.rotateY(R() * 0.6 - 0.3); tw.translate(x, -0.1, z); parts.push(paint(tw, towel[i % towel.length]));
      if (R() < 0.75) {                                         // someone lying on it
        const ry = R() * 0.6 - 0.3;
        for (const [geo, col] of [[pg.body, swim[i % swim.length]], [pg.head, skin[i % skin.length]]]) { const gg = geo.clone(); gg.rotateX(-Math.PI / 2); gg.rotateY(ry); gg.translate(x, -0.02, z + 0.75); parts.push(paint(gg, col)); }
      }
    }
    for (let i = 0; i < 26; i++) {                              // standing / strolling along the water
      const x = (R() - 0.5) * 140, z = SHORE - 1.5 + R() * 2.5;
      if (Math.abs(x) < F.outX + 4) continue;
      const ry = R() * 6, sc = 0.85 + R() * 0.25;
      for (const [geo, col] of [[pg.body, swim[i % swim.length]], [pg.head, skin[i % skin.length]]]) { const gg = geo.clone(); gg.scale(sc, sc, sc); gg.rotateY(ry); gg.translate(x, z > SHORE ? -0.55 : -0.12, z); parts.push(paint(gg, col)); }
    }
    for (let i = 0; i < 12; i++) {                              // swimmers: heads + shoulders out of the water
      const x = (R() - 0.5) * 110, z = SHORE + 4 + R() * 10;
      const h = new THREE.SphereGeometry(0.13, 8, 6); h.translate(x, SEA_Y + 0.18, z); parts.push(paint(h, skin[i % skin.length]));
      const s = new THREE.SphereGeometry(0.22, 8, 5); s.scale(1.3, 0.4, 0.8); s.translate(x, SEA_Y + 0.02, z); parts.push(paint(s, swim[i % swim.length]));
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), MAT.vcFlat));
  }
  /* ---------------- a wooden jetty out into the bay + rocks at the headlands ---------------- */
  {
    const jx = 44, z0 = SHORE - 3, z1 = SHORE + 22;
    put(MAT.wood, new THREE.BoxGeometry(2.4, 0.16, z1 - z0), jx, 0.18, (z0 + z1) / 2);
    for (let z = z0 + 1; z <= z1; z += 3) for (const s of [-1, 1]) put(MAT.wood, new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), jx + s * 1.1, -0.9, z);
    for (let z = z0 + 1; z <= z1; z += 3) for (const s of [-1, 1]) put(MAT.rope, new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), jx + s * 1.15, 0.7, z);
    for (const s of [-1, 1]) put(MAT.rope, new THREE.BoxGeometry(0.05, 0.05, z1 - z0), jx + s * 1.15, 1.18, (z0 + z1) / 2);
    put(MAT.glow, new THREE.SphereGeometry(0.18, 8, 6), jx - 1.15, 1.35, z1 - 0.5);
    for (let i = 0; i < 40; i++) {
      const sx = i % 2 ? 1 : -1, x = sx * (72 + R() * 26), z = SHORE - 14 + R() * 26;
      put(MAT.vcFlat, paint(new THREE.IcosahedronGeometry(0.6 + R() * 1.6, 0), R() < 0.5 ? 0x8a8478 : 0x6a6458), x, -0.2, z, R() * 6, R(), R());
    }
  }

  /* ---------------- rope fence on the ball boundary, floodlights, bar lights ---------------- */
  boundaryRail(F, putS, { postMat: MAT.wood, railMat: MAT.rope, step: 1.8, postW: 0.11 });
  const poles = floodPoles(ctx, g, { x: F.outX + 1.4, z: F.outZ + 1.6, base: -0.12, poleMat: MAT.wood, headMat: MAT.thatch, glowMat: MAT.glow, put: putS });
  {
    // bar lights strung between bamboo poles along the beach behind the court
    const pairs = [], zz = -(F.outZ + 8.6);
    for (const sx of [-1, 1]) {
      const xs = []; for (let x = F.outX + 3; x <= 62; x += 9.5) xs.push(sx * x);
      for (const x of xs) { put(MAT.wood, new THREE.CylinderGeometry(0.06, 0.08, 3.8, 6), x, 1.78, zz); put(MAT.glow, new THREE.SphereGeometry(0.1, 6, 5), x, 3.72, zz); }
      for (let i = 0; i < xs.length - 1; i++) pairs.push([new THREE.Vector3(xs[i], 3.5, zz), new THREE.Vector3(xs[i + 1], 3.5, zz)]);
    }
    g.add(festoons(pairs, { sag: 0.55, n: 12, colors: [0xffd27a, 0xff8a5a, 0x7fd8ff], size: 0.12 }));
  }

  /* ---------------- night: tiki torches along the shore, fire dancers ---------------- */
  const night = new THREE.Group(); fx.add(night);
  const torches = [], dancers = [];
  {
    for (let x = -64; x <= 64; x += 8) {
      if (Math.abs(x) < 3) continue;
      const z = SHORE - 3;
      put(MAT.wood, new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5), x, 0.78, z);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), MAT.fire); f.scale.y = 1.6; f.position.set(x, 1.85, z); night.add(f);
      torches.push([x, 1.9, z]);
    }
    night.add(makeEmbers(torches, uTime, 5));
    const pg = personGeometry();
    for (const x of [-22, 24]) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(mergeGeometries([paint(pg.body.clone(), 0x2a2a2a), paint(pg.head.clone(), 0x8a5a3a)]), MAT.vcFlat));
      const spin = new THREE.Group(); spin.position.y = 1.3;
      for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), MAT.fire); b.position.x = s * 0.75; spin.add(b); }
      d.add(spin);
      d.position.set(x, -0.12, SHORE - 6);
      night.add(d);
      dancers.push({ spin, ph: R() * 6 });
      night.add(makeEmbers([[x, 1.2, SHORE - 6]], uTime, 18, [1, 0.6, 0.2]));
    }
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    for (const fo of foams) {
      const k = Math.sin(time * 0.55 + fo.ph);
      fo.f.position.set(0, SEA_Y + 0.05, WATERLINE + 0.4 - k * 1.6);   // washes up the sand and back
      fo.f.material.opacity = 0.75 + 0.25 * Math.max(0, -k);
    }
    for (const cr of crests) {                                 // wave crests rolling in to the beach
      cr.t += dt / 7; if (cr.t > 1) cr.t -= 1;
      cr.m.position.set(cr.x, SEA_Y + 0.05, WATERLINE + 2 + (1 - cr.t) * 16);
      cr.m.material.opacity = 0.55 * Math.sin(Math.PI * cr.t);
    }
    for (const b of boats) {
      if (b.v) { b.x += b.v * dt; if (Math.abs(b.x) > 170) b.x = -Math.sign(b.x) * 170; b.ry = b.v > 0 ? 0 : Math.PI; }
      b.m.position.set(b.x, b.y + Math.sin(time * 1.2 + b.bob) * (b.still ? 0.03 : 0.08), b.z);
      b.m.rotation.set(Math.sin(time * 1.0 + b.bob) * 0.03, b.ry, Math.sin(time * 0.8 + b.bob) * 0.025);
    }
    if (night.visible) for (const d of dancers) d.spin.rotation.z = time * 9 + d.ph;
  }
  function setTime(tod) { night.visible = tod !== 'day'; }
  return { g, fx, update, setTime, fog: { day: [90, 700], night: [60, 380] } };
}
