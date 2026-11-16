// Day/night life for the Temple Courtyard (the courtyard itself is built in main.js — this only adds what lives in it).
// DAY: pigeons pecking on the paving, monks sweeping by the halls, saffron robes drying between the gallery columns,
//      a flock circling over the roofs. NIGHT: candle rows on the hall steps, incense embers at the stone lanterns, fireflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFireflies, makeEmbers, makePeckers, makeFlock, personGeometry } from './life.js';

export function buildTempleLife(ctx) {
  const { F } = ctx;
  const y0 = -F.deckDrop;
  const g = new THREE.Group(); g.name = 'temple-life';
  const fx = new THREE.Group(); g.add(fx);
  const day = new THREE.Group(), night = new THREE.Group();
  g.add(day); fx.add(night);
  const uTime = { value: 0 };

  /* ---------------- DAY ---------------- */
  const spots = [];
  for (const [cx, cz] of [[17, 6.5], [-17, -6.5], [20, -2], [-20, 2.5], [8, 12.4], [-8, -12.4]]) {
    if (Math.abs(cx) < F.outX + 0.6 && Math.abs(cz) < F.outZ + 0.6) continue;
    for (let i = 0; i < 6; i++) spots.push([cx + (Math.random() - 0.5) * 2.4, y0, cz + (Math.random() - 0.5) * 1.8, Math.random() * 6]);
  }
  const pigeons = makePeckers(spots, 0x8c90a2);
  day.add(pigeons.g);
  const flock = makeFlock(9, 0x2a2a34);
  flock.g.scale.setScalar(1.4);
  day.add(flock.g);

  // monks sweeping near each hall's steps
  const monkParts = personGeometry({ robe: true });
  const robe = new THREE.MeshStandardMaterial({ color: 0xe07a1a, roughness: 0.8, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9c6b47, roughness: 0.6 });
  const broomGeo = mergeGeometries([
    (() => { const s = new THREE.CylinderGeometry(0.018, 0.018, 1.3, 5); s.translate(0, 0.65, 0); return s.toNonIndexed(); })(),
    (() => { const b = new THREE.ConeGeometry(0.16, 0.35, 6); b.rotateX(Math.PI); b.translate(0, 0.0, 0); return b.toNonIndexed(); })(),
  ].map((x) => { x.deleteAttribute('uv'); return x; }));
  const broomMat = new THREE.MeshStandardMaterial({ color: 0xb8954e, roughness: 0.9 });
  const monks = [];
  for (const [x, z, r] of [[19.2, 5.2, -1.2], [-19.2, -5.2, 1.9], [21.5, -6.4, -0.6], [-21.5, 6.4, 2.6]]) {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(monkParts.body, robe), new THREE.Mesh(monkParts.head, skin));
    const broom = new THREE.Mesh(broomGeo, broomMat);
    broom.position.set(0.25, 0.85, 0.35); broom.rotation.set(0.9, 0, 0.2);
    m.add(broom);
    m.position.set(x, y0, z); m.rotation.y = r;
    day.add(m);
    monks.push({ m, broom, ph: Math.random() * 6, r });
  }

  // saffron robes drying on a line between gallery columns (both sides)
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe8862a, roughness: 0.85, side: THREE.DoubleSide });
  cloth.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float hang = 0.5 - position.y;     // 0 at the line, 1 at the hem
       transformed.z += sin(uTime * 1.6 + instanceMatrix[3].x * 0.9) * 0.12 * hang * hang;`);
  };
  const clothGeo = new THREE.PlaneGeometry(0.75, 1.0, 1, 4); clothGeo.translate(0, -0.5, 0);
  const lines = [];
  for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) lines.push([7.9 + i * 0.95, 2.35, sz * 14.05, 0.9 + (i % 2) * 0.25]);
  const clothes = new THREE.InstancedMesh(clothGeo, cloth, lines.length);
  const o = new THREE.Object3D();
  lines.forEach(([x, y, z, s], i) => { o.position.set(x, y0 + y, z); o.rotation.set(0, 0, 0); o.scale.set(1, s, 1); o.updateMatrix(); clothes.setMatrixAt(i, o.matrix); });
  clothes.computeBoundingSphere();
  day.add(clothes);
  const rope = new THREE.LineBasicMaterial({ color: 0x3a2a1a });
  for (const sz of [-1, 1]) day.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(7.5, y0 + 2.4, sz * 14.05), new THREE.Vector3(12.5, y0 + 2.4, sz * 14.05)]), rope));

  /* ---------------- NIGHT ---------------- */
  // rows of little candles along the front steps of both halls
  {
    const cg = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6); cg.translate(0, 0.06, 0);
    const fg = new THREE.SphereGeometry(0.035, 6, 4); fg.scale(1, 1.6, 1); fg.translate(0, 0.17, 0);
    const pts = [];
    for (const sx of [-1, 1]) for (const [dx, dy] of [[-4.0, 0.66], [-5.2, 0.33]]) for (let z = -2.4; z <= 2.41; z += 0.4) pts.push([sx * (27.4 + dx), y0 + dy, z]);
    const candles = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xf5ecd8, roughness: 0.6 }), pts.length);
    const flames = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc56a).multiplyScalar(3) }), pts.length);
    pts.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.scale.setScalar(1); o.updateMatrix(); candles.setMatrixAt(i, o.matrix); flames.setMatrixAt(i, o.matrix); });
    candles.computeBoundingSphere(); flames.computeBoundingSphere();
    night.add(candles, flames);
  }
  night.add(makeEmbers([[21, y0 + 1.5, 3.6], [21, y0 + 1.5, -3.6], [-21, y0 + 1.5, 3.6], [-21, y0 + 1.5, -3.6]], uTime, 8, [1.0, 0.7, 0.35]));
  {
    const pts = [];
    for (const [x, z] of [[19.5, 10.6], [-19.5, 10.6], [19.5, -10.6], [-19.5, -10.6], [6, 11.8], [-6, 11.8], [6, -11.8], [-6, -11.8]])
      for (let i = 0; i < 9; i++) pts.push([x + (Math.random() - 0.5) * 5, y0 + 0.6 + Math.random() * 2.6, z + (Math.random() - 0.5) * 4]);
    const ff = makeFireflies(pts, uTime);
    night.add(ff);
  }

  let time = 0;
  function update(dt) {
    time += dt;
    uTime.value = time;
    if (day.visible) {
      pigeons.update(dt, time);
      flock.g.position.set(Math.cos(time * 0.08) * 34, 19 + Math.sin(time * 0.3) * 2, Math.sin(time * 0.08) * 22);
      flock.g.rotation.y = -time * 0.08 + Math.PI;
      flock.flap(time);
      for (const mk of monks) {
        const s = Math.sin(time * 1.8 + mk.ph);
        mk.broom.rotation.z = 0.2 + s * 0.45;
        mk.m.rotation.y = mk.r + s * 0.12;
      }
    }
  }
  function setTime(tod) {
    day.visible = tod === 'day';
    night.visible = tod !== 'day';
  }
  return { g, fx, update, setTime };
}
