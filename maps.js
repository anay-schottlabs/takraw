// Map list for the picker. Every map plays at both court sizes (1v1 / 2v2 on the normal court, 3v3 on the bigger one)
// and in DAY or NIGHT. `swatch` is the little colour chip on the map card.
export const MAPS = [
  { id: 'temple', name: 'Temple Courtyard', blurb: 'Ordination halls, galleries, chedis and lantern festoons', swatch: ['#8a1e17', '#dba54c'] },
  { id: 'pond', name: 'Lotus Pond', blurb: 'A teak deck in a lotus pond — koi, bridges, salas', swatch: ['#1f5a5c', '#ff8fb8'] },
  { id: 'terrace', name: 'Hill Tribe Terrace', blurb: 'Rice terraces, a stilt village and misty mountains', swatch: ['#86a63c', '#f2c12e'] },
];
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
