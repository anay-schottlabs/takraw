// Small living things shared by the maps: fireflies, rising embers, dragonflies + butterflies, pecking birds, a circling flock,
// and simple low-poly people (monks, farmers). All cheap: a few draw calls each, animated on the CPU or in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const nonIdx = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

/** Twinkling fireflies drifting around fixed spots. `pts` = [[x,y,z], …]. */
export function makeFireflies(pts, uTime, color = [1.0, 0.92, 0.45]) {
  const pos = [], seed = [];
  for (const [x, y, z] of pts) { pos.push(x, y, z); seed.push(Math.random()); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform float uScale; attribute float seed; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.45 + seed * 12.1) * 0.9, sin(uTime * 0.8 + seed * 7.3) * 0.35, cos(uTime * 0.4 + seed * 5.7) * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = pow(0.5 + 0.5 * sin(uTime * (1.4 + seed) + seed * 31.0), 3.0);
        gl_PointSize = uScale * (0.16 / -mv.z) * 900.0;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(${color.map((c) => c.toFixed(2)).join(',')}) * 2.2 * a, a);
      }`,
  });
  const pts3 = new THREE.Points(geo, mat);
  pts3.frustumCulled = false;
  return pts3;
}

/** Sparks / embers that rise from `sources` ([[x,y,z],…]), loop forever. Additive points animated in the shader. */
export function makeEmbers(sources, uTime, perSource = 14, color = [1.0, 0.55, 0.2]) {
  const pos = [], seed = [];
  for (const [x, y, z] of sources) for (let i = 0; i < perSource; i++) { pos.push(x, y, z); seed.push(Math.random()); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime },
    vertexShader: `
      uniform float uTime; attribute float seed; varying float vA;
      void main() {
        float t = fract(uTime * (0.18 + seed * 0.12) + seed * 7.0);
        vec3 p = position + vec3(sin(t * 6.0 + seed * 20.0) * 0.4 * t, t * 4.5, cos(t * 5.0 + seed * 13.0) * 0.4 * t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
        gl_PointSize = (0.09 / -mv.z) * 900.0;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(${color.map((c) => c.toFixed(2)).join(',')}) * 2.5 * a, a);
      }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

