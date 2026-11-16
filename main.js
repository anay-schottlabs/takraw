import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as P from './physics.js';
import { sfx } from './sfx.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildPond } from './pond.js';
import { buildTerrace } from './terrace.js';
import { MAPS, mapById } from './maps.js';
import { buildTempleLife } from './temple-life.js';
import { buildRiverside } from './riverside.js';
import { buildRooftop } from './rooftop.js';
import { buildMarket } from './market.js';
import { buildBeach } from './beach.js';
import { buildJungle } from './jungle.js';
import { buildBamboo } from './bamboo.js';
import { buildFestival } from './festival.js';
import { buildPalace } from './palace.js';
import { buildMonastery } from './monastery.js';

/* =====================================================================
   FIELD SPEC — ISTAF sepak takraw court (metres)
   x runs baseline→baseline (net at x = 0), z runs sideline→sideline.
   ===================================================================== */
const F = {
  L: 15.4, W: 7.0,               // playing court — 15% bigger than ISTAF's 13.4 × 6.1 so there's more running
  line: 0.04, centreLine: 0.02,  // boundary lines are part of the court (drawn inward)
  free: 3.0,                     // minimum free zone around the court
  serveR: 0.30, serveFromBack: 2.8,
  quarterR: 0.90,                // quarter circles at each end of the centre line
  netTopMid: 1.52, netTopPost: 1.55, netDepth: 0.70, netTape: 0.05,
  postOut: 0.30,                 // posts stand 0.30 m outside each sideline
  deckDrop: 0.12,                // court deck is raised above the promenade
};
F.hl = F.L / 2;                  // 7.70
F.hw = F.W / 2;                  // 3.50
F.outX = F.hl + F.free;          // 10.70 — ad boards (hard boundary)
F.outZ = F.hw + F.free;          // 6.50
F.postZ = F.hw + F.postOut;      // 3.35

const PLAYER_R = 0.24;          // body radius for collisions
const RING_GLOW = 2.6;           // >1 so the bloom pass picks the ring up
const NET_GAP = 0.18;           // closest a player's centre can get to the net plane

const TEAMS = {
  left:  { name: 'left',  jersey: 0xff8a2a, trim: 0xfff1dc, shorts: 0x15161b, css: '#ff8a2a' },
  right: { name: 'right', jersey: 0x2fd3c4, trim: 0x0d1f22, shorts: 0x15161b, css: '#2fd3c4' },
  // colours are relative to the viewer: you are always blue, your opponent always red
  me:  { name: 'me',  jersey: 0x3d8bff, trim: 0xf1f6ff, shorts: 0x15161b, css: '#3d8bff' },
  opp: { name: 'opp', jersey: 0xff3b30, trim: 0xfff1ee, shorts: 0x15161b, css: '#ff3b30' },
  mate: { name: 'mate', jersey: 0x7db4ff, trim: 0xf1f6ff, shorts: 0x15161b, css: '#7db4ff' },   // your teammate (2v2 / 3v3)
};
const sideSign = (side) => (side === 'left' ? 1 : -1);

/* =====================================================================
   Renderer, scene, post-processing
   ===================================================================== */
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1020);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(-16, 7, 10);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.4, 0.45, 1.6); // only true emitters (lamps, bulbs, rings) glow
composer.addPass(bloom);
// Focus pass: darkens and desaturates the edges so the court, players and ball carry the eye
const focusPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.42 }, uDesat: { value: 0.4 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform float uDesat; uniform vec2 uCenter; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - uCenter) * vec2(1.0, 1.3);
      float e = smoothstep(0.22, 0.8, length(d));
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(l), e * uDesat);
      c.rgb *= 1.0 - e * uStrength;
      c.rgb *= uTint;
      gl_FragColor = c;
    }`,
});
composer.addPass(focusPass);
composer.addPass(new OutputPass());

/* =====================================================================
   Graphics quality — Auto starts High and steps down if frames run slow
   ===================================================================== */
const QUALITY = {
  high:   { dpr: 2,    shadow: 2048, soft: true,  bloom: true,  focus: true,  spots: true,  particles: 1 },
  medium: { dpr: 1.25, shadow: 1024, soft: false, bloom: true,  focus: true,  spots: false, particles: 0.7 },
  low:    { dpr: 0.9,  shadow: 0,    soft: false, bloom: false, focus: false, spots: false, particles: 0.4 },
};
const QUALITY_ORDER = ['high', 'medium', 'low'];
let qualityPref = 'auto';
try { qualityPref = localStorage.getItem('takraw-quality') || 'auto'; } catch {}
let qualityLevel = null;
const QUALITY_PARTICLES = () => (QUALITY[qualityLevel] || QUALITY.medium).particles;
function applyQuality(level) {
  if (level === qualityLevel) return;
  const q = QUALITY[level];
  const prevShadow = renderer.shadowMap.enabled;
  qualityLevel = level;
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.enabled = q.bloom;
  focusPass.enabled = q.focus;
  renderer.shadowMap.enabled = q.shadow > 0;
  renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  key.castShadow = q.shadow > 0;
  if (q.shadow > 0) {
    key.shadow.mapSize.set(q.shadow, q.shadow);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  }
  for (const sp of spotLights) sp.visible = q.spots;
  for (const vn of Object.values(venues)) vn.fx.visible = level !== 'low';   // fireflies, mist, candles, smoke, birds…
  if (prevShadow !== renderer.shadowMap.enabled) {
    scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  }
  const lbl = document.getElementById('quality-now');
  if (lbl) lbl.textContent = qualityPref === 'auto' ? `(auto: ${level})` : '';
}
function setQualityPref(p) {
  qualityPref = p;
  try { localStorage.setItem('takraw-quality', p); } catch {}
  qualityLevel = null;
  applyQuality(p === 'auto' ? 'high' : p);
  autoQ.cool = 3;
}
// Auto: average frame time over 2 s windows; step down below ~40 fps (never while loading)
const autoQ = { t: 0, n: 0, cool: 3, fpsT: 0, fpsN: 0 };
function autoQuality(dt) {
  autoQ.fpsT += dt; autoQ.fpsN++;
  if (autoQ.fpsT >= 0.5) {
    const el = document.getElementById('hud-fps');
    if (el) el.textContent = `${Math.round(autoQ.fpsN / autoQ.fpsT)} FPS`;
    autoQ.fpsT = 0; autoQ.fpsN = 0;
  }
  if (qualityPref !== 'auto' || document.hidden) return;
  if (autoQ.cool > 0) { autoQ.cool -= dt; autoQ.t = 0; autoQ.n = 0; return; }
  autoQ.t += dt; autoQ.n++;
  if (autoQ.t < 2) return;
  const avg = autoQ.t / autoQ.n;
  autoQ.t = 0; autoQ.n = 0;
  const i = QUALITY_ORDER.indexOf(qualityLevel);
  if (avg > 1 / 40 && i < QUALITY_ORDER.length - 1) { applyQuality(QUALITY_ORDER[i + 1]); autoQ.cool = 3; }
}

/* =====================================================================
   Lighting — temple courtyard at dusk
   The last warm light rakes in low from the +z side, so both players see
   long shadows across the court and the sunset glow off to one side.
   ===================================================================== */
const hemi = new THREE.HemisphereLight(0x9d8cd0, 0x4a2a1c, 0.5);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffb27a, 1.9);
key.position.set(4, 11, 19);                      // ~30° up, from the +z sideline
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
// fitted to the court + free zone as seen from the light (low sun → wide, short frustum)
Object.assign(key.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 2, far: 60 });   // fits the court + free zone from both the sun and moon angles
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);

/* =====================================================================
   Asset loading (Poly Haven CC0 — see assets/CREDITS.md)
   ===================================================================== */
const loadingEl = document.getElementById('loading');
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, loaded, total) => { loadingEl.textContent = `Loading arena ${Math.round((loaded / total) * 100)}%`; };
manager.onLoad = () => { loadingEl.textContent = ''; };
manager.onError = (u) => { console.warn('asset failed', u); };
const texLoader = new THREE.TextureLoader(manager);
const pmrem = new THREE.PMREMGenerator(renderer);

/* ---------------------------------------------------------------------
   Skies — DAY and NIGHT, each painted once into an equirectangular canvas (no download) and cached.
   The same image is the backdrop and, pre-filtered, the environment light.
   Canvas row 0 = zenith, middle row = horizon; column u ↔ azimuth atan2(z, x).
   --------------------------------------------------------------------- */
const LIGHT_POS = { day: [6, 22, 10], night: [-7, 15, -14] };      // sun / moon direction (also the key light)
const SKY_STYLE = {
  day: {
    near: [[0, [222, 236, 244]], [0.06, [190, 220, 242]], [0.25, [128, 182, 232]], [0.6, [76, 136, 214]], [1, [46, 100, 196]]],
    far: [[0, [214, 230, 240]], [0.08, [176, 210, 236]], [0.3, [116, 170, 226]], [0.6, [70, 128, 206]], [1, [44, 96, 190]]],
    below: [70, 90, 84], glowCol: [255, 248, 226], tree: '#3c564f', ground: '#2c3b38',
  },
  night: {
    near: [[0, [44, 54, 96]], [0.05, [30, 38, 76]], [0.22, [16, 22, 50]], [1, [4, 6, 16]]],
    far: [[0, [34, 42, 82]], [0.06, [22, 28, 60]], [0.28, [12, 16, 38]], [1, [3, 5, 14]]],
    below: [6, 7, 12], glowCol: [120, 140, 210], tree: '#06070c', ground: '#030306',
  },
};
function paintSky(mode) {
  const S = SKY_STYLE[mode];
  const W = 2048, H = 1024, w = 512, h = 256;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  const ramp = (St, t) => {
    for (let i = 1; i < St.length; i++) if (t <= St[i][0]) return mix(St[i - 1][1], St[i][1], (t - St[i - 1][0]) / (St[i][0] - St[i - 1][0]));
    return St[St.length - 1][1];
  };
  const [lx, ly, lz] = LIGHT_POS[mode];
  const LAZ = Math.atan2(lz, lx), LEL = Math.atan2(ly, Math.hypot(lx, lz));
  const sx = Math.cos(LEL) * Math.cos(LAZ), sy = Math.sin(LEL), sz = Math.cos(LEL) * Math.sin(LAZ);
  const lo = document.createElement('canvas');
  lo.width = w; lo.height = h;
  const lg = lo.getContext('2d');
  const img = lg.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const e = (0.5 - (j + 0.5) / h) * Math.PI;
    const ce = Math.cos(e), se = Math.sin(e);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      const dx = ce * Math.cos(phi), dz = ce * Math.sin(phi);
      const cosL = Math.max(-1, Math.min(1, dx * sx + se * sy + dz * sz));
      let c;
      if (e < 0) c = S.below;
      else {
        const t = e / (Math.PI / 2);
        const toward = Math.pow((Math.max(-1, Math.min(1, dx * Math.cos(LAZ) + dz * Math.sin(LAZ))) + 1) / 2, 1.6);
        c = mix(ramp(S.far, t), ramp(S.near, t), toward);
        const a = Math.acos(cosL);
        const glow = mode === 'day'
          ? 0.9 * Math.exp(-((a / 0.1) ** 2)) + 0.32 * Math.exp(-((a / 0.55) ** 2))        // sun halo
          : 0.18 * Math.exp(-((a / 0.35) ** 2));                                            // moonlit patch
        c = [c[0] + S.glowCol[0] * glow, c[1] + S.glowCol[1] * glow, c[2] + S.glowCol[2] * glow];
      }
      const k = (j * w + i) * 4;
      img.data[k] = Math.min(255, c[0]); img.data[k + 1] = Math.min(255, c[1]); img.data[k + 2] = Math.min(255, c[2]); img.data[k + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lo, 0, 0, W, H);
  const PX = H / 180;                                   // pixels per degree
  const X = (phi) => ((phi / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * W;
  const Y = (deg) => H / 2 - deg * PX;
  let seed = 7;
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

  if (mode === 'night') {
    // the Milky Way: a soft band of haze with a dense spray of faint stars along it
    for (let i = 0; i < 60; i++) {
      const phi = (i / 60 - 0.5) * Math.PI * 2, deg = 34 + 24 * Math.sin(phi * 1 + 0.8);
      blob(phi, deg, 10 * PX, 3.2 * PX, (a) => `rgba(170,180,230,${(0.07 * a).toFixed(3)})`);
    }
    for (let i = 0; i < 2600; i++) {
      const phi = (rnd() - 0.5) * Math.PI * 2;
      const band = rnd() < 0.45;
      const deg = band ? 34 + 24 * Math.sin(phi + 0.8) + (rnd() - 0.5) * 9 : 6 + Math.pow(rnd(), 0.8) * 78;
      const a = (band ? 0.25 : 0.35) + rnd() * 0.65 * Math.min(1, (deg - 4) / 10);
      const s = rnd() < 0.06 ? 2.4 : rnd() < 0.3 ? 1.6 : 1.1;
      g.fillStyle = `rgba(255,248,236,${Math.max(0, a).toFixed(3)})`;
      g.fillRect(X(phi), Y(deg), s / Math.cos(deg * Math.PI / 180), s);
    }
    // a few dark cloud wisps low down, silvered by the moon
    for (let i = 0; i < 10; i++) blob((rnd() - 0.5) * Math.PI * 2, 4 + rnd() * 9, (16 + rnd() * 26) * PX, (0.8 + rnd() * 1.3) * PX, (a) => `rgba(60,70,110,${(0.45 * a).toFixed(2)})`);
    // full moon at the key light's direction
    {
      const deg = LEL * 180 / Math.PI, r = 1.6 * PX, mx = X(LAZ), my = Y(deg), stretch = 1 / Math.cos(LEL);
      g.save(); g.translate(mx, my); g.scale(stretch, 1);
      const halo = g.createRadialGradient(0, 0, r, 0, 0, r * 9);
      halo.addColorStop(0, 'rgba(220,230,255,0.35)'); halo.addColorStop(1, 'rgba(220,230,255,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r * 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(180,176,170,0.5)';                                        // maria
      for (const [dx, dy, rr] of [[-0.3, -0.2, 0.32], [0.25, 0.1, 0.25], [-0.05, 0.35, 0.2]]) { g.beginPath(); g.arc(dx * r, dy * r, rr * r, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  } else {
    // sun disc
    {
      const deg = LEL * 180 / Math.PI, r = 1.2 * PX, stretch = 1 / Math.cos(LEL);
      g.save(); g.translate(X(LAZ), Y(deg)); g.scale(stretch, 1);
      g.fillStyle = '#fffdf2'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // puffy fair-weather cumulus
    for (let i = 0; i < 26; i++) {
      const phi = (rnd() - 0.5) * Math.PI * 2, deg = 5 + rnd() * 20, size = (2 + rnd() * 3.5) * PX;
      for (let k = 0; k < 7; k++) {
        const dp = (rnd() - 0.5) * size * 3 / W * Math.PI * 2, dd = rnd() * size / PX * 0.6;
        blob(phi + dp, deg + dd, size * (0.8 + rnd() * 0.6), size * (0.55 + rnd() * 0.3), (a) => `rgba(255,255,255,${(0.75 * a).toFixed(2)})`);
      }
      blob(phi, deg - size / PX * 0.25, size * 2.6, size * 0.35, (a) => `rgba(170,190,215,${(0.35 * a).toFixed(2)})`);   // shaded bases
    }
    // high streaks
    for (let i = 0; i < 12; i++) blob((rnd() - 0.5) * Math.PI * 2, 25 + rnd() * 30, (20 + rnd() * 30) * PX, 0.7 * PX, (a) => `rgba(255,255,255,${(0.25 * a).toFixed(2)})`);
  }

  // distant tree line (and a few far-off spires) along the whole horizon
  g.fillStyle = S.tree;
  g.beginPath();
  g.moveTo(0, Y(-4));
  const p1 = rnd() * 6, p2 = rnd() * 6;
  for (let x = 0; x <= W; x += 3) {
    const t = (x / W) * Math.PI * 2;
    let d = 1.6 + 0.9 * Math.sin(t * 7 + p1) + 0.5 * Math.sin(t * 19 + p2) + 0.35 * Math.sin(t * 53);
    d += Math.max(0, Math.sin(t * 97 + p1 * 3)) * 0.9;
    g.lineTo(x, Y(Math.max(0.4, d)));
  }
  g.lineTo(W, Y(-4));
  g.closePath();
  g.fill();
  for (const az of [0.4, 1.15, 2.6, 3.4, 4.3, 5.6]) {
    const x = (az / (Math.PI * 2)) * W, base = Y(2.2), tip = Y(5.5 + (az % 1) * 2.5);
    g.beginPath(); g.moveTo(x - 0.9 * PX, base); g.lineTo(x, tip); g.lineTo(x + 0.9 * PX, base); g.closePath(); g.fill();
    g.fillRect(x - 1.6 * PX, base, 3.2 * PX, Y(-1) - base);
  }
  g.fillStyle = S.ground;
  g.fillRect(0, Y(-4) - 1, W, H - Y(-4) + 1);
  return c;
}
const skies = {};
function skyFor(mode) {
  if (!skies[mode]) {
    const t = new THREE.CanvasTexture(paintSky(mode));
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    skies[mode] = { tex: t, env: pmrem.fromEquirectangular(t).texture };
  }
  return skies[mode];
}
scene.fog = new THREE.Fog(0x0b1022, 26, 150);

/* ---------------- TIME OF DAY: one rig, two settings ---------------- */
const TIMES = {
  day: { key: 0xfff0dc, keyI: 2.6, hemiSky: 0xcfe4ff, hemiGround: 0x6b6648, hemiI: 1.0, fog: 0xc8dce8, fogN: 55, fogF: 320,
    envI: 0.75, bgI: 1.0, exposure: 1.0, bloom: 0.22, glowK: 0.35, addK: 0.22, spots: 0 },
  night: { key: 0xaabdff, keyI: 0.75, hemiSky: 0x4a5a96, hemiGround: 0x15141c, hemiI: 0.55, fog: 0x0c1124, fogN: 30, fogF: 165,
    envI: 0.35, bgI: 1.0, exposure: 1.12, bloom: 0.6, glowK: 1, addK: 1, spots: 1 },
};
let timeOfDay = null;
// lamps, lanterns, glow pools: full at night, mostly off by day (originals are remembered on first touch)
function applyGlow(root) {
  if (!root || !timeOfDay) return;
  const T = TIMES[timeOfDay];
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      if (!m || m.isShaderMaterial) continue;
      const u = m.userData;
      if (m.blending === THREE.AdditiveBlending) {
        if (u.baseOpacity === undefined) u.baseOpacity = m.opacity;
        m.opacity = u.baseOpacity * T.addK;
      } else if ((m.isMeshBasicMaterial || m.isSpriteMaterial) && m.color) {
        if (u.baseColor === undefined) u.baseColor = Math.max(m.color.r, m.color.g, m.color.b) > 1.05 ? m.color.clone() : null;
        if (u.baseColor) m.color.copy(u.baseColor).multiplyScalar(T.glowK);
      }
    }
  });
}

/* =====================================================================
   Court floor — one painted texture for the court + free zone
   ===================================================================== */
const PX_PER_M = 210;
function paintCourt() {
  const W = Math.round(F.outX * 2 * PX_PER_M);
  const H = Math.round(F.outZ * 2 * PX_PER_M);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // world (x,z) → canvas px. Canvas top row is world -z.
  const X = (x) => (x + F.outX) * PX_PER_M;
  const Z = (z) => (z + F.outZ) * PX_PER_M;
  const M = (m) => m * PX_PER_M;

  // free zone
  const fz = g.createLinearGradient(0, 0, 0, H);
  fz.addColorStop(0, '#4a1d1a'); fz.addColorStop(0.5, '#5e2620'); fz.addColorStop(1, '#4a1d1a');   // dark terracotta lacquer
  g.fillStyle = fz; g.fillRect(0, 0, W, H);

  // subtle panel seams in the free zone (sport-tile look)
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
  for (let x = -F.outX; x <= F.outX; x += 0.5) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
  for (let z = -F.outZ; z <= F.outZ; z += 0.5) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }

  // playing court
  const cg = g.createRadialGradient(X(0), Z(0), M(1), X(0), Z(0), M(8));
  cg.addColorStop(0, '#2a74d6'); cg.addColorStop(1, '#1a54ad');
  g.fillStyle = cg;
  g.fillRect(X(-F.hl), Z(-F.hw), M(F.L), M(F.W));

  // painted wordmarks in the free zone behind each baseline, readable from the opposite end
  const wordmark = (side) => {
    g.save();
    const s = sideSign(side);         // text sits behind the baseline the *opponent of* `side` defends
    g.translate(X(s * (F.hl + F.free * 0.5)), Z(0));
    g.rotate(s * Math.PI / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(241,234,217,0.16)';
    g.font = `italic 800 ${M(1.05)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillText('takraw iso', 0, 0);
    g.restore();
  };
  wordmark('left'); wordmark('right');

  // side text along both sidelines
  g.save();
  g.fillStyle = 'rgba(241,234,217,0.10)';
  g.font = `800 ${M(0.55)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TEMPLE COURT  ·  SEPAK TAKRAW', X(0), Z(F.hw + 1.4));
  g.translate(X(0), Z(-F.hw - 1.4)); g.rotate(Math.PI);
  g.fillText('TEMPLE COURT  ·  SEPAK TAKRAW', 0, 0);
  g.restore();

  // lines (white, 4 cm, inside the court dimensions)
  g.fillStyle = '#f4f6fa';
  const lw = M(F.line);
  g.fillRect(X(-F.hl), Z(-F.hw), M(F.L), lw);                 // sideline -z
  g.fillRect(X(-F.hl), Z(F.hw) - lw, M(F.L), lw);             // sideline +z
  g.fillRect(X(-F.hl), Z(-F.hw), lw, M(F.W));                 // back line -x
  g.fillRect(X(F.hl) - lw, Z(-F.hw), lw, M(F.W));             // back line +x
  g.fillRect(X(0) - M(F.centreLine) / 2, Z(-F.hw), M(F.centreLine), M(F.W)); // centre line

  g.strokeStyle = '#f4f6fa';
  g.lineWidth = lw;
  // service circles (radius to the outer edge of the line)
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(X(s * (F.hl - F.serveFromBack)), Z(0), M(F.serveR) - lw / 2, 0, Math.PI * 2);
    g.stroke();
  }
  // quarter circles: centred where the centre line meets each sideline, one in each half
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = X(0), cz = Z(sz * F.hw);
    // canvas angle 0 = +x, PI/2 = +z (canvas y down = +z)
    const mid = Math.atan2(-sz, sx);
    g.beginPath();
    g.arc(cx, cz, M(F.quarterR) - lw / 2, mid - Math.PI / 4, mid + Math.PI / 4);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function buildCourt() {
  const g = new THREE.Group();

  // raised deck
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(F.outX * 2 + 0.8, F.deckDrop, F.outZ * 2 + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x6a5644, roughness: 0.85 })
  );
  deck.position.y = -F.deckDrop / 2;
  deck.receiveShadow = true;
  g.add(deck);

  // glossy painted floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(F.outX * 2, F.outZ * 2),
    new THREE.MeshStandardMaterial({ map: null, roughness: 0.3, metalness: 0 })   // glossy enough via env reflections, much cheaper than clearcoat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  g.add(floor);
  // paint once fonts are ready so the wordmarks use the display face
  const paint = () => { floor.material.map = paintCourt(); floor.material.needsUpdate = true; };
  paint();
  if (document.fonts) document.fonts.ready.then(paint);

  // ---- net ----
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, metalness: 0.7, roughness: 0.3 });
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, F.netTopPost + 0.02, 18), postMat);
    post.position.set(0, (F.netTopPost + 0.02) / 2, sz * F.postZ);
    post.castShadow = true;
    g.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 20), postMat);
    foot.position.set(0, 0.025, sz * F.postZ);
    g.add(foot);
  }

  const netLen = F.postZ * 2;
  const mesh = document.createElement('canvas');
  mesh.width = mesh.height = 64;
  const mg = mesh.getContext('2d');
  mg.strokeStyle = 'rgba(16,16,18,1)'; mg.lineWidth = 7; mg.strokeRect(0, 0, 64, 64);
  const netTex = new THREE.CanvasTexture(mesh);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(netLen / 0.07, F.netDepth / 0.07); // 6–8 cm mesh
  netTex.anisotropy = 8;
  netTex.colorSpace = THREE.SRGBColorSpace;

  // net sags from 1.55 at the posts to 1.52 in the middle
  const sag = (z) => (F.netTopPost - F.netTopMid) * (1 - (z / F.postZ) ** 2);
  const netGeo = new THREE.PlaneGeometry(netLen, F.netDepth, 40, 1);
  const p = netGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - sag(p.getX(i)));
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, F.netTopPost - F.netDepth / 2, 0);
  net.castShadow = true;
  g.add(net);
  netMesh = net;

  // top and bottom tapes follow the sag; side tapes sit above each sideline
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.6 });
  const tape = (yTop) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const z = -F.postZ + (i / 40) * netLen;
      pts.push(new THREE.Vector3(0, yTop - sag(z), z));
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, F.netTape / 2, 6), tapeMat);
    m.castShadow = true;
    g.add(m);
  };
  tape(F.netTopPost - F.netTape / 2);
  tape(F.netTopPost - F.netDepth + F.netTape / 2);
  for (const sz of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, F.netDepth, F.netTape), tapeMat);
    st.position.set(0, F.netTopMid - F.netDepth / 2, sz * F.hw);
    g.add(st);
  }
  return g;
}
let netMesh = null, netShake = 0;
let courtGroup = buildCourt();
scene.add(courtGroup);
// boundary balustrade around the free zone — its own group so it can move when the court is resized (3v3)
const boardMats = {
  plaster: new THREE.MeshStandardMaterial({ color: 0xefe2cf, roughness: 0.88 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x2c1805 }),
};
function buildBoards() {
  const g = new THREE.Group();
  const MAT = boardMats;
  const boards = makeBatch();
  {
    const BH = P.C.boardH, BT = 0.2;
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.5, metalness: 0.15 });
    const bx = F.outX + BT / 2, bz = F.outZ + BT / 2;
    const runs = [                       // [length, x, z, rotY] — rotY turns the inner face toward the court
      [F.outX * 2 + BT * 2, 0, -bz, 0], [F.outX * 2 + BT * 2, 0, bz, Math.PI],
      [F.outZ * 2, -bx, 0, Math.PI / 2], [F.outZ * 2, bx, 0, -Math.PI / 2],
    ];
    for (const [len, x, z, ry] of runs) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      boards.put(MAT.plaster, xf(new THREE.BoxGeometry(len, BH - 0.18, BT), x, (BH - 0.18) / 2, z, ry));
      boards.put(MAT.gold, xf(new THREE.BoxGeometry(len + 0.02, 0.05, BT + 0.04), x, BH - 0.155, z, ry));
      boards.put(MAT.red, xf(new THREE.BoxGeometry(len + 0.08, 0.13, BT + 0.1), x, BH - 0.065, z, ry));
      const pg = new THREE.PlaneGeometry(len - 0.1, 0.42);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 3.36));
      boards.put(panelMat, xf(pg, x + nx * (BT / 2 + 0.004), 0.31, z + nz * (BT / 2 + 0.004), ry));
    }
  }

  boards.build(g, { castShadow: true, receiveShadow: true });
  return g;
}
let boardsGroup = null;
// 1v1 / 2v2 play on the normal court; 3v3 gets a bigger one (everything that depends on the size is rebuilt)
const COURT_SIZES = { normal: [15.4, 7.0], big: [18.2, 8.6] };
let courtSize = 'normal';
function setCourtSize(size) {
  if (size === courtSize || !COURT_SIZES[size]) return;
  courtSize = size;
  const [L, W] = COURT_SIZES[size];
  F.L = L; F.W = W; F.hl = L / 2; F.hw = W / 2;
  F.outX = F.hl + F.free; F.outZ = F.hw + F.free; F.postZ = F.hw + F.postOut;
  Object.assign(P.C, { hl: F.hl, hw: F.hw, outX: F.outX, outZ: F.outZ, postZ: F.postZ });
  const kl = F.hl / 7.7, kw = F.hw / 3.5;
  AIM_ROWS0.forEach((v, i) => { AIM_ROWS[i] = v * kl; });
  AIM_COLS0.forEach((v, i) => { AIM_COLS[i] = v * kw; });
  scene.remove(courtGroup); courtGroup = buildCourt(); scene.add(courtGroup);
  scene.remove(boardsGroup); boardsGroup = buildBoards(); scene.add(boardsGroup);
  boardsGroup.visible = venue === 'temple';
  buildSideGlow();
  landingDirty = true;
  if (timeOfDay) { applyGlow(courtGroup); applyGlow(boardsGroup); }
  setVenue(venue);
}
// MAPS (venues): picked per game from the map list (maps.js), in DAY or NIGHT. Each is built the first time it's needed at a
// court size (3v3 gets the bigger version), cached, and swapped in whole — nothing from one map is visible on another.
let venue = 'temple';                 // map id on screen
const venues = {};                    // `${id}:${size}` → { g, fx, update, setTime? }
const VENUE_BUILDERS = { temple: buildTempleLife, pond: buildPond, terrace: buildTerrace, riverside: buildRiverside, rooftop: buildRooftop, market: buildMarket, beach: buildBeach, jungle: buildJungle, bamboo: buildBamboo, festival: buildFestival, palace: buildPalace, monastery: buildMonastery };   // (the temple's buildings live in main.js; this adds its life)
const venueKey = (id) => `${id}:${courtSize}`;
function setVenue(id) {
  if (!VENUE_BUILDERS[id]) id = 'temple';
  venue = id;
  const k = venueKey(id);
  if (VENUE_BUILDERS[id] && !venues[k]) {
    const vn = VENUE_BUILDERS[id]({ F, xf, makeBatch, slope, poly, texLoader, glowTexture, ornamentTexture, panelTexture, spotLights,
      quality: () => QUALITY[qualityLevel] || QUALITY.medium });
    vn.fx.visible = qualityLevel !== 'low';
    scene.add(vn.g);
    venues[k] = vn;
    if (timeOfDay) { applyGlow(vn.g); applySpots(); if (vn.setTime) vn.setTime(timeOfDay); }
  }
  templeGroup.visible = id === 'temple';
  boardsGroup.visible = id === 'temple';
  for (const [key, vn] of Object.entries(venues)) vn.g.visible = key === k;
  applyFog();
  // keep only the few most recently used maps in memory (browsing all twelve shouldn't fill the GPU)
  venueLRU.splice(venueLRU.indexOf(k) >>> 0, venueLRU.includes(k) ? 1 : 0);
  venueLRU.push(k);
  while (venueLRU.length > 4) disposeVenue(venueLRU.shift());
}
const venueLRU = [];
function disposeVenue(key) {
  const vn = venues[key];
  if (!vn || key === venueKey(venue)) return;
  delete venues[key];
  scene.remove(vn.g);
  vn.g.traverse((o) => {
    if (o.isSpotLight) { const i = spotLights.indexOf(o); if (i >= 0) spotLights.splice(i, 1); }
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const mt of [].concat(o.material)) { for (const v of Object.values(mt)) if (v && v.isTexture && v !== glowTexture()) v.dispose(); mt.dispose(); }
  });
}
const currentVenue = () => venues[venueKey(venue)] || null;
// a map can ask for its own fog distances (e.g. the rooftop wants to see the far skyline)
function applyFog() {
  if (!timeOfDay) return;
  const T = TIMES[timeOfDay], o = currentVenue() && currentVenue().fog && currentVenue().fog[timeOfDay];
  scene.fog.near = o ? o[0] : T.fogN; scene.fog.far = o ? o[1] : T.fogF;
}
function applySpots() {
  const T = TIMES[timeOfDay || 'night'];
  for (const sp of spotLights) { if (sp.userData.base === undefined) sp.userData.base = sp.intensity; sp.intensity = sp.userData.base * T.spots; }
}
function setTimeOfDay(t) {
  if (!TIMES[t]) t = 'night';
  timeOfDay = t;
  const T = TIMES[t], sky = skyFor(t);
  scene.background = sky.tex; scene.backgroundIntensity = T.bgI;
  scene.environment = sky.env; scene.environmentIntensity = T.envI;
  scene.fog.color.set(T.fog);
  applyFog();
  key.color.set(T.key); key.intensity = T.keyI; key.position.set(...LIGHT_POS[t]);
  hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
  renderer.toneMappingExposure = T.exposure;
  bloom.strength = T.bloom;
  applySpots();
  for (const r of [templeGroup, boardsGroup, courtGroup]) applyGlow(r);
  for (const vn of Object.values(venues)) { applyGlow(vn.g); if (vn.setTime) vn.setTime(t); }
}
// what the player has picked (remembered), and the map of the game in progress (a guest gets it from the host)
let mapPick = { map: 'temple', time: 'night' };
try { const m = JSON.parse(localStorage.getItem('takraw-mappick') || 'null'); if (m) mapPick = { map: mapById(m.map).id, time: m.time === 'day' ? 'day' : 'night' }; } catch {}
let gameMap = null;
const cleanChoice = (m, t) => ({ map: mapById(m).id, time: t === 'day' ? 'day' : 'night' });
function applyArena(choice) { setVenue(choice.map); setTimeOfDay(choice.time); }

/* =====================================================================
   Surroundings — temple courtyard at dusk
   Ordination halls close both ends (the backdrop behind each opponent),
   cloister galleries run down both sides, chedis stand in the corners,
   frangipani trees and lanterns fill the gaps. The low lacquered
   balustrade at the free-zone edge is the hard boundary (physics boardH).

   Performance: every static piece is merged into ONE mesh per material
   (≈8 draw calls for all the architecture), trees and lanterns are
   instanced, nothing out here casts a shadow, and matrices are frozen.
   ===================================================================== */
const spotLights = [];

// Transformed, non-indexed copy of a geometry, so any two pieces can be merged.
const _xf = new THREE.Object3D();
function xf(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  _xf.position.set(x, y, z); _xf.rotation.set(rx, ry, rz); _xf.scale.set(1, 1, 1); _xf.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  return g.applyMatrix4(_xf.matrix);
}
// Collects pieces per material and merges them into one mesh each.
function makeBatch() {
  const lists = new Map();
  return {
    put(mat, geo) { if (!lists.has(mat)) lists.set(mat, []); lists.get(mat).push(geo); },
    build(parent, { castShadow = false, receiveShadow = false } = {}) {
      for (const [mat, gs] of lists) {
        const m = new THREE.Mesh(mergeGeometries(gs), mat);
        for (const g of gs) g.dispose();
        m.castShadow = castShadow; m.receiveShadow = receiveShadow;
        parent.add(m);
      }
      lists.clear();
    },
  };
}
// Flat polygon (3 or 4 corners) with explicit UVs. Used with double-sided materials.
function poly(pts, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  g.computeVertexNormals();
  return g;
}
// One roof plane running x0 → x1, from the eave line (z = ze, y = ye) up to (z = zr, y = yr).
// UVs are in metres / tile so the tile rows run parallel to the ridge.
function slope(x0, x1, ze, ye, zr, yr, tile = 2) {
  const L = Math.hypot(zr - ze, yr - ye) / tile;
  return poly([[x0, ye, ze], [x1, ye, ze], [x1, yr, zr], [x0, yr, zr]],
    [[x0 / tile, 0], [x1 / tile, 0], [x1 / tile, L], [x0 / tile, L]]);
}

function ornamentTexture() {            // gold lattice + flame rosettes on red: gable pediments
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a1912'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e3b456'; g.lineWidth = 6;
  for (let i = -256; i <= 512; i += 128) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke();
  }
  const rosette = (x, y, r) => {
    g.fillStyle = '#e3b456';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.16, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f6d58a';
    g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
  };
  for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256], [128, 128]]) rosette(x, y, 38);
  for (const [x, y] of [[128, 0], [128, 256], [0, 128], [256, 128]]) rosette(x, y, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function panelTexture() {               // lotus-petal frieze for the balustrade's inner face
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#6e1610'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#d9a64c'; g.fillRect(0, 3, 512, 4); g.fillRect(0, 57, 512, 4);
  for (let x = 32; x < 512; x += 64) {
    g.fillStyle = '#d9a64c';
    g.beginPath(); g.moveTo(x - 24, 52); g.quadraticCurveTo(x - 24, 22, x, 11); g.quadraticCurveTo(x + 24, 22, x + 24, 52); g.closePath(); g.fill();
    g.fillStyle = '#6e1610';
    g.beginPath(); g.moveTo(x - 14, 52); g.quadraticCurveTo(x - 14, 30, x, 22); g.quadraticCurveTo(x + 14, 30, x + 14, 52); g.closePath(); g.fill();
    g.fillStyle = '#f2cf7c';
    g.beginPath(); g.arc(x, 42, 4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function poolTexture() {                // soft warm light pool painted on the paving
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildSurroundings() {
  const g = new THREE.Group();
  const y0 = -F.deckDrop;                       // courtyard paving level (the court deck is raised)
  const loadTex = (name, srgb = false) => {
    const t = texLoader.load(`assets/temple/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const roofTex = loadTex('roof_diff.jpg', true), roofNor = loadTex('roof_nor_gl.jpg');
  const MAT = {
    plaster: new THREE.MeshStandardMaterial({ color: 0xefe2cf, roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8a48b, roughness: 0.92 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8a1e17, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdba54c, metalness: 0.9, roughness: 0.3, emissive: 0x2c1805 }),
    // one greyscale tile texture, tinted glazed orange (main roofs) and green (lower tiers / borders)
    roofO: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0xe8743a, roughness: 0.55, side: THREE.DoubleSide }),
    roofG: new THREE.MeshStandardMaterial({ map: roofTex, normalMap: roofNor, color: 0x4f9a5e, roughness: 0.55, side: THREE.DoubleSide }),
    orn: new THREE.MeshStandardMaterial({ map: ornamentTexture(), roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(1.7) }),   // lamp-lit doors, windows
  };
  const decor = makeBatch();      // no shadows
  const boards = makeBatch();     // the boundary balustrade casts + receives shadows (it's inside the shadow frustum)

  // ---- courtyard paving: Poly Haven "Large Grey Tiles", warmed to sandstone ----
  {
    const W = 84, D = 36;
    const geo = new THREE.PlaneGeometry(W, D);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 3), uv.getY(i) * (D / 3));   // 3 m per texture tile
    const arm = loadTex('paving_arm.jpg');                     // R = AO, G = roughness
    const paving = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: loadTex('paving_diff.jpg', true), normalMap: loadTex('paving_nor_gl.jpg'),
      aoMap: arm, roughnessMap: arm, color: 0xd6bf9f, roughness: 1,
    }));
    paving.rotation.x = -Math.PI / 2;
    paving.position.y = y0 + 0.002;
    paving.receiveShadow = true;
    g.add(paving);
  }

  // ---- ordination halls (one at each end, gable front facing the court) ----
  // Built once in hall space (front at X = 0, extending to +X, y = 0 at the paving), placed twice.
  const HALL_X = 27.4;
  const hall = [];
  {
    const put = (mat, geo, ...t) => hall.push([mat, xf(geo, ...t)]);
    // platform, red band, front steps
    put(MAT.stone, new THREE.BoxGeometry(16.8, 1.0, 16.4), 5.0, 0.5, 0);
    put(MAT.red, new THREE.BoxGeometry(16.9, 0.14, 16.5), 5.0, 0.92, 0);
    put(MAT.stone, new THREE.BoxGeometry(1.2, 0.66, 5.2), -4.0, 0.33, 0);
    put(MAT.stone, new THREE.BoxGeometry(1.2, 0.33, 5.2), -5.2, 0.165, 0);
    // white-washed cella with a lamp-lit open door and windows
    put(MAT.plaster, new THREE.BoxGeometry(11, 4.4, 10), 7, 3.2, 0);
    put(MAT.glow, new THREE.PlaneGeometry(2.2, 3.0), 1.48, 2.6, 0, -Math.PI / 2);
    for (const z of [-1.2, 1.2]) put(MAT.gold, new THREE.BoxGeometry(0.12, 3.3, 0.18), 1.45, 2.65, z);
    put(MAT.gold, new THREE.BoxGeometry(0.14, 0.22, 2.6), 1.45, 4.3, 0);
    for (const x of [3.5, 6, 8.5, 11]) for (const sz of [-1, 1]) {
      put(MAT.red, new THREE.BoxGeometry(1.1, 1.6, 0.06), x, 3.1, sz * 5.0);
      put(MAT.glow, new THREE.PlaneGeometry(0.8, 1.3), x, 3.1, sz * 5.04, sz > 0 ? 0 : Math.PI);
    }
    // colonnades: a front porch row and a row down each side under the lower roof tier
    const colTall = new THREE.CylinderGeometry(0.22, 0.27, 4.7, 10);
    const colShort = new THREE.CylinderGeometry(0.2, 0.25, 3.75, 10);
    const cap = new THREE.CylinderGeometry(0.36, 0.24, 0.32, 10);
    for (const z of [-4.6, -2.6, 2.6, 4.6]) { put(MAT.plaster, colTall, -2.7, 3.35, z); put(MAT.gold, cap, -2.7, 5.66, z); }
    put(MAT.red, new THREE.BoxGeometry(0.4, 0.3, 10.4), -2.7, 5.95, 0);
    for (const x of [-2.7, 0, 2.7, 5.4, 8.1, 10.8, 13.0]) for (const sz of [-1, 1]) {
      put(MAT.plaster, colShort, x, 2.875, sz * 7.7);
      put(MAT.gold, cap, x, 4.8, sz * 7.7);
    }
    // roofs: steep main roof, a lower telescoped front tier, and a green skirt tier down each side
    for (const sz of [-1, 1]) {
      put(MAT.roofO, slope(-1.6, 13.4, sz * 6.6, 6.2, 0, 11.0));
      put(MAT.roofO, slope(-3.0, -1.6, sz * 6.0, 5.9, 0, 10.2));
      put(MAT.roofG, slope(-3.0, 13.4, sz * 8.4, 4.5, sz * 6.2, 5.9));
      put(MAT.red, new THREE.BoxGeometry(16.4, 0.18, 0.12), 5.2, 4.45, sz * 8.42);
    }
    // ornamented gable pediments (front tier, main roof front + back)
    const ped = (X, hw, yb, ya) => poly([[X, yb, -hw], [X, yb, hw], [X, ya, 0]],
      [[-hw / 2.4 + 0.5, yb / 2.4], [hw / 2.4 + 0.5, yb / 2.4], [0.5, ya / 2.4]]);
    put(MAT.orn, ped(-3.02, 5.6, 6.05, 9.95));
    put(MAT.orn, ped(-1.62, 6.2, 6.4, 10.8));
    put(MAT.orn, ped(13.42, 6.2, 6.4, 10.8));
    // gold bargeboards up each front rake, upturned tips at the eaves, ridge caps
    const rake = (X, ze, ye, yr) => {
      const L = Math.hypot(ze, yr - ye), a = Math.atan2(yr - ye, ze);
      for (const s of [-1, 1]) {
        put(MAT.gold, new THREE.BoxGeometry(0.2, 0.34, L + 0.3), X, (ye + yr) / 2, s * ze / 2, 0, s * a);
        put(MAT.gold, new THREE.ConeGeometry(0.13, 0.7, 6), X, ye + 0.25, s * (ze + 0.1), 0, s * 0.7);
      }
    };
    rake(-3.05, 6.0, 5.9, 10.2);
    rake(-1.65, 6.6, 6.2, 11.0);
    put(MAT.gold, new THREE.BoxGeometry(15.0, 0.16, 0.2), 5.9, 11.05, 0);
    put(MAT.gold, new THREE.BoxGeometry(1.4, 0.16, 0.2), -2.3, 10.25, 0);
    // chofa — the slender hooked finials on each gable apex
    const chofa = (X, y, h) => {
      const pts = [[0, 0], [-0.12, 0.45], [-0.05, 0.9], [0.25, 1.2], [0.55, 1.15], [0.6, 0.95]]
        .map(([dx, dy]) => new THREE.Vector3(X + h * dx, y + dy, 0));
      put(MAT.gold, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.1, 6));
    };
    chofa(-3.05, 10.2, -1);
    chofa(-1.65, 11.0, -1);
    chofa(13.45, 11.0, 1);
  }
  for (const s of [-1, 1]) {
    const M = new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).setPosition(s * HALL_X, y0, 0);
    for (const [mat, geo] of hall) decor.put(mat, geo.clone().applyMatrix4(M));
  }
  for (const [, geo] of hall) geo.dispose();

  // ---- chedis (bell-shaped stupas) in the four corners behind the galleries ----
  {
    const V = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(V([[0, 0], [3.0, 0], [3.0, 0.7], [2.6, 0.7], [2.6, 1.4], [2.25, 1.4], [2.25, 2.0],
      [2.35, 2.3], [2.45, 3.0], [2.35, 3.9], [2.0, 4.7], [1.45, 5.35], [0.9, 5.75], [0.85, 6.1], [1.0, 6.1], [1.0, 6.6], [0.6, 6.6]]), 20);
    const spire = new THREE.LatheGeometry(V([[0.6, 6.6], [0.62, 6.8], [0.5, 6.8], [0.52, 7.0], [0.42, 7.4], [0.44, 7.6],
      [0.34, 8.0], [0.36, 8.2], [0.26, 8.7], [0.28, 8.9], [0.17, 9.6], [0.12, 10.6], [0.06, 11.6], [0.02, 12.3], [0, 12.5]]), 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      decor.put(MAT.plaster, xf(body, sx * 34, y0, sz * 12.8));
      decor.put(MAT.gold, xf(spire, sx * 34, y0, sz * 12.8));
    }
  }

  // ---- cloister galleries down both sides + the courtyard's outer walls ----
  {
    const col = new THREE.CylinderGeometry(0.17, 0.2, 3.3, 8);
    for (const sz of [-1, 1]) {
      decor.put(MAT.stone, xf(new THREE.BoxGeometry(53, 0.35, 4.0), 0, y0 + 0.175, sz * 15.75));
      for (let x = -25; x <= 25.01; x += 2.5) decor.put(MAT.plaster, xf(col, x, y0 + 2.0, sz * 14.1));
      decor.put(MAT.red, xf(new THREE.BoxGeometry(53, 0.28, 0.32), 0, y0 + 3.79, sz * 14.1));
      decor.put(MAT.roofO, xf(slope(-26.5, 26.5, sz * 13.5, 3.85, sz * 17.75, 5.6), 0, y0, 0));
      decor.put(MAT.roofG, xf(slope(-26.5, 26.5, sz * 13.45, 3.88, sz * 14.25, 4.21), 0, y0, 0));   // green border course
      // back wall (it's also the courtyard's side wall), red dado + gold line, little oil lamps
      decor.put(MAT.plaster, xf(new THREE.BoxGeometry(84.5, 5.7, 0.5), 0, y0 + 2.85, sz * 18.0));
      decor.put(MAT.red, xf(new THREE.BoxGeometry(84.8, 0.22, 0.75), 0, y0 + 5.8, sz * 18.0));
      decor.put(MAT.red, xf(new THREE.BoxGeometry(53, 1.1, 0.06), 0, y0 + 1.1, sz * 17.72));
      decor.put(MAT.gold, xf(new THREE.BoxGeometry(53, 0.07, 0.08), 0, y0 + 1.72, sz * 17.72));
      for (let x = -22.5; x <= 22.51; x += 5) decor.put(MAT.glow, xf(new THREE.BoxGeometry(0.2, 0.28, 0.1), x, y0 + 2.4, sz * 17.7));
    }
    for (const sx of [-1, 1]) {
      decor.put(MAT.plaster, xf(new THREE.BoxGeometry(0.5, 3.6, 36.5), sx * 42, y0 + 1.8, 0));
      decor.put(MAT.red, xf(new THREE.BoxGeometry(0.75, 0.2, 36.8), sx * 42, y0 + 3.7, 0));
    }
  }

  // ---- stone lanterns: flanking each hall's steps and along the gallery fronts ----
  const stoneLanterns = [[21.0, 3.6], [21.0, -3.6], [-21.0, 3.6], [-21.0, -3.6],
    [13, 12.6], [-13, 12.6], [13, -12.6], [-13, -12.6], [24, 12.6], [-24, 12.6], [24, -12.6], [-24, -12.6]];
  {
    const base = new THREE.BoxGeometry(0.62, 0.22, 0.62), shaft = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8);
    const sill = new THREE.BoxGeometry(0.56, 0.08, 0.56), light = new THREE.BoxGeometry(0.36, 0.34, 0.36);
    const post = new THREE.BoxGeometry(0.07, 0.36, 0.07), roof = new THREE.ConeGeometry(0.46, 0.42, 4), tip = new THREE.ConeGeometry(0.06, 0.22, 6);
    for (const [x, z] of stoneLanterns) {
      decor.put(MAT.stone, xf(base, x, y0 + 0.11, z));
      decor.put(MAT.stone, xf(shaft, x, y0 + 0.67, z));
      decor.put(MAT.stone, xf(sill, x, y0 + 1.16, z));
      decor.put(MAT.glow, xf(light, x, y0 + 1.37, z));
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.put(MAT.stone, xf(post, x + dx * 0.22, y0 + 1.38, z + dz * 0.22));
      decor.put(MAT.red, xf(roof, x, y0 + 1.77, z, Math.PI / 4));
      decor.put(MAT.gold, xf(tip, x, y0 + 2.09, z));
    }
  }

  // ---- red lantern poles at the court corners: festoons of paper lanterns + the court's floodlights ----
  const POLE = 6.6;
  const polePos = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 12.4, pz = sz * 9.4;
    polePos.push([px, pz]);
    decor.put(MAT.stone, xf(new THREE.BoxGeometry(0.7, 0.4, 0.7), px, y0 + 0.2, pz));
    decor.put(MAT.red, xf(new THREE.CylinderGeometry(0.11, 0.14, POLE, 10), px, y0 + POLE / 2, pz));
    decor.put(MAT.glow, xf(new THREE.BoxGeometry(0.3, 0.42, 0.3), px, y0 + POLE - 0.25, pz));
    decor.put(MAT.gold, xf(new THREE.ConeGeometry(0.2, 0.7, 8), px, y0 + POLE + 0.3, pz));
    // warm floodlight hidden in the lamp head (High quality only)
    const spot = new THREE.SpotLight(0xffd2a0, 12, 40, 0.55, 0.7, 1.2);
    spotLights.push(spot);
    spot.position.set(px, y0 + POLE - 0.3, pz);
    spot.target.position.set(sx * 3, 0, sz * 1);
    g.add(spot, spot.target);
  }
  {
    // festoons run along both sides only — strings across the ends would block the cameras
    const wireMat = new THREE.LineBasicMaterial({ color: 0x140c0a });
    const pts = [];
    for (const sz of [-1, 1]) {
      const a = new THREE.Vector3(-12.4, y0 + POLE - 0.1, sz * 9.4), b = new THREE.Vector3(12.4, y0 + POLE - 0.1, sz * 9.4);
      const n = 30, line = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * 1.1;
        line.push(p);
        if (i > 0 && i < n) pts.push(p);
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
    }
    const lanternGeo = new THREE.SphereGeometry(0.17, 10, 8);
    lanternGeo.scale(1, 1.25, 1);
    const lanterns = new THREE.InstancedMesh(lanternGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3.4) }), pts.length);   // >1 so bloom picks them up
    const warm = [new THREE.Color(0xff5a2e), new THREE.Color(0xffae42), new THREE.Color(0xffd27a)];
    pts.forEach((p, i) => {
      _xf.position.set(p.x, p.y - 0.24, p.z); _xf.rotation.set(0, 0, 0); _xf.scale.set(1, 1, 1); _xf.updateMatrix();
      lanterns.setMatrixAt(i, _xf.matrix);
      lanterns.setColorAt(i, warm[i % 3]);
    });
    g.add(lanterns);
  }

  // ---- warm light pools on the paving (fake bounce light: one additive instanced draw) ----
  {
    const pools = [
      ...stoneLanterns.map(([x, z]) => [x, z, 1.7]),
      ...polePos.map(([x, z]) => [x, z, 2.6]),
      [HALL_X - 4.6, 0, 3.4], [-(HALL_X - 4.6), 0, 3.4],      // spill from the open hall doors
    ];
    const geo = new THREE.CircleGeometry(1, 24);
    geo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      map: poolTexture(), color: new THREE.Color(0xffb066).multiplyScalar(0.55), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }), pools.length);
    pools.forEach(([x, z, r], i) => {
      _xf.position.set(x, y0 + 0.012, z); _xf.rotation.set(0, 0, 0); _xf.scale.set(r, 1, r); _xf.updateMatrix();
      im.setMatrixAt(i, _xf.matrix);
    });
    g.add(im);
  }

  // ---- frangipani trees: one template, three instanced draws (bark, leaves, blossoms) ----
  {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bark = [], leaf = [], blossom = [];
    const limb = (a, b, r0, r1) => {
      const d = new THREE.Vector3().subVectors(b, a), L = d.length();
      const c = new THREE.CylinderGeometry(r1, r0, L, 6);
      c.translate(0, L / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
      c.translate(a.x, a.y, a.z);
      bark.push(c.toNonIndexed());
    };
    const fork = V(0.1, 1.5, 0);
    limb(V(0, 0, 0), fork, 0.2, 0.15);
    for (const [x, y, z] of [[1.3, 2.6, 0.4], [-1.1, 2.8, 0.7], [0.2, 3.0, -1.2], [-0.5, 2.5, -0.6]]) {
      const mid = V(x, y, z);
      limb(fork, mid, 0.13, 0.09);
      for (const [dx, dy, dz] of [[0.6, 0.9, 0.3], [-0.2, 1.0, -0.5]]) {
        const tip = V(x + dx * Math.sign(x), y + dy, z + dz);
        limb(mid, tip, 0.08, 0.05);
        const f = new THREE.IcosahedronGeometry(0.75, 0);
        f.scale(1.25, 0.6, 1.25); f.translate(tip.x, tip.y + 0.15, tip.z);
        leaf.push(f);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const b = new THREE.IcosahedronGeometry(0.1, 0);
          b.translate(tip.x + Math.cos(a) * 0.55, tip.y + 0.42, tip.z + Math.sin(a) * 0.55);
          blossom.push(b);
        }
      }
    }
    const trees = [[19.5, 10.6], [-19.5, 10.6], [19.5, -10.6], [-19.5, -10.6], [6, 11.8], [-6, 11.8], [6, -11.8], [-6, -11.8]];
    const parts = [
      [mergeGeometries(bark), new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.9 })],
      [mergeGeometries(leaf), new THREE.MeshStandardMaterial({ color: 0x2e5a2c, roughness: 0.8, flatShading: true })],
      [mergeGeometries(blossom), new THREE.MeshStandardMaterial({ color: 0xfff1da, emissive: 0x5a4632, roughness: 0.6 })],
    ];
    for (const [geo, mat] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, trees.length);
      trees.forEach(([x, z], i) => {
        _xf.position.set(x, y0, z); _xf.rotation.set(0, i * 2.4, 0); _xf.scale.setScalar(0.95 + (i % 3) * 0.12); _xf.updateMatrix();
        im.setMatrixAt(i, _xf.matrix);
      });
      g.add(im);
    }
  }

  decor.build(g);
  boards.build(g, { castShadow: true, receiveShadow: true });

  // nothing out here ever moves: compute matrices once and stop updating them every frame
  g.updateMatrixWorld(true);
  g.traverse((o) => { o.matrixAutoUpdate = false; });
  return g;
}
const templeGroup = buildSurroundings();
scene.add(templeGroup);
boardsGroup = buildBoards();
scene.add(boardsGroup);

