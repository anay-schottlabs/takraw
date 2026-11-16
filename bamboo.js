// BAMBOO FOREST — the court in a clearing inside a towering, swaying bamboo grove. A stone path leads off into the grove past each
// end (lined with stone lanterns), a little spirit-house shrine with garlands sits by the court, leaf litter everywhere.
// DAY: shafts of sunlight with dust drifting in them. NIGHT: paper lanterns hung from the stalks, cool moonbeams, fireflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, floodPoles, bambooFence, paint, vcMat } from './props.js';
import { makeFireflies, makeEmbers } from './life.js';

export function buildBamboo(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'bamboo';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(7373);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const MAT = {
    stone: new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x2c1805 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0x8fa83f, roughness: 0.55 }),
    vc: vcMat({ flatShading: true }),
  };
  const PATH_W = 2.6;
  const onPath = (x, z) => Math.abs(z) < PATH_W / 2 + 1.2 && Math.abs(x) > F.outX + 1;
  const clearing = (x, z, m = 0) => Math.abs(x) < F.outX + 3 + m && Math.abs(z) < F.outZ + 3 + m;

  /* ---------------- floor: earth + leaf litter, the stone path ---------------- */
  {
    const geo = new THREE.PlaneGeometry(300, 260, 100, 86); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, -0.12 + (clearing(x, z) ? 0 : 0.25 * Math.sin(x * 0.2) * Math.sin(z * 0.17)));
      c.set(clearing(x, z, -1) ? 0x7a6448 : 0x6a5a34).lerp(new THREE.Color(R() < 0.5 ? 0xa88a4a : 0x4a5a2a), R() * 0.45);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    m.receiveShadow = true;
    g.add(m);
    for (const sx of [-1, 1]) for (let x = F.outX + 1.5; x < 140; x += 1.1) {
      put(MAT.vc, paint(new THREE.CylinderGeometry(0.42 + R() * 0.2, 0.48, 0.12, 7), [0x8a857a, 0x9a948a, 0x7a766c][Math.floor(R() * 3)]), sx * x, -0.08, (R() - 0.5) * 1.4, R() * 3);
    }
  }

  /* ---------------- the grove: instanced swaying culms with nodes + leaf sprays ---------------- */
  const culms = [];
  for (let i = 0; i < 1100 && culms.length < 760; i++) {
    // dense near the clearing, thinning out with distance
    const a = R() * Math.PI * 2, d = 3 + Math.pow(R(), 1.7) * 95;
    const x = Math.cos(a) * (F.outX + 3 + d), z = Math.sin(a) * (F.outZ + 3 + d * 0.85);
    if (clearing(x, z, 0.5) || onPath(x, z)) continue;
    if (Math.abs(z) < F.outZ + 4 && Math.abs(x) < F.hl + 13) continue;          // keep the end cameras' sightlines clear
    if (Math.hypot(x, z) > 135) continue;
    culms.push([x, z, 12 + R() * 11, 0.07 + R() * 0.07, R() * 6]);
  }
  {
    const stalk = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); stalk.translate(0, 0.5, 0);
    const nodes = []; for (let k = 1; k < 7; k++) { const n = new THREE.CylinderGeometry(1.25, 1.25, 0.012, 6, 1, true); n.translate(0, k / 7, 0); nodes.push(n.toNonIndexed()); }
    const sGeo = mergeGeometries([stalk.toNonIndexed(), ...nodes]);
    const sway = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
          float h = position.y;                                      // 0..1 up the culm
          transformed.x += sin(uTime * 0.7 + ph) * 0.9 * h * h / max(0.05, length(instanceMatrix[0].xyz));
          transformed.z += cos(uTime * 0.55 + ph * 1.3) * 0.6 * h * h / max(0.05, length(instanceMatrix[2].xyz));`);
      };
      return m;
    };
    const im = new THREE.InstancedMesh(sGeo, sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })), culms.length);
    const leaves = []; for (let k = 0; k < 3; k++) { const l = new THREE.IcosahedronGeometry(1, 0); l.scale(1.5, 0.35, 0.9); l.rotateY(k * 1.3); l.translate(Math.cos(k * 1.3) * 0.9, 0.62 + k * 0.08, Math.sin(k * 1.3) * 0.9); leaves.push(l); }
    const lGeo = mergeGeometries(leaves);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
    leafMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        transformed.x += sin(uTime * 0.7 + ph) * 0.12;
        transformed.z += cos(uTime * 0.55 + ph * 1.3) * 0.08;`);
    };
    const il = new THREE.InstancedMesh(lGeo, leafMat, culms.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    culms.forEach(([x, z, h, r, ry], i) => {
      o.position.set(x, -0.12, z); o.rotation.set((R() - 0.5) * 0.06, ry, (R() - 0.5) * 0.06); o.scale.set(r, h, r); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, c.set(R() < 0.75 ? 0x8fa83f : 0xb8b04a).offsetHSL(0, 0, (R() - 0.5) * 0.1));
      // leaf spray near the top, sized independently of the culm's skinny scale
      o.position.set(x, -0.12 + h * (0.72 + R() * 0.2), z); o.rotation.set(0, ry, 0); o.scale.set(1.6 + R(), 2 + R(), 1.6 + R()); o.updateMatrix();
      il.setMatrixAt(i, o.matrix);
      il.setColorAt(i, c.set(0x4f8a2e).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.12));
    });
    im.computeBoundingSphere(); il.computeBoundingSphere();
    g.add(im, il);
  }

  /* ---------------- shrine + stone lanterns along the path ---------------- */
  {
    const sx = -(F.outX - 3), sz = -(F.outZ + 2.6);
    put(MAT.stone, new THREE.BoxGeometry(1.2, 0.3, 1.2), sx, 0.03, sz);
    put(MAT.red, new THREE.CylinderGeometry(0.08, 0.1, 1.3, 6), sx, 0.8, sz);
    put(MAT.vc, paint(new THREE.BoxGeometry(0.9, 0.12, 0.9), 0xd8c08a), sx, 1.5, sz);
    put(MAT.vc, paint(new THREE.BoxGeometry(0.62, 0.55, 0.62), 0xf2e8d0), sx, 1.85, sz);
    put(MAT.red, new THREE.ConeGeometry(0.6, 0.55, 4), sx, 2.38, sz, Math.PI / 4);
    put(MAT.gold, new THREE.ConeGeometry(0.06, 0.4, 6), sx, 2.8, sz);
    for (let k = 0; k < 6; k++) put(MAT.vc, paint(new THREE.SphereGeometry(0.06, 5, 4), [0xff8a2a, 0xfff2c0, 0xff3f6a][k % 3]), sx - 0.3 + k * 0.12, 1.62, sz + 0.47);
    put(MAT.glow, new THREE.PlaneGeometry(0.3, 0.3), sx, 1.85, sz + 0.32);
  }
  const lanterns = [];
  {
    const base = new THREE.BoxGeometry(0.5, 0.2, 0.5), shaft = new THREE.CylinderGeometry(0.1, 0.13, 0.7, 7), light = new THREE.BoxGeometry(0.3, 0.28, 0.3), roof = new THREE.ConeGeometry(0.38, 0.34, 4);
    for (const sx of [-1, 1]) for (let x = F.outX + 4; x < 60; x += 7) for (const s of [-1, 1]) {
      const X = sx * x, Z = s * (PATH_W / 2 + 0.7);
      put(MAT.stone, base, X, -0.02, Z); put(MAT.stone, shaft, X, 0.43, Z); put(MAT.glow, light, X, 0.92, Z); put(MAT.stone, roof, X, 1.24, Z, Math.PI / 4);
      lanterns.push([X, Z]);
    }
  }

  /* ---------------- fence + floodlights ---------------- */
  bambooFence(F, putS);
  floodPoles(ctx, g, { x: F.outX + 1.5, z: F.outZ + 1.7, base: -0.12, poleMat: MAT.bamboo, headMat: MAT.stone, glowMat: MAT.glow, put: putS });

  /* ---------------- DAY: sun shafts + dust motes ---------------- */
  const dayLife = new THREE.Group(); g.add(dayLife);
  {
    const shaft = new THREE.CylinderGeometry(0.9, 2.2, 26, 8, 1, true);
    const sm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z] of [[-16, -12], [14, -15], [22, 11], [-24, 12], [3, 16], [-6, -18], [34, -4], [-36, 3]]) {
      const m = new THREE.Mesh(shaft, sm); m.position.set(x, 11, z); m.rotation.set(-0.15, 0, 0.3); dayLife.add(m);
    }
    const pts = [];
    for (let i = 0; i < 160; i++) { const x = (R() - 0.5) * 70, z = (R() - 0.5) * 50; if (!clearing(x, z)) pts.push([x, 0.5 + R() * 6, z]); }
    dayLife.add(makeFireflies(pts, uTime, [0.55, 0.5, 0.4]));                  // drifting dust in the light (dim, warm)
  }
  /* ---------------- NIGHT: paper lanterns hung in the grove, moonbeams, fireflies ---------------- */
  const nightLife = new THREE.Group(); fx.add(nightLife);
  {
    const lg = new THREE.SphereGeometry(0.28, 10, 8); lg.scale(1, 1.3, 1);
    const pick = culms.filter(([x, z]) => Math.abs(x) < 40 && Math.abs(z) < 30).slice(0, 46);
    const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.6) }), pick.length);
    const o = new THREE.Object3D(), cols = [0xff5a2e, 0xffae42, 0xffd27a, 0xff7fbf].map((c) => new THREE.Color(c));
    pick.forEach(([x, z], i) => { o.position.set(x + 0.3, 2.6 + R() * 2.4, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, cols[i % cols.length]); });
    im.computeBoundingSphere();
    nightLife.add(im);
    const beam = new THREE.CylinderGeometry(0.7, 1.8, 26, 8, 1, true);
    const bm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9fb8ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z] of [[-18, 13], [16, -14], [28, 8], [-30, -6]]) { const m = new THREE.Mesh(beam, bm); m.position.set(x, 11, z); m.rotation.set(0.15, 0, -0.25); nightLife.add(m); }
    const pts = [];
    for (let i = 0; i < 180; i++) { const x = (R() - 0.5) * 70, z = (R() - 0.5) * 54; if (!clearing(x, z, -1)) pts.push([x, 0.4 + R() * 3, z]); }
    nightLife.add(makeFireflies(pts, uTime));
    nightLife.add(makeEmbers([[-(F.outX - 3), 1.7, -(F.outZ + 2.2)]], uTime, 8, [1, 0.8, 0.6]));   // incense at the shrine
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  let time = 0;
  function update(dt) { time += dt; uTime.value = time; }
  function setTime(tod) { const night = tod !== 'day'; dayLife.visible = !night; nightLife.visible = night; }
  return { g, fx, update, setTime, fog: { day: [24, 130], night: [18, 105] } };
}
