import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as P from './physics.js';
import { sfx } from './sfx.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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

const SKY_ROT = -0.11;
const PLAYER_R = 0.24;          // body radius for collisions
const RING_GLOW = 2.6;           // >1 so the bloom pass picks the ring up
const NET_GAP = 0.18;           // closest a player's centre can get to the net plane

const TEAMS = {
  left:  { name: 'left',  jersey: 0xff8a2a, trim: 0xfff1dc, shorts: 0x15161b, css: '#ff8a2a' },
  right: { name: 'right', jersey: 0x2fd3c4, trim: 0x0d1f22, shorts: 0x15161b, css: '#2fd3c4' },
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
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.42 }, uDesat: { value: 0.4 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform float uDesat; uniform vec2 uCenter; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - uCenter) * vec2(1.0, 1.3);
      float e = smoothstep(0.22, 0.8, length(d));
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(l), e * uDesat);
      c.rgb *= 1.0 - e * uStrength;
      gl_FragColor = c;
    }`,
});
composer.addPass(focusPass);
composer.addPass(new OutputPass());

/* =====================================================================
   Lighting — "under the lights" on the river
   ===================================================================== */
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20160e, 0.35));

const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
key.position.set(5, 20, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 2, far: 45 });
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

// Image-based lighting + reflections for the glossy court
new RGBELoader(manager).load('assets/sky/shanghai_bund_1k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.environmentRotation.set(0, SKY_ROT, 0);
  hdr.dispose();
});

// Night skyline backdrop. The concrete promenade fades into the photo's own boardwalk.
texLoader.load('assets/sky/shanghai_bund_bg.jpg', (src) => {
  // Paint out the photo's promenade (people would look giant next to the court):
  // everything below the horizon fades into dark river water.
  const img = src.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.filter = 'saturate(0.4) brightness(0.62)';   // skyline is backdrop, not focus
  g.drawImage(img, 0, 0);
  g.filter = 'none';
  const h = c.height, top = h * 0.487, full = h * 0.512;
  const grad = g.createLinearGradient(0, top, 0, full);
  grad.addColorStop(0, 'rgba(9,12,20,0)');
  grad.addColorStop(1, 'rgba(9,12,20,1)');
  g.fillStyle = grad; g.fillRect(0, top, c.width, full - top);
  g.fillStyle = '#090c14'; g.fillRect(0, full, c.width, h - full);
  src.dispose();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  scene.backgroundIntensity = 0.9;
  // skyline beyond the +x baseline (left player's view), the lit Bund buildings beyond -x
  scene.backgroundRotation.set(0, SKY_ROT, 0);
});

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
  fz.addColorStop(0, '#0d3247'); fz.addColorStop(0.5, '#114058'); fz.addColorStop(1, '#0d3247');
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
  g.fillText('RIVERSIDE  ·  SEPAK TAKRAW', X(0), Z(F.hw + 1.4));
  g.translate(X(0), Z(-F.hw - 1.4)); g.rotate(Math.PI);
  g.fillText('RIVERSIDE  ·  SEPAK TAKRAW', 0, 0);
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
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.8 })
  );
  deck.position.y = -F.deckDrop / 2;
  deck.receiveShadow = true;
  g.add(deck);

  // glossy painted floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(F.outX * 2, F.outZ * 2),
    new THREE.MeshPhysicalMaterial({ map: null, roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 })
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
scene.add(buildCourt());

/* =====================================================================
   Surroundings — promenade, LED boards (boundary), seating, lights
   ===================================================================== */
const ledBoards = [];
function ledTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  const segs = [
    ['TAKRAW', '#5cb8f0', '#0b1622'], ['ISO 3D', '#f2b544', '#1a1306'],
    ['RIVERSIDE OPEN', '#f1ead9', '#14161c'], ['NO HANDS', '#ff8a2a', '#1d0f05'],
  ];
  const w = c.width / segs.length;
  segs.forEach(([t, fg, bg], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg; g.font = '800 44px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, i * w + w / 2, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function buildSurroundings() {
  const g = new THREE.Group();
  const y0 = -F.deckDrop;

  // concrete promenade that fades into the projected sky ground
  const concrete = (name, color) => {
    const t = texLoader.load(`assets/concrete/concrete_${name}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 14);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const fade = document.createElement('canvas');
  fade.width = fade.height = 256;
  const fg = fade.getContext('2d');
  const rg = fg.createRadialGradient(128, 128, 60, 128, 128, 128);
  rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#000');
  fg.fillStyle = rg; fg.fillRect(0, 0, 256, 256);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({
      map: concrete('diff', true), normalMap: concrete('nor_gl'), roughnessMap: concrete('rough'),
      color: 0x8a8f99, alphaMap: new THREE.CanvasTexture(fade), transparent: true, depthWrite: false,
    })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = y0 + 0.002;
  plaza.receiveShadow = true;
  plaza.renderOrder = -1;
  g.add(plaza);

  // riverside railing around the promenade
  {
    const RX = 21, RZ = 17, railH = 1.05;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.35 });
    const postPts = [];
    const rails = [];
    const sides = [
      [new THREE.Vector3(-RX, 0, -RZ), new THREE.Vector3(RX, 0, -RZ)],
      [new THREE.Vector3(RX, 0, -RZ), new THREE.Vector3(RX, 0, RZ)],
      [new THREE.Vector3(RX, 0, RZ), new THREE.Vector3(-RX, 0, RZ)],
      [new THREE.Vector3(-RX, 0, RZ), new THREE.Vector3(-RX, 0, -RZ)],
    ];
    for (const [a, b] of sides) {
      const len = a.distanceTo(b), n = Math.round(len / 1.4);
      for (let i = 0; i < n; i++) postPts.push(a.clone().lerp(b, i / n));
      for (const h of [railH, railH * 0.5]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, h === railH ? 0.07 : 0.03, h === railH ? 0.09 : 0.03), railMat);
        r.position.copy(a).lerp(b, 0.5); r.position.y = y0 + h;
        r.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        rails.push(r);
      }
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, railH, 0.06), railMat, postPts.length);
    const pm = new THREE.Matrix4();
    postPts.forEach((p, i) => { pm.makeTranslation(p.x, y0 + railH / 2, p.z); posts.setMatrixAt(i, pm); });
    g.add(posts, ...rails);
  }

  // LED advertising boards = the hard boundary of the play area
  const ledTex = ledTexture();
  const boardH = 0.8, boardT = 0.12;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.6, metalness: 0.3 });
  const makeBoard = (len, x, z, rotY) => {
    const b = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(len, boardH, boardT), frameMat);
    frame.castShadow = true;
    b.add(frame);
    const tex = ledTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 8, 1);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(len - 0.06, boardH - 0.12),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 })
    );
    face.position.z = boardT / 2 + 0.002;
    b.add(face);
    b.position.set(x, boardH / 2, z);
    b.rotation.y = rotY;
    // lean back slightly like courtside LED boards
    b.rotateX(-0.08);
    g.add(b);
    ledBoards.push(tex);
  };
  const bx = F.outX + boardT / 2, bz = F.outZ + boardT / 2;
  makeBoard(F.outX * 2, 0, -bz, 0);            // faces +z (into court)
  makeBoard(F.outX * 2, 0, bz, Math.PI);       // faces -z
  makeBoard(F.outZ * 2, -bx, 0, Math.PI / 2);  // faces +x
  makeBoard(F.outZ * 2, bx, 0, -Math.PI / 2);  // faces -x

  // light towers at the four corners
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff3dc, emissiveIntensity: 9 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (F.outX + 1.6), pz = sz * (F.outZ + 2.6), h = 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h, 12), poleMat);
    pole.position.set(px, y0 + h / 2, pz);
    pole.castShadow = true;
    g.add(pole);
    const head = new THREE.Group();
    head.position.set(px, y0 + h, pz);
    head.lookAt(0, 0, 0);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.22), poleMat);
    head.add(housing);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), lampMat);
      lamp.position.set(-0.48 + i * 0.48, -0.2 + j * 0.4, 0.115);
      head.add(lamp);
    }
    g.add(head);
    const spot = new THREE.SpotLight(0xfff0dc, 14, 40, 0.55, 0.7, 1.2);
    spot.position.copy(head.position);
    spot.target.position.set(sx * 3, 0, sz * 1);
    g.add(spot, spot.target);
  }

  // festoon string lights along both sides and across each far end
  const bulbGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc77a, emissiveIntensity: 4 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
  const strings = [];
  const corner = (sx, sz) => new THREE.Vector3(sx * (F.outX + 1.6), y0 + 6.2, sz * (F.outZ + 2.6));
  strings.push([corner(-1, -1), corner(1, -1)], [corner(-1, 1), corner(1, 1)]); // sides only — end strings blocked the cameras
  let bulbCount = 0;
  const pts = [];
  for (const [a, b] of strings) {
    const n = Math.round(a.distanceTo(b) / 0.6);
    const line = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * 1.1;
      line.push(p);
      if (i > 0 && i < n) pts.push(p);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
  }
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => { m4.makeTranslation(p.x, p.y - 0.08, p.z); bulbs.setMatrixAt(i, m4); bulbCount++; });
  g.add(bulbs);

  return g;
}
scene.add(buildSurroundings());

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