/* =====================================================================
   Player model — 1.72 m, jointed, numbered kit
   ===================================================================== */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

function hashNum(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 98) + 1;
}


/* ---------------- player looks (customization) ---------------- */
const LOOK_OPTS = {
  skin: [0xf3cfae, 0xe2b089, 0xcf9b72, 0xb9825a, 0x9c6b47, 0x7f5538, 0x613f28, 0x43291a],
  hair: ['buzz', 'spiky', 'bun', 'ponytail', 'afro', 'mohawk', 'shaved'],
  hairColor: [0x15110e, 0x3b2416, 0x7a3b1c, 0xd9b35b, 0xc9c9cf, 0x2e6bff],
  jersey: [0xff8a2a, 0x2fd3c4, 0xf2c14e, 0x7d5cff, 0xe8e8ec, 0x23252e, 0x2fbf71, 0xff4d8d, 0x3d8bff, 0xd94b3a],
  symbol: ['lotus', 'flame', 'tiger', 'star', 'wave', 'elephant', 'moon', 'bolt'],
};
const HAIR_NAMES = { buzz: 'Buzz', spiky: 'Spiky', bun: 'Top bun', ponytail: 'Ponytail', afro: 'Afro', mohawk: 'Mohawk', shaved: 'Shaved' };
function sanitizeLook(l) {
  const o = {};
  for (const k of Object.keys(LOOK_OPTS)) {
    const v = l && Number.isInteger(l[k]) ? l[k] : -1;
    o[k] = v >= 0 && v < LOOK_OPTS[k].length ? v : 0;
  }
  return o;
}
function randomLook() {
  const o = {};
  for (const k of Object.keys(LOOK_OPTS)) o[k] = Math.floor(Math.random() * LOOK_OPTS[k].length);
  return o;
}
let myLook = randomLook();
try { const s = localStorage.getItem('takraw-look'); if (s) myLook = sanitizeLook(JSON.parse(s)); else localStorage.setItem('takraw-look', JSON.stringify(myLook)); } catch {}
function saveLook() { try { localStorage.setItem('takraw-look', JSON.stringify(myLook)); } catch {} }

// jersey symbols (instead of numbers), drawn as simple vector shapes
function drawSymbol(g, sym, color, S = 128) {
  const k = S / 128;
  g.save(); g.scale(k, k);
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  const P = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
  switch (sym) {
    case 'lotus':
      for (const [a, s] of [[0, 1], [-0.75, 0.85], [0.75, 0.85], [-1.35, 0.7], [1.35, 0.7]]) {
        g.save(); g.translate(64, 92); g.rotate(a * 0.55); g.scale(s, s);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-20, -30, 0, -62); g.quadraticCurveTo(20, -30, 0, 0); g.fill(); g.restore();
      }
      g.fillRect(30, 96, 68, 7); break;
    case 'flame':
      g.beginPath(); g.moveTo(64, 112); g.bezierCurveTo(26, 108, 26, 70, 46, 50); g.bezierCurveTo(48, 64, 56, 66, 58, 60);
      g.bezierCurveTo(54, 40, 64, 24, 78, 14); g.bezierCurveTo(74, 34, 102, 50, 98, 80); g.bezierCurveTo(96, 102, 80, 112, 64, 112); g.fill(); break;
    case 'tiger':
      for (const [x, w] of [[30, 1], [64, 1.2], [98, 1]]) {
        g.beginPath(); g.moveTo(x - 10 * w, 14); g.lineTo(x + 10 * w, 14); g.lineTo(x + 2, 64); g.lineTo(x + 12 * w, 114); g.lineTo(x - 8 * w, 114); g.lineTo(x - 4, 64); g.closePath(); g.fill();
      } break;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 54, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(64 + Math.cos(a) * r, 68 + Math.sin(a) * r); }
      P(pts); break;
    }
    case 'wave':
      for (const y of [44, 72, 100]) { g.beginPath(); g.moveTo(14, y); g.bezierCurveTo(34, y - 22, 46, y + 12, 64, y - 6); g.bezierCurveTo(82, y - 24, 94, y + 10, 114, y - 8); g.stroke(); }
      break;
    case 'elephant':
      g.beginPath(); g.ellipse(70, 62, 34, 28, 0, 0, Math.PI * 2); g.fill();                 // head
      g.beginPath(); g.ellipse(42, 58, 20, 28, -0.2, 0, Math.PI * 2); g.fill();              // ear
      g.lineWidth = 15; g.beginPath(); g.moveTo(92, 72); g.bezierCurveTo(106, 92, 98, 112, 84, 110); g.stroke();   // trunk
      g.fillRect(52, 84, 13, 30); g.fillRect(72, 84, 13, 30); break;
    case 'moon':
      g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(84, 52, 42, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; break;
    case 'bolt':
      P([74, 8, 30, 72, 58, 72, 46, 120, 100, 52, 70, 52, 84, 8]); break;
  }
  g.restore();
}
function symbolTexture(sym, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  drawSymbol(c.getContext('2d'), sym, '#' + new THREE.Color(color).getHexString());
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// subtle rim light so players pop off the court
function addRim(mat, strength = 0.28) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.92, 0.82) * pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0) * ' + strength.toFixed(2) + ';');
  };
  mat.customProgramCacheKey = () => 'rim' + strength;
  return mat;
}

function createPlayer(side, name, teamKey = side, look = null) {
  const team = TEAMS[teamKey];
  const L = sanitizeLook(look || randomLook());
  const root = new THREE.Group();      // world position
  const yaw = new THREE.Group();       // facing
  const body = new THREE.Group();      // lean + bob + jump height
  root.add(yaw); yaw.add(body);

  const jerseyCol = new THREE.Color(LOOK_OPTS.jersey[L.jersey]);
  const lum = jerseyCol.r * 0.3 + jerseyCol.g * 0.59 + jerseyCol.b * 0.11;
  const trimCol = lum > 0.55 ? 0x16181f : 0xf6f1e6;                // contrast trim
  const std = (color, roughness) => addRim(new THREE.MeshStandardMaterial({ color, roughness }));
  const skin = std(LOOK_OPTS.skin[L.skin], 0.6);
  const jersey = std(jerseyCol, 0.5);
  const trim = std(trimCol, 0.55);
  const panel = std(jerseyCol.clone().multiplyScalar(0.62), 0.5);   // darker side panels
  const shorts = std(0x15161b, 0.7);
  const sock = std(0xf1ead9, 0.8);
  const shoe = std(0xf2f2f4, 0.45);
  const shoeAcc = std(jerseyCol, 0.45);
  const sole = std(0x2a2b30, 0.6);
  const hairMat = std(LOOK_OPTS.hairColor[L.hair === 6 ? 0 : L.hairColor], 0.85);
  const band = std(new THREE.Color(team.jersey), 0.5);           // headband = team colour (blue = your side, red = theirs)
  const dark = new THREE.MeshBasicMaterial({ color: 0x0d0a08 });

  const M = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // legs: hip (0.92) → knee → ankle
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.095, 0.92, 0); body.add(hip);
    M(new THREE.CapsuleGeometry(0.08, 0.25, 4, 12), shorts, hip, 0, -0.16, 0);
    M(new THREE.BoxGeometry(0.006, 0.2, 0.026), shoeAcc, hip, sx * 0.084, -0.16, 0);           // shorts side stripe (jersey colour)
    M(new THREE.CapsuleGeometry(0.066, 0.22, 4, 12), skin, hip, 0, -0.31, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee);
    M(new THREE.SphereGeometry(0.064, 12, 10), skin, knee, 0, 0, 0.004);                        // knee joint
    M(new THREE.CapsuleGeometry(0.054, 0.27, 4, 12), skin, knee, 0, -0.17, 0);
    M(new THREE.CylinderGeometry(0.057, 0.05, 0.16, 12), sock, knee, 0, -0.32, 0);
    const foot = new THREE.Group(); foot.position.set(0, -0.42, 0); knee.add(foot);
    M(new THREE.BoxGeometry(0.1, 0.075, 0.25), shoe, foot, 0, -0.02, 0.045);
    M(new THREE.BoxGeometry(0.102, 0.03, 0.08), shoeAcc, foot, 0, -0.005, -0.04);                // heel
    M(new THREE.BoxGeometry(0.104, 0.012, 0.18), shoeAcc, foot, sx * 0.0, -0.035, 0.07).scale.x = 1.02;   // stripe
    M(new THREE.BoxGeometry(0.104, 0.02, 0.255), sole, foot, 0, -0.065, 0.045);
    legs.push({ hip, knee });
  }

  // pelvis + torso (a touch narrower at the waist)
  M(new THREE.CapsuleGeometry(0.13, 0.06, 4, 14), shorts, body, 0, 0.95, 0).scale.set(1.22, 1, 0.85);
  const torso = M(new THREE.CapsuleGeometry(0.16, 0.31, 6, 16), jersey, body, 0, 1.23, 0);
  torso.scale.set(1.1, 1, 0.74);
  for (const sx of [-1, 1]) {                                                                    // contrast side panels
    const pnl = M(new THREE.CapsuleGeometry(0.03, 0.24, 4, 8), panel, body, sx * 0.152, 1.22, 0);
    pnl.scale.set(0.45, 1, 1.9);
  }
  M(new THREE.TorusGeometry(0.072, 0.017, 8, 20), trim, body, 0, 1.445, 0).rotation.x = Math.PI / 2;   // collar

  // symbol (front + bigger on the back)
  const symMat = new THREE.MeshBasicMaterial({ map: symbolTexture(LOOK_OPTS.symbol[L.symbol], trimCol), transparent: true, depthWrite: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), symMat);
  front.position.set(0, 1.26, 0.124);
  body.add(front);
  const back = front.clone();
  back.position.z = -0.124; back.rotation.y = Math.PI; back.position.y = 1.28;
  back.scale.setScalar(1.4);
  body.add(back);

  // arms: shoulder → elbow → hand
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.21, 1.395, 0); body.add(sh);
    M(new THREE.SphereGeometry(0.066, 12, 10), jersey, sh, 0, -0.01, 0);
    M(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), skin, sh, 0, -0.15, 0);
    const el = new THREE.Group(); el.position.set(0, -0.28, 0); sh.add(el);
    M(new THREE.SphereGeometry(0.046, 10, 8), skin, el, 0, 0, 0);                                  // elbow joint
    M(new THREE.CapsuleGeometry(0.04, 0.19, 4, 10), skin, el, 0, -0.12, 0);
    const hand = M(new THREE.SphereGeometry(0.047, 10, 8), skin, el, 0, -0.265, 0.008);
    hand.scale.set(0.85, 1.15, 0.7);
    arms.push({ sh, el, sx });
  }

  // neck + head (in its own group so it can look at the ball)
  M(new THREE.CylinderGeometry(0.047, 0.055, 0.1, 12), skin, body, 0, 1.5, 0);
  const headG = new THREE.Group(); headG.position.set(0, 1.53, 0); body.add(headG);
  const HY = 0.09;                                                                               // head centre above the neck
  const head = M(new THREE.SphereGeometry(0.104, 22, 18), skin, headG, 0, HY, 0.005);
  head.scale.set(0.95, 1.1, 1);
  for (const sx of [-1, 1]) {                                                                    // eyes + brows
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dark); eye.position.set(sx * 0.034, HY + 0.01, 0.097); headG.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.01), hairMat); brow.position.set(sx * 0.035, HY + 0.035, 0.098); brow.rotation.z = -sx * 0.12; headG.add(brow);
  }
  const bandR = buildHair(headG, LOOK_OPTS.hair[L.hair], hairMat, HY, M);
  M(new THREE.TorusGeometry(bandR, 0.017, 8, 26), band, headG, 0, HY + 0.045, 0.002).rotation.x = Math.PI / 2;   // team headband

  // glow ring at the feet (team colour: blue = your side, red = theirs)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(team.jersey).multiplyScalar(RING_GLOW), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.41, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  root.add(ring);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(0xfff2dd).multiplyScalar(0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.008;
  root.add(pool);

  scene.add(root);

  const p = {
    side, team, teamKey, look: L, root, yaw, body, legs, arms, headG, ring, ringMat, pool,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), y: 0, vy: 0,
    facing: sideSign(side) > 0 ? Math.PI / 2 : -Math.PI / 2,
    phase: Math.random() * 6, anim: 0, target: null, idleT: Math.random() * 10, landT: 0, wasAir: false, lookAtBall: true, ready: false,
    setName() {},
    dispose() { scene.remove(root); },
  };
  return p;
}
function buildHair(headG, style, mat, HY, M) {
  // hair is drawn big and chunky so each style reads from the game camera; returns the headband radius to sit over it
  const cap = (thick = 0.122, cut = 0.56, sy = 1.12) => {
    const m = M(new THREE.SphereGeometry(thick, 22, 14, 0, Math.PI * 2, 0, Math.PI * cut), mat, headG, 0, HY + 0.018, -0.01);
    m.scale.set(0.98, sy, 1.06); return m;
  };
  switch (style) {
    case 'buzz': cap(0.114, 0.52, 1.08); return 0.112;
    case 'spiky':
      cap(0.12, 0.56, 1.1);
      for (let i = 0; i < 13; i++) {
        const ring = i < 5 ? 0 : i < 13 ? 1 : 2, a = (i / (ring ? 8 : 5)) * Math.PI * 2 + ring * 0.4, r = ring ? 0.075 : 0.03;
        const sp = M(new THREE.ConeGeometry(0.042, 0.16, 6), mat, headG, Math.cos(a) * r, HY + 0.13 - ring * 0.02, Math.sin(a) * r - 0.015);
        sp.rotation.set(Math.sin(a) * (0.35 + ring * 0.5), 0, -Math.cos(a) * (0.35 + ring * 0.5));
      }
      return 0.12;
    case 'bun':
      cap(0.12, 0.56, 1.1);
      M(new THREE.SphereGeometry(0.075, 16, 12), mat, headG, 0, HY + 0.17, -0.045);
      M(new THREE.TorusGeometry(0.05, 0.016, 8, 16), mat, headG, 0, HY + 0.13, -0.04).rotation.x = Math.PI / 2;
      return 0.12;
    case 'ponytail': {
      cap(0.124, 0.6, 1.1);
      M(new THREE.SphereGeometry(0.045, 10, 8), mat, headG, 0, HY + 0.05, -0.125);              // tie
      const tail = M(new THREE.CapsuleGeometry(0.048, 0.3, 4, 10), mat, headG, 0, HY - 0.1, -0.17);
      tail.rotation.x = 0.75; tail.position.z = -0.2; tail.scale.set(1, 1, 0.8);   // swings out behind so it shows in silhouette
      return 0.124;
    }
    case 'afro': {
      const a = M(new THREE.SphereGeometry(0.19, 20, 16), mat, headG, 0, HY + 0.11, -0.07);       // big, but up and back so the face shows
      a.scale.set(1.12, 0.95, 0.85);
      return 0.113;
    }
    case 'mohawk':
      cap(0.108, 0.42, 1.0).scale.x = 0.85;
      for (let i = 0; i < 7; i++) {
        const t = i / 6, z = 0.09 - t * 0.21, y = HY + 0.13 - Math.abs(t - 0.4) * 0.06;
        const fin = M(new THREE.ConeGeometry(0.038, 0.17, 5), mat, headG, 0, y, z);
        fin.rotation.x = -0.35 + t * 0.8; fin.scale.z = 0.55;
      }
      return 0.112;
    case 'shaved': default: return 0.106;
  }
}


