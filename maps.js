// Map list for the picker. Every map plays at both court sizes (1v1 / 2v2 on the normal court, 3v3 on the bigger one)
// and in DAY or NIGHT. `swatch` is the little colour chip on the map card.
export const MAPS = [
  { id: 'temple', name: 'Temple Courtyard', blurb: 'Ordination halls, galleries, chedis and lantern festoons', swatch: ['#8a1e17', '#dba54c'] },
  { id: 'pond', name: 'Lotus Pond', blurb: 'A teak deck in a lotus pond — koi, bridges, salas', swatch: ['#1f5a5c', '#ff8fb8'] },
  { id: 'riverside', name: 'Riverside Pier', blurb: 'A teak pier on a busy river — long-tail boats, shophouses, bridges', swatch: ['#2f4a3c', '#e2a400'] },
  { id: 'rooftop', name: 'Bangkok Rooftop', blurb: 'A court on top of a tower — skyline, neon, a golden prang far off', swatch: ['#2a3a5a', '#3fe0ff'] },
  { id: 'market', name: 'Night Market Alley', blurb: 'A market street — stalls, grills, neon signs and tuk-tuks', swatch: ['#3a1a2a', '#ff3fa0'] },
  { id: 'beach', name: 'Karst Beach', blurb: 'A sand court on an Andaman beach — karst towers, long-tails, fire dancers at night', swatch: ['#1f7f8f', '#ead6a2'] },
  { id: 'jungle', name: 'Jungle Waterfall', blurb: 'A rainforest clearing by a tiered waterfall — hornbills, vines, fireflies', swatch: ['#2f5a26', '#bfe8f0'] },
  { id: 'bamboo', name: 'Bamboo Forest', blurb: 'A clearing in a towering bamboo grove — light shafts, lanterns, a shrine', swatch: ['#8fa83f', '#ffd27a'] },
  { id: 'terrace', name: 'Hill Tribe Terrace', blurb: 'Rice terraces, a stilt village and misty mountains', swatch: ['#86a63c', '#f2c12e'] },
];
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