function numberTexture(num, team) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '800 96px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#' + new THREE.Color(team.trim).getHexString();
  g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createPlayer(side, name) {
  const team = TEAMS[side];
  const root = new THREE.Group();      // world position
  const yaw = new THREE.Group();       // facing
  const body = new THREE.Group();      // lean + bob + jump height
  root.add(yaw); yaw.add(body);

  const skinTones = [0xb9825a, 0x9c6b47, 0xc99a72, 0x7f5538];
  const skin = new THREE.MeshStandardMaterial({ color: skinTones[hashNum(name + side) % skinTones.length], roughness: 0.62 });
  const jersey = new THREE.MeshStandardMaterial({ color: team.jersey, roughness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: team.trim, roughness: 0.55 });
  const shorts = new THREE.MeshStandardMaterial({ color: team.shorts, roughness: 0.7 });
  const sock = new THREE.MeshStandardMaterial({ color: 0xf1ead9, roughness: 0.8 });
  const shoe = new THREE.MeshStandardMaterial({ color: team.jersey, roughness: 0.45 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.85 });

  const M = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // legs: hip (0.90) → knee (0.48) → ankle (0.07)
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0.9, 0); body.add(hip);
    M(new THREE.CapsuleGeometry(0.078, 0.27, 4, 12), shorts, hip, 0, -0.17, 0);
    M(new THREE.CapsuleGeometry(0.068, 0.2, 4, 12), skin, hip, 0, -0.3, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
    M(new THREE.CapsuleGeometry(0.056, 0.26, 4, 12), skin, knee, 0, -0.16, 0);
    M(new THREE.CylinderGeometry(0.058, 0.052, 0.16, 12), sock, knee, 0, -0.3, 0);
    const foot = new THREE.Group(); foot.position.set(0, -0.41, 0); knee.add(foot);
    M(new THREE.BoxGeometry(0.1, 0.075, 0.25), shoe, foot, 0, -0.02, 0.045);
    M(new THREE.BoxGeometry(0.104, 0.02, 0.255), sole, foot, 0, -0.065, 0.045);
    legs.push({ hip, knee });
  }

  // pelvis + torso
  M(new THREE.CapsuleGeometry(0.135, 0.06, 4, 14), shorts, body, 0, 0.93, 0).scale.set(1.25, 1, 0.85);
  const torso = M(new THREE.CapsuleGeometry(0.165, 0.3, 6, 16), jersey, body, 0, 1.21, 0);
  torso.scale.set(1.12, 1, 0.74);
  M(new THREE.TorusGeometry(0.075, 0.016, 8, 20), trim, body, 0, 1.43, 0).rotation.x = Math.PI / 2;

  // jersey numbers (front + back)
  const num = hashNum(name);
  const numMat = new THREE.MeshBasicMaterial({ map: numberTexture(num, team), transparent: true, depthWrite: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), numMat);
  front.position.set(0, 1.24, 0.128);
  body.add(front);
  const back = front.clone();
  back.position.z = -0.128; back.rotation.y = Math.PI; back.position.y = 1.27;
  back.scale.setScalar(1.3);
  body.add(back);

  // arms: shoulder (1.39) → elbow → hand
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.215, 1.385, 0); body.add(sh);
    M(new THREE.SphereGeometry(0.068, 12, 10), jersey, sh, 0, -0.01, 0);
    M(new THREE.CapsuleGeometry(0.046, 0.2, 4, 10), skin, sh, 0, -0.15, 0);
    const el = new THREE.Group(); el.position.set(0, -0.28, 0); sh.add(el);
    M(new THREE.CapsuleGeometry(0.04, 0.19, 4, 10), skin, el, 0, -0.12, 0);
    M(new THREE.SphereGeometry(0.045, 10, 8), skin, el, 0, -0.26, 0.005);
    arms.push({ sh, el, sx });
  }

  // neck + head
  M(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 12), skin, body, 0, 1.49, 0);
  const head = M(new THREE.SphereGeometry(0.105, 22, 18), skin, body, 0, 1.615, 0.005);
  head.scale.set(0.95, 1.1, 1);
  const hairCap = M(new THREE.SphereGeometry(0.109, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, body, 0, 1.63, -0.004);
  hairCap.scale.set(0.97, 1.08, 1.02);
  M(new THREE.TorusGeometry(0.103, 0.014, 8, 26), trim, body, 0, 1.655, 0.002).rotation.x = Math.PI / 2;

  // glow ring at the feet (colour shows where you're standing)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(team.jersey).multiplyScalar(RING_GLOW), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.41, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  root.add(ring);
  // soft pool of light under each player so they read first
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(0xfff2dd).multiplyScalar(0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.008;
  root.add(pool);

  scene.add(root);

  const p = {
    side, team, root, yaw, body, legs, arms, ring, ringMat,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), y: 0, vy: 0,
    facing: sideSign(side) > 0 ? Math.PI / 2 : -Math.PI / 2,
    phase: 0, anim: 0, target: null,
    setName(n) {
      numMat.map = numberTexture(hashNum(n), team);
      numMat.needsUpdate = true;
    },
    dispose() { scene.remove(root); },
  };
  return p;
}