const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function animatePlayer(p, speed, dt) {
  p.anim += (speed - p.anim) * Math.min(1, dt * 10);
  const s = p.anim;
  const run = Math.min(1, s / 6.5);
  const moving = s > 0.25;
  p.phase += dt * (5.5 + s * 1.7);
  p.idleT += dt;
  const air = p.y > 0.03;
  if (p.wasAir && !air) p.landT = 0.18;                  // landing: knees soak it up
  p.wasAir = air;
  p.landT = Math.max(0, p.landT - dt);
  const land = p.landT > 0 ? Math.sin((p.landT / 0.18) * Math.PI) : 0;
  const sw = Math.sin(p.phase);
  const t = p.idleT;
  // ready stance when a ball is coming at you (or in the preview), relaxed otherwise
  p.readyK = (p.readyK || 0) + (((p.ready || p.charging) ? 1 : 0) - (p.readyK || 0)) * Math.min(1, dt * 8);
  const rk = p.readyK * (moving ? 0.4 : 1);
  const breathe = Math.sin(t * 2.2);
  const rising = air && p.vy > 1.5, falling = air && p.vy < -1.5;
  const tuck = air ? 1 - Math.min(1, Math.abs(p.vy) / 6) : 0;   // knees up at the top of the jump

  const stride = 0.12 + run * 0.85;
  for (let i = 0; i < 2; i++) {
    const L = p.legs[i];
    const ph = i === 0 ? sw : -sw;
    L.hip.rotation.z = 0;
    if (air) {
      L.hip.rotation.x = rising ? (i === 0 ? -0.35 : 0.1) : (i === 0 ? -0.8 : -0.3) - tuck * 0.35;
      L.knee.rotation.x = rising ? 0.25 : (i === 0 ? 1.1 : 0.7) + tuck * 0.4;
      if (falling) { L.hip.rotation.x = -0.35; L.knee.rotation.x = 0.45; }    // reach for the floor
    } else {
      const walk = moving ? 1 : 0;
      L.hip.rotation.x = -0.1 - rk * 0.35 - land * 0.5 + ph * stride * walk;
      L.knee.rotation.x = 0.18 + rk * 0.55 + land * 0.95 + Math.max(0, -ph) * (0.35 + run * 1.2) * walk
        + (!moving ? Math.max(0, Math.sin(t * 0.9 + i * Math.PI)) * 0.06 : 0);   // idle weight shift
      L.hip.rotation.z = (i === 0 ? -1 : 1) * rk * 0.12;                         // wider base when ready
    }
  }
  for (let i = 0; i < 2; i++) {
    const A = p.arms[i];
    const ph = i === 0 ? -sw : sw;
    A.el.rotation.z = 0;
    if (air) {
      A.sh.rotation.x = rising ? -1.4 : -0.7; A.sh.rotation.z = A.sx * (0.55 + tuck * 0.3); A.el.rotation.x = -0.5;
    } else {
      A.sh.rotation.x = (moving ? ph * (0.15 + run * 0.85) : 0.05 * breathe) - rk * 0.25;
      A.sh.rotation.z = A.sx * (0.12 + rk * 0.38 + run * 0.04);
      A.el.rotation.x = -0.3 - run * 0.95 - rk * 0.35;
    }
  }
  const bob = air ? 0 : Math.abs(Math.cos(p.phase)) * 0.04 * run;
  const toes = !air && rk > 0.5 && !moving ? Math.abs(Math.sin(t * 7)) * 0.018 : 0;     // bouncing on the toes
  p.body.position.y = p.y + bob + toes - (air ? 0 : 0.03 + rk * 0.07 + land * 0.12) + breathe * 0.004;
  p.body.rotation.x = run * 0.24 + rk * 0.16 + land * 0.12;    // lean into the run / ready crouch
  p.body.rotation.y = moving ? sw * 0.07 * run : 0;            // hips/shoulders counter-rotate a little
  p.body.rotation.z = 0; p.body.position.z = 0;
  p.body.position.x = !moving && !air ? Math.sin(t * 0.9) * 0.012 : 0;   // idle sway
  if (p.charging && !p.action) {          // wind-up: kicking leg drawn back
    const [, L1] = p.legs;
    L1.hip.rotation.x = 0.5; L1.knee.rotation.x = 0.75;
  }
  // head follows the ball
  if (p.headG) {
    let yawT = 0, pitchT = 0;
    if (p.lookAtBall && typeof ball !== 'undefined' && (ballLive || match.phase === 'serve-toss')) {
      const dx = ball.x - p.pos.x, dz = ball.z - p.pos.z, dh = Math.hypot(dx, dz);
      let a = Math.atan2(dx, dz) - p.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
      yawT = THREE.MathUtils.clamp(a, -1.0, 1.0);
      pitchT = THREE.MathUtils.clamp(-Math.atan2(ball.y - (p.y + 1.62), Math.max(0.4, dh)), -0.7, 0.35);
    }
    p.headG.rotation.y += (yawT - p.headG.rotation.y) * Math.min(1, dt * 8);
    p.headG.rotation.x += (pitchT - p.headG.rotation.x) * Math.min(1, dt * 8);
  }
  if (p.action) {
    p.action.t += dt;
    const u = p.action.t / (ACTION_DURS[p.action.part] || ACTION_DUR);
    if (u >= 1) p.action = null;
    else {
      // quick snap in, short hold, eased follow-through out
      const e = u < 0.25 ? sstep(u / 0.25) : u < 0.45 ? 1 : 1 - sstep((u - 0.45) / 0.55);
      actionPose(p, p.action.part, e, u);
    }
  }
  p.yaw.rotation.y = p.facing;
  p.root.position.set(p.pos.x, 0, p.pos.z);
  p.ring.scale.setScalar(1 - Math.min(0.45, p.y * 0.45));
}

/* =====================================================================
   Field zones + boundaries
   ===================================================================== */
function zoneOf(p) {
  const s = sideSign(p.side);
  const cx = -s * (F.hl - F.serveFromBack); // own service circle
  if (Math.hypot(p.pos.x - cx, p.pos.z) <= F.serveR + 0.05) return 'serve';
  if (Math.abs(p.pos.x) <= F.hl && Math.abs(p.pos.z) <= F.hw) return 'court';
  return 'free';
}

function applyBoundaries(p) {
  const s = sideSign(p.side);
  const xBack = F.outX - PLAYER_R - 0.06;
  // own half only — the centre line / net plane can't be crossed
  if (s > 0) p.pos.x = THREE.MathUtils.clamp(p.pos.x, -xBack, -NET_GAP);
  else p.pos.x = THREE.MathUtils.clamp(p.pos.x, NET_GAP, xBack);
  const zMax = F.outZ - PLAYER_R - 0.06;
  p.pos.z = THREE.MathUtils.clamp(p.pos.z, -zMax, zMax);
  // net posts
  for (const sz of [-1, 1]) {
    const dx = p.pos.x, dz = p.pos.z - sz * F.postZ;
    const d = Math.hypot(dx, dz), min = PLAYER_R + 0.05;
    if (d < min && d > 1e-5) { p.pos.x = (dx / d) * min; p.pos.z = sz * F.postZ + (dz / d) * min; }
  }
}

function spawnPoint(side) {
  // stand just behind your service circle, like the tekong
  return new THREE.Vector3(-sideSign(side) * (F.hl - F.serveFromBack + 0.6), 0, 0);
}

const RING_COLORS = {
  free: new THREE.Color(0xf2b544).multiplyScalar(RING_GLOW),
  serve: new THREE.Color(0x9fdcff).multiplyScalar(RING_GLOW),
};
function updateRing(p) {
  const z = zoneOf(p);
  if (z === 'court') p.ringMat.color.set(p.team.jersey).multiplyScalar(RING_GLOW);
  else p.ringMat.color.copy(RING_COLORS[z]);
  return z;
}

/* =====================================================================
   Input
   ===================================================================== */
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (!e.repeat) onActionKey(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* =====================================================================
   Simulation
   ===================================================================== */
let me = null, them = null, playing = false;
// ---- teams (2v2 / 3v3, spots may be left empty). In 1v1 none of this is touched: fmt stays '1v1' and `others` stays empty ----
let fmt = '1v1';                  // room format chosen by the host
let roster = [];                  // [{ side, pos: 'front'|'back'|'solo', kind: 'open'|'human'|'cpu', id, name }]
let myId = 'h';
const others = new Map();         // id → player (everyone but me) in a team game; `them` points at the opponent in focus
const teamMode = () => fmt !== '1v1';
const allPlayers = () => [me, ...others.values()].filter(Boolean);
const onSide = (side) => allPlayers().filter((p) => p.side === side).sort((a, b) => (a.id < b.id ? -1 : 1));
const playerById = (id) => (me && id === myId ? me : others.get(id) || null);
const iServe = () => !!me && match.server === me.side && (!teamMode() || match.serverId === myId);
function teamSpawn(side, pos) {
  const s = sideSign(side);
  const kl = F.hl / 7.7, kw = F.hw / 3.5;
  if (pos === 'fl') return new THREE.Vector3(-s * 2.6 * kl, 0, -s * 2.3 * kw);
  if (pos === 'fr') return new THREE.Vector3(-s * 2.6 * kl, 0, s * 2.3 * kw);
  if (pos === 'front') return new THREE.Vector3(-s * 2.2, 0, -s * 1.2);
  if (pos === 'back') return new THREE.Vector3(-s * (F.hl - F.serveFromBack + 0.6), 0, s * 1.2);
  return spawnPoint(side);
}
const WALK = 4.0, ACCEL = 28, JUMP_V = 7.6, GRAV = 17;   // jump apex ≈ 1.7 m — big midair attacks
// (no dash — reaching the ball is about reading it early and moving)
let jumpQueued = false;        // a grounded L at the net jumps you into the block
let lastZone = '';
let stepDust = 0;

function updateLocal(dt) {
  if (!me) return;
  let fwd = 0, right = 0;
  if (keys.has('KeyW')) fwd += 1;
  if (keys.has('KeyS')) fwd -= 1;
  if (keys.has('KeyA')) right -= 1;
  if (keys.has('KeyD')) right += 1;
  const locked = serveLocked();          // the server stays planted in the circle until the kick
  if (locked) { fwd = 0; right = 0; jumpQueued = false; }
  const sgn = sideSign(me.side);
  const ix = fwd * sgn, iz = right * sgn;
  const len = Math.hypot(ix, iz);
  {
    const tx = len ? (ix / len) * WALK : 0, tz = len ? (iz / len) * WALK : 0;
    const a = Math.min(1, (ACCEL * dt) / WALK);
    me.vel.x += (tx - me.vel.x) * a;
    me.vel.z += (tz - me.vel.z) * a;
  }

  const px = me.pos.x, pz = me.pos.z;
  me.pos.x += me.vel.x * dt;
  me.pos.z += me.vel.z * dt;
  applyBoundaries(me);
  // kill velocity into walls so you don't "stick"
  if (dt > 0) { me.vel.x = (me.pos.x - px) / dt * 0.999 || 0; me.vel.z = (me.pos.z - pz) / dt * 0.999 || 0; }

  if ((keys.has('Space') || jumpQueued) && me.y <= 0 && !locked) { me.vy = JUMP_V; sfx.jump(); fx.dust(me.pos.x, me.pos.z, 18); fx.ring(me.pos.x, me.pos.z, { color: 0x9fb4c8, r: 1.0, life: 0.35, bright: 0.8 }); }
  jumpQueued = false;
  const wasAir = me.y > 0;
  me.vy -= GRAV * dt;
  me.y = Math.max(0, me.y + me.vy * dt);
  if (me.y === 0 && me.vy < 0) me.vy = 0;
  if (wasAir && me.y === 0) { sfx.land(); fx.dust(me.pos.x, me.pos.z, 16); shake(0.06); }
  stepDust += Math.hypot(me.vel.x, me.vel.z) * dt;
  if (me.y === 0 && stepDust > 0.9) { stepDust = 0; fx.dust(me.pos.x, me.pos.z, 3); }
  if (locked) me.facing = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;

  const speed = Math.hypot(me.vel.x, me.vel.z);
  if (speed > 0.3) {
    let d = Math.atan2(me.vel.x, me.vel.z) - me.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    me.facing += d * Math.min(1, dt * 14);
  }
  animatePlayer(me, speed, dt);

  const zone = updateRing(me);
  if (zone !== lastZone) {
    lastZone = zone;
    ui.zone.textContent = zone === 'serve' ? 'Service circle' : zone === 'court' ? 'In court' : 'Free zone';
    ui.zone.className = 'zone-chip' + (zone === 'free' ? ' out' : zone === 'serve' ? ' serve' : '');
  }
}

function updateRemote(dt) {
  if (teamMode()) {
    for (const p of others.values()) if (p.kind === 'remote' && p.target) interpRemote(p, dt);
    them = focusOpponent();
    return;
  }
  if (mode === 'cpu') return;                       // the CPU moves itself (updateCPU)
  if (!them || !them.target) return;
  interpRemote(them, dt);
}
// team games: the opponent "in focus" (whose aim / attack warning you see) is their server, else whoever is nearest the ball
function focusOpponent() {
  const opp = [...others.values()].filter((p) => p.side !== me.side);
  if (!opp.length) return null;
  if ((match.phase === 'serve-wait' || match.phase === 'serve-toss') && match.server !== me.side) {
    const sv = others.get(match.serverId);
    if (sv) return sv;
  }
  let best = opp[0], bd = Infinity;
  for (const p of opp) { const d = Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function interpRemote(them, dt) {
  const t = them.target;
  const k = 1 - Math.exp(-dt * 14);
  const px = them.pos.x, pz = them.pos.z;
  them.pos.x += (t.x - them.pos.x) * k;
  them.pos.z += (t.z - them.pos.z) * k;
  them.y += (t.y - them.y) * k;
  let d = t.r - them.facing;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  them.facing += d * k;
  const speed = dt > 0 ? Math.hypot(them.pos.x - px, them.pos.z - pz) / dt : 0;
  animatePlayer(them, Math.max(speed, t.s * 0.85), dt);
  updateRing(them);
}

/* =====================================================================
   BALL + MATCH
   Rules: max 3 touches per side (one player may take all 3), ball down in
   your court = you lose the point, out / net / under / outside the side
   tapes = the last toucher loses. Serve from the service circle, serve
   passes every 3 points, first to 7 wins.
   ===================================================================== */
const ACTION_DUR = 0.34;
const REACH = 1.0;                // how far (m) from your body you can play the ball
const BALL_VIS = 3.0;             // drawn much larger than life (≈ the old glow) so it reads from the fixed camera
const BALL_VR = P.BALL_R * BALL_VIS;
const BALL_TIME = 0.78;           // ball physics runs at 78% speed — slower, readable rallies
const PERFECT = 0.06;             // perfect window (ball-time seconds)
const other = (s) => (s === 'left' ? 'right' : 'left');
const WIN_SCORE = 7;              // first to 7 points takes the game

// ---- visuals ----
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f5c02e'; g.fillRect(0, 0, 256, 128);
  g.lineWidth = 9;
  for (let i = -8; i < 16; i++) {
    g.strokeStyle = i % 2 ? '#e2452c' : '#f7d35a';
    g.beginPath(); g.moveTo(i * 22, 0); g.lineTo(i * 22 + 128, 128); g.stroke();
    g.strokeStyle = i % 2 ? '#f7d35a' : '#2c6fd6';
    g.beginPath(); g.moveTo(i * 22 + 128, 0); g.lineTo(i * 22, 128); g.stroke();
  }
  g.fillStyle = 'rgba(20,10,4,0.55)';
  for (let y = 11; y < 128; y += 22) for (let x = (y / 22) % 2 ? 0 : 11; x < 256; x += 22) {
    g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(P.BALL_R * BALL_VIS, 28, 18),
  new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.4, emissive: 0x6a4200, emissiveIntensity: 0.9 })
);
ballMesh.visible = false;
scene.add(ballMesh);
const ballXray = new THREE.Mesh(ballMesh.geometry, new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffd27a).multiplyScalar(1.2), transparent: true, opacity: 0.4, depthTest: false, depthWrite: false,
}));
ballXray.renderOrder = 25;
ballMesh.add(ballXray);
// side colour halo around the ball (team colour of whichever half it's over)
const ballHalo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
}));
ballHalo.renderOrder = 24;
ballHalo.scale.setScalar(1.6);
ballMesh.add(ballHalo);
// thin outline: a slightly bigger back-face shell in the side colour
const ballOutline = new THREE.Mesh(ballMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
ballOutline.scale.setScalar(1.13);
ballOutline.visible = false;
ballMesh.add(ballOutline);

/* ---------------- whose side is the ball on? Light up that half in its team colour ---------------- */
const sideGlow = {};
function buildSideGlow() {
  for (const k of Object.keys(sideGlow)) { scene.remove(sideGlow[k].g); delete sideGlow[k]; }
  const halves = sideGlow;
  for (const side of ['left', 'right']) {
    const s = sideSign(side);
    const g = new THREE.Group();
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(F.hl, F.W), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    wash.rotation.x = -Math.PI / 2;
    wash.position.set(-s * F.hl / 2, 0.011, 0);
    g.add(wash);
    // bright outline of that half
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const t = 0.09, y = 0.013;
    for (const [w, d, x, z] of [[F.hl, t, -s * F.hl / 2, F.hw], [F.hl, t, -s * F.hl / 2, -F.hw], [t, F.W, -s * F.hl, 0], [t, F.W, -s * 0.05, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
      g.add(m);
    }
    g.visible = false;
    scene.add(g);
    halves[side] = { g, wash, lineMat, a: 0 };
  }
  return halves;
}
buildSideGlow();
function teamColor(side) {
  const p = playerBySide(side);
  return p ? p.team.jersey : (me && side === me.side ? TEAMS.me.jersey : TEAMS.opp.jersey);
}
let lastBallSide = null;
const ballTint = new THREE.Color(0xffffff), _tc = new THREE.Color();
// THEIR AIM: a red X on my court — only while the ball is theirs to play (gone the moment they hit it)
const oppAimShadow = (() => {
  const g = new THREE.Group();
  // a red diamond — same shape as your blue aim diamond, in their colour
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b30).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const outMat = mat.clone();
  const dia = (r, m) => { const sh = new THREE.Shape(); sh.moveTo(0, r); sh.lineTo(r, 0); sh.lineTo(0, -r); sh.lineTo(-r, 0); sh.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 19; return mesh; };
  g.add(dia(0.26, outMat));
  const fill = dia(0.16, mat); fill.position.y = 0.001; g.add(fill);
  g.userData.outMat = outMat;
  g.position.y = 0.02;
  g.visible = false;
  g.userData.mat = mat;
  scene.add(g);
  return g;
})();
function updateOppAim(dt) {
  const t = them && them.aim;
  const theirTurn = !!me && !!them && playing && mode !== 'solo' && (
    ((match.phase === 'serve-wait' || match.phase === 'serve-toss') && match.server === them.side) ||
    (ballLive && match.phase === 'rally' && P.sideOfX(ball.x) === them.side &&
      !(landingCache && P.sideOfX(landingCache.x) === me.side)));         // once it's heading to me, the drop zone takes over
  const mat = oppAimShadow.userData.mat;
  mat.opacity += ((t && theirTurn ? 0.95 : 0) - mat.opacity) * Math.min(1, dt * 10);
  oppAimShadow.visible = mat.opacity > 0.02;
  oppAimShadow.userData.outMat.opacity = mat.opacity * 0.55;
  if (t) {
    if (mat.opacity < 0.05) oppAimShadow.position.set(t.x, 0.02, t.z);
    else { oppAimShadow.position.x += (t.x - oppAimShadow.position.x) * Math.min(1, dt * 10); oppAimShadow.position.z += (t.z - oppAimShadow.position.z) * Math.min(1, dt * 10); }
  }
}

// DROP ZONE: where the ball in the air will land (dashed ring, shrinks as it falls) + a dashed line from the ball.
// Blue = coming to you · white = lands on their side · grey with an X = going out · dig zone (green when you're in it).
function dashedRingTexture(withX) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 14; g.setLineDash([26, 18]);
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]); g.lineWidth = 12;
  if (withX) { g.beginPath(); g.moveTo(92, 92); g.lineTo(164, 164); g.moveTo(164, 92); g.lineTo(92, 164); g.stroke(); }
  else { g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 14, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const dropZone = (() => {
  const texIn = dashedRingTexture(false), texOut = dashedRingTexture(true);
  const mat = new THREE.MeshBasicMaterial({ map: texIn, transparent: true, depthWrite: false, depthTest: false });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 21; ring.visible = false;
  scene.add(ring);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.5, depthTest: false });
  const line = new THREE.Line(lineGeo, lineMat);
  line.renderOrder = 21; line.visible = false; line.frustumCulled = false;
  scene.add(line);
  return { ring, mat, texIn, texOut, line, lineGeo, lineMat, spin: 0 };
})();
function updateDropZone(dt) {
  const D = dropZone;
  const show = !!me && playing && ballLive && match.phase === 'rally' && !!landingCache;
  D.ring.visible = show;
  D.line.visible = false;                         // (no line from the ball — just the ring)
  if (!show) return;
  const Lc = landingCache;
  const out = Lc.type === 'board' || !P.inCourt(Lc.x, Lc.z);
  const mine = !out && P.sideOfX(Lc.x) === me.side;
  const dig = smashWarn.on && smashIncoming();
  let col, r, a;
  if (dig) { col = smashWarn.inPos ? 0x4fdc86 : 0x3d8bff; r = RX_R; a = 1; }
  else if (mine) { col = 0x3d8bff; a = 1; }
  else if (out) { col = 0xa0a0a8; a = 0.75; }
  else { col = 0xffffff; a = 0.6; }
  if (!dig) r = 0.3 + THREE.MathUtils.clamp(ball.y / 6, 0, 1) * 0.8;      // closes in as the ball comes down
  D.mat.map = out && !dig ? D.texOut : D.texIn;
  D.mat.color.set(col).multiplyScalar(mine || dig ? 1.5 : 1.2);
  D.mat.opacity = a;
  D.spin += dt * (dig ? 1.6 : 0.6);
  D.ring.position.set(Lc.x, 0.022, Lc.z);
  D.ring.rotation.z = D.spin;
  D.ring.scale.set(r * 2, r * 2, 1);
  if (dig) D.ring.scale.multiplyScalar(1 + Math.sin(performance.now() / 70) * 0.04);
  else if (match.lastPart === 'serve-hang') D.ring.scale.multiplyScalar(1 + Math.sin(performance.now() / 260) * 0.12);
  else if (match.lastPart === 'serve-snap') D.ring.scale.multiplyScalar(0.85);
  const p = D.lineGeo.attributes.position;
  p.setXYZ(0, ball.x, Math.max(ball.y, 0.05), ball.z); p.setXYZ(1, Lc.x, 0.03, Lc.z);
  p.needsUpdate = true;
  D.line.computeLineDistances();
  D.lineMat.color.copy(D.mat.color);
  D.lineMat.opacity = mine || dig ? 0.6 : 0.35;
}

function updateSideGlow(dt) {
  const show = !!me && playing && (ballLive || match.phase === 'serve-wait' || match.phase === 'serve-toss');
  const side = show ? P.sideOfX(ball.x) : null;
  for (const k of ['left', 'right']) {
    const H = sideGlow[k];
    H.g.visible = !!me && playing;
    H.wash.material.blending = THREE.NormalBlending;
    H.wash.material.color.set(me && k === me.side ? 0x3d8bff : 0xff3b30);
    H.wash.material.opacity = me && k === me.side ? 0.14 : 0.42;   // match the scoreboard: your half blue, theirs red
    H.lineMat.opacity = 0;
  }
  ballHalo.material.opacity = 0;
  // ball keeps its normal look; a thin outline is BLUE on your side and RED on theirs
  ballMesh.material.color.set(0xffffff);
  ballMesh.material.emissive.set(0x6a4200);
  // outline foreshadows where it will LAND: your colour = your court, their colour = theirs, white = out
  let oc = null;
  if (ballLive && landingCache) {
    const out = landingCache.type === 'board' || !P.inCourt(landingCache.x, landingCache.z);
    oc = out ? 0xffffff : P.sideOfX(landingCache.x) === me.side ? 0x3d8bff : null;   // blue = coming to you, white = going out, nothing otherwise
  } else if (side) oc = side === me.side ? 0x3d8bff : null;        // held for the serve, etc.
  ballOutline.visible = oc !== null;
  if (oc !== null) ballOutline.material.color.set(oc).multiplyScalar(oc === 0xffffff ? 1.6 : 1.4);
  const chip = null;   // (the YOUR / THEIR BALL chip was removed — the ball colour says it)
  if (chip) {
    if (!side) chip.classList.add('hidden');
    else {
      chip.classList.remove('hidden');
      const mine = side === me.side;
      chip.textContent = mine ? 'YOUR BALL' : 'THEIR BALL';
      chip.style.setProperty('--sc', '#' + new THREE.Color(teamColor(side)).getHexString());
      chip.classList.toggle('mine', mine);
      if (side !== lastBallSide && lastBallSide !== null) { chip.classList.remove('flip'); void chip.offsetWidth; chip.classList.add('flip'); }
    }
  }
  lastBallSide = side;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}
// timing ring: shrinks onto the ball as the perfect moment arrives
const timingRing = new THREE.Sprite(new THREE.SpriteMaterial({
  map: ringTexture(), color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
}));
timingRing.renderOrder = 30;
timingRing.visible = false;
scene.add(timingRing);

const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.3, 28),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.visible = false;
scene.add(ballShadow);

function flatRing(r0, r1, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
// predicted landing spot
const landMark = new THREE.Group();
// where the ball will actually land: a clear white ring + dot, drawn above court tints and aim spots
for (const m of [flatRing(0.3, 0.38, new THREE.Color(0xffffff).multiplyScalar(1.5), 0.95), flatRing(0.0, 0.08, new THREE.Color(0xffffff).multiplyScalar(1.5), 0.95), flatRing(0.38, 0.42, 0x000000, 0.5)]) {
  m.material.depthTest = false; m.renderOrder = 20; landMark.add(m);
}
landMark.position.y = 0.02;
landMark.visible = false;
scene.add(landMark);

// K aim arrow: dashed chevrons from the player to the aim point (red while sweeping, white once locked)
const aimArrow = (() => {   // (no longer shown — aiming uses the nine-spot dot)
  const N = 16;
  const geo = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.18); sh.lineTo(0.19, -0.05); sh.lineTo(0.11, -0.05); sh.lineTo(0, 0.08); sh.lineTo(-0.11, -0.05); sh.lineTo(-0.19, -0.05); sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const group = new THREE.Group();
  const chev = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3434, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.y = 0.016;
    group.add(m); chev.push(m);
  }
  const tip = flatRing(0.24, 0.32, 0xff3434, 0.9);
  tip.position.y = 0.016;
  group.add(tip);
  group.visible = false;
  scene.add(group);
  let scroll = 0;
  return {
    show(fromX, fromZ, toX, toZ, locked, dt, alpha = 1) {
      group.visible = true;
      const dx = toX - fromX, dz = toZ - fromZ, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L, ang = Math.atan2(ux, uz);
      scroll = (scroll + dt * 1.8) % 1;
      const col = new THREE.Color(locked ? 0xffffff : 0xff3434).multiplyScalar(locked ? 1.3 : 1.6);   // red while sweeping, white once picked
      for (let i = 0; i < N; i++) {
        const dist = 0.7 + (i + scroll) * 0.55, m = chev[i];
        if (dist > L - 0.3) { m.visible = false; continue; }
        m.visible = true;
        m.position.set(fromX + ux * dist, 0.016, fromZ + uz * dist);
        m.rotation.y = ang + Math.PI;
        m.material.color.copy(col);
        m.material.opacity = 0.95 * alpha * Math.min(1, dist / 1.2);
      }
      tip.position.set(toX, 0.016, toZ);
      tip.material.color.copy(col);
      tip.scale.setScalar(locked ? 1.25 : 1);
      tip.material.opacity = 0.9 * alpha;
    },
    hide() { group.visible = false; },
  };
})();

let showLanding = true;
try { showLanding = localStorage.getItem('takraw-landing2') !== '0'; } catch {}   // (new key: back on for everyone)

