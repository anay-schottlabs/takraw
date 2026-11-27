// CRUISE DECK — the court on the top sports deck of a cruise ship steaming through the night. The ship runs along z (bow toward −z),
// so both match cameras look ACROSS the ship, over the far rail, at nothing but dark sea and the horizon. Down the sides of the shot:
// the forward superstructure (three tiers of lit windows, the bridge and a radar mast) and, aft, the pool deck — glowing pools,
// hot tubs, loungers and a bar — then the spa block with the funnel and the stern decks. The hull below has rows of lit balconies
// and lifeboats on davits. Out at sea: a moon path on the water (in the ocean shader, so it's right from every viewpoint), the wake
// and bow waves streaming past, another ship off the starboard quarter, a coastline and a lighthouse far to port.
// Motion: the SEA rolls, pitches and heaves a touch (we ride the ship, so the ship — and the camera and court — stay steady),
// the water streams past, gulls ride the air behind the funnel, spray flies off the bow wave, the radar turns.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, floodPoles, boundaryRail, neonSign, paint, vcMat } from './props.js';
import { personGeometry } from './life.js';

const WATER_Y = -24;          // sea level (the top deck is 24 m up)
const SPEED = 7;              // m/s the water streams past the ship
const BOW_TAPER = -38;        // the hull narrows from here to the bow tip
const BOW_LEN = 48;
// the moon (own sky for this map): low over the starboard quarter, out of both match cameras' view
const MOON_AZ = 0.96, MOON_EL = 0.56;
const MOON = new THREE.Vector3(Math.cos(MOON_EL) * Math.cos(MOON_AZ), Math.sin(MOON_EL), Math.cos(MOON_EL) * Math.sin(MOON_AZ));
const FOG = 0x0d1426;