function animatePlayer(p, speed, dt) {
  p.anim += (speed - p.anim) * Math.min(1, dt * 10);
  const s = p.anim;
  const run = Math.min(1, s / 6.5);
  p.phase += dt * (5 + s * 1.55);
  const air = p.y > 0.03;
  const sw = Math.sin(p.phase);

  // athletic ready stance when idle, full stride when running
  const stride = 0.15 + run * 0.75;
  for (let i = 0; i < 2; i++) {
    const L = p.legs[i];
    const ph = i === 0 ? sw : -sw;
    if (air) {
      L.hip.rotation.x = i === 0 ? -0.75 : -0.25;
      L.knee.rotation.x = i === 0 ? 1.1 : 0.6;
    } else {
      L.hip.rotation.z = 0;
      L.hip.rotation.x = -0.12 + ph * stride * (s > 0.2 ? 1 : 0);
      L.knee.rotation.x = 0.22 + Math.max(0, -ph) * (0.3 + run * 1.1) * (s > 0.2 ? 1 : 0);
    }
  }
  for (let i = 0; i < 2; i++) {
    const A = p.arms[i];
    const ph = i === 0 ? -sw : sw;
    A.sh.rotation.x = air ? -1.0 : ph * (0.1 + run * 0.7);
    A.sh.rotation.z = A.sx * (air ? 0.5 : 0.1 + run * 0.05);
    A.el.rotation.x = air ? -0.6 : -0.35 - run * 0.7;
  }
  const bob = air ? 0 : Math.abs(Math.cos(p.phase)) * 0.035 * run;
  p.body.position.y = p.y + bob - (air ? 0 : 0.035);   // slight crouch in ready stance
  p.body.rotation.x = run * 0.22;                     // lean into the run
  p.body.rotation.z = 0; p.body.position.z = 0; p.body.position.x = 0;
  if (air) for (const L of p.legs) L.hip.rotation.z = 0;
  if (p.charging && !p.action) {          // wind-up: kicking leg drawn back, low stance
    const [, L1] = p.legs;
    L1.hip.rotation.x = 0.55; L1.knee.rotation.x = 0.7;
    p.body.rotation.x = 0.12; p.body.position.y -= 0.06;
    for (const A of p.arms) A.sh.rotation.z = A.sx * 0.55;
  }
  if (p.action) {
    p.action.t += dt;
    const u = p.action.t / (ACTION_DURS[p.action.part] || ACTION_DUR);
    if (u >= 1) p.action = null;
    else actionPose(p, p.action.part, Math.sin(Math.PI * Math.min(1, u * 1.4)), u);
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
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) dashQueued = true;
  if (!e.repeat) onActionKey(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* =====================================================================
   Simulation
   ===================================================================== */
let me = null, them = null, playing = false;
const WALK = 4.0, ACCEL = 28, JUMP_V = 7.6, GRAV = 17;   // jump apex ≈ 1.7 m — big midair attacks
// Dash: a short burst in the input direction (or facing, if standing still)
const DASH_SPEED = 11, DASH_TIME = 0.16, DASH_COOLDOWN = 0.7;
let dashQueued = false, dashT = 0, dashCd = 0;
const dashDir = new THREE.Vector2();
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
  if (locked) { fwd = 0; right = 0; dashQueued = false; }
  const sgn = sideSign(me.side);
  const ix = fwd * sgn, iz = right * sgn;
  const len = Math.hypot(ix, iz);
  dashCd = Math.max(0, dashCd - dt);
  if (dashQueued) {
    dashQueued = false;
    if (dashCd <= 0 && me.y <= 0) {
      if (len) dashDir.set(ix / len, iz / len);
      else dashDir.set(Math.sin(me.facing), Math.cos(me.facing));
      dashT = DASH_TIME;
      dashCd = DASH_COOLDOWN;
      sfx.dash();
      fx.dust(me.pos.x, me.pos.z, 8);
    }
  }
  if (dashT > 0) {
    dashT -= dt;
    me.vel.x = dashDir.x * DASH_SPEED;
    me.vel.z = dashDir.y * DASH_SPEED;
  } else {
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

  if (keys.has('Space') && me.y <= 0 && !locked) { me.vy = JUMP_V; sfx.jump(); fx.dust(me.pos.x, me.pos.z, 18); fx.ring(me.pos.x, me.pos.z, { color: 0x9fb4c8, r: 1.0, life: 0.35, bright: 0.8 }); }
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
  if (!them || !them.target) return;
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
   passes every 3 points, game to 21 (win by 2, capped at 25).
   ===================================================================== */
const ACTION_DUR = 0.34;
const REACH = 1.0;                // how far (m) from your body you can play the ball
const BALL_VIS = 3.0;             // drawn much larger than life (≈ the old glow) so it reads from the fixed camera
const BALL_VR = P.BALL_R * BALL_VIS;
const BALL_TIME = 0.78;           // ball physics runs at 78% speed — slower, readable rallies
const PERFECT = 0.06;             // perfect window (ball-time seconds)
const other = (s) => (s === 'left' ? 'right' : 'left');

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
landMark.add(flatRing(0.16, 0.22, new THREE.Color(0xffffff).multiplyScalar(1.4), 0.85));
landMark.add(flatRing(0.0, 0.05, new THREE.Color(0xffffff).multiplyScalar(1.4), 0.85));
landMark.position.y = 0.01;
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
try { showLanding = localStorage.getItem('takraw-landing') !== '0'; } catch {}

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
  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.7; vel[i * 3 + 2] *= 0.7; }
      const k = Math.max(0, life[i] / maxLife[i]);
      col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = k;
    }
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
let jQ = false, kQ = false, fQ = false;
let cueArmed = true;
let lastWhoosh = 0;

const isAuthority = () => mode !== 'guest';
const decidesHalf = (half) => mode === 'solo' || (me && me.side === half);
const playerBySide = (side) => (me && me.side === side ? me : them && them.side === side ? them : null);
const serveLocked = () => !!me && (match.phase === 'serve-wait' || match.phase === 'serve-toss') && match.server === me.side;

function setBall(b) {
  ball.x = b.x; ball.y = b.y; ball.z = b.z; ball.vx = b.vx; ball.vy = b.vy; ball.vz = b.vz;
  hist.length = 0; pending = null; acc = 0; deadBall.on = false; approach = null; ballFire = false;
}
const packBall = () => [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].map((v) => +v.toFixed(4));
const unpackBall = (a) => ({ x: a[0], y: a[1], z: a[2], vx: a[3], vy: a[4], vz: a[5] });

function onActionKey(code) {
  if (code === 'KeyH' || code === 'Slash') { toggleHelp(); return; }
  if (code === 'Escape') { toggleHelp(false); return; }
  if (code === 'KeyN') { setMuted(!sfx.muted); return; }
  if (!playing || helpOpen()) return;
  if (code === 'ArrowUp') aimStep(1, 0);
  if (code === 'ArrowDown') aimStep(-1, 0);
  if (code === 'ArrowLeft') aimStep(0, -1);
  if (code === 'ArrowRight') aimStep(0, 1);
  if (code === 'KeyJ') jQ = true;      // serve flow, or start charging a set
  if (code === 'KeyK') kQ = true;      // start charging a kick
  if (code === 'KeyF') fQ = true;
  if (code === 'KeyM') setLanding(!showLanding);
}
function setLanding(v) {
  showLanding = v;
  try { localStorage.setItem('takraw-landing', v ? '1' : '0'); } catch {}
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
const AIM_ROWS = [1.6, 4.0, 6.6];        // front, middle, back (m from the net)
const AIM_COLS = [-2.4, 0, 2.4];         // left, centre, right (your screen)
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
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), transparent: true, depthWrite: false }));
  const ring = flatRing(0.28, 0.36, new THREE.Color(0xffd34d).multiplyScalar(1.6), 0.95);
  dot.rotation.x = -Math.PI / 2;
  g.add(dot, ring);
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
  const t = aimTarget(me);
  aimDot.g.position.set(t.x, 0.018, t.z);
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
  if (Math.abs(p.pos.z) > 1.3) dir = -Math.sign(p.pos.z);
  else dir = (setFlip = -setFlip);
  let x = isSet ? -s * 1.4 : p.pos.x + s * 2.0;
  x = s > 0 ? THREE.MathUtils.clamp(x, -(F.hl - 0.6), -1.0) : THREE.MathUtils.clamp(x, 1.0, F.hl - 0.6);
  const z = THREE.MathUtils.clamp(p.pos.z + dir * (isSet ? 1.0 : 1.6), -(F.hw - 0.4), F.hw - 0.4);
  return { x, z };
}
const bodyPart = (hr) => (hr < 0.95 ? 'foot' : hr < 1.25 ? 'knee' : hr < 1.6 ? 'chest' : 'head');
const PART_NAME = { ult: 'ULTIMATE SPIN KICK', bicycle: 'Bicycle kick', dheader: 'Diving header', volley: 'Scissor volley', shank: 'Shank', 'serve-power': 'Power serve', foot: 'Inside foot', knee: 'Knee', chest: 'Chest', head: 'Header', kick: 'Kick', spike: 'Spike', serve: 'Serve', toss: 'Toss', body: 'Body', block: 'Block' };

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
  if (match.phase === 'serve-toss') return match.server === me.side;
  return match.phase === 'rally' && (P.sideOfX(ball.x) === me.side || (ball.vx * sideSign(me.side) < 0 && Math.abs(ball.x) < 2));
}