/* ---------------- particles, shockwaves, shake ---------------- */
const fx = (() => {
  const MAX = 3200;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), grav = new Float32Array(MAX);
  const base = new Float32Array(MAX * 4);
  let head = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (420.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  const rings = [];
  const C = new THREE.Color();
  function emit(x, y, z, { n = 10, color = 0xffffff, bright = 1.6, speed = 2.5, up = 1.5, spread = 1, life: L = 0.6, size: S = 0.09, g = 6 } = {}) {
    const pal = Array.isArray(color) ? color : null;
    if (!pal) C.set(color).multiplyScalar(bright);
    n = Math.max(1, Math.round(n * QUALITY_PARTICLES()));
    alive += n;
    for (let k = 0; k < n; k++) {
      if (pal) C.set(pal[(Math.random() * pal.length) | 0]).multiplyScalar(bright);
      const i = head; head = (head + 1) % MAX;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      vel[i * 3] = Math.cos(a) * r * speed; vel[i * 3 + 1] = up * (0.4 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * r * speed;
      life[i] = maxLife[i] = L * (0.6 + Math.random() * 0.6);
      grav[i] = g;
      size[i] = S * (0.6 + Math.random() * 0.8);
      base[i * 4] = C.r; base[i * 4 + 1] = C.g; base[i * 4 + 2] = C.b; base[i * 4 + 3] = 1;
    }
  }
  function ring(x, z, { color = 0xffffff, r = 1.4, life: L = 0.45, bright = 1.6 } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(bright), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
    rings.push({ m, t: 0, L, r });
  }
  let alive = 0;
  function update(dt) {
    if (alive === 0 && !rings.length) return;            // nothing on screen: no work, no GPU upload
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0; continue; }
      live++;
      life[i] -= dt;
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.7; vel[i * 3 + 2] *= 0.7; }
      const k = Math.max(0, life[i] / maxLife[i]);
      col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = k;
    }
    alive = live;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    for (let j = rings.length - 1; j >= 0; j--) {
      const R = rings[j];
      R.t += dt;
      const u = R.t / R.L;
      if (u >= 1) { scene.remove(R.m); R.m.geometry.dispose(); R.m.material.dispose(); rings.splice(j, 1); continue; }
      R.m.scale.setScalar(0.2 + u * R.r);
      R.m.material.opacity = 1 - u;
    }
  }
  // quick additive flash (a bright pop at the contact point)
  const flashes = [];
  function flash(x, y, z, { color = 0xffffff, size = 1.6, life: L = 0.18 } = {}) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(2.2),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(size * 0.4);
    scene.add(sp); flashes.push({ sp, t: 0, L, size });
  }
  const _upd = update;
  function updateAll(dt) {
    _upd(dt);
    for (let j = flashes.length - 1; j >= 0; j--) {
      const f = flashes[j]; f.t += dt;
      const u = f.t / f.L;
      if (u >= 1) { scene.remove(f.sp); f.sp.material.dispose(); flashes.splice(j, 1); continue; }
      f.sp.scale.setScalar(f.size * (0.4 + u * 0.9)); f.sp.material.opacity = 1 - u;
    }
  }
  return {
    emit, ring, flash, update: updateAll,
    dust: (x, z, n = 8) => emit(x, 0.05, z, { n, color: 0x9fb4c8, bright: 0.5, speed: 1.4, up: 0.8, life: 0.45, size: 0.12, g: 2 }),
  };
})();

let trauma = 0;
const shake = (a) => { trauma = Math.min(1, trauma + a); };

// stereo position of a world point (for sound panning)
const _pv = new THREE.Vector3();
function panOf(x, y, z) {
  _pv.set(x, y, z).project(camera);
  return THREE.MathUtils.clamp(_pv.x * 0.8, -1, 1);
}

/* ---------------- state ---------------- */
const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };
let ballLive = false;
const deadBall = { on: false };                 // cosmetic bounce after a rally ends
const match = {
  phase: 'idle',        // idle (practice) | wait | serve-wait | serve-toss | rally | point | over
  rally: 0, score: { left: 0, right: 0 },
  server: 'left', serveCount: 0,
  poss: null, cnt: 0, last: null, settled: false,
  winner: null, reason: '', over: false,
};
let simTime = 0, acc = 0, pending = null, touchCd = 0, pointTimer = 0;
let frozenEnd = null, frozenTimer = 0, rtt = 80;
const hist = [];
let jQ = false, kQ = false, fQ = false, lQ = false;
let cueArmed = true;
let lastWhoosh = 0;
let landingCache = null, landingDirty = true;   // ball flight is deterministic: predict once per change

const isAuthority = () => mode !== 'guest';
const decidesHalf = (half) => mode === 'solo' || mode === 'cpu' || (me && me.side === half) ||
  (teamMode() && mode === 'host' && !onSide(half).some((p) => p === me || p.kind === 'remote'));   // a CPU-only half: the host calls it
const playerBySide = (side) => (me && me.side === side ? me : them && them.side === side ? them : null);
const serveLocked = () => !!me && (match.phase === 'serve-wait' || match.phase === 'serve-toss') && iServe();

function setBall(b) {
  ball.x = b.x; ball.y = b.y; ball.z = b.z; ball.vx = b.vx; ball.vy = b.vy; ball.vz = b.vz;
  hist.length = 0; pending = null; acc = 0; deadBall.on = false; approach = null; ballFire = false; landingDirty = true; ballSerial++;
  pendingCross = null;
}
const packBall = () => [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].map((v) => +v.toFixed(4));
const unpackBall = (a) => ({ x: a[0], y: a[1], z: a[2], vx: a[3], vy: a[4], vz: a[5] });

function onActionKey(code) {
  if (code === 'KeyH' || code === 'Slash') { toggleHelp(); return; }
  if (code === 'Escape') { toggleHelp(false); return; }
  if (code === 'KeyN') { setMuted(!sfx.muted); return; }
  if (!playing || helpOpen()) return;
  if (training && /^(Digit|Numpad)[1-6]$/.test(code)) { setDrill(DRILLS[+code.slice(-1) - 1]); return; }
  if (code === 'ArrowUp') aimStep(1, 0);
  if (code === 'ArrowDown') aimStep(-1, 0);
  if (code === 'ArrowLeft') aimStep(0, -1);
  if (code === 'ArrowRight') aimStep(0, 1);
  if (code === 'KeyJ') jQ = true;      // serve flow, or start charging a set
  if (code === 'KeyK') kQ = true;      // start charging a kick
  if (code === 'KeyL') lQ = true;      // active block at the net
  if (code === 'KeyF') fQ = true;
}
function setLanding(v) {
  showLanding = v;
  try { localStorage.setItem('takraw-landing2', v ? '1' : '0'); } catch {}
  const box = document.getElementById('opt-landing');
  if (box) box.checked = v;
}
function setMuted(v) {
  sfx.setMuted(v);
  const box = document.getElementById('opt-sound');
  if (box) box.checked = !v;
}

/* ---------------- aim (arrow keys only — WASD never aims) ---------------- */
function aimAxes() {
  let depth = 0, lat = 0;
  if (keys.has('ArrowUp')) depth += 1;
  if (keys.has('ArrowDown')) depth -= 1;
  if (keys.has('ArrowLeft')) lat -= 1;
  if (keys.has('ArrowRight')) lat += 1;
  return { depth, lat };
}
// AIM: nine spots on their court (3 rows × 3 columns). Default = middle-centre.
// Arrow keys step your aim around the grid any time (↑ deeper, ↓ shorter, ← / → sideways, combos go diagonal).
// A dot on their side shows where you'll hit — only you can see it. It resets to centre after each kick.
const AIM_ROWS = [1.6, 4.0, 6.6];        // front, middle, back (m from the net) — scaled for the 3v3 court
const AIM_COLS = [-2.4, 0, 2.4];         // left, centre, right (your screen)
const AIM_ROWS0 = AIM_ROWS.slice(), AIM_COLS0 = AIM_COLS.slice();
const AIM_NAMES = [['FRONT LEFT', 'FRONT CENTER', 'FRONT RIGHT'], ['SIDE LEFT', 'CENTER', 'SIDE RIGHT'], ['BACK LEFT', 'BACK CENTER', 'BACK RIGHT']];
const aimCell = { row: 1, col: 1 };
let aimFlash = 0;
function resetAim() { aimCell.row = 1; aimCell.col = 1; }
function aimStep(dr, dc) {
  aimCell.row = THREE.MathUtils.clamp(aimCell.row + dr, 0, 2);
  aimCell.col = THREE.MathUtils.clamp(aimCell.col + dc, 0, 2);
  aimFlash = 1.2;
  sfx.aim();
}
function aimTarget(p) {
  const s = sideSign(p.side);
  return { x: s * AIM_ROWS[aimCell.row], z: s * AIM_COLS[aimCell.col] };
}
// the dot + (briefly) all nine spots, drawn on their side only on your screen
const aimDot = (() => {
  const g = new THREE.Group();
  // YOUR AIM: a small blue diamond on their court (it only ever shows your aim)
  const dia = (r, a) => { const sh = new THREE.Shape(); sh.moveTo(0, r); sh.lineTo(r, 0); sh.lineTo(0, -r); sh.lineTo(-r, 0); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3d8bff).multiplyScalar(a), transparent: true, depthWrite: false, depthTest: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 19; return m; };
  const ring = dia(0.26, 1.0);                 // outline (back)
  ring.material.opacity = 0.55;
  const dot = dia(0.16, 1.5);                  // fill (front)
  dot.position.y = 0.001;
  g.add(ring, dot);
  g.position.y = 0.018;
  const spots = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const m = flatRing(0.2, 0.25, 0xffffff, 0.0);
    m.position.y = 0.017;
    spots.push({ m, r, c }); scene.add(m);
  }
  g.visible = false;
  scene.add(g);
  return { g, ring, spots };
})();
function updateAim(dt) {
  const show = !!me && playing;
  aimDot.g.visible = show;
  aimFlash = Math.max(0, aimFlash - dt);
  for (const sp of aimDot.spots) sp.m.visible = show && aimFlash > 0;
  if (!show) return;
  const s = sideSign(me.side);
  const t = aimTarget(me);                                          // only ever your aim (landings use the drop zone)
  const k = Math.min(1, dt * 10);
  aimDot.g.position.x += (t.x - aimDot.g.position.x) * k;
  aimDot.g.position.z += (t.z - aimDot.g.position.z) * k;
  aimDot.g.position.y = 0.018;
  aimDot.ring.scale.setScalar(1 + Math.sin(performance.now() / 170) * 0.08);
  for (const sp of aimDot.spots) {
    sp.m.position.set(s * AIM_ROWS[sp.r], 0.017, s * AIM_COLS[sp.c]);
    sp.m.material.opacity = Math.min(1, aimFlash) * 0.45;
  }
}
// J target: the ball goes up HIGH and out into open space so you have to move under it.
// Control (1st touch): ~2 m toward the net and ~1.6 m to one side.
// Set (later touches): up at the spike spot ~1.4 m from the net, ~1 m to one side.
// Sideways: toward the middle if you're near a sideline, otherwise alternating — ← → choose the side.
let setFlip = 1;
function setTarget(p, isSet) {
  const s = sideSign(p.side);
  let dir;
  if (Math.abs(p.pos.z) > 1.0) dir = -Math.sign(p.pos.z);
  else dir = (setFlip = -setFlip);
  let x = isSet ? -s * 1.4 : p.pos.x + s * 2.6;   // control lands further from you — make them run
  x = s > 0 ? THREE.MathUtils.clamp(x, -(F.hl - 0.6), -1.0) : THREE.MathUtils.clamp(x, 1.0, F.hl - 0.6);
  const z = THREE.MathUtils.clamp(p.pos.z + dir * (isSet ? 1.6 : 2.4), -(F.hw - 0.4), F.hw - 0.4);
  return { x, z };
}
const bodyPart = (hr) => (hr < 0.95 ? 'foot' : hr < 1.25 ? 'knee' : hr < 1.6 ? 'chest' : 'head');
// snap: flat and quick · hang: high and floaty
// FEINT: a soft chip off a spike jump that drops just over the net (green tight & low, yellow deeper & higher, red net or sitter)
function feintShot(from, side, aimZ, tier) {
  const s = sideSign(side);
  const z = THREE.MathUtils.clamp(aimZ, -2.4, 2.4);
  if (tier === 0) return Math.random() < 0.5
    ? P.solveApex(from, { x: s * 0.4, z }, Math.max(from.y - 0.2, 1.3), false)                 // dies in the net
    : P.solveApex(from, { x: s * (2.6 + Math.random()), z: z * 0.5 }, from.y + 1.6, true);     // floats up as a sitter
  const [ox, oz] = jitter(tier === 2 ? 0.15 : 0.4);
  const x = s * (tier === 2 ? 1.0 + Math.random() * 0.3 : 1.6 + Math.random() * 0.6) + ox;
  return P.solveApex(from, { x, z: z + oz }, Math.max(from.y + 0.2, 2.1) + (tier === 2 ? 0 : 0.5), true);
}
const serveApex = (part, tier) => (part === 'serve-hang' ? (tier === 2 ? 4.6 : 5.0) : (tier === 2 ? 2.45 : 2.9));
const PART_NAME = { dink: 'Feint', 'serve-snap': 'Snap serve', 'serve-hang': 'Hang serve', clear: 'Clear', smash: 'Smash', ult: 'ULTIMATE SPIN KICK', bicycle: 'Bicycle kick', dheader: 'Diving header', volley: 'Scissor volley', shank: 'Shank', 'serve-power': 'Power serve', foot: 'Inside foot', knee: 'Knee', chest: 'Chest', head: 'Header', kick: 'Kick', spike: 'Spike', serve: 'Serve', toss: 'Toss', body: 'Body', block: 'Block', stuff: 'Stuff block', dig: 'Dig' };

function jitter(m) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * m;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/* ---------------- contact search ---------------- */
function contactCost(p, b, pref) {
  if (b.vy > 0.5) return Infinity;                                // still rising: not playable yet
  const hr = b.y - p.y;
  if (b.y < 0.3 || hr < -0.05 || hr > 2.2) return Infinity;    // can't play a ball that's nearly on the floor
  return Math.hypot(Math.hypot(b.x - p.pos.x, b.z - p.pos.z), 0.45 * (hr - pref));
}
// closest approach in the last 0.4 s or the next 0.45 s (ball time)
function findContact(p, pref, past = true, horizon = 0.62) {
  let best = { d: contactCost(p, ball, pref), tau: 0 };
  if (past) for (const h of hist) {
    const d = contactCost(p, h, pref);
    if (d < best.d) best = { d, tau: h.t - simTime };
  }
  const b = P.copyBall(ball);
  for (let t = 0; t < horizon;) {
    t += P.STEP * 2;
    if (P.step(b, P.STEP * 2, null)) break;
    const d = contactCost(p, b, pref);
    if (d < best.d) best = { d, tau: t };
  }
  return best;
}
// ideal contact height above your feet: serve at the hip, normal touches around the thigh, spikes overhead
const prefFor = (kind) => (me && me.y > 0.12 ? 1.55 : match.phase === 'serve-toss' ? 1.1 : 0.9);

function myBall() {
  if (!me || !ballLive) return false;
  if (match.phase === 'serve-toss') return iServe();
  return match.phase === 'rally' && (P.sideOfX(ball.x) === me.side || (ball.vx * sideSign(me.side) < 0 && Math.abs(ball.x) < 2));
}

/* ---------------- attacks: smash warning, perfect dig, active block (L) ----------------
   When the opponent jumps into a spike / smash, the receiver sees where it will land (red mark).
   Get inside the mark and a dig meter appears: ONLY green digs it (straight up, like a set — a fresh
   turn for you); anything else is their point. Or meet it at the net: jump and press L right as the
   ball crosses over you. Perfect = stuffed straight back down (brutal to return); good = deflected.  */
const ATTACKS = new Set(['spike', 'smash', 'ult']);
const isAttack = (part) => ATTACKS.has(part);
const RX_R = 1.5;                         // be within this of the landing spot to dig (generous)
const DIG_GREEN = 0.13, DIG_YELLOW = 0.26;   // green = clean dig, yellow = scrappy dig, beyond = their point   // dig green is a little more generous than the normal meter (0.075)  // dig meter: a much narrower green (and the needle always accelerates)
const BLOCK_X = 0.85;                     // body centre this close to the net to block
const BLOCK_PERFECT = 0.05 * BALL_TIME;   // ±50 ms (real time) around the ball crossing over you
const BLOCK_GOOD = 0.1 * BALL_TIME;       // ±100 ms
const BLOCK_CD = 0.7;                     // recovery between block attempts (s) — no spamming
// SHORT vs DEEP attacks: a smash aimed near the net crosses right over a blocker, so the block gets much easier
// the shorter it is (deep smashes stay a dig). 0 = deep (≥ 4.5 m past the net) … 1 = short (≤ 1.5 m).
const shortK = (landX) => THREE.MathUtils.clamp((4.5 - Math.abs(landX)) / 3, 0, 1);
const blockWin = (k) => ({ perfect: BLOCK_PERFECT * (1 + 1.5 * k), good: BLOCK_GOOD * (1 + 1.5 * k), reachZ: 0.8 + 0.5 * k, low: 0.45 - 0.5 * k });   // short ones cross low: legs can wall them too
function attackLandX() { const r = P.simulate(ball, 3); return r.end ? r.end.x : 9; }
let myTele = null;                        // my attack's aim spot while I'm jumping into it (sent to the opponent)
let blockCd = 0, blockPress = -1e9, pendingCross = null, hitStop = 0;
const smashWarn = { on: false, inPos: false, announced: false };

/* ---------------- BULLET TIME: power attacks (spike / smash / ultimate) slow the ball, not the players ---------------- */
const BT_SCALE = 1;                       // (bullet time removed — attacks play at normal speed)
let btScale = 1, btWas = false, btRingT = 0, btDroneStop = null;
const btActive = () => ballLive && match.phase === 'rally' && isAttack(match.lastPart);
const toReal = (tau) => tau / (BALL_TIME * Math.max(0.05, btScale));   // ball-time → real seconds right now
function updateBulletTime() { btScale = 1; }   // slow-motion effect removed

// their attack is in the air, heading for my court
const smashIncoming = () => !!me && ballLive && match.phase === 'rally' && isAttack(match.lastPart) && !!match.last && match.last !== me.side;

// would my jump K right now be a spike / smash? (mirrors doTouch's classification)
function attackLikely() {
  if (!me || match.phase !== 'rally' || me.y <= 0.12) return false;
  const offOwnSet = match.poss === me.side && match.settled;
  const firstTouch = match.poss !== me.side || match.cnt === 0;
  if (offOwnSet && Math.abs(me.pos.x) <= 3.2) return true;
  return firstTouch && match.lastPart === 'clear';
}

// where their attack will come down, if it's in my court
function digSpot() {
  return landingCache && P.sideOfX(landingCache.x) === me.side && P.inCourt(landingCache.x, landingCache.z) ? landingCache : null;
}

// ball-time until the ball drops through height h (or ends)
function timeToDrop(h) {
  const b = P.copyBall(ball);
  for (let t = 0; t < 2.5;) {
    t += P.STEP * 2;
    const end = P.step(b, P.STEP * 2, null);
    if ((b.vy < 0 && b.y <= h) || end) return t;
  }
  return Infinity;
}

// red mark on my court where their attack is going (green once I'm in position)
const smashMark = (() => {
  const g = new THREE.Group();
  const outer = flatRing(RX_R - 0.12, RX_R, 0xffffff, 0.9);
  const inner = flatRing(0, 0.16, 0xffffff, 0.9);
  const halo = flatRing(0, RX_R - 0.12, 0xffffff, 0.12);
  g.add(halo, outer, inner);
  g.position.y = 0.02;
  g.visible = false;
  scene.add(g);
  return { g, mats: [outer.material, inner.material, halo.material] };
})();
function updateSmashMark() {
  let spot = null;
  const live = smashIncoming();
  if (live) spot = digSpot();
  else if (them && them.tele && ballLive && match.phase === 'rally') spot = them.tele;   // they're jumping into it
  smashWarn.on = !!spot && playing;
  smashMark.g.visible = false;                // (the drop zone shows the dig zone now)
  if (!smashWarn.on) { smashWarn.announced = false; return; }
  smashWarn.inPos = Math.hypot(me.pos.x - spot.x, me.pos.z - spot.z) <= RX_R;
  smashMark.g.position.set(spot.x, 0.02, spot.z);
  const c = smashWarn.inPos ? 0x4fdc86 : 0xff3b2f;
  for (const m of smashMark.mats) m.color.set(c).multiplyScalar(1.8);
  smashMark.g.scale.setScalar(1 + Math.sin(performance.now() / (live ? 60 : 110)) * 0.05);
  if (!smashWarn.announced) { smashWarn.announced = true; sfx.cue(); }
}

// dig meter: only while I'm standing in the mark; same bar, but only green counts
function updateDigMeter() {
  const el = $('tm-float');
  const spot = digSpot();
  const inPos = spot && Math.hypot(me.pos.x - spot.x, me.pos.z - spot.z) <= RX_R;
  if (!inPos || pending || touchCd > 0) {
    if (approach && !approach.dead && approach.dig && !inPos) approach = null;   // stepped out: the meter goes away
    el.classList.remove('charging'); me.charging = null;
    return;
  }
  const r = toReal(timeToDrop(0.9));
  if (!approach || !approach.dig) {
    if (r > APPROACH_R) { el.classList.remove('charging'); return; }
    approach = { p: 1, needle: 0, dead: false, lastSeen: 0, dig: true };
    setMeterZones(DIG_GREEN, DIG_YELLOW);
    sfx.cue();
  }
  if (approach.dead) { el.classList.remove('charging'); me.charging = null; return; }
  approach.lastSeen = performance.now();
  approach.needle = Math.max(approach.needle, THREE.MathUtils.clamp(needleAt(r, approach.p), 0, 1));
  if (approach.needle >= 1) { approach.dead = true; el.classList.remove('charging'); return; }   // never pressed: it lands
  el.classList.add('charging');
  me.charging = 'K';
  const inGreen = Math.abs(approach.needle - G_CENTER) <= DIG_GREEN;
  $('tmf-marker').style.opacity = '1';
  $('tmf-marker').style.left = `${approach.needle * 100}%`;
  $('tmf-fill').style.width = `${approach.needle * 100}%`;
  $('tmf-label').textContent = inGreen ? 'DIG!' : Math.abs(approach.needle - G_CENTER) <= DIG_YELLOW ? 'DIG' : 'J TO DIG';
  $('tmf-label').className = 'tmf-label ' + (inGreen ? 'perfect' : 'charge');
  $('tmf-part').textContent = '';
  floatT = 0.3;
}

// J / K while their attack is coming: green digs it, anything else loses the point
function tapDig(kind) {
  if (!approach || !approach.dig || approach.dead) { whiff(kind); return; }   // not in the mark yet / too early
  const e = approach.needle - G_CENTER;
  approach.dead = true;
  me.charging = null;
  if (Math.abs(e) > DIG_YELLOW) {
    me.action = { part: 'shank', t: 0 };
    showTiming(e, e < 0 ? 'EARLY' : 'LATE', null, 'missed the dig');
    sfx.miss();
    setMeter(0);
    endRally(me.side, 'DIG');
    return;
  }
  const tau = timeToDrop(0.9);
  const clean = Math.abs(e) <= DIG_GREEN;
  if (tau > 0.012 && Number.isFinite(tau)) pending = { kind: 'DIG', at: simTime + tau, err: Math.abs(e), early: e < 0, d: 0, charge: 1, aim: null, tier: clean ? 2 : 1 };
  else doDig(clean ? 2 : 1);
}

// perfect dig: the ball pops (nearly) straight up over you like a set — a fresh turn for your side
function doDig(tier = 2) {
  const s = sideSign(me.side);
  const from = { x: ball.x, y: Math.max(ball.y, 0.4), z: ball.z };
  const tg = {
    x: from.x + THREE.MathUtils.clamp(-s * 3.8 - from.x, -0.6, 0.6),   // drift a touch toward the middle of your half
    z: from.z + THREE.MathUtils.clamp(-from.z, -0.5, 0.5),
  };
  if (tier < 2) { const [ox, oz] = jitter(1.4); tg.x += ox; tg.z += oz; }   // scrappy dig: lower and it drifts
  setBall(P.solveApex(from, tg, tier < 2 ? 4.8 : 6.7, false));
  match.lastPart = 'dig';
  if (match.poss !== me.side) { match.poss = me.side; match.cnt = 0; }
  match.cnt++;
  match.last = me.side;
  match.settled = true;            // plays like a set: you can go straight into your own attack
  touchCd = 0.25;
  me.facing = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  me.action = { part: 'chest', t: 0 };
  setMeter(myMeter + (tier < 2 ? 5 : 20));
  showTiming(0, tier < 2 ? 'GOOD' : 'PERFECT', 'dig', tier < 2 ? 'scrappy dig' : 'dug it!');
  contactJuice('dig', tier < 2 ? 'GOOD' : 'PERFECT', from, true);
  sfx.touch(match.cnt);
  sendTouch('dig', tier < 2 ? 'GOOD' : 'PERFECT');
  renderMatchUI();
}

// L: an active block. Grounded at the net it jumps you into it; the press is judged against the
// moment their attack crosses over you (it can come just before or just after the crossing).
function tryBlock() {
  if (!me || !playing || match.phase !== 'rally' || !ballLive || blockCd > 0) return;
  if (Math.abs(me.pos.x) > BLOCK_X) { showTiming(null, 'NO BLOCK', null, 'get to the net'); return; }
  const threat = P.sideOfX(ball.x) !== me.side || (isAttack(match.lastPart) && match.last !== me.side);
  if (!threat) return;                                  // nothing coming: L doesn't waste a jump
  if (me.y <= 0) jumpQueued = true;
  blockCd = BLOCK_CD;
  blockPress = simTime;
  me.action = { part: 'block', t: 0 };
  if (pendingCross) {                                   // it already went over: late side of the window
    const late = simTime - pendingCross.t;
    const c = pendingCross;
    pendingCross = null;
    if (late <= c.win.good && c.geomOk) resolveBlock(c, late);
    else missBlock('LATE');
  }
}
function blockGeomOk(c, win, p = me) {
  return p.y > 0.12 && Math.abs(p.pos.x) <= BLOCK_X && Math.abs(p.pos.z - c.z) <= win.reachZ && c.y >= p.y + win.low && c.y <= p.y + 2.5;
}
// called when their attack crosses the net toward me
function onAttackCross(e) {
  const win = blockWin(shortK(attackLandX()));
  const c = { x: e.x, y: e.y, z: e.z, t: simTime, win, geomOk: blockGeomOk(e, win) };
  const early = c.t - blockPress;                       // pressed this long before the crossing
  if (early >= 0 && early <= win.good && c.geomOk) { resolveBlock(c, -early); return; }
  if (early >= 0 && early <= 0.5) { missBlock(early > win.good ? 'EARLY' : 'MISSED'); return; }
  pendingCross = c.geomOk ? c : null;
}
function missBlock(kind) {
  blockPress = -1e9;
  recoverT = Math.max(recoverT, 0.4);
  showTiming(null, kind === 'MISSED' ? 'MISSED BLOCK' : `${kind} BLOCK`, 'block', 'it got past you');
  sfx.miss();
}
function resolveBlock(c, dt) {
  pendingCross = null; blockPress = -1e9;
  const perfect = Math.abs(dt) <= (c.win ? c.win.perfect : BLOCK_PERFECT);
  const s = sideSign(me.side);                          // their half is on the +s side of the net
  const from = { x: s * 0.12, y: Math.max(c.y, P.netTop(c.z) + 0.15), z: c.z };
  const zIn = (z) => THREE.MathUtils.clamp(z, -(F.hw - 0.4), F.hw - 0.4);
  let shot;
  if (perfect) {
    // stuffed: driven at a sharp angle straight down into their court, just behind the net
    shot = P.solveSpeed(from, { x: s * (0.9 + Math.random() * 1.3), z: zIn(c.z + (Math.random() - 0.5) * 2.4) }, 15);
  } else {
    // deflected: pops softly back up on their side — they can still play it
    shot = P.solveApex(from, { x: s * (1.6 + Math.random() * 1.6), z: zIn(c.z + (Math.random() - 0.5) * 2) }, Math.max(from.y + 1.2, 3.4), false);
  }
  setBall(shot);
  match.lastPart = perfect ? 'stuff' : 'block';
  match.poss = other(me.side); match.cnt = 0;           // a block isn't a touch; they get a fresh three
  match.last = me.side; match.settled = false;
  touchCd = 0.3;
  if (perfect) hitStop = 0.09;                          // brief impact freeze
  me.action = { part: 'block', t: 0 };
  setMeter(myMeter + (perfect ? 20 : 5));
  const label = perfect ? 'PERFECT' : 'GOOD';
  showTiming(dt, label, perfect ? 'stuff' : 'block', perfect ? 'stuffed!' : 'deflected');
  contactJuice(match.lastPart, label, from, true);
  sendTouch(match.lastPart, label);
  renderMatchUI();
}

/* ---------------- auto timing meter: it starts by itself as the ball comes in — just TAP on green ---------------- */
const G_CENTER = 0.72;            // green zone centre on the bar (0..1) — never moves
const GREEN_HALF = 0.075;         // green = within ±0.075 of the centre (bar units)
const YELLOW_HALF = 0.2;          // yellow = within ±0.2
const APPROACH_R = 0.75;          // the meter appears this many seconds before the ideal moment
const WHIFF_DELAY = 0.7;          // can't swing again for this long after swinging at nothing
let recoverT = 0;
let approach = null;              // { p, needle, dead, lastSeen } for the ball currently coming at you

// two serves: J+J = SNAP (receiver's green comes EARLY), J+K = HANG (green comes LATE). Fixed for that meter — never moves.
const SERVE_GC = { 'serve-snap': 0.62, 'serve-hang': 0.82 };
const isServePart = (part) => part === 'serve-snap' || part === 'serve-hang';
let serveType = 'serve-snap';     // which serve my second tap asked for
function setMeterZones(gh = GREEN_HALF, yh = YELLOW_HALF, gc = G_CENTER) {
  const g = document.getElementById('tmf-zone'), n = document.getElementById('tmf-near');
  g.style.opacity = '1'; n.style.opacity = '1';
  g.style.left = `${(gc - gh) * 100}%`; g.style.width = `${gh * 200}%`;
  n.style.left = `${(gc - yh) * 100}%`; n.style.width = `${yh * 200}%`;
  const gh2 = document.getElementById('tmf-ghost');
  if (gh2) { gh2.style.left = `${G_CENTER * 100}%`; gh2.style.opacity = gc === G_CENTER ? '0' : '1'; }
}
function canSwing() {
  if (!me || !playing) return false;
  return match.phase === 'rally' || (match.phase === 'serve-toss' && iServe());
}
// is the ball actually coming at you right now?
function ballIncoming() {
  return !!me && ballLive && canSwing() &&
    (match.phase === 'serve-toss' || P.sideOfX(ball.x) === me.side || ball.vx * sideSign(me.side) < 0);
}
/* ---------------- SPIN METER: perfects build it, misses empty it; it powers the Ultimate Spin Kick ---------------- */
const METER_ULT_MIN = 25;         // need at least a quarter to unleash an Ultimate
let myMeter = 0;                  // 0..100
let ballFire = false;             // the ball is on fire after an Ultimate
function setMeter(v) {
  const before = myMeter;
  myMeter = THREE.MathUtils.clamp(v, 0, 100);
  if (before < METER_ULT_MIN && myMeter >= METER_ULT_MIN) sfx.meterReady();
  if (before > 0 && myMeter === 0) sfx.meterDrain();
  renderMeter();
}
function renderMeter() {
  const el = document.getElementById('meter');
  if (!el) return;
  document.getElementById('meter-fill').style.width = `${myMeter}%`;
  el.classList.toggle('ready', myMeter >= METER_ULT_MIN);
  el.classList.toggle('full', myMeter >= 100);   // full meter: "POP ULT" flashes across the bar (CSS)
  document.getElementById('meter-state').textContent = myMeter >= METER_ULT_MIN ? 'ULTIMATE READY · jump + K' : 'perfects build it';
  if (me) {
    const theirs = them ? them.meter || 0 : 0;
    const L = myMeter, R = theirs;   // yours on the left, always
    document.getElementById('sm-left').style.width = `${L}%`;
    document.getElementById('sm-right').style.width = `${R}%`;
  }
}

