# Takraw ISO 3D

A 1v1 sepak takraw game in the browser — three.js, no build step, peer-to-peer multiplayer (PeerJS / WebRTC).

- **Play:** https://takraw.netlify.app (dev preview: https://dev--takraw.netlify.app)
- **Run locally:** `python3 -m http.server 5173` then open http://localhost:5173
- **Deploy (free draft):** `netlify deploy --dir . --alias dev` · production: `netlify deploy --prod --dir .` (costs Netlify credits)

## Files
- `index.html` — page, HUD, How-to-play overlay (generated diagrams)
- `main.js` — scene, court, players, input, timing meter, aiming, spin meter, match rules, networking
- `physics.js` — pure ball physics + shot solvers (no three.js; testable in Node)
- `sfx.js` — synthesized sound effects (Web Audio)
- `style.css` — UI styles
- `assets/` — CC0 assets from Poly Haven (see `assets/CREDITS.md`)
- `tools/gen_howto.py` — regenerates the How-to-play diagrams (then paste into `index.html`)
- `tools/physics.test.mjs` — `node tools/physics.test.mjs` sanity-checks the shot solvers

## Controls
WASD move · Shift dash · Space jump · J set (tap on green) · K kick / spike (tap on green) · arrows move your aim dot · H help · M landing marker · N sound
