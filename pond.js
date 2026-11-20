// THE LOTUS POND — the 3v3 venue. Built only the first time a 3v3 match starts and shown only in 3v3,
// so nothing here ever appears in 1v1 / 2v1 / 2v2 (those keep the temple courtyard).
// The court sits on a raised teak deck in the middle of a lotus pond at dusk: koi drift under the pads,
// arched bridges run from each baseline to an open sala on the bank, little candle boats float by,
// fireflies hang over the reeds and far-off chedis catch the last light.
// Same visual language as the courtyard: low-poly + flat-shaded, merged geometry, glazed orange/green roofs,
// red lacquer, gold trim, warm unlit "glow" lamps that bloom picks up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFlyers } from './life.js';

const WATER_Y = -0.5;            // pond surface (the deck top is y = 0)
const FLOOR_Y = -1.55;           // pond bed
const BANK_Y = -0.28;            // grassy bank top
const A = 31, B = 22;            // pond half-extents (rounded rectangle, wobbly)

// deterministic randomness so both players see the same pond
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// pond rim at angle t (a squircle with a hand-dug wobble)
function rim(t) {
  const c = Math.cos(t), s = Math.sin(t);
  const k = 1 + 0.035 * Math.sin(3 * t + 0.7) + 0.025 * Math.sin(7 * t + 1.9) + 0.012 * Math.sin(13 * t + 0.3);
  return [A * Math.sign(c) * Math.pow(Math.abs(c), 0.5) * k, B * Math.sign(s) * Math.pow(Math.abs(s), 0.5) * k];
}
// how far "out" a point is: < 1 inside the water, > 1 on the bank (ignores the wobble)
const pondR = (x, z) => Math.pow(Math.pow(Math.abs(x) / A, 4) + Math.pow(Math.abs(z) / B, 4), 0.25);