function whiff(kind) {
  setMeter(0);
  me.action = { part: kind === 'K' ? 'shank' : 'foot', t: 0 };
  recoverT = WHIFF_DELAY;
  if (approach) approach.dead = true;
  showTiming(null, 'WHIFF');
  sfx.miss();
}
// Needle position from the time left until the ideal moment (r, seconds).
// p = 1: steady sweep.  p < 1: starts slow, then ACCELERATES hard into the green.
function needleAt(r, q) {
  // q = 1: steady sweep. q > 1: starts slow and ACCELERATES into the green, ending q× faster (finite speed,
  // so the green is always catchable). r = seconds until the ideal moment (negative = already passed).
  if (r >= 0) return G_CENTER * Math.pow(1 - Math.min(r, APPROACH_R) / APPROACH_R, q);
  return G_CENTER + (-r) * (G_CENTER / APPROACH_R) * q;   // past the ideal: keeps going at its end speed
}
function updateApproach() {
  const el = $('tm-float');
  myTele = null;
  if (smashIncoming()) { updateDigMeter(); return; }   // their attack: the dig meter takes over
  if (pending && (pending.kind === 'K' || pending.feint) && pending.aim && attackLikely()) myTele = pending.aim;   // (a feint keeps the spike tell up)   // swung, contact a beat away
  const live = ballIncoming() && !pending && touchCd <= 0;
  let c = null;
  if (live) c = findContact(me, prefFor('K'), true, 1.2);
  // jumping into an attack: the opponent gets to see where it's aimed
  if (live && c && c.d <= REACH && attackLikely()) myTele = aimTarget(me);
  if (!live || !c || c.d > REACH) {
    if (approach && !approach.dead && performance.now() - approach.lastSeen > 250) approach = null;
    el.classList.remove('charging');
    if (me) me.charging = null;
    return;
  }
  const r = toReal(c.tau);
  if (!approach) {
    if (r > APPROACH_R) { el.classList.remove('charging'); return; }
    // receiving a serve: its type decides where the green sits for this one touch
    const srv = match.phase === 'rally' && isServePart(match.lastPart) && match.last !== me.side ? match.lastPart : null;
    approach = { p: Math.random() < 0.4 ? 1.8 : 1, needle: 0, dead: false, lastSeen: 0, gc: srv ? SERVE_GC[srv] : G_CENTER, srv };
    setMeterZones(GREEN_HALF, YELLOW_HALF, approach.gc);
    sfx.cue();
  }
  if (approach.dead) { el.classList.remove('charging'); if (me) me.charging = null; return; }
  approach.lastSeen = performance.now();
  approach.needle = Math.max(approach.needle, THREE.MathUtils.clamp(needleAt(r, approach.p), 0, 1));
  if (approach.needle >= 1) { approach.dead = true; el.classList.remove('charging'); return; }   // let it go by
  el.classList.add('charging');
  me.charging = 'K';
  const inGreen = Math.abs(approach.needle - approach.gc) <= GREEN_HALF;
  $('tmf-marker').style.opacity = '1';
  $('tmf-marker').style.left = `${approach.needle * 100}%`;
  $('tmf-fill').style.width = `${approach.needle * 100}%`;
  $('tmf-label').textContent = inGreen ? 'NOW!' : me.y > 0.12 ? 'SPIKE' : match.phase === 'serve-toss' ? 'SERVE' : 'TAP';
  $('tmf-label').className = 'tmf-label ' + (inGreen ? 'perfect' : 'charge');
  $('tmf-part').textContent = approach.srv === 'serve-snap' ? 'SNAP SERVE · early' : approach.srv === 'serve-hang' ? 'HANG SERVE · wait' : '';
  floatT = 0.3;
}
// J or K tap: graded by where the needle is right now; the touch lands when the ball arrives
function tapSwing(kind) {
  if (!me || !playing) return;
  if (recoverT > 0) { sfx.miss(); return; }
  if (touchCd > 0 || pending) return;
  if (match.phase === 'serve-toss' && iServe()) { serveType = kind === 'K' ? 'serve-hang' : 'serve-snap'; kind = 'K'; }   // J+J snap, J+K hang
  if (!ballIncoming()) return;                                   // ball not in play / not coming at you: nothing happens
  sfx.swing();
  if (smashIncoming()) {                                         // only J digs
    if (kind === 'J') tapDig('J');
    else { showTiming(null, 'DIG WITH J', null, ''); sfx.miss(); }
    return;
  }
  if (!approach || approach.dead || !ballIncoming()) { whiff(kind); return; }
  const c = findContact(me, prefFor(kind), true, 1.2);
  if (c.d > REACH) { whiff(kind); return; }
  const e = approach.needle - approach.gc;
  const tier = Math.abs(e) <= GREEN_HALF ? 2 : Math.abs(e) <= YELLOW_HALF ? 1 : 0;
  const early = e < 0;
  approach.dead = true;
  me.charging = null;
  const aim = kind === 'K' ? aimTarget(me) : null;
  const feint = kind === 'J' && me.y > 0.12 && attackLikely() && ball.y >= 1.2;
  if (c.tau > 0.012) pending = { kind, at: simTime + c.tau, err: Math.abs(e), early, d: c.d, charge: 1, aim: feint ? aimTarget(me) : aim, tier, feint };
  else doTouch(kind, Math.abs(e), early, c.d, 1, aim, tier);
}

let ultPower = 0;
function doTouch(kind, err, early, d, chargeAmt = 1, aim = null, forcedTier = null) {
  pending = null;
  if (!ballLive) return;
  if (kind === 'DIG') { doDig(forcedTier ?? 2); return; }
  const s = sideSign(me.side);
  const hr = ball.y - me.y;
  const air = me.y > 0.12;
  const isServe = match.phase === 'serve-toss';
  const inSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const firstTouch = match.poss !== me.side || match.cnt === 0;           // first touch on your side
  const incoming = firstTouch ? match.lastPart : null;                   // the shot that came over
  const hardIncoming = incoming === 'smash' || incoming === 'spike' || incoming === 'ult' || incoming === 'stuff';
  const emergency = kind === 'J' && !isServe && match.poss === me.side && match.cnt === 2;   // J as your third touch

  // timing tier from the release
  let tier = forcedTier !== null ? forcedTier : err <= GREEN_HALF ? 2 : err <= YELLOW_HALF ? 1 : 0;
  if (tier === 2 && d > 0.8) tier = 1;                                  // stretched for it
  if (kind === 'K' && inSpeed > 14 && !isServe && tier > 0) tier--;     // hard balls are hard to kick — control with J
  if (incoming === 'stuff' && tier > 0) tier--;                         // a stuffed block comes down brutally: green plays like good
  if (emergency && tier === 0 && err <= YELLOW_HALF * 1.6) tier = 1;    // a desperate third-touch save is a bit more forgiving
  const label = tier === 2 ? 'PERFECT' : tier === 1 ? 'GOOD' : early ? 'EARLY' : 'LATE';
  const sub = tier === 1 ? (early ? 'early' : 'late') : '';

  if (!isServe && match.poss === me.side && match.cnt >= 3) { endRally(me.side, 'FOUR'); return; }

  const from = { x: ball.x, y: ball.y, z: ball.z };
  const weak = (1 - chargeAmt);                       // short charge = less power
  let part, shot;
  const offOut = () => {                               // a mistimed ball sails long or wide
    const t = aimTarget(me);
    return Math.random() < 0.5 ? { x: s * (F.hl + 1.0 + Math.random() * 1.5), z: t.z } : { x: s * (2 + Math.random() * 3), z: (Math.random() < 0.5 ? -1 : 1) * (F.hw + 0.8 + Math.random()) };
  };
  if (kind === 'J' && air && !isServe && attackLikely() && ball.y >= 1.7) {
    part = 'dink';                                     // jumped like a spike, tapped J: FEINT
    shot = feintShot(from, me.side, aimTarget(me).z, tier);
  } else if (kind === 'J' && emergency) {
    // third touch with J: a desperate, high, less precise ball that goes OVER — never a fourth touch
    part = bodyPart(hr);
    const [ox, oz] = jitter([2.2, 1.4, 0.9][tier]);
    shot = P.solveApex(from, { x: s * (3.2 + Math.random() * 3.0) + ox, z: (Math.random() - 0.5) * 3 + oz }, tier === 0 ? 4.6 : 7.4, true);
  } else if (kind === 'J') {
    part = bodyPart(hr);
    const isSet = match.poss === me.side && match.cnt >= 1;
    const tg = setTarget(me, isSet);
    const dev = [2.3, 0.8, 0.2][tier];
    const [ox, oz] = jitter(dev);
    tg.x += ox; tg.z += oz;
    let apex = tier === 0 ? 2.8 + Math.random() * 3.0 : (isSet ? 6.7 : 5.8) - (tier === 1 ? 0.5 : 0);
    if (hardIncoming && tier >= 1) apex = 9.0;                         // digging a smash pops it WAY up
    shot = P.solveApex(from, tg, apex, false);
  } else {
    const tg = aim ? { x: aim.x, z: aim.z } : aimTarget(me);
    const offOwnSet = match.poss === me.side && match.settled;
    const spike = air && !isServe && offOwnSet && ball.y >= 1.7 && Math.abs(me.pos.x) <= 3.2;
    const smash = air && !isServe && !spike && firstTouch && incoming === 'clear';
    const clear = air && !isServe && !spike && !smash;
    if (clear) {
      // jump kick that isn't a set-up spike: a high, soft clear to their side — easy for them
      part = 'clear';
      const [ox, oz] = jitter([2.0, 1.0, 0.5][tier]);
      tg.x += ox; tg.z += oz;
      shot = P.solveApex(from, tg, tier === 0 ? 7.2 : 6.5, true);
    } else if (smash) {
      // jump-kicking straight off their clear: a punchy smash (not spike-level)
      part = 'smash';
      const [ox, oz] = jitter([2.2, 0.9, 0.35][tier]);
      tg.x += ox; tg.z += oz;
      if (tier === 0) shot = P.solveApex(from, tg, 4.0, true);
      else if (Math.abs(me.pos.x) <= 3.5) shot = P.solveSpeed(from, tg, tier === 2 ? 18 : 14);     // near the net: hit down
      else shot = P.solveApex(from, tg, Math.max(from.y + 0.35, tier === 2 ? 2.4 : 2.9), true);    // from deep: hard flat drive
    } else if (spike) {
      part = 'spike';
      if (tier >= 1 && myMeter >= METER_ULT_MIN) {
        // ULTIMATE SPIN KICK: faster and more accurate the fuller your meter
        const pw = myMeter / 100;
        const [ox, oz] = jitter(tier === 2 ? 0.15 : 0.6); tg.x += ox; tg.z += oz;
        shot = P.solveSpeed(from, tg, (tier === 2 ? 21 : 17) + 14 * pw);
        part = 'ult'; ultPower = pw;
      } else if (tier === 2) { const [ox, oz] = jitter(0.3); tg.x += ox; tg.z += oz; shot = P.solveSpeed(from, tg, (17 + 6 * chargeAmt)); }
      else if (tier === 1) { const [ox, oz] = jitter(0.6); tg.x += ox; tg.z += oz; shot = P.solveSpeed(from, tg, 13 + 2 * chargeAmt); }   // stays inside the warning mark
      else shot = Math.random() < 0.5 ? P.solveSpeed(from, offOut(), 14) : P.solveApex(from, { x: s * 3, z: tg.z }, 4.6, true);
    } else {
      part = isServe ? serveType : hr < 1.3 ? 'kick' : bodyPart(hr);
      const settled = match.settled && match.poss === me.side;
      if (tier === 0) {
        // way off: out, or a floater that's easy to put away
        if (Math.random() < 0.5) shot = P.solveApex(from, offOut(), 3.6, true);
        else shot = P.solveApex(from, { x: s * 3.2, z: tg.z * 0.5 }, 5.6, true);
      } else {
        let apex = isServe ? serveApex(part, tier) : settled ? (tier === 2 ? 3.0 : 3.7) : (tier === 2 ? 3.8 : 4.4);
        apex += weak * 0.5;
        const [ox, oz] = jitter(tier === 2 ? 0.25 : 1.0);
        tg.x += ox; tg.z += oz;
        shot = P.solveApex(from, tg, apex, true);
      }
    }
  }
  // style: how good the kick is decides how flashy it looks
  if (kind === 'K' && !['spike', 'ult', 'clear', 'smash', 'serve-snap', 'serve-hang', 'dink'].includes(part)) {
    if (tier === 2) part = hr >= 1.55 ? 'dheader' : (hr >= 1.1 || (match.settled && match.poss === me.side)) ? 'bicycle' : 'volley';
    else if (tier === 0) part = 'shank';
  }
  setBall(shot);
  match.lastPart = part;
  if (part === 'ult') ballFire = true;
  if (kind === 'K') resetAim();     // aim snaps back to the centre after every kick

  if (isServe) { match.phase = 'rally'; match.poss = me.side; match.cnt = 3; }
  else {
    if (match.poss !== me.side) { match.poss = me.side; match.cnt = 0; }
    match.cnt++;
  }
  match.last = me.side;
  match.settled = kind === 'J' && tier >= 1 && !emergency && part !== 'dink';
  touchCd = 0.25;
  me.facing = kind === 'J' ? (s > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(shot.vx, shot.vz) || me.facing;
  me.action = { part, t: 0 };
  // meter: the Ultimate spends it all; otherwise perfects build it and way-off touches empty it
  if (part === 'ult') { setMeter(0); ballFire = true; }
  else setMeter(tier === 2 ? myMeter + (emergency ? 5 : 20) : tier === 1 ? myMeter + 5 : 0);
  showTiming(early ? -err : err, label, part, sub);
  contactJuice(part, label, from, true, tier === 2 && kind === 'K' ? 1 : 0);
  if (!isServe) sfx.touch(match.cnt);
  sendTouch(part, label);
  renderMatchUI();
}

// sound + particles + shake for any contact (mine or the opponent's)
const PAL = {
  gold: [0xffd34d, 0xffb01f, 0xfff1a8, 0xffffff],
  fire: [0xff3b1f, 0xff7a1a, 0xffc23a, 0xfff0a0],
  cool: [0x5cb8f0, 0x9fe0ff, 0xffffff],
  warm: [0xff8a2a, 0xffb36b, 0xffffff],
  confetti: [0xff4d6d, 0xffd34d, 0x4fdc86, 0x5cb8f0, 0xb48cff, 0xff8a2a],
};
// unmistakable BLOCK: banner + 3D text for both players, a spark wall along the net, net shudder, big sound
function blockedJuice(at, stuffed) {
  showBanner(stuffed ? 'BLOCKED!' : 'BLOCKED', stuffed ? 'stuffed straight back down' : 'deflected at the net', 'var(--blue)');
  blockedText(at.z, stuffed);
  sfx.blocked(stuffed, panOf(at.x, at.y, at.z));
  shake(stuffed ? 0.9 : 0.6);
  netShake = stuffed ? 1 : 0.7;
  fx.flash(0, at.y, at.z, { color: 0xffffff, size: stuffed ? 6 : 4.5, life: 0.3 });
  fx.flash(0, at.y, at.z, { color: 0x5cb8f0, size: stuffed ? 9 : 6, life: 0.45 });
  // wall of sparks along the net plane
  for (let z = -F.hw; z <= F.hw; z += 0.3) {
    fx.emit(0, 0.9 + Math.random() * 0.7, z, { n: stuffed ? 6 : 4, color: [0xffffff, 0x9fe0ff, 0x5cb8f0], bright: 2.2, speed: 2.4, up: 1.4, life: 0.7, size: 0.1 });
  }
  fx.emit(at.x, at.y, at.z, { n: stuffed ? 140 : 90, color: [0xffffff, 0x9fe0ff, 0x5cb8f0, 0xb48cff], bright: 2.3, speed: 7, up: 2.5, life: 0.9, size: 0.13 });
  for (const [r, l, c] of [[1.4, 0.35, 0xffffff], [2.6, 0.5, 0x5cb8f0], [3.8, 0.7, 0x9fe0ff]]) fx.ring(0, at.z, { color: c, r: r * (stuffed ? 1.2 : 1), life: l });
}
// big floating "BLOCKED!" above the net, facing the camera
const blockedSprite = (() => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 40; sp.visible = false;
  scene.add(sp);
  return { sp, g, tex, t: 0 };
})();
function blockedText(z, stuffed) {
  const { g, tex, sp } = blockedSprite;
  g.clearRect(0, 0, 1024, 256);
  g.font = '800 180px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 18; g.strokeStyle = 'rgba(8,16,30,0.9)'; g.strokeText(stuffed ? 'BLOCKED!' : 'BLOCKED', 512, 132);
  g.fillStyle = stuffed ? '#9fe0ff' : '#ffffff'; g.fillText(stuffed ? 'BLOCKED!' : 'BLOCKED', 512, 132);
  tex.needsUpdate = true;
  sp.position.set(0, 2.15, THREE.MathUtils.clamp(z, -2.5, 2.5));
  sp.visible = true;
  blockedSprite.t = 1.4;
}
function updateBlockFx(dt) {
  const B = blockedSprite;
  if (B.t > 0) {
    B.t -= dt;
    const u = 1 - B.t / 1.4;                                   // 0 → 1
    const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.7 : 1.3 - Math.min(0.3, (u - 0.12) * 0.6);
    B.sp.scale.set(4.2 * pop, 1.05 * pop, 1);
    B.sp.position.y = 2.15 + u * 0.4;
    B.sp.material.opacity = Math.min(1, B.t * 2.5);
    if (B.t <= 0) B.sp.visible = false;
  }
  if (netMesh) {
    if (netShake > 0) {
      netShake = Math.max(0, netShake - dt * 2.2);
      const t = performance.now() / 1000;
      netMesh.position.x = Math.sin(t * 55) * 0.07 * netShake;
      netMesh.scale.y = 1 + Math.sin(t * 38) * 0.06 * netShake;
    } else { netMesh.position.x = 0; netMesh.scale.y = 1; }
  }
}

function contactJuice(part, label, at, mine, power = 0) {
  const pan = panOf(at.x, at.y, at.z);
  if (part === 'clear') sfx.kick(0.5, pan);
  else if (part === 'smash') { sfx.kick(1, pan); sfx.whoosh(pan); }
  else if (part === 'ult') sfx.ult(pan);
  else if (part === 'spike' || part === 'bicycle') sfx.spike(1, pan);
  else if (part === 'dheader') { sfx.head(pan); sfx.kick(0.9, pan); }
  else if (part === 'volley' || part === 'serve-power') sfx.kick(1, pan);
  else if (part === 'serve-snap') sfx.serveSnap(pan);
  else if (part === 'dink') { sfx.dink(pan); fx.emit(at.x, at.y, at.z, { n: 10, color: 0xffffff, speed: 0.8, up: 0.3, life: 0.35, size: 0.06 }); }
  else if (part === 'serve-hang') sfx.serveHang(pan);
  else if (part === 'shank') sfx.body(pan);
  else if (part === 'kick' || part === 'serve' || part === 'foot') sfx.kick(part === 'foot' ? 0.4 : 0.8, pan);
  else if (part === 'knee') sfx.kick(0.3, pan);
  else if (part === 'head') sfx.head(pan);
  else if (part === 'chest') sfx.chest(pan);
  else if (part === 'body' || part === 'block') sfx.body(pan);
  else if (part === 'stuff') { sfx.spike(1, pan); sfx.body(pan); }
  else if (part === 'dig') { sfx.chest(pan); sfx.kick(0.5, pan); }
  else if (part === 'toss') sfx.toss(pan);
  if (part === 'toss') { fx.emit(at.x, at.y, at.z, { n: 8, color: PAL.cool, speed: 0.8, up: 1, life: 0.4, size: 0.06 }); return; }
  const perfect = label === 'PERFECT';
  if (mine) { if (perfect) sfx.perfect(); else if (label === 'GOOD') sfx.good(); }

  if (part === 'clear') {   // no fireworks for a clear
    fx.emit(at.x, at.y, at.z, { n: 10, color: [0xffffff, 0xdfe8ff], speed: 1.6, up: 1.2, life: 0.45, size: 0.07 });
    if (mine && perfect) sfx.good();
    return;
  }
  // base burst on every contact
  const pal = perfect ? PAL.gold : label === 'EARLY' ? PAL.cool : label === 'LATE' ? PAL.warm : [0xffffff, 0xdfe8ff];
  fx.emit(at.x, at.y, at.z, { n: perfect ? 45 : 22, color: pal, speed: perfect ? 3.4 : 2.4, up: 2, life: 0.7, size: perfect ? 0.12 : 0.08 });
  fx.flash(at.x, at.y, at.z, { color: perfect ? 0xffd34d : 0xffffff, size: perfect ? 2.2 : 1.2 });
  if (perfect) {
    // starburst: fast, long streak-like sparks that barely fall
    fx.emit(at.x, at.y, at.z, { n: 28, color: [0xffffff, 0xfff1a8], bright: 2.2, speed: 6.5, up: 0.4, life: 0.35, size: 0.06, g: 1 });
    fx.ring(at.x, at.z, { color: 0xffd34d, r: 1.5, life: 0.4 });
  }
  if (part === 'ult') {
    const pw = Math.max(0.3, ultPower);
    shake(0.75 + pw * 0.25);
    fx.flash(at.x, at.y, at.z, { color: 0xff7a1a, size: 4 + pw * 3, life: 0.35 });
    fx.emit(at.x, at.y, at.z, { n: 140, color: PAL.fire, bright: 2.2, speed: 7, up: 2.5, life: 1.0, size: 0.15 });
    fx.emit(at.x, at.y, at.z, { n: 60, color: [0xffffff, 0xfff0a0], bright: 2.6, speed: 10, up: 0.5, life: 0.4, size: 0.07, g: 0.5 });
    fx.ring(at.x, at.z, { color: 0xff5a1a, r: 3.2, life: 0.6 });
    fx.ring(at.x, at.z, { color: 0xffd34d, r: 2.2, life: 0.45 });
  } else if (part === 'stuff' || part === 'block') {
    blockedJuice(at, part === 'stuff');
  } else if (part === 'never') {
    shake(0.5);
    fx.flash(at.x, at.y, at.z, { color: 0x9fe0ff, size: 3.2, life: 0.25 });
    fx.emit(at.x, at.y, at.z, { n: 70, color: PAL.cool, bright: 2, speed: 5.5, up: 1.5, life: 0.7, size: 0.11 });
    fx.ring(at.x, at.z, { color: 0x5cb8f0, r: 2.4, life: 0.45 });
  } else if (part === 'dig') {
    shake(0.2);
    fx.ring(at.x, at.z, { color: 0x4fdc86, r: 1.8, life: 0.45 });
  } else if (part === 'smash') {
    shake(0.28);
    fx.ring(at.x, at.z, { color: 0xffffff, r: 1.3, life: 0.35 });
  } else if (part === 'spike') {
    shake(0.55);
    fx.ring(at.x, at.z, { color: 0xff8a2a, r: 1.9 });
    fx.emit(at.x, at.y, at.z, { n: 50, color: PAL.warm, speed: 5, up: 2, life: 0.7, size: 0.1 });
  } else if (part === 'bicycle' || part === 'dheader' || part === 'volley') {
    shake(0.4); fx.ring(at.x, at.z, { color: 0xffd34d, r: 2.0 });
    fx.emit(at.x, at.y, at.z, { n: 55, color: PAL.gold, speed: 4, up: 2.6, life: 0.9, size: 0.12 });
  } else if (part === 'kick' || part === 'serve' || part === 'serve-power' || isServePart(part)) shake(perfect ? 0.22 : 0.12);
  if (power) { fx.ring(at.x, at.z, { color: 0xffd34d, r: 1.4 }); shake(0.15); }
  else if (perfect) shake(0.1);
}

function sendTouch(part, label = '') {
  if (teamMode()) { sendTouchAs(me, part, label); return; }
  if (!conn || !conn.open) return;
  conn.send({ t: 'touch', r: match.rally, b: packBall(), part, label, side: me.side,
    phase: match.phase, poss: match.poss, cnt: match.cnt, last: match.last, settled: match.settled, mt: Math.round(myMeter) });
}
function sendTouchAs(p, part, label = '') {
  netSend({ t: 'touch', id: p === me ? myId : p.id, r: match.rally, b: packBall(), part, label, side: p.side,
    phase: match.phase, poss: match.poss, cnt: match.cnt, last: match.last, settled: match.settled, mt: p === me ? Math.round(myMeter) : 0 });
}

// a ball that hits your body without a key press still counts (blocks at the net don't)
function bodyCheck() {
  if (!me || touchCd > 0 || pending || match.phase !== 'rally') return;
  if (smashIncoming()) return;                          // their attack: only a green dig or an L block stops it
  if (approach && !approach.dead) return;               // you're lined up to play it — not a body touch
  if (P.sideOfX(ball.x) !== me.side) return;
  if (match.last === me.side && ball.vy > 0) return;   // your own set rising past you isn't a body touch
  const dx = ball.x - me.pos.x, dz = ball.z - me.pos.z;
  const dh = Math.hypot(dx, dz), hr = ball.y - me.y;
  if (dh > 0.27 || hr < 0.15 || hr > 1.85) return;
  const block = me.y > 0.15 && Math.abs(me.pos.x) < 1.2;
  if (!block && match.poss === me.side && match.cnt >= 3) { endRally(me.side, 'FOUR'); return; }
  const n = dh > 1e-3 ? { x: dx / dh, z: dz / dh } : { x: -sideSign(me.side), z: 0 };
  const vn = ball.vx * n.x + ball.vz * n.z;
  if (vn < 0) { ball.vx -= 1.35 * vn * n.x; ball.vz -= 1.35 * vn * n.z; }
  const outV = ball.vx * n.x + ball.vz * n.z;
  if (outV < 1.6) { ball.vx += (1.6 - outV) * n.x; ball.vz += (1.6 - outV) * n.z; }
  ball.x = me.pos.x + n.x * 0.3; ball.z = me.pos.z + n.z * 0.3;
  ball.vy = Math.abs(ball.vy) * 0.3 + 1.4;
  if (block) { ball.vx = Math.abs(ball.vx) * sideSign(me.side) * 0.6 + sideSign(me.side) * 1.5; }
  hist.length = 0; landingDirty = true;
  if (!block) {
    if (match.poss !== me.side) { match.poss = me.side; match.cnt = 0; }
    match.cnt++;
    sfx.touch(match.cnt);
  }
  match.last = me.side; match.settled = false; match.lastPart = 'body';
  touchCd = 0.3;
  const part = block ? 'block' : 'body';
  me.action = { part, t: 0 };
  if (block) match.lastPart = 'block';
  showTiming(null, block ? 'BLOCK' : 'BODY');
  contactJuice(part, '', ball, true);
  sendTouch(part);
  renderMatchUI();
}

/* ---------------- simulation ---------------- */
function physStep(local) {
  // a buffered (early) touch resolves before the ball moves on — never lose it to the floor check
  if (local && pending && simTime + P.STEP >= pending.at) doTouch(pending.kind, pending.err, pending.early, pending.d, pending.charge, pending.aim, pending.tier ?? null);
  simTime += P.STEP;
  const evs = [];
  P.step(ball, P.STEP, evs);
  hist.push({ t: simTime, x: ball.x, y: ball.y, z: ball.z, vy: ball.vy });
  while (hist.length && hist[0].t < simTime - 0.4) hist.shift();
  for (const e of evs) handleEvent(e);
  if (!ballLive || !local) return;
  bodyCheck();
}

function handleEvent(e) {
  if (!ballLive) return;
  const pan = panOf(e.x, e.y, e.z);
  if (e.type === 'cross' || e.type === 'tape') {
    match.poss = P.sideOfX(ball.x); match.cnt = 0; match.settled = false;
    if (e.type === 'tape') { landingDirty = true; sfx.tape(pan); fx.emit(e.x, e.y, e.z, { n: 8, color: 0xffffff, speed: 1.2, life: 0.4 }); }
    if (me && match.poss === me.side) cueArmed = true;
    renderMatchUI();
    // their attack just went over the net toward me: was there a block on it?
    if (me && isAttack(match.lastPart) && match.last && match.last !== me.side && P.sideOfX(ball.x) === me.side) onAttackCross(e);
    if (isAttack(match.lastPart) && (mode === 'cpu' || (teamMode() && mode === 'host'))) {
      const blockers = teamMode() ? [...others.values()].filter((q) => q.kind === 'cpu') : [them].filter(Boolean);
      for (const q of blockers) if (q.side === P.sideOfX(ball.x) && match.last !== q.side && cpuTryBlock(q, e)) break;
    }
    return;
  }
  if (e.type === 'net') {
    landingDirty = true;
    sfx.net(pan); shake(0.15);
    fx.emit(e.x, e.y, e.z, { n: 35, color: [0xdfe8ff, 0xffffff, 0x9fe0ff], bright: 1.8, speed: 2.4, up: 0.8, life: 0.5, size: 0.08 });
    fx.flash(e.x, e.y, e.z, { color: 0xdfe8ff, size: 1.4 });
    return;
  }
  const half = P.sideOfX(e.x);
  let loser, reason;
  if (e.type === 'wide' || e.type === 'under') { loser = match.last || other(half); reason = e.type === 'wide' ? 'WIDE' : 'UNDER'; }
  else if (match.phase === 'serve-toss') { loser = match.server; reason = 'DROP'; }
  else if (e.type === 'floor' && P.inCourt(e.x, e.z)) { loser = half; reason = 'IN'; }
  else { loser = match.last || half; reason = 'OUT'; }

  // impact juice
  if (e.type === 'floor') {
    const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
    sfx.bounce(Math.min(1, sp / 14), pan);
    const inC = P.inCourt(e.x, e.z);
    fx.ring(e.x, e.z, { color: inC ? 0xffffff : 0xff6a4a, r: 1.4 + sp * 0.08 });
    fx.ring(e.x, e.z, { color: inC ? 0x9fe0ff : 0xffb36b, r: 0.8 + sp * 0.04, life: 0.3 });
    fx.emit(e.x, 0.05, e.z, { n: 40 + Math.round(sp * 3), color: inC ? [0xcfe3ff, 0xffffff, 0x9fb4c8] : [0xff8a6a, 0xffc0a0], bright: 1.0, speed: 2.4 + sp * 0.12, up: 2 + sp * 0.1, life: 0.8, size: 0.11 });
    fx.flash(e.x, 0.2, e.z, { color: inC ? 0xffffff : 0xff6a4a, size: 1.6 + sp * 0.08 });
    if (ballFire) fx.emit(e.x, 0.1, e.z, { n: 90, color: PAL.fire, bright: 2, speed: 5, up: 3.5, life: 1.1, size: 0.16 });
    shake(Math.min(0.45, sp * 0.025));
  } else if (e.type === 'board') { sfx.board(pan); shake(0.2); }
  if (e.type === 'floor' || e.type === 'board') startDeadBall();

  if (decidesHalf(half)) endRally(loser, reason);
  else { ballLive = false; frozenEnd = { loser, reason }; frozenTimer = 0; }   // the other player's machine calls it
}

function startDeadBall() {
  deadBall.on = true;
  ball.vy = Math.abs(ball.vy) * 0.5;
  ball.vx *= 0.6; ball.vz *= 0.6;
  ball.y = P.BALL_R;
}
function stepDeadBall(dt) {
  if (!deadBall.on) return;
  ball.vy -= P.G * dt;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
  if (ball.y <= P.BALL_R) {
    ball.y = P.BALL_R;
    if (ball.vy < -0.6) { sfx.bounce(Math.min(0.5, -ball.vy / 10), panOf(ball.x, 0, ball.z)); ball.vy = -ball.vy * 0.5; }
    else ball.vy = 0;
    ball.vx *= 0.8; ball.vz *= 0.8;
  }
  if (Math.abs(ball.x) > P.C.outX - 0.1) ball.vx = -ball.vx * 0.4;
  if (Math.abs(ball.z) > P.C.outZ - 0.1) ball.vz = -ball.vz * 0.4;
}

function endRally(loser, reason) {
  ballLive = false; pending = null;
  if (isAuthority()) applyPoint(loser, reason);
  else if (conn && conn.open) conn.send({ t: 'end', r: match.rally, loser, reason });
}

function applyPoint(loser, reason) {
  if (!['rally', 'serve-toss', 'serve-wait'].includes(match.phase)) return;
  const winner = other(loser);
  match.score[winner]++;
  match.winner = winner; match.reason = reason;
  if (mode !== 'solo') {
    match.serveCount++;
    if (match.serveCount >= 3) { match.serveCount = 0; match.server = other(match.server); if (teamMode()) pickServer(match.server); }
    const a = match.score.left, b = match.score.right;
    if (Math.max(a, b) >= WIN_SCORE && !training) match.over = true;   // first to 7 wins (training never ends)
  }
  match.phase = 'point';
  pointTimer = 2.0;
  ballLive = false; frozenEnd = null;
  broadcastMatch();
  onMatchChanged('point');
}

function nextServe() {
  // (aim is NOT reset here — it only resets after you take your shot, so you can line up the next one any time)
  match.rally++;
  match.phase = mode === 'solo' ? 'idle' : match.over ? 'over' : 'serve-wait';
  match.poss = null; match.cnt = 0; match.last = null; match.settled = false;
  ballLive = false; pending = null; deadBall.on = false;
  broadcastMatch();
  onMatchChanged(match.phase);
}

function resetMatch() {
  Object.assign(match, {
    phase: mode === 'solo' ? 'idle' : 'serve-wait', rally: match.rally + 1,
    score: { left: 0, right: 0 }, server: Math.random() < 0.5 ? 'left' : 'right', serveCount: 0,
    poss: null, cnt: 0, last: null, settled: false, winner: null, reason: '', over: false,
  });
  if (teamMode()) { match.srvIdx = { left: -1, right: -1 }; pickServer(match.server); }
  ballLive = false; pending = null; frozenEnd = null; deadBall.on = false;
  broadcastMatch();
  onMatchChanged(match.phase);
}

function broadcastMatch() {
  if (mode !== 'host') return;
  if (teamMode()) netSend({ t: 'match', m: JSON.parse(JSON.stringify(match)) });
  else if (conn && conn.open) conn.send({ t: 'match', m: JSON.parse(JSON.stringify(match)) });
}
// team games: the serve passes between teammates each time their side wins it back
function pickServer(side) {
  const L = onSide(side);
  if (!L.length) return;
  match.srvIdx = match.srvIdx || { left: -1, right: -1 };
  match.srvIdx[side] = (match.srvIdx[side] + 1) % L.length;
  match.serverId = L[match.srvIdx[side]].id;
}

// ball position for the serve: a little forward and out to the kicking (screen-right) side
function heldOffset(p) {
  const fx_ = Math.sin(p.facing), fz_ = Math.cos(p.facing);
  const s = sideSign(p.side);
  return { x: fx_ * 0.22, z: fz_ * 0.22 + s * 0.42, fx: fx_, fz: fz_ };
}

// put the server in their circle, facing the net
function snapToServe() {
  if (!me) return;
  const s = sideSign(me.side);
  me.pos.set(-s * (F.hl - F.serveFromBack), 0, 0);
  me.vel.set(0, 0, 0); me.y = 0; me.vy = 0;
  me.facing = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  fx.ring(me.pos.x, me.pos.z, { color: 0x9fdcff, r: 1.0, life: 0.5 });
}