/* ---------------- auto timing meter: it starts by itself as the ball comes in — just TAP on green ---------------- */
const G_CENTER = 0.72;            // green zone centre on the bar (0..1) — never moves
const GREEN_HALF = 0.075;         // green = within ±0.075 of the centre (bar units)
const YELLOW_HALF = 0.2;          // yellow = within ±0.2
const APPROACH_R = 0.75;          // the meter appears this many seconds before the ideal moment
const WHIFF_DELAY = 0.7;          // can't swing again for this long after swinging at nothing
let recoverT = 0;
let approach = null;              // { p, needle, dead, lastSeen } for the ball currently coming at you

function setMeterZones() {
  const g = document.getElementById('tmf-zone'), n = document.getElementById('tmf-near');
  g.style.opacity = '1'; n.style.opacity = '1';
  g.style.left = `${(G_CENTER - GREEN_HALF) * 100}%`; g.style.width = `${GREEN_HALF * 200}%`;
  n.style.left = `${(G_CENTER - YELLOW_HALF) * 100}%`; n.style.width = `${YELLOW_HALF * 200}%`;
}
function canSwing() {
  if (!me || !playing) return false;
  return match.phase === 'rally' || (match.phase === 'serve-toss' && match.server === me.side);
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
  el.classList.toggle('full', myMeter >= 100);
  document.getElementById('meter-state').textContent = myMeter >= METER_ULT_MIN ? 'ULTIMATE READY · jump + K' : 'perfects build it';
  if (me) {
    const theirs = them ? them.meter || 0 : 0;
    const L = me.side === 'left' ? myMeter : theirs, R = me.side === 'left' ? theirs : myMeter;
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
function needleAt(r, p) {
  if (r >= 0) return G_CENTER * (1 - Math.pow(Math.min(r, APPROACH_R) / APPROACH_R, p));
  return G_CENTER + (-r) * (G_CENTER / APPROACH_R) * (p < 1 ? 2.2 : 1.4);   // past the ideal: keeps going
}
function updateApproach() {
  const el = $('tm-float');
  const live = ballIncoming() && !pending && touchCd <= 0;
  let c = null;
  if (live) c = findContact(me, prefFor('K'), true, 1.2);
  if (!live || !c || c.d > REACH) {
    if (approach && !approach.dead && performance.now() - approach.lastSeen > 250) approach = null;
    el.classList.remove('charging');
    if (me) me.charging = null;
    return;
  }
  const r = c.tau / BALL_TIME;
  if (!approach) {
    if (r > APPROACH_R) { el.classList.remove('charging'); return; }
    approach = { p: Math.random() < 0.4 ? 0.5 : 1, needle: 0, dead: false, lastSeen: 0 };
    sfx.cue();
  }
  if (approach.dead) { el.classList.remove('charging'); if (me) me.charging = null; return; }
  approach.lastSeen = performance.now();
  approach.needle = Math.max(approach.needle, THREE.MathUtils.clamp(needleAt(r, approach.p), 0, 1));
  if (approach.needle >= 1) { approach.dead = true; el.classList.remove('charging'); return; }   // let it go by
  el.classList.add('charging');
  me.charging = 'K';
  const inGreen = Math.abs(approach.needle - G_CENTER) <= GREEN_HALF;
  $('tmf-marker').style.opacity = '1';
  $('tmf-marker').style.left = `${approach.needle * 100}%`;
  $('tmf-fill').style.width = `${approach.needle * 100}%`;
  $('tmf-label').textContent = inGreen ? 'NOW!' : me.y > 0.12 ? 'SPIKE' : match.phase === 'serve-toss' ? 'SERVE' : 'TAP';
  $('tmf-label').className = 'tmf-label ' + (inGreen ? 'perfect' : 'charge');
  $('tmf-part').textContent = '';
  floatT = 0.3;
}
// J or K tap: graded by where the needle is right now; the touch lands when the ball arrives
function tapSwing(kind) {
  if (!me || !playing) return;
  if (recoverT > 0) { sfx.miss(); return; }
  if (touchCd > 0 || pending) return;
  sfx.swing();
  if (match.phase === 'serve-toss' && kind !== 'K') return;
  if (!approach || approach.dead || !ballIncoming()) { whiff(kind); return; }
  const c = findContact(me, prefFor(kind), true, 1.2);
  if (c.d > REACH) { whiff(kind); return; }
  const e = approach.needle - G_CENTER;
  const tier = Math.abs(e) <= GREEN_HALF ? 2 : Math.abs(e) <= YELLOW_HALF ? 1 : 0;
  const early = e < 0;
  approach.dead = true;
  me.charging = null;
  const aim = kind === 'K' ? aimTarget(me) : null;
  if (c.tau > 0.012) pending = { kind, at: simTime + c.tau, err: Math.abs(e), early, d: c.d, charge: 1, aim, tier };
  else doTouch(kind, Math.abs(e), early, c.d, 1, aim, tier);
}

let ultPower = 0;
function doTouch(kind, err, early, d, chargeAmt = 1, aim = null, forcedTier = null) {
  pending = null;
  if (!ballLive) return;
  const s = sideSign(me.side);
  const hr = ball.y - me.y;
  const air = me.y > 0.12;
  const isServe = match.phase === 'serve-toss';
  const inSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);

  // timing tier from the release
  let tier = forcedTier !== null ? forcedTier : err <= GREEN_HALF ? 2 : err <= YELLOW_HALF ? 1 : 0;
  if (tier === 2 && d > 0.8) tier = 1;                                  // stretched for it
  if (kind === 'K' && inSpeed > 14 && !isServe && tier > 0) tier--;     // hard balls are hard to kick — control with J
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
  if (kind === 'J') {
    part = bodyPart(hr);
    const isSet = match.poss === me.side && match.cnt >= 1;
    const tg = setTarget(me, isSet);
    const dev = [2.3, 0.8, 0.2][tier];
    const [ox, oz] = jitter(dev);
    tg.x += ox; tg.z += oz;
    const apex = tier === 0 ? 2.6 + Math.random() * 3.0 : (isSet ? 6.2 : 5.3) - (tier === 1 ? 0.5 : 0);
    shot = P.solveApex(from, tg, apex, false);
  } else {
    const tg = aim ? { x: aim.x, z: aim.z } : aimTarget(me);
    const spike = air && ball.y >= 1.7 && Math.abs(me.pos.x) <= 3.2 && !isServe;
    if (spike) {
      part = 'spike';
      if (tier >= 1 && myMeter >= METER_ULT_MIN) {
        // ULTIMATE SPIN KICK: faster and more accurate the fuller your meter
        const pw = myMeter / 100;
        const [ox, oz] = jitter(tier === 2 ? 0.15 : 0.6); tg.x += ox; tg.z += oz;
        shot = P.solveSpeed(from, tg, (tier === 2 ? 21 : 17) + 14 * pw);
        part = 'ult'; ultPower = pw;
      } else if (tier === 2) { const [ox, oz] = jitter(0.3); tg.x += ox; tg.z += oz; shot = P.solveSpeed(from, tg, (17 + 6 * chargeAmt)); }
      else if (tier === 1) { const [ox, oz] = jitter(1.1); tg.x += ox; tg.z += oz; shot = P.solveSpeed(from, tg, 13 + 2 * chargeAmt); }
      else shot = Math.random() < 0.5 ? P.solveSpeed(from, offOut(), 14) : P.solveApex(from, { x: s * 3, z: tg.z }, 4.6, true);
    } else {
      part = isServe ? 'serve' : hr < 1.3 ? 'kick' : bodyPart(hr);
      const settled = match.settled && match.poss === me.side;
      if (tier === 0) {
        // way off: out, or a floater that's easy to put away
        if (Math.random() < 0.5) shot = P.solveApex(from, offOut(), 3.6, true);
        else shot = P.solveApex(from, { x: s * 3.2, z: tg.z * 0.5 }, 5.6, true);
      } else {
        let apex = isServe ? (tier === 2 ? 2.9 : 3.5) : settled ? (tier === 2 ? 3.0 : 3.7) : (tier === 2 ? 3.8 : 4.4);
        apex += weak * 0.5;
        const [ox, oz] = jitter(tier === 2 ? 0.25 : 1.0);
        tg.x += ox; tg.z += oz;
        shot = P.solveApex(from, tg, apex, true);
      }
    }
  }
  // style: how good the kick is decides how flashy it looks
  if (kind === 'K' && part !== 'spike' && part !== 'ult' && part !== 'serve') {
    if (tier === 2) part = hr >= 1.55 ? 'dheader' : (hr >= 1.1 || (match.settled && match.poss === me.side)) ? 'bicycle' : 'volley';
    else if (tier === 0) part = 'shank';
  } else if (part === 'serve' && tier === 2) part = 'serve-power';
  setBall(shot);
  if (part === 'ult') ballFire = true;
  if (kind === 'K') resetAim();     // aim snaps back to the centre after every kick

  if (isServe) { match.phase = 'rally'; match.poss = me.side; match.cnt = 3; }
  else {
    if (match.poss !== me.side) { match.poss = me.side; match.cnt = 0; }
    match.cnt++;
  }
  match.last = me.side;
  match.settled = kind === 'J' && tier >= 1;
  touchCd = 0.25;
  me.facing = kind === 'J' ? (s > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(shot.vx, shot.vz) || me.facing;
  me.action = { part, t: 0 };
  // meter: the Ultimate spends it all; otherwise perfects build it and way-off touches empty it
  if (part === 'ult') { setMeter(0); ballFire = true; }
  else setMeter(tier === 2 ? myMeter + 20 : tier === 1 ? myMeter + 5 : 0);
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
function contactJuice(part, label, at, mine, power = 0) {
  const pan = panOf(at.x, at.y, at.z);
  if (part === 'ult') sfx.ult(pan);
  else if (part === 'spike' || part === 'bicycle') sfx.spike(1, pan);
  else if (part === 'dheader') { sfx.head(pan); sfx.kick(0.9, pan); }
  else if (part === 'volley' || part === 'serve-power') sfx.kick(1, pan);
  else if (part === 'shank') sfx.body(pan);
  else if (part === 'kick' || part === 'serve' || part === 'foot') sfx.kick(part === 'foot' ? 0.4 : 0.8, pan);
  else if (part === 'knee') sfx.kick(0.3, pan);
  else if (part === 'head') sfx.head(pan);
  else if (part === 'chest') sfx.chest(pan);
  else if (part === 'body' || part === 'block') sfx.body(pan);
  else if (part === 'toss') sfx.toss(pan);
  if (part === 'toss') { fx.emit(at.x, at.y, at.z, { n: 8, color: PAL.cool, speed: 0.8, up: 1, life: 0.4, size: 0.06 }); return; }
  const perfect = label === 'PERFECT';
  if (mine) { if (perfect) sfx.perfect(); else if (label === 'GOOD') sfx.good(); }

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
  } else if (part === 'spike') {
    shake(0.55);
    fx.ring(at.x, at.z, { color: 0xff8a2a, r: 1.9 });
    fx.emit(at.x, at.y, at.z, { n: 50, color: PAL.warm, speed: 5, up: 2, life: 0.7, size: 0.1 });
  } else if (part === 'bicycle' || part === 'dheader' || part === 'volley') {
    shake(0.4); fx.ring(at.x, at.z, { color: 0xffd34d, r: 2.0 });
    fx.emit(at.x, at.y, at.z, { n: 55, color: PAL.gold, speed: 4, up: 2.6, life: 0.9, size: 0.12 });
  } else if (part === 'kick' || part === 'serve' || part === 'serve-power') shake(perfect ? 0.22 : 0.12);
  if (power) { fx.ring(at.x, at.z, { color: 0xffd34d, r: 1.4 }); shake(0.15); }
  else if (perfect) shake(0.1);
}

function sendTouch(part, label = '') {
  if (!conn || !conn.open) return;
  conn.send({ t: 'touch', r: match.rally, b: packBall(), part, label, side: me.side,
    phase: match.phase, poss: match.poss, cnt: match.cnt, last: match.last, settled: match.settled, mt: Math.round(myMeter) });
}

// a ball that hits your body without a key press still counts (blocks at the net don't)
function bodyCheck() {
  if (!me || touchCd > 0 || pending || match.phase !== 'rally') return;
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
  hist.length = 0;
  if (!block) {
    if (match.poss !== me.side) { match.poss = me.side; match.cnt = 0; }
    match.cnt++;
    sfx.touch(match.cnt);
  }
  match.last = me.side; match.settled = false;
  touchCd = 0.3;
  const part = block ? 'block' : 'body';
  me.action = { part, t: 0 };
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
    if (e.type === 'tape') { sfx.tape(pan); fx.emit(e.x, e.y, e.z, { n: 8, color: 0xffffff, speed: 1.2, life: 0.4 }); }
    if (me && match.poss === me.side) cueArmed = true;
    renderMatchUI();
    return;
  }
  if (e.type === 'net') {
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
    if (match.serveCount >= 3) { match.serveCount = 0; match.server = other(match.server); }
    const a = match.score.left, b = match.score.right;
    if ((Math.max(a, b) >= 11 && Math.abs(a - b) >= 2) || Math.max(a, b) >= 15) match.over = true;   // first to 11, win by 2, cap 15
  }
  match.phase = 'point';
  pointTimer = 2.0;
  ballLive = false; frozenEnd = null;
  broadcastMatch();
  onMatchChanged('point');
}

function nextServe() {
  resetAim();
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
  ballLive = false; pending = null; frozenEnd = null; deadBall.on = false;
  broadcastMatch();
  onMatchChanged(match.phase);
}

function broadcastMatch() {
  if (mode === 'host' && conn && conn.open) conn.send({ t: 'match', m: JSON.parse(JSON.stringify(match)) });
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
  cueArmed = true;
  sfx.machine(panOf(shot.x, shot.y, shot.z));
  fx.emit(shot.x, shot.y, shot.z, { n: 10, color: 0xffffff, speed: 1.4, life: 0.4 });
  renderMatchUI();
}

function updateBall(dt) {
  touchCd = Math.max(0, touchCd - dt * BALL_TIME);
  recoverT = Math.max(0, recoverT - dt);

  // inputs
  if (jQ) {
    jQ = false;
    if (mode === 'solo' && match.phase === 'idle') {             // practice: J walks you to the circle, J again tosses
      match.phase = 'serve-wait'; match.server = me.side; snapToServe(); sfx.yourServe(); renderMatchUI();
    } else if (match.phase === 'serve-wait' && match.server === me.side) tossServe();
    else tapSwing('J');
  }
  if (kQ) { kQ = false; tapSwing('K'); }
  if (fQ) { fQ = false; if (mode === 'solo' && (match.phase === 'idle' || match.phase === 'serve-wait')) feedBall(); }

  // fixed-step physics, slowed by BALL_TIME
  if (ballLive) {
    acc += dt * BALL_TIME;
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
    const h = playerBySide(match.server);
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

  // landing prediction
  landMark.visible = false;
  if (showLanding && ballLive) {
    const r = P.simulate(ball, 3);
    if (r.end) { landMark.visible = true; landMark.position.set(r.end.x, 0.01, r.end.z); }
  }
  landMark.rotation.y += dt * 2;

  // timing ring: shows how long until the sweet spot (if the ball will come into reach)
  timingRing.visible = false;
  if (myBall() && !pending && touchCd <= 0) {
    const kind = match.phase === 'serve-toss' ? 'K' : 'J';
    const c = findContact(me, prefFor(kind), false);
    if (c.d <= REACH && c.tau <= 0.7) {
      const tReal = c.tau / BALL_TIME;
      const k = THREE.MathUtils.clamp(tReal / 0.7, 0, 1);
      const sz = BALL_VR * 2.4 * (1 + 2.2 * k);
      timingRing.visible = true;
      timingRing.position.set(ball.x, Math.max(ball.y, BALL_VR), ball.z);
      timingRing.scale.setScalar(sz);
      const inWin = c.tau <= PERFECT;
      timingRing.material.color.set(inWin ? 0x5fd38a : k < 0.35 ? 0xf2b544 : 0xffffff).multiplyScalar(inWin ? 2.2 : 1.4);
      timingRing.material.opacity = 0.35 + (1 - k) * 0.65;
      if (inWin && cueArmed) { cueArmed = false; sfx.cue(); }
    } else cueArmed = true;
  }

  updateAim(dt);

  fx.update(dt);
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
  if (msg.part === 'toss') match.server = msg.side;
  match.poss = msg.poss; match.cnt = msg.cnt; match.last = msg.last; match.settled = !!msg.settled;
  if (them) { them.action = { part: msg.part, t: 0 }; if (Number.isFinite(msg.mt)) them.meter = msg.mt; }
  if (msg.part === 'ult') ballFire = true;
  renderMeter();
  contactJuice(msg.part, '', ball, false);
  // catch up for the time the message spent travelling
  const steps = Math.round((Math.min(0.15, rtt / 2000) * BALL_TIME) / P.STEP);
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
const ACTION_DURS = { ult: 0.85, bicycle: 0.8, dheader: 0.6, volley: 0.5, spike: 0.62, shank: 0.45, 'serve-power': 0.42 };
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
    case 'kick': case 'serve':
      L1.hip.rotation.x = -1.75 * e; L1.knee.rotation.x = 0.35 * (1 - e); hipPivot(p, -0.28 * e);
      for (const A of p.arms) A.sh.rotation.z = A.sx * 0.8 * e; break;
    case 'serve-power':      // hop into a full-extension kick
      p.body.position.y += 0.25 * e;
      L1.hip.rotation.x = -2.1 * e; L1.knee.rotation.x = 0.1; L0.hip.rotation.x = 0.4 * e; hipPivot(p, -0.4 * e);
      for (const A of p.arms) A.sh.rotation.z = A.sx * 1.2 * e; break;
    case 'ult':
    case 'spike': {          // sideways 360° spin: kicking leg swung out to the side, side of the foot meets the ball
      const spin = u < 1 ? u * u * (3 - 2 * u) : 1;        // smooth full turn
      hipPivot(p, 0, -Math.PI * (part === 'ult' ? 4 : 2) * spin);   // the Ultimate spins twice
      L1.hip.rotation.z = 1.55 * e; L1.hip.rotation.x = -0.35 * e; L1.knee.rotation.x = 0.08;   // leg out sideways, straight
      L0.hip.rotation.x = -0.7 * e; L0.knee.rotation.x = 1.3 * e;                                 // other leg tucked
      for (const A of p.arms) { A.sh.rotation.z = A.sx * 1.4 * e; A.sh.rotation.x = -0.3 * e; }
      break;
    }
    case 'bicycle': {        // overhead scissor: hop, roll back, legs swap in the air
      p.body.position.y += 0.75 * e;
      hipPivot(p, -2.3 * e);
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
    case 'block':
      for (const A of p.arms) { A.sh.rotation.x = -2.9 * e; A.sh.rotation.z = A.sx * 0.25; } break;
    case 'body':
      hipPivot(p, -0.25 * e); break;
  }
}

/* ---------------- HUD ---------------- */
const REASON = {
  IN: 'Ball down', OUT: 'Out', WIDE: 'Outside the tapes', UNDER: 'Under the net',
  FOUR: 'Four touches', FOOT: 'Foot fault', DROP: 'Serve dropped',
};
function sideName(side) {
  if (!me) return '';
  if (side === me.side) return myName;
  if (mode === 'solo') return 'Ball machine';
  return (them && them.displayName) || 'Opponent';
}
let lastServeAnnounce = -1;
function renderMatchUI() {
  if (!me) return;
  $('sc-left').textContent = match.score.left;
  $('sc-right').textContent = match.score.right;
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
  if (phase === 'serve-wait' && me && match.server === me.side && lastServeAnnounce !== match.rally) {
    lastServeAnnounce = match.rally;
    snapToServe();
    sfx.yourServe();
  }
  if (phase === 'over' || (match.over && phase !== 'serve-wait' && phase !== 'point')) {
    const w = match.score.left > match.score.right ? 'left' : 'right';
    $('go-title').textContent = `${sideName(w)} wins`;
    $('go-score').textContent = `${match.score.left} – ${match.score.right}`;
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
  if (match.phase === 'idle') h = 'J  serve      F  ball feed';
  else if (match.phase === 'wait') h = 'Waiting for the host…';
  else if (match.phase === 'serve-wait') h = match.server === me.side ? `J  toss      arrows  aim (${AIM_NAMES[aimCell.row][aimCell.col]})` : `${sideName(match.server)} to serve`;
  else if (match.phase === 'serve-toss' && match.server === me.side) h = 'Tap K on green';
  else if (match.phase === 'rally' && match.poss === me.side && !(approach && !approach.dead) && P.sideOfX(ball.x) === me.side) h = myMeter >= METER_ULT_MIN ? 'ULTIMATE READY  ·  set it up, jump + K' : 'Tap J set  ·  K kick on green   ·   arrows  aim';
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
    camPos.set(-s * 14.6, 5.3, 0);
    camLook.set(s * 1.6, 0.55, 0);
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
  focusPass.uniforms.uStrength.value += ((live ? 0.55 : 0.4) - focusPass.uniforms.uStrength.value) * 0.05;
  focusPass.uniforms.uDesat.value += ((live ? 0.65 : 0.4) - focusPass.uniforms.uDesat.value) * 0.05;
}

/* =====================================================================
   Networking — PeerJS (WebRTC), no game server
   ===================================================================== */
const PROTOCOL = 3;
const PREFIX = 'takraw-iso-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let peer = null, conn = null, sendTimer = null, pingTimer = null;
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
}
function setStatus(s) { ui.status.textContent = s; }
function setBoardNames() {
  const mine = myName, theirs = them ? them.displayName || 'Opponent' : '—';
  if (!me) return;
  void mine; void theirs;   // names no longer shown on the scoreboard
}

function startGame(side) {
  playing = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setMeterZones();
  resetAim();
  myMeter = 0; ballFire = false;
  if (me) me.dispose();
  me = createPlayer(side, myName);
  me.pos.copy(spawnPoint(side));
  lastZone = '';
  ballLive = false; pending = null; frozenEnd = null; deadBall.on = false;
  Object.assign(match, { phase: mode === 'solo' ? 'idle' : 'wait', score: { left: 0, right: 0 }, poss: null, cnt: 0, last: null, over: false });
  $('gameover').classList.add('hidden');
  animatePlayer(me, 0, 0);
  updateCamera(0, true);
  showScreen('game');
  ui.ping.textContent = mode === 'solo' ? 'PRACTICE' : `${roomCode} · — ms`;
  setBoardNames();
  renderMatchUI();
}

function spawnRemote(side, name) {
  if (them) them.dispose();
  them = createPlayer(side, name);
  them.displayName = name;
  them.pos.copy(spawnPoint(side));
  them.target = { x: them.pos.x, z: them.pos.z, y: 0, r: them.facing, s: 0 };
  setBoardNames();
}

function wireConnection(c) {
  conn = c;
  c.on('open', () => {
    c.send({ t: 'hello', name: myName, v: PROTOCOL });
    startGame(mode === 'host' ? 'left' : 'right');
    spawnRemote(mode === 'host' ? 'right' : 'left', 'Opponent');
    setStatus('');
    if (mode === 'host') resetMatch();
    clearInterval(sendTimer); clearInterval(pingTimer);
    sendTimer = setInterval(() => {
      if (!me || !conn || !conn.open) return;
      conn.send({ t: 's', mt: Math.round(myMeter), x: +me.pos.x.toFixed(3), z: +me.pos.z.toFixed(3), y: +me.y.toFixed(3),
        r: +me.facing.toFixed(3), s: +Math.hypot(me.vel.x, me.vel.z).toFixed(2) });
    }, 1000 / 30);
    pingTimer = setInterval(() => { if (conn && conn.open) conn.send({ t: 'ping', ts: performance.now() }); }, 1500);
  });
  c.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello' && them) {
      const n = String(msg.name || 'Opponent').slice(0, 14);
      them.displayName = n;
      them.setName(n);
      setBoardNames();
      if (msg.v !== PROTOCOL) setStatus('Opponent is on a different version — both of you refresh the page');
    } else if (msg.t === 's' && them) {
      const n = (v) => (Number.isFinite(v) ? v : 0);
      them.target = { x: n(msg.x), z: n(msg.z), y: n(msg.y), r: n(msg.r), s: n(msg.s) };
      if (Number.isFinite(msg.mt) && msg.mt !== them.meter) { them.meter = msg.mt; renderMeter(); }
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
    }
  });
  c.on('close', () => {
    if (conn !== c) return;
    conn = null;
    clearInterval(sendTimer); clearInterval(pingTimer);
    if (them) { them.dispose(); them = null; }
    setBoardNames();
    ballLive = false; match.phase = 'wait'; onMatchChanged('wait');
    ui.ping.textContent = `${roomCode} · — ms`;
    setStatus(mode === 'host' ? 'Opponent left — waiting for someone to join…' : 'Host left the game');
  });
  c.on('error', (e) => console.warn('conn error', e));
}