/** Dragonflies (hover, then dart) or butterflies (flutter + wander) around `homes` ([[x,y,z],…]). Instanced: 2 draw calls. */
export function makeFlyers(homes, kind = 'dragonfly') {
  const g = new THREE.Group();
  const dragon = kind === 'dragonfly';
  const S = dragon ? 1.6 : 1.8;
  const bodyGeo = new THREE.CylinderGeometry(0.012 * S, 0.008 * S, (dragon ? 0.16 : 0.07) * S, 4); bodyGeo.rotateX(Math.PI / 2);
  const wingGeo = new THREE.PlaneGeometry((dragon ? 0.13 : 0.09) * S, (dragon ? 0.035 : 0.08) * S); wingGeo.translate((dragon ? 0.065 : 0.045) * S, 0, 0); wingGeo.rotateX(-Math.PI / 2);
  const cols = dragon ? [0x3fa0ff, 0xff4a3a, 0x50e0a0] : [0xffb02e, 0xffffff, 0x7fb6ff, 0xff7fbf];
  const nW = dragon ? 4 : 2;
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.4 }), homes.length);
  const wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: dragon, opacity: dragon ? 0.6 : 1, side: THREE.DoubleSide, roughness: 0.3 }), homes.length * nW);
  bodies.frustumCulled = wings.frustumCulled = false;
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color();
  const list = homes.map(([x, y, z], i) => {
    bodies.setColorAt(i, c.set(cols[i % cols.length]));
    for (let k = 0; k < nW; k++) wings.setColorAt(i * nW + k, dragon ? c.set(0xdfefff) : c.set(cols[i % cols.length]));
    return { home: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(x, y, z), t: Math.random() * 3, ph: Math.random() * 6, yaw: 0 };
  });
  g.add(bodies, wings);
  const dir = new THREE.Vector3(), o = new THREE.Object3D(), w = new THREE.Object3D();
  function update(dt, time) {
    list.forEach((d, i) => {
      d.t -= dt;
      if (d.t <= 0) {
        d.t = dragon ? 0.6 + Math.random() * 1.8 : 1.5 + Math.random() * 2.5;
        d.tgt.set(d.home.x + (Math.random() - 0.5) * (dragon ? 5 : 3), d.home.y + (Math.random() - 0.3) * 0.8, d.home.z + (Math.random() - 0.5) * (dragon ? 5 : 3));
      }
      dir.subVectors(d.tgt, d.pos);
      d.pos.addScaledVector(dir, Math.min(1, dt * (dragon ? 5 : 1.2)));
      if (dir.lengthSq() > 1e-4) d.yaw = Math.atan2(dir.x, dir.z);
      o.position.copy(d.pos);
      if (!dragon) o.position.y += Math.sin(time * 9 + d.ph) * 0.05;
      o.rotation.set(0, d.yaw, 0); o.scale.setScalar(1); o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix);
      const flap = dragon ? Math.sin(time * 60 + d.ph) * 0.35 : Math.sin(time * 14 + d.ph) * 0.9;
      for (let k = 0; k < nW; k++) {
        const side = k % 2 ? 1 : -1, zoff = dragon ? (k < 2 ? 0.02 : -0.02) * S : 0;
        w.position.set(0, 0, zoff); w.rotation.set(0, 0, side * flap); w.scale.set(side, 1, 1); w.updateMatrix();
        w.matrix.premultiply(o.matrix);
        wings.setMatrixAt(i * nW + k, w.matrix);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  }
  return { g, update };
}

/** A simple low-poly standing person, merged into one geometry per material: robe/body + head (+ optional conical hat). */
export function personGeometry({ hat = false } = {}) {
  const robe = new THREE.CylinderGeometry(0.16, 0.3, 1.3, 7); robe.translate(0, 0.65, 0);
  const shoulders = new THREE.SphereGeometry(0.18, 7, 5); shoulders.scale(1.1, 0.6, 0.8); shoulders.translate(0, 1.32, 0);
  const head = new THREE.SphereGeometry(0.12, 8, 6); head.translate(0, 1.55, 0.01);
  const body = mergeGeometries([nonIdx(robe), nonIdx(shoulders)]);
  const parts = { body, head: nonIdx(head) };
  if (hat) { const h = new THREE.ConeGeometry(0.36, 0.2, 10); h.translate(0, 1.7, 0); parts.hat = nonIdx(h); }
  return parts;
}

/** Small birds on the ground that peck (pigeons, chickens…). `spots` = [[x,y,z,rotY],…]. Instanced: 2 draw calls. */
export function makePeckers(spots, color = 0x8a8fa0) {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.1, 7, 5); bodyGeo.scale(0.8, 0.75, 1.3); bodyGeo.translate(0, 0.12, 0);
  const tail = new THREE.ConeGeometry(0.05, 0.12, 4); tail.rotateX(-Math.PI / 2 - 0.4); tail.translate(0, 0.15, -0.14);
  const bodyM = mergeGeometries([nonIdx(bodyGeo), nonIdx(tail)]);
  const headGeo = new THREE.SphereGeometry(0.055, 6, 5); headGeo.translate(0, 0.07, 0.04);
  const beak = new THREE.ConeGeometry(0.015, 0.05, 4); beak.rotateX(Math.PI / 2); beak.translate(0, 0.065, 0.1);
  const headM = mergeGeometries([nonIdx(headGeo), nonIdx(beak)]);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const bodies = new THREE.InstancedMesh(bodyM, mat, spots.length), heads = new THREE.InstancedMesh(headM, mat, spots.length);
  bodies.frustumCulled = heads.frustumCulled = false;
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const list = spots.map(([x, y, z, r]) => ({ x, y, z, r, ph: Math.random() * 10, turn: Math.random() * 5 }));
  g.add(bodies, heads);
  const o = new THREE.Object3D(), h = new THREE.Object3D();
  function update(dt, time) {
    list.forEach((p, i) => {
      p.turn -= dt;
      if (p.turn <= 0) { p.turn = 2 + Math.random() * 5; p.r += (Math.random() - 0.5) * 1.6; }
      o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix);
      const s = Math.sin(time * 2.2 + p.ph);
      h.position.set(0, 0.17, 0.08); h.rotation.set(s > 0.6 ? 0.9 * (s - 0.6) / 0.4 : 0, 0, 0); h.updateMatrix();
      h.matrix.premultiply(o.matrix);
      heads.setMatrixAt(i, h.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { g, update };
}

/** A V of birds circling (or crossing) high up. */
export function makeFlock(n = 9, color = 0x1c1420) {
  const g = new THREE.Group(), birds = [];
  const bird = new THREE.BufferGeometry();
  bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.7, 0.1, -0.05, 0, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.7, 0.1, -0.05], 3));
  bird.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(bird, bm);
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.position.set(side * row * 1.4, row * 0.2, -row * 1.6);
    g.add(b); birds.push(b);
  }
  return { g, birds, flap(time) { birds.forEach((b, i) => { b.scale.y = 0.4 + 0.6 * Math.abs(Math.sin(time * 6 + i)); }); } };
}
