// Samples a map's ground for spectators (see spectate.js): run from a folder whose node_modules has playwright.
//   node spectate-probe.mjs <url> <maps,comma> <normal|big> <high|ultra> <outdir>   → <outdir>/<map>-<size>-<q>.json
import { chromium } from 'playwright'; import fs from 'fs';
const [URL, mapsArg, size = 'normal', Q = 'high', OUT = 'grids'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.addInitScript((q) => { localStorage.setItem('takraw-quality', q); }, Q);
await p.goto(URL + '?' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 240000 }); await p.waitForFunction(() => !!window.__takraw, null, { timeout: 240000 });
for (const m of mapsArg.split(',')) {
  const res = await p.evaluate(async ([m, size]) => {
    window.__takraw.setCourt(size); window.__reelAt(m, 0, 0.5); await new Promise((r) => setTimeout(r, 3000));
    const { scene, THREE } = window.__takraw.gfx;
    const meshes = []; scene.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh) && !(o.material && (o.material.blending === THREE.AdditiveBlending || (o.material.transparent && o.material.opacity < 0.3)))) meshes.push(o); });
    for (const m of meshes) for (const mt of [].concat(m.material)) mt.side = THREE.DoubleSide;
    scene.updateMatrixWorld(true);
    for (const m of meshes) { if (m.isInstancedMesh) m.computeBoundingSphere(); else if (m.geometry) { m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); } }
    const rc = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0); const o = new THREE.Vector3();
    const X0 = -24, Z0 = -16, S = 0.5, W = 97, H = 65, ys = [], us = [], fs = [];
    const hit = (x, y, z, dir, far) => { o.set(x, y, z); rc.set(o, dir); rc.far = far; const h = rc.intersectObjects(meshes, false)[0]; return h ? +h.point.y.toFixed(2) : null; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      const t = hit(x, 40, z, down, 60); ys.push(t);
      if (t !== null && t > 0.15) { const u = hit(x, 0.3, z, up, 40); us.push(u); fs.push(hit(x, Math.min(u ?? 2.1, 2.1) - 0.05, z, down, 30)); } else { us.push(null); fs.push(null); }
    }
    return { X0, Z0, S, W, H, ys, us, fs };
  }, [m, size]);
  fs.writeFileSync(`${OUT}/${m}-${size}-${Q}.json`, JSON.stringify(res));
  console.log(m, size, Q, 'ok');
}
await b.close();
