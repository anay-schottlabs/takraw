// JUNGLE WATERFALL — a clearing in the rainforest. On the +z side a mossy cliff with a tiered waterfall dropping into a pool
// (spray + mist at the bottom); giant buttress-rooted trees with hanging vines, ferns and elephant-ear plants all round.
// DAY: shafts of light, hornbills crossing, butterflies. NIGHT: fireflies everywhere, glowing mushrooms, bamboo lanterns.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, makeWater, floodPoles, bambooFence, paint, vcMat, treeClumps } from './props.js';
import { makeFireflies, makeFlyers, makeFlock } from './life.js';

export function buildJungle(ctx) {
  const { F, xf, makeBatch, texLoader, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'jungle';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(6262);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0x9aa84a, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    shroom: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5affd8).multiplyScalar(1.6) }),
    vc: vcMat({ flatShading: true }),
  };
  const POOL_Z = F.outZ + 7;                // near edge of the pool
  const CLIFF_Z = F.outZ + 19;

  /* ---------------- jungle floor ---------------- */
  {
    const geo = new THREE.PlaneGeometry(360, 300, 90, 75); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.max(0, Math.max(Math.abs(x) - F.outX - 4, Math.abs(z) - F.outZ - 4));
      const inPool = z > POOL_Z - 1 && z < CLIFF_Z && Math.abs(x) < 30;
      p.setY(i, inPool ? -1.4 : -0.12 + Math.min(4, d * 0.06) * (0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.06)));
      c.set(d < 1 ? 0x6a5a3a : 0x3a4a26).lerp(new THREE.Color(0x2a3a1e), Math.max(0, Math.sin(x * 0.4) * Math.cos(z * 0.33)) * 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    m.receiveShadow = true;
    g.add(m);
  }

  /* ---------------- the cliff + waterfall + pool ---------------- */
  const falls = [];
  {
    // cliff: a jagged rock wall with ledges, mossy on top
    const geo = new THREE.PlaneGeometry(90, 34, 36, 14);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + 17;
      const ledge = y > 9 && y < 10.5 ? 1.6 : 0;
      p.setXYZ(i, x, y - 1.4, -(Math.sin(x * 0.3) * 1.2 + Math.sin(y * 0.7 + x * 0.1) * 0.9 + (R() - 0.5) * 1.1 + ledge + Math.abs(x) * 0.08));
    }
    geo.translate(0, 0, CLIFF_Z);
    geo.computeVertexNormals();
    const ng = geo.toNonIndexed(), pp = ng.attributes.position, cc = new Float32Array(pp.count * 3), c = new THREE.Color();
    for (let t = 0; t < pp.count; t += 3) {
      const y = (pp.getY(t) + pp.getY(t + 1) + pp.getY(t + 2)) / 3;
      c.set(y > 26 || (y > 8.6 && y < 10.6) ? 0x4a6a32 : 0x6a6458).offsetHSL(0, 0, (R() - 0.5) * 0.08);
      for (let k = 0; k < 3; k++) cc.set([c.r, c.g, c.b], (t + k) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(cc, 3)); ng.deleteAttribute('uv');
    g.add(new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide })));
    // pool
    const pool = makeWater(texLoader, uTime, { w: 64, d: CLIFF_Z - POOL_Z + 6, color: 0x2a5a52, opacity: 0.9, repeat: [7, 3] });
    pool.position.set(0, -0.6, (POOL_Z + CLIFF_Z) / 2 + 1);
    g.add(pool);
    // falling water: stacked planes with a scrolling streak texture (two tiers), + white spray at each landing
    const tex = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
      const x = cv.getContext('2d');
      x.fillStyle = 'rgba(210,235,245,0.55)'; x.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${(0.4 + Math.random() * 0.6).toFixed(2)})`; x.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 60); }
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    for (const [x, top, bottom, w, z] of [[14, 31, 10.2, 5.2, CLIFF_Z - 1.6], [16.6, 10.2, -0.6, 7.5, CLIFF_Z - 3.2], [-14, 31, 10.2, 5.2, CLIFF_Z - 1.6], [-16.6, 10.2, -0.6, 7.5, CLIFF_Z - 3.2]]) {
      for (let k = 0; k < 2; k++) {
        const t = tex.clone(); t.repeat.set(w / 3, (top - bottom) / 10); t.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, top - bottom), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: k ? 0.6 : 0.85, side: THREE.DoubleSide }));
        m.position.set(x + k * 0.3, (top + bottom) / 2, z - k * 0.15); m.renderOrder = 4;
        g.add(m);
        falls.push({ t, speed: k ? 1.1 : 1.6 });
      }
    }
  }
  // spray + mist where the water lands
  const spray = [];
  {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xeaf6ff, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(mat.clone()); fx.add(s);
      const lower = i % 2 === 0;
      const side = i % 4 < 2 ? 1 : -1;
      spray.push({ s, src: lower ? [side * 16.6 + (R() - 0.5) * 6, -0.5, CLIFF_Z - 3.6] : [side * 14 + (R() - 0.5) * 4, 10.4, CLIFF_Z - 2], t: R() });
    }
  }

  /* ---------------- rainforest giants, vines, ferns, elephant ears ---------------- */
  {
    const trunk = [], canopy = [], roots = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const trees = [];
    for (let i = 0; i < 46; i++) {
      const a = R() * Math.PI * 2, rr = 1 + R() * 0.9;
      let x = Math.cos(a) * (F.outX + 12) * rr, z = Math.sin(a) * (F.outZ + 10) * rr;
      if (z > POOL_Z - 2 && Math.abs(x) < 34) continue;                      // keep the falls in view
      if (Math.abs(z) < 8 && Math.abs(x) < F.outX + 10) continue;
      trees.push([x, z, 14 + R() * 10, 0.5 + R() * 0.35]);
    }
    for (const [x, z, h, r] of trees) {
      const t = new THREE.CylinderGeometry(r * 0.7, r, h, 7); t.translate(x, h / 2 - 0.12, z); trunk.push(t.toNonIndexed());
      for (let k = 0; k < 5; k++) { const b = new THREE.ConeGeometry(r * 0.6, 2.4, 3); b.rotateZ(0.6); b.rotateY((k / 5) * Math.PI * 2 + R()); b.translate(x, 0.9, z); roots.push(b.toNonIndexed()); }
      for (let k = 0; k < 4; k++) { const c = new THREE.IcosahedronGeometry(3 + R() * 2.5, 0); c.scale(1.4, 0.55, 1.4); c.translate(x + (R() - 0.5) * 5, h - 0.5 + R() * 2, z + (R() - 0.5) * 5); canopy.push(c); }
    }
    for (const arr of [trunk, roots]) for (const a of arr) a.deleteAttribute('uv');
    g.add(new THREE.Mesh(mergeGeometries([...trunk, ...roots]), MAT.bark));
    const can = new THREE.Mesh(mergeGeometries(canopy), new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.85, flatShading: true }));
    g.add(can);
    // hanging vines (thin swaying strands from the canopy)
    const vines = [];
    trees.slice(0, 30).forEach(([x, z, h]) => { for (let k = 0; k < 3; k++) { const l = 4 + R() * 7; const v = new THREE.CylinderGeometry(0.03, 0.03, l, 3); v.translate(0, -l / 2, 0); v.translate(x + (R() - 0.5) * 6, h - 0.6, z + (R() - 0.5) * 6); vines.push(v.toNonIndexed()); } });
    for (const v of vines) v.deleteAttribute('uv');
    const vm = new THREE.MeshStandardMaterial({ color: 0x3f5a26, roughness: 0.9 });
    vm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += sin(uTime * 0.8 + position.x * 0.3 + position.z * 0.2) * 0.04 * (20.0 - position.y);`);
    };
    g.add(new THREE.Mesh(mergeGeometries(vines), vm));
    // understory: lower tree clumps, ferns, elephant ears
    const clumps = [];
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2, rr = 1.05 + R() * 1.2, x = Math.cos(a) * (F.outX + 9) * rr, z = Math.sin(a) * (F.outZ + 7) * rr;
      if (z > POOL_Z - 2 && Math.abs(x) < 32) continue;
      if (Math.abs(z) < 9 && Math.abs(x) < F.outX + 9) continue;
      clumps.push([x, -0.12, z, 0.9 + R() * 0.9, R() * 6]);
    }
    g.add(treeClumps(clumps, { leaf: 0x355f2a, scaleY: 0.8 }));
    const fern = [];
    for (let k = 0; k < 9; k++) { const f = new THREE.PlaneGeometry(0.35, 1.6, 1, 4); const pa = f.attributes.position; for (let j = 0; j < pa.count; j++) { const y = pa.getY(j) + 0.8; pa.setXYZ(j, pa.getX(j) * (1 - y / 1.9), -0.25 * y * y + 0.6 * y, y); } f.rotateY((k / 9) * Math.PI * 2); fern.push(f.toNonIndexed()); }
    const ear = [];
    for (let k = 0; k < 4; k++) { const l = new THREE.CircleGeometry(0.7, 8); l.scale(0.7, 1, 1); l.rotateX(-0.9); l.translate(0, 1.2 + k * 0.15, 0.6); l.rotateY((k / 4) * Math.PI * 2); ear.push(l.toNonIndexed()); const st = new THREE.CylinderGeometry(0.03, 0.04, 1.3, 4); st.translate(0, 0.65, 0); st.rotateY((k / 4) * Math.PI * 2); ear.push(st.toNonIndexed()); }
    for (const a of [...fern, ...ear]) a.deleteAttribute('uv');
    const place = (geo, color, n, ring) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), n);
      const o = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        let x, z;
        do { const a = R() * Math.PI * 2, rr = ring[0] + R() * ring[1]; x = Math.cos(a) * (F.outX + 4) * rr; z = Math.sin(a) * (F.outZ + 3) * rr; } while ((Math.abs(x) < F.outX + 1.2 && Math.abs(z) < F.outZ + 1.2) || (z > POOL_Z - 0.5 && z < CLIFF_Z && Math.abs(x) < 29));
        o.position.set(x, -0.12, z); o.rotation.set(0, R() * 6, 0); o.scale.setScalar(0.8 + R() * 0.8); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      }
      im.computeBoundingSphere();
      g.add(im);
    };
    place(mergeGeometries(fern), 0x4f8a32, 140, [1.0, 1.4]);
    place(mergeGeometries(ear), 0x3f7a2a, 50, [1.05, 1.0]);
    // mossy boulders around the pool
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI, x = Math.cos(a) * 30, z = POOL_Z - 0.5 + Math.sin(a) * 2 + (i % 3) * 0.6;
      put(MAT.vc, paint(new THREE.IcosahedronGeometry(0.6 + R() * 0.9, 0), R() < 0.5 ? 0x6a6458 : 0x4a6a32), x, -0.2, z, R() * 6, R(), R());
    }
    for (let i = 0; i < 18; i++) put(MAT.vc, paint(new THREE.IcosahedronGeometry(0.5 + R() * 1.1, 0), 0x6a6458), (R() - 0.5) * 54, -0.5, POOL_Z + 1 + R() * 9, R() * 6, R(), R());
  }

  /* ---------------- fence, floodlights, lanterns ---------------- */
  bambooFence(F, putS, { light: 0xa8b04a, dark: 0x6f7a32 });
  floodPoles(ctx, g, { x: F.outX + 1.5, z: F.outZ + 1.7, base: -0.12, poleMat: MAT.bamboo, headMat: MAT.wood, glowMat: MAT.glow, put: putS });
  const lanternSpots = [];
  for (let i = 0; i < 10; i++) {
    const s = i % 2 ? 1 : -1, x = -F.outX - 2 + i * ((F.outX * 2 + 4) / 9), z = s > 0 ? F.outZ + 3 : -(F.outZ + 3);
    put(MAT.bamboo, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), x, 1.08, z);
    put(MAT.glow, new THREE.SphereGeometry(0.2, 8, 6), x, 2.2, z);
    lanternSpots.push([x, z]);
  }

  /* ---------------- day: hornbills + butterflies + light shafts ---------------- */
  const dayLife = new THREE.Group(); g.add(dayLife);
  const flock = makeFlock(3, 0x1c1814); flock.g.scale.setScalar(2.2); dayLife.add(flock.g);
  const bf = makeFlyers(Array.from({ length: 14 }, () => [(R() - 0.5) * 50, 1 + R() * 1.4, (R() < 0.5 ? -1 : 1) * (F.outZ + 4 + R() * 6)]), 'butterfly');
  dayLife.add(bf.g);
  {
    const shaft = new THREE.CylinderGeometry(1.2, 2.4, 22, 8, 1, true);
    const sm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xfff2c8, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z] of [[-18, -14], [16, -16], [26, 10], [-28, 8], [4, -20]]) { const m = new THREE.Mesh(shaft, sm); m.position.set(x, 10, z); m.rotation.z = 0.25; m.rotation.x = -0.15; dayLife.add(m); }
  }
  /* ---------------- night: fireflies, glowing mushrooms ---------------- */
  const nightLife = new THREE.Group(); fx.add(nightLife);
  {
    const pts = [];
    for (let i = 0; i < 220; i++) {
      let x, z;
      do { x = (R() - 0.5) * 80; z = (R() - 0.5) * 60; } while (Math.abs(x) < F.outX && Math.abs(z) < F.outZ);
      pts.push([x, 0.4 + R() * 3.5, z]);
    }
    nightLife.add(makeFireflies(pts, uTime, [0.7, 1.0, 0.5]));
    const cap = new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), stem = new THREE.CylinderGeometry(0.04, 0.05, 0.18, 5);
    const shroomGeo = mergeGeometries([(() => { const c = cap.clone(); c.translate(0, 0.18, 0); c.deleteAttribute('uv'); return c.toNonIndexed(); })(), (() => { const s = stem.clone(); s.translate(0, 0.09, 0); s.deleteAttribute('uv'); return s.toNonIndexed(); })()]);
    const im = new THREE.InstancedMesh(shroomGeo, MAT.shroom, 60);
    const o = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      let x, z; do { x = (R() - 0.5) * 60; z = (R() - 0.5) * 44; } while (Math.abs(x) < F.outX + 1 && Math.abs(z) < F.outZ + 1);
      o.position.set(x, -0.12, z); o.scale.setScalar(0.6 + R() * 1.2); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    }
    im.computeBoundingSphere();
    nightLife.add(im);
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    for (const f of falls) f.t.offset.y = (f.t.offset.y + dt * f.speed) % 1;
    if (!fx.visible) return;
    for (const sp of spray) {
      sp.t += dt / 1.8; if (sp.t > 1) sp.t -= 1;
      sp.s.position.set(sp.src[0] + Math.sin(sp.t * 4 + sp.src[0]) * 0.6, sp.src[1] + sp.t * 2.4, sp.src[2] - sp.t * 1.5);
      sp.s.scale.setScalar(1.2 + sp.t * 3.5);
      sp.s.material.opacity = 0.38 * Math.sin(Math.PI * sp.t);
    }
    if (dayLife.visible) {
      bf.update(dt, time);
      const t = (time * 0.025) % 1;
      flock.g.position.set((t * 2 - 1) * 90, 22 + Math.sin(time * 0.5) * 2, -10 + Math.sin(t * 6) * 6);
      flock.g.rotation.y = Math.PI / 2; flock.flap(time * 0.6);
    }
  }
  function setTime(tod) {
    const night = tod !== 'day';
    dayLife.visible = !night; nightLife.visible = night;
  }
  return { g, fx, update, setTime, fog: { day: [40, 220], night: [26, 140] } };
}