function hostGame(attempt = 0) {
  readName(); showError('');
  mode = 'host';
  roomCode = randomCode();
  ui.waitCode.textContent = roomCode;
  ui.waitStatus.textContent = 'Connecting to matchmaking…';
  showScreen('wait');
  peer = new Peer(PREFIX + roomCode);
  peer.on('open', () => { ui.waitStatus.textContent = 'Waiting for opponent to join…'; });
  peer.on('connection', (c) => {
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
  if (conn) { try { conn.close(); } catch {} conn = null; }
  if (peer) { try { peer.destroy(); } catch {} peer = null; }
  if (me) { me.dispose(); me = null; }
  if (them) { them.dispose(); them = null; }
  playing = false;
  ballLive = false; pending = null; frozenEnd = null;
  approach = null;
  match.phase = 'idle';
  $('gameover').classList.add('hidden');
  renderBall(0);
}

$('create-btn').onclick = () => hostGame();
$('join-btn').onclick = joinGame;
$('practice-btn').onclick = practice;
$('cancel-btn').onclick = () => { teardown(); showScreen('home'); };
$('leave-btn').onclick = () => { teardown(); showScreen('home'); };
$('go-leave').onclick = () => { teardown(); showScreen('home'); };
$('rematch-btn').onclick = () => { if (isAuthority()) resetMatch(); };
for (const b of document.querySelectorAll('[data-help]')) b.onclick = () => toggleHelp(true);
$('howto-close').onclick = () => toggleHelp(false);
$('opt-landing').checked = showLanding;
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

// debug hook for automated testing
window.__takraw = { get me() { return me; }, get them() { return them; }, F, ball, match, P, aim: () => ({ ...aimCell }), meter: () => myMeter };

/* =====================================================================
   Loop
   ===================================================================== */
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playing) { updateLocal(dt); updateRemote(dt); updateBall(dt); }
  if (window.__takrawBot) window.__takrawBot(dt);   // test hook (unused in normal play)
  for (const t of ledBoards) t.offset.x = (t.offset.x + dt * 0.04) % 1;
  updateCamera(dt);
  composer.render();
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  fitFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
});
