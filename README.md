# Takraw ISO 3D

A 1v1 sepak takraw game in a temple courtyard at dusk, in the browser — three.js, no build step, peer-to-peer multiplayer (PeerJS / WebRTC).

- **Play:** https://takraw.netlify.app (dev preview: https://dev--takraw.netlify.app)
- **Run locally:** `python3 -m http.server 5173` then open http://localhost:5173
- **Deploy (free draft):** `netlify deploy --dir . --alias dev` · production: `netlify deploy --prod --dir .` (costs Netlify credits)

## Files
- `index.html` — page, HUD, How-to-play overlay (generated diagrams)
- `main.js` — scene, court, players, input, timing meter, aiming, spin meter, match rules, networking
- `physics.js` — pure ball physics + shot solvers (no three.js; testable in Node)
- `sfx.js` — synthesized sound effects (Web Audio)
- `style.css` — UI styles
- `assets/temple/` — CC0 paving + roof-tile textures from Poly Haven (see `assets/CREDITS.md`); the rest of the temple courtyard and the dusk sky are built in code
- `tools/gen_howto.py` — regenerates the How-to-play diagrams (then paste into `index.html`)
- `tools/physics.test.mjs` — `node tools/physics.test.mjs` sanity-checks the shot solvers

## Controls
WASD move · Space jump · J set / dig (tap on green) · K kick / spike (tap on green) · L block at the net · arrows move your aim dot · H help · M landing marker · N sound



## Rules & attacks
- First to 7 points wins. Max 3 touches per side; a block never counts as a touch.
- When the opponent jumps into a spike / smash, a red mark shows where it will land. Stand in it and a dig meter appears — only GREEN digs it (the ball pops straight up like a set); anything else is their point.
- At the net, jump and press L right as their attack crosses over you: perfect = stuffed straight back down (very hard to return), good = deflected and still playable, otherwise it gets past you.
- A J on your third touch is an emergency save that goes over the net — it can never cause a fourth touch.