// serve toss (J)
function tossServe() {
  if (!me) return;
  const o = heldOffset(me);
  setBall({ x: me.pos.x + o.x, y: 1.0, z: me.pos.z + o.z, vx: o.fx * 0.25, vy: 5.6, vz: o.fz * 0.25 });
  ballLive = true;
  match.phase = 'serve-toss'; match.server = me.side;
  if (teamMode()) match.serverId = myId;
  match.poss = null; match.cnt = 0; match.last = null;
  me.action = { part: 'toss', t: 0 };
  cueArmed = true;
  contactJuice('toss', '', ball, true);
  sendTouch('toss');
  renderMatchUI();
}

// practice ball machine (F)
function feedBall() {
  const s = sideSign(me.side);
  // practice feeds are always friendly: a high, slow lob into the middle of your court (never a spike or a drive)
  const tx = -s * (2.6 + Math.random() * 3.2), tz = (Math.random() - 0.5) * 4.0;
  const from = { x: s * 5.0, y: 1.1, z: (Math.random() - 0.5) * 2.4 };
  const shot = P.solveApex(from, { x: tx, z: tz }, 4.4 + Math.random() * 0.8, true);
  setBall(shot);
  ballLive = true;
  match.phase = 'rally'; match.poss = other(me.side); match.cnt = 1; match.last = other(me.side); match.settled = false;
  match.lastPart = 'clear';   // machine lobs count as clears — practise your smash on them
  cueArmed = true;
  sfx.machine(panOf(shot.x, shot.y, shot.z));
  fx.emit(shot.x, shot.y, shot.z, { n: 10, color: 0xffffff, speed: 1.4, life: 0.4 });
  renderMatchUI();
}

function updateBall(dt) {
  touchCd = Math.max(0, touchCd - dt * BALL_TIME);
  recoverT = Math.max(0, recoverT - dt);
  blockCd = Math.max(0, blockCd - dt);
  if (pendingCross && simTime - pendingCross.t > pendingCross.win.good) pendingCross = null;

  // inputs
  if (jQ) {
    jQ = false;
    if (mode === 'solo' && match.phase === 'idle') {             // practice: J walks you to the circle, J again tosses
      match.phase = 'serve-wait'; match.server = me.side; snapToServe(); sfx.yourServe(); renderMatchUI();
    } else if (match.phase === 'serve-wait' && iServe()) tossServe();
    else tapSwing('J');
  }
  if (kQ) { kQ = false; tapSwing('K'); }
  if (lQ) { lQ = false; tryBlock(); }
  if (fQ) { fQ = false; if (mode === 'solo' && (match.phase === 'idle' || match.phase === 'serve-wait')) feedBall(); }

  updateBulletTime(dt);
  // fixed-step physics, slowed by BALL_TIME (and by bullet time during attacks; held for a beat after a stuff block)
  if (hitStop > 0) hitStop -= dt;
  else if (ballLive) {
    acc += dt * BALL_TIME * btScale;
    let n = 0;
    while (acc >= P.STEP && n < 40) { acc -= P.STEP; n++; physStep(true); if (!ballLive) { acc = 0; break; } }
  } else stepDeadBall(dt * BALL_TIME);

  if (frozenEnd && isAuthority()) {
    frozenTimer += dt;
    if (frozenTimer > 3) { const f = frozenEnd; frozenEnd = null; applyPoint(f.loser, f.reason); }
  }
  if (match.phase === 'point' && isAuthority()) {
    pointTimer -= dt;
    if (pointTimer <= 0) nextServe();
  }

  // ball trail at speed
  if (ballLive) {
    const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
    if (ballFire) {
      fx.emit(ball.x, ball.y, ball.z, { n: 4, color: PAL.fire, bright: 2.2, speed: 0.6, up: 0.6, life: 0.45, size: 0.2, g: -1.5 });
      fx.emit(ball.x, ball.y, ball.z, { n: 1, color: 0x332222, bright: 0.6, speed: 0.3, up: 0.8, life: 0.8, size: 0.25, g: -1 });
    } else if (match.lastPart === 'serve-snap' && match.phase === 'rally') {   // SNAP: thin, sharp, cool streaks
      fx.emit(ball.x, ball.y, ball.z, { n: 3, color: [0xcfeaff, 0xffffff], bright: 1.8, speed: 0.05, up: 0, life: 0.16, size: 0.05, g: 0 });
    } else if (match.lastPart === 'serve-hang' && match.phase === 'rally') {   // HANG: soft, warm smoke that lingers
      fx.emit(ball.x, ball.y, ball.z, { n: 2, color: [0xffc98a, 0xffe2bf], bright: 0.9, speed: 0.25, up: 0.15, life: 0.9, size: 0.2, g: -0.3 });
    } else if (sp > 12) fx.emit(ball.x, ball.y, ball.z, { n: 3, color: PAL.warm, bright: 1.6, speed: 0.2, up: 0, life: 0.3, size: 0.12, g: 0 });
    else fx.emit(ball.x, ball.y, ball.z, { n: 1, color: [0xffe6a8, 0xffffff], bright: 1.1, speed: 0.1, up: 0, life: 0.22, size: 0.07, g: 0 });
    // whoosh when a fast ball goes by
    if (sp > 13 && performance.now() - lastWhoosh > 450) { lastWhoosh = performance.now(); sfx.whoosh(panOf(ball.x, ball.y, ball.z)); }
  }

  renderBall(dt);
}

function renderBall(dt) {
  let visible = false;
  if (match.phase === 'serve-wait') {
    const h = teamMode() ? playerById(match.serverId) : playerBySide(match.server);
    if (h) {
      const bob = Math.sin(performance.now() / 260) * 0.03;
      const o = heldOffset(h);
      ball.x = h.pos.x + o.x; ball.z = h.pos.z + o.z; ball.y = 1.0 + h.y + bob;
      visible = true;
    }
  } else if (ballLive || match.phase === 'point' || frozenEnd || deadBall.on) visible = true;
  ballMesh.visible = visible;
  ballShadow.visible = visible;
  if (visible) {
    ballMesh.position.set(ball.x, Math.max(ball.y, BALL_VR), ball.z);   // big ball never sinks into the floor
    ballMesh.rotation.x += ball.vz * dt * 6;
    ballMesh.rotation.z -= ball.vx * dt * 6;
    ballShadow.position.set(ball.x, 0.006, ball.z);
    ballShadow.scale.setScalar(1 + ball.y * 0.15);
    ballShadow.material.opacity = 0.6 / (1 + ball.y * 0.5);
  }

  // landing prediction (always computed — the smash warning needs it — but only drawn if the marker is on)
  landMark.visible = false;
  if (ballLive) {
    if (landingDirty || !landingCache) { const r = P.simulate(ball, 4); landingCache = r.end; landingDirty = false; }
    // (separate landing marker retired — the aim markers slide to the real landing spot instead)
  }
  landMark.rotation.y += dt * 2;
  if (me) updateSmashMark();

  // timing ring: shows how long until the sweet spot (if the ball will come into reach)
  timingRing.visible = false;
  if (myBall() && !pending && touchCd <= 0 && !smashIncoming()) {
    const kind = match.phase === 'serve-toss' ? 'K' : 'J';
    const c = findContact(me, prefFor(kind), false);
    if (c.d <= REACH && c.tau <= 0.7) {
      const tReal = toReal(c.tau);
      const k = THREE.MathUtils.clamp(tReal / 0.7, 0, 1);
      const sz = BALL_VR * 2.4 * (1 + 2.2 * k);
      timingRing.visible = false;               // (retired — the meter above your head handles timing)
      timingRing.position.set(ball.x, Math.max(ball.y, BALL_VR), ball.z);
      timingRing.scale.setScalar(sz);
      const inWin = c.tau <= PERFECT;
      timingRing.material.color.set(inWin ? 0x5fd38a : k < 0.35 ? 0xf2b544 : 0xffffff).multiplyScalar(inWin ? 2.2 : 1.4);
      timingRing.material.opacity = 0.35 + (1 - k) * 0.65;
      if (inWin && cueArmed) { cueArmed = false; sfx.cue(); }
    } else cueArmed = true;
  }

  updateAim(dt);
  // everyone drops into a ready stance while the ball is coming to their side
  const comingTo = ballLive && match.phase === 'rally' ? (landingCache ? P.sideOfX(landingCache.x) : P.sideOfX(ball.x)) : null;
  for (const q of everyone()) q.ready = comingTo === q.side || (ballLive && match.phase === 'rally' && P.sideOfX(ball.x) === q.side);

  fx.update(dt);
  updateSideGlow(dt);
  updateOppAim(dt);
  updateDropZone(dt);
  updateBlockFx(dt);
  updateApproach();
  updateFloatTiming();
  updateHint();
}

/* ---------------- remote ---------------- */
function onRemoteTouch(msg) {
  if (msg.r !== match.rally || !Array.isArray(msg.b)) return;
  setBall(unpackBall(msg.b.map((v) => (Number.isFinite(v) ? v : 0))));
  ballLive = true; frozenEnd = null;
  if (msg.phase === 'serve-toss' || msg.phase === 'rally') match.phase = msg.phase;
  if (msg.part === 'toss') { match.server = msg.side; if (teamMode() && msg.id) match.serverId = msg.id; }
  match.poss = msg.poss; match.cnt = msg.cnt; match.last = msg.last; match.settled = !!msg.settled;
  match.lastPart = msg.part;
  const who = (teamMode() && playerById(msg.id)) || them;
  if (who && who !== me) { who.action = { part: msg.part, t: 0 }; if (Number.isFinite(msg.mt)) who.meter = msg.mt; }
  if (msg.part === 'ult') ballFire = true;
  renderMeter();
  contactJuice(msg.part, '', ball, false);
  // catch up for the time the message spent travelling
  const steps = Math.round((Math.min(0.15, rtt / 2000) * BALL_TIME * (isAttack(msg.part) ? BT_SCALE : 1)) / P.STEP);
  for (let i = 0; i < steps && ballLive; i++) physStep(false);
  renderMatchUI();
}

function onRemoteMatch(m) {
  if (!m || typeof m !== 'object') return;
  const prev = match.phase;
  Object.assign(match, m);
  if (match.phase !== 'rally' && match.phase !== 'serve-toss') { ballLive = false; pending = null; }
  frozenEnd = null;
  if (match.phase !== prev) onMatchChanged(match.phase);
  else renderMatchUI();
}

/* ---------------- contact poses ---------------- */
const ACTION_DURS = { dig: 0.5, win: 1.0, lose: 1.3, wai: 1.3, celebrate: 1.5, dink: 0.45, 'serve-snap': 0.26, 'serve-hang': 0.6, clear: 0.4, smash: 0.5, ult: 0.85, bicycle: 0.8, dheader: 0.6, volley: 0.5, spike: 0.62, shank: 0.45, 'serve-power': 0.42, block: 0.45, stuff: 0.5 };
// rotate the body around the hips (not the feet) so flips and dives look right
function hipPivot(p, rx, rz = 0) {
  const h = 0.95;
  p.body.rotation.x = rx; p.body.rotation.z = rz;
  p.body.position.y += h - h * Math.cos(rx) * Math.cos(rz);
  p.body.position.z -= h * Math.sin(rx);
  p.body.position.x += h * Math.sin(rz);
}
function actionPose(p, part, e, u = 0) {
  const [L0, L1] = p.legs;
  switch (part) {
    case 'foot':
      L1.hip.rotation.x = -0.55 * e; L1.hip.rotation.z = 0.95 * e; L1.knee.rotation.x = 1.25 * e; break;
    case 'knee':
      L1.hip.rotation.x = -1.55 * e; L1.knee.rotation.x = 1.9 * e; break;
    case 'chest':
      hipPivot(p, -0.45 * e); for (const A of p.arms) A.sh.rotation.z = A.sx * 1.1 * e; break;
    case 'head':
      hipPivot(p, 0.4 * e); break;
    case 'dink':             // looks like a spike take-off, then just a gentle chip with the instep
      L1.hip.rotation.x = -1.1 * e; L1.hip.rotation.z = 0.5 * e; L1.knee.rotation.x = 0.7 * (1 - e) + 0.2;
      L0.hip.rotation.x = -0.6 * e; L0.knee.rotation.x = 1.1 * e; hipPivot(p, -0.15 * e);
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 1.4 * e; A.sh.rotation.x = -0.3 * e; }
      break;
    case 'serve-snap':       // quick, short flick — barely any wind-up
      L1.hip.rotation.x = -1.2 * e; L1.knee.rotation.x = 0.6 * (1 - e); hipPivot(p, -0.12 * e);
      for (const A of p.arms) A.sh.rotation.z = A.sx * 0.5 * e; break;
    case 'serve-hang': {     // big, slow wind-up and a high follow-through
      const wind = u < 0.35 ? u / 0.35 : 1, thru = u < 0.35 ? 0 : (u - 0.35) / 0.65;
      L1.hip.rotation.x = 0.7 * wind * (1 - thru) - 2.3 * thru * e; L1.knee.rotation.x = 0.9 * (1 - thru) + 0.1;
      hipPivot(p, 0.15 * wind * (1 - thru) - 0.45 * thru * e); p.body.position.y += 0.12 * thru * e;
      for (const A of p.arms) A.sh.rotation.z = A.sx * (0.6 + 0.9 * thru) * e; break;
    }
    case 'clear': case 'kick': case 'serve':
      L1.hip.rotation.x = -1.75 * e; L1.knee.rotation.x = 0.35 * (1 - e); hipPivot(p, -0.28 * e);
      for (const A of p.arms) A.sh.rotation.z = A.sx * 0.8 * e; break;
    case 'serve-power':      // hop into a full-extension kick
      p.body.position.y += 0.25 * e;
      L1.hip.rotation.x = -2.1 * e; L1.knee.rotation.x = 0.1; L0.hip.rotation.x = 0.4 * e; hipPivot(p, -0.4 * e);
      for (const A of p.arms) A.sh.rotation.z = A.sx * 1.2 * e; break;
    case 'smash':
    case 'ult':
    case 'spike': {          // sideways 360° spin: kicking leg swung out to the side, side of the foot meets the ball
      const spin = u < 1 ? u * u * (3 - 2 * u) : 1;        // smooth full turn
      hipPivot(p, 0, -Math.PI * (part === 'ult' ? 4 : 2) * spin);   // the Ultimate spins twice
      L1.hip.rotation.z = 1.55 * e; L1.hip.rotation.x = -0.35 * e; L1.knee.rotation.x = 0.08;   // leg out sideways, straight
      L0.hip.rotation.x = -0.7 * e; L0.knee.rotation.x = 1.3 * e;                                 // other leg tucked
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 1.4 * e; A.sh.rotation.x = -0.3 * e; }
      break;
    }
    case 'bicycle': {        // overhead scissor: a full backward 360 — it keeps rotating the same way and lands upright
      p.body.position.y += 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.1));
      hipPivot(p, -Math.PI * 2 * sstep(u));
      const a = Math.min(1, u * 2.2), b2 = Math.max(0, Math.min(1, u * 2.2 - 0.5));
      L0.hip.rotation.x = -1.9 * Math.sin(Math.PI * a) * e;
      L1.hip.rotation.x = -2.9 * Math.sin(Math.PI * b2) * e - 0.4 * e;
      L0.knee.rotation.x = 0.6 * e; L1.knee.rotation.x = 0.15;
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 1.5 * e; A.sh.rotation.x = 0.4 * e; }
      break;
    }
    case 'dheader':          // launch forward, legs trailing
      p.body.position.y += 0.45 * e;
      hipPivot(p, 1.1 * e);
      L0.hip.rotation.x = 0.9 * e; L1.hip.rotation.x = 0.6 * e; L0.knee.rotation.x = 0.5 * e; L1.knee.rotation.x = 0.8 * e;
      for (const A of p.arms) { A.sh.rotation.x = 0.9 * e; A.sh.rotation.z = A.sx * 0.5 * e; }
      break;
    case 'volley':           // side scissor volley: body tilts, kicking leg sweeps across
      p.body.position.y += 0.35 * e;
      hipPivot(p, -0.3 * e, -0.85 * e);
      L1.hip.rotation.x = -1.6 * e; L1.hip.rotation.z = 0.9 * e; L1.knee.rotation.x = 0.2;
      L0.hip.rotation.x = 0.5 * e;
      for (const A of p.arms) A.sh.rotation.z = A.sx * 1.2 * e;
      break;
    case 'shank':            // mistimed: off-balance stab at it
      hipPivot(p, -0.2 * e, 0.35 * e);
      L1.hip.rotation.x = -0.9 * e; L1.hip.rotation.z = -0.4 * e; L1.knee.rotation.x = 0.9 * e;
      p.arms[0].sh.rotation.x = -1.6 * e; p.arms[1].sh.rotation.x = 0.6 * e;
      break;
    case 'toss':
      for (const A of p.arms) { A.sh.rotation.x = -2.1 * e; A.el.rotation.x = -0.2; } break;
    case 'block':            // no hands: torso twists into it and the kicking leg sweeps up to wall off the net
    case 'stuff':
      hipPivot(p, -0.35 * e, -0.25 * e);
      L1.hip.rotation.x = -1.7 * e; L1.hip.rotation.z = 0.5 * e; L1.knee.rotation.x = 0.15;
      L0.hip.rotation.x = 0.3 * e; L0.knee.rotation.x = 0.6 * e;
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 0.9 * e; A.sh.rotation.x = 0.3 * e; }
      break;
    case 'body':
      hipPivot(p, -0.25 * e); break;
    case 'dig':              // low lunge under it
      p.body.position.y -= 0.16 * e; hipPivot(p, -0.25 * e);
      L1.hip.rotation.x = -1.05 * e; L1.knee.rotation.x = 0.45; L0.hip.rotation.x = 0.35 * e; L0.knee.rotation.x = 1.25 * e;
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 0.9 * e; A.sh.rotation.x = -0.2 * e; }
      break;
    case 'win': {            // fist pump + little hop
      const pump = Math.abs(Math.sin(u * Math.PI * 3));
      p.body.position.y += 0.12 * pump * e;
      p.arms[1].sh.rotation.x = -2.6 * e; p.arms[1].el.rotation.x = -1.2 * e * (0.6 + 0.4 * pump);
      p.arms[0].sh.rotation.x = 0.2 * e; p.arms[0].el.rotation.x = -1.4 * e;
      if (p.headG) p.headG.rotation.x = -0.25 * e;
      break;
    }
    case 'lose':             // hands on knees
      p.body.position.y -= 0.1 * e; hipPivot(p, 0.75 * e);
      for (const L of p.legs) L.knee.rotation.x = 0.5 * e;
      for (const A of p.arms) { A.sh.rotation.x = -0.75 * e; A.el.rotation.x = -0.2; A.sh.rotation.z = A.sx * 0.15; }
      if (p.headG) p.headG.rotation.x = 0.35 * e;
      break;
    case 'wai':              // palms together at the chest, small bow
      hipPivot(p, 0.32 * Math.sin(Math.min(1, u * 1.6) * Math.PI) * e);
      for (const A of p.arms) { A.sh.rotation.x = -0.75 * e; A.sh.rotation.z = -A.sx * 0.5 * e; A.el.rotation.x = -1.55 * e; }
      if (p.headG) p.headG.rotation.x = 0.3 * e;
      break;
    case 'celebrate': {      // big jump, both arms up
      const hop = Math.max(0, Math.sin(u * Math.PI * 2));
      p.body.position.y += 0.45 * hop * e;
      for (const A of p.arms) { A.sh.rotation.x = -2.9 * e; A.sh.rotation.z = A.sx * 0.35 * e; A.el.rotation.x = -0.2; }
      for (const L of p.legs) { L.knee.rotation.x = 0.7 * hop * e; L.hip.rotation.x = -0.4 * hop * e; }
      break;
    }
  }
}

/* ---------------- HUD ---------------- */
const REASON = {
  IN: 'Ball down', OUT: 'Out', WIDE: 'Outside the tapes', UNDER: 'Under the net',
  FOUR: 'Four touches', FOOT: 'Foot fault', DROP: 'Serve dropped', DIG: 'Missed the dig',
};
function sideName(side) {
  if (!me) return '';
  if (teamMode()) return side === me.side ? 'Blue' : 'Red';
  if (side === me.side) return myName;
  if (mode === 'solo') return 'Ball machine';
  return (them && them.displayName) || 'Opponent';
}
let lastServeAnnounce = -1;
function renderMatchUI() {
  if (!me) return;
  // your score is always on the left, theirs on the right
  $('sc-left').textContent = match.score[me.side];
  $('sc-right').textContent = match.score[other(me.side)];
  $('srv-left').classList.toggle('on', mode !== 'solo' && match.server === 'left');
  $('srv-right').classList.toggle('on', mode !== 'solo' && match.server === 'right');
  const mineCnt = match.poss === me.side && match.phase === 'rally' ? match.cnt : 0;
  const pips = document.querySelectorAll('#touch-pips i');
  pips.forEach((el, i) => el.classList.toggle('on', i < mineCnt));
  $('touch-chip').classList.toggle('dim', match.poss !== me.side);
  renderMeter();
}
let bannerTimer = null;
function showBanner(title, sub, color) {
  const b = $('banner');
  b.querySelector('.bn-title').textContent = title;
  b.querySelector('.bn-sub').textContent = sub || '';
  b.style.setProperty('--bn', color || 'var(--gold)');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 1700);
}
function onMatchChanged(phase) {
  renderMatchUI();
  const over = $('gameover');
  if (phase === 'point' && match.winner) {
    // reactions: winners pump a fist (or celebrate the match), losers put their hands on their knees
    setTimeout(() => {
      for (const q of everyone()) if (!q.action) q.action = { part: q.side === match.winner ? (match.over ? 'celebrate' : 'win') : 'lose', t: 0 };
    }, 250);
    const mineWon = me && match.winner === me.side;
    const title = mode === 'solo' ? (mineWon ? 'Winner!' : 'Point lost') : `Point ${sideName(match.winner)}`;
    showBanner(title, REASON[match.reason] || '', mineWon ? 'var(--blue)' : 'var(--orange)');
    sfx.whistle();
    if (mineWon) { sfx.cheer(match.reason === 'IN' ? 1 : 0.6); shake(0.2); } else sfx.groan();
    if (!mineWon && match.reason === 'IN') setMeter(0);   // you missed it: meter empties
    if (mineWon && ball) {
      fx.emit(ball.x, 0.3, ball.z, { n: 120, color: PAL.confetti, bright: 1.6, speed: 4, up: 6, life: 1.8, size: 0.12, g: 6 });
      if (me) fx.emit(me.pos.x, 1.2, me.pos.z, { n: 60, color: PAL.confetti, bright: 1.6, speed: 2.5, up: 5, life: 1.5, size: 0.1, g: 6 });
    }
  }
  // a wai before the first serve of the match
  if (phase === 'serve-wait' && match.score.left === 0 && match.score.right === 0) {
    const sv = teamMode() ? playerById(match.serverId) : playerBySide(match.server);
    if (sv) setTimeout(() => { if (match.phase === 'serve-wait' && !sv.action) sv.action = { part: 'wai', t: 0 }; }, 150);
  }
  if (phase === 'serve-wait' && me && iServe() && lastServeAnnounce !== match.rally) {
    lastServeAnnounce = match.rally;
    snapToServe();
    sfx.yourServe();
  }
  if (phase === 'over' || (match.over && phase !== 'serve-wait' && phase !== 'point')) {
    const w = match.score.left > match.score.right ? 'left' : 'right';
    $('go-title').textContent = `${sideName(w)} wins`;
    $('go-score').textContent = me ? `${match.score[me.side]} – ${match.score[other(me.side)]}` : `${match.score.left} – ${match.score.right}`;
    $('rematch-btn').classList.toggle('hidden', !isAuthority());
    $('go-wait').classList.toggle('hidden', isAuthority());
    if (over.classList.contains('hidden') && me && w === me.side) sfx.win();
    over.classList.remove('hidden');
  } else over.classList.add('hidden');
}

let lastHint = '';
function updateHint() {
  if (!me) return;
  let h = '';
  const atNet = Math.abs(me.pos.x) <= BLOCK_X + 0.3;
  const spot = (them && them.tele) || (smashIncoming() ? landingCache : null);
  const shortSmash = smashWarn.on && spot && shortK(spot.x) > 0.5;
  if (shortSmash) h = atNet ? 'SHORT smash  ·  L  block it as it crosses the net' : 'SHORT smash  ·  get to the NET and block (L)';
  else if (smashWarn.on) h = smashWarn.inPos ? 'In position  ·  J on GREEN to dig' : atNet && !smashIncoming() ? 'L  block as it crosses  ·  or get to the ring' : 'Smash incoming  ·  get to the ring';
  else if (match.phase === 'idle') h = 'J  serve      F  ball feed';
  else if (match.phase === 'wait') h = 'Waiting for the host…';
  else if (match.phase === 'serve-wait') h = iServe() ? `J  toss  ·  then on green:  J snap (fast)  ·  K hang (floaty)  ·  arrows aim` : (teamMode() && match.server === me.side ? `${(playerById(match.serverId) || {}).displayName || 'Teammate'} to serve` : `${sideName(match.server)} to serve`);
  else if (match.phase === 'serve-toss' && iServe()) h = 'On green:  J snap  ·  K hang';
  else if (match.phase === 'rally' && match.poss === me.side && !(approach && !approach.dead) && P.sideOfX(ball.x) === me.side) h = 'Tap J set  ·  K kick on green   ·   arrows  aim';
  if (h !== lastHint) { lastHint = h; $('hint').textContent = h; $('hint').classList.toggle('hidden', !h); }
}