export function buildCruise(ctx) {
  const { F, xf, makeBatch, glowTexture } = ctx;
  const g = new THREE.Group(); g.name = 'cruise';
  const fx = new THREE.Group(); g.add(fx);
  const R = rnd(4242);
  const uTime = { value: 0 };
  const decor = makeBatch(), solid = makeBatch();
  const put = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => decor.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const putS = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => solid.put(mat, xf(geo, x, y, z, ry, rx, rz));
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------------- layout (everything follows the court size) ---------------- */
  const B = F.outX + 4.2;              // half-beam: the ship's side rail (a 3.8 m deck band beside the court)
  const ZF = -(F.outZ + 3.4);          // forward superstructure's aft face
  const ZA = F.outZ + 3.4;             // pool deck starts
  const ZS = ZA + 46;                  // stern
  const BOW = BOW_TAPER - BOW_LEN;     // bow tip
  const halfW = (z) => (z > BOW_TAPER ? B : B * (1 - ((BOW_TAPER - z) / BOW_LEN) ** 2));

  /* ---------------- canvas textures ---------------- */
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const ctex = (c, srgb = true, rep = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  // teak: narrow planks running fore–aft with black caulking, staggered butt joints (tile = 2 m)
  const teakMap = (() => {
    const [c, x] = canvas(512, 512), n = 14, pw = 512 / n;
    for (let i = 0; i < n; i++) {
      let y = -R() * 300;
      while (y < 512) {
        const len = 180 + R() * 260, col = [150 + R() * 30, 96 + R() * 22, 58 + R() * 16];
        x.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; x.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(60,30,10,${(R() * 0.12).toFixed(3)})`; x.fillRect(i * pw + R() * pw, y, 1 + R() * 2, len); }   // grain
        x.fillStyle = '#1a120c'; x.fillRect(i * pw, y + len - 2, pw, 2);
        y += len;
      }
      x.fillStyle = '#16100b'; x.fillRect(i * pw, 0, 2.5, 512);
    }
    // wrap the butt joints vertically
    const t = ctex(c); t.repeat.set(0.5, 0.5);
    return t;
  })();
  // hull side: rows of balcony cabins, the lifeboat promenade, portholes, a navy hull and red boot-top (tile 48 m × 26 m)
  const HULL_TOP = 0, HULL_BOT = WATER_Y - 2, HULL_W = 48;
  const [hullMap, hullGlow] = (() => {
    const W = 1024, H = 1024, mx = W / HULL_W, my = H / (HULL_TOP - HULL_BOT);
    const [c, x] = canvas(W, H), [e, xe] = canvas(W, H);
    const Y = (y) => (HULL_TOP - y) * my, X = (m) => m * mx;
    x.fillStyle = '#e8ebee'; x.fillRect(0, 0, W, H);
    xe.fillStyle = '#000'; xe.fillRect(0, 0, W, H);
    x.fillStyle = '#c9cfd6'; x.fillRect(0, 0, W, Y(-0.3));
    const lit = ['#ffd08a', '#ffe2b4', '#ffc070', '#f6e6c8', '#bfd8ff'];
    for (let r = 0; r < 4; r++) {                        // balcony rows
      const top = -1.0 - r * 3.0;
      for (let b = 0; b < 16; b++) {
        const x0 = X(b * 3 + 0.25), w = X(2.5);
        x.fillStyle = '#28323e'; x.fillRect(x0, Y(top), w, Y(top - 2.2) - Y(top));                  // sliding door
        const on = R() < 0.38;
        if (on) {
          const col = lit[Math.floor(R() * lit.length)];
          x.fillStyle = '#6a5a44'; x.fillRect(x0 + 2, Y(top) + 2, w - 4, Y(top - 2.2) - Y(top) - 4);
          xe.fillStyle = col; xe.globalAlpha = 0.55 + R() * 0.45; xe.fillRect(x0 + 2, Y(top) + 2, w - 4, Y(top - 2.2) - Y(top) - 4); xe.globalAlpha = 1;
          if (R() < 0.5) { xe.fillStyle = 'rgba(0,0,0,0.6)'; xe.fillRect(x0 + 2, Y(top) + 2, w * (0.2 + R() * 0.3), Y(top - 2.2) - Y(top) - 4); }   // a curtain half drawn
        }
        x.fillStyle = 'rgba(150,175,190,0.75)'; x.fillRect(x0 - 2, Y(top - 1.25), w + 4, Y(top - 2.3) - Y(top - 1.25));   // glass balcony front
        xe.fillStyle = 'rgba(0,0,0,0.55)'; xe.fillRect(x0 - 2, Y(top - 1.25), w + 4, Y(top - 2.3) - Y(top - 1.25));
        x.fillStyle = '#d4d9de'; x.fillRect(X(b * 3) - 2, Y(top + 0.3), 4, Y(top - 2.4) - Y(top + 0.3));   // partition
      }
      x.fillStyle = '#b8c0c8'; x.fillRect(0, Y(top - 2.35), W, 3);
    }
    // lifeboat promenade: a dark recess with a row of ceiling lights
    x.fillStyle = '#2c333b'; x.fillRect(0, Y(-13.4), W, Y(-16.4) - Y(-13.4));
    x.fillStyle = '#555e66'; x.fillRect(0, Y(-16.0), W, Y(-16.4) - Y(-16.0));
    xe.fillStyle = 'rgba(255,214,150,0.22)'; xe.fillRect(0, Y(-13.6), W, Y(-16.2) - Y(-13.6));
    for (let i = 0; i < 32; i++) { xe.fillStyle = '#ffe0a8'; xe.fillRect(X(i * 1.5 + 0.5), Y(-13.5), X(0.5), 3); }
    for (const yy of [-17.6, -19.2]) for (let i = 0; i < 32; i++) {   // portholes
      const px = X(i * 1.5 + 0.75), py = Y(yy), r = X(0.28);
      x.fillStyle = '#2a333c'; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      if (R() < 0.3) { xe.fillStyle = lit[Math.floor(R() * 3)]; xe.beginPath(); xe.arc(px, py, r * 0.8, 0, Math.PI * 2); xe.fill(); }
    }
    x.fillStyle = '#2a8fb8'; x.fillRect(0, Y(-20.3), W, Y(-20.6) - Y(-20.3));
    x.fillStyle = '#18222f'; x.fillRect(0, Y(-20.6), W, H);
    x.fillStyle = '#7a2420'; x.fillRect(0, Y(-23.5), W, H);
    return [ctex(c), ctex(e)];
  })();
  // superstructure window band (tile 16 m × 2.4 m): big lounge windows, some lit
  const [winMap, winGlow] = (() => {
    const W = 512, H = 80;
    const [c, x] = canvas(W, H), [e, xe] = canvas(W, H);
    x.fillStyle = '#3a424c'; x.fillRect(0, 0, W, H); xe.fillStyle = '#000'; xe.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      const x0 = i * 64 + 3;
      x.fillStyle = '#1b2733'; x.fillRect(x0, 4, 58, H - 8);
      x.fillStyle = 'rgba(120,150,175,0.25)'; x.fillRect(x0, 4, 58, 10);
      if (R() < 0.55) {
        const col = ['#ffcf8a', '#ffe6bc', '#f2c27a', '#cfe2ff'][Math.floor(R() * 4)];
        xe.fillStyle = col; xe.globalAlpha = 0.45 + R() * 0.4; xe.fillRect(x0, 4, 58, H - 8); xe.globalAlpha = 1;
        x.fillStyle = '#5c5040'; x.fillRect(x0, 4, 58, H - 8);
        xe.fillStyle = 'rgba(0,0,0,0.5)'; xe.fillRect(x0 + R() * 40, 4, 8 + R() * 12, H - 8);   // someone / a plant against the light
      }
      x.fillStyle = '#4a525c'; x.fillRect(x0 + 28, 4, 2, H - 8);
    }
    return [ctex(c), ctex(e)];
  })();

  const MAT = {
    teak: new THREE.MeshStandardMaterial({ map: teakMap, roughness: 0.55, metalness: 0 }),
    hull: new THREE.MeshStandardMaterial({ map: hullMap, emissiveMap: hullGlow, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6, side: THREE.DoubleSide }),
    win: new THREE.MeshStandardMaterial({ map: winMap, emissiveMap: winGlow, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.25, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8ced4, metalness: 0.7, roughness: 0.35 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.4 }),           // varnished teak handrail
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc8d8, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false }),
    panel: new THREE.MeshStandardMaterial({ color: 0x1f3a5a, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(1.8) }),
    glowVC: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0xffffff).multiplyScalar(2.0) }),
    vc: vcMat({ roughness: 0.6 }),
    vcFlat: vcMat({ flatShading: true }),
  };
  const WHITE = 0xeef0f2, NAVY = 0x1d3550, TEAL = 0x1f9fae, DARK = 0x2a2f36;

  /* ---------------- hull: walls round the deck outline, the top deck, lifeboats ---------------- */
  const outline = [];          // plan [x, z], counter-clockwise from the stern centre
  {
    const rc = 5;
    outline.push([0, ZS]);
    for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 - (i / 6) * Math.PI / 2; outline.push([B - rc + Math.cos(a) * rc, ZS - rc + Math.sin(a) * rc]); }
    for (let i = 0; i <= 12; i++) { const t = i / 12, z = BOW_TAPER - t * BOW_LEN; outline.push([halfW(z), z]); }
    outline.pop(); outline.push([0, BOW]);
    for (let i = 11; i >= 0; i--) { const t = i / 12, z = BOW_TAPER - t * BOW_LEN; outline.push([-halfW(z), z]); }
    for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI / 2; outline.push([-(B - rc) + Math.cos(a) * rc, ZS - rc - Math.sin(a) * rc]); }
    outline.push([0, ZS]);
  }
  {
    const pos = [], uv = [];
    let s = 0;
    for (let i = 0; i < outline.length - 1; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 1e-4) continue;
      const u0 = s / HULL_W, u1 = (s + L) / HULL_W;
      pos.push(x0, HULL_TOP, z0, x0, HULL_BOT, z0, x1, HULL_BOT, z1, x0, HULL_TOP, z0, x1, HULL_BOT, z1, x1, HULL_TOP, z1);
      uv.push(u0, 1, u0, 0, u1, 0, u0, 1, u1, 0, u1, 1);
      s += L;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    decor.put(MAT.hull, geo);
  }
  // the top deck: one teak slab round the court (the court's own deck fills the hole)
  {
    const sh = new THREE.Shape(outline.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
    const hx = F.outX + 0.4, hz = F.outZ + 0.4;
    sh.holes.push(new THREE.Path([new THREE.Vector2(-hx, -hz), new THREE.Vector2(-hx, hz), new THREE.Vector2(hx, hz), new THREE.Vector2(hx, -hz)]));
    const geo = new THREE.ShapeGeometry(sh, 4);
    geo.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(geo, MAT.teak);
    deck.receiveShadow = true;
    g.add(deck);
  }
  // ship's side rail: glass panels between steel posts, a teak cap, round the whole deck edge
  {
    const H = 1.1;
    for (let i = 0; i < outline.length - 1; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.3) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      put(MAT.rail, new THREE.BoxGeometry(L + 0.06, 0.07, 0.14), cx, H, cz, ry);
      put(MAT.glass, new THREE.BoxGeometry(L, 0.92, 0.03), cx, 0.52, cz, ry);
      const n = Math.max(1, Math.round(L / 1.8));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        put(MAT.steel, new THREE.BoxGeometry(0.05, H, 0.05), x0 + (x1 - x0) * t, H / 2, z0 + (z1 - z0) * t, ry);
      }
    }
  }
  // lifeboats hanging on davits in the promenade recess, both sides
  {
    const boat = (() => {
      const P = [];
      const hull = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); hull.scale(4.2, 1.0, 1.45); P.push(paint(hull, 0xf2f0ea));
      const can = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2); can.scale(3.9, 1.05, 1.36); P.push(paint(can, 0xff6a14));
      const band = new THREE.CylinderGeometry(1, 1, 0.22, 14, 1, true); band.scale(4.15, 1, 1.43); P.push(paint(band, 0xf0661c));
      const winb = new THREE.CylinderGeometry(1, 1, 0.18, 14, 1, true); winb.scale(3.6, 1, 1.28); winb.translate(0, 0.45, 0); P.push(paint(winb, 0x26313b));
      return mergeGeometries(P);
    })();
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
      const z = -34 + i * 10.5, x = sx * (B + 1.55);
      put(MAT.vc, boat.clone(), x, -15.0, z, Math.PI / 2);
      for (const dz of [-2.9, 2.9]) {
        put(MAT.vc, paint(new THREE.BoxGeometry(1.9, 0.22, 0.22), 0x8a9298), sx * (B + 0.85), -12.9, z + dz);
        put(MAT.vc, paint(new THREE.BoxGeometry(0.22, 2.4, 0.22), 0x8a9298), sx * B + sx * 0.1, -14.0, z + dz, 0, 0, sx * 0.25);
        put(MAT.steel, new THREE.BoxGeometry(0.03, 1.8, 0.03), x, -13.9, z + dz);
      }
    }
  }

  /* ---------------- superstructure: forward tiers + bridge + mast, aft spa block + funnel ---------------- */
  const box = (x0, x1, y0, y1, z0, z1, col = WHITE) => put(MAT.vc, paint(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), col), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const band = (len, cx, cy, cz, ry, h = 2.3) => {             // a strip of windows, ry = which way it faces (0 = +z)
    const pg = new THREE.PlaneGeometry(len, h), u = pg.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * len / 16);
    put(MAT.win, pg, cx + Math.sin(ry) * 0.03, cy, cz + Math.cos(ry) * 0.03, ry);
  };
  const railRun = (x0, z0, x1, z1, y, H = 1.0) => {             // simple steel railing on a roof edge
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    put(MAT.steel, new THREE.BoxGeometry(L, 0.05, 0.05), cx, y + H, cz, ry);
    put(MAT.steel, new THREE.BoxGeometry(L, 0.03, 0.03), cx, y + H * 0.5, cz, ry);
    const n = Math.max(1, Math.round(L / 1.6));
    for (let k = 0; k <= n; k++) put(MAT.steel, new THREE.BoxGeometry(0.04, H, 0.04), x0 + (x1 - x0) * k / n, y + H / 2, z0 + (z1 - z0) * k / n);
  };
  const tier = (hx, y0, y1, z0, z1, faceZ, faceSign) => {      // a deckhouse with windows on the court-facing end and both sides
    box(-hx, hx, y0, y1, z0, z1);
    const h = Math.min(2.3, (y1 - y0) - 0.9), cy = y0 + 0.55 + h / 2;
    band(hx * 2 - 1.2, 0, cy, faceZ, faceSign > 0 ? 0 : Math.PI, h);
    for (const sx of [-1, 1]) band(z1 - z0 - 1.2, sx * hx, cy, (z0 + z1) / 2, sx * Math.PI / 2, h);
  };
  const glowBits = [];   // [geo, colour] → one vertex-coloured glow mesh
  const glowAt = (geo, col, x, y, z, ry = 0) => glowBits.push(paint(xf(geo, x, y, z, ry), col));
  // forward: three stepped tiers, the bridge on top, a radar mast
  const fwdEnd = ZF - 20;
  tier(B - 1.0, 0, 3.5, fwdEnd, ZF, ZF, 1);
  box(-(B - 0.7), B - 0.7, 3.5, 3.8, fwdEnd - 0.3, ZF + 0.5);
  tier(B - 2.6, 3.8, 7.0, fwdEnd, ZF - 3.2, ZF - 3.2, 1);
  box(-(B - 2.3), B - 2.3, 7.0, 7.3, fwdEnd - 0.3, ZF - 2.8);
  box(-(B - 5), B - 5, 7.3, 10.2, fwdEnd, ZF - 8, 0xdfe3e6);
  band((B - 5) * 2 - 1, 0, 8.9, ZF - 8, 0, 1.5);
  for (const sx of [-1, 1]) band(10.8, sx * (B - 5), 8.9, ZF - 14, sx * Math.PI / 2, 1.5);
  box(-(B - 4.7), B - 4.7, 10.2, 10.5, fwdEnd - 0.3, ZF - 7.7);
  // bridge wings reaching out to the ship's sides, with the running lights (red = port, green = starboard)
  box(-(B - 0.4), B - 0.4, 7.3, 9.6, fwdEnd + 0.5, fwdEnd + 3.5, 0xdfe3e6);
  for (const sx of [-1, 1]) band(2.6, sx * (B - 0.4), 8.5, fwdEnd + 2, sx * Math.PI / 2, 1.3);
  glowAt(new THREE.BoxGeometry(0.3, 0.3, 0.5), 0xff2a1a, -(B - 0.3), 9.9, fwdEnd + 2.5);
  glowAt(new THREE.BoxGeometry(0.3, 0.3, 0.5), 0x2aff6a, B - 0.3, 9.9, fwdEnd + 2.5);
  // sun-deck rails on the tier roofs, facing the court
  railRun(-(B - 0.8), ZF + 0.4, B - 0.8, ZF + 0.4, 3.8);
  for (const sx of [-1, 1]) railRun(sx * (B - 0.8), ZF + 0.4, sx * (B - 0.8), fwdEnd, 3.8);
  railRun(-(B - 2.4), ZF - 2.9, B - 2.4, ZF - 2.9, 7.3);
  // mast: pole, yard, radar platform + two turning scanners, radome, masthead light
  const mastZ = ZF - 13;
  put(MAT.vc, paint(new THREE.CylinderGeometry(0.22, 0.38, 10, 8), WHITE), 0, 15.5, mastZ);
  put(MAT.vc, paint(new THREE.BoxGeometry(6.4, 0.16, 0.16), WHITE), 0, 18.4, mastZ);
  put(MAT.vc, paint(new THREE.BoxGeometry(3.6, 0.2, 2.2), 0xd8dce0), 0, 13.2, mastZ);
  put(MAT.vc, paint(new THREE.SphereGeometry(0.9, 12, 8), 0xf4f4f2), 2.4, 12.4, mastZ - 2.5);
  put(MAT.vc, paint(new THREE.CylinderGeometry(0.3, 0.4, 1.9, 8), WHITE), 2.4, 11.4, mastZ - 2.5);
  glowAt(new THREE.SphereGeometry(0.2, 8, 6), 0xfff6e8, 0, 20.7, mastZ);
  for (const sx of [-1, 1]) glowAt(new THREE.SphereGeometry(0.12, 6, 5), 0xfff0d0, sx * 3.1, 18.2, mastZ);
  const radar = new THREE.Group();
  {
    const P = [paint(new THREE.BoxGeometry(4.2, 0.22, 0.32), 0x2a2e34)];
    const a = paint(new THREE.BoxGeometry(4.2, 0.22, 0.32), 0x2a2e34); a.translate(0, 1.25, 0); a.scale(0.7, 1, 1); P.push(a);
    const p = paint(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), 0x9aa0a6); p.translate(0, 0.6, 0); P.push(p);
    const geo = mergeGeometries(P);
    for (const [y, x] of [[13.45, -0.6], [13.45, 0.9]]) { const m = new THREE.Mesh(geo, MAT.vc); m.position.set(x, y, mastZ + (x > 0 ? 0.5 : -0.5)); radar.add(m); }
    g.add(radar);
  }
  // aft: the spa / bar block (two tiers) with the funnel on top
  const aftStart = ZA + 14.5, aftEnd = ZA + 31;
  tier(B - 1.0, 0, 3.6, aftStart, aftEnd, aftStart, -1);
  box(-(B - 0.7), B - 0.7, 3.6, 3.9, aftStart - 0.4, aftEnd + 0.3);
  tier(B - 3.2, 3.9, 7.1, aftStart + 3.5, aftEnd, aftStart + 3.5, -1);
  box(-(B - 2.9), B - 2.9, 7.1, 7.4, aftStart + 3.2, aftEnd + 0.3);
  railRun(-(B - 0.8), aftStart - 0.3, B - 0.8, aftStart - 0.3, 3.9);
  for (const sx of [-1, 1]) railRun(sx * (B - 0.8), aftStart - 0.3, sx * (B - 0.8), aftEnd + 0.2, 3.9);
  // the funnel: raked oval stack — white, a teal band, black top, the takraw-ball emblem lit on both sides
  const funZ = aftStart + 10.5, funY0 = 7.4, funH = 11.5, RAKE = 0.16;
  {
    const P = [];
    const sec = (y0, y1, r0, r1, col) => {
      const c = new THREE.CylinderGeometry(r1, r0, y1 - y0, 28, 1, false); c.translate(0, (y0 + y1) / 2, 0); c.scale(1, 1, 1.55);
      const p = c.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getY(i) * RAKE);
      P.push(paint(c, col));
    };
    sec(0, funH * 0.6, 3.1, 2.9, WHITE);
    sec(funH * 0.6, funH * 0.74, 2.9, 2.86, TEAL);
    sec(funH * 0.74, funH * 0.88, 2.86, 2.8, WHITE);
    sec(funH * 0.88, funH, 2.8, 2.75, 0x15181c);
    for (const dx of [-0.8, 0.8]) { const p = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8); p.translate(dx, funH + 0.5, 0.3 + (funH + 0.5) * RAKE); P.push(paint(p, 0x24282e)); }
    const geo = mergeGeometries(P); geo.translate(0, funY0, funZ);
    decor.put(MAT.vc, geo);
    const em = (() => {
      const [c, x] = canvas(256, 256);
      x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = '#ffffff'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 110, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 7;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(128, 128, 104, 40, (k / 3) * Math.PI, 0, Math.PI * 2); x.stroke(); }   // a woven rattan ball
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(128, 128, 22, 0, Math.PI * 2); x.fill();
      return ctex(c, true, false);
    })();
    const logo = new THREE.MeshStandardMaterial({ color: 0x0f2a40, emissive: new THREE.Color(0x3fe0d0), emissiveMap: em, emissiveIntensity: 1.6, roughness: 0.5, transparent: true, alphaMap: em, depthWrite: false });
    const lg = [];
    for (const sx of [-1, 1]) { const p = new THREE.CircleGeometry(1.5, 24); p.rotateY(sx * Math.PI / 2); p.translate(sx * 3.02, funY0 + funH * 0.42, funZ + funH * 0.42 * RAKE); lg.push(p); }
    g.add(new THREE.Mesh(mergeGeometries(lg), logo));
  }
  // a dressing mast on the spa block's aft end for the light lines to the stern
  put(MAT.vc, paint(new THREE.CylinderGeometry(0.12, 0.18, 6, 6), WHITE), 0, 10.4, aftEnd - 1.0);

  /* ---------------- pool deck: pool + hot tubs, loungers, the bar; aft deck: lap pool ---------------- */
  const poolGeos = [], spillGeos = [];
  const pool = (cx, cz, hx, hz) => {
    const rimH = 0.45, w = 0.4;
    for (const [sx, sz, lx, lz] of [[0, -1, hx * 2 + w * 2, w], [0, 1, hx * 2 + w * 2, w], [-1, 0, w, hz * 2], [1, 0, w, hz * 2]])
      put(MAT.vc, paint(new THREE.BoxGeometry(lx, rimH, lz), 0xdfe8ea), cx + sx * (hx + w / 2), rimH / 2, cz + sz * (hz + w / 2));
    const wg = new THREE.PlaneGeometry(hx * 2, hz * 2); wg.rotateX(-Math.PI / 2); wg.translate(cx, rimH - 0.06, cz); poolGeos.push(wg);
    const sp = new THREE.PlaneGeometry(hx * 2 + 5, hz * 2 + 5); sp.rotateX(-Math.PI / 2); sp.translate(cx, 0.015, cz); spillGeos.push(sp);
  };
  const tub = (cx, cz, r) => {
    const side = new THREE.CylinderGeometry(r + 0.3, r + 0.35, 0.6, 24, 1, true); put(MAT.vc, paint(side, 0xdfe8ea), cx, 0.3, cz);
    const rim = new THREE.RingGeometry(r, r + 0.3, 24); rim.rotateX(-Math.PI / 2); put(MAT.vc, paint(rim, 0xeef2f2), cx, 0.6, cz);
    const wg = new THREE.CircleGeometry(r, 24); wg.rotateX(-Math.PI / 2); wg.translate(cx, 0.52, cz); poolGeos.push(wg);
    const sp = new THREE.PlaneGeometry(r * 2 + 4, r * 2 + 4); sp.rotateX(-Math.PI / 2); sp.translate(cx, 0.016, cz); spillGeos.push(sp);
  };
  pool(-3.4, ZA + 7.0, 5.0, 3.0);
  tub(6.4, ZA + 5.0, 1.5); tub(6.4, ZA + 9.4, 1.5);
  pool(0, aftEnd + 7.0, 6.5, 2.2);                       // lap pool on the aft deck
  tub(-8.5, aftEnd + 7.0, 1.4); tub(8.5, aftEnd + 7.0, 1.4);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vP;
      void main(){
        vec2 p = vP * 1.4;
        float a = sin(p.x * 2.1 + uTime * 1.1 + sin(p.y * 1.7 + uTime * 0.7) * 1.3);
        float b = sin(p.y * 2.4 - uTime * 0.9 + sin(p.x * 1.9 - uTime * 0.6) * 1.2);
        float c = pow(1.0 - abs(a * b), 7.0);
        vec3 col = vec3(0.05, 0.62, 1.45) + vec3(0.55, 1.0, 1.1) * c * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  g.add(new THREE.Mesh(mergeGeometries(poolGeos), poolMat));
  {
    const spill = new THREE.Mesh(mergeGeometries(spillGeos), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x2aa8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    spill.renderOrder = 2;
    g.add(spill);
  }
  // loungers (a few with towels), closed umbrellas
  const lounger = (x, z, ry, cushion) => {
    const P = [];
    const base = new THREE.BoxGeometry(0.66, 0.1, 1.5); base.translate(0, 0.34, 0.25); P.push(paint(base, 0xf2f2f0));
    const cu = new THREE.BoxGeometry(0.6, 0.07, 1.45); cu.translate(0, 0.42, 0.25); P.push(paint(cu, cushion));
    const back = new THREE.BoxGeometry(0.62, 0.1, 0.75); back.rotateX(-0.7); back.translate(0, 0.6, -0.72); P.push(paint(back, cushion));
    for (const [dx, dz] of [[-0.28, 0.9], [0.28, 0.9], [-0.28, -0.4], [0.28, -0.4]]) { const l = new THREE.BoxGeometry(0.05, 0.32, 0.05); l.translate(dx, 0.16, dz); P.push(paint(l, 0xc8ccd0)); }
    put(MAT.vc, mergeGeometries(P), x, 0, z, ry);
  };
  const cushions = [NAVY, TEAL, 0xf2f2f0, 0x2a6a9a];
  for (let i = 0; i < 6; i++) lounger(-(B - 2.2), ZA + 2.4 + i * 1.6, Math.PI / 2, cushions[i % 4]);
  for (let i = 0; i < 5; i++) lounger(B - 2.2, ZA + 2.6 + i * 1.6 + (i > 2 ? 0.8 : 0), -Math.PI / 2, cushions[(i + 1) % 4]);
  for (let i = 0; i < 8; i++) { const x = -9 + i * 2.6; if (Math.abs(x) < 7.5 && Math.abs(x) > 0) lounger(x, aftEnd + 11.5, Math.PI, cushions[i % 4]); }
  for (let i = 0; i < 6; i++) lounger(-6.5 + i * 2.6, aftEnd + 2.4, 0, cushions[(i + 2) % 4]);
  const umbrella = (x, z) => {
    put(MAT.vc, paint(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), 0xd0d4d8), x, 1.3, z);
    put(MAT.vc, paint(new THREE.CylinderGeometry(0.05, 0.22, 1.6, 8), NAVY), x, 2.05, z);
    put(MAT.vc, paint(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8), 0x9aa0a6), x, 0.06, z);
  };
  for (const z of [ZA + 3.2, ZA + 6.4, ZA + 9.6]) { umbrella(-(B - 3.6), z); umbrella(B - 3.6, z); }
  // the bar against the spa block: counter, back bar with glowing bottles, stools, a pergola with pendant lights, a neon sign
  {
    const bz = aftStart - 1.9;
    put(MAT.vc, paint(new THREE.BoxGeometry(8, 1.1, 0.8), 0x3a2a20), 0, 0.55, bz);
    put(MAT.vc, paint(new THREE.BoxGeometry(8.3, 0.07, 1.05), 0xd8d0c0), 0, 1.13, bz);
    glowAt(new THREE.BoxGeometry(7.8, 0.06, 0.02), 0xffb060, 0, 0.98, bz - 0.41);
    glowAt(new THREE.BoxGeometry(7.8, 0.05, 0.02), 0x3fd8ff, 0, 0.08, bz - 0.41);
    for (let i = 0; i < 7; i++) {
      const x = -3.3 + i * 1.1;
      put(MAT.vc, paint(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), 0xd8d0c0), x, 0.78, bz - 0.85);
      put(MAT.vc, paint(new THREE.CylinderGeometry(0.03, 0.05, 0.74, 5), 0x9aa0a6), x, 0.37, bz - 0.85);
    }
    put(MAT.vc, paint(new THREE.BoxGeometry(7, 2.2, 0.35), 0x2a2420), 0, 1.4, aftStart - 0.2);
    const bottle = ['#ffcf6a', '#6aff9a', '#ff7a5a', '#7ad8ff', '#ffe8c8'];
    for (const y of [1.0, 1.55, 2.1]) for (let i = 0; i < 18; i++) glowAt(new THREE.BoxGeometry(0.08, 0.26, 0.08), new THREE.Color(bottle[(i + (y * 10 | 0)) % 5]).getHex(), -3.1 + i * 0.36 + R() * 0.05, y, aftStart - 0.45);
    for (const y of [0.85, 1.4, 1.95]) put(MAT.vc, paint(new THREE.BoxGeometry(6.8, 0.04, 0.3), 0xd8d0c0), 0, y, aftStart - 0.45);
    for (const sx of [-1, 1]) for (const dz of [-1.9, 0.2]) put(MAT.vc, paint(new THREE.BoxGeometry(0.16, 3.1, 0.16), 0xe8e4dc), sx * 4.6, 1.55, bz + dz);
    for (let i = 0; i < 9; i++) put(MAT.vc, paint(new THREE.BoxGeometry(9.6, 0.08, 0.14), 0xe8e4dc), 0, 3.12, bz - 1.9 + i * 0.27);
    for (let i = 0; i < 5; i++) {
      const x = -3.2 + i * 1.6;
      put(MAT.steel, new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3), x, 2.65, bz - 0.2);
      glowAt(new THREE.SphereGeometry(0.13, 8, 6), 0xffc070, x, 2.15, bz - 0.2);
    }
    const n = neonSign('POOL BAR', '#3fe0ff', 3.2, 0.8); n.mesh.position.set(0, 2.95, aftStart - 0.05); n.mesh.rotation.y = Math.PI; n.mat.emissiveIntensity = 1.2; g.add(n.mesh);
  }
  // people: at the bar, by the pools, a few watching from the sun deck
  {
    const pg = personGeometry(), parts = [];
    const shirts = [0xf2f2f0, 0x2a6a9a, 0xd84a3a, 0x1f3a5a, 0xe8c070, 0x7a3a6a, 0x3a8a6a];
    const skin = [0x8a5a3a, 0xc99a72, 0x6b4a30, 0xe2b089, 0xb07850];
    const person = (x, y, z, ry, i) => { for (const [geo, col] of [[pg.body, shirts[i % shirts.length]], [pg.head, skin[i % skin.length]]]) { const gg = geo.clone(); gg.rotateY(ry); gg.translate(x, y, z); parts.push(paint(gg, col)); } };
    const bz = aftStart - 1.9;
    [-3.0, -1.5, 0.6, 2.4, 3.3].forEach((x, i) => person(x, 0, bz - 1.15, 0, i));
    person(-1.2, 0, bz + 0.8, Math.PI, 5);                           // the bartender
    [[-9.6, ZA + 2.2, 2], [-8.8, ZA + 2.5, 3.6], [9.8, ZA + 11.8, 4.4], [10.5, ZA + 12.2, 5.3]].forEach(([x, z, ry], i) => person(x, 0, z, ry, i + 2));
    [-7.5, -6.8, -2.0, 4.2, 8.6, 9.3].forEach((x, i) => person(x, 3.8, ZF - 0.3, 0, i + 3));   // sun deck spectators
    [[-6, aftEnd + 4.5, 1], [5.2, aftEnd + 9.8, 4]].forEach(([x, z, ry], i) => person(x, 0, z, ry, i + 1));
    put(MAT.vcFlat, mergeGeometries(parts));
  }

  /* ---------------- deck lights: floodlight masts at the court corners, light strings, deck lamps ---------------- */
  floodPoles(ctx, g, { x: B - 0.5, z: F.outZ + 2.2, base: 0, h: 7.6, poleMat: MAT.steel, headMat: MAT.steel, glowMat: MAT.glow, put: putS });
  const bulbPairs = [];
  for (const sz of [-1, 1]) bulbPairs.push([V3(-(B - 0.5), 7.1, sz * (F.outZ + 2.2)), V3(B - 0.5, 7.1, sz * (F.outZ + 2.2)), 1.1, 24]);
  // dressing lines: from the forward mast down to the sun deck, and from the dressing mast aft to the stern rail
  for (const x of [-(B - 1.2), 0, B - 1.2]) bulbPairs.push([V3(0, 18.3, mastZ), V3(x, 4.8, ZF + 0.2), 1.2, 26]);
  for (const x of [-(B - 1.5), 0, B - 1.5]) bulbPairs.push([V3(0, 13.2, aftEnd - 1.0), V3(x, 1.2, ZS - 1.5), 1.6, 30]);
  // pool-deck strings, side to side over the loungers (well clear of the court)
  for (const z of [ZA + 4.8, ZA + 9.6]) bulbPairs.push([V3(-(B - 0.5), 3.6, z), V3(B - 0.5, 3.6, z), 0.7, 28]);
  for (const sx of [-1, 1]) for (const z of [ZA + 4.8, ZA + 9.6]) { put(MAT.steel, new THREE.CylinderGeometry(0.05, 0.06, 3.7, 6), sx * (B - 0.5), 1.85, z); }
  {
    const seg = [], pts = [];
    for (const [a, b, sag, n] of bulbPairs) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag;
        if (prev) seg.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p; if (i > 0 && i < n) pts.push(p);
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x15191e })));
    const bg = new THREE.SphereGeometry(0.1, 6, 4); bg.scale(1, 1.2, 1);
    const im = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.4) }), pts.length);
    const o = new THREE.Object3D(), cols = [0xfff0c8, 0xffd890, 0xfff0c8, 0x9fd8ff].map((c) => new THREE.Color(c));
    pts.forEach((p, i) => { o.position.set(p.x, p.y - 0.12, p.z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, cols[i % cols.length]); });
    im.computeBoundingSphere();
    g.add(im);
  }
  // low deck lamps along the pool + aft decks and round the sun-deck edge (none along the sides behind the ball)
  for (let z = ZA + 1.5; z < ZS - 3; z += 3.2) {
    if (z > aftStart - 0.6 && z < aftEnd + 0.6) continue;
    for (const sx of [-1, 1]) { put(MAT.vc, paint(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), 0x3a3f46), sx * (B - 0.35), 0.25, z); glowAt(new THREE.BoxGeometry(0.12, 0.06, 0.12), 0xffd8a0, sx * (B - 0.35), 0.46, z); }
  }
  for (let i = 0; i < 7; i++) glowAt(new THREE.BoxGeometry(0.5, 0.05, 0.05), 0x7fe0ff, -(B - 2.5) + i * ((B - 2.5) * 2 / 6), 3.55, ZF + 0.52);   // LED under the sun-deck lip
  // stern: flagstaff + ensign, stern light
  put(MAT.vc, paint(new THREE.CylinderGeometry(0.05, 0.07, 5, 6), 0xd8dce0), 0, 2.5, ZS - 1.2);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), new THREE.MeshStandardMaterial({ color: 0x1f3a7a, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.geometry.translate(0.9, 0, 0); flag.position.set(0, 4.4, ZS - 1.2); flag.rotation.y = -Math.PI / 2; g.add(flag);
  glowAt(new THREE.SphereGeometry(0.16, 8, 6), 0xfff6e8, 0, 2.1, ZS - 0.6);
  g.add(new THREE.Mesh(mergeGeometries(glowBits), MAT.glowVC));

  /* ---------------- the ball boundary: a teak-capped rail with white posts and a navy kick panel ---------------- */
  boundaryRail(F, putS, { postMat: MAT.steel, railMat: MAT.rail, panelMat: MAT.panel, step: 1.6, postW: 0.07 });

  /* ---------------- the sea: rolls / heaves under the steady ship ---------------- */
  const sea = new THREE.Group(); sea.position.y = WATER_Y; g.add(sea);
  const norTex = ctx.texLoader.load('assets/pond/water_nor.jpg'); norTex.wrapS = norTex.wrapT = THREE.RepeatWrapping;
  const oceanMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime, uNor: { value: norTex }, uMoon: { value: MOON.clone() },
      uB: { value: B }, uStern: { value: ZS }, uBowTaper: { value: BOW_TAPER }, uBowLen: { value: BOW_LEN } },
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uB, uStern, uBowTaper, uBowLen; uniform vec3 uMoon; uniform sampler2D uNor;
      uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying vec3 vW;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      float halfW(float z) { if (z > uBowTaper) return uB; float t = clamp((uBowTaper - z) / uBowLen, 0.0, 1.0); return uB * (1.0 - t * t); }
      vec2 wave(vec2 q, vec2 d, float k, float a, float w) { return d * (a * k * cos(k * dot(d, q) - w * uTime)); }
      void main() {
        vec3 toCam = cameraPosition - vW; float dist = max(length(toCam), 1e-3); vec3 V = toCam / dist;
        vec2 q = vec2(vW.x, vW.z - uTime * ${SPEED.toFixed(1)});          // the water streams aft past the ship
        vec2 dh = wave(q, vec2(0.958, 0.287), 0.165, 0.35, 1.27) + wave(q, vec2(-0.371, 0.928), 0.285, 0.18, 1.67)
                + wave(q, vec2(0.8, -0.6), 0.48, 0.09, 2.17) + wave(q, vec2(0.196, 0.981), 0.84, 0.05, 2.87);
        float near = exp(-dist / 160.0);
        vec3 n1 = texture2D(uNor, q * 0.045 + vec2(uTime * 0.011, 0.0)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNor, q * 0.12 + vec2(-uTime * 0.013, uTime * 0.02)).xyz * 2.0 - 1.0;
        vec3 N = vec3(-dh.x, 1.0, -dh.y) + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * (0.12 + 0.16 * near);
        N = N / max(length(N), 1e-4);
        vec3 Rf = reflect(-V, N);
        float ry = max(Rf.y, 0.0);
        vec3 sky = mix(vec3(0.010, 0.016, 0.034), vec3(0.004, 0.006, 0.016), pow(ry, 0.5));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = vec3(0.002, 0.006, 0.012) + sky * fres * 1.4;
        float md = max(dot(Rf, uMoon), 0.0);
        vec3 glit = vec3(0.92, 0.95, 1.0) * (pow(md, 1400.0) * 9.0 + pow(md, 160.0) * 0.7 + pow(md, 24.0) * 0.05) * (0.4 + fres);
        // foam: the wake behind the stern, the Kelvin arms, bow waves + the wash along the hull, the odd whitecap
        float ax = abs(vW.x), foam = 0.0;
        vec2 fq = vec2(vW.x, vW.z - uTime * ${SPEED.toFixed(1)});
        float v = vW.z - uStern;
        if (v > -2.0) {
          float vv = max(v, 0.0);
          float wid = uB * 0.5 + vv * 0.1;
          float core = exp(-(ax * ax) / (wid * wid) * 1.6) * exp(-vv / 170.0);
          foam += core * smoothstep(0.32, 0.72, fbm(fq * vec2(0.22, 0.09)) + 0.28 * core) * 1.3;
          float arm = ax - (uB * 0.8 + vv * 0.36), aw = 1.2 + vv * 0.035;
          foam += exp(-(arm * arm) / (aw * aw)) * exp(-vv / 150.0) * smoothstep(0.38, 0.8, fbm(vec2(ax * 0.35, fq.y * 0.3)));
        }
        float side = ax - halfW(vW.z);
        if (side > -1.0 && v < 2.0) {
          float s = exp(-max(side, 0.0) / 2.4) * (0.55 + 0.45 * smoothstep(-20.0, -70.0, vW.z));
          foam += s * smoothstep(0.3, 0.72, fbm(vec2(side * 0.6 + 3.0, fq.y * 0.2)));
          col += vec3(0.85, 0.6, 0.32) * 0.035 * exp(-max(side, 0.0) / 9.0);           // the ship's lights on the water
        }
        float bz = vW.z - (uBowTaper - uBowLen);
        if (bz > 0.0) {
          float arm2 = ax - bz * 0.36 - 0.5, aw2 = 1.0 + bz * 0.03;
          foam += exp(-(arm2 * arm2) / (aw2 * aw2)) * exp(-bz / 120.0) * smoothstep(0.4, 0.8, fbm(vec2(ax * 0.4, fq.y * 0.3))) * 0.9;
        }
        foam += smoothstep(0.74, 0.84, fbm(q * 0.035 + vec2(3.1, uTime * 0.03))) * 0.22 * near;
        foam = clamp(foam, 0.0, 1.0);
        col = mix(col, vec3(0.16, 0.19, 0.24), foam * 0.85);
        float f = smoothstep(fogNear, fogFar, dist);
        col = mix(col, fogColor, f) + glit * (1.0 - foam) * (1.0 - 0.6 * f);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  {
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(860, 860), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.frustumCulled = false;
    sea.add(ocean);
  }
  // another ship off the starboard quarter (in the moon path) + a coastline with a lighthouse far to port (the coast is in the sky)
  {
    const ox = 158, oz = 196, len = 120, hb = 11, P = [], W = [];
    const hullG = new THREE.BoxGeometry(hb * 2, 14, len); hullG.translate(0, 4, 0);
    const u = hullG.attributes.uv, nrm = hullG.attributes.normal;
    for (let i = 0; i < u.count; i++) { const along = Math.abs(nrm.getX(i)) > 0.5 ? len : hb * 2; u.setXY(i, u.getX(i) * along / HULL_W * 1.6, 0.3 + u.getY(i) * 0.7); }
    P.push(hullG);
    decor.put(MAT.hull, xf(hullG, ox, WATER_Y, oz));
    for (const [w, h, l, y, dz] of [[hb * 2 - 3, 3, len * 0.7, 12.5, -4], [hb * 2 - 6, 3, len * 0.5, 15.5, -8], [hb * 2 - 10, 2.6, len * 0.22, 18.3, -16]]) {
      const b = new THREE.BoxGeometry(w, h, l), bu = b.attributes.uv, bn = b.attributes.normal;
      for (let i = 0; i < bu.count; i++) { const along = Math.abs(bn.getX(i)) > 0.5 ? l : w; bu.setX(i, bu.getX(i) * along / 16); }
      W.push(xf(b, ox, WATER_Y + y, oz + dz));
    }
    for (const w of W) decor.put(MAT.win, w);
    const fun = new THREE.CylinderGeometry(2.2, 2.6, 7, 10); fun.scale(1, 1, 1.6);
    put(MAT.vc, paint(fun, 0xd8dcdf), ox, WATER_Y + 23, oz + 18);
  }
  const navLights = [];
  {
    const spr = (col, x, y, z, s, blink) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      m.position.set(x, y, z); m.scale.setScalar(s); fx.add(m); return m;
    };
    spr(0xfff2dc, 158, WATER_Y + 26, 170, 4.5);                      // the other ship's masthead + side light
    spr(0xff3a2a, 147, WATER_Y + 13, 190, 3.2);
    navLights.push({ m: spr(0xfff0c0, -250, WATER_Y + 10, 222, 9), period: 5, on: 0.35 });   // lighthouse
    navLights.push({ m: spr(0xff3020, -190, WATER_Y + 30, 268, 4), period: 2.2, on: 0.5 });  // a radio mast on the headland
    navLights.push({ m: spr(0xff2a1a, 0, funY0 + funH + 1.35, funZ + (funH + 1.4) * RAKE, 1.4), period: 1.6, on: 0.3 });   // the funnel's red beacon
  }

  /* ---------------- gulls riding the air behind the funnel; spray off the bow wave ---------------- */
  const gulls = [];
  let gullMesh = null;
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.32, -0.55, 0.12, 0.02, 0, 0.04, 0.12,    -0.55, 0.12, 0.02, -0.95, 0.02, 0.12, 0, 0.04, 0.12,
      0, 0, -0.32, 0, 0.04, 0.12, 0.55, 0.12, 0.02,    0.55, 0.12, 0.02, 0, 0.04, 0.12, 0.95, 0.02, 0.12,
      0, 0, -0.38, -0.08, -0.04, 0.4, 0.08, -0.04, 0.4], 3));
    geo.computeVertexNormals();
    const n = 11;
    gullMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xe8ecf0, emissive: 0x3a4250, side: THREE.DoubleSide, roughness: 0.9 }), n);
    gullMesh.frustumCulled = false;
    for (let i = 0; i < n; i++) gulls.push({ r: 7 + R() * 9, cz: aftEnd + 2 + R() * 12, cx: (R() - 0.5) * 8, y: 11 + R() * 9, w: (0.18 + R() * 0.16) * (R() < 0.3 ? -1 : 1), a: R() * 6.28, ph: R() * 6.28 });
    fx.add(gullMesh);
  }
  {
    const pos = [], seed = [];
    for (let i = 0; i < 320; i++) {
      if (i < 240) { const z = -78 + R() * 64, s = i % 2 ? 1 : -1; pos.push(s * (halfW(z) + 0.4), WATER_Y + 0.2, z); }
      else { pos.push((R() - 0.5) * 12, WATER_Y + 0.2, ZS + R() * 8); }
      seed.push(R());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime },
      vertexShader: `
        uniform float uTime; attribute float seed; varying float vA;
        void main() {
          float t = fract(uTime * (0.32 + seed * 0.25) + seed * 13.0);
          vec3 p = position;
          p.x += sign(p.x) * t * (1.5 + seed * 3.0);
          p.y += sin(t * 3.14159) * (1.5 + seed * 3.5);
          p.z += t * (5.0 + seed * 7.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = sin(t * 3.14159);
          gl_PointSize = (0.5 / max(-mv.z, 0.5)) * 900.0;
        }`,
      fragmentShader: `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.55, 0.62, 0.72) * a * 0.55, a); }`,
    });
    const spray = new THREE.Points(geo, mat); spray.frustumCulled = false;
    fx.add(spray);
  }

  decor.build(g);
  solid.build(g, { castShadow: true, receiveShadow: true });

  /* ---------------- this map's own night sky: an open-sea horizon (no tree line), the moon low over the starboard quarter ---------------- */
  const skyTex = paintSeaSky();
  const keyPos = MOON.clone().multiplyScalar(24).toArray();

  let time = 0;
  const o = new THREE.Object3D();
  function update(dt) {
    time += dt;
    uTime.value = time;
    // we ride the ship: the sea rolls, pitches and heaves a little around us
    sea.rotation.z = Math.sin(time * 0.57) * 0.0055 + Math.sin(time * 0.23 + 1.3) * 0.002;
    sea.rotation.x = Math.sin(time * 0.76 + 0.6) * 0.0022;
    sea.position.y = WATER_Y + Math.sin(time * 0.69) * 0.22;
    for (const r of radar.children) r.rotation.y = time * (r.position.x > 0 ? 2.4 : -1.7);
    flag.rotation.x = Math.sin(time * 5.3) * 0.12; flag.rotation.z = Math.sin(time * 3.7) * 0.06;
    for (const n of navLights) n.m.visible = (time / n.period) % 1 < n.on;
    if (fx.visible && gullMesh) {
      gulls.forEach((b, i) => {
        b.a += b.w * dt;
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r * 0.7;
        o.position.set(x, b.y + Math.sin(time * 0.4 + b.ph) * 1.2, z);
        o.rotation.set(0, -b.a - (b.w > 0 ? 0 : Math.PI), (b.w > 0 ? 1 : -1) * 0.25);
        const flap = Math.sin(time * 7 + b.ph);
        o.scale.set(1, flap > 0.6 || (time + b.ph) % 5 < 1.6 ? 0.5 + 0.5 * flap : 0.9, 1);   // mostly gliding, now and then a few flaps
        o.updateMatrix(); gullMesh.setMatrixAt(i, o.matrix);
      });
      gullMesh.instanceMatrix.needsUpdate = true;
    }
  }
  function setTime(tod) {
    const night = tod !== 'day';
    MAT.hull.emissiveIntensity = night ? 1 : 0;
    MAT.win.emissiveIntensity = night ? 1 : 0;
  }
  const look = { sky: skyTex, keyPos, fog: FOG };
  return { g, fx, update, setTime, fog: { night: [50, 380], day: [50, 380] }, look: { night: look, day: look } };
}

/** The open-sea night sky: deep blue gradient, haze down to a flat sea horizon (= the fog colour), stars + the Milky Way,
 *  the moon at MOON, a few silvered cloud wisps and a dark coastline with town lights far to port. Equirect, column ↔ atan2(z, x). */
function paintSeaSky() {
  const W = 2048, H = 1024, w = 512, h = 256;
  const FOGC = [(FOG >> 16) & 255, (FOG >> 8) & 255, FOG & 255];
  const fogS = '#' + new THREE.Color(FOG).getHexString();
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  const ST = [[0, [22, 30, 56]], [0.06, [17, 25, 52]], [0.25, [9, 14, 35]], [1, [3, 5, 14]]];
  const ramp = (t) => { for (let i = 1; i < ST.length; i++) if (t <= ST[i][0]) return mix(ST[i - 1][1], ST[i][1], (t - ST[i - 1][0]) / (ST[i][0] - ST[i - 1][0])); return ST[ST.length - 1][1]; };
  const lo = document.createElement('canvas'); lo.width = w; lo.height = h;
  const lg = lo.getContext('2d'), img = lg.createImageData(w, h);
  const sx = MOON.x, sy = MOON.y, sz = MOON.z;
  for (let j = 0; j < h; j++) {
    const e = (0.5 - (j + 0.5) / h) * Math.PI, ce = Math.cos(e), se = Math.sin(e);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      let c;
      if (e < 0) c = FOGC;
      else {
        c = ramp(e / (Math.PI / 2));
        const a = Math.acos(Math.max(-1, Math.min(1, ce * Math.cos(phi) * sx + se * sy + ce * Math.sin(phi) * sz)));
        const gl = 0.2 * Math.exp(-((a / 0.32) ** 2)) + 0.07 * Math.exp(-((a / 1.1) ** 2));
        c = [c[0] + 120 * gl, c[1] + 140 * gl, c[2] + 205 * gl];
        c = mix(c, FOGC, Math.exp(-(e * 180 / Math.PI) / 2.2));          // haze down to the sea horizon
      }
      const k = (j * w + i) * 4;
      img.data[k] = Math.min(255, c[0]); img.data[k + 1] = Math.min(255, c[1]); img.data[k + 2] = Math.min(255, c[2]); img.data[k + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lo, 0, 0, W, H);
  const PX = H / 180;
  const X = (phi) => ((phi / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * W;
  const Y = (deg) => H / 2 - deg * PX;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (phi, deg, wpx, hpx, rgba) => {
    for (const off of [-W, 0, W]) {
      g.save(); g.translate(X(phi) + off, Y(deg)); g.scale(wpx / hpx, 1);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, hpx);
      rg.addColorStop(0, rgba(1)); rg.addColorStop(0.6, rgba(0.55)); rg.addColorStop(1, rgba(0));
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, hpx, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  for (let i = 0; i < 60; i++) { const phi = (i / 60 - 0.5) * Math.PI * 2, deg = 40 + 26 * Math.sin(phi + 2.2); blob(phi, deg, 10 * PX, 3.2 * PX, (a) => `rgba(170,180,230,${(0.07 * a).toFixed(3)})`); }
  for (let i = 0; i < 2800; i++) {
    const phi = (rnd() - 0.5) * Math.PI * 2, band = rnd() < 0.45;
    const deg = band ? 40 + 26 * Math.sin(phi + 2.2) + (rnd() - 0.5) * 9 : 3 + Math.pow(rnd(), 0.8) * 80;
    const a = (band ? 0.25 : 0.35) + rnd() * 0.65 * Math.min(1, (deg - 2) / 10);
    const s = rnd() < 0.06 ? 2.4 : rnd() < 0.3 ? 1.6 : 1.1;
    g.fillStyle = `rgba(255,248,236,${Math.max(0, a).toFixed(3)})`;
    g.fillRect(X(phi), Y(deg), s / Math.cos(deg * Math.PI / 180), s);
  }
  for (let i = 0; i < 9; i++) blob((rnd() - 0.5) * Math.PI * 2, 5 + rnd() * 10, (16 + rnd() * 26) * PX, (0.7 + rnd() * 1.2) * PX, (a) => `rgba(62,72,112,${(0.4 * a).toFixed(2)})`);
  {
    const deg = MOON_EL * 180 / Math.PI, r = 1.7 * PX, stretch = 1 / Math.cos(MOON_EL);
    g.save(); g.translate(X(MOON_AZ), Y(deg)); g.scale(stretch, 1);
    const halo = g.createRadialGradient(0, 0, r, 0, 0, r * 10);
    halo.addColorStop(0, 'rgba(220,230,255,0.38)'); halo.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r * 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6f4ec'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(180,176,170,0.5)';
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.32], [0.25, 0.1, 0.25], [-0.05, 0.35, 0.2]]) { g.beginPath(); g.arc(dx * r, dy * r, rr * r, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  // a low coastline far to port-aft (azimuth ~115°–160°, off to the side of both match cameras), with town lights at the shore
  {
    const a0 = 2.0, a1 = 2.8;
    g.fillStyle = '#0a0f1b';
    g.beginPath(); g.moveTo(X(a0), Y(-0.5));
    for (let k = 0; k <= 120; k++) {
      const t = k / 120, phi = a0 + (a1 - a0) * t;
      const env = Math.sin(Math.PI * t) ** 0.6;
      const d = env * (0.5 + 0.55 * Math.sin(t * 9 + 1) ** 2 + 0.35 * Math.sin(t * 23) ** 2 + (t > 0.55 && t < 0.75 ? 0.9 * Math.sin((t - 0.55) / 0.2 * Math.PI) : 0));
      g.lineTo(X(phi), Y(d));
    }
    g.lineTo(X(a1), Y(-0.5)); g.closePath(); g.fill();
    for (let k = 0; k < 140; k++) {
      const t = rnd(), phi = a0 + 0.04 + (a1 - a0 - 0.08) * t;
      g.fillStyle = ['rgba(255,210,140,0.85)', 'rgba(255,236,200,0.8)', 'rgba(255,180,110,0.7)'][k % 3];
      g.fillRect(X(phi), Y(0.05 + rnd() * 0.3 * Math.sin(Math.PI * t)), 1.5, 1.2);
    }
    g.fillStyle = fogS; g.globalAlpha = 0.35; g.fillRect(X(a0), Y(0.12), X(a1) - X(a0), Y(-0.5) - Y(0.12)); g.globalAlpha = 1;   // sea haze over the shore
  }
  g.fillStyle = fogS; g.fillRect(0, Y(0) + 1, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
