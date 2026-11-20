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