// timing meter that floats above your head
let floatT = 0;
function showTiming(err, label, part, sub = '') {
  const el = $('tm-float');
  const mk = $('tmf-marker');
  if (err === null) mk.style.opacity = '0';
  else { mk.style.opacity = '1'; mk.style.left = `${THREE.MathUtils.clamp(G_CENTER + err, 0, 1) * 100}%`; }
  $('tmf-label').textContent = label;
  $('tmf-label').className = 'tmf-label ' + label.toLowerCase().replace(/\s+/g, '-');
  $('tmf-part').textContent = (part ? PART_NAME[part] || '' : '') + (sub ? ' · ' + sub : '');
  $('tmf-fill').style.width = '0%';
  $('tmf-zone').style.opacity = '1'; $('tmf-near').style.opacity = '1';
  setMeterZones();
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  floatT = 1.4;
}
const _hv = new THREE.Vector3();
function updateFloatTiming() {
  const el = $('tm-float');
  if (!me || floatT <= 0) { el.style.opacity = '0'; return; }
  floatT -= 1 / 60;
  _hv.set(me.pos.x, me.y + 2.15, me.pos.z).project(camera);
  el.style.transform = `translate(${(_hv.x * 0.5 + 0.5) * window.innerWidth}px, ${(-_hv.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
  el.style.opacity = String(Math.min(1, floatT * 2.5));
}

/* ---------------- help overlay ---------------- */
const helpEl = () => document.getElementById('howto');
const helpOpen = () => !helpEl().classList.contains('hidden');
function toggleHelp(force) {
  const open = force === undefined ? !helpOpen() : force;
  helpEl().classList.toggle('hidden', !open);
  if (open) keys.clear();
  sfx.ui();
}

/* =====================================================================
   CPU OPPONENT — plays the right side in "Play vs CPU" (full rules, local)
   It reads the ball, runs to the contact point after a short reaction delay,
   controls / sets / kicks / jump-spikes, digs smashes sometimes, serves,
   aims away from you, and lets balls that are going out drop.
   ===================================================================== */
const CPU_LEVELS = {
  easy:   { react: 0.42, speed: 3.1, perfect: 0.25, good: 0.45, spike: 0.2, dig: 0.3,  readOut: 0.5,  serveDelay: 1.8, feint: 0.05, block: 0.25 },
  normal: { react: 0.26, speed: 3.7, perfect: 0.45, good: 0.4,  spike: 0.5, dig: 0.55, readOut: 0.85, serveDelay: 1.4, feint: 0.12, block: 0.5 },
  hard:   { react: 0.14, speed: 4.3, perfect: 0.7,  good: 0.25, spike: 0.8, dig: 0.8,  readOut: 1.0,  serveDelay: 1.1, feint: 0.2, block: 0.75 },
  // training bot: perfect every time, gets to everything, never plays a ball that's going out
  train:  { react: 0.04, speed: 9.0, perfect: 1.0,  good: 0,    spike: 1.0, dig: 1.0,  readOut: 1.0,  serveDelay: 1.0, feint: 0, block: 1.0 },
};
let cpuLevel = 'normal';
try { cpuLevel = localStorage.getItem('takraw-cpu') || 'normal'; } catch {}
// TRAINING: an unbeatable bot whose move you pick in-game with 1–5 (the normal CPU always plays mixed)
let training = false;
let trainDrill = 'mixed';
try { trainDrill = localStorage.getItem('takraw-drill') || 'mixed'; } catch {}
const DRILLS = ['mixed', 'smash', 'spike', 'clear', 'kick', 'feint'];
const DRILL_NAMES = { mixed: 'Mixed', smash: 'Always smash', spike: 'Set + spike', clear: 'High clear', kick: 'Kick back', feint: 'Feint' };
const cpuMoveNow = () => (training ? trainDrill : 'mixed');
// each CPU can have its own level (team rooms); training = the unbeatable bot
const cpuLvlOf = (p) => (training ? 'train' : (p && p.level) || cpuLevel);
const cpuL = (p) => CPU_LEVELS[cpuLvlOf(p)];
const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', train: 'Unbeatable' };
function setDrill(d) {
  if (!DRILLS.includes(d)) return;
  trainDrill = d;
  try { localStorage.setItem('takraw-drill', d); } catch {}
  for (const r of document.querySelectorAll('#train-panel .tp-row')) r.classList.toggle('on', r.dataset.d === d);
  if (training && playing) { ui.ping.textContent = `TRAINING · ${DRILL_NAMES[d].toUpperCase()}`; showBanner(DRILL_NAMES[d], 'training bot', 'var(--gold)'); }
}
const cpu = { serial: -1, reactT: 0, target: null, plan: null, swung: false, serveT: 0, served: false, willPlay: true, digOk: false, cell: null, pickAimSoon: true };
let ballSerial = 0;                      // bumps every time the ball's flight changes (any touch)

const cpuOn = () => mode === 'cpu' && !!them;
function cpuRollTier(p) {
  const L = cpuL(p), r = Math.random();
  return r < L.perfect ? 2 : r < L.perfect + L.good ? 1 : 0;
}
// pick one of the 9 spots on my (the human's) side, preferring ones far from where I'm standing
function cpuPickAim(p, ai) {
  const s = sideSign(p.side);
  const opp = teamMode() ? allPlayers().filter((q) => q.side !== p.side) : [me].filter(Boolean);
  let best = null, bestScore = -1;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = s * AIM_ROWS[r], z = s * AIM_COLS[c];
    const d = opp.length ? Math.min(...opp.map((q) => Math.hypot(x - q.pos.x, z - q.pos.z))) : 3;
    const score = d + Math.random() * 2.5;
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  ai.cell = best;
  p.aim = { x: best.x, z: best.z };            // shows as their red aim spot on your court
  return best;
}
// where (on my side) the ball first drops through height h, if it does
function cpuIntercept(p, h) {
  const b = P.copyBall(ball), s = sideSign(p.side);
  for (let t = 0; t < 4;) {
    t += P.STEP * 4;
    const end = P.step(b, P.STEP * 4, null);
    if (b.vy < 0 && b.y <= h && P.sideOfX(b.x) === p.side) return { x: b.x, z: b.z };
    if (end) return P.sideOfX(b.x) === p.side ? { x: b.x, z: b.z } : null;
  }
  void s;
  return null;
}

function cpuStartMatch() {
  Object.assign(cpu, { serial: -1, reactT: 0, target: null, plan: null, swung: false, serveT: 0, served: false, pickAimSoon: true });
}
const newAI = () => ({ serial: -1, reactT: 0, target: null, plan: null, swung: false, serveT: 0, served: false, willPlay: true, digOk: false, cell: null, pickAimSoon: true });

// ---- the CPU makes a touch (mirrors the human's doTouch rules, with a rolled timing tier) ----
function cpuShot(p, ai, kind, tier, plan = null) {
  const s = sideSign(p.side);
  if (!ballLive) return;
  const isServe = match.phase === 'serve-toss';
  if (!isServe && match.poss === p.side && match.cnt >= 3) return;           // never takes a 4th touch
  const from = { x: ball.x, y: ball.y, z: ball.z };
  const hr = ball.y - p.y, air = p.y > 0.12;
  const firstTouch = match.poss !== p.side || match.cnt === 0;
  const incoming = firstTouch ? match.lastPart : null;
  const settled = match.poss === p.side && match.settled;
  let part, shot;
  if (kind === 'DINK') {
    part = 'dink';
    shot = feintShot(from, p.side, (ai.cell || cpuPickAim(p, ai)).z, tier);
  } else if (kind === 'DIG') {
    part = 'dig';
    const tg = { x: from.x + THREE.MathUtils.clamp(-s * 3.8 - from.x, -0.6, 0.6), z: from.z + THREE.MathUtils.clamp(-from.z, -0.5, 0.5) };
    shot = P.solveApex({ x: from.x, y: Math.max(from.y, 0.4), z: from.z }, tg, 6.7, false);
  } else if (kind === 'J') {
    part = bodyPart(hr);
    const isSet = !firstTouch;
    const tg = setTarget(p, isSet);
    const [ox, oz] = jitter([2.0, 0.8, 0.2][tier]);
    tg.x += ox; tg.z += oz;
    const apex = tier === 0 ? 2.8 + Math.random() * 3 : (isSet ? 6.7 : 5.8) - (tier === 1 ? 0.5 : 0);
    shot = P.solveApex(from, tg, apex, false);
  } else {
    const aim = ai.cell || cpuPickAim(p, ai);
    const tg = { x: aim.x, z: aim.z };
    const spike = air && !isServe && plan !== 'smash' && plan !== 'clear' && (settled || plan === 'spike') && ball.y >= 1.7 && Math.abs(p.pos.x) <= 3.2;
    if (spike) {
      part = 'spike';
      const [ox, oz] = jitter([2.2, 1.0, 0.35][tier]); tg.x += ox; tg.z += oz;
      shot = tier === 0 ? P.solveApex(from, { x: -s * (F.hl + 1.2), z: tg.z }, 3.4, true) : P.solveSpeed(from, tg, tier === 2 ? 19 : 15);
    } else if (air && !isServe) {
      const smash = plan === 'smash' || (plan !== 'clear' && firstTouch && incoming === 'clear');
      part = smash ? 'smash' : 'clear';
      const [ox, oz] = jitter([2.0, 1.0, 0.5][tier]); tg.x += ox; tg.z += oz;
      shot = smash && tier > 0 ? P.solveApex(from, tg, Math.max(from.y + 0.35, 2.6), true) : P.solveApex(from, tg, 6.5, true);
    } else {
      part = isServe ? (Math.random() < 0.5 ? 'serve-snap' : 'serve-hang') : hr < 1.3 ? 'kick' : bodyPart(hr);
      if (tier === 0) {
        shot = Math.random() < 0.5
          ? P.solveApex(from, { x: -s * (F.hl + 0.8 + Math.random()), z: tg.z }, 3.6, true)        // sails out
          : P.solveApex(from, { x: -s * 3.2, z: tg.z * 0.5 }, 5.6, true);                         // floater
      } else {
        const apex = isServe ? serveApex(part, tier) : settled ? (tier === 2 ? 3.0 : 3.7) : (tier === 2 ? 3.8 : 4.4);
        const [ox, oz] = jitter(tier === 2 ? 0.25 : 1.0); tg.x += ox; tg.z += oz;
        shot = P.solveApex(from, tg, apex, true);
      }
      if (tier === 2 && !isServe && part === 'kick') part = settled ? 'bicycle' : 'volley';
    }
  }
  setBall(shot);
  match.lastPart = part;
  if (isServe) { match.phase = 'rally'; match.poss = p.side; match.cnt = 3; }
  else {
    if (match.poss !== p.side) { match.poss = p.side; match.cnt = 0; }
    match.cnt++;
  }
  match.last = p.side;
  match.settled = (kind === 'J' && tier >= 1) || kind === 'DIG';
  if (kind === 'DINK') match.settled = false;
  p.facing = kind === 'K' ? Math.atan2(shot.vx, shot.vz) || p.facing : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
  p.action = { part, t: 0 };
  if (kind === 'K') { ai.cell = null; ai.pickAimSoon = true; }
  contactJuice(part, tier === 2 ? 'PERFECT' : tier === 1 ? 'GOOD' : 'LATE', from, false);
  if (teamMode()) sendTouchAs(p, part, tier === 2 ? 'PERFECT' : tier === 1 ? 'GOOD' : 'LATE');
  renderMatchUI();
}

function cpuToss(p) {
  const o = heldOffset(p);
  setBall({ x: p.pos.x + o.x, y: 1.0, z: p.pos.z + o.z, vx: o.fx * 0.25, vy: 5.6, vz: o.fz * 0.25 });
  ballLive = true;
  match.phase = 'serve-toss'; match.server = p.side;
  if (teamMode()) match.serverId = p.id;
  match.poss = null; match.cnt = 0; match.last = null;
  p.action = { part: 'toss', t: 0 };
  contactJuice('toss', '', ball, false);
  if (teamMode()) sendTouchAs(p, 'toss');
  renderMatchUI();
}

function updateCPU(dt) {
  if (teamMode()) {                                // team games: the host runs every CPU
    if (mode === 'host') for (const p of others.values()) if (p.kind === 'cpu') cpuThink(p, p.ai, dt);
    return;
  }
  if (!cpuOn()) return;
  cpuThink(them, cpu, dt);
}
// team games: of the players on a side, the one nearest where the ball comes down goes for it (humans get first call)
function isChaser(p) {
  const mates = onSide(p.side);
  if (mates.length < 2) return true;
  const pt = cpuIntercept(p, 0.95) || (landingCache && { x: landingCache.x, z: landingCache.z }) || { x: ball.x, z: ball.z };
  let best = null, bd = Infinity;
  for (const q of mates) {
    const d = Math.hypot(pt.x - q.pos.x, pt.z - q.pos.z) - (q.kind === 'cpu' ? 0 : 0.7);
    if (d < bd) { bd = d; best = q; }
  }
  return best === p;
}
// the attack aim of whoever on the other side is jumping into a spike / smash right now
function attackerTele(p) {
  if (!teamMode()) return p === them && me && me.side !== p.side ? myTele : null;
  for (const q of allPlayers()) if (q.side !== p.side) { const t = q === me ? myTele : q.tele; if (t) return t; }
  return null;
}
// team games: the player nearest the net is the blocker
function isBlocker(p) {
  const mates = onSide(p.side);
  return mates.reduce((a, b) => (Math.abs(b.pos.x) < Math.abs(a.pos.x) ? b : a), mates[0]) === p;
}
// a CPU blocks their attack as it crosses the net (same geometry + shot as a human block)
function cpuTryBlock(p, e) {
  const ai = p.ai || (p === them ? cpu : null);
  if (!ai || !ai.goNet || p.y <= 0.12) return false;
  const k = shortK(attackLandX()), win = blockWin(k);
  if (!blockGeomOk(e, win, p)) return false;
  ai.goNet = false;
  const perfect = Math.random() < (cpuLvlOf(p) === 'train' ? 1 : 0.55);
  const s = sideSign(p.side);
  const from = { x: s * 0.12, y: Math.max(e.y, P.netTop(e.z) + 0.15), z: e.z };
  const zIn = (z) => THREE.MathUtils.clamp(z, -(F.hw - 0.4), F.hw - 0.4);
  const shot = perfect
    ? P.solveSpeed(from, { x: s * (0.9 + Math.random() * 1.3), z: zIn(e.z + (Math.random() - 0.5) * 2.4) }, 15)
    : P.solveApex(from, { x: s * (1.6 + Math.random() * 1.6), z: zIn(e.z + (Math.random() - 0.5) * 2) }, Math.max(from.y + 1.2, 3.4), false);
  setBall(shot);
  match.lastPart = perfect ? 'stuff' : 'block';
  match.poss = other(p.side); match.cnt = 0; match.last = p.side; match.settled = false;
  if (perfect) hitStop = 0.09;
  p.action = { part: 'block', t: 0 };
  contactJuice(match.lastPart, perfect ? 'PERFECT' : 'GOOD', from, false);
  if (teamMode()) sendTouchAs(p, match.lastPart, perfect ? 'PERFECT' : 'GOOD');
  renderMatchUI();
  return true;
}
function cpuThink(p, ai, dt) {
  const s = sideSign(p.side), L = cpuL(p);
  if (ai.pickAimSoon && match.phase !== 'serve-toss') { ai.pickAimSoon = false; cpuPickAim(p, ai); }
  let tx = -s * 4.2, tz = 0, run = true;          // home spot: middle of my half
  const kl = F.hl / 7.7, kw = F.hw / 3.5;
  if (teamMode() && p.slot === 'front') { tx = -s * 2.2 * kl; tz = THREE.MathUtils.clamp(ball.z * 0.4, -1.5, 1.5) * kw; }
  else if (teamMode() && p.slot === 'solo') { tx = -s * 4.2 * kl; }
  else if (teamMode() && p.slot === 'back') { tx = -s * 5.6 * kl; tz = THREE.MathUtils.clamp(ball.z * 0.4, -1.5, 1.5) * kw; }
  else if (teamMode() && (p.slot === 'fl' || p.slot === 'fr')) {             // 3v3 feeders: each covers their side of the front court
    tx = -s * 2.6 * kl; tz = (p.slot === 'fl' ? -s : s) * 2.2 * kw + ball.z * 0.25;
  }
  const myServe = match.server === p.side && (!teamMode() || match.serverId === p.id);
  // reading their jump: a SHORT attack aimed at us → get to the net and block it
  // read the SET: their ball dropping near the net, settled → a spike is coming, so step up to the net;
  // jump only if the attacker's aim (seen once they jump) is SHORT — a deep aim is left for the dig
  const tele = attackerTele(p);
  const theirSet = ballLive && match.phase === 'rally' && match.poss && match.poss !== p.side && match.settled &&
    P.sideOfX(ball.x) !== p.side && Math.abs(ball.x) < 3.6;
  if (theirSet && (!teamMode() || isBlocker(p))) {
    if (ai.blockFor !== ballSerial) { ai.blockFor = ballSerial; ai.goNet = Math.random() < (L.block || 0); }
  } else if (P.sideOfX(ball.x) === p.side || !ballLive || match.phase !== 'rally') ai.goNet = false;   // (stays on through their spike until it crosses)
  ai.wantBlock = !!ai.goNet && (!tele || shortK(tele.x) > 0.5);
  if (ai.wantBlock && ballLive && match.phase === 'rally') {
    tx = -s * 0.45; tz = THREE.MathUtils.clamp(ball.z, -F.hw, F.hw);
    // jump with the attacker so we're up as it crosses
    if (tele && p.y <= 0 && ball.vy < 0 && ball.y < 3.15 && Math.hypot(p.pos.x - tx, p.pos.z - tz) < 0.9) { p.vy = JUMP_V; p.action = { part: 'block', t: 0 }; }
  }

  // ---------- serving ----------
  if (match.phase === 'serve-wait' && myServe) {
    p.pos.set(-s * (F.hl - F.serveFromBack), 0, 0); p.vel.set(0, 0, 0);
    p.facing = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    run = false;
    ai.serveT += dt; ai.served = false;
    if (ai.serveT > L.serveDelay) { ai.serveT = 0; cpuPickAim(p, ai); cpuToss(p); }
  } else if (match.phase === 'serve-toss' && myServe) {
    run = false;
    if (!ai.served && ball.vy < 0 && ball.y <= 1.15) { ai.served = true; cpuShot(p, ai, 'K', cpuRollTier(p)); }
  } else ai.serveT = 0;

  // ---------- rally ----------
  if (ballLive && match.phase === 'rally') {
    if (ai.serial !== ballSerial) {                 // new flight: re-read the ball
      ai.serial = ballSerial;
      ai.swung = false; ai.target = null;
      const own = match.last === p.side;             // my own set/control coming back down
      ai.reactT = own ? 0.08 : L.react * (0.8 + Math.random() * 0.4);
      const firstTouch = match.poss !== p.side || match.cnt === 0;
      const attack = isAttack(match.lastPart) && match.last !== p.side;
      ai.digOk = attack ? Math.random() < L.dig : true;
      // reading an out ball: let it drop (easy CPUs misjudge sometimes)
      const out = landingCache && (landingCache.type === 'board' || !P.inCourt(landingCache.x, landingCache.z)) && P.sideOfX(landingCache.x) === p.side;
      ai.willPlay = !(firstTouch && out && Math.random() < L.readOut) && (!teamMode() || isChaser(p));
      // plan for this touch
      const c = match.poss === p.side ? match.cnt : 0;
      if (attack) ai.plan = 'dig';
      else if (c === 0) ai.plan = Math.random() < 0.75 ? 'control' : 'kick';
      else if (c === 1) ai.plan = Math.random() < L.spike ? 'set' : 'kick';
      else ai.plan = match.settled && Math.abs(ball.x) < 3.4 ? 'spike' : 'kick';
      if (c === 1 && ai.plan === 'kick' && match.settled && Math.random() < L.spike * 0.6) ai.plan = 'spike';
      const cpuMove = cpuMoveNow();
      ai.feint = false;
      if (!attack && cpuMove !== 'mixed') {
        if (cpuMove === 'smash' || cpuMove === 'clear') ai.plan = c < 2 && cpuIntercept(p, 2.45) ? cpuMove : (c === 0 ? 'control' : 'kick');
        else if (cpuMove === 'spike' || cpuMove === 'feint') ai.plan = c === 0 ? 'control' : c === 1 ? 'set' : 'spike';
        else if (cpuMove === 'kick') ai.plan = 'kick';
      }
    }
    const coming = (landingCache && P.sideOfX(landingCache.x) === p.side) || P.sideOfX(ball.x) === p.side;
    if (coming && ai.willPlay && !ai.swung) {
      if (ai.reactT > 0) ai.reactT -= dt;
      else {
        const jumpPlan = ai.plan === 'spike' || ai.plan === 'smash' || ai.plan === 'clear';
        const h = jumpPlan ? 2.45 : ai.plan === 'dig' ? 0.9 : 0.95;
        if (!ai.target) ai.target = cpuIntercept(p, h);
        if (ai.target) { tx = ai.target.x - s * (jumpPlan ? 0.15 : 0.35); tz = ai.target.z; }   // just behind the contact point
        // jump for the spike as the set drops
        if (jumpPlan && p.y <= 0 && ball.vy < 0 && ball.y < 3.25 && Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z) < 1.1) {
          p.vy = JUMP_V; sfx.jump(); fx.dust(p.pos.x, p.pos.z, 12);
          p.tele = ai.cell || cpuPickAim(p, ai);
        }
        // hit when the ball is in reach
        const d = Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z), hr = ball.y - p.y;
        const inReach = d < 0.9 && ball.vy < 0 && (p.y > 0.12 ? hr < 2.2 && hr > 1.0 : hr < 1.35 && hr > 0.35);
        if (inReach && P.sideOfX(ball.x) === p.side) {
          ai.swung = true;
          const tier = cpuRollTier(p);
          if (ai.plan === 'dig') { if (ai.digOk) cpuShot(p, ai, 'DIG', 2); }
          else if (ai.plan === 'control' || ai.plan === 'set') cpuShot(p, ai, 'J', tier);
          else if (ai.plan === 'spike' && (cpuMoveNow() === 'feint' || (cpuMoveNow() === 'mixed' && Math.random() < (L.feint || 0)))) cpuShot(p, ai, 'DINK', tier);
          else cpuShot(p, ai, 'K', tier, ai.plan);
          p.tele = null;
        }
      }
    }
  }

  // ---------- movement / animation ----------
  if (run) {
    const dx = tx - p.pos.x, dz = tz - p.pos.z, dist = Math.hypot(dx, dz);
    const sp = dist > 0.12 ? Math.min(L.speed, dist * 6) : 0;
    const vx = dist > 0.12 ? (dx / dist) * sp : 0, vz = dist > 0.12 ? (dz / dist) * sp : 0;
    p.vel.x += (vx - p.vel.x) * Math.min(1, dt * 10);
    p.vel.z += (vz - p.vel.z) * Math.min(1, dt * 10);
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    applyBoundaries(p);
  }
  p.vy -= GRAV * dt;
  p.y = Math.max(0, p.y + p.vy * dt);
  if (p.y === 0 && p.vy < 0) p.vy = 0;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed > 0.3) {
    let d = Math.atan2(p.vel.x, p.vel.z) - p.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.facing += d * Math.min(1, dt * 12);
  } else if (!p.action) {
    let d = (s > 0 ? Math.PI / 2 : -Math.PI / 2) - p.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.facing += d * Math.min(1, dt * 6);
  }
  animatePlayer(p, speed, dt);
  updateRing(p);
}

function playTraining() {
  playCPU(true);
}
function playCPU(train = false) {
  training = train === true;
  $('train-panel').classList.toggle('hidden', !training);
  readName(); showError('');
  mode = 'cpu';
  roomCode = '';
  startGame('left');
  spawnRemote('right', `CPU · ${cpuLevel.toUpperCase()}`);
  them.displayName = training ? 'Training bot' : `CPU (${LEVEL_NAMES[cpuLevel] || cpuLevel})`;
  if (training) setDrill(trainDrill);
  cpuStartMatch();
  resetMatch();
  setStatus('');
}

/* =====================================================================
   Camera — behind your own player, looking across the net
   ===================================================================== */
const camPos = new THREE.Vector3().copy(camera.position);
const camLook = new THREE.Vector3(0, 0.8, 0);


function fitFov() {
  // keep a ~80° horizontal view on any screen shape; 50° vertical on wide screens
  const aspect = window.innerWidth / window.innerHeight;
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * (16 / 9));
  const vfov = aspect >= 16 / 9 ? THREE.MathUtils.degToRad(50) : 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  camera.fov = Math.min(88, THREE.MathUtils.radToDeg(vfov));
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
fitFov();

// Fixed cameras — no following, no smoothing, no orbit.
function updateCamera() {
  if (me && playing) {
    // locked behind your own baseline, framing your whole half and the net
    const s = sideSign(me.side);
    const kw = F.W / 7.0;                                   // 1 on the normal court, bigger for 3v3
    camPos.set(-s * (F.hl + 6.9 * kw), 5.3 * kw, 0);
    camLook.set(s * 1.6 * kw, 0.55, 0);
  } else if (pv.p) {
    // customize: close on your player, who stands on the right of the screen
    camPos.set(pv.p.pos.x - 3.4, 1.55, pv.p.pos.z + 0.2);
    camLook.set(pv.p.pos.x, 1.0, pv.p.pos.z - 1.15);
  } else {
    // lobby: one still three-quarter view of the deck
    camPos.set(-14, 6.5, 11);
    camLook.set(0, 0.6, 0);
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (trauma > 0) {
    const t = performance.now() / 1000, k = trauma * trauma;
    camera.position.x += Math.sin(t * 71) * 0.22 * k;
    camera.position.y += Math.sin(t * 89 + 1.3) * 0.16 * k;
    camera.rotation.z += Math.sin(t * 53 + 2.1) * 0.02 * k;
    trauma = Math.max(0, trauma - 1 / 60 * 1.8);
  }
  // tighter focus while the ball is live
  const live = ballLive ? 1 : 0;
  const bt = 0;
  focusPass.uniforms.uStrength.value += ((live ? 0.55 : 0.4) + bt * 0.08 - focusPass.uniforms.uStrength.value) * 0.08;
  focusPass.uniforms.uDesat.value += ((live ? 0.65 : 0.4) + bt * 0.06 - focusPass.uniforms.uDesat.value) * 0.08;
  focusPass.uniforms.uTint.value.set(1, 1, 1);
}

/* =====================================================================
   Networking — PeerJS (WebRTC), no game server
   ===================================================================== */
const PROTOCOL = 8;   // 8: map + time of day in hello / roster / start / lobby adverts (7: player looks)
const PROTOCOL_6_NOTE = 6;   // 6: rooms (1v1 / 2v1 / 2v2) — the guest waits for the host's hello; touches + positions carry a player id
const PREFIX = 'takraw-iso-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let peer = null, conn = null, sendTimer = null, pingTimer = null;
let posConn = null;            // separate unreliable channel for 30 Hz positions (a late packet never blocks touches)
let posSeq = 0, lastPosSeq = -1;
let mode = null, myName = 'Player', roomCode = '';

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), home: $('screen-home'), wait: $('screen-wait'), hud: $('hud'),
  name: $('name-input'), code: $('code-input'), err: $('menu-error'),
  waitCode: $('wait-code'), waitStatus: $('wait-status'),
  status: $('hud-status'), ping: $('hud-ping'), zone: $('zone-chip'),
};
try { ui.name.value = localStorage.getItem('takraw-name') || ''; } catch {}

function readName() {
  myName = (ui.name.value.trim() || 'Player').slice(0, 14);
  try { localStorage.setItem('takraw-name', myName); } catch {}
}
function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
function showError(m) { ui.err.textContent = m || ''; }
function showScreen(w) {
  ui.menu.classList.toggle('hidden', w === 'game');
  ui.hud.classList.toggle('hidden', w !== 'game');
  ui.home.classList.toggle('hidden', w !== 'home');
  ui.wait.classList.toggle('hidden', w !== 'wait');
  $('screen-custom').classList.toggle('hidden', w !== 'custom');
  ui.menu.classList.toggle('customizing', w === 'custom');
  if (w === 'custom') openPreview(); else closePreview();
  if (w === 'home') startLobbyBrowser(); else stopLobbyBrowser();   // only look for games while on the menu
}
function setStatus(s) { ui.status.textContent = s; }
function setBoardNames() {
  const mine = myName, theirs = them ? them.displayName || 'Opponent' : '—';
  if (!me) return;
  void mine; void theirs;   // names no longer shown on the scoreboard
}

function startGame(side) {
  playing = true;
  if (!teamMode()) setCourtSize('normal');
  applyArena(gameMap || mapPick);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setMeterZones();
  resetAim();
  myMeter = 0; ballFire = false;
  autoQ.cool = 3;
  if (me) me.dispose();
  me = createPlayer(side, myName, 'me', myLook);
  me.pos.copy(spawnPoint(side));
  lastZone = '';
  ballLive = false; pending = null; frozenEnd = null; deadBall.on = false;
  Object.assign(match, { phase: mode === 'solo' ? 'idle' : 'wait', score: { left: 0, right: 0 }, poss: null, cnt: 0, last: null, over: false });
  $('gameover').classList.add('hidden');
  animatePlayer(me, 0, 0);
  updateCamera(0, true);
  showScreen('game');
  ui.ping.textContent = mode === 'solo' ? 'PRACTICE' : mode === 'cpu' ? `VS CPU · ${(LEVEL_NAMES[cpuLevel] || cpuLevel).toUpperCase()}` : `${roomCode} · — ms`;
  setBoardNames();
  renderMatchUI();
}

// rebuild a player with a new look, keeping everything about where they are and what they're doing
function restyle(p, look) {
  const n = createPlayer(p.side, p.displayName || '', p.teamKey, look);
  n.pos.copy(p.pos); n.vel.copy(p.vel);
  for (const k of ['y', 'vy', 'facing', 'target', 'id', 'slot', 'kind', 'ai', 'displayName', 'lastSeq', 'aim', 'tele', 'meter', 'seq', 'lookAtBall']) if (p[k] !== undefined) n[k] = p[k];
  p.dispose();
  animatePlayer(n, 0, 0);
  return n;
}
const everyone = () => (teamMode() ? allPlayers() : [me, them].filter(Boolean));
function spawnRemote(side, name, look = null) {
  if (them) them.dispose();
  them = createPlayer(side, name, 'opp', look);
  them.displayName = name;
  them.pos.copy(spawnPoint(side));
  them.target = { x: them.pos.x, z: them.pos.z, y: 0, r: them.facing, s: 0 };
  setBoardNames();
}

function onRemoteState(msg) {
  if (teamMode()) { onTeamState(msg); return; }
  if (!them) return;
  if (Number.isFinite(msg.q)) { if (msg.q <= lastPosSeq) return; lastPosSeq = msg.q; }   // drop out-of-order packets
  const n = (v) => (Number.isFinite(v) ? v : 0);
  them.target = { x: n(msg.x), z: n(msg.z), y: n(msg.y), r: n(msg.r), s: n(msg.s) };
  // their attack's aim spot while they jump into a spike / smash (drawn as the red warning mark on my court)
  them.tele = Number.isFinite(msg.tx) && Number.isFinite(msg.tz) ? { x: msg.tx, z: msg.tz } : null;
  them.aim = Number.isFinite(msg.ax) && Number.isFinite(msg.az) ? { x: msg.ax, z: msg.az } : null;   // their current aim spot
  if (Number.isFinite(msg.mt) && msg.mt !== them.meter) { them.meter = msg.mt; renderMeter(); }
}
function wirePos(c) {
  posConn = c;
  c.on('data', (msg) => { if (msg && msg.t === 's') onRemoteState(msg); });
  c.on('close', () => { if (posConn === c) posConn = null; });
  c.on('error', () => {});
}
function wireConnection(c) {
  conn = c;
  c.on('open', () => {
    c.send({ t: 'hello', name: myName, v: PROTOCOL, look: myLook, ...(mode === 'host' ? { map: mapPick.map, time: mapPick.time } : {}) });
    if (mode === 'guest') return;          // the guest waits for the host's hello: it says whether this is a 1v1 or a team room
    begin1v1(c);
  });
  const begin1v1 = (c) => {
    startGame(mode === 'host' ? 'left' : 'right');
    spawnRemote(mode === 'host' ? 'right' : 'left', 'Opponent');
    setStatus('');
    if (mode === 'host') resetMatch();
    lastPosSeq = -1;
    if (mode === 'guest' && peer) wirePos(peer.connect(PREFIX + roomCode, { reliable: false, serialization: 'json', label: 'pos' }));
    clearInterval(sendTimer); clearInterval(pingTimer);
    sendTimer = setInterval(() => {
      if (!me || !conn || !conn.open) return;
      const ch = posConn && posConn.open ? posConn : conn;
      ch.send({ t: 's', q: posSeq++, mt: Math.round(myMeter), x: +me.pos.x.toFixed(3), z: +me.pos.z.toFixed(3), y: +me.y.toFixed(3),
        r: +me.facing.toFixed(3), s: +Math.hypot(me.vel.x, me.vel.z).toFixed(2),
        tx: myTele ? +myTele.x.toFixed(2) : null, tz: myTele ? +myTele.z.toFixed(2) : null,
        ...(() => { const a = aimTarget(me); return { ax: +a.x.toFixed(2), az: +a.z.toFixed(2) }; })() });
    }, 1000 / 30);
    pingTimer = setInterval(() => { if (conn && conn.open) conn.send({ t: 'ping', ts: performance.now() }); }, 1500);
  };
  c.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello' && mode === 'guest' && !playing && !teamMode()) {
      if (msg.fmt && msg.fmt !== '1v1') { joinRoom(msg); return; }
      gameMap = msg.map ? cleanChoice(msg.map, msg.time) : null;      // play on the host's map
      begin1v1(c);
    }
    if (teamMode()) { onGuestTeamData(msg); return; }
    if (msg.t === 'hello' && them) {
      const n = String(msg.name || 'Opponent').slice(0, 14);
      them.displayName = n;
      if (msg.look) them = restyle(them, msg.look);
      setBoardNames();
      if (msg.v !== PROTOCOL) setStatus('Opponent is on a different version — both of you refresh the page');
    } else if (msg.t === 's') {
      onRemoteState(msg);
    } else if (msg.t === 'ping') {
      c.send({ t: 'pong', ts: msg.ts });
    } else if (msg.t === 'pong' && Number.isFinite(msg.ts)) {
      const r = performance.now() - msg.ts;
      rtt = rtt * 0.7 + r * 0.3;
      ui.ping.textContent = `${roomCode} · ${Math.round(r)} ms`;
    } else if (msg.t === 'touch') {
      onRemoteTouch(msg);
    } else if (msg.t === 'match' && mode === 'guest') {
      onRemoteMatch(msg.m);
    } else if (msg.t === 'end' && mode === 'host') {
      if (msg.r === match.rally && (msg.loser === 'left' || msg.loser === 'right')) applyPoint(msg.loser, String(msg.reason || 'IN'));
    } else if (msg.t === 'rematch' && mode === 'host') {
      resetMatch();
    } else if (msg.t === 'full') {
      teardown(); showScreen('home'); showError('That room is full.');
    }
  });
  c.on('close', () => {
    if (conn !== c) return;
    conn = null;
    if (posConn) { try { posConn.close(); } catch {} posConn = null; }
    clearInterval(sendTimer); clearInterval(pingTimer);
    if (teamMode()) {                      // team room: the host is gone, so is the game
      ballLive = false; match.phase = 'wait'; onMatchChanged('wait');
      if (playing) setStatus('Host left the game'); else { teardown(); showScreen('home'); showError('The host closed the room.'); }
      return;
    }
    if (them) { them.dispose(); them = null; }
    setBoardNames();
    ballLive = false; match.phase = 'wait'; onMatchChanged('wait');
    ui.ping.textContent = `${roomCode} · — ms`;
    setStatus(mode === 'host' ? 'Opponent left — waiting for someone to join…' : 'Host left the game');
  });
  c.on('error', (e) => console.warn('conn error', e));
}

/* =====================================================================
   TEAM ROOMS (2v2 / 3v3) — the host is the hub: guests talk only to the host, which relays
   positions and touches to everyone else and runs every CPU. 1v1 rooms never get here.
   ===================================================================== */
const links = new Map();          // host only: guest peer id → { conn, pos, id }
let guestSeq = 0;
function netSend(msg, except = null) {
  if (mode === 'host') { for (const L of links.values()) if (L.conn !== except && L.conn.open) L.conn.send(msg); }
  else if (conn && conn.open) conn.send(msg);
}
function buildRoster(f) {
  const slots = f === '3v3' ? [['left', 'back'], ['left', 'fl'], ['left', 'fr'], ['right', 'back'], ['right', 'fl'], ['right', 'fr']]
    : f === '2v2' ? [['left', 'front'], ['left', 'back'], ['right', 'front'], ['right', 'back']]
    : [['left', 'solo'], ['right', 'solo']];
  const L = slots.map(([side, pos]) => ({ side, pos, kind: 'open', id: null, name: '' }));
  // keep the people already in the room (host first)
  const humans = roster.filter((r) => r.kind === 'human');
  if (!humans.some((h) => h.id === 'h')) humans.unshift({ id: 'h', name: myName, kind: 'human', look: myLook });
  // host takes their side's back (serving) spot first, then the rest of their side, then the other side
  const order = L.map((_, i) => i).sort((a, b) => (L[a].side === L[b].side ? 0 : L[a].side === 'left' ? -1 : 1) || (L[a].pos === 'back' ? -1 : L[b].pos === 'back' ? 1 : 0));
  for (const h of humans) { const i = order.find((k) => L[k].kind === 'open'); if (i === undefined) break; Object.assign(L[i], { kind: 'human', id: h.id, name: h.name, look: h.look }); }
  return L;
}
const rosterPublic = () => roster.map((r) => ({ side: r.side, pos: r.pos, kind: r.kind, id: r.id, name: r.name, look: r.look || null, level: r.level || null }));
function sendRoster() { if (mode === 'host') netSend({ t: 'roster', fmt, roster: rosterPublic(), map: mapPick.map, time: mapPick.time }); }
function setFormat(f) {
  if (mode !== 'host' || playing || f === fmt) return;
  const humans = roster.filter((r) => r.kind === 'human').length;
  const cap = f === '3v3' ? 6 : f === '2v2' ? 4 : 2;
  if (humans > cap || (f === '1v1' && humans > 1)) return;     // can't squeeze people out
  fmt = f;
  roster = buildRoster(f);
  sendRoster(); renderRoom();
}
let cpuSeq = 0;
function slotAction(i, act) {
  const r = roster[i];
  if (!r) return;
  if (mode !== 'host') { if (act === 'move' && conn && conn.open) conn.send({ t: 'move', i }); return; }
  if (act === 'cpu' && r.kind === 'open') Object.assign(r, { kind: 'cpu', id: 'c' + (++cpuSeq), name: `CPU · ${LEVEL_NAMES[cpuLevel]}`, level: cpuLevel, look: randomLook() });
  else if (act === 'rm' && r.kind === 'cpu') Object.assign(r, { kind: 'open', id: null, name: '', level: null });
  else if (act === 'lvl' && r.kind === 'cpu') {
    const order = ['easy', 'normal', 'hard', 'train'];
    r.level = order[(order.indexOf(r.level || cpuLevel) + 1) % order.length];
    r.name = `CPU · ${LEVEL_NAMES[r.level]}`;
  }
  else if (act === 'move' && r.kind === 'open') moveTo('h', i);
  sendRoster(); renderRoom();
}
function moveTo(id, i) {
  const from = roster.find((r) => r.id === id), to = roster[i];
  if (!from || !to || to.kind !== 'open') return;
  Object.assign(to, { kind: 'human', id, name: from.name, look: from.look });
  Object.assign(from, { kind: 'open', id: null, name: '' });
}
function renderRoom() {
  const box = $('room');
  const host = mode === 'host';
  const team = teamMode();
  box.classList.remove('hidden');
  for (const b of box.querySelectorAll('.room-fmt button')) {
    b.classList.toggle('on', b.dataset.fmt === fmt);
    b.disabled = !host;
  }
  $('room-fmt').classList.toggle('readonly', !host);
  $('room-cols').classList.toggle('hidden', !team);
  $('room-start').classList.toggle('hidden', !(host && team));
  if (!team) $('room-fill').classList.add('hidden');
  $('room-cpu').classList.toggle('hidden', !(host && fmt === '1v1' && !(conn && conn.open)));
  if (!team) { ui.waitStatus.textContent = host ? (peer && peer.open ? 'Waiting for opponent to join…' : ui.waitStatus.textContent) : ui.waitStatus.textContent; return; }
  for (const side of ['left', 'right']) {
    const col = $(`room-${side}`);
    col.textContent = '';
    const head = document.createElement('div'); head.className = 'room-head ' + side; head.textContent = side === 'left' ? 'Team A' : 'Team B';
    col.appendChild(head);
    roster.forEach((r, i) => {
      if (r.side !== side) return;
      const row = document.createElement('div'); row.className = 'room-slot ' + r.kind + (r.id === myId ? ' me' : '');
      const nm = document.createElement('span'); nm.className = 'rs-name';
      nm.textContent = r.kind === 'open' ? 'Open' : r.kind === 'cpu' ? (host ? 'CPU' : r.name) : r.name + (r.id === myId ? ' (you)' : r.id === 'h' ? ' (host)' : '');
      row.appendChild(nm);
      const btn = (label, act, cls = '') => { const b = document.createElement('button'); b.className = 'rs-btn ' + cls; b.textContent = label; b.onclick = () => { slotAction(i, act); }; row.appendChild(b); };
      if (r.kind === 'open') { btn('Move here', 'move'); if (host) btn('+ CPU', 'cpu', 'add'); }
      if (r.kind === 'cpu' && host) { btn(LEVEL_NAMES[r.level || cpuLevel] + ' ▸', 'lvl', 'lvl ' + (r.level || cpuLevel)); btn('✕', 'rm', 'rm'); }
      col.appendChild(row);
    });
  }
  const open = roster.filter((r) => r.kind === 'open').length;
  const ready = sideReady();
  $('room-start').textContent = !ready ? 'Need a player on each team' : open ? `Start · ${open} spot${open > 1 ? 's' : ''} empty` : 'Start';
  $('room-start').disabled = !ready;
  $('room-fill').classList.toggle('hidden', !(host && open));
  $('room-fill').textContent = `Fill ${open} empty with CPU`;
  ui.waitStatus.textContent = host ? (open ? 'Open spots: a friend can join, add a CPU, or leave it empty' : 'Everyone’s in') : 'Waiting for the host to start…';
}
const sideReady = () => ['left', 'right'].every((sd) => roster.some((r) => r.side === sd && r.kind !== 'open'));
// open spots you don't fill just stay EMPTY (e.g. 2v2 with one spot empty = 2 vs 1)
function teamStart() {
  if (mode !== 'host' || playing || !sideReady()) return;
  const list = rosterPublic().filter((r) => r.kind !== 'open');
  gameMap = { ...mapPick };
  netSend({ t: 'start', fmt, roster: list, map: gameMap.map, time: gameMap.time });
  startTeamGame(list);
}
function teamFill() {
  if (mode !== 'host' || playing) return;
  for (const r of roster) if (r.kind === 'open') Object.assign(r, { kind: 'cpu', id: 'c' + (++cpuSeq), name: `CPU · ${LEVEL_NAMES[cpuLevel]}`, level: cpuLevel, look: randomLook() });
  sendRoster(); renderRoom();
}
function startTeamGame(list) {
  roster = list;
  // short-handed teams (spots left empty): re-assign positions so the side is still covered
  for (const sd of ['left', 'right']) {
    const mates = list.filter((r) => r.side === sd);
    if (mates.length === 1) mates[0].pos = 'solo';
    else if (mates.length === 2 && fmt === '3v3') { const bk = mates.find((r) => r.pos === 'back') || mates[0]; bk.pos = 'back'; for (const r of mates) if (r !== bk) r.pos = 'front'; }
  }
  setCourtSize(fmt === '3v3' ? 'big' : 'normal');
  const mine = list.find((r) => r.id === myId);
  if (!mine) return;
  startGame(mine.side);
  me.id = myId; me.slot = mine.pos;
  me.pos.copy(teamSpawn(mine.side, mine.pos));
  for (const p of others.values()) p.dispose();
  others.clear();
  for (const r of list) {
    if (r.id === myId) continue;
    const p = createPlayer(r.side, r.name, r.side === mine.side ? 'mate' : 'opp', r.look);
    p.id = r.id; p.slot = r.pos; p.displayName = r.name; p.lastSeq = -1;
    p.kind = mode === 'host' && r.kind === 'cpu' ? 'cpu' : 'remote';
    p.pos.copy(teamSpawn(r.side, r.pos));
    p.facing = r.side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    p.target = { x: p.pos.x, z: p.pos.z, y: 0, r: p.facing, s: 0 };
    if (p.kind === 'cpu') { p.ai = newAI(); p.level = r.level || cpuLevel; }
    animatePlayer(p, 0, 0);
    others.set(p.id, p);
  }
  them = focusOpponent();
  ui.ping.textContent = `${roomCode} · ${fmt}`;
  clearInterval(sendTimer); clearInterval(pingTimer);
  sendTimer = setInterval(teamTick, 1000 / 30);
  pingTimer = setInterval(() => netSend({ t: 'ping', ts: performance.now() }), 1500);
  if (mode === 'host') { for (const L of links.values()) L.seen = performance.now(); resetMatch(); }
  else if (peer) wirePos(peer.connect(PREFIX + roomCode, { reliable: false, serialization: 'json', label: 'pos' }));
}
const statePkt = (p, id, tele, aim) => ({ t: 's', id, q: (p.seq = (p.seq || 0) + 1), x: +p.pos.x.toFixed(3), z: +p.pos.z.toFixed(3), y: +p.y.toFixed(3),
  r: +p.facing.toFixed(3), s: +Math.hypot(p.vel.x, p.vel.z).toFixed(2),
  tx: tele ? +tele.x.toFixed(2) : null, tz: tele ? +tele.z.toFixed(2) : null, ax: aim ? +aim.x.toFixed(2) : null, az: aim ? +aim.z.toFixed(2) : null });
function teamTick() {
  if (!me || !playing) return;
  const mine = statePkt(me, myId, myTele, aimTarget(me));
  if (mode === 'host') {
    // a closed tab doesn't always fire 'close' — 5 s of silence counts as gone
    for (const L of [...links.values()]) if (performance.now() - L.seen > 5000) { teamLeave(L.conn); try { L.conn.close(); } catch {} }
    const pk = [mine];
    for (const p of others.values()) if (p.kind === 'cpu') pk.push(statePkt(p, p.id, p.tele, p.aim));
    for (const L of links.values()) { const ch = L.pos && L.pos.open ? L.pos : L.conn; if (ch.open) for (const m of pk) ch.send(m); }
  } else {
    const ch = posConn && posConn.open ? posConn : conn;
    if (ch && ch.open) ch.send(mine);
  }
}
function onTeamState(msg) {
  const p = others.get(msg.id);
  if (!p || p.kind === 'cpu') return;
  if (Number.isFinite(msg.q)) { if (msg.q <= p.lastSeq) return; p.lastSeq = msg.q; }
  const n = (v) => (Number.isFinite(v) ? v : 0);
  p.target = { x: n(msg.x), z: n(msg.z), y: n(msg.y), r: n(msg.r), s: n(msg.s) };
  p.tele = Number.isFinite(msg.tx) && Number.isFinite(msg.tz) ? { x: msg.tx, z: msg.tz } : null;
  p.aim = Number.isFinite(msg.ax) && Number.isFinite(msg.az) ? { x: msg.ax, z: msg.az } : null;
}
// host: a guest knocks on a team room
function teamAccept(c) {
  if (c.label === 'pos') {
    const L = links.get(c.peer);
    if (!L) { c.on('open', () => c.close()); return; }
    L.pos = c;
    c.on('data', (msg) => { if (msg && msg.t === 's') hostGotState(msg, L); });
    c.on('close', () => { if (L.pos === c) L.pos = null; });
    c.on('error', () => {});
    return;
  }
  c.on('open', () => {
    const slot = playing ? null : roster.find((r) => r.kind === 'open');
    if (!slot) { c.send({ t: 'full' }); setTimeout(() => { try { c.close(); } catch {} }, 400); return; }
    const id = 'g' + (++guestSeq);
    Object.assign(slot, { kind: 'human', id, name: 'Player' });
    links.set(c.peer, { conn: c, pos: null, id, seen: performance.now() });
    c.send({ t: 'hello', name: myName, v: PROTOCOL, fmt, you: id, look: myLook });
    sendRoster(); renderRoom();
  });
  c.on('data', (msg) => {
    const L = links.get(c.peer);
    if (!L || !msg || typeof msg !== 'object') return;
    L.seen = performance.now();
    if (msg.t === 'hello') {
      const r = roster.find((x) => x.id === L.id);
      if (r) { r.name = String(msg.name || 'Player').slice(0, 14); if (msg.look) r.look = sanitizeLook(msg.look); }
      const p = others.get(L.id); if (p) p.displayName = r ? r.name : p.displayName;
      sendRoster(); renderRoom();
    } else if (msg.t === 's') hostGotState(msg, L);
    else if (msg.t === 'ping') c.send({ t: 'pong', ts: msg.ts });
    else if (msg.t === 'pong' && Number.isFinite(msg.ts)) { rtt = rtt * 0.7 + (performance.now() - msg.ts) * 0.3; ui.ping.textContent = `${roomCode} · ${fmt} · ${Math.round(rtt)} ms`; }
    else if (msg.t === 'touch') { msg.id = L.id; onRemoteTouch(msg); netSend(msg, c); }
    else if (msg.t === 'end') { if (msg.r === match.rally && (msg.loser === 'left' || msg.loser === 'right')) applyPoint(msg.loser, String(msg.reason || 'IN')); }
    else if (msg.t === 'move' && !playing) { moveTo(L.id, msg.i | 0); sendRoster(); renderRoom(); }
  });
  c.on('close', () => teamLeave(c));
  c.on('error', () => {});
}
function hostGotState(msg, L) {
  L.seen = performance.now();
  msg.id = L.id;
  onTeamState(msg);
  for (const O of links.values()) { if (O === L) continue; const ch = O.pos && O.pos.open ? O.pos : O.conn; if (ch.open) ch.send(msg); }
}
function teamLeave(c) {
  const L = links.get(c.peer);
  if (!L) return;
  links.delete(c.peer);
  const r = roster.find((x) => x.id === L.id);
  if (!playing) { if (r) Object.assign(r, { kind: 'open', id: null, name: '' }); sendRoster(); renderRoom(); return; }
  // mid-match: a CPU takes over their spot so the game goes on
  const p = others.get(L.id);
  if (r) { r.kind = 'cpu'; r.level = cpuLevel; r.name = `CPU · ${LEVEL_NAMES[cpuLevel]}`; }
  if (p) { p.kind = 'cpu'; p.level = cpuLevel; p.ai = newAI(); p.displayName = r ? r.name : 'CPU'; }
  showBanner('Player left', 'a CPU took their spot', 'var(--orange)');
}
// guest side of a team room
function joinRoom(msg) {
  fmt = msg.fmt; myId = String(msg.you || 'g?');
  if (msg.v !== PROTOCOL) setStatus('Host is on a different version — both of you refresh the page');
  ui.waitStatus.textContent = 'Waiting for the host to start…';
  renderRoom();
}
function onGuestTeamData(msg) {
  if (msg.t === 'roster') {
    if (!playing) {
      fmt = msg.fmt; roster = msg.roster || [];
      if (msg.map) { roomView = cleanChoice(msg.map, msg.time); applyArena(roomView); }     // preview the host's map behind the room
      renderRoom(); renderPickers();
    }
  }
  else if (msg.t === 'start') { if (!playing) { fmt = msg.fmt; gameMap = msg.map ? cleanChoice(msg.map, msg.time) : null; startTeamGame(msg.roster || []); } }
  else if (msg.t === 's') onTeamState(msg);
  else if (msg.t === 'ping') conn.send({ t: 'pong', ts: msg.ts });
  else if (msg.t === 'pong' && Number.isFinite(msg.ts)) { rtt = rtt * 0.7 + (performance.now() - msg.ts) * 0.3; ui.ping.textContent = `${roomCode} · ${fmt} · ${Math.round(rtt)} ms`; }
  else if (msg.t === 'touch') { if (msg.id !== myId) onRemoteTouch(msg); }
  else if (msg.t === 'match') onRemoteMatch(msg.m);
}

/* =====================================================================
   LOBBY DISCOVERY — no server. A host also claims one of 12 well-known "lobby slot" IDs on the
   PeerJS broker and answers anyone who knocks with { code, host name, open? }. The menu knocks on
   all 12 slots every few seconds (empty slots fail instantly) and lists the 3 newest open games.
   ===================================================================== */
const LOBBY_PREFIX = 'takraw-lobby-v1-';
const LOBBY_SLOTS = 12;
let slotPeer = null, lobbyBorn = 0;
function claimLobbySlot(i = 0) {
  if (i >= LOBBY_SLOTS || mode !== 'host' || !peer) return;
  const sp = new Peer(LOBBY_PREFIX + i);
  slotPeer = sp;
  sp.on('error', (e) => {
    if (slotPeer !== sp) return;
    if (e.type === 'unavailable-id') { try { sp.destroy(); } catch {} slotPeer = null; claimLobbySlot(i + 1); }
  });
  sp.on('connection', (c) => {
    c.on('open', () => {
      const filled = roster.filter((r) => r.kind !== 'open').length;
      const open = teamMode() ? !playing && roster.some((r) => r.kind === 'open') : !(conn && conn.open);
      try { c.send({ t: 'lobby', v: PROTOCOL, code: roomCode, host: myName, open, born: lobbyBorn, fmt, n: filled, cap: roster.length, map: mapPick.map, time: mapPick.time }); } catch {}
      setTimeout(() => { try { c.close(); } catch {} }, 2000);
    });
  });
}
function releaseLobbySlot() { if (slotPeer) { const sp = slotPeer; slotPeer = null; try { sp.destroy(); } catch {} } }

let probePeer = null, lobbyTimer = null, probing = false;
const probeEnders = new Map();
function startLobbyBrowser() {
  if (lobbyTimer) return;
  refreshLobbies();
  lobbyTimer = setInterval(refreshLobbies, 8000);
}
function stopLobbyBrowser() {
  clearInterval(lobbyTimer); lobbyTimer = null; probing = false; probeEnders.clear();
  if (probePeer) { try { probePeer.destroy(); } catch {} probePeer = null; }
}
function refreshLobbies() {
  if (probing) return;
  const run = () => {
    if (!probePeer || probePeer.destroyed) return;
    probing = true;
    const found = [];
    let left = LOBBY_SLOTS;
    const finish = () => { if (--left > 0) return; probing = false; renderLobbies(found); };
    for (let i = 0; i < LOBBY_SLOTS; i++) {
      const id = LOBBY_PREFIX + i;
      let done = false;
      const c = probePeer.connect(id, { reliable: true, serialization: 'json' });
      const end = () => { if (done) return; done = true; probeEnders.delete(id); try { c.close(); } catch {} finish(); };
      probeEnders.set(id, end);
      c.on('data', (msg) => {
        if (msg && msg.t === 'lobby' && msg.v === PROTOCOL && msg.open && /^[A-Z0-9]{4}$/.test(msg.code || '')) {
          found.push({ code: msg.code, host: String(msg.host || 'Player').slice(0, 14), born: Number(msg.born) || 0,
            fmt: ['1v1', '2v2', '3v3'].includes(msg.fmt) ? msg.fmt : '1v1', n: Number(msg.n) || 1, cap: Number(msg.cap) || 2, map: mapById(msg.map).name, time: msg.time === 'day' ? 'Day' : 'Night' });
        }
        end();
      });
      c.on('error', end);
      c.on('close', end);
      setTimeout(end, 4500);
    }
  };
  if (!probePeer || probePeer.destroyed) {
    probePeer = new Peer();
    probePeer.on('open', run);
    probePeer.on('error', (e) => {
      // an empty slot: PeerJS reports it on the peer, naming the id — end that probe right away
      const m = /(takraw-lobby-v1-\d+)/.exec((e && e.message) || '');
      if (m && probeEnders.has(m[1])) probeEnders.get(m[1])();
    });
  } else run();
}
function renderLobbies(list) {
  const el = document.getElementById('lobby-list');
  if (!el) return;
  list.sort((a, b) => b.born - a.born);
  const top = list.slice(0, 3);
  el.textContent = '';
  if (!top.length) {
    const p = document.createElement('p');
    p.className = 'lobby-empty';
    p.textContent = 'No open games right now — create one!';
    el.appendChild(p);
    return;
  }
  for (const L of top) {
    const row = document.createElement('div');
    row.className = 'lobby-row';
    const host = document.createElement('span'); host.className = 'lr-host'; host.textContent = L.host;
    const code = document.createElement('span'); code.className = 'lr-code'; code.textContent = (L.fmt === '1v1' ? `${L.code}` : `${L.code} · ${L.fmt} · ${L.n}/${L.cap}`) + ` · ${L.map} · ${L.time}`; code.classList.add('team');
    const btn = document.createElement('button'); btn.className = 'btn outline lr-join'; btn.textContent = 'Join';
    btn.onclick = () => { ui.code.value = L.code; joinGame(); };
    row.append(host, code, btn);
    el.appendChild(row);
  }
}

function hostGame(attempt = 0) {
  readName(); showError('');
  mode = 'host';
  roomCode = randomCode();
  ui.waitCode.textContent = roomCode;
  ui.waitStatus.textContent = 'Connecting to matchmaking…';
  fmt = '1v1'; myId = 'h'; roster = buildRoster('1v1');
  showScreen('wait');
  renderRoom();
  peer = new Peer(PREFIX + roomCode);
  peer.on('open', () => { ui.waitStatus.textContent = 'Waiting for opponent to join…'; lobbyBorn = Date.now(); claimLobbySlot(0); renderRoom(); });
  peer.on('connection', (c) => {
    if (teamMode()) { teamAccept(c); return; }
    if (c.label === 'pos') {                      // the guest's position channel
      if (conn && conn.open && c.peer === conn.peer) wirePos(c); else c.on('open', () => c.close());
      return;
    }
    if (conn && conn.open) { c.on('open', () => c.close()); return; }
    wireConnection(c);
  });
  peer.on('error', (e) => {
    if (e.type === 'unavailable-id' && attempt < 5) { teardown(); hostGame(attempt + 1); return; }
    if (playing) { setStatus('Network error: ' + e.type); return; }
    teardown(); showScreen('home');
    showError('Could not create game (' + e.type + ').');
  });
}

function joinGame() {
  readName();
  const code = ui.code.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { showError('Enter the 4-character party code.'); return; }
  showError('');
  mode = 'guest'; roomCode = code;
  ui.waitCode.textContent = code;
  ui.waitStatus.textContent = 'Joining…';
  showScreen('wait');
  peer = new Peer();
  peer.on('open', () => wireConnection(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })));
  peer.on('error', (e) => {
    if (playing) { setStatus('Network error: ' + e.type); return; }
    teardown(); showScreen('home');
    showError(e.type === 'peer-unavailable' ? `No game found with code ${code}.` : `Could not join (${e.type}).`);
  });
}

function practice() {
  readName(); showError('');
  mode = 'solo';
  startGame('left');
  setStatus('');
}

function teardown() {
  clearInterval(sendTimer); clearInterval(pingTimer);
  releaseLobbySlot();
  if (posConn) { try { posConn.close(); } catch {} posConn = null; }
  if (conn) { try { conn.close(); } catch {} conn = null; }
  if (peer) { try { peer.destroy(); } catch {} peer = null; }
  for (const L of links.values()) { try { L.conn.close(); } catch {} try { L.pos && L.pos.close(); } catch {} }
  links.clear();
  if (others.size) { for (const p of others.values()) p.dispose(); others.clear(); them = null; }
  fmt = '1v1'; roster = []; myId = 'h';
  setCourtSize('normal');
  gameMap = null; roomView = null;
  applyArena(mapPick);                // the menu shows the map you've picked
  training = false; $('train-panel').classList.add('hidden');
  $('room').classList.add('hidden');
  if (me) { me.dispose(); me = null; }
  if (them) { them.dispose(); them = null; }
  playing = false;
  ballLive = false; pending = null; frozenEnd = null;
  approach = null;
  if (btDroneStop) { btDroneStop(); btDroneStop = null; }
  btScale = 1; btWas = false;
  match.phase = 'idle';
  $('gameover').classList.add('hidden');
  renderBall(0);
}

/* =====================================================================
   CUSTOMIZE — pick your look (saved in this browser) and preview your moves
   ===================================================================== */
const pv = { p: null, move: 'idle', seq: [], t: 0, spin: 0, rest: 0 };
const PV_MOVES = [
  ['idle', 'Idle'], ['ready', 'Ready'], ['run', 'Run'], ['jump', 'Jump'], ['kick', 'Kick'], ['set', 'Set'],
  ['spike', 'Spike'], ['bicycle', 'Bicycle'], ['dheader', 'Diving header'], ['volley', 'Volley'], ['feint', 'Feint'],
  ['snap', 'Snap serve'], ['hang', 'Hang serve'], ['dig', 'Dig'], ['block', 'Block'],
  ['win', 'Win'], ['lose', 'Lose'], ['wai', 'Wai'], ['celebrate', 'Celebrate'],
];
const PV_SEQ = {
  jump: [[0, 'J']], kick: [[0, 'kick']], set: [[0, 'foot']], spike: [[0, 'J'], [0.3, 'spike']], bicycle: [[0, 'bicycle']],
  dheader: [[0, 'dheader']], volley: [[0, 'volley']], feint: [[0, 'J'], [0.3, 'dink']], snap: [[0, 'toss'], [0.6, 'serve-snap']],
  hang: [[0, 'toss'], [0.6, 'serve-hang']], dig: [[0, 'dig']], block: [[0, 'J'], [0.18, 'block']],
  win: [[0, 'win']], lose: [[0, 'lose']], wai: [[0, 'wai']], celebrate: [[0, 'celebrate']],
};
const PV_SPOT = new THREE.Vector3(-3.2, 0, 0.4);
function openPreview() {
  if (pv.p) return;
  pv.p = createPlayer('left', myName, 'me', myLook);
  pv.p.pos.copy(PV_SPOT); pv.p.lookAtBall = false;
  playPreview(pv.move);
}
function closePreview() { if (pv.p) { pv.p.dispose(); pv.p = null; } }
function playPreview(move) {
  pv.move = move; pv.t = 0; pv.rest = 0;
  pv.seq = (PV_SEQ[move] || []).map((x) => x.slice());
  if (pv.p) { pv.p.action = null; }
  for (const b of document.querySelectorAll('#pv-moves button')) b.classList.toggle('on', b.dataset.m === move);
}
function updatePreview(dt) {
  const p = pv.p;
  pv.t += dt;
  for (const st of pv.seq) if (!st.done && pv.t >= st[0]) {
    st.done = true;
    if (st[1] === 'J') { p.vy = JUMP_V; } else p.action = { part: st[1], t: 0 };
  }
  p.vy -= GRAV * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0 && p.vy < 0) p.vy = 0;
  p.ready = pv.move === 'ready';
  if (pv.move === 'idle') pv.spin += dt * 0.5;
  p.facing = -Math.PI / 2 + (pv.move === 'idle' ? Math.sin(pv.spin) * 0.9 : 0.6);
  animatePlayer(p, pv.move === 'run' ? 5.5 : 0, dt);
  // one-shot finished: loop it after a short breath
  if (pv.seq.length && pv.seq.every((x) => x.done) && !p.action && p.y === 0) {
    pv.rest += dt;
    if (pv.rest > 0.6 && $('pv-loop').checked) playPreview(pv.move);
  }
}
function setLook(k, i) {
  myLook[k] = i;
  myLook = sanitizeLook(myLook);
  saveLook();
  if (pv.p) { pv.p = restyle(pv.p, myLook); pv.p.lookAtBall = false; }
  renderCustomize();
}
function renderCustomize() {
  for (const row of document.querySelectorAll('#screen-custom .cust-row[data-k]')) {
    const k = row.dataset.k;
    if (!row.childElementCount) {
      LOOK_OPTS[k].forEach((v, i) => {
        const b = document.createElement('button');
        if (k === 'hair') b.textContent = HAIR_NAMES[v];
        else if (k === 'symbol') {
          const cv = document.createElement('canvas'); cv.width = cv.height = 56;
          drawSymbol(cv.getContext('2d'), v, '#f6f1e6', 56); b.appendChild(cv); b.title = v;
        } else b.style.background = '#' + new THREE.Color(v).getHexString();
        b.onclick = () => { setLook(k, i); sfx.ui(); };
        row.appendChild(b);
      });
    }
    [...row.children].forEach((b, i) => b.classList.toggle('on', i === myLook[k]));
  }
  const mv = $('pv-moves');
  if (!mv.childElementCount) for (const [m, label] of PV_MOVES) {
    const b = document.createElement('button'); b.textContent = label; b.dataset.m = m;
    b.onclick = () => { playPreview(m); sfx.ui(); };
    mv.appendChild(b);
  }
  for (const b of mv.children) b.classList.toggle('on', b.dataset.m === pv.move);
}
$('custom-btn').onclick = () => { readName(); renderCustomize(); showScreen('custom'); };
$('cust-done').onclick = () => showScreen('home');
$('cust-random').onclick = () => { myLook = randomLook(); saveLook(); if (pv.p) { pv.p = restyle(pv.p, myLook); pv.p.lookAtBall = false; } renderCustomize(); };
// your name is remembered as you type it
ui.name.addEventListener('input', () => { try { localStorage.setItem('takraw-name', ui.name.value.trim().slice(0, 14)); } catch {} });

$('create-btn').onclick = () => hostGame();
$('join-btn').onclick = joinGame;
$('practice-btn').onclick = practice;
$('train-btn').onclick = playTraining;
setDrill(trainDrill);
// 1v1 room: instead of waiting for a friend, play a CPU right away (this replaces the old Play vs CPU menu row)
for (const b of document.querySelectorAll('.room-cpu-lvl')) {
  b.onclick = () => {
    cpuLevel = b.dataset.lvl;
    try { localStorage.setItem('takraw-cpu', cpuLevel); } catch {}
    teardown();
    playCPU();
  };
}
$('cancel-btn').onclick = () => { teardown(); showScreen('home'); };
for (const b of document.querySelectorAll('.room-fmt button')) b.onclick = () => setFormat(b.dataset.fmt);
$('room-start').onclick = teamStart;
$('room-fill').onclick = teamFill;
$('leave-btn').onclick = () => { teardown(); showScreen('home'); };
$('go-leave').onclick = () => { teardown(); showScreen('home'); };
$('rematch-btn').onclick = () => { if (isAuthority()) resetMatch(); };
for (const b of document.querySelectorAll('[data-help]')) b.onclick = () => toggleHelp(true);
$('howto-close').onclick = () => toggleHelp(false);
$('opt-landing').checked = showLanding;
$('opt-quality').value = qualityPref;
$('opt-quality').onchange = (e) => setQualityPref(e.target.value);
// bottom controls bar: hidden by default, toggled from the help menu
let showControls = false;
try { showControls = localStorage.getItem('takraw-controls') === '1'; } catch {}
function setControlsBar(on) {
  showControls = !!on;
  try { localStorage.setItem('takraw-controls', on ? '1' : '0'); } catch {}
  document.querySelector('.controls-bar').classList.toggle('hidden', !showControls);
  $('opt-controls').checked = showControls;
}
setControlsBar(showControls);
$('opt-controls').onchange = (e) => setControlsBar(e.target.checked);
$('opt-sound').checked = !sfx.muted;
$('opt-sound').onchange = (e) => setMuted(!e.target.checked);
// buttons never keep keyboard focus (Space would re-click them mid-game)
for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => { b.blur(); sfx.ui(); });
$('opt-landing').onchange = (e) => setLanding(e.target.checked);
for (const tab of document.querySelectorAll('.ht-tab')) {
  tab.onclick = () => {
    document.querySelectorAll('.ht-tab').forEach((t) => t.classList.toggle('on', t === tab));
    document.querySelectorAll('.ht-page').forEach((p) => p.classList.toggle('on', p.dataset.page === tab.dataset.page));
  };
}
ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
const params = new URLSearchParams(location.search);
if (params.get('code')) ui.code.value = params.get('code').toUpperCase().slice(0, 4);

applyQuality(qualityPref === 'auto' ? 'high' : qualityPref);
/* ---------------- map picker (home screen + room) ---------------- */
let roomView = null;                  // a guest's view of the host's map choice
function renderMapPicker(el, choice, editable) {
  if (!el) return;
  el.textContent = '';
  el.classList.toggle('readonly', !editable);
  const cards = document.createElement('div'); cards.className = 'mp-cards';
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.className = 'mp-card' + (m.id === choice.map ? ' on' : '');
    b.style.setProperty('--a', m.swatch[0]); b.style.setProperty('--b', m.swatch[1]);
    const chip = document.createElement('span'); chip.className = 'mp-chip';
    const nm = document.createElement('span'); nm.className = 'mp-name'; nm.textContent = m.name;
    b.append(chip, nm);
    b.title = m.blurb;
    b.disabled = !editable && m.id !== choice.map;
    if (editable) b.onclick = () => pickMap({ map: m.id });
    cards.appendChild(b);
  }
  const row = document.createElement('div'); row.className = 'mp-row';
  for (const [t, label] of [['day', '☀ Day'], ['night', '☾ Night']]) {
    const b = document.createElement('button'); b.className = 'mp-tod' + (choice.time === t ? ' on' : ''); b.textContent = label;
    b.disabled = !editable && choice.time !== t;
    if (editable) b.onclick = () => pickMap({ time: t });
    row.appendChild(b);
  }
  if (editable) {
    const r = document.createElement('button'); r.className = 'mp-tod rnd'; r.textContent = '🎲 Random';
    r.onclick = () => pickMap({ map: MAPS[Math.floor(Math.random() * MAPS.length)].id, time: Math.random() < 0.5 ? 'day' : 'night' });
    row.appendChild(r);
  }
  el.append(cards, row);
}
function pickMap(ch) {
  mapPick = cleanChoice(ch.map ?? mapPick.map, ch.time ?? mapPick.time);
  try { localStorage.setItem('takraw-mappick', JSON.stringify(mapPick)); } catch {}
  if (!playing) applyArena(mapPick);                     // the menu backdrop previews it
  renderPickers();
  if (mode === 'host' && teamMode()) sendRoster();
}
function renderPickers() {
  renderMapPicker(document.getElementById('home-maps'), mapPick, true);
  const guest = mode === 'guest' && roomView;
  renderMapPicker(document.getElementById('room-maps'), guest ? roomView : mapPick, !guest);
}
applyArena(mapPick);
renderPickers();
startLobbyBrowser();
document.getElementById('lobby-refresh').onclick = () => { const el = document.getElementById('lobby-list'); if (el && !probing) el.innerHTML = '<p class="lobby-empty">Looking for games…</p>'; refreshLobbies(); };

// debug hook for automated testing
window.__takraw = { get me() { return me; }, get them() { return them; }, get others() { return others; }, get roster() { return roster; }, get fmt() { return fmt; }, venue: () => venue, time: () => timeOfDay, venues: () => venues, mapPick: () => mapPick, links: () => links.size, F, ball, match, P, aim: () => ({ ...aimCell }), meter: () => myMeter, net: () => ({ main: !!(conn && conn.open), pos: !!(posConn && posConn.open), lastPosSeq }),
  // test helpers: an incoming smash from the other side, and the block effects
  debugSmash: (tx, tz, v = 16) => { const sOpp = -sideSign(me.side); setBall(P.solveSpeed({ x: sOpp * 1.2, y: 2.9, z: 0 }, { x: tx, z: tz }, v)); ballLive = true;
    Object.assign(match, { phase: 'rally', poss: other(me.side), cnt: 2, last: other(me.side), lastPart: 'smash', settled: false }); contactJuice('smash', '', ball, false); },
  debugBlock: (stuffed = true) => blockedJuice({ x: 0, y: 1.7, z: 0.4 }, stuffed),
  outline: () => (ballOutline.visible ? '#' + ballOutline.material.color.getHexString() : null),
  myDot: () => ({ x: +aimDot.g.position.x.toFixed(2), z: +aimDot.g.position.z.toFixed(2) }),
  oppAim: () => ({ visible: oppAimShadow.visible, x: +oppAimShadow.position.x.toFixed(2), z: +oppAimShadow.position.z.toFixed(2) }),
  drop: () => ({ visible: dropZone.ring.visible, color: '#' + dropZone.mat.color.getHexString(), r: +(dropZone.ring.scale.x / 2).toFixed(2), x: +dropZone.ring.position.x.toFixed(2), z: +dropZone.ring.position.z.toFixed(2), out: dropZone.mat.map === dropZone.texOut }), gfx: { renderer, composer, bloom, focusPass, key, scene, THREE } };

/* =====================================================================
   Loop
   ===================================================================== */
const clock = new THREE.Clock();
const PERF = new URLSearchParams(location.search).has('perf');
const perf = { upd: 0, ren: 0, frame: 0, n: 0 };
window.__perf = perf;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);   // up to 10 fps without slowing the game (physics sub-steps handle it)
  const t0 = performance.now();
  autoQuality(dt);
  if (playing) { updateLocal(dt); updateRemote(dt); updateCPU(dt); updateBall(dt); }
  else if (pv.p) updatePreview(dt);
  { const cv = currentVenue(); if (cv) cv.update(dt, renderer.getPixelRatio()); }
  if (window.__takrawBot) window.__takrawBot(dt);   // test hook (unused in normal play)
  updateCamera(dt);
  const t1 = performance.now();
  composer.render();
  if (PERF) renderer.getContext().finish();   // profiling only: wait for the GPU so the timing is real
  if (PERF) { const t2 = performance.now(); perf.upd += t1 - t0; perf.ren += t2 - t1; perf.frame += dt * 1000; perf.n++; }
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  fitFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  autoQ.cool = 2;
});
