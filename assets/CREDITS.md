# Asset credits

All textures are CC0 (public domain) from Poly Haven — https://polyhaven.com
They were downsized and re-encoded (JPEG) to keep the download small.

- `temple/paving_*` — "Large Grey Tiles" by Rob Tuytel (diffuse + GL normal at 1k, AO/rough/metal packed map at 512px)
- `temple/roof_*` — "Roof Tiles" by Stephan Seeliger (512px; the diffuse is stored greyscale and tinted in-engine to glazed orange / green)

Lotus Pond (the 3v3 venue):
- `pond/planks_*` — "Brown Planks 03" (Poly Haven, CC0; 512px diffuse + GL normal) — the teak deck skirt, railing, bridges and salas
- `pond/grass_*` — "Aerial Grass Rock" (Poly Haven, CC0; 512px diffuse + GL normal) — the banks
- `pond/mud_diff.jpg` — "Brown Mud Leaves 01" (Poly Haven, CC0; 256px) — the pond bed and the bank's muddy lip
- `pond/water_nor.jpg` — `waternormals.jpg` from the three.js examples (MIT licence, © three.js authors), downsized to 512px — the ripples

Everything else in the courtyard (halls, galleries, chedis, trees, lanterns, the dusk sky) is generated in code in `main.js`; the pond venue's lotus, koi, salas, chedis, trees, candles and fireflies are generated in `pond.js`.

Riverside Pier, Bangkok Rooftop and Night Market Alley are generated in code (`riverside.js`, `rooftop.js`, `market.js`, shared pieces in `props.js`); they reuse the pond's plank + water textures. Karst Beach, Jungle Waterfall and Bamboo Forest (`beach.js`, `jungle.js`, `bamboo.js`) are generated in code too. Lantern Festival, Palace Garden and Cloud Monastery (`festival.js`, `palace.js`, `monastery.js`) are generated in code (the palace reuses the temple roof tiles).

Temple Courtyard — ULTRA graphics (`temple-ultra.js`, loaded only when Graphics is set to Ultra):
- `temple-ultra/clay_plaster_*` — "Clay Plaster" (Poly Haven, CC0; 1k diffuse + GL normal) — wall / column / chedi plaster detail (used as greyscale detail, triplanar)
- `temple-ultra/bark_brown_02_*` — "Bark Brown 02" (Poly Haven, CC0; 512px diffuse + GL normal) — frangipani bark
- `temple-ultra/leafy_grass_*` — "Leafy Grass" (Poly Haven, CC0; 512px diffuse + GL normal) — the grounds outside the courtyard walls
Everything else in Ultra (columns, chedis, naga rails, viharns, the great golden chedis, trees, palms, mountains, particles) is generated in code.

Hill Tribe Terrace — ULTRA graphics (`terrace-ultra.js`): generated in code; reuses `temple-ultra/leafy_grass_diff.jpg` as ground detail.

Cloud Monastery — ULTRA graphics (`monastery-ultra.js`, loaded only when Graphics is set to Ultra):
- `monastery-ultra/floor_*` — "Monastery Stone Floor" (Poly Haven, CC0; 1k diffuse + GL normal) — the summit terrace's flagstones
- `monastery-ultra/wall_diff.jpg` — "Japanese Stone Wall" (Poly Haven, CC0; 512px, stored greyscale) — retaining walls, parapets, stairs, podium (triplanar detail + bump)
- `monastery-ultra/cliff_diff.jpg` — "Cliff Side" (Poly Haven, CC0; 1k, stored greyscale) — the summit cliffs and the distant peaks (triplanar detail + bump)
Everything else in Ultra (the cloud sea, peaks, pines, chedis, viharns, naga, monks, lanterns, mist) is generated in code.

Palace Garden — ULTRA graphics (`palace-ultra.js`):
- `palace-ultra/marble_*` — "Marble 01" (Poly Haven, CC0; 1k diffuse stored greyscale + 1k GL normal) — the polished marble terrace and, as triplanar detail, the marble podiums, posts and chedi bases
- reuses `temple-ultra/clay_plaster_diff.jpg` (plaster detail), `temple-ultra/leafy_grass_*` (lawns, topiary + hedge leaf detail), `temple/roof_*` (glazed roof tiles) and `pond/water_nor.jpg` (pool ripples)
Everything else (pavilions, salas, yaksha guardians, topiary, chedis, prangs, the wall, trees, skyline, guards, particles) is generated in code.
Riverside Pier — ULTRA graphics (`riverside-ultra.js`):
- `riverside-ultra/rough_wood_*` — "Rough Wood" by Rob Tuytel (Poly Haven, CC0; 1k diffuse, 512px GL normal) — the pier's planks, piles, beams and bollards (tinted teak in-engine)
Everything else in Riverside Ultra (the bending river and its mirror-reflecting water + wakes, banks, shophouses, prang, golden chedi, riverside wat, bridges, skyline, boats, hyacinth, mist, egrets) is generated in code; it reuses `pond/water_nor.jpg`, `temple/paving_*`, `temple/roof_diff.jpg` and `temple-ultra/clay_plaster_diff.jpg`.

Karst Beach — ULTRA graphics (`beach-ultra.js`, the golden-hour sunset bay):
- `beach-ultra/coast_sand_*` — "Coast Sand 01" (Poly Haven, CC0; 512px diffuse + GL normal) — sand detail + ripples
- `beach-ultra/rock_face_*` — "Rock Face 03" (Poly Haven, CC0; 512px diffuse + GL normal) — karst limestone and beach rock detail
The sunset sky, sea, karst towers, palms, boats, huts, jungle and birds are generated in code; the sea reuses `pond/water_nor.jpg`.

Night Market Alley — ULTRA graphics (`market-ultra.js`, `market-atlas.js`, `market-crowd.js`):
- `market-ultra/asphalt_*` — "Asphalt 02" (Poly Haven, CC0; 1k diffuse + GL normal, 512px roughness) — the wet street (the puddle mask reuses `temple-ultra/clay_plaster_diff.jpg` as noise)
Everything else (shophouses, alleys, stalls, food, signs, neon, lanterns, wires, the crowd, cats, scooters, steam / smoke / embers) is generated in code; windows, shop interiors, signs, menus, price cards and fabric prints are painted onto canvas atlases in `market-atlas.js`.
