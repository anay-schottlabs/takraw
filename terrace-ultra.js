// HILL TRIBE TERRACE — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on
// Ultra. Replaces the flat-shaded terrain, the jagged ridge lines and the two chedi hills (`lite` in terrace.js) with:
//  • smooth, high-resolution terraces (same height function, so the village, fence and trees still sit on them) with
//    raised bunds, flooded paddies that mirror the moonlit sky, rice clumps that sway on the near terraces;
//  • smooth layered mountains fading into moonlit haze;
//  • something to look at past each end of the court: a river winding through the valley, a town's lights, a road with
//    headlights crawling along it, a town + ridge temple on the slopes facing each player, and a
//    floodlit chedi on a hill off each end; full-blossom mountain cherry trees with drifting petals.
// GAMEPLAY RULE: nothing new on or above the court + free zone; distant lights are small, dim and kept off the centre.
import * as THREE from 'three';
import { rng, V2, place, merge, softTexture, TAU } from './temple-ultra.js';

const _o = new THREE.Object3D();

export function buildTerraceUltra(ctx, uTime) {
  const { F, texLoader, heightAt, stepsAt, riseAt, STEP_W, RISER } = ctx;
  const root = new THREE.Group(); root.name = 'terrace-ultra';
  const ticks = [];
  const R = rng(777);
  const load = (name, srgb, rep = 1) => {
    const t = texLoader.load(`assets/temple-ultra/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /* ---------------- 1. TERRAIN — smooth, dense near the court, coarse toward the horizon ---------------- */
  const flatInfo = (x, z) => {                           // which terrace a point is on, and where on it
    const st = stepsAt(x, z), i = Math.floor(st.s), frac = st.s - i;
    const f = st.d - Math.floor(st.d / STEP_W) * STEP_W;   // distance across this step (0 = inner edge)
    return { ...st, i, frac, f, up: riseAt(x, z) };
  };
  const isFlood = (t) => t.up < 0.5 && t.d > 0.3 && t.d < 58 && t.i % 4 === 2;
  const lip = (t) => {                                   // a raised earth bund along the outer edge of each paddy
    if (t.up > 0.4 || t.d < 0.3 || t.d > 75 || t.frac > 0.001) return 0;
    const e = (STEP_W - RISER) - t.f;                     // metres before the riser drops away
    return e >= 0 && e < 0.4 ? Math.sin((e / 0.4) * Math.PI) * 0.13 : 0;
  };
  const groundAt = (x, z) => heightAt(x, z) + lip(flatInfo(x, z));
  {
    const axis = (half, dense, denseHalf, coarse) => {
      const pts = [0]; let x = 0;
      while (x < half) { const t = Math.max(0, (x - denseHalf) / (half - denseHalf)); x += dense + (coarse - dense) * t; pts.push(Math.min(x, half)); }
      return [...pts.slice(1).reverse().map((v) => -v), ...pts];
    };
    const xs = axis(280, 0.45, 44, 12), zs = axis(260, 0.45, 36, 12);   // fine where the terraces are seen, coarse toward the horizon
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), colA = new Float32Array(nx * nz * 3), rough = new Float32Array(nx * nz);
    const c = new THREE.Color();
    const paddy = [0x86a63c, 0x7a9a34, 0x94b043, 0x6f9230, 0xa9a24a];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i, t = flatInfo(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, z) + lip(t); pos[k * 3 + 2] = z;
      let r = 0.92;
      if (t.d <= 0.01) c.set(Math.abs(x) < F.outX + 0.6 && Math.abs(z) < F.outZ + 0.6 ? 0x7a5c40 : 0x6c7d38);
      else if (t.frac > 0.02 && t.frac < 0.98) c.set(t.up > 0.5 ? 0x5d6a2c : 0x6b4e30);          // terrace walls (earth)
      else if (t.d > 72) c.set(0x24402a);                                                          // forested valley
      else if (t.up > 0.5) c.set(t.i % 3 === 1 ? 0x7d6a3a : 0x6f8234);                            // village gardens
      else if (isFlood(t)) { c.set(0x1c2a40); r = 0.06; }                                           // flooded paddy: a mirror
      else c.set(paddy[(t.i * 7 + Math.floor((Math.atan2(z, x) + 4) * 2)) % paddy.length]);
      if (lip(t) > 0.02) { c.set(0x6a5434); r = 0.95; }
      c.offsetHSL(0, 0, (R() - 0.5) * 0.025);
      colA.set([c.r, c.g, c.b], k * 3); rough[k] = r;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    geo.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const grass = load('leafy_grass_diff.jpg', true);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 1.6 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uDet = { value: grass };
      sh.vertexShader = 'attribute float aRough; varying float vRough; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vRough = aRough; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D uDet; varying float vRough; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          { float l = dot(texture2D(uDet, vWP.xz * 0.45).rgb, vec3(0.2126, 0.7152, 0.0722));
            float l2 = dot(texture2D(uDet, vWP.xz * 0.07 + 0.31).rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb *= mix(1.0, clamp(l * 1.25 + l2 * 0.95, 0.6, 1.4), smoothstep(0.2, 0.6, vRough)); }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vRough;');
    };
    m.customProgramCacheKey = () => 'terraceU';
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------- 2. RICE — clumps of blades on the near (unflooded) paddies, swaying ---------------- */
  {
    const blades = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3, lean = 0.12 + (k % 3) * 0.05, h = 0.42 + (k % 2) * 0.12;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.018, 0, 0, 0.018, 0, 0, Math.cos(a) * lean, h, Math.sin(a) * lean], 3));
      g.computeVertexNormals(); blades.push(g);
    }
    const clump = merge(blades);
    const spots = [];
    for (let x = -60; x <= 60; x += 0.62) for (let z = -48; z <= 48; z += 0.62) {
      const jx = x + (R() - 0.5) * 0.35, jz = z + (R() - 0.5) * 0.35, t = flatInfo(jx, jz);
      if (t.d < 0.6 || t.d > 24 || t.up > 0.35 || t.frac > 0.001 || isFlood(t)) continue;
      if (t.f > STEP_W - RISER - 0.45) continue;                                // keep off the bund
      spots.push([jx, groundAt(jx, jz), jz]);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fb046, roughness: 0.75, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz; float w = sin(uTime * 1.4 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 2.3 + ip.x * 1.1) * 0.2;
          transformed.x += w * 0.09 * position.y * position.y * 4.0; transformed.z += w * 0.05 * position.y * position.y * 4.0; }`);
    };
    mat.customProgramCacheKey = () => 'rice';
    const im = new THREE.InstancedMesh(clump, mat, spots.length);
    spots.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.setScalar(0.85 + R() * 0.4); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
    im.computeBoundingSphere(); root.add(im);
  }

  let near = null;                                // the nearest range's surface: (angle, 0..1 across) → [x, y, z]
  /* ---------------- 3. MOUNTAINS — smooth layered ranges, darker near, hazier far ---------------- */
  {
    const fbm = (a, seed) => {
      let v = 0, amp = 1, fr = 1, s = seed;
      for (let o = 0; o < 5; o++) { v += amp * (Math.sin(a * 3 * fr + s) * 0.6 + Math.sin(a * 7.3 * fr + s * 1.7) * 0.4); amp *= 0.5; fr *= 2.1; s += 1.37; }
      return v;
    };
    const range = (R0, R1, hBase, hAmp, seed, color, haze) => {
      const N = 720, M = 18, pos = [], idx = [];
      const surf = (a, t) => {
        const crest = hBase + hAmp * (0.55 + 0.45 * Math.abs(fbm(a, seed)));
        const off = 0.5 + 0.18 * Math.sin(a * 5 + seed), r = R0 + (R1 - R0) * t;
        const prof = t < off ? Math.sin((t / off) * Math.PI / 2) : Math.cos(((t - off) / (1 - off)) * Math.PI / 2);
        const y = -30 + (crest + 30) * Math.pow(Math.max(0, prof), 1.35) + Math.sin(a * 41 + t * 9 + seed) * 0.8;
        return [Math.cos(a) * r * 1.12, y, Math.sin(a) * r];
      };
      for (let i = 0; i <= N; i++) { const a = (i / N) * TAU; for (let j = 0; j <= M; j++) pos.push(...surf(a, j / M)); }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
      // moonlit mist pooled in the valleys: the lower slopes glow faintly blue, so each ridge stands out from the next
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying float vY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vY = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = 'varying float vY;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(${haze.map((v) => v.toFixed(3)).join(',')}) * (1.0 - smoothstep(-26.0, ${(hBase + hAmp * 0.6).toFixed(1)}, vY));`);
      };
      mat.customProgramCacheKey = () => 'range' + seed;
      root.add(new THREE.Mesh(geo, mat));
      return surf;
    };
    near = range(150, 215, 6, 24, 1.1, 0x1f2c26, [0.035, 0.045, 0.07]);
    range(205, 285, 20, 42, 2.7, 0x222c3c, [0.05, 0.06, 0.095]);
    range(275, 380, 34, 68, 4.2, 0x29324c, [0.06, 0.072, 0.115]);
    range(370, 520, 52, 100, 6.9, 0x323c5e, [0.07, 0.085, 0.13]);
  }

  /* ---------------- 4. CHEDI HILLS — a smooth forested hill off each end, a floodlit chedi ---------------- */
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 0.6, roughness: 0.35, emissive: 0xb07020, emissiveIntensity: 0.9 });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(1.7) });
  const haloM = new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffb060, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  function chedi(scale) {
    const sq = (pts) => { const g = new THREE.LatheGeometry(V2(pts), 4); g.rotateY(Math.PI / 4); return g; };
    const parts = [sq([[0, 0], [4.2, 0], [4.2, 0.8], [3.8, 0.9], [3.8, 1.7], [3.3, 1.8], [3.3, 2.5], [0, 2.5]]),
      new THREE.LatheGeometry(V2([[2.2, 2.5], [2.35, 2.8], [2.5, 3.4], [2.45, 4.1], [2.2, 4.8], [1.8, 5.4], [1.3, 5.9], [0.9, 6.2], [0, 6.2]]), 56),
      sq([[0.9, 6.2], [0.9, 6.7], [0.95, 6.75], [0, 6.75]])];
    const ring = [[0.62, 6.75]]; let y = 6.8, r = 0.6;
    for (let k = 0; k < 9; k++) { ring.push([r + 0.06, y], [r + 0.06, y + 0.1], [r - 0.02, y + 0.14]); y += 0.26; r *= 0.86; }
    ring.push([0.14, y], [0.08, y + 1.6], [0.12, y + 1.75], [0.02, y + 2.4], [0, y + 2.55]);
    parts.push(new THREE.LatheGeometry(V2(ring), 32));
    return merge(parts).scale(scale, scale, scale);
  }
  const hillTops = [];
  for (const [sx, hz] of [[1, 64], [-1, -62]]) {
    const hx = sx * 112;
    const hill = new THREE.SphereGeometry(1, 96, 40, 0, TAU, 0, Math.PI / 2);
    const hp = hill.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.sin(a * 5 + sx) + 0.04 * Math.sin(a * 11 + y * 4) + 0.03 * Math.sin(y * 9 + a * 3);
      hp.setXYZ(i, x * k, Math.pow(y, 0.85), z * k);
    }
    hill.scale(28, 25, 23); hill.computeVertexNormals();
    const hm = new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: 0x1b2c1d, roughness: 1 })); hm.position.set(hx, -17, hz); root.add(hm);
    const top = -17 + 25;
    const c = new THREE.Mesh(chedi(1.2), gold); c.position.set(hx, top - 0.4, hz); root.add(c);
    const h = new THREE.Sprite(haloM); h.position.set(hx, top + 7, hz); h.scale.set(34, 34, 1); root.add(h);
    hillTops.push([hx, top, hz]);
  }

  /* ---------------- 5. THE VALLEY PAST EACH END — river, town lights, a road with headlights ---------------- */
  const FLOOR = -27.85;
  // an arc of the valley around angle a0 (0 = past the +x end, PI = past the −x end), radius wobbling round rr
  const arc = (a0, a1, rr, wob, ph) => (t) => { const a = a0 + (a1 - a0) * t, r = rr + wob * Math.sin(a * 7 + ph) + wob * 0.5 * Math.sin(a * 13 + ph * 2); return [Math.cos(a) * r, Math.sin(a) * r]; };
  {
    // rivers: a wide silver ribbon catching the moon
    const water = new THREE.MeshStandardMaterial({ color: 0x0c1830, roughness: 0.05, metalness: 0.3, envMapIntensity: 2.2 });
    const ribbon = (path, w0, w1, n = 160) => {
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, [x, z] = path(t), [x2, z2] = path(Math.min(1, t + 1e-3)), [x0, z0] = path(Math.max(0, t - 1e-3));
        const dx = x2 - x0, dz = z2 - z0, L = Math.hypot(dx, dz) || 1, w = w0 + (w1 - w0) * Math.sin(t * Math.PI);
        pos.push(x - (dz / L) * w, FLOOR + 0.05, z + (dx / L) * w, x + (dz / L) * w, FLOOR + 0.05, z - (dx / L) * w);
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      root.add(new THREE.Mesh(geo, water));
    };
    ribbon(arc(-0.15, 1.15, 112, 7, 0.4), 3, 6);
    ribbon(arc(Math.PI - 1.1, Math.PI + 0.12, 116, 8, 2.1), 3, 7);
  }
  {
    // towns: dark roofs with lit windows and street lamps, on the valley floor beside each river
    const towns = [[0.62, 128, 11], [Math.PI - 0.7, 132, 12], [0.95, 150, 6], [Math.PI - 0.35, 145, 5]];
    const pts = [], seeds = [], cols = [];
    const houseM = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 1 });
    const houses = [];
    for (const [a, r, n] of towns) {
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let k = 0; k < n * 14; k++) {
        const rr = Math.sqrt(R()) * n * 1.4, aa = R() * TAU, x = cx + Math.cos(aa) * rr, z = cz + Math.sin(aa) * rr;
        pts.push(x, FLOOR + 0.6 + R() * (R() < 0.2 ? 6 : 2), z); seeds.push(R());
        const warm = R() < 0.8; cols.push(1, warm ? 0.7 + R() * 0.15 : 0.95, warm ? 0.35 + R() * 0.15 : 0.9);
        if (k % 3 === 0) houses.push(new THREE.BoxGeometry(2.6 + R() * 2, 2 + R() * 2.5, 2.6 + R() * 2).translate(x, FLOOR + 1.2, z));
      }
    }
    root.add(new THREE.Mesh(merge(houses), houseM));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.7 + 0.3 * sin(uTime * (0.4 + seed) + seed * 50.0); gl_PointSize = max(1.5, 260.0 / -mv.z); }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vC * a * 1.5, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
    // a soft warm glow hanging over each town
    for (const [a, r, n] of towns.slice(0, 2)) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffa860, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); s.position.set(Math.cos(a) * r, FLOOR + 6, Math.sin(a) * r); s.scale.set(n * 5, n * 2.2, 1); root.add(s); }
  }
  {
    // roads: headlights one way, tail lights the other, crawling along the valley (positions computed in the shader)
    const roads = [[-0.05, 1.05, 104, 5, 1.3], [Math.PI - 1.0, Math.PI + 0.08, 108, 6, 3.3]];
    const u = [], spd = [], road = [], dir = [];
    roads.forEach((rd, ri) => { for (let k = 0; k < 22; k++) { u.push(R()); spd.push(0.006 + R() * 0.006); road.push(ri); dir.push(k % 2 ? 1 : -1); } });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(u.length * 3), 3));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1)); geo.setAttribute('aS', new THREE.Float32BufferAttribute(spd, 1));
    geo.setAttribute('aR', new THREE.Float32BufferAttribute(road, 1)); geo.setAttribute('aD', new THREE.Float32BufferAttribute(dir, 1));
    const R0 = roads[0], R1 = roads[1];
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uFloor: { value: FLOOR + 0.5 } },
      vertexShader: `uniform float uTime; uniform float uFloor; attribute float aU; attribute float aS; attribute float aR; attribute float aD; varying vec3 vC;
        void main(){
          float t = fract(aU + uTime * aS * aD);
          float a0 = aR < 0.5 ? ${R0[0].toFixed(3)} : ${R1[0].toFixed(3)}, a1 = aR < 0.5 ? ${R0[1].toFixed(3)} : ${R1[1].toFixed(3)};
          float rr = aR < 0.5 ? ${R0[2].toFixed(1)} : ${R1[2].toFixed(1)}, wob = aR < 0.5 ? ${R0[3].toFixed(1)} : ${R1[3].toFixed(1)}, ph = aR < 0.5 ? ${R0[4].toFixed(2)} : ${R1[4].toFixed(2)};
          float a = a0 + (a1 - a0) * t, r = rr + wob * sin(a * 7.0 + ph) + wob * 0.5 * sin(a * 13.0 + ph * 2.0) + aD * 0.6;
          vec4 mv = modelViewMatrix * vec4(cos(a) * r, uFloor, sin(a) * r, 1.0); gl_Position = projectionMatrix * mv;
          vC = aD > 0.0 ? vec3(1.0, 0.95, 0.8) : vec3(1.0, 0.25, 0.15); gl_PointSize = max(1.5, 230.0 / -mv.z); }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC * a * 1.6, a); }` });
    const p = new THREE.Points(geo, m); p.frustumCulled = false; root.add(p);
  }
  // valley mist lying along the rivers, moonlit
  {
    const mm = new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0x8c9ac8, transparent: true, opacity: 0.08, depthWrite: false });
    const sprites = [];
    for (let k = 0; k < 26; k++) {
      const side = k % 2 ? 0 : Math.PI, a = side + (R() - 0.3) * 1.3, r = 100 + R() * 40;
      const s = new THREE.Sprite(mm); s.position.set(Math.cos(a) * r, FLOOR + 2 + R() * 4, Math.sin(a) * r); s.scale.set(40 + R() * 30, 6 + R() * 5, 1);
      root.add(s); sprites.push([s, s.position.x, R() * TAU]);
    }
    ticks.push((t) => { for (const [s, x0, ph] of sprites) s.position.x = x0 + Math.sin(t * 0.02 + ph) * 5; });
  }

  /* ---------------- 6. ON THE SLOPES IN FRONT OF EACH PLAYER — a town at the foot of the slope, a ridge temple ----------------
     a = 0 is straight past the +x end (what the −x player looks at), a = PI past the −x end. Everything sits a little
     to one side of straight ahead, so the middle of the view — where the ball flies — stays dark and clean. */
  if (near) {
    const lightPts = [], lightSeed = [], lightCol = [];
    const add = (p, warm = true) => { lightPts.push(p[0], p[1] + 0.4, p[2]); lightSeed.push(R()); lightCol.push(1, warm ? 0.68 + R() * 0.16 : 0.95, warm ? 0.32 + R() * 0.16 : 0.85); };
    // each end: [village angle, ridge-temple angle] — on the side away from that end's chedi hill, ≥ 18° off straight ahead (the court's own width spans ±9°; checked in the real match camera)
    for (const [ac, at] of [[-0.32, -0.5], [Math.PI - 0.32, Math.PI - 0.6]]) {
      // village: clustered warm windows on the lower slope
      for (let k = 0; k < 170; k++) { const a = ac + (R() - 0.5) * 0.16 * (0.6 + R() * 0.6), t = 0.04 + Math.pow(R(), 1.8) * 0.12; add(near(a, t), R() < 0.85); }   // a town spread along the foot of the slope
      { const vc = near(ac, 0.08), vg = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, 128), color: 0xffa860, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        vg.position.set(vc[0], vc[1] + 3, vc[2]); vg.scale.set(48, 12, 1); root.add(vg);
}
      // ridge temple: a small gilded chedi on the crest, glowing
      let crest = near(at, 0.3);
      for (let t = 0.3; t <= 0.75; t += 0.01) { const q = near(at, t); if (q[1] > crest[1]) crest = q; }
      const c = new THREE.Mesh(chedi(1.9), gold); c.position.set(crest[0], crest[1] - 1.2, crest[2]); root.add(c);
      const h = new THREE.Sprite(haloM); h.position.set(crest[0], crest[1] + 10, crest[2]); h.scale.set(36, 36, 1); root.add(h);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(lightSeed, 1)); geo.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
    const lm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.75 + 0.25 * sin(uTime * (0.3 + seed) + seed * 50.0); gl_PointSize = max(2.0, 470.0 / -mv.z); }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vC * a * 1.5, a); }` });
    const lp = new THREE.Points(geo, lm); lp.frustumCulled = false; root.add(lp);
  }

  /* ---------------- 7. MOUNTAIN CHERRY — tapered limbs and soft, full blossom clouds (replaces the faceted blobs) ---------------- */
  if (ctx.cherrySpots && ctx.cherrySpots.length) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const variant = (seed) => {
      const r = rng(seed), bark = [], bloom = [], tips = [];
      const limb = (a, b, r0, r1) => {
        const d = b.clone().sub(a), L = d.length(), c = new THREE.CylinderGeometry(r1, r0, L, 10, 2, true);
        c.translate(0, L / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); c.translate(a.x, a.y, a.z);
        bark.push(c, new THREE.SphereGeometry(r1 * 1.1, 8, 6).translate(b.x, b.y, b.z));
      };
      const fork = V(0.05, 1.5, 0); limb(V(0, 0, 0), fork, 0.21, 0.16);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + r() * 0.5, mid = V(Math.cos(a) * (0.9 + r() * 0.5), 2.6 + r() * 0.6, Math.sin(a) * (0.9 + r() * 0.5));
        limb(fork, mid, 0.12, 0.08);
        for (const da of [-0.5, 0.5]) { const tip = V(mid.x + Math.cos(a + da) * 0.8, mid.y + 0.5 + r() * 0.4, mid.z + Math.sin(a + da) * 0.8); limb(mid, tip, 0.07, 0.04); tips.push(tip); }
      }
      // blossom: many small soft clusters around each tip, a few hanging lower, so the canopy reads as a cloud
      for (const t of tips) for (let k = 0; k < 9; k++) {
        const b = new THREE.IcosahedronGeometry(0.3 + r() * 0.22, 1);
        const p = b.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.12 * Math.sin(x * 19 + y * 13) * Math.cos(z * 17); p.setXYZ(i, x * n, y * n * 0.8, z * n); }
        b.translate(t.x + (r() - 0.5) * 0.9, t.y + (r() - 0.35) * 0.6, t.z + (r() - 0.5) * 0.9);
        bloom.push(b);
      }
      const bm = merge(bloom); bm.computeVertexNormals();
      return { bark: merge(bark), bloom: bm };
    };
    const vars = [variant(5), variant(17), variant(31)];
    const barkM = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 });
    const bloomM = new THREE.MeshStandardMaterial({ color: 0xf7a3c4, emissive: 0x5a2038, roughness: 0.75 });
    bloomM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float h = max(position.y - 2.0, 0.0); vec3 ip = instanceMatrix[3].xyz; transformed.x += sin(uTime * 1.1 + ip.x * 0.5 + position.y) * 0.03 * h; transformed.z += cos(uTime * 0.9 + ip.z * 0.4) * 0.025 * h; }`);
    };
    bloomM.customProgramCacheKey = () => 'cherry';
    const byVar = [[], [], []];
    ctx.cherrySpots.forEach((sp, i) => byVar[i % 3].push(sp));
    vars.forEach((v, vi) => {
      const list = byVar[vi]; if (!list.length) return;
      for (const [geo, m] of [[v.bark, barkM], [v.bloom, bloomM]]) {
        const im = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach(([x, z, sc, ry], k) => { _o.position.set(x, heightAt(x, z), z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(sc); _o.updateMatrix(); im.setMatrixAt(k, _o.matrix); });
        im.castShadow = m === barkM; im.computeBoundingSphere(); root.add(im);
      }
    });
    // a few petals drifting down from the near trees
    const near2 = ctx.cherrySpots.filter(([x, z]) => Math.hypot(x, z) < 40);
    const N = 50, pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { const [x, z, sc] = near2[i % near2.length] || [0, 30, 1]; pos.set([x + (R() - 0.5) * 3, heightAt(x, z) + 3.2 * sc, z + (R() - 0.5) * 3], i * 3); sd[i] = R(); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main(){ float t = fract(uTime / 9.0 + seed); vec3 p = position + vec3(sin(uTime * 0.8 + seed * 30.0) * 0.6 + t * 1.2, -t * 3.4, cos(uTime * 0.6 + seed * 20.0) * 0.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.85, 1.0, t)); gl_PointSize = 70.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(q * vec2(1.0, 1.8))) * vA * 0.8; gl_FragColor = vec4(vec3(1.0, 0.7, 0.82) * a, a); }` });
    const pp = new THREE.Points(pg, pm); pp.frustumCulled = false; root.add(pp);
  }

  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update };
}