export function buildPond(ctx) {
  const { F, xf, makeBatch, slope, poly, texLoader, glowTexture, ornamentTexture, panelTexture, spotLights, quality } = ctx;
  const g = new THREE.Group();
  g.name = 'lotus-pond';
  const fx = new THREE.Group();            // optional eye candy (hidden on Low quality)
  g.add(fx);
  const R = rng(20251115);
  const uTime = { value: 0 };
  const deckX = F.outX + 2.0, deckZ = F.outZ + 2.0;        // the court deck's footprint (incl. the spectators' walkway outside the railing)
  const onDeck = (x, z, m = 0) => Math.abs(x) < deckX + m && Math.abs(z) < deckZ + m;
  const SALA_X = 29.0;                                       // front edge of each sala (faces the court)
  const ISLANDS = [[9, 17.5], [-9, -17.5]];
  const onBridge = (x, z, m = 0) => Math.abs(z) < 1.4 + m && Math.abs(x) > deckX - 1 && Math.abs(x) < SALA_X + 1;
  const nearIsland = (x, z, m = 0) => ISLANDS.some(([ix, iz]) => Math.hypot(x - ix, z - iz) < 3.0 + m);

  const tex = (name, repeat = 1, srgb = false) => {
    const t = texLoader.load(`assets/pond/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const roofTex = texLoader.load('assets/temple/roof_diff.jpg'), roofNor = texLoader.load('assets/temple/roof_nor_gl.jpg');
  for (const t of [roofTex, roofNor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  roofTex.colorSpace = THREE.SRGBColorSpace;
  const plankMap = tex('planks_diff.jpg', 1, true), plankNor = tex('planks_nor_gl.jpg');
  const MAT = {
    plaster: new THREE.MeshStandardMaterial({ color: 0xefe2cf, roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8a48b, roughness: 0.92, flatShading: true }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x2c1805 }),
    teak: new THREE.MeshStandardMaterial({ map: plankMap, normalMap: plankNor, color: 0xd9a77c, roughness: 0.7 }),
    darkwood: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.9 }),
    roofO: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0xe8743a, roughness: 0.55, side: THREE.DoubleSide }),
    roofG: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0x4f9a5e, roughness: 0.55, side: THREE.DoubleSide }),
    orn: new THREE.MeshStandardMaterial({ map: ornamentTexture(), roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),
  };
  const decor = makeBatch();          // static, no shadows
  const solid = makeBatch();          // near the court: casts + receives shadows

  /* ---------------- water, pond bed, banks ---------------- */
  {
    // pond bed: dark silt under the water
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(A * 2 + 8, B * 2 + 8), new THREE.MeshStandardMaterial({
      map: tex('mud_diff.jpg', 9, true), color: 0x4c5a3a, roughness: 1,
    }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = FLOOR_Y;
    g.add(bed);

    // the water: glossy, slightly see-through, two scrolling ripple layers; it mirrors the dusk sky (scene environment)
    const wn = tex('water_nor.jpg', 1);
    const water = new THREE.MeshStandardMaterial({
      color: 0x0f3b3c, roughness: 0.08, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.32, 0.32),
      transparent: true, opacity: 0.74, envMapIntensity: 1.25, depthWrite: false,
    });
    wn.repeat.set(9, 6.5);
    water.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.006, uTime * 0.004 ) ).xyz * 2.0 - 1.0;
         mapN += texture2D( normalMap, vNormalMapUv * 1.43 + vec2( -uTime * 0.005, uTime * 0.007 ) ).xyz * 2.0 - 1.0;
         mapN = normalize( mapN );`);
    };
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(A * 2 + 6, B * 2 + 6), water);
    wm.rotation.x = -Math.PI / 2; wm.position.y = WATER_Y;
    wm.renderOrder = 2;
    g.add(wm);

    // grassy banks all around: one big ground sheet with the pond cut out of it
    const N = 180, ring = [];
    for (let i = 0; i < N; i++) ring.push(rim((i / N) * Math.PI * 2));
    const shape = new THREE.Shape([new THREE.Vector2(-110, -90), new THREE.Vector2(110, -90), new THREE.Vector2(110, 90), new THREE.Vector2(-110, 90)]);
    shape.holes.push(new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    const gt = tex('grass_diff.jpg', 1, true), gnor = tex('grass_nor_gl.jpg');
    gt.repeat.set(0.22, 0.22); gnor.repeat.set(0.22, 0.22);
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshStandardMaterial({
      map: gt, normalMap: gnor, color: 0x8f9a70, roughness: 0.95,
    }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = BANK_Y;
    ground.receiveShadow = true;
    g.add(ground);

    // the bank's lip sloping down under the water (muddy)
    const pos = [], uv = [];
    for (let i = 0; i < N; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % N];
      const sh = (x, z) => { const d = Math.hypot(x, z) || 1; return [x - (x / d) * 1.4, z - (z / d) * 1.4]; };
      const [bx0, bz0] = sh(x0, z0), [bx1, bz1] = sh(x1, z1);
      pos.push(x0, BANK_Y, z0, bx0, FLOOR_Y, bz0, x1, BANK_Y, z1, x1, BANK_Y, z1, bx0, FLOOR_Y, bz0, bx1, FLOOR_Y, bz1);
      const u0 = i / 6, u1 = (i + 1) / 6;
      uv.push(u0, 0, u0, 1, u1, 0, u1, 0, u0, 1, u1, 1);
    }
    const lip = new THREE.BufferGeometry();
    lip.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lip.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lip.computeVertexNormals();
    g.add(new THREE.Mesh(lip, new THREE.MeshStandardMaterial({ map: tex('mud_diff.jpg', 1, true), color: 0x6a5a40, roughness: 1, side: THREE.DoubleSide })));
  }

  /* ---------------- the court deck: teak skirt + stilts, and a lacquered railing on the ball boundary ---------------- */
  {
    const T = 0.16;
    // spectators' walkway: a ring of teak boards around the court deck, outside the railing
    {
      const in0 = 0.4, BW = 0.32;
      for (const sz of [-1, 1]) for (let x = -deckX + BW / 2; x < deckX; x += BW + 0.012)     // along the sides (boards run across)
        solid.put(MAT.teak, xf(new THREE.BoxGeometry(BW, 0.1, deckZ - F.outZ - in0), x, -0.05, sz * (F.outZ + in0 + deckZ) / 2));
      for (const sx of [-1, 1]) for (let z = -(F.outZ + in0) + BW / 2; z < F.outZ + in0; z += BW + 0.012)   // the ends
        solid.put(MAT.teak, xf(new THREE.BoxGeometry(deckX - F.outX - in0, 0.1, BW), sx * (F.outX + in0 + deckX) / 2, -0.05, z));
    }
    for (const [len, x, z, ry] of [[deckX * 2 + T * 2, 0, -deckZ - T / 2, 0], [deckX * 2 + T * 2, 0, deckZ + T / 2, 0],
      [deckZ * 2, -deckX - T / 2, 0, Math.PI / 2], [deckZ * 2, deckX + T / 2, 0, Math.PI / 2]]) {
      solid.put(MAT.teak, xf(new THREE.BoxGeometry(len, 0.34, T), x, -0.17, z, ry));            // fascia board
      solid.put(MAT.gold, xf(new THREE.BoxGeometry(len, 0.03, T + 0.02), x, -0.02, z, ry));       // gold edge line
    }
    const stilt = new THREE.CylinderGeometry(0.11, 0.13, 1.5, 7);
    for (let x = -deckX + 0.3; x <= deckX - 0.29; x += 2.2) for (const sz of [-1, 1]) decor.put(MAT.darkwood, xf(stilt, x, -1.0, sz * (deckZ - 0.25)));
    for (let z = -deckZ + 0.3; z <= deckZ - 0.29; z += 2.2) for (const sx of [-1, 1]) decor.put(MAT.darkwood, xf(stilt, sx * (deckX - 0.25), -1.0, z));

    // railing: same place + height as the courtyard balustrade (it's the ball's boundary), but lacquered teak
    const BH = 0.8, BT = 0.14;
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.5, metalness: 0.15 });
    const bx = F.outX + BT / 2, bz = F.outZ + BT / 2;
    for (const [len, x, z, ry] of [[F.outX * 2 + BT * 2, 0, -bz, 0], [F.outX * 2 + BT * 2, 0, bz, Math.PI],
      [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, -Math.PI / 2]]) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      solid.put(MAT.teak, xf(new THREE.BoxGeometry(len + 0.1, 0.09, BT + 0.08), x, BH - 0.045, z, ry));    // top rail
      solid.put(MAT.gold, xf(new THREE.BoxGeometry(len + 0.12, 0.03, BT + 0.1), x, BH - 0.1, z, ry));
      solid.put(MAT.red, xf(new THREE.BoxGeometry(len, 0.42, 0.06), x, 0.21, z, ry));                       // kick board
      const pg = new THREE.PlaneGeometry(len - 0.1, 0.36);
      const u = pg.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * (len / 3.0));
      solid.put(panelMat, xf(pg, x + nx * 0.035, 0.21, z + nz * 0.035, ry));                                 // lotus frieze
      // posts + slim balusters
      const n = Math.round(len / 1.8);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i / n) * len;
        const px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
        solid.put(MAT.red, xf(new THREE.BoxGeometry(0.13, BH, 0.13), px, BH / 2, pz, ry));
        solid.put(MAT.gold, xf(new THREE.ConeGeometry(0.09, 0.2, 4), px, BH + 0.1, pz, ry + Math.PI / 4));
        if (i < n) for (let k = 1; k < 4; k++) {
          const tb = t + (k / 4) * (len / n);
          solid.put(MAT.teak, xf(new THREE.CylinderGeometry(0.022, 0.022, BH - 0.52, 5), x + Math.cos(ry) * tb, 0.42 + (BH - 0.52) / 2, z - Math.sin(ry) * tb));
        }
      }
    }
  }

  /* ---------------- floodlight poles standing in the water at the deck corners + paper-lantern festoons ---------------- */
  const POLE = 6.6;
  const poles = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (F.outX + 1.1), pz = sz * (F.outZ + 1.6);
    poles.push([px, pz]);
    decor.put(MAT.stone, xf(new THREE.CylinderGeometry(0.42, 0.55, 1.4, 8), px, WATER_Y - 0.45, pz));          // footing in the water
    decor.put(MAT.stone, xf(new THREE.CylinderGeometry(0.5, 0.42, 0.14, 8), px, WATER_Y + 0.28, pz));
    decor.put(MAT.red, xf(new THREE.CylinderGeometry(0.11, 0.14, POLE, 10), px, WATER_Y + 0.3 + POLE / 2, pz));
    decor.put(MAT.glow, xf(new THREE.BoxGeometry(0.3, 0.42, 0.3), px, WATER_Y + 0.3 + POLE - 0.25, pz));
    decor.put(MAT.gold, xf(new THREE.ConeGeometry(0.2, 0.7, 8), px, WATER_Y + 0.3 + POLE + 0.3, pz));
    const spot = new THREE.SpotLight(0xffd2a0, 13, 46, 0.6, 0.7, 1.2);           // the court's floodlights (High quality)
    spot.position.set(px, WATER_Y + POLE, pz);
    spot.target.position.set(sx * 3.4, 0, sz * 1.2);
    spot.visible = quality().spots;
    spotLights.push(spot);
    g.add(spot, spot.target);
  }
  const lanternColors = [new THREE.Color(0xff5a2e), new THREE.Color(0xffae42), new THREE.Color(0xffd27a)];
  {
    const wireMat = new THREE.LineBasicMaterial({ color: 0x140c0a });
    const pts = [];
    for (const sz of [-1, 1]) {
      const zz = sz * (F.outZ + 1.6), top = WATER_Y + POLE + 0.2;
      const a = new THREE.Vector3(-(F.outX + 1.1), top, zz), b = new THREE.Vector3(F.outX + 1.1, top, zz);
      const n = 34, line = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * 1.2;
        line.push(p);
        if (i > 0 && i < n) pts.push(p);
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
    }
    const lg = new THREE.SphereGeometry(0.17, 10, 8); lg.scale(1, 1.25, 1);
    const lanterns = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3.4) }), pts.length);
    const o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(p.x, p.y - 0.24, p.z); o.updateMatrix(); lanterns.setMatrixAt(i, o.matrix); lanterns.setColorAt(i, lanternColors[i % 3]); });
    lanterns.computeBoundingSphere();
    g.add(lanterns);
  }

  /* ---------------- arched bridges from each baseline to a sala on the bank ---------------- */
  const SALA_Y = 0.55;                     // sala floor height
  for (const sx of [-1, 1]) {
    const x0 = sx * deckX, x1 = sx * SALA_X, n = 26, W = 2.2;
    const yAt = (t) => SALA_Y * t + Math.sin(Math.PI * t) * 1.25;
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n, xa = x0 + (x1 - x0) * ta, xb = x0 + (x1 - x0) * tb;
      const ya = yAt(ta), yb = yAt(tb), len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
      decor.put(MAT.teak, xf(new THREE.BoxGeometry(len + 0.02, 0.12, W), (xa + xb) / 2, (ya + yb) / 2 - 0.06, 0, 0, 0, ang));
      for (const sz of [-1, 1]) decor.put(MAT.red, xf(new THREE.BoxGeometry(len + 0.02, 0.07, 0.08), (xa + xb) / 2, (ya + yb) / 2 + 0.85, sz * (W / 2 - 0.05), 0, 0, ang));
      if (i % 3 === 0) for (const sz of [-1, 1]) {
        decor.put(MAT.red, xf(new THREE.BoxGeometry(0.11, 0.95, 0.11), xa, ya + 0.42, sz * (W / 2 - 0.05)));
        decor.put(MAT.gold, xf(new THREE.ConeGeometry(0.08, 0.18, 4), xa, ya + 0.98, sz * (W / 2 - 0.05), Math.PI / 4));
      }
    }
    // piers under the arch
    for (const t of [0.22, 0.5, 0.78]) for (const sz of [-1, 1]) {
      const x = x0 + (x1 - x0) * t;
      decor.put(MAT.darkwood, xf(new THREE.CylinderGeometry(0.1, 0.12, yAt(t) - FLOOR_Y, 6), x, (yAt(t) + FLOOR_Y) / 2, sz * 0.9));
    }
  }

  /* ---------------- the two salas (open pavilions) on the bank behind each baseline ---------------- */
  {
    const sala = [];
    const put = (mat, geo, ...t) => sala.push([mat, xf(geo, ...t)]);
    const D = 9.6, HW = 4.6;                                     // depth (along x) and half width
    put(MAT.teak, new THREE.BoxGeometry(D, 0.3, HW * 2), D / 2, SALA_Y - 0.15, 0);
    put(MAT.gold, new THREE.BoxGeometry(D + 0.04, 0.04, HW * 2 + 0.04), D / 2, SALA_Y - 0.02, 0);
    for (const x of [0.3, 3.2, 6.4, 9.3]) for (const z of [-HW + 0.3, -1.5, 1.5, HW - 0.3]) put(MAT.darkwood, new THREE.CylinderGeometry(0.13, 0.15, SALA_Y - FLOOR_Y, 6), x, (SALA_Y + FLOOR_Y) / 2 - 0.15, z);
    // lacquered columns + gold capitals
    const col = new THREE.CylinderGeometry(0.17, 0.2, 3.3, 10), cap = new THREE.CylinderGeometry(0.3, 0.2, 0.26, 10);
    for (const x of [0.6, 3.4, 6.2, 9.0]) for (const z of [-HW + 0.5, HW - 0.5]) {
      put(MAT.red, col, x, SALA_Y + 1.65, z);
      put(MAT.gold, cap, x, SALA_Y + 3.35, z);
    }
    put(MAT.red, new THREE.BoxGeometry(D, 0.26, 0.3), D / 2, SALA_Y + 3.55, -HW + 0.5);
    put(MAT.red, new THREE.BoxGeometry(D, 0.26, 0.3), D / 2, SALA_Y + 3.55, HW - 0.5);
    // low side railings
    for (const z of [-HW + 0.5, HW - 0.5]) put(MAT.red, new THREE.BoxGeometry(D - 1, 0.08, 0.08), D / 2 + 0.2, SALA_Y + 0.75, z);
    // tiered roof: main roof + a lower telescoped front tier, glazed orange with a green border course
    const ye = SALA_Y + 3.7, yr = SALA_Y + 6.4;
    for (const s of [-1, 1]) {
      put(MAT.roofO, slope(1.0, D + 0.8, s * (HW + 0.5), ye, 0, yr));
      put(MAT.roofG, slope(1.0, D + 0.8, s * (HW + 0.45), ye + 0.03, s * (HW - 0.4), ye + 0.55));
      put(MAT.roofO, slope(-0.9, 1.3, s * (HW + 0.2), ye - 0.35, 0, yr - 0.7));
      put(MAT.roofG, slope(-0.9, 1.3, s * (HW + 0.15), ye - 0.32, s * (HW - 0.6), ye + 0.18));
    }
    const ped = (X, hw, yb, ya) => poly([[X, yb, -hw], [X, yb, hw], [X, ya, 0]],
      [[-hw / 2.4 + 0.5, yb / 2.4], [hw / 2.4 + 0.5, yb / 2.4], [0.5, ya / 2.4]]);
    put(MAT.orn, ped(-0.88, HW + 0.1, ye - 0.33, yr - 0.72));
    put(MAT.orn, ped(1.02, HW + 0.4, ye + 0.02, yr));
    put(MAT.orn, ped(D + 0.78, HW + 0.4, ye + 0.02, yr));
    // gold bargeboards up the front rakes, ridge cap, chofa finials
    const rake = (X, ze, ye_, yr_) => {
      const L = Math.hypot(ze, yr_ - ye_), a = Math.atan2(yr_ - ye_, ze);
      for (const s of [-1, 1]) {
        put(MAT.gold, new THREE.BoxGeometry(0.18, 0.3, L + 0.25), X, (ye_ + yr_) / 2, s * ze / 2, 0, s * a);
        put(MAT.gold, new THREE.ConeGeometry(0.12, 0.6, 6), X, ye_ + 0.22, s * (ze + 0.1), 0, s * 0.7);
      }
    };
    rake(-0.92, HW + 0.2, ye - 0.35, yr - 0.7);
    rake(0.98, HW + 0.5, ye, yr);
    put(MAT.gold, new THREE.BoxGeometry(D, 0.14, 0.18), D / 2 + 0.9, yr + 0.05, 0);
    const chofa = (X, y, h) => {
      const pts = [[0, 0], [-0.12, 0.45], [-0.05, 0.9], [0.25, 1.2], [0.55, 1.15], [0.6, 0.95]].map(([dx, dy]) => new THREE.Vector3(X + h * dx, y + dy, 0));
      put(MAT.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.09, 6));
    };
    chofa(-0.92, yr - 0.7, -1); chofa(0.98, yr, -1); chofa(D + 0.8, yr, 1);
    // hanging lanterns inside
    for (const x of [2.2, 4.8, 7.4]) {
      put(MAT.glow, new THREE.SphereGeometry(0.26, 10, 8), x, SALA_Y + 2.4, 0);
      put(MAT.gold, new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), x, SALA_Y + 3.05, 0);
    }
    for (const sx of [-1, 1]) {
      const M = new THREE.Matrix4().makeRotationY(sx > 0 ? 0 : Math.PI).setPosition(sx * SALA_X, 0, 0);
      for (const [mat, geo] of sala) decor.put(mat, geo.clone().applyMatrix4(M));
    }
    for (const [, geo] of sala) geo.dispose();
  }

  /* ---------------- chedis: big ones across the water behind each sala, little ones on the islands ---------------- */
  const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  const chediBody = new THREE.LatheGeometry(V2([[0, 0], [3.0, 0], [3.0, 0.7], [2.6, 0.7], [2.6, 1.4], [2.25, 1.4], [2.25, 2.0],
    [2.35, 2.3], [2.45, 3.0], [2.35, 3.9], [2.0, 4.7], [1.45, 5.35], [0.9, 5.75], [0.85, 6.1], [1.0, 6.1], [1.0, 6.6], [0.6, 6.6]]), 20);
  const chediSpire = new THREE.LatheGeometry(V2([[0.6, 6.6], [0.62, 6.8], [0.5, 6.8], [0.52, 7.0], [0.42, 7.4], [0.44, 7.6],
    [0.34, 8.0], [0.36, 8.2], [0.26, 8.7], [0.28, 8.9], [0.17, 9.6], [0.12, 10.6], [0.06, 11.6], [0.02, 12.3], [0, 12.5]]), 12);
  const chedi = (x, y, z, s, gilded = false) => {
    const b = chediBody.clone().scale(s, s, s), sp = chediSpire.clone().scale(s, s, s);
    decor.put(gilded ? MAT.gold : MAT.plaster, xf(b, x, y, z));
    decor.put(MAT.gold, xf(sp, x, y, z));
  };
  for (const sx of [-1, 1]) {
    chedi(sx * 60, BANK_Y, 0, 1.7);                   // the big white-and-gold one across the water, framed by the sala
    chedi(sx * 54, BANK_Y, 14, 0.95);
    chedi(sx * 54, BANK_Y, -14, 0.95);
  }
  for (const [ix, iz] of ISLANDS) chedi(ix, BANK_Y + 0.05, iz, 0.42);

  /* ---------------- islands ---------------- */
  for (const [ix, iz] of ISLANDS) {
    const top = new THREE.CylinderGeometry(2.9, 3.3, 1.6, 18);
    decor.put(MAT.stone, xf(top, ix, BANK_Y - 0.8 + 0.02, iz));
    const turf = new THREE.CircleGeometry(2.9, 18); turf.rotateX(-Math.PI / 2);
    decor.put(new THREE.MeshStandardMaterial({ color: 0x55703e, roughness: 1 }), xf(turf, ix, BANK_Y + 0.04, iz));
  }

  /* ---------------- stone lanterns (+ warm light pools) ---------------- */
  const stoneLanterns = [[SALA_X + 1.6, 6.2], [SALA_X + 1.6, -6.2], [-SALA_X - 1.6, 6.2], [-SALA_X - 1.6, -6.2],
    [-16, 23.6], [2, 23.8], [18, 23.6], [16, -23.6], [-2, -23.8], [-18, -23.6],
    [ISLANDS[0][0] + 1.6, ISLANDS[0][1] - 1.4], [ISLANDS[1][0] - 1.6, ISLANDS[1][1] + 1.4]];
  {
    const base = new THREE.BoxGeometry(0.62, 0.22, 0.62), shaft = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8);
    const sill = new THREE.BoxGeometry(0.56, 0.08, 0.56), light = new THREE.BoxGeometry(0.36, 0.34, 0.36);
    const post = new THREE.BoxGeometry(0.07, 0.36, 0.07), roof = new THREE.ConeGeometry(0.46, 0.42, 4), tip = new THREE.ConeGeometry(0.06, 0.22, 6);
    for (const [x, z] of stoneLanterns) {
      const y0 = BANK_Y + 0.04;
      decor.put(MAT.stone, xf(base, x, y0 + 0.11, z));
      decor.put(MAT.stone, xf(shaft, x, y0 + 0.67, z));
      decor.put(MAT.stone, xf(sill, x, y0 + 1.16, z));
      decor.put(MAT.glow, xf(light, x, y0 + 1.37, z));
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.put(MAT.stone, xf(post, x + dx * 0.22, y0 + 1.38, z + dz * 0.22));
      decor.put(MAT.red, xf(roof, x, y0 + 1.77, z, Math.PI / 4));
      decor.put(MAT.gold, xf(tip, x, y0 + 2.09, z));
    }
  }
  // fake bounce light: soft warm pools on the bank + long shimmering reflections on the water under every lamp
  {
    const pools = [...stoneLanterns.map(([x, z]) => [x, BANK_Y + 0.06, z, 1.8, 1.8]),
      ...[-1, 1].map((sx) => [sx * (SALA_X + 4.8), SALA_Y + 0.02, 0, 3.6, 3.0])];
    const reflections = [...poles.map(([x, z]) => [x, WATER_Y + 0.012, z, 1.0, 6.5]),
      ...[-1, 1].map((sx) => [sx * (SALA_X - 1.4), WATER_Y + 0.012, 0, 1.4, 5.5])];
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const mk = (list, color, opacity) => {
      const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, y, z, sx, sz], i) => { o.position.set(x, y, z); o.scale.set(sx, 1, sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.computeBoundingSphere();
      im.renderOrder = 3;
      return im;
    };
    g.add(mk(pools, new THREE.Color(0xffa64d), 0.55));
    g.add(mk(reflections, new THREE.Color(0xffb35c), 0.42));
  }

  /* ---------------- lotus: pads, flowers, buds ---------------- */
  const padSpots = [];
  {
    const clusters = [];
    while (clusters.length < 26) {
      const x = (R() * 2 - 1) * (A - 3), z = (R() * 2 - 1) * (B - 3);
      if (pondR(x, z) > 0.86 || onDeck(x, z, 1.6) || onBridge(x, z, 0.8) || nearIsland(x, z, 1.5)) continue;
      clusters.push([x, z, 1.2 + R() * 2.2]);
    }
    for (const [cx, cz, sd] of clusters) {
      const n = 10 + Math.floor(R() * 16);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * sd * 1.6;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (pondR(x, z) > 0.93 || onDeck(x, z, 0.9) || onBridge(x, z, 0.3) || nearIsland(x, z, 0.4)) continue;
        if (poles.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.9)) continue;
        padSpots.push([x, z, 0.55 + R() * 0.75, R() * Math.PI * 2]);
      }
    }
    const padGeo = new THREE.CircleGeometry(0.5, 20, 0.22, Math.PI * 2 - 0.44);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
    padMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
         transformed.y += sin(uTime * 0.9 + ph) * 0.012 + length(position.xz) * 0.03;`);   // gentle bob, edges curl up a touch
    };
    const pads = new THREE.InstancedMesh(padGeo, padMat, padSpots.length);
    const greens = [0x3f6b2c, 0x4b7a31, 0x56813a, 0x355d27, 0x6a8a3c];
    const o = new THREE.Object3D(), c = new THREE.Color();
    padSpots.forEach(([x, z, s, r], i) => {
      o.position.set(x, WATER_Y + 0.015 + (i % 3) * 0.002, z); o.rotation.set(0, r, 0); o.scale.set(s, 1, s); o.updateMatrix();
      pads.setMatrixAt(i, o.matrix);
      pads.setColorAt(i, c.set(greens[i % greens.length]).multiplyScalar(0.85 + R() * 0.3));
    });
    pads.computeBoundingSphere();
    pads.receiveShadow = true;
    g.add(pads);

    // flowers: two rings of petals + a golden heart, on stems; pink, white and deep pink
    const petals = [];
    const petal = (len, wid, tilt, rotY, lift) => {
      const p = new THREE.SphereGeometry(1, 7, 5);
      p.scale(wid, 0.022, len); p.translate(0, 0, len * 0.85); p.rotateX(-tilt); p.rotateY(rotY); p.translate(0, lift, 0);
      petals.push(p.toNonIndexed());
    };
    for (let i = 0; i < 8; i++) petal(0.16, 0.07, 0.55, (i / 8) * Math.PI * 2, 0.0);
    for (let i = 0; i < 6; i++) petal(0.13, 0.06, 1.0, (i / 6) * Math.PI * 2 + 0.3, 0.02);
    for (let i = 0; i < 4; i++) petal(0.09, 0.05, 1.35, (i / 4) * Math.PI * 2 + 0.7, 0.04);
    const petalGeo = mergeGeometries(petals);
    const heartGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.05, 10); heartGeo.translate(0, 0.07, 0);
    const stemGeo = new THREE.CylinderGeometry(0.014, 0.018, 1, 5); stemGeo.translate(0, -0.5, 0);
    const budGeo = new THREE.SphereGeometry(0.075, 8, 6); budGeo.scale(1, 1.7, 1);
    const flowers = [], buds = [];
    padSpots.forEach(([x, z], i) => {
      if (i % 5 === 0) flowers.push([x + 0.15, z + 0.1, 0.12 + R() * 0.35, 1.2 + R() * 0.6, R() * 6]);
      else if (i % 9 === 0) buds.push([x - 0.12, z + 0.1, 0.35 + R() * 0.45, 1 + R() * 0.4, R() * 6]);
    });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0x4a1830, side: THREE.DoubleSide });
    const fl = new THREE.InstancedMesh(petalGeo, flowerMat, flowers.length);
    const hearts = new THREE.InstancedMesh(heartGeo, new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6a4a10, roughness: 0.5 }), flowers.length);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4f7a32, roughness: 0.8 }), flowers.length + buds.length);
    const bd = new THREE.InstancedMesh(budGeo, flowerMat, buds.length);
    const pinks = [0xff8fb8, 0xffc4da, 0xfff2f6, 0xff6fa3, 0xffb0cc];
    flowers.forEach(([x, z, h, s, r], i) => {
      o.position.set(x, WATER_Y + h, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix();
      fl.setMatrixAt(i, o.matrix); hearts.setMatrixAt(i, o.matrix);
      fl.setColorAt(i, c.set(pinks[i % pinks.length]));
      o.scale.set(1, h, 1); o.updateMatrix(); stems.setMatrixAt(i, o.matrix);
    });
    buds.forEach(([x, z, h, s, r], i) => {
      o.position.set(x, WATER_Y + h, z); o.rotation.set(0.15, r, 0); o.scale.setScalar(s); o.updateMatrix();
      bd.setMatrixAt(i, o.matrix); bd.setColorAt(i, c.set(pinks[(i + 2) % pinks.length]));
      o.rotation.set(0, 0, 0); o.scale.set(1, h, 1); o.updateMatrix(); stems.setMatrixAt(flowers.length + i, o.matrix);
    });
    for (const m of [fl, hearts, stems, bd]) { m.computeBoundingSphere(); g.add(m); }
  }

  /* ---------------- koi ---------------- */
  const koi = [];
  let koiBody, koiSpots;
  {
    const body = new THREE.SphereGeometry(1, 14, 10); body.scale(0.13, 0.08, 0.42); body.translate(0, 0, 0.05);
    const head = new THREE.SphereGeometry(1, 10, 8); head.scale(0.1, 0.07, 0.12); head.translate(0, -0.005, 0.38);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -0.17, 0.02, -0.62, 0.17, 0.02, -0.62, 0, 0, -0.3, 0, 0.0, -0.5, -0.17, 0.02, -0.62], 3));
    tail.computeVertexNormals();
    const finL = new THREE.BufferGeometry();
    finL.setAttribute('position', new THREE.Float32BufferAttribute([0.1, -0.03, 0.18, 0.28, -0.05, 0.05, 0.1, -0.03, 0.02, -0.1, -0.03, 0.18, -0.1, -0.03, 0.02, -0.28, -0.05, 0.05], 3));
    finL.computeVertexNormals();
    const bodyGeo = mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), tail, finL].map((x) => { x.deleteAttribute('uv'); return x; }));
    const spots = [];
    for (const [z, s, dx] of [[0.24, 0.09, 0.02], [0.02, 0.1, -0.03], [-0.17, 0.07, 0.03]]) {
      const sp = new THREE.SphereGeometry(1, 8, 6); sp.scale(s * 0.95, 0.05, s * 1.3); sp.translate(dx, 0.045, z);
      sp.deleteAttribute('uv');
      spots.push(sp.toNonIndexed());
    }
    const spotGeo = mergeGeometries(spots);
    const swim = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float kph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
         float bend = max(0.0, 0.15 - position.z);                          // the back half (and the tail) swings
         transformed.x += sin(uTime * 6.5 + kph - position.z * 5.0) * 0.09 * bend * bend * 4.0;`);
    };
    const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x3a2a1c, side: THREE.DoubleSide });
    const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x3a1408 });
    bm.onBeforeCompile = swim; sm.onBeforeCompile = swim;
    const breeds = [            // [body, spots, spotScale]
      [0xf6f1ea, 0xd8381e, 1], [0xf6f1ea, 0xe0522a, 1.15], [0xf09a2a, 0xf6f1ea, 0.9], [0xf2c14e, 0xf2c14e, 0],
      [0x1c1a1d, 0xf08a24, 1], [0xf6f1ea, 0x1c1a1d, 0.8], [0xd85a24, 0xd85a24, 0], [0xf6f1ea, 0xd8381e, 0.55],
    ];
    const N = 30;
    koiBody = new THREE.InstancedMesh(bodyGeo, bm, N);
    koiSpots = new THREE.InstancedMesh(spotGeo, sm, N);
    koiBody.frustumCulled = koiSpots.frustumCulled = false;
    koiBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage); koiSpots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const outer = i % 3 === 2;
      const br = breeds[i % breeds.length];
      koi.push({
        a: outer ? 21 + R() * 5 : 17.2 + R() * 3.5, b: outer ? 12.2 + R() * 1.2 : 10.3 + R() * 1.6,
        th: R() * Math.PI * 2, dir: R() < 0.5 ? -1 : 1, speed: 0.45 + R() * 0.55, depth: WATER_Y - 0.09 - R() * 0.08,
        wob: R() * 6, size: 0.8 + R() * 0.55, spot: br[2],
      });
      koiBody.setColorAt(i, c.set(br[0]));
      koiSpots.setColorAt(i, c.set(br[1]));
    }
    g.add(koiBody, koiSpots);
  }
  const koiPos = (k, th) => {
    const c = Math.cos(th), s = Math.sin(th), w = 1 + 0.06 * Math.sin(th * 3 + k.wob);
    return [k.a * w * Math.sign(c) * Math.pow(Math.abs(c), 0.5), k.b * w * Math.sign(s) * Math.pow(Math.abs(s), 0.5)];
  };

  /* ---------------- floating candle boats (krathong) ---------------- */
  const candles = [];
  {
    const leaf = new THREE.CylinderGeometry(0.24, 0.2, 0.07, 10);
    const petalRing = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.ConeGeometry(0.06, 0.16, 4); p.rotateX(-0.5); p.translate(0, 0.08, 0.15); p.rotateY((i / 8) * Math.PI * 2);
      petalRing.push(p.toNonIndexed());
    }
    const ringGeo = mergeGeometries(petalRing);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a32, roughness: 0.7 });
    const petMat = new THREE.MeshStandardMaterial({ color: 0xfff1f5, emissive: 0x3a2020, roughness: 0.6 });
    const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(3.2) });
    const flameGeo = new THREE.ConeGeometry(0.03, 0.1, 6);
    const halo = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb35c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const refl = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffa64d, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const reflGeo = new THREE.PlaneGeometry(1.6, 1.6); reflGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const cg = new THREE.Group();
      const m1 = new THREE.Mesh(leaf, leafMat); m1.position.y = 0.035; cg.add(m1);
      cg.add(new THREE.Mesh(ringGeo, petMat));
      const f = new THREE.Mesh(flameGeo, flame); f.position.y = 0.16; cg.add(f);
      const h = new THREE.Sprite(halo); h.scale.setScalar(0.85); h.position.y = 0.17; cg.add(h);
      const r = new THREE.Mesh(reflGeo, refl); r.position.y = 0.005 - 0.02; r.renderOrder = 3; cg.add(r);
      cg.scale.setScalar(1.25);
      candles.push({ g: cg, a: 16.6 + R() * 8, b: 9.8 + R() * 3.4, th: R() * Math.PI * 2, dir: R() < 0.5 ? -1 : 1, speed: 0.12 + R() * 0.1, wob: R() * 6, flame: f, halo: h });
      fx.add(cg);
    }
  }

  /* ---------------- ripples (a koi kissing the surface now and then) ---------------- */
  const ripples = [];
  {
    const rg = new THREE.RingGeometry(0.86, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.renderOrder = 3;
      fx.add(m);
      ripples.push({ m, t: 1 });
    }
  }
  let rippleT = 1.5, rippleI = 0;
  const ripple = (x, z) => {
    const r = ripples[rippleI++ % ripples.length];
    r.t = 0; r.m.position.set(x, WATER_Y + 0.01, z); r.m.visible = true;
  };

  /* ---------------- shoreline: rocks, reeds + cattails ---------------- */
  {
    const rocks = [];
    for (let i = 0; i < 150; i++) {
      const t = R() * Math.PI * 2, [x, z] = rim(t), d = Math.hypot(x, z), off = (R() - 0.35) * 1.2;
      const px = x + (x / d) * off, pz = z + (z / d) * off;
      if (Math.abs(pz) < 7 && Math.abs(px) > 26 && Math.abs(px) < 41) continue;     // keep the sala approaches clear
      rocks.push([px, pz, 0.28 + R() * 0.6, R() * 6]);
    }
    const rg = new THREE.IcosahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(rg, MAT.stone, rocks.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    rocks.forEach(([x, z, s, r], i) => {
      o.position.set(x, BANK_Y - s * 0.35, z); o.rotation.set(r, r * 1.7, r * 0.6); o.scale.set(s * 1.3, s * 0.8, s); o.updateMatrix();
      im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.setHSL(0.09, 0.12, 0.42 + R() * 0.18));
    });
    im.computeBoundingSphere();
    g.add(im);

    const blades = [], heads = [];
    for (let i = 0; i < 80; i++) {
      const t = R() * Math.PI * 2, [x, z] = rim(t), d = Math.hypot(x, z), off = -0.6 + R() * 1.6;
      const cx = x + (x / d) * off, cz = z + (z / d) * off;
      if (Math.abs(cz) < 7 && Math.abs(cx) > 26 && Math.abs(cx) < 41) continue;
      const n = 7 + Math.floor(R() * 6);
      for (let k = 0; k < n; k++) blades.push([cx + (R() - 0.5) * 0.9, cz + (R() - 0.5) * 0.9, 0.8 + R() * 0.9, R() * 6, (R() - 0.5) * 0.35]);
      if (R() < 0.6) for (let k = 0; k < 3; k++) heads.push([cx + (R() - 0.5) * 0.6, cz + (R() - 0.5) * 0.6, 1.2 + R() * 0.5]);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([-0.035, 0, 0, 0.035, 0, 0, 0, 1, 0], 3));
    bg.computeVertexNormals();
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x5f7f34, roughness: 0.8, side: THREE.DoubleSide });
    reedMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.x += sin(uTime * 1.3 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z) * 0.06 * position.y * position.y;`);
    };
    const reeds = new THREE.InstancedMesh(bg, reedMat, blades.length);
    const o2 = new THREE.Object3D(), c2 = new THREE.Color();
    blades.forEach(([x, z, h, r, lean], i) => {
      o2.position.set(x, WATER_Y - 0.05, z); o2.rotation.set(lean, r, lean * 0.5); o2.scale.set(1, h, 1); o2.updateMatrix();
      reeds.setMatrixAt(i, o2.matrix); reeds.setColorAt(i, c2.set(0x5f7f34).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.12));
    });
    reeds.computeBoundingSphere();
    g.add(reeds);
    const cg = new THREE.CapsuleGeometry(0.04, 0.16, 3, 6);
    const ct = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }), heads.length);
    heads.forEach(([x, z, h], i) => { o2.position.set(x, WATER_Y + h, z); o2.rotation.set(0, 0, 0); o2.scale.set(1, 1, 1); o2.updateMatrix(); ct.setMatrixAt(i, o2.matrix); });
    ct.computeBoundingSphere();
    g.add(ct);
  }

  /* ---------------- trees: frangipani (like the courtyard's), weeping willows over the water, palms, bamboo, a far tree belt ---------------- */
  {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5a2c, roughness: 0.8, flatShading: true });
    const place = (geo, mat, spots, shadow = false) => {
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      const o = new THREE.Object3D();
      spots.forEach(([x, z, s, r, y = BANK_Y], i) => { o.position.set(x, y, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.computeBoundingSphere();
      im.castShadow = shadow;
      g.add(im);
    };
    const limbs = (list, a, b, r0, r1) => {
      const d = b.clone().sub(a), c = new THREE.CylinderGeometry(r1, r0, d.length(), 6);
      c.translate(0, d.length() / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
      c.translate(a.x, a.y, a.z);
      list.push(c.toNonIndexed());
    };
    // frangipani (same recipe as the courtyard trees so the two venues feel related)
    {
      const br = [], leaf = [], blossom = [];
      const fork = V(0.1, 1.5, 0);
      limbs(br, V(0, 0, 0), fork, 0.2, 0.15);
      for (const [x, y, z] of [[1.3, 2.6, 0.4], [-1.1, 2.8, 0.7], [0.2, 3.0, -1.2], [-0.5, 2.5, -0.6]]) {
        const mid = V(x, y, z);
        limbs(br, fork, mid, 0.13, 0.09);
        for (const [dx, dy, dz] of [[0.6, 0.9, 0.3], [-0.2, 1.0, -0.5]]) {
          const tip = V(x + dx * Math.sign(x), y + dy, z + dz);
          limbs(br, mid, tip, 0.08, 0.05);
          const f = new THREE.IcosahedronGeometry(0.75, 0); f.scale(1.25, 0.6, 1.25); f.translate(tip.x, tip.y + 0.15, tip.z);
          leaf.push(f);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2, b = new THREE.IcosahedronGeometry(0.1, 0);
            b.translate(tip.x + Math.cos(a) * 0.55, tip.y + 0.42, tip.z + Math.sin(a) * 0.55);
            blossom.push(b);
          }
        }
      }
      const spots = [[24, 26, 1.0, 0.3], [-24, -26, 1.05, 2.0], [36, 9.5, 0.95, 1.1], [-36, -9.5, 1.0, 2.6], [36, -9.5, 1.1, 0.4], [-36, 9.5, 0.9, 3.0],
        [ISLANDS[0][0] - 1.4, ISLANDS[0][1] + 0.6, 0.7, 0.2], [ISLANDS[1][0] + 1.4, ISLANDS[1][1] - 0.6, 0.7, 1.4]];
      place(mergeGeometries(br), bark, spots);
      place(mergeGeometries(leaf), leafMat, spots);
      place(mergeGeometries(blossom), new THREE.MeshStandardMaterial({ color: 0xfff1da, emissive: 0x5a4632, roughness: 0.6 }), spots);
    }
    // weeping willows leaning out over the water
    {
      const tr = [], cr = [];
      limbs(tr, V(0, 0, 0), V(0.4, 2.6, 0), 0.32, 0.2);
      limbs(tr, V(0.4, 2.6, 0), V(1.6, 4.0, 0.3), 0.2, 0.12);
      limbs(tr, V(0.4, 2.6, 0), V(-0.6, 4.2, -0.6), 0.18, 0.1);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, r = 1.2 + (i % 3) * 0.55;
        const s = new THREE.IcosahedronGeometry(0.45, 0); s.scale(0.55, 2.6 + (i % 4) * 0.35, 0.55);
        s.translate(0.6 + Math.cos(a) * r, 3.3 - (i % 4) * 0.25, Math.sin(a) * r);
        cr.push(s);
      }
      const crown = new THREE.IcosahedronGeometry(1.6, 0); crown.scale(1.3, 0.7, 1.3); crown.translate(0.6, 4.6, 0);
      cr.push(crown);
      const spots = [];
      for (const t of [0.35, 1.05, 1.9, 2.45, 3.5, 4.2, 5.0, 5.75]) {
        const [x, z] = rim(t), d = Math.hypot(x, z);
        if (Math.abs(z) < 7 && Math.abs(x) > 26) continue;
        spots.push([x + (x / d) * 1.6, z + (z / d) * 1.6, 0.9 + (t % 0.4), Math.atan2(-x, -z) - Math.PI / 2]);   // lean toward the water
      }
      place(mergeGeometries(tr), bark, spots);
      place(mergeGeometries(cr), new THREE.MeshStandardMaterial({ color: 0x6f8f3a, roughness: 0.85, flatShading: true }), spots);
    }
    // coconut palms
    {
      const tr = [], fr = [];
      let p = V(0, 0, 0);
      for (let i = 0; i < 7; i++) { const q = V(Math.sin(i * 0.25) * 0.6, (i + 1) * 1.15, 0); limbs(tr, p, q, 0.2 - i * 0.012, 0.19 - i * 0.012); p = q; }
      for (let i = 0; i < 8; i++) {
        const f = new THREE.PlaneGeometry(0.55, 2.8, 1, 6);
        const pa = f.attributes.position;
        for (let k = 0; k < pa.count; k++) { const y = pa.getY(k) + 1.4; pa.setXYZ(k, pa.getX(k) * (1 - y / 3.2), 0, y); pa.setY(k, -0.12 * y * y); }
        f.computeVertexNormals();
        f.rotateY((i / 8) * Math.PI * 2); f.translate(p.x, p.y, p.z);
        fr.push(f);
      }
      const spots = [[-26, 25.5, 1.0, 0.4], [-20, 26.5, 1.1, 2.2], [30, -25, 1.05, 1.0], [22, -26.5, 0.95, 3.1], [40, 18, 1.1, 0.7],
        [-40, -18, 1.0, 2.5], [40, -18, 0.9, 1.9], [-40, 18, 1.05, 0.2], [8, 27.5, 1.0, 1.4], [-8, -27.5, 1.0, 2.9]];
      place(mergeGeometries(tr), bark, spots);
      place(mergeGeometries(fr), new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), spots);
    }
    // bamboo clumps
    {
      const st = [], lv = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2, r = 0.25 + (i % 3) * 0.2, h = 5.5 + (i % 4) * 1.1;
        const base = V(Math.cos(a) * r, 0, Math.sin(a) * r), top = V(Math.cos(a) * (r + 0.9), h, Math.sin(a) * (r + 0.9));
        limbs(st, base, top, 0.06, 0.05);
        for (let k = 0; k < 3; k++) {
          const l = new THREE.IcosahedronGeometry(0.55, 0); l.scale(1.3, 0.5, 1.3);
          l.translate(top.x * (0.75 + k * 0.1), h * (0.72 + k * 0.12), top.z * (0.75 + k * 0.1));
          lv.push(l);
        }
      }
      const spots = [[-31, 15, 1, 0], [31, -15, 1, 1], [12, 26.5, 1.1, 2], [-12, -26.5, 1, 3], [-4, 27, 0.9, 1.5], [4, -27, 0.95, 0.5]];
      place(mergeGeometries(st), new THREE.MeshStandardMaterial({ color: 0x8a9a3a, roughness: 0.7 }), spots);
      place(mergeGeometries(lv), new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 0.8, flatShading: true }), spots);
    }
    // far tree belt: hides the edge of the world, frames the chedis
    {
      const belt = [];
      for (let i = 0; i < 150; i++) {
        const t = (i / 150) * Math.PI * 2 + R() * 0.03, [x, z] = rim(t), k = 1.3 + R() * 0.3;
        const bx = x * k, bz = z * k;
        if (Math.abs(bz) < 19 && Math.abs(bx) > 30) continue;                   // keep the sky behind the salas + chedis open
        belt.push([bx, bz, 1.1 + R() * 1.1, R() * 6]);
      }
      const blobs = [];
      for (const [x, y, z, r] of [[0, 2.6, 0, 1.3], [0.9, 2.2, 0.4, 0.95], [-0.8, 2.3, -0.3, 1.0], [0.1, 3.4, -0.2, 0.85]]) {
        const b = new THREE.IcosahedronGeometry(r, 0); b.translate(x, y, z); blobs.push(b);
      }
      const geo = mergeGeometries(blobs);
      const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.8, 5); trunk.translate(0, 0.8, 0);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x24402a, roughness: 0.9, flatShading: true }), belt.length);
      const imT = new THREE.InstancedMesh(trunk, bark, belt.length);
      const o = new THREE.Object3D(), c = new THREE.Color();
      belt.forEach(([x, z, s, r], i) => {
        o.position.set(x, BANK_Y, z); o.rotation.set(0, r, 0); o.scale.set(s, s * (0.9 + (i % 4) * 0.15), s); o.updateMatrix();
        im.setMatrixAt(i, o.matrix); imT.setMatrixAt(i, o.matrix);
        im.setColorAt(i, c.set(0x24402a).offsetHSL((R() - 0.5) * 0.05, 0, (R() - 0.5) * 0.08));
      });
      im.computeBoundingSphere(); imT.computeBoundingSphere();
      g.add(im, imT);
    }
  }

  /* ---------------- fireflies over the reeds and the lotus ---------------- */
  let fireflies;
  {
    const N = 170, pos = [], seed = [];
    for (let i = 0; i < N; i++) {
      let x, z;
      if (i % 2) { const t = R() * Math.PI * 2, [rx, rz] = rim(t); x = rx * (0.95 + R() * 0.12); z = rz * (0.95 + R() * 0.12); }
      else { const p = padSpots[Math.floor(R() * padSpots.length)] || [20, 12]; x = p[0] + (R() - 0.5) * 3; z = p[1] + (R() - 0.5) * 3; }
      pos.push(x, WATER_Y + 0.4 + R() * 2.2, z); seed.push(R());
    }
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
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * 2.2 * a, a);
        }`,
    });
    fireflies = new THREE.Points(geo, mat);
    fireflies.frustumCulled = false;
    fx.add(fireflies);
  }

  /* ---------------- evening mist lying on the water near the banks ---------------- */
  const mist = [];
  {
    const mg = new THREE.PlaneGeometry(1, 1); mg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2 + 0.2, [x, z] = rim(t);
      const m = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xc9b4d8, transparent: true, opacity: 0.09 + (i % 3) * 0.02, depthWrite: false }));
      m.scale.set(12 + (i % 4) * 3, 1, 6 + (i % 3) * 2);
      m.position.set(x * 0.86, WATER_Y + 0.25 + (i % 3) * 0.1, z * 0.86);
      m.renderOrder = 4;
      fx.add(m);
      mist.push({ m, x: m.position.x, z: m.position.z, ph: i * 1.7 });
    }
  }

  /* ---------------- DAY: dragonflies over the lotus, a heron on each island ---------------- */
  const herons = [];
  const dayLife = new THREE.Group();
  g.add(dayLife);
  const dfHomes = [];
  for (let i = 0; i < 14; i++) { const pd = padSpots[Math.floor(R() * padSpots.length)]; if (pd) dfHomes.push([pd[0], WATER_Y + 0.6 + R() * 0.6, pd[1]]); }
  const dragonflies = makeFlyers(dfHomes, 'dragonfly');
  dayLife.add(dragonflies.g);
  {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.8 });
    const yel = new THREE.MeshStandardMaterial({ color: 0xe8b23a, roughness: 0.6 });
    for (const [ix, iz] of ISLANDS) {
      const h = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), white); b.scale.set(0.8, 0.8, 1.5); b.position.y = 0.95; h.add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 5), white); n.position.set(0, 1.25, 0.22); n.rotation.x = 0.35; h.add(n);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), white); hd.position.set(0, 1.5, 0.32); h.add(hd);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 4), yel); bk.rotation.x = Math.PI / 2; bk.position.set(0, 1.5, 0.45); h.add(bk);
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), dark); l.position.set(s * 0.06, 0.4, 0); h.add(l); }
      const dx = ix > 0 ? -2.4 : 2.4;
      h.position.set(ix + dx, WATER_Y, iz + (iz > 0 ? -1.6 : 1.6));     // wading at the island's edge
      h.rotation.y = Math.atan2(-(ix + dx), -iz);
      dayLife.add(h);
      herons.push({ h, hd, ph: R() * 6 });
    }
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  /* ---------------- per-frame life ---------------- */
  const o = new THREE.Object3D();
  let time = 0;
  function update(dt, pixelRatio = 1) {
    time += dt;
    uTime.value = time;
    // koi
    for (let i = 0; i < koi.length; i++) {
      const k = koi[i];
      const R0 = (k.a + k.b) / 2;
      k.th += (k.dir * k.speed * (0.8 + 0.25 * Math.sin(time * 0.3 + k.wob)) * dt) / R0;
      const [x, z] = koiPos(k, k.th), [x2, z2] = koiPos(k, k.th + k.dir * 0.02);
      o.position.set(x, k.depth + Math.sin(time * 0.7 + k.wob) * 0.03, z);
      o.rotation.set(0, Math.atan2(x2 - x, z2 - z), 0);
      o.scale.setScalar(k.size);
      o.updateMatrix();
      koiBody.setMatrixAt(i, o.matrix);
      o.scale.set(k.size * Math.max(0.01, k.spot), k.size, k.size * Math.max(0.01, k.spot));
      o.updateMatrix();
      koiSpots.setMatrixAt(i, o.matrix);
    }
    koiBody.instanceMatrix.needsUpdate = true;
    koiSpots.instanceMatrix.needsUpdate = true;
    if (dayLife.visible) {
      dragonflies.update(dt, time);
      for (const hr of herons) hr.h.rotation.y += Math.sin(time * 0.4 + hr.ph) * 0.002;
    }
    if (!fx.visible) return;
    // candle boats drift on slow loops; flames flicker
    for (const cd of candles) {
      cd.th += (cd.dir * cd.speed * dt) / ((cd.a + cd.b) / 2);
      const c = Math.cos(cd.th), s = Math.sin(cd.th), w = 1 + 0.05 * Math.sin(cd.th * 2 + cd.wob);
      cd.g.position.set(cd.a * w * Math.sign(c) * Math.pow(Math.abs(c), 0.5), WATER_Y + 0.005 + Math.sin(time * 1.3 + cd.wob) * 0.012, cd.b * w * Math.sign(s) * Math.pow(Math.abs(s), 0.5));
      const fl = 0.85 + 0.15 * Math.sin(time * 13 + cd.wob * 5) + 0.08 * Math.sin(time * 29 + cd.wob);
      cd.flame.scale.set(1, fl, 1);
      cd.halo.scale.setScalar(0.85 * fl);
    }
    // ripples
    rippleT -= dt;
    if (rippleT <= 0) {
      rippleT = 0.9 + Math.random() * 2.2;
      const k = koi[Math.floor(Math.random() * koi.length)];
      const [x, z] = koiPos(k, k.th);
      ripple(x, z);
    }
    for (const r of ripples) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / 2.2);
      r.m.scale.setScalar(0.25 + r.t * 1.8);
      r.m.material.opacity = 0.32 * (1 - r.t);
      if (r.t >= 1) r.m.visible = false;
    }
    for (const m of mist) {
      m.m.position.x = m.x + Math.sin(time * 0.05 + m.ph) * 2.2;
      m.m.position.z = m.z + Math.cos(time * 0.04 + m.ph) * 1.2;
    }
    fireflies.material.uniforms.uScale.value = pixelRatio;
  }

  // night: candle boats, fireflies and mist; day: just the pond (phase 2 adds dragonflies)
  function setTime(tod) {
    const night = tod !== 'day';
    for (const cd of candles) cd.g.visible = night;
    fireflies.visible = night;
    for (const m of mist) m.m.visible = night;
    dayLife.visible = !night;
  }
  return { g, fx, update, setTime };
}
