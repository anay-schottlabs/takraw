// Map list for the picker. Every map plays at both court sizes (1v1 / 2v2 on the normal court, 3v3 on the bigger one)
// and in DAY or NIGHT. `swatch` is the little colour chip on the map card; `ui` recolours the menus to match the scene
// (a = accent, b = second highlight, tint = the dark wash behind the panels). `ultra: true` = the map has Ultra-graphics detail
// (marked with a dot in the map list).
export const MAPS = [
  { id: 'temple', ultra: true, name: 'Temple Courtyard', blurb: 'Ordination halls, galleries, chedis and lantern festoons', swatch: ['#8a1e17', '#dba54c'], ui: { a: '#f0b04a', b: '#ff6a4a', tint: '#2a1410' } },
  { id: 'pond', ultra: true, name: 'Lotus Pond', blurb: 'A teak deck in a lotus pond — koi, bridges, salas', swatch: ['#1f5a5c', '#ff8fb8'], ui: { a: '#ff8fb8', b: '#5fd8c8', tint: '#0c2224' } },
  { id: 'riverside', ultra: true, name: 'Riverside Pier', blurb: 'A teak pier on a busy river — long-tail boats, shophouses, bridges', swatch: ['#2f4a3c', '#e2a400'], ui: { a: '#f2b83a', b: '#5fd0a0', tint: '#122218' } },
  { id: 'rooftop', name: 'Bangkok Rooftop', blurb: 'A court on top of a tower — skyline, neon, a golden prang far off', swatch: ['#2a3a5a', '#3fe0ff'], ui: { a: '#3fe0ff', b: '#ff5fb8', tint: '#0c1428' } },
  { id: 'paris', name: 'Paris Night', blurb: 'A court by the Seine — the Eiffel Tower, cafés, bateaux-mouches', swatch: ['#1c2a44', '#f2b84a'], ui: { a: '#f2b84a', b: '#8fb8ff', tint: '#10162a' } },
  { id: 'market', ultra: true, name: 'Night Market Alley', blurb: 'A market street — stalls, grills, neon signs and tuk-tuks', swatch: ['#3a1a2a', '#ff3fa0'], ui: { a: '#ff4fa8', b: '#ffc23a', tint: '#260e1c' } },
  { id: 'beach', ultra: true, name: 'Karst Beach', blurb: 'A sand court on an Andaman beach — karst towers, long-tails, fire dancers at night', swatch: ['#1f7f8f', '#ead6a2'], ui: { a: '#3fd0d8', b: '#f2d38a', tint: '#0a1f26' } },
  { id: 'jungle', ultra: true, name: 'Jungle Waterfall', blurb: 'A rainforest clearing by a tiered waterfall — hornbills, vines, fireflies', swatch: ['#2f5a26', '#bfe8f0'], ui: { a: '#7fe08a', b: '#bfeaf2', tint: '#0c1e0e' } },
  { id: 'bamboo', ultra: true, name: 'Bamboo Forest', blurb: 'A clearing in a towering bamboo grove — light shafts, lanterns, a shrine', swatch: ['#8fa83f', '#ffd27a'], ui: { a: '#c2dc5a', b: '#ffd27a', tint: '#141c0a' } },
  { id: 'festival', ultra: true, name: 'Lantern Festival', blurb: 'Yi Peng night — sky lanterns rising, khom lantern canopies, drums', swatch: ['#2a1a3a', '#ffa04a'], ui: { a: '#ffa04a', b: '#ffd86a', tint: '#20112a' } },
  { id: 'palace', ultra: true, name: 'Palace Garden', blurb: 'Gilded pavilions, reflecting pools, topiary and guardian giants', swatch: ['#1f4a6a', '#e8b85a'], ui: { a: '#f0c060', b: '#6fb8f0', tint: '#0c1a28' } },
  { id: 'monastery', ultra: true, name: 'Cloud Monastery', blurb: 'A summit monastery above a sea of clouds — golden chedi, naga stairs', swatch: ['#8aa0c0', '#f2f4f8'], ui: { a: '#9ec8ff', b: '#f2c84a', tint: '#121a2a' } },
  { id: 'terrace', ultra: true, name: 'Hill Tribe Terrace', blurb: 'Rice terraces, a stilt village and misty mountains', swatch: ['#86a63c', '#f2c12e'], ui: { a: '#f2c12e', b: '#ff9ab8', tint: '#18200c' } },
  { id: 'cruise', name: 'Cruise Deck', blurb: 'The top deck of a cruise ship at sea — glowing pools, a funnel, moonlit wake', swatch: ['#0f2a44', '#3fd8ff'], ui: { a: '#4fd8ff', b: '#ffcf7a', tint: '#0a1a2c' } },
];
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
