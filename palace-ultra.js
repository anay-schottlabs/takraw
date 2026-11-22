// PALACE GARDEN — ULTRA. Built lazily the first time Ultra is on (see the ULTRA contract in main.js), shown only on Ultra.
// It replaces the garden's low-poly pieces (`lite` in palace.js: ground, pool water + jets, lily pads, topiary, parterres,
// lamp posts, pavilions + giants, chedis, prangs, wall) with a grand royal garden at night:
//  • polished marble terrace with inlaid borders; lawns; lantern-lined walks;
//  • reflecting pools that really reflect (a planar mirror of the pavilions, chedis, topiary and lamps, rippled by moving
//    water), gilded lotus fountains with spray, floating lotus lamps, lily pads;
//  • a cruciform gilded throne pavilion at each end: three-tier layered roofs (curved slopes, glazed borders), carved
//    pediments, chofa finials, bai raka fins, hang hong curls, a tiered prasat spire, outline lights; open side salas;
//  • yaksha guardian giants with tiered crowns, fangs, armour and clubs; clipped topiary (tiered, balls in gilded urns,
//    elephants), flower parterres; a terrace of golden chedis; white prangs; a crenellated palace wall with bai sema
//    merlons, gate towers and corner forts;
//  • beyond the wall: dark tree lines, a great floodlit prang and a golden mount on the skyline, the city's glow;
//  • life: flickering lanterns, fireflies, moths, golden-shower petals drifting down, bats circling the far spires,
//    palace guards marching and attendants with lanterns on the far walks.
// GAMEPLAY RULE: nothing new on or above the court + free zone; bright things stay off the ball's flight line (the centre
// of both match cameras) — the pavilion straight ahead is kept calm and its front outline lights dim; particles stay at
// the pools and the far garden.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFireflies } from './life.js';
import { TAU, rng, V3, V2, place, merge, enhance, softTexture } from './temple-ultra.js';

const REFL = 3;                         // layer: what the reflecting pools mirror
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();

// merge per material; returns the meshes (so they can join the reflection layer)
function batch() {
  const m = new Map();
  return {
    put(mat, geo) { if (!m.has(mat)) m.set(mat, []); m.get(mat).push(geo); },
    putAll(mat, list, M) { for (const g of list) this.put(mat, M ? g.clone().applyMatrix4(M) : g); },
    build(parent, { cast = false, receive = false, refl = false } = {}) {
      const out = [];
      for (const [mat, list] of m) {
        const mesh = new THREE.Mesh(merge(list), mat); mesh.castShadow = cast; mesh.receiveShadow = receive;
        if (refl) mesh.layers.enable(REFL);
        parent.add(mesh); out.push(mesh);
      }
      m.clear(); return out;
    },
  };
}
function inst(geo, mat, spots, parent, { cast = false, refl = false, colors = null } = {}) {   // spots: [x, y, z, ry, s]
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach((p, i) => {
    _o.position.set(p[0], p[1], p[2]); _o.rotation.set(0, p[3] || 0, 0);
    const s = p[4] ?? 1; if (Array.isArray(s)) _o.scale.set(s[0], s[1], s[2]); else _o.scale.setScalar(s);
    _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
    if (colors) im.setColorAt(i, colors(i, p));
  });
  im.computeBoundingSphere(); im.castShadow = cast;
  if (refl) im.layers.enable(REFL);
  parent.add(im); return im;
}
// a redented ("indented-corner") square outline, half-size r, corner notch k
function redentPts(r, k) {
  const a = r, b = r - k;
  return [[a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b], [-b, -a], [b, -a], [b, -b], [a, -b]];
}
// sweep a (radius, height) profile round a redented square: crisp flat-shaded mouldings (bases, prangs, spire tiers)
function redLathe(profile, notch = 0.22) {
  const rings = profile.map(([r, y]) => redentPts(r, r * notch).map(([x, z]) => [x, y, z]));
  const pos = [];
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j], B = rings[j + 1], n = A.length;
    for (let i = 0; i < n; i++) {
      const a = A[i], b = A[(i + 1) % n], c = B[i], d = B[(i + 1) % n];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(V2(pts), seg);
const tube = (pts, r, seg = 24, rs = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V3(x, y, z))), seg, r, rs);
// lumpy organic blob (clipped foliage): an icosphere pushed in and out by smooth noise
function blob(rx, ry, rz, detail = 3, seed = 1, amp = 0.09) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const k = 1 + amp * (Math.sin(n.x * 9.1 + seed) * Math.cos(n.y * 7.7 + seed * 1.3) + 0.6 * Math.sin(n.z * 13.3 + n.x * 5.1 + seed * 2.1) + 0.35 * Math.sin(n.y * 23 + n.z * 19 + seed));
    p.setXYZ(i, n.x * rx * k, n.y * ry * k, n.z * rz * k);
  }
  g.computeVertexNormals(); return g;
}

