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

## Maps
Pick a map (and **Day** or **Night**) on the menu or in your room — the menu backdrop previews it, guests play the host's choice, and open games list it. Every map works for 1v1, 2v2 and 3v3 (3v3 gets a larger version).
- **Temple Courtyard** — ordination halls, galleries, chedis, lantern festoons
- **Lotus Pond** — a teak deck in a lotus pond: koi, bridges to two salas, candle boats and fireflies at night
- **Hill Tribe Terrace** — rice terraces, a stilt village, sunflowers, misty mountains and a golden chedi
- **Riverside Pier** — a teak pier on a busy river: long-tail boats, floating-market canoes, shophouses, bridges
- **Bangkok Rooftop** — a court on top of a tower: the skyline, a golden prang far off, neon and blinking beacons at night
- **Night Market Alley** — a market street: stalls, grills, noodle steam, neon, tuk-tuks under a neon gateway
- **Karst Beach** — a sand court on an Andaman beach: karst towers out at sea, long-tails, tiki torches + fire dancers at night
- **Jungle Waterfall** — a rainforest clearing by twin waterfalls: giant trees, vines, hornbills by day, fireflies + glowing mushrooms at night
- **Bamboo Forest** — a clearing in a towering, swaying grove: light shafts by day, paper lanterns + moonbeams at night
- **Lantern Festival** — Yi Peng: tents, bunting, drums, khom lantern canopies; hundreds of sky lanterns rising at night, kites by day
- **Palace Garden** — gilded multi-tiered pavilions, guardian giants, reflecting pools + fountains, topiary, golden chedis (inspired by the style, not a replica)
- **Cloud Monastery** — a summit terrace above a sea of clouds: a great golden chedi, naga-serpent stairs, rows of prayer bells

## Modes
- **Create / Join** — online rooms (peer-to-peer): **1v1, 2v2 or 3v3** (spots can be friends, CPUs, or left empty — e.g. 2v2 with an empty spot plays 2 vs 1) — 3v3 plays a bigger version of the court. The host picks the format; empty spots can be friends or CPUs ("+ CPU", or Start fills them). Teams share 3 touches; the serve rotates through teammates. If someone drops mid-match a CPU takes their spot. Open games are listed on the menu with format and fill (e.g. `2v2 · 2/4`).
- **Vs CPU** — create a 1v1 room and pick a CPU (Easy / Normal / Hard / Unbeatable) instead of waiting for a friend. It reads the ball, controls, sets, spikes, digs, blocks and serves.
- **Practice** — ball machine (F) and serving practice (J).