// gilding: a bright fresnel rim so curved gold reads as metal at night (on top of enhance()'s floodlit base)
function goldRim(mat, k = 0.6) {
  const ob = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    ob(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.85, 0.6) * rim * ${k.toFixed(2)}; }`);
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + 'rim';
  return mat;
}

export function buildPalaceUltra(ctx, uTime) {
  const { F, texLoader, PX, PZ, POOL_Z0, POOL_Z1, HALL_X, jets } = ctx;
  const root = new THREE.Group(); root.name = 'palace-ultra';
  const ticks = [];
  const R = rng(8080);
  const load = (path, srgb, rep = 1) => {
    const t = texLoader.load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const marbleTex = load('assets/palace-ultra/marble_diff.jpg', true), marbleNor = load('assets/palace-ultra/marble_nor_gl.jpg', false);
  const plasterTex = load('assets/temple-ultra/clay_plaster_diff.jpg', true);
  const leafTex = load('assets/temple-ultra/leafy_grass_diff.jpg', true);
  const UP = { upCol: 0xffcf9a, upY: -0.1, upCentre: [0, 0, 0] };
  const mat = {
    marble: enhance(new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.38 }), { tri: marbleTex, triScale: 0.32, triAmt: 0.55, upK: 0.42, upFall: 2.2, upWrap: 0.3, ...UP }),
    plaster: enhance(new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.85 }), { tri: plasterTex, triScale: 0.3, upK: 0.5, upFall: 3.2, upWrap: 0.3, ...UP }),
    gold: goldRim(enhance(new THREE.MeshStandardMaterial({ color: 0xe0a84a, metalness: 0.9, roughness: 0.24, emissive: 0x140a01, envMapIntensity: 2.6 }), { upK: 0.6, upFall: 3.2, upWrap: 0.45, ...UP })),
    red: enhance(new THREE.MeshStandardMaterial({ color: 0x84190f, roughness: 0.4 }), { upK: 0.35, upFall: 3, ...UP }),
    roofO: enhance(new THREE.MeshStandardMaterial({ map: ctx.roofTex, normalMap: ctx.roofNor, color: 0xe06a32, roughness: 0.42, side: THREE.DoubleSide }), { upK: 0.16, upFall: 2.5, upWrap: 0.7, ...UP, upY: 6 }),
    roofG: enhance(new THREE.MeshStandardMaterial({ map: ctx.roofTex, normalMap: ctx.roofNor, color: 0x2f8a64, roughness: 0.42, side: THREE.DoubleSide }), { upK: 0.16, upFall: 2.5, upWrap: 0.7, ...UP, upY: 6 }),
    orn: new THREE.MeshStandardMaterial({ map: ctx.ornamentTexture(), roughness: 0.42, metalness: 0.4, side: THREE.DoubleSide, emissive: 0x2a0c04 }),
    glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc583).multiplyScalar(1.25) }),       // lit doors / windows (kept soft)
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8 }),
    leaf: enhance(new THREE.MeshStandardMaterial({ color: 0x3d6a2e, roughness: 0.85 }), { tri: leafTex, triScale: 0.9, triAmt: 1, upK: 0.42, upFall: 1.1, upWrap: 0.55, upCol: 0xffe2a8, upY: -0.1, upCentre: [0, 0, 0] }),
    bark: new THREE.MeshStandardMaterial({ color: 0x3e3127, roughness: 0.95 }),
  };
  mat.orn.map.colorSpace = THREE.SRGBColorSpace; mat.orn.map.wrapS = mat.orn.map.wrapT = THREE.RepeatWrapping;
  // lantern glass that flickers gently, per instance (instanced meshes only)
  const flicker = (col, k) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime; varying float vFl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float s = ip.x * 1.73 + ip.z * 2.31;
          vFl = 0.9 + 0.07 * sin(uTime * 5.3 + s) * sin(uTime * 8.9 + s * 1.7) + 0.03 * sin(uTime * 17.0 + s * 3.1); }`);
      sh.fragmentShader = 'varying float vFl;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vFl;');
    };
    m.customProgramCacheKey = () => 'palFlick';
    return m;
  };
  const lampGlass = flicker(0xffaa55, 2.1), bulbMat = flicker(0xffd49a, 2.2);
  // soft additive pools of light on the ground (instanced discs)
  const poolTex = softTexture(0, 128);
  const glowPools = [];                          // [x, z, r, intensity]
  const W = batch();                             // static architecture merged per material (not mirrored: the pavilions, posts, walks)
  const WR = W;                                  // (pieces the pools show: mirrored through cheap proxies, see 10a)
  const PR = { tiered: [], balls: [], ele: [], beds: [], salas: [], trees: [], chedis: [] };   // where the proxies go
  const placeAll = (B, mat, geo, spots) => { for (const [x, y, z, ry = 0, sc = 1] of spots) B.put(mat, Array.isArray(sc) ? geo.clone().applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ry), V3(...sc))) : place(geo, x, y, z, ry, 0, 0, sc)); };
  const bulbs = [];                              // outline lights: [x, y, z, k]

  /* =====================================================================
     1. GROUND — polished marble terrace with inlaid borders, lawns, walks
     ===================================================================== */
  const TZ = PZ + 14, TX = PX + 30;              // terrace half-extents (as High)
  const Z1 = POOL_Z1;
  const WALK_A = Z1 + 13, CHEDI_Z = Z1 + 18.5, WALK_B = Z1 + 24, WALL_Z = 62, WALL_X = 98;
  {
    const geo = new THREE.PlaneGeometry(TX * 2, TZ * 2, 1, 1);
    const tn = marbleNor.clone(); tn.repeat.set(TX * 2 / 2.6, TZ * 2 / 2.6); tn.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ color: 0xbdb4a8, map: marbleTex, normalMap: tn, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.24, envMapIntensity: 1.0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uA = { value: new THREE.Vector2(F.outX + 1.7, F.outZ + 1.7) };
      sh.uniforms.uB = { value: new THREE.Vector2(TX - 1.2, TZ - 1.0) };
      sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform vec2 uA; uniform vec2 uB; varying vec3 vWP2;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec4 mt = texture2D(map, vNormalMapUv);
          float lum = dot(mt.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb *= mix(0.72, 1.15, smoothstep(0.2, 0.8, lum));
          vec2 p = abs(vWP2.xz);
          float dA = max(p.x - uA.x, p.y - uA.y), dB = max(p.x - uB.x, p.y - uB.y);
          float aw = fwidth(dA) + 1e-4, bw = fwidth(dB) + 1e-4;
          float band = smoothstep(0.17 + aw, 0.17 - aw, abs(dA)) + smoothstep(0.24 + bw, 0.24 - bw, abs(dB));
          float line = smoothstep(0.03 + aw, 0.03 - aw, abs(dA + 0.42)) + smoothstep(0.03 + bw, 0.03 - bw, abs(dB + 0.55));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.2), clamp(band, 0.0, 1.0) * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.6, 0.25), clamp(line, 0.0, 1.0) * 0.8);`);
    };
    m.customProgramCacheKey = () => 'palTerrace';
    const t = new THREE.Mesh(geo, m); t.rotation.x = -Math.PI / 2; t.position.y = -0.1; t.receiveShadow = true; root.add(t);
    // lawn out to the horizon
    const gm = new THREE.MeshStandardMaterial({ map: load('assets/temple-ultra/leafy_grass_diff.jpg', true, 220), normalMap: load('assets/temple-ultra/leafy_grass_nor_gl.jpg', false, 220), color: 0x4c5c3c, roughness: 1 });
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(880, 880), gm); lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.14; root.add(lawn);
    // marble walks: two long walks down each side, cross walks at the ends, a walk round the parterres
    const walks = [];
    for (const s of [-1, 1]) {
      walks.push([0, s * WALK_A, 120, 2.6], [0, s * WALK_B, 140, 3.0]);
      for (const x of [-46, -18, 0, 18, 46]) walks.push([x, s * (TZ + (WALK_A - TZ) / 2), 2.2, WALK_A - TZ]);
    }
    for (const sx of [-1, 1]) walks.push([sx * (TX + 7), 0, 3, (WALK_B) * 2]);
    for (const [x, z, w, d] of walks) W.put(mat.marble, place(new THREE.BoxGeometry(w, 0.06, d), x, -0.12, z));
  }

  /* =====================================================================
     2. REFLECTING POOLS — a real planar mirror (only the tall things join the reflection pass), rippled, lit from below
     ===================================================================== */
  const LEN = (F.outX + 14) * 2, PW = POOL_Z1 - POOL_Z0, PZC = (POOL_Z0 + POOL_Z1) / 2;
  {
    const parts = [-1, 1].map((s) => new THREE.PlaneGeometry(LEN, PW).translate(0, -s * PZC, 0));   // local XY plane; rotated flat below
    const geo = mergeGeometries(parts);
    const wn = texLoader.load('assets/pond/water_nor.jpg'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
    const jx0 = jets.length ? jets[0][0] : 0, jstep = jets.length > 1 ? jets[1][0] - jets[0][0] : 7;
    const shader = {
      name: 'PalacePool',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNormal: { value: wn }, uTime: { value: 0 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
        void main() { vUv = textureMatrix * vec4(position, 1.0); vWP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform float uTime; varying vec4 vUv; varying vec3 vWP;
        void main() {
          vec2 q = vWP.xz;
          vec3 n1 = texture2D(tNormal, q * 0.16 + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tNormal, q * 0.29 + vec2(-uTime * 0.014, uTime * 0.019)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(tNormal, q * 0.7 + vec2(uTime * 0.03, -uTime * 0.02)).xyz * 2.0 - 1.0;
          vec2 d = n1.xy + n2.xy * 0.8 + n3.xy * 0.35;
          // fountains stir the water: stronger ripples close to each jet
          float jx = mod(vWP.x - ${jx0.toFixed(3)} + ${(jstep / 2).toFixed(3)}, ${jstep.toFixed(3)}) - ${(jstep / 2).toFixed(3)};
          float jz = abs(vWP.z) - ${PZC.toFixed(3)};
          float r = length(vec2(jx, jz));
          float ring = sin(r * 9.0 - uTime * 5.0) * exp(-r * 1.1);
          d += vec2(jx, jz) / max(r, 0.05) * ring * 0.5;
          vec3 N = normalize(vec3(d.x * 0.09, 1.0, d.y * 0.09));
          vec3 V = normalize(cameraPosition - vWP);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
          vec4 uv = vUv; uv.xy += d * 0.018 * uv.w;
          vec3 refl = texture2DProj(tDiffuse, uv).rgb;
          vec3 deep = vec3(0.012, 0.035, 0.06);
          // underwater lights round each fountain + a faint teal along the pool
          float glow = exp(-r * r * 0.22) * 0.55 + 0.05;
          vec3 col = deep + vec3(0.06, 0.32, 0.42) * glow;
          col = mix(col, refl, clamp(0.38 + fres * 0.62, 0.0, 1.0));
          // moonlight glints
          vec3 Lm = normalize(vec3(-0.35, 0.7, -0.62));
          float sp = pow(max(dot(N, normalize(Lm + V)), 0.0), 600.0);
          col += vec3(0.75, 0.82, 1.0) * sp * 2.2;
          gl_FragColor = vec4(col, 1.0);
        }`,
    };
    const refl = new Reflector(geo, { shader, textureWidth: 1024, textureHeight: 512, clipBias: 0.002, multisample: 0 });
    refl.material.uniforms.uTime = uTime;
    refl.rotation.x = -Math.PI / 2; refl.position.y = -0.03; refl.renderOrder = 2;
    refl.camera.layers.set(REFL);
    root.add(refl);
    // the scene's lights must be in the reflection layer too, or the reflected world renders unlit
    ctx.scene.traverse((o) => { if (o.isLight) o.layers.enable(REFL); });
    // gilded trim on the pool copings
    for (const s of [-1, 1]) for (const [l, d, x, z] of [[LEN + 0.84, 0.06, 0, s * (POOL_Z0 - 0.2)], [LEN + 0.84, 0.06, 0, s * (POOL_Z1 + 0.2)], [0.06, PW + 0.4, -LEN / 2 - 0.2, s * PZC], [0.06, PW + 0.4, LEN / 2 + 0.2, s * PZC]])
      W.put(mat.gold, place(new THREE.BoxGeometry(l, 0.05, d), x, 0.285, z));
  }

  /* ---------------- fountains: gilded lotus heads, a glassy column, spray, ripple rings ---------------- */
  {
    const head = [];
    head.push(lathe([[0, 0], [0.55, 0], [0.6, 0.06], [0.5, 0.12], [0.3, 0.16], [0.18, 0.2], [0.16, 0.5], [0.22, 0.55], [0, 0.56]], 20));
    const pet = new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2); pet.scale(0.13, 0.32, 0.06);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; head.push(place(pet, Math.cos(a) * 0.24, 0.34, Math.sin(a) * 0.24, -a + Math.PI / 2, 0, 0.5)); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; head.push(place(pet, Math.cos(a) * 0.36, 0.12, Math.sin(a) * 0.36, -a + Math.PI / 2, 0, 1.05, 0.8)); }
    const hg = merge(head);
    for (const [x, z] of jets) W.put(mat.gold, place(hg, x, -0.05, z));
    // column: a tapered glassy jet, streaks run up it
    const col = new THREE.CylinderGeometry(0.035, 0.09, 1.7, 12, 8, true).translate(0, 0.85, 0);
    const cm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `varying vec2 vUv; varying float vS; uniform float uTime;
        void main() { vUv = uv; vec3 ip = instanceMatrix[3].xyz; vS = ip.x * 0.37 + ip.z;
          vec3 p = position; p.x *= 1.0 + 0.12 * sin(uTime * 7.0 + p.y * 5.0 + vS); p.z *= 1.0 + 0.12 * cos(uTime * 6.0 + p.y * 4.0 + vS);
          p.y *= 0.94 + 0.06 * sin(uTime * 2.1 + vS);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying float vS; uniform float uTime;
        void main() { float st = 0.55 + 0.45 * sin(vUv.x * 40.0 + vS) * sin(vUv.y * 18.0 - uTime * 14.0 + vS);
          float a = st * smoothstep(1.0, 0.75, vUv.y) * 0.32; gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a, a); }` });
    inst(col, cm, jets.map(([x, z]) => [x, 0.45, z]), root);
    // spray: droplets thrown from the top of each jet, falling back into the pool
    const per = 150, n = jets.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const [x, z] = jets[Math.floor(i / per)]; pos.set([x, 2.0, z], i * 3); sd.set([R(), R() * TAU, R()], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('sd', new THREE.BufferAttribute(sd, 3));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute vec3 sd; varying float vA;
        void main() { float life = 0.95; float t = mod(uTime * (0.9 + sd.z * 0.25) + sd.x * 7.0, life);
          float sp = 0.45 + sd.z * 0.9, vy = 0.6 + sd.x * 1.1;
          vec3 p = position + vec3(cos(sd.y) * sp * t, vy * t - 4.9 * t * t, sin(sd.y) * sp * t);
          p.y = max(p.y, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.05, t) * smoothstep(0.0, 0.25, p.y) * 0.55; gl_PointSize = 34.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.8, 0.93, 1.0) * a, a); }` });
    const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; root.add(pts);
    // ripple rings spreading where the spray lands
    const ring = new THREE.RingGeometry(0.86, 1.0, 48).rotateX(-Math.PI / 2);
    const rm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; varying float vA;
        void main() { vec3 ip = instanceMatrix[3].xyz; float ph = fract(uTime * 0.45 + ip.x * 0.137 + ip.z * 0.31 - ip.y * 333.33);
          float s = 0.35 + ph * 1.4; vA = (1.0 - ph) * smoothstep(0.0, 0.1, ph) * 0.22;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(ip + position * s, 1.0); }`,
      fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(vec3(0.7, 0.9, 1.0) * vA, vA); }` });
    const rs = [];
    for (const [x, z] of jets) for (let k = 0; k < 3; k++) rs.push([x, -0.01 - k * 0.001, z]);   // the tiny y offset staggers the three rings
    const rim = inst(ring, rm, rs, root); rim.frustumCulled = false;
  }

  /* ---------------- lily pads + lotus on the pools; floating lotus lamps drifting slowly ---------------- */
  {
    const pad = new THREE.CircleGeometry(0.46, 28, 0.25, TAU - 0.5).rotateX(-Math.PI / 2);
    { const p = pad.attributes.position; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, 0.03 * (1 - r / 0.46) + (r > 0.42 ? 0.02 : 0)); } pad.computeVertexNormals(); }
    const lotus = [];
    const petal = new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2); petal.scale(0.06, 0.16, 0.035);
    for (const [n, r, tilt, y] of [[8, 0.09, 0.95, 0.04], [6, 0.05, 0.5, 0.06], [5, 0.02, 0.2, 0.08]]) for (let k = 0; k < n; k++) { const a = (k / n) * TAU + r * 10; lotus.push(place(petal, Math.cos(a) * r, y, Math.sin(a) * r, -a + Math.PI / 2, 0, tilt)); }
    lotus.push(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 8).translate(0, 0.09, 0));
    const lotusGeo = merge(lotus);
    const pads = [], blooms = [];
    for (const s of [-1, 1]) for (let i = 0; i < 34; i++) {
      const x = (R() - 0.5) * (LEN - 2), z = s * (POOL_Z0 + 0.6 + R() * (PW - 1.2));
      if (jets.some(([jx, jz]) => Math.hypot(x - jx, z - jz) < 1.6)) continue;
      const sc = 0.7 + R() * 0.6;
      pads.push([x, -0.02, z, R() * TAU, sc]);
      if (R() < 0.28) blooms.push([x + 0.08, -0.01, z, R() * TAU, 0.9 + R() * 0.3]);
    }
    const padM = enhance(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }), { upK: 0.25, upFall: 1, ...UP });
    inst(pad, padM, pads, root, { colors: () => new THREE.Color().setHSL(0.27 + R() * 0.06, 0.45, 0.22 + R() * 0.08) });
    const lotM = new THREE.MeshStandardMaterial({ color: 0xffa8c8, emissive: 0x5a1830, roughness: 0.5, side: THREE.DoubleSide });
    inst(lotusGeo, lotM, blooms, root);
    // floating lotus lamps: a lotus with a candle flame, drifting on slow loops, never near the fountains
    const N = 18, lamps = [];
    for (let i = 0; i < N; i++) { const s = i % 2 ? 1 : -1; lamps.push({ s, x0: (R() - 0.5) * (LEN - 6), ph: R() * TAU, sp: 0.04 + R() * 0.05, ax: 2 + R() * 3, az: 0.6 + R() * 1.2 }); }
    const lm = new THREE.InstancedMesh(lotusGeo, new THREE.MeshStandardMaterial({ color: 0xffd6e4, emissive: 0x8a4a30, roughness: 0.5, side: THREE.DoubleSide }), N);
    lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lm.frustumCulled = false; root.add(lm);
    const fpos = new Float32Array(N * 3), fsd = new Float32Array(N);
    for (let i = 0; i < N; i++) fsd[i] = R();
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fg.setAttribute('seed', new THREE.BufferAttribute(fsd, 1));
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.75 + 0.25 * sin(uTime * 9.0 + seed * 40.0) * sin(uTime * 13.0 + seed * 9.0); gl_PointSize = 90.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.12, 0.0, d)) * vA; gl_FragColor = vec4(vec3(1.0, 0.7, 0.35) * a * 1.3, a); }` });
    const fp = new THREE.Points(fg, fm); fp.frustumCulled = false; root.add(fp);
    ticks.push((t) => {
      for (let i = 0; i < N; i++) {
        const L = lamps[i], a = L.ph + t * L.sp;
        let x = L.x0 + Math.sin(a) * L.ax, z = L.s * (PZC + Math.sin(a * 1.7 + L.ph) * L.az);
        x = Math.max(-LEN / 2 + 0.8, Math.min(LEN / 2 - 0.8, x));
        for (const [jx, jz] of jets) { const dx = x - jx, dz = z - jz, d = Math.hypot(dx, dz); if (d < 1.4) { x = jx + dx / (d || 1) * 1.4; z = jz + dz / (d || 1) * 1.4; } }
        _o.position.set(x, -0.03 + Math.sin(t * 1.3 + i) * 0.01, z); _o.rotation.set(0, a * 0.5, 0); _o.scale.setScalar(1.25); _o.updateMatrix(); lm.setMatrixAt(i, _o.matrix);
        fpos[i * 3] = x; fpos[i * 3 + 1] = 0.2; fpos[i * 3 + 2] = z;
      }
      lm.instanceMatrix.needsUpdate = true; fg.attributes.position.needsUpdate = true;
    });
  }

  /* =====================================================================
     3. LAMP POSTS (same spots as High) — gilded post, a little pavilion lantern on top; walk bollards
     ===================================================================== */
  const lampHeads = [], glassBoxes = [];        // glassBoxes: flickering lantern glass [x, y, z, w, h, d] (one instanced draw)
  {
    const post = [], gold = [], glass = [];
    post.push(redLathe([[0.32, 0], [0.32, 0.18], [0.27, 0.22], [0.27, 0.5], [0.3, 0.54], [0, 0.56]], 0.25));
    gold.push(lathe([[0.12, 0.54], [0.1, 0.7], [0.075, 0.9], [0.07, 2.4], [0.09, 2.48], [0.07, 2.55], [0.075, 2.8], [0.11, 2.9], [0.16, 3.0], [0, 3.02]], 16));
    for (const y of [1.0, 1.6, 2.2]) gold.push(new THREE.TorusGeometry(0.085, 0.018, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0));
    // lantern: a glass box between four slender gold posts, a two-tier gold roof and a finial
    glass.push(new THREE.BoxGeometry(0.26, 0.4, 0.26).translate(0, 3.25, 0));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gold.push(new THREE.BoxGeometry(0.035, 0.46, 0.035).translate(dx * 0.15, 3.25, dz * 0.15));
    gold.push(new THREE.BoxGeometry(0.36, 0.04, 0.36).translate(0, 3.03, 0));
    gold.push(lathe([[0, 3.46], [0.3, 3.46], [0.27, 3.5], [0.2, 3.56], [0.15, 3.62], [0.2, 3.62], [0.17, 3.66], [0.1, 3.74], [0.05, 3.82], [0.035, 3.98], [0.01, 4.12], [0, 4.14]], 4).rotateY(Math.PI / 4));
    const spots = [];
    for (const s of [-1, 1]) for (let x = -(F.outX + 12); x <= F.outX + 12; x += 8) spots.push([x, -0.1, s * (PZ + 0.5)]);
    const ps = spots.map(([x, y, z]) => [x, y, z]);
    placeAll(W, mat.marble, merge(post), ps); placeAll(W, mat.gold, merge(gold), ps);
    for (const [x, y, z] of ps) glassBoxes.push([x, y + 3.25, z, 0.26, 0.4, 0.26]);
    for (const [x, , z] of spots) { glowPools.push([x, z, 3.2, 0.5]); lampHeads.push([x, 3.15, z]); }
    // walk bollards: low stone posts with a glowing lantern, lining the outer walks + the terrace edge
    const bs = [], bst = [], bgl = [];
    bst.push(lathe([[0.15, 0], [0.15, 0.1], [0.1, 0.16], [0.1, 0.62], [0.15, 0.64], [0, 0.64]], 4).rotateY(Math.PI / 4));
    bgl.push(new THREE.BoxGeometry(0.16, 0.18, 0.16).translate(0, 0.73, 0));
    bst.push(lathe([[0, 0.82], [0.17, 0.82], [0.12, 0.88], [0.06, 0.95], [0.02, 1.02], [0, 1.03]], 4).rotateY(Math.PI / 4));
    for (const s of [-1, 1]) {
      for (let x = -TX + 2; x <= TX - 2; x += 3.5) bs.push([x, -0.1, s * (TZ - 0.55)]);
      for (let x = -58; x <= 58; x += 4) for (const e of [-1, 1]) bs.push([x, -0.12, s * (WALK_A + e * 1.55)]);
      for (let x = -66; x <= 66; x += 5) for (const e of [-1, 1]) bs.push([x + (e > 0 ? 2.5 : 0), -0.12, s * (WALK_B + e * 1.8)]);
    }
    for (const sx of [-1, 1]) for (let z = -WALK_B + 3; z <= WALK_B - 3; z += 4) { if (Math.abs(z) < TZ + 1) continue; bs.push([sx * (TX + 5.3), -0.12, z]); }
    placeAll(W, mat.marble, merge(bst), bs);
    for (const [x, y, z] of bs) glassBoxes.push([x, y + 0.73, z, 0.16, 0.18, 0.16]);
    void bgl;
    for (const [x, , z] of bs) glowPools.push([x, z, 1.5, 0.45]);
  }

  /* =====================================================================
     4. THE THRONE PAVILIONS — cruciform hall, three-tier layered roofs, prasat spire, outline lights; open side salas
     ===================================================================== */
  // one roof tier (ridge along local X, z = 0): curved slopes, glazed border, pediments + gilded gable dressing at
  // both ends (front = x0). Pushes into `P` (material key → geometry list) and outline bulbs into `B` ([x, y, z, k]).
  const slopeY = (u, ye, yr) => yr - (yr - ye) * (1 - Math.pow(1 - u, 1.45));
  function roofTier(P, B, x0, x1, ze, ye, yr, { front = 1, back = 1, bulbK = 1, frontK = 0.45 } = {}) {
    const NU = 12, border = Math.min(0.9, ze * 0.22);
    const strip = (u0, u1, key) => {
      for (const s of [-1, 1]) {
        const pos = [], uv = [], idx = [];
        let acc = 0, pz = 0, py = yr;
        for (let i = 0; i <= NU; i++) {
          const u = u0 + (u1 - u0) * (i / NU), z = s * ze * u, y = slopeY(u, ye, yr);
          acc += Math.hypot(z - pz, y - py); pz = z; py = y;
          pos.push(x0, y, z, x1, y, z); uv.push(x0 / 2, acc / 2, x1 / 2, acc / 2);
        }
        for (let i = 0; i < NU; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        P.roofO = P.roofO || []; P.roofG = P.roofG || []; P[key].push(g);
      }
    };
    strip(0, 1 - border / ze, 'roofO'); strip(1 - border / ze, 1, 'roofG');
    P.gold = P.gold || []; P.orn = P.orn || [];
    // eave fascia + ridge crest
    for (const s of [-1, 1]) P.gold.push(new THREE.BoxGeometry(x1 - x0, 0.2, 0.09).translate((x0 + x1) / 2, ye - 0.07, s * (ze + 0.02)));
    P.gold.push(new THREE.BoxGeometry(x1 - x0, 0.14, 0.2).translate((x0 + x1) / 2, yr + 0.05, 0));
    for (let x = x0 + 0.9; x < x1 - 0.5; x += 0.9) P.gold.push(new THREE.ConeGeometry(0.06, 0.22, 3).translate(x, yr + 0.22, 0));
    for (let i = 0; i <= Math.floor((x1 - x0) / 0.6); i++) for (const s of [-1, 1]) B.push([x0 + 0.05 + i * 0.6, ye - 0.22, s * (ze + 0.08), bulbK * 0.8]);
    const ends = [];
    if (front) ends.push([x0, -1, frontK]);
    if (back) ends.push([x1, 1, bulbK]);
    for (const [xe, d, k] of ends) {
      // pediment: the gable triangle following the curve, inset under the overhang
      const sh = new THREE.Shape(), NC = 14;
      sh.moveTo(-ze * 0.94, ye + 0.05);
      for (let i = NC; i >= 0; i--) { const u = (i / NC) * 0.94; sh.lineTo(-ze * u, slopeY(u, ye, yr) - 0.12); }
      for (let i = 1; i <= NC; i++) { const u = (i / NC) * 0.94; sh.lineTo(ze * u, slopeY(u, ye, yr) - 0.12); }
      sh.closePath();
      const pg = new THREE.ShapeGeometry(sh, 2);
      { const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.45, uv.getY(i) * 0.45); }
      pg.rotateY(d < 0 ? -Math.PI / 2 : Math.PI / 2).translate(xe - d * 0.45, 0, 0);
      P.orn.push(pg);
      // a gilded frame round the pediment base
      P.gold.push(new THREE.BoxGeometry(0.12, 0.18, ze * 1.9).translate(xe - d * 0.42, ye + 0.02, 0));
      // rake boards (lamyong) + bai raka fins + hang hong curls + the chofa at the apex
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const u = 1 - i / 16; pts.push([xe + d * 0.04, slopeY(u, ye, yr) + 0.1, s * ze * u]); }
        P.gold.push(tube(pts, 0.1, 22, 5));
        const L = 14;
        for (let i = 1; i < L; i++) {
          const u = 1 - i / L, y = slopeY(u, ye, yr);
          P.gold.push(new THREE.ConeGeometry(0.075, 0.32, 4).translate(xe + d * 0.04, y + 0.3, s * ze * u));
        }
        for (let i = 0; i <= 14; i++) { const u = 1 - i / 14; B.push([xe + d * 0.12, slopeY(u, ye, yr) + 0.24, s * ze * u, k]); }
        P.gold.push(tube([[xe + d * 0.04, ye + 0.08, s * ze], [xe + d * 0.04, ye + 0.12, s * (ze + 0.3)], [xe + d * 0.04, ye + 0.45, s * (ze + 0.52)], [xe + d * 0.04, ye + 0.72, s * (ze + 0.4)], [xe + d * 0.04, ye + 0.7, s * (ze + 0.24)]], 0.065, 10, 5));
      }
      P.gold.push(tube([[xe, yr + 0.1, 0], [xe + d * 0.12, yr + 0.55, 0], [xe + d * 0.08, yr + 1.0, 0], [xe - d * 0.15, yr + 1.38, 0], [xe - d * 0.45, yr + 1.42, 0], [xe - d * 0.6, yr + 1.25, 0]], 0.085, 14, 6));
      P.gold.push(new THREE.SphereGeometry(0.11, 8, 5).translate(xe - d * 0.6, yr + 1.25, 0));
    }
  }
  // tiered prasat spire (gilded): redented tiers with corner antefixes, a bell, rings, a long needle
  function spireParts(sc = 1, seg = 28) {
    const g = [];
    let y = 0, r = 2.3;
    for (let k = 0; k < 5; k++) {
      const h = 1.05 - k * 0.08;
      g.push(redLathe([[r, y], [r, y + h * 0.15], [r * 0.9, y + h * 0.2], [r * 0.9, y + h * 0.8], [r * 1.04, y + h * 0.86], [r * 1.04, y + h], [r * 0.85, y + h]], 0.24));
      for (const [px, pz] of redentPts(r * 1.0, r * 0.24)) g.push(new THREE.ConeGeometry(0.11 * r / 2.3 + 0.05, 0.55 * h, 4).translate(px, y + h + 0.24 * h, pz));
      y += h; r *= 0.8;
    }
    const bell = [[r * 1.1, y], [r * 1.18, y + 0.2], [r * 1.0, y + 0.45], [r * 1.12, y + 0.6], [r * 1.05, y + 1.2], [r * 0.82, y + 1.8], [r * 0.55, y + 2.25], [r * 0.4, y + 2.4]];
    y += 2.4; let rr = r * 0.4;
    for (let k = 0; k < 9; k++) { bell.push([rr + 0.06, y], [rr + 0.06, y + 0.12], [rr - 0.02, y + 0.17]); y += 0.28 - k * 0.012; rr *= 0.88; }
    bell.push([0.09, y], [0.07, y + 1.2], [0.11, y + 1.35], [0.05, y + 1.5], [0.03, y + 3.2], [0.06, y + 3.35], [0.012, y + 4.4], [0, y + 4.5]);
    g.push(lathe(bell, seg));
    return merge(g).scale(sc, sc, sc);
  }
  function columnGeo(H, r0) {     // gilded column: a round shaft, gilded lotus capital + base ring, red bands
    const shaft = lathe([[r0 * 1.32, 0], [r0 * 1.32, 0.14], [r0 * 1.1, 0.2], [r0, 0.28], [r0 * 0.93, H - 0.45], [r0 * 0.93, H - 0.42]], 18);
    const gold = [lathe([[r0 * 0.92, H - 0.44], [r0 * 1.3, H - 0.32], [r0 * 1.62, H - 0.16], [r0 * 1.66, H - 0.08], [r0 * 1.42, H - 0.02], [r0 * 1.2, H]], 16),
      new THREE.TorusGeometry(r0 * 1.06, 0.028, 4, 16).rotateX(Math.PI / 2).translate(0, 0.26, 0)];
    const petal = new THREE.SphereGeometry(1, 5, 3); petal.scale(0.06, 0.14, 0.03);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; gold.push(place(petal, Math.cos(a) * r0 * 1.38, H - 0.26, Math.sin(a) * r0 * 1.38, -a + Math.PI / 2, 0, 0.45)); }
    return { shaft, gold: merge(gold), red: new THREE.CylinderGeometry(r0 * 0.99, r0 * 0.99, 0.12, 16, 1, true).translate(0, H - 0.55, 0) };
  }
  function archFrame(w, h, apex, t, depth = 0.08) {   // pointed gilded arch frame (door / window), facing +z
    const sh = new THREE.Shape();
    sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.bezierCurveTo(-w, h + apex * 0.55, -w * 0.25, h + apex * 0.7, 0, h + apex); sh.bezierCurveTo(w * 0.25, h + apex * 0.7, w, h + apex * 0.55, w, h); sh.lineTo(w, 0); sh.lineTo(w - t, 0);
    sh.lineTo(w - t, h); sh.bezierCurveTo(w - t, h + apex * 0.45, w * 0.2, h + apex * 0.6, 0, h + apex - t * 1.3); sh.bezierCurveTo(-w * 0.2, h + apex * 0.6, -w + t, h + apex * 0.45, -w + t, h); sh.lineTo(-w + t, 0); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 });
  }
  function archPanel(w, h, apex) {
    const sh = new THREE.Shape();
    sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.bezierCurveTo(-w, h + apex * 0.55, -w * 0.25, h + apex * 0.7, 0, h + apex); sh.bezierCurveTo(w * 0.25, h + apex * 0.7, w, h + apex * 0.55, w, h); sh.lineTo(w, 0); sh.closePath();
    return new THREE.ShapeGeometry(sh, 6);
  }
  // podium: a moulded marble block (base, die, cornice), red + gold bands, a balustrade along the top edge
  function podium(P, x0, x1, z0, z1, h, rail = true) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0;
    P.marble.push(new THREE.BoxGeometry(lx + 0.5, 0.3, lz + 0.5).translate(cx, 0.15, cz));
    P.marble.push(new THREE.BoxGeometry(lx + 0.3, 0.12, lz + 0.3).translate(cx, 0.36, cz));
    P.marble.push(new THREE.BoxGeometry(lx, h - 0.6, lz).translate(cx, 0.42 + (h - 0.6) / 2, cz));
    P.red.push(new THREE.BoxGeometry(lx + 0.04, 0.16, lz + 0.04).translate(cx, h - 0.33, cz));
    P.gold.push(new THREE.BoxGeometry(lx + 0.08, 0.05, lz + 0.08).translate(cx, h - 0.22, cz));
    P.marble.push(new THREE.BoxGeometry(lx + 0.3, 0.2, lz + 0.3).translate(cx, h - 0.1, cz));
    if (!rail) return;
    const posts = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.25));
      for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; P.marble.push(new THREE.BoxGeometry(0.16, 0.7, 0.16).translate(x, h + 0.35, z)); P.gold.push(new THREE.ConeGeometry(0.09, 0.18, 4).rotateY(Math.PI / 4).translate(x, h + 0.79, z)); }
      const ry = Math.atan2(-(bz - az), bx - ax);
      P.marble.push(place(new THREE.BoxGeometry(L, 0.08, 0.14), (ax + bx) / 2, h + 0.66, (az + bz) / 2, ry));
      for (let i = 0; i < n * 3; i++) { const t = (i + 0.5) / (n * 3), x = ax + (bx - ax) * t, z = az + (bz - az) * t; P.marble.push(new THREE.BoxGeometry(0.07, 0.5, 0.07).rotateY(ry + Math.PI / 4).translate(x, h + 0.37, z)); }
    };
    return posts;
  }
  const pavParts = (() => {
    const P = { marble: [], plaster: [], gold: [], red: [], orn: [], roofO: [], roofG: [], glass: [], dark: [] };
    const B = [];
    const PH = 1.7;                                            // podium height
    // cruciform podium: main block + transept; front stair with gilded rails
    const railA = podium(P, -2, 22, -9, 9, PH), railB = podium(P, 5, 17, -14, 14, PH);
    railA(-2, -9, -2, -3.4); railA(-2, 3.4, -2, 9); railA(-2, -9, 5, -9); railA(-2, 9, 5, 9); railA(17, -9, 22, -9); railA(17, 9, 22, 9);
    railB(5, -14, 17, -14); railB(5, 14, 17, 14); railB(5, -14, 5, -9); railB(5, 9, 5, 14); railB(17, -14, 17, -9); railB(17, 9, 17, 14);
    for (let k = 0; k < 6; k++) { const hh = PH * (k + 1) / 6; P.marble.push(new THREE.BoxGeometry(0.55, hh, 6.6).translate(-2 - (6 - k) * 0.52 + 0.26, hh / 2, 0)); }
    for (const s of [-1, 1]) {
      P.marble.push(new THREE.BoxGeometry(5.6, 0.5, 0.5).rotateZ(-0.31).translate(-3.7, PH * 0.55 + 0.25, s * 3.55));
      P.gold.push(tube([[-6.6, 0.7, s * 3.55], [-5.2, 1.1, s * 3.55], [-3.4, 1.65, s * 3.55], [-2.0, 2.15, s * 3.55]], 0.12, 20, 8));
      P.marble.push(new THREE.BoxGeometry(0.7, 1.2, 0.7).translate(-6.6, 0.6, s * 3.55));
      P.gold.push(lathe([[0, 0], [0.3, 0], [0.32, 0.12], [0.22, 0.3], [0.12, 0.55], [0.05, 0.75], [0, 0.85]], 16).translate(-6.6, 1.2, s * 3.55));
    }
    // cella walls (main wing + transept) with gold bands
    const Y0 = PH, HW = 6.0;
    P.plaster.push(new THREE.BoxGeometry(17, HW, 11).translate(11.5, Y0 + HW / 2, 0));
    P.plaster.push(new THREE.BoxGeometry(8, HW, 23).translate(11, Y0 + HW / 2, 0));
    for (const y of [Y0 + 0.35, Y0 + HW - 0.4]) { P.gold.push(new THREE.BoxGeometry(17.08, 0.09, 11.08).translate(11.5, y, 0)); P.gold.push(new THREE.BoxGeometry(8.08, 0.09, 23.08).translate(11, y, 0)); }
    P.red.push(new THREE.BoxGeometry(17.04, 0.3, 11.04).translate(11.5, Y0 + 0.14, 0)); P.red.push(new THREE.BoxGeometry(8.04, 0.3, 23.04).translate(11, Y0 + 0.14, 0));
    // the front door (gilded pointed arch, softly lit) and windows
    P.gold.push(archFrame(1.35, 3.0, 1.5, 0.2).rotateY(-Math.PI / 2).translate(2.94, Y0 + 0.05, 0));
    P.glass.push(archPanel(1.15, 2.9, 1.3).rotateY(-Math.PI / 2).translate(2.97, Y0 + 0.05, 0));
    const win = (geoF, geoP, rot, x, z) => { P.gold.push(geoF.clone().rotateY(rot).translate(x, Y0 + 1.6, z)); P.glass.push(geoP.clone().rotateY(rot).translate(x + Math.sin(rot) * 0.03, Y0 + 1.6, z + Math.cos(rot) * 0.03)); };
    const wf = archFrame(0.55, 1.6, 0.7, 0.1), wp = archPanel(0.45, 1.55, 0.6);
    for (const s of [-1, 1]) {
      for (const x of [4.5, 5.8, 16.4, 18, 19.6]) win(wf, wp, s > 0 ? 0 : Math.PI, x, s * 5.52);
      for (const x of [8.5, 11, 13.5]) win(wf, wp, s > 0 ? 0 : Math.PI, x, s * 11.52);
      win(wf, wp, -Math.PI / 2, 6.98, s * 8.3);
      win(wf, wp, Math.PI / 2, 15.02, s * 8.3);
    }
    // porch + veranda columns
    const colSpots = [];
    for (const z of [-4.5, -1.6, 1.6, 4.5]) colSpots.push([-0.6, Y0, z]);
    for (const s of [-1, 1]) {
      for (const x of [1.6, 3.9, 18.2, 20.6]) colSpots.push([x, Y0, s * 6.65]);
      for (const x of [7.4, 11, 14.6]) colSpots.push([x, Y0, s * 12.65]);
      colSpots.push([5.6, Y0, s * 12.65], [16.4, Y0, s * 12.65]);
    }
    // roofs: main wing (ridge along x), transept (ridge along z, built along x and turned)
    const tiers = (len0, len1, ze0, front) => {
      const out = []; let ze = ze0, ye = Y0 + HW + 0.05, prev = null;
      for (let t = 0; t < 3; t++) {
        const x0 = len0 + t * 1.5, x1 = len1 - t * 1.5;
        if (prev) ye = slopeY(ze / prev.ze, prev.ye, prev.yr) + 0.35;
        const yr = prev ? prev.yr + 1.5 : ye + ze * 0.78;
        out.push({ x0, x1, ze, ye, yr, front });
        prev = { ze, ye, yr }; ze *= 0.74;
      }
      return out;
    };
    const main = tiers(-1.4, 23.4, 7.9, 1), trans = tiers(-15.6, 15.6, 6.2, 1);
    for (const T of main) roofTier(P, B, T.x0, T.x1, T.ze, T.ye, T.yr, { frontK: 0.4, bulbK: 1 });
    const TP = { gold: [], orn: [], roofO: [], roofG: [] }, TB = [];
    for (const T of trans) roofTier(TP, TB, T.x0, T.x1, T.ze, T.ye, T.yr, { frontK: 1, bulbK: 1 });
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(11, 0, 0);
    for (const k of Object.keys(TP)) for (const g of TP[k]) P[k].push(g.applyMatrix4(turn));
    for (const b of TB) { const v = V3(b[0], b[1], b[2]).applyMatrix4(turn); B.push([v.x, v.y, v.z, b[3]]); }
    // the spire over the crossing
    const top = main[2].yr - 0.3;
    P.gold.push(spireParts(1.15).translate(11, top, 0));
    return { P, B, colSpots, topY: top };
  })();
  const colG = columnGeo(6.0, 0.27);
  const allCols = [];
  for (const sx of [-1, 1]) {
    const M = new THREE.Matrix4().makeRotationY(sx > 0 ? 0 : Math.PI).setPosition(sx * HALL_X, -0.1, 0);
    for (const [k, list] of Object.entries(pavParts.P)) W.putAll(mat[k], list, M);
    for (const [x, y, z, k] of pavParts.B) { const v = V3(x, y, z).applyMatrix4(M); bulbs.push([v.x, v.y, v.z, k]); }
    for (const [x, y, z] of pavParts.colSpots) { const v = V3(x, y, z).applyMatrix4(M); allCols.push([v.x, v.y, v.z]); }
    // light pooled on the terrace in front of the stair
    glowPools.push([sx * (HALL_X - 7), 0, 6, 0.45]);
  }

  // open salas: a pair beside each pavilion (and the gate pavilions in the wall reuse them)
  function salaParts(L, Wd, H, tiersN = 2) {
    const P = { marble: [], plaster: [], gold: [], red: [], orn: [], roofO: [], roofG: [], glass: [], dark: [] }, B = [];
    podium(P, -0.6, L + 0.6, -Wd / 2 - 0.6, Wd / 2 + 0.6, 0.9, false);
    const cols = [];
    for (const x of [0.2, L / 2, L - 0.2]) for (const s of [-1, 1]) cols.push([x, 0.9, s * (Wd / 2 - 0.2)]);
    let ze = Wd / 2 + 1.0, ye = 0.9 + H + 0.05, prev = null;
    for (let t = 0; t < tiersN; t++) {
      if (prev) ye = slopeY(ze / prev.ze, prev.ye, prev.yr) + 0.3;
      const yr = prev ? prev.yr + 1.1 : ye + ze * 0.8;
      roofTier(P, B, -0.9 + t * 1.0, L + 0.9 - t * 1.0, ze, ye, yr, { frontK: 1, bulbK: 1 });
      prev = { ze, ye, yr }; ze *= 0.72;
    }
    P.red.push(new THREE.BoxGeometry(L + 0.2, 0.35, Wd + 0.2).translate(L / 2, 0.9 + H - 0.2, 0));
    return { P, B, cols, top: prev.yr };
  }
  const salaCols = [];
  {
    const S = salaParts(6, 4.4, 3.4, 2);
    const spots = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([sx * (HALL_X + 5.5), sz * 20.5, sx > 0 ? 0 : Math.PI]);
    PR.salas.push(...spots);
    for (const [x, z, ry] of spots) {
      const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x - Math.cos(ry) * 3, -0.1, z);
      for (const [k, list] of Object.entries(S.P)) WR.putAll(mat[k], list, M);
      for (const [bx, by, bz, k] of S.B) { const v = V3(bx, by, bz).applyMatrix4(M); bulbs.push([v.x, v.y, v.z, k]); }
      for (const [cx, cy, cz] of S.cols) { const v = V3(cx, cy, cz).applyMatrix4(M); salaCols.push([v.x, v.y, v.z, 0, [0.63, 3.4 / 6.0, 0.63]]); }
      glowPools.push([x, z, 4, 0.35]);
    }
  }

  /* =====================================================================
     5. YAKSHA GUARDIANS — tiered crowns, fangs, ear flares, armour, both hands on a planted club
     ===================================================================== */
  const giantGeo = (() => {
    const skin = [], gold = [], white = [];
    for (const s of [-1, 1]) {
      gold.push(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2).scale(0.26, 0.2, 0.42).translate(s * 0.44, 0, 0.14));                  // shoes
      skin.push(lathe([[0.2, 0.15], [0.24, 0.5], [0.28, 0.95], [0.25, 1.25], [0.3, 1.6], [0.36, 2.05], [0.38, 2.4]], 20).translate(s * 0.44, 0, 0));
      gold.push(new THREE.TorusGeometry(0.22, 0.05, 8, 20).rotateX(Math.PI / 2).translate(s * 0.44, 0.38, 0));
      gold.push(new THREE.SphereGeometry(0.2, 14, 10).scale(1.1, 1.0, 0.7).translate(s * 0.44, 1.25, 0.16));                                       // knee guards
    }
    // pha nung (wrapped skirt) + hanging front panel, belt, buckle
    gold.push(lathe([[0.98, 2.15], [1.02, 2.25], [0.92, 2.6], [0.82, 3.0], [0.76, 3.35], [0.7, 3.45]], 32));
    gold.push(new THREE.BoxGeometry(0.42, 1.3, 0.08).translate(0, 2.6, 0.9).rotateX(0));
    gold.push(new THREE.TorusGeometry(0.76, 0.07, 6, 20).rotateX(Math.PI / 2).translate(0, 3.45, 0));
    gold.push(new THREE.SphereGeometry(0.2, 16, 10).scale(1.3, 1, 0.6).translate(0, 3.42, 0.74));
    // torso, collar, crossed chest straps, epaulettes with upturned horns
    skin.push(lathe([[0.72, 3.4], [0.78, 3.7], [0.9, 4.2], [0.98, 4.6], [0.92, 4.95], [0.55, 5.1], [0.3, 5.15]], 32).scale(1, 1, 0.74));
    gold.push(lathe([[0.42, 5.12], [0.78, 5.04], [1.0, 4.88], [1.02, 4.8], [0.82, 4.86], [0.5, 4.98], [0.4, 5.0]], 32).scale(1, 1, 0.78));
    for (const s of [-1, 1]) gold.push(new THREE.BoxGeometry(0.16, 1.7, 0.06).rotateZ(s * 0.55).translate(0, 4.2, 0.7));
    gold.push(new THREE.SphereGeometry(0.22, 16, 10).scale(1, 1, 0.4).translate(0, 4.25, 0.74));
    for (const s of [-1, 1]) {
      gold.push(new THREE.SphereGeometry(0.42, 16, 10).scale(1, 0.6, 0.9).translate(s * 1.0, 4.85, 0));
      gold.push(tube([[s * 1.25, 4.9, 0], [s * 1.5, 5.05, 0], [s * 1.62, 5.35, 0], [s * 1.55, 5.62, 0]], 0.06, 12, 6));
      // arms: shoulder → elbow → hands resting on the club pommel
      skin.push(tube([[s * 1.02, 4.8, 0], [s * 1.12, 4.3, 0.15], [s * 1.06, 3.95, 0.45]], 0.24, 10, 8));
      skin.push(tube([[s * 1.06, 3.95, 0.45], [s * 0.7, 3.88, 0.85], [s * 0.26, 3.86, 1.0]], 0.2, 10, 8));
      gold.push(new THREE.TorusGeometry(0.22, 0.05, 8, 18).rotateY(Math.PI / 2 * 0.6 * s).translate(s * 0.75, 3.88, 0.8));
      gold.push(new THREE.TorusGeometry(0.25, 0.05, 8, 18).rotateX(Math.PI / 2).translate(s * 1.1, 4.45, 0.1));
      skin.push(new THREE.SphereGeometry(0.21, 10, 7).scale(1, 0.9, 1.2).translate(s * 0.2, 3.88, 1.02));
    }
    // club (krabong): planted in front, banded
    gold.push(lathe([[0.12, 0], [0.15, 0.2], [0.13, 0.4], [0.16, 1.2], [0.15, 1.3], [0.18, 2.4], [0.17, 2.5], [0.2, 3.6], [0.17, 3.7], [0, 3.72]], 8).translate(0, 0, 1.0));
    gold.push(new THREE.SphereGeometry(0.24, 16, 10).translate(0, 4.15, 1.0));
    gold.push(new THREE.ConeGeometry(0.12, 0.45, 8).translate(0, 4.55, 1.0));
    // head: jaw + cranium, bulging eyes, broad nose, fangs, ear flares, crown band + tall tiered crown (chada)
    skin.push(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 16).translate(0, 5.25, 0.02));
    skin.push(new THREE.SphereGeometry(0.56, 20, 14).scale(1, 1.08, 0.95).translate(0, 5.85, 0.05));
    skin.push(new THREE.SphereGeometry(0.16, 14, 10).scale(1.3, 0.8, 1).translate(0, 5.8, 0.56));
    for (const s of [-1, 1]) {
      white.push(new THREE.SphereGeometry(0.13, 16, 12).translate(s * 0.21, 5.98, 0.47));
      gold.push(new THREE.TorusGeometry(0.135, 0.03, 6, 16).translate(s * 0.21, 5.98, 0.5));
      gold.push(new THREE.BoxGeometry(0.3, 0.06, 0.08).rotateZ(-s * 0.35).translate(s * 0.23, 6.16, 0.5));                                       // brows
      white.push(new THREE.ConeGeometry(0.05, 0.24, 8).translate(s * 0.16, 5.58, 0.49));                                                             // fangs
      gold.push(new THREE.ConeGeometry(0.18, 0.75, 4).scale(0.35, 1, 1).rotateX(Math.PI).rotateZ(-s * 0.35).translate(s * 0.62, 5.7, 0.0));         // ear flares
    }
    white.push(new THREE.BoxGeometry(0.34, 0.05, 0.06).translate(0, 5.52, 0.52));
    gold.push(new THREE.TorusGeometry(0.57, 0.07, 6, 20).rotateX(Math.PI / 2).translate(0, 6.22, 0.03));
    const crown = [[0.6, 6.2], [0.63, 6.36], [0.5, 6.46], [0.53, 6.62], [0.42, 6.72], [0.45, 6.88], [0.34, 6.98], [0.36, 7.14], [0.27, 7.24], [0.28, 7.4], [0.2, 7.5], [0.21, 7.64], [0.13, 7.74], [0.09, 8.2], [0.11, 8.3], [0.05, 8.7], [0, 8.85]];
    gold.push(lathe(crown, 18).translate(0, 0, 0.03));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.5; gold.push(new THREE.ConeGeometry(0.07, 0.42, 4).translate(Math.cos(a) * 0.55, 6.55, Math.sin(a) * 0.55 + 0.03)); }
    gold.push(new THREE.ConeGeometry(0.3, 0.9, 4).scale(1, 1, 0.3).rotateX(-0.4).translate(0, 6.2, -0.5));                                          // back flame
    return { skin: merge(skin), gold: merge(gold), white: merge(white) };
  })();
  {
    const g = [];      // [x, z, ry, colour]
    for (const sx of [-1, 1]) for (const s of [-1, 1]) g.push([sx * (HALL_X - 3.4 - 0.1), s * 4.9, sx > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? 0x2f9a62 : 0xc23a2a]);
    for (const sz of [-1, 1]) for (const e of [-1, 1]) g.push([e * 4.6, sz * (WALL_Z - 3.2), sz > 0 ? Math.PI : 0, e > 0 ? 0x3a6ad0 : 0xe8e2d4]);
    const PL = 1.5;
    const plinth = redLathe([[1.05, 0], [1.05, 0.2], [0.95, 0.28], [0.9, PL - 0.3], [1.0, PL - 0.2], [1.0, PL], [0, PL]], 0.22);
    for (const [x, z, ry] of g) W.put(mat.marble, place(plinth, x, -0.1, z, ry));
    const spots = g.map(([x, z, ry]) => [x, PL - 0.1, z, ry, 0.95]);
    const skinM = enhance(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.15 }), { upK: 0.7, upFall: 3.5, upWrap: 0.5, ...UP });
    const whiteM = new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.35, emissive: 0x3a3630 });
    inst(giantGeo.skin, skinM, spots, root, { colors: (i) => new THREE.Color(g[i][3]) });
    inst(giantGeo.gold, mat.gold, spots, root);
    inst(giantGeo.white, whiteM, spots, root);
    for (const [x, z] of g) glowPools.push([x, z, 2.6, 0.35]);
  }

  /* =====================================================================
     6. TOPIARY + PARTERRES — tiered (mai dat), balls in gilded urns, elephants; flower beds in clipped hedges
     ===================================================================== */
  const flowerTips = [];
  {
    const T = { leaf: [], bark: [] };
    const tiered = (() => {
      const lf = [], bk = [];
      bk.push(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 8).translate(0, 1.3, 0));
      const lv = [[0.72, 0.36, 0.7], [0.58, 0.3, 1.35], [0.44, 0.25, 1.95], [0.3, 0.2, 2.45], [0.16, 0.22, 2.85]];
      lv.forEach(([r, h, y], k) => lf.push(blob(r, h, r, 3, k * 3.1 + 1).translate(0, y, 0)));
      return { leaf: merge(lf), bark: merge(bk) };
    })();
    const ball = blob(0.72, 0.7, 0.72, 3, 5.5, 0.06).translate(0, 1.35, 0);
    const urn = lathe([[0, 0], [0.42, 0], [0.45, 0.08], [0.32, 0.18], [0.3, 0.3], [0.42, 0.5], [0.55, 0.68], [0.58, 0.74], [0.52, 0.78], [0.5, 0.72], [0, 0.72]], 32);
    const tSpots = [], bSpots = [];
    for (const s of [-1, 1]) for (let x = -(F.outX + 14); x <= F.outX + 14.01; x += 4.5) {
      const z = s * (POOL_Z1 + 1.6);
      ((Math.round(x / 4.5) & 1) === 0 ? tSpots : bSpots).push([x, -0.1, z, R() * TAU, 0.95 + R() * 0.15]);
    }
    PR.tiered.push(...tSpots); PR.balls.push(...bSpots);
    placeAll(WR, mat.leaf, tiered.leaf, tSpots); placeAll(WR, mat.bark, tiered.bark, tSpots);
    placeAll(WR, mat.leaf, ball, bSpots); placeAll(WR, mat.gold, urn, bSpots);
    for (const [x, , z] of [...tSpots, ...bSpots]) glowPools.push([x, z, 1.8, 0.4]);
    // topiary elephants at the ends of the parterres
    const ele = (() => {
      const lf = [];
      lf.push(blob(1.25, 0.85, 0.75, 3, 2.2, 0.05).translate(0, 2.0, 0));          // body (long axis x)
      lf.push(blob(0.6, 0.62, 0.55, 3, 4.1, 0.05).translate(1.35, 2.45, 0));        // head
      for (const s of [-1, 1]) lf.push(blob(0.12, 0.5, 0.42, 2, 6 + s, 0.05).translate(1.2, 2.45, s * 0.6));   // ears
      lf.push(tube([[1.85, 2.45, 0], [2.05, 1.9, 0], [2.0, 1.2, 0], [2.15, 0.75, 0]], 0.17, 16, 10));        // trunk
      for (const [lx, lz] of [[-0.75, -0.42], [-0.75, 0.42], [0.75, -0.42], [0.75, 0.42]]) lf.push(new THREE.CylinderGeometry(0.27, 0.3, 1.7, 12).translate(lx, 0.85, lz));
      lf.push(tube([[-1.25, 2.2, 0], [-1.45, 1.8, 0], [-1.48, 1.4, 0]], 0.06, 8, 6));
      return merge(lf);
    })();
    const eSpots = [];
    for (const s of [-1, 1]) for (const e of [-1, 1]) eSpots.push([e * 40, -0.1, s * (Z1 + 9), e > 0 ? Math.PI : 0, 1.05]);
    placeAll(WR, mat.leaf, ele, eSpots); PR.ele.push(...eSpots);
    WR.putAll(mat.marble, eSpots.map(([x, , z]) => new THREE.BoxGeometry(4.4, 0.28, 2.2).translate(x, 0.02, z)));
    for (const [x, , z] of eSpots) glowPools.push([x, z, 3.2, 0.45]);
    // parterres: clipped hedge borders round beds of flowers
    const beds = [];
    for (const s of [-1, 1]) for (const cx of [-27, -9, 9, 27]) beds.push([cx, s * (Z1 + 9), 15, 4.6]);
    const hedge = (L) => { const g = new THREE.BoxGeometry(L, 0.55, 0.45, Math.max(2, Math.round(L * 1.5)), 3, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.08 * Math.sin(x * 7.3 + z * 11) * Math.cos(y * 9 + x * 3.1); p.setXYZ(i, x, y * (y > 0 ? k : 1), z * k); } g.computeVertexNormals(); return g; };
    const flowers = [];
    PR.beds.push(...beds);
    for (const [cx, cz, L, D] of beds) {
      for (const s of [-1, 1]) { T.leaf.push(hedge(L).translate(cx, 0.2, cz + s * D / 2)); T.leaf.push(hedge(D).rotateY(Math.PI / 2).translate(cx + s * L / 2, 0.2, cz)); }
      T.leaf.push(hedge(L - 1).translate(cx, 0.12, cz).scale(1, 0.7, 1));
      for (const e of [-1, 1]) for (const s of [-1, 1]) T.leaf.push(blob(0.42, 0.42, 0.42, 2, cx + s + e, 0.06).translate(cx + e * L / 2, 0.42, cz + s * D / 2));
      W.put(mat.dark, place(new THREE.BoxGeometry(L - 0.4, 0.08, D - 0.4), cx, -0.07, cz));
      for (let i = 0; i < 230; i++) {
        const x = cx + (R() - 0.5) * (L - 0.9), z = cz + (R() - 0.5) * (D - 0.9);
        if (Math.abs(z - cz) < 0.45) continue;
        const band = Math.floor(Math.abs(z - cz) / ((D - 0.9) / 4)) + (Math.abs(x - cx) > L / 4 ? 1 : 0);
        flowers.push([x, 0.02 + R() * 0.12, z, R() * TAU, 0.8 + R() * 0.5, band]);
      }
    }
    const fl = (() => {
      const pos = [0, 0.025, 0];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, r = k % 2 ? 0.045 : 0.12; pos.push(Math.cos(a) * r, k % 2 ? 0.005 : 0.02, Math.sin(a) * r); }
      const idx = []; for (let k = 0; k < 10; k++) idx.push(0, 1 + ((k + 1) % 10), 1 + k);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return merge([g, new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3, 1, true).translate(0, -0.1, 0)]);
    })();
    const flM = enhance(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), { upK: 0.55, upFall: 0.8, upWrap: 0.8, ...UP });
    const PAL = [0xd8304e, 0xf2c12e, 0xf4f0ea, 0xff7aa8, 0x9a52e0, 0xff8a2a];
    inst(fl, flM, flowers, root, { colors: (i, p) => new THREE.Color(PAL[(p[5] + Math.floor((p[0] + 60) / 5)) % PAL.length]) });
    for (const [cx, cz, L] of beds) for (const e of [-0.33, 0, 0.33]) glowPools.push([cx + e * L, cz, 2.6, 0.22]);
    WR.putAll(mat.leaf, T.leaf);
  }

  /* =====================================================================
     7. GOLDEN CHEDIS on a long terrace; white prangs; the palace wall with bai sema merlons, gates, corner forts
     ===================================================================== */
  const chediParts = (() => {
    const white = [], gold = [];
    white.push(redLathe([[2.5, 0], [2.5, 0.45], [2.35, 0.52], [2.35, 0.95], [2.15, 1.02], [2.15, 1.42], [1.95, 1.5], [1.95, 1.62], [0, 1.62]], 0.2));
    gold.push(lathe([[1.85, 1.62], [1.92, 1.72], [1.8, 1.84], [1.92, 1.96], [1.82, 2.08], [2.02, 2.2], [2.14, 2.42], [2.14, 2.62], [2.02, 3.0], [1.8, 3.5], [1.52, 4.0], [1.22, 4.45], [0.98, 4.82], [0.84, 5.08], [0.78, 5.22], [0, 5.22]], 28));
    gold.push(redLathe([[0.78, 5.22], [0.78, 5.6], [0.88, 5.66], [0.88, 5.76], [0.7, 5.8], [0, 5.8]], 0.22));
    const ring = [[0.6, 5.8]]; let y = 5.84, r = 0.58;
    for (let k = 0; k < 7; k++) { ring.push([r + 0.05, y], [r + 0.05, y + 0.08], [r - 0.02, y + 0.12]); y += 0.36 - k * 0.012; r *= 0.86; }
    ring.push([0.12, y], [0.09, y + 0.7], [0.06, y + 1.7], [0.1, y + 1.82], [0.05, y + 1.98], [0.015, y + 3.1], [0, y + 3.2]);
    gold.push(lathe(ring, 16));
    return { white: merge(white), gold: merge(gold) };
  })();
  {
    const CL = 92;
    const lampPts = [];
    for (const s of [-1, 1]) {
      const z = s * CHEDI_Z;
      // the chedi terrace: a raised marble platform with a balustrade and steps
      const P = { marble: [], gold: [], red: [] };
      const rail = podium(P, -CL / 2, CL / 2, -2.8, 2.8, 0.9);
      rail(-CL / 2, -2.8, CL / 2, -2.8); rail(-CL / 2, 2.8, CL / 2, 2.8);
      const M = new THREE.Matrix4().makeTranslation(0, -0.1, z);
      for (const [k, list] of Object.entries(P)) WR.putAll(mat[k], list, M);
      for (let x = -CL / 2 + 0.6; x <= CL / 2 - 0.6; x += 0.8) for (const e of [-1, 1]) lampPts.push(new THREE.OctahedronGeometry(0.05, 0).translate(x, 0.86, z + e * 2.58));
    }
    const spots = [];
    for (const s of [-1, 1]) for (let x = -40; x <= 40; x += 10) spots.push([x, 0.8, s * CHEDI_Z, 0, 0.95]);
    placeAll(WR, mat.marble, chediParts.white, spots); placeAll(WR, mat.gold, chediParts.gold, spots); PR.chedis.push(...spots);
    WR.put(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(3) }), merge(lampPts));
    for (const [x, , z] of spots) glowPools.push([x, z, 4.2, 0.4]);
  }
  const prangGeo = (() => {
    const white = [], gold = [];
    const prof = [[3.4, 0], [3.4, 0.6], [3.15, 0.7], [3.15, 1.4], [2.85, 1.5], [2.85, 2.2], [2.6, 2.3], [2.45, 2.4], [2.4, 4.0], [2.6, 4.12], [2.6, 4.3], [2.3, 4.4]];
    let y = 4.4, r = 2.3;
    for (let k = 0; k < 7; k++) { prof.push([r * 0.94, y + 0.1], [r * 0.9, y + 0.95], [r * 1.02, y + 1.05], [r * 1.02, y + 1.18], [r * 0.86, y + 1.25]); y += 1.25; r *= 0.84; }
    prof.push([0.48, y + 0.1], [0.36, y + 0.8], [0, y + 0.85]);
    white.push(redLathe(prof, 0.24));
    // corner antefixes on every tier
    y = 4.4; r = 2.3;
    for (let k = 0; k < 7; k++) { for (const [px, pz] of redentPts(r * 1.02, r * 0.245)) white.push(new THREE.ConeGeometry(0.12 * r / 2.3 + 0.04, 0.5, 4).translate(px, y + 1.42, pz)); y += 1.25; r *= 0.84; }
    // niches with gilded frames on the four faces of the cella
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; const f = archFrame(0.55, 0.9, 0.5, 0.1, 0.06); f.translate(0, 2.55, 2.42); f.rotateY(a); gold.push(f); }
    gold.push(lathe([[0.2, y + 0.75], [0.14, y + 1.6], [0.24, y + 1.75], [0.1, y + 2.0], [0.05, y + 3.4], [0, y + 3.8]], 12));
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; gold.push(new THREE.ConeGeometry(0.05, 0.9, 6).rotateZ(0.5).rotateY(a).translate(Math.cos(a) * 0.18, y + 2.0, Math.sin(a) * 0.18)); }
    return { white: merge(white), gold: merge(gold), h: y + 3.8 };
  })();
  const prangSpots = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prangSpots.push([sx * 54, -0.1, sz * CHEDI_Z, 0, 1.15]);
  {
    placeAll(WR, mat.plaster, prangGeo.white, prangSpots); placeAll(WR, mat.gold, prangGeo.gold, prangSpots);
    for (const [x, , z] of prangSpots) glowPools.push([x, z, 6, 0.4]);
  }
  // the wall: plinth, body, cornice, bai sema merlons; sconce lamps on the inner face; gates + corner forts
  const wallLamps = [];
  {
    const merlon = merge([new THREE.BoxGeometry(1.0, 0.75, 1.3).translate(0, 0.375, 0), new THREE.ConeGeometry(0.7, 0.75, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.92).translate(0, 1.12, 0)]);
    const runs = [[WALL_X * 2, 0, -WALL_Z, 0], [WALL_X * 2, 0, WALL_Z, 0], [WALL_Z * 2, -WALL_X, 0, Math.PI / 2], [WALL_Z * 2, WALL_X, 0, Math.PI / 2]];
    for (const [len, x, z, ry] of runs) {
      const gapAt = ry === 0 ? 0 : null;           // the gates in the long walls
      const segs = gapAt === null ? [[-len / 2, len / 2]] : [[-len / 2, -6], [6, len / 2]];
      for (const [a, b] of segs) {
        const L = b - a, m = (a + b) / 2, cx = x + Math.cos(ry) * m, cz = z - Math.sin(ry) * m;
        WR.put(mat.plaster, place(new THREE.BoxGeometry(L, 5, 1.2), cx, 2.4, cz, ry));
        WR.put(mat.plaster, place(new THREE.BoxGeometry(L, 0.5, 1.6), cx, 0.15, cz, ry));
        WR.put(mat.plaster, place(new THREE.BoxGeometry(L, 0.25, 1.5), cx, 4.95, cz, ry));
        WR.put(mat.red, place(new THREE.BoxGeometry(L, 0.12, 1.52), cx, 4.75, cz, ry));
        const n = Math.floor(L / 2.4);
        for (let i = 0; i < n; i++) { const t = a + 1.2 + i * 2.4, px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t; WR.put(mat.plaster, place(merlon, px, 5.05, pz, ry)); }
        for (let t = a + 4; t < b - 2; t += 8) {
          const px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
          const inX = ry === 0 ? 0 : -Math.sign(x) * 0.72, inZ = ry === 0 ? -Math.sign(z) * 0.72 : 0;
          wallLamps.push([px + inX, 3.2, pz + inZ]);
        }
      }
    }
    // gate towers: a deep gateway with a gilded arch, a three-tier roof and a spire
    const GP = { marble: [], plaster: [], gold: [], red: [], orn: [], roofO: [], roofG: [], glass: [], dark: [] }, GB = [];
    GP.plaster.push(new THREE.BoxGeometry(12, 7, 3.4).translate(0, 3.5, 0));
    GP.dark.push(archPanel(1.9, 3.4, 1.4).translate(0, 0, 1.72));
    GP.gold.push(archFrame(2.15, 3.4, 1.6, 0.26).translate(0, 0, 1.7));
    GP.red.push(new THREE.BoxGeometry(12.1, 0.3, 3.5).translate(0, 6.8, 0));
    { let ze = 2.8, ye = 7.05, prev = null; for (let t = 0; t < 3; t++) { if (prev) ye = slopeY(ze / prev.ze, prev.ye, prev.yr) + 0.3; const yr = prev ? prev.yr + 1.0 : ye + ze * 0.8; roofTier(GP, GB, -6.6 + t * 1.2, 6.6 - t * 1.2, ze, ye, yr, { frontK: 1, bulbK: 1 }); prev = { ze, ye, yr }; ze *= 0.72; } GP.gold.push(spireParts(0.55, 16).translate(0, prev.yr - 0.3, 0)); }
    for (const sz of [-1, 1]) {
      const M = new THREE.Matrix4().makeRotationY(sz > 0 ? Math.PI : 0).setPosition(0, -0.1, sz * WALL_Z);
      for (const [k, list] of Object.entries(GP)) WR.putAll(mat[k], list, M);
      for (const [bx, by, bz, k] of GB) { const v = V3(bx, by, bz).applyMatrix4(M); bulbs.push([v.x, v.y, v.z, k * 0.8]); }
      glowPools.push([0, sz * (WALL_Z - 3), 7, 0.45]);
    }
    // corner forts: octagonal towers, crenellated, with a little gilded spire
    const fort = merge([lathe([[5.2, 0], [5.2, 0.6], [4.7, 0.8], [4.5, 8.2], [4.9, 8.4], [4.9, 8.8], [0, 8.8]], 8).rotateY(Math.PI / 8)]);
    const fmer = [];
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; fmer.push(place(merlon, Math.cos(a) * 4.5, 8.8, Math.sin(a) * 4.5, -a)); }
    const fm = merge(fmer);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { WR.put(mat.plaster, place(fort, sx * WALL_X, -0.1, sz * WALL_Z)); WR.put(mat.plaster, place(fm, sx * WALL_X, -0.1, sz * WALL_Z)); WR.put(mat.gold, spireParts(0.4, 12).translate(sx * WALL_X, 8.6, sz * WALL_Z)); }
  }

  /* =====================================================================
     8. TREES — golden-shower trees in the garden (they drop petals), palms along the wall, rain trees beyond it
     ===================================================================== */
  const blossomPts = [];
  {
    // golden shower (ratchaphruek): a spreading canopy of leafy clumps hung with yellow flower chains
    const can = [], br = [], hang = [];
    const r = rng(41);
    br.push(tube([[0, 0, 0], [0.15, 1.6, 0.05], [0.1, 2.8, 0]], 0.22, 10, 10));
    const tips = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r(), out = 1.6 + r() * 0.8, up = 4.2 + r() * 1.2;
      const tip = [Math.cos(a) * out, up, Math.sin(a) * out];
      br.push(tube([[0.1, 2.6, 0], [Math.cos(a) * out * 0.5, 3.4 + r() * 0.4, Math.sin(a) * out * 0.5], tip], 0.11, 10, 8));
      tips.push(tip);
    }
    for (const [x, y, z] of tips) {
      can.push(blob(1.5, 0.85, 1.5, 2, x + z, 0.12).translate(x, y + 0.4, z));
      for (let j = 0; j < 9; j++) { const a = r() * TAU, rr = 0.5 + r() * 0.9; hang.push(new THREE.CylinderGeometry(0.07, 0.015, 0.75 + r() * 0.4, 5).translate(x + Math.cos(a) * rr, y - 0.35 - r() * 0.2, z + Math.sin(a) * rr)); }
    }
    can.push(blob(1.6, 0.9, 1.6, 2, 9.1, 0.12).translate(0, 5.6, 0));
    const T = { can: merge(can), br: merge(br), hang: merge(hang), tips };
    const spots = [];
    for (const s of [-1, 1]) {
      for (const x of [-52, -32, -12, 12, 32, 52]) spots.push([x + (R() - 0.5) * 3, -0.1, s * (WALK_B + 6 + R() * 2), R() * TAU, 0.95 + R() * 0.25]);
      for (const x of [-1, 1]) spots.push([x * (TX + 3.5), -0.1, s * (Z1 + 10 + R()), R() * TAU, 0.8 + R() * 0.15], [x * (HALL_X + 15), -0.1, s * (22 + R() * 2), R() * TAU, 0.85 + R() * 0.15]);
    }
    const canM = enhance(new THREE.MeshStandardMaterial({ color: 0x35542a, roughness: 0.9 }), { tri: leafTex, triScale: 0.8, upK: 0.3, upFall: 2.5, upWrap: 0.5, upCol: 0xffe0a0, upY: -0.1, upCentre: [0, 0, 0] });
    const hangM = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x7a5a08, roughness: 0.6 });
    inst(T.can, canM, spots, root); PR.trees.push(...spots);
    inst(T.br, mat.bark, spots, root);
    inst(T.hang, hangM, spots, root);
    for (const [x, y, z, ry, sc] of spots) {
      glowPools.push([x, z, 3, 0.3]);
      for (const [tx, ty, tz] of T.tips) { const c = Math.cos(ry), sn = Math.sin(ry); blossomPts.push(V3(x + (tx * c + tz * sn) * sc, y + ty * sc, z + (-tx * sn + tz * c) * sc)); }
    }
    // palms along the inside of the wall, swaying
    const palmT = [tube([[0, 0, 0], [0.3, 4, 0], [0.9, 8, 0], [1.7, 11.2, 0]], 0.18, 24, 8)], palmF = [];
    {
      const top = V3(1.7, 11.2, 0);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU, droop = 0.55 + (k % 3) * 0.2, fp = [], fi = [], N = 10;
        for (let i = 0; i <= N; i++) { const t = i / N, d = t * 3.4, y = Math.sin(t * Math.PI * 0.6) * 0.9 - t * t * 2.4 * droop, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.04; fp.push(d, y, -w, d, y + 0.08, 0, d, y, w); }
        for (let i = 0; i < N; i++) { const b = i * 3; fi.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi); fg.computeVertexNormals();
        _o.position.copy(top); _o.rotation.set(0, a, 0.15); _o.scale.setScalar(1); _o.updateMatrix(); palmF.push(fg.applyMatrix4(_o.matrix));
      }
    }
    const pSpots = [];
    for (const s of [-1, 1]) for (let x = -88; x <= 88; x += 11) pSpots.push([x + (R() - 0.5) * 3, -0.1, s * (WALL_Z - 4 - R() * 3), R() * TAU, 0.85 + R() * 0.35]);
    for (const sx of [-1, 1]) for (let z = -50; z <= 50; z += 12) pSpots.push([sx * (WALL_X - 4 - R() * 3), -0.1, z + (R() - 0.5) * 3, R() * TAU, 0.85 + R() * 0.35]);
    const fM = new THREE.MeshStandardMaterial({ color: 0x2c4a26, roughness: 0.8, side: THREE.DoubleSide });
    fM.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float h = max(position.y - 10.2, 0.0); vec3 ip = instanceMatrix[3].xyz;
          transformed.x += sin(uTime * 0.8 + ip.x * 0.2 + position.z) * 0.08 * h; transformed.y += sin(uTime * 1.3 + ip.z * 0.3 + position.x) * 0.04 * h; }`);
    };
    fM.customProgramCacheKey = () => 'palPalm';
    inst(merge(palmT), new THREE.MeshStandardMaterial({ color: 0x5a4c3e, roughness: 0.95 }), pSpots, root);
    inst(merge(palmF), fM, pSpots, root);
    // rain trees: wide dark umbrella canopies, a ring outside the wall (and behind the pavilions) out to the haze
    const canopy = blob(1, 0.46, 1, 2, 3.3, 0.16);
    const trunk = new THREE.CylinderGeometry(0.035, 0.07, 1, 8).translate(0, 0.5, 0);
    const rs = [];
    for (let i = 0; i < 110; i++) {
      const a = R() * TAU, rr = 112 + R() * 120, x = Math.cos(a) * rr * 1.2, z = Math.sin(a) * rr * 0.95;
      if (Math.abs(x) < WALL_X + 6 && Math.abs(z) < WALL_Z + 6) continue;
      rs.push([x, z, 6 + R() * 6, 7 + R() * 6]);
    }
    for (let i = 0; i < 26; i++) { const sx = i % 2 ? 1 : -1; rs.push([sx * (66 + R() * 26), (R() - 0.5) * 100, 5 + R() * 3, 7 + R() * 4]); }
    const cIm = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ color: 0x1f3220, roughness: 0.95 }), rs.length);
    const tIm = new THREE.InstancedMesh(trunk, mat.bark, rs.length);
    rs.forEach(([x, z, rad, h], i) => {
      _o.position.set(x, h, z); _o.rotation.set(0, R() * TAU, 0); _o.scale.set(rad, rad, rad); _o.updateMatrix(); cIm.setMatrixAt(i, _o.matrix);
      _o.position.set(x, -0.1, z); _o.scale.set(rad, h, rad); _o.updateMatrix(); tIm.setMatrixAt(i, _o.matrix);
    });
    cIm.computeBoundingSphere(); tIm.computeBoundingSphere(); root.add(cIm, tIm);
  }

  /* =====================================================================
     9. THE SKYLINE — a great floodlit prang + satellites off to one side of each end, a golden mount, spires, city glow
     ===================================================================== */
  {
    const S = batch();
    const glowWhite = enhance(new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.7, emissive: 0x2a2218 }), { tri: plasterTex, triScale: 0.08, upK: 1.5, upFall: 30, upWrap: 0.6, upCol: 0xffd9a8, upY: -0.1, upCentre: [0, 0, 0] });
    const glowGold = enhance(new THREE.MeshStandardMaterial({ color: 0xe8b04e, metalness: 0.75, roughness: 0.35, emissive: 0x3a2006 }), { upK: 2.2, upFall: 40, upWrap: 0.6, upCol: 0xffb060, upY: -0.1, upCentre: [0, 0, 0] });
    const hillM = new THREE.MeshStandardMaterial({ color: 0x18261a, roughness: 1 });
    const halos = [];
    const halo = new THREE.SpriteMaterial({ map: softTexture(0, 256), color: 0xffb867, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const s of [-1, 1]) {
      // a great prang with four satellites, off to one side beyond each pavilion (never behind the ball)
      const cx = s * 225, cz = -s * 118;
      S.put(glowWhite, place(prangGeo.white, cx, -0.1, cz, 0, 0, 0, 3.6)); S.put(glowGold, place(prangGeo.gold, cx, -0.1, cz, 0, 0, 0, 3.6));
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { S.put(glowWhite, place(prangGeo.white, cx + dx * 22, -0.1, cz + dz * 22, 0, 0, 0, 1.6)); S.put(glowGold, place(prangGeo.gold, cx + dx * 22, -0.1, cz + dz * 22, 0, 0, 0, 1.6)); }
      S.put(glowWhite, place(new THREE.BoxGeometry(70, 4, 70), cx, 1.9, cz));
      halos.push([cx, 40, cz, 130]);
      // a golden mount: a chedi on a wooded hill, far off the other side
      const mx = s * 190, mz = s * 150;
      const hill = lathe([[0, 22], [10, 21], [22, 16], [34, 8], [46, 2], [56, -1], [0, -1]], 40);
      S.put(hillM, place(hill, mx, 0, mz));
      S.put(glowWhite, place(chediParts.white, mx, 21.5, mz, 0, 0, 0, 3.2)); S.put(glowGold, place(chediParts.gold, mx, 21.5, mz, 0, 0, 0, 3.2));
      halos.push([mx, 42, mz, 90]);
      // more spires and chedis scattered round the horizon, away from the centre of either camera
      for (let k = 0; k < 5; k++) {
        const a = (0.42 + k * 0.17) * Math.PI * (s > 0 ? 1 : -1) + (s > 0 ? 0 : 0), rr = 170 + R() * 90;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (Math.abs(Math.atan2(z, Math.abs(x))) < 0.3) continue;
        if (k % 2) { S.put(glowWhite, place(chediParts.white, x, -0.1, z, 0, 0, 0, 2.2)); S.put(glowGold, place(chediParts.gold, x, -0.1, z, 0, 0, 0, 2.2)); }
        else S.put(glowGold, place(spireParts(1.3, 12), x, 6, z)), S.put(glowWhite, place(redLathe([[4, 0], [4, 6], [0, 6]], 0.2), x, 0, z));
      }
    }
    S.build(root);
    void halo;
    // floodlight haloes round the far landmarks: one instanced billboard
    {
      const hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uMap: { value: softTexture(0, 256) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length(instanceMatrix[0].xyz); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; void main() { float a = texture2D(uMap, vUv).a * 0.12; gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a, a); }' });
      inst(new THREE.PlaneGeometry(1, 1), hm, halos.map(([x, y, z, sc]) => [x, y, z, 0, sc]), root).renderOrder = -1;
    }
    // a full moon with a soft halo, high over one long side (well above both match cameras' view)
    {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const halo2 = g.createRadialGradient(128, 128, 20, 128, 128, 128); halo2.addColorStop(0, 'rgba(255,240,215,0.5)'); halo2.addColorStop(0.3, 'rgba(200,210,255,0.12)'); halo2.addColorStop(1, 'rgba(160,180,255,0)');
      g.fillStyle = halo2; g.fillRect(0, 0, 256, 256);
      const disc = g.createRadialGradient(122, 122, 4, 128, 128, 26); disc.addColorStop(0, '#fffaf0'); disc.addColorStop(0.85, '#f4ead6'); disc.addColorStop(1, 'rgba(240,230,210,0)');
      g.fillStyle = disc; g.beginPath(); g.arc(128, 128, 27, 0, TAU); g.fill();
      g.fillStyle = 'rgba(170,160,150,0.28)';
      for (const [x, y, r] of [[118, 120, 7], [136, 132, 5], [124, 140, 4], [138, 116, 3.5], [112, 134, 3]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, depthWrite: false, fog: false }));
      moon.position.set(-70, 118, 300); moon.scale.set(95, 95, 1); moon.renderOrder = -3; root.add(moon);
    }
    // the city's glow low on the horizon + its lights
    const band = new THREE.CylinderGeometry(330, 330, 60, 96, 1, true).translate(0, 22, 0);
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
      vertexShader: 'varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vY; void main() { float a = pow(1.0 - vY, 3.0) * 0.16; gl_FragColor = vec4(vec3(1.0, 0.55, 0.28) * a, a); }' });
    const bandM = new THREE.Mesh(band, bm); bandM.renderOrder = -2; root.add(bandM);
    const pos = [], seed = [], col = [];
    for (let i = 0; i < 1400; i++) {
      const a = R() * TAU; if (Math.abs(Math.sin(a)) < 0.2) continue;        // keep the lights off the line behind either end
      const rr = 250 + R() * 75; pos.push(Math.cos(a) * rr, R() * R() * 14, Math.sin(a) * rr); seed.push(R());
      const w = R() < 0.7; col.push(1, w ? 0.7 : 0.92, w ? 0.38 : 0.82);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime }, vertexColors: true,
      vertexShader: `uniform float uTime; attribute float seed; varying float vA; varying vec3 vC;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = 0.55 + 0.45 * sin(uTime * (0.5 + seed * 1.5) + seed * 40.0); gl_PointSize = 2.4; }`,
      fragmentShader: 'varying float vA; varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * 0.8; gl_FragColor = vec4(vC * a, a); }' });
    const cp = new THREE.Points(geo, pm); cp.frustumCulled = false; cp.renderOrder = -1; root.add(cp);
  }

  /* =====================================================================
     10a. REFLECTION PROXIES — the pools mirror low-poly stand-ins on a layer only the mirror camera sees (the ripples
          hide the difference): chedis, prangs, topiary, beds, salas, trees, the wall and the pavilions
     ===================================================================== */
  {
    const RB = batch();
    const lowChedi = merge([redLathe([[2.5, 0], [2.5, 1.62], [0, 1.62]], 0.2), lathe([[1.9, 1.62], [2.08, 2.4], [2.06, 3.2], [1.6, 4.4], [0.85, 5.0], [0.8, 5.8], [0.45, 6.5], [0.12, 8.0], [0, 8.6]], 12)]);
    for (const [x, y, z, , sc] of PR.chedis) RB.put(mat.gold, place(lowChedi, x, y, z, 0, 0, 0, sc));
    for (const s of [-1, 1]) RB.put(mat.marble, place(new THREE.BoxGeometry(92, 1.5, 5.6), 0, 0.65, s * CHEDI_Z));
    const lowPrang = redLathe([[3.4, 0], [3.4, 2.2], [2.45, 2.4], [2.4, 4.3], [2.1, 6], [1.5, 9.5], [0.9, 12.5], [0.4, 13.6], [0, 14]], 0.24);
    for (const [x, y, z, , sc] of prangSpots) { RB.put(mat.plaster, place(lowPrang, x, y, z, 0, 0, 0, sc)); RB.put(mat.gold, place(new THREE.ConeGeometry(0.25, 4, 5), x, y + 15.8 * sc, z)); }
    const b1 = (rx, ry, rz) => blob(rx, ry, rz, 1, 2, 0.05);
    const lowTier = merge([b1(0.72, 0.36, 0.72).translate(0, 0.7, 0), b1(0.58, 0.3, 0.58).translate(0, 1.35, 0), b1(0.44, 0.25, 0.44).translate(0, 1.95, 0), b1(0.3, 0.2, 0.3).translate(0, 2.45, 0), b1(0.16, 0.22, 0.16).translate(0, 2.85, 0)]);
    for (const [x, y, z, , sc] of PR.tiered) RB.put(mat.leaf, place(lowTier, x, y, z, 0, 0, 0, sc));
    for (const [x, y, z, , sc] of PR.balls) { RB.put(mat.leaf, place(b1(0.72, 0.7, 0.72), x, y + 1.35 * sc, z, 0, 0, 0, sc)); RB.put(mat.gold, place(new THREE.CylinderGeometry(0.55, 0.35, 0.75, 8), x, y + 0.37, z)); }
    for (const [x, y, z, ry] of PR.ele) RB.put(mat.leaf, place(merge([b1(1.25, 0.85, 0.75).translate(0, 2.0, 0), b1(0.6, 0.62, 0.55).translate(1.35, 2.45, 0), new THREE.BoxGeometry(1.8, 1.7, 1.1).translate(0, 0.85, 0)]), x, y, z, ry));
    for (const [cx, cz, L, D] of PR.beds) RB.put(mat.leaf, place(new THREE.BoxGeometry(L, 0.6, D), cx, 0.15, cz));
    for (const [x, y, z, ry, sc] of PR.trees) RB.put(mat.leaf, place(merge([b1(2.4, 1.2, 2.4).translate(0, 5.2, 0), new THREE.CylinderGeometry(0.2, 0.25, 4.5, 6).translate(0, 2.25, 0)]), x, y, z, ry, 0, 0, sc));
    const prism = (x0, x1, ze, ye, yr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x0, ye, -ze, x1, ye, -ze, x1, yr, 0, x0, ye, -ze, x1, yr, 0, x0, yr, 0, x0, ye, ze, x1, yr, 0, x1, ye, ze, x0, ye, ze, x0, yr, 0, x1, yr, 0, x0, ye, -ze, x0, yr, 0, x0, ye, ze, x1, ye, -ze, x1, ye, ze, x1, yr, 0], 3)); g.computeVertexNormals(); return g; };
    for (const [x, z, ry] of PR.salas) {
      const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x - Math.cos(ry) * 3, -0.1, z);
      RB.put(mat.marble, new THREE.BoxGeometry(7.2, 0.9, 5.6).translate(3, 0.45, 0).applyMatrix4(M));
      RB.put(mat.roofO, prism(-0.9, 6.9, 3.2, 4.3, 6.9).applyMatrix4(M)); RB.put(mat.roofO, prism(0.1, 5.9, 2.3, 5.5, 8.0).applyMatrix4(M));
    }
    for (const sx of [-1, 1]) {
      const M = new THREE.Matrix4().makeRotationY(sx > 0 ? 0 : Math.PI).setPosition(sx * HALL_X, -0.1, 0);
      const g = [new THREE.BoxGeometry(24, 1.7, 18).translate(10, 0.85, 0), new THREE.BoxGeometry(17, 6, 11).translate(11.5, 4.7, 0), new THREE.BoxGeometry(8, 6, 23).translate(11, 4.7, 0)];
      for (const gg of g) RB.put(mat.plaster, gg.applyMatrix4(M));
      for (const [a, b, ze, ye, yr] of [[-1.4, 23.4, 7.9, 7.75, 13.9], [0.1, 21.9, 5.85, 9.0, 15.4], [1.6, 20.4, 4.3, 10.2, 16.9]]) RB.put(mat.roofO, prism(a, b, ze, ye, yr).applyMatrix4(M));
      for (const [a, b, ze, ye, yr] of [[-15.6, 15.6, 6.2, 7.75, 12.6], [-14.1, 14.1, 4.6, 8.8, 14.1]]) RB.put(mat.roofO, prism(a, b, ze, ye, yr).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(11, 0, 0)).applyMatrix4(M));
      RB.put(mat.gold, new THREE.ConeGeometry(1.6, 16, 8).translate(11, 24.5, 0).applyMatrix4(M));
    }
    for (const sz of [-1, 1]) { RB.put(mat.plaster, new THREE.BoxGeometry(WALL_X * 2, 6.2, 1.2).translate(0, 3.0, sz * WALL_Z)); RB.put(mat.plaster, new THREE.BoxGeometry(12, 7, 3.4).translate(0, 3.4, sz * WALL_Z)); }
    for (const m of RB.build(root)) m.layers.set(REFL);
  }

  /* =====================================================================
     10. BUILD the merged world, outline bulbs, columns, glow pools
     ===================================================================== */
  const cols = [...allCols, ...salaCols];
  placeAll(W, mat.plaster, colG.shaft, cols); placeAll(W, mat.gold, colG.gold, cols); placeAll(W, mat.red, colG.red, cols);
  W.build(root, { receive: true });
  {
    const geo = new THREE.OctahedronGeometry(0.06, 0);
    inst(geo, bulbMat, bulbs.map(([x, y, z]) => [x, y, z]), root, { refl: true, colors: (i) => new THREE.Color(bulbs[i][3], bulbs[i][3], bulbs[i][3]) });
    for (const [x, y, z] of wallLamps) glassBoxes.push([x, y, z, 0.22, 0.32, 0.22]);
    for (const [x, , z] of wallLamps) glowPools.push([x, z, 2.4, 0.35]);
    inst(new THREE.BoxGeometry(1, 1, 1), lampGlass, glassBoxes.map(([x, y, z, w, h, d]) => [x, y, z, 0, [w, h, d]]), root, { refl: true });
  }
  {
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(0xffb066).multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const im = new THREE.InstancedMesh(disc, m, glowPools.length);
    glowPools.forEach(([x, z, r, k], i) => { _o.position.set(x, -0.05, z); _o.rotation.set(0, 0, 0); _o.scale.set(r, 1, r); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, new THREE.Color(k, k, k)); });
    im.computeBoundingSphere(); im.renderOrder = 1; root.add(im);
  }

  /* =====================================================================
     11. LIFE — fireflies, moths, falling golden-shower petals, bats, guards + lantern-bearing attendants
     ===================================================================== */
  {
    const ff = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 28; i++) ff.push([(R() - 0.5) * 60, 0.5 + R() * 1.8, s * (Z1 + 6 + R() * 7)]);
      for (let i = 0; i < 26; i++) ff.push([(R() - 0.5) * 120, 0.8 + R() * 3, s * (WALK_B + 3 + R() * 14)]);
      for (let i = 0; i < 10; i++) ff.push([s * (HALL_X + 4 + R() * 14), 0.6 + R() * 2, (R() < 0.5 ? -1 : 1) * (17 + R() * 6)]);
    }
    root.add(makeFireflies(ff, uTime, [0.85, 1.0, 0.5]));
    // moths round the lamp posts
    const per = 3, n = lampHeads.length * per, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set(lampHeads[Math.floor(i / per)], i * 3); sd[i] = R(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main() { float a = uTime * (1.6 + seed * 1.4) + seed * 30.0;
          vec3 p = position + vec3(cos(a) * 0.45, sin(uTime * 2.3 + seed * 9.0) * 0.18 + sin(a * 2.7) * 0.08, sin(a * 1.3) * 0.45);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.25 * sin(uTime * 23.0 + seed * 50.0); gl_PointSize = 26.0 / -mv.z; }`,
      fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a); }' });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; root.add(pts);
  }
  // golden-shower petals drift down from the garden trees, settle, fade
  {
    const petal = new THREE.PlaneGeometry(0.07, 0.05);
    const N = 70, im = new THREE.InstancedMesh(petal, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x5a4004, roughness: 0.6, side: THREE.DoubleSide }), N);
    const P = [];
    const spawn = (p, first) => {
      const t = blossomPts[Math.floor(R() * blossomPts.length)] || V3(0, 4, 40);
      p.pos = t.clone().add(V3((R() - 0.5) * 2.4, -0.3 - R() * 0.4, (R() - 0.5) * 2.4));
      p.v = 0.35 + R() * 0.25; p.ph = R() * TAU; p.spin = (R() - 0.5) * 4; p.rest = 0; p.wait = first ? R() * 8 : 1 + R() * 5; p.s = 0.9 + R() * 0.5;
    };
    for (let i = 0; i < N; i++) { const p = {}; spawn(p, true); P.push(p); }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; root.add(im);
    ticks.push((t, dt) => {
      for (let i = 0; i < N; i++) {
        const p = P[i]; let sc = p.s;
        if (p.wait > 0) { p.wait -= dt; sc = 0; }
        else if (p.pos.y > 0.0) { p.pos.y -= p.v * dt; p.pos.x += (Math.sin(t * 1.3 + p.ph) * 0.3 + 0.12) * dt; p.pos.z += Math.cos(t * 0.9 + p.ph) * 0.25 * dt; }
        else { p.rest += dt; if (p.rest > 6) sc = p.s * Math.max(0, 1 - (p.rest - 6) / 2); if (p.rest > 8) spawn(p, false); }
        _o.position.copy(p.pos); _o.rotation.set(p.rest ? -Math.PI / 2 : Math.sin(t * 2 + p.ph) * 1.2, t * p.spin + p.ph, p.rest ? 0 : Math.cos(t * 1.7 + p.ph) * 0.8);
        _o.scale.setScalar(sc); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }
  // bats: little flapping silhouettes circling the far spires (all motion in the vertex shader)
  {
    const body = [];
    body.push(new THREE.SphereGeometry(0.05, 6, 4).scale(1, 1, 2.2));
    for (const s of [-1, 1]) {
      const w = new THREE.BufferGeometry();
      w.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, s * 0.34, 0.02, 0.0, s * 0.22, 0, -0.08, 0, 0, 0.06, s * 0.22, 0, -0.08, 0, 0, -0.05], 3));
      w.computeVertexNormals(); body.push(w);
    }
    const geo = merge(body);
    const homes = [];
    for (const [x, z] of prangSpots.map((p) => [p[0], p[2]])) homes.push([x, 22, z, 7]);
    for (const sx of [-1, 1]) homes.push([sx * (HALL_X + 11), 36, 0, 9], [sx * 225, 60, -sx * 118, 22], [sx * 70, 18, sx * 50, 12]);
    const N = homes.length * 4;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a2226, emissive: 0x0e0a10, roughness: 0.9, side: THREE.DoubleSide }), N);
    const aH = new Float32Array(N * 4), aS = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const h = homes[Math.floor(i / 4)]; aH.set([h[0], h[1], h[2], h[3] * (0.6 + R() * 0.6)], i * 4); aS.set([R() * TAU, (0.25 + R() * 0.3) * (R() < 0.5 ? -1 : 1)], i * 2); im.setMatrixAt(i, new THREE.Matrix4()); }
    geo.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 4)); geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 2));
    im.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime; attribute vec4 aH; attribute vec2 aS;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `vec3 transformed = position;
          float flap = sin(uTime * 15.0 + aS.x * 7.0); transformed.y += abs(transformed.x) * flap * 1.3;
          float a = aS.x + uTime * aS.y; float r = aH.w * (1.0 + 0.25 * sin(uTime * 0.37 + aS.x * 3.0));
          vec3 c = aH.xyz + vec3(cos(a) * r, sin(uTime * 0.6 + aS.x * 5.0) * 2.5, sin(a) * r);
          vec3 fw = normalize(vec3(-sin(a), 0.0, cos(a)) * sign(aS.y)); vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
          transformed = c + rt * transformed.x * 1.6 + vec3(0.0, 1.6, 0.0) * transformed.y + fw * transformed.z * 1.6;`)
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    };
    im.material.customProgramCacheKey = () => 'palBats';
    im.frustumCulled = false; root.add(im);
  }
  // palace guards marching on the outer walks; attendants carrying lanterns on the inner walks
  {
    const fig = (cols) => {
      const parts = [];
      const add = (g, c, swing) => { const n = g.index ? g.toNonIndexed() : g; const k = n.attributes.position.count; const col = new Float32Array(k * 3), sw = new Float32Array(k); const cc = new THREE.Color(c); for (let i = 0; i < k; i++) { col.set([cc.r, cc.g, cc.b], i * 3); sw[i] = swing; } n.setAttribute('color', new THREE.BufferAttribute(col, 3)); n.setAttribute('swing', new THREE.BufferAttribute(sw, 1)); if (n.attributes.uv) n.deleteAttribute('uv'); parts.push(n); };
      for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.085, 0.07, 0.9, 8).translate(s * 0.11, 0.47, 0), cols.leg, s); add(new THREE.BoxGeometry(0.12, 0.08, 0.24).translate(s * 0.11, 0.04, 0.04), 0x111111, s); }
      add(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 10).translate(0, 1.22, 0), cols.body, 0);
      add(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 10).translate(0, 0.94, 0), cols.belt, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.055, 0.05, 0.62, 6).translate(s * 0.25, 1.2, 0), cols.body, -s * 0.6);
      add(new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.66, 0), 0xa8744c, 0);
      if (cols.hat) { add(new THREE.CylinderGeometry(0.12, 0.13, 0.34, 10).translate(0, 1.9, 0), cols.hat, 0); add(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 10).translate(0, 1.76, 0), 0xd8a84a, 0); add(new THREE.ConeGeometry(0.04, 0.2, 6).translate(0, 2.15, 0), 0xc0302a, 0); }
      if (cols.rifle) add(new THREE.BoxGeometry(0.04, 0.9, 0.05).rotateX(0.15).translate(0.27, 1.35, -0.06), 0x1c1a18, 0);
      if (cols.pole) { add(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4).rotateX(0.5).translate(0.25, 1.4, 0.3), 0x5a3a24, 0); }
      return mergeGeometries(parts);
    };
    const guardG = fig({ leg: 0x1a2238, body: 0xe8e6e0, belt: 0xd8a84a, hat: 0xf2f0ea, rifle: true });
    const attG = fig({ leg: 0xa82a3a, body: 0xf0e8d8, belt: 0xd8a84a, pole: true });
    const walkMat = () => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float swing; attribute float aPh;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          { float piv = abs(swing) > 0.9 ? 0.92 : 1.48; float ang = sin(aPh) * 0.42 * sign(swing) * (abs(swing) > 0.9 ? 1.0 : 0.7);
            if (swing != 0.0) { float y = transformed.y - piv, z = transformed.z; transformed.y = piv + y * cos(ang) - z * sin(ang); transformed.z = y * sin(ang) + z * cos(ang); } }`);
      };
      m.customProgramCacheKey = () => 'palWalk';
      return m;
    };
    const people = [];   // { im, i, path: [x0, z0, x1, z1], v, t, lantern }
    const mk = (geo, list) => {
      const im = new THREE.InstancedMesh(geo, walkMat(), list.length);
      const ph = new Float32Array(list.length); geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; root.add(im);
      list.forEach((p, i) => people.push({ ...p, im, i, ph }));
      return im;
    };
    const guards = [], atts = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) for (const lane of [-0.45, 0.45]) guards.push({ a: [-62, s * (WALK_B + lane)], b: [62, s * (WALK_B + lane)], v: 1.05, t: k * 0.5 + (s > 0 ? 0.25 : 0), lantern: false });
      for (let k = 0; k < 3; k++) atts.push({ a: [-56, s * (WALK_A - 0.4 + k * 0.4)], b: [56, s * (WALK_A - 0.4 + k * 0.4)], v: 0.55 + k * 0.05, t: k * 0.33 + (s > 0 ? 0.1 : 0.6), lantern: true });
    }
    for (const sx of [-1, 1]) guards.push({ a: [sx * (TX + 7.5), -WALK_B + 4], b: [sx * (TX + 7.5), -TZ - 2], v: 1.0, t: 0.3, lantern: false }, { a: [sx * (TX + 7.5), TZ + 2], b: [sx * (TX + 7.5), WALK_B - 4], v: 1.0, t: 0.7, lantern: false });
    mk(guardG, guards); mk(attG, atts);
    const lan = people.filter((p) => p.lantern);
    const lpos = new Float32Array(lan.length * 3), lsd = new Float32Array(lan.length);
    lan.forEach((_, i) => { lsd[i] = R(); });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lg.setAttribute('seed', new THREE.BufferAttribute(lsd, 1));
    const lm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float seed; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vA = 0.8 + 0.2 * sin(uTime * 8.0 + seed * 30.0); gl_PointSize = 150.0 / -mv.z; }`,
      fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = (smoothstep(0.5, 0.0, d) * 0.45 + smoothstep(0.1, 0.0, d)) * vA; gl_FragColor = vec4(vec3(1.0, 0.68, 0.32) * a * 1.4, a); }' });
    const lp = new THREE.Points(lg, lm); lp.frustumCulled = false; root.add(lp);
    ticks.push((t) => {
      let li = 0;
      for (const p of people) {
        const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), T = (L / p.v) * 2 + 6;     // there and back, a pause to turn at each end
        const u = ((t / T + p.t) % 1) * T;
        let f, dir, moving = true;
        const leg = L / p.v;
        if (u < leg) { f = u / leg; dir = 1; } else if (u < leg + 3) { f = 1; dir = 1; moving = false; } else if (u < leg * 2 + 3) { f = 1 - (u - leg - 3) / leg; dir = -1; } else { f = 0; dir = -1; moving = false; }
        const x = p.a[0] + (p.b[0] - p.a[0]) * f, z = p.a[1] + (p.b[1] - p.a[1]) * f;
        let ry = Math.atan2((p.b[0] - p.a[0]) * dir, (p.b[1] - p.a[1]) * dir);
        if (!moving) ry += (u < leg + 3 ? (u - leg) / 3 : (u - leg * 2 - 3) / 3) * Math.PI;
        _o.position.set(x, -0.1 + (moving ? Math.abs(Math.sin(u * p.v * 3.4)) * 0.03 : 0), z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(1); _o.updateMatrix();
        p.im.setMatrixAt(p.i, _o.matrix); p.ph[p.i] = moving ? u * p.v * 3.4 : 0;
        if (p.lantern) { const fx = Math.sin(ry), fz = Math.cos(ry); lpos[li * 3] = x + fx * 0.75 + fz * 0.25; lpos[li * 3 + 1] = 1.0 + Math.sin(u * 3) * 0.03; lpos[li * 3 + 2] = z + fz * 0.75 - fx * 0.25; li++; }
      }
      for (const im of new Set(people.map((p) => p.im))) { im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aPh.needsUpdate = true; }
      lg.attributes.position.needsUpdate = true;
    });
  }

  function update(dt, t) { for (const f of ticks) f(t, dt); }
  return { group: root, update };
}
