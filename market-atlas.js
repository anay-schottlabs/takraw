// NIGHT MARKET ALLEY — ULTRA: the painted texture atlases (all canvas, no downloads).
//  • ATLAS (2048², 8×8 cells of 256 px): shophouse window bays, shop interiors, shop signs, menu lightboxes, price cards,
//    roller shutters, AC fronts, a drinks fridge, tarp stripes, clothing prints, apartment bays. A matching GLOW canvas holds
//    what lights up at night (windows, shop interiors, lit signs, lightboxes, the fridge).
//  • NEON (1024²): glowing tube words and icons on dark backings.
import * as THREE from 'three';
import { rng } from './temple-ultra.js';

const THAI = '"Thonburi", "Leelawadee UI", "Tahoma", "Noto Sans Thai", sans-serif';
const LAT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
export const CELL = 256, N = 8;

// uv rectangle [u0, v0, u1, v1] of cell (c, r) (r counted from the canvas top), optionally a sub-rect in cell pixels
export function cellUV(c, r, sub = null, inset = 2) {
  const [sx, sy, sw, sh] = sub || [0, 0, CELL, CELL];
  const x0 = c * CELL + sx + inset, x1 = c * CELL + sx + sw - inset, y0 = r * CELL + sy + inset, y1 = r * CELL + sy + sh - inset;
  const S = CELL * N;
  return [x0 / S, 1 - y1 / S, x1 / S, 1 - y0 / S];
}

export function makeAtlas(seed = 5) {
  const R = rng(seed);
  const S = CELL * N;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const gv = document.createElement('canvas'); gv.width = gv.height = S;
  const g = cv.getContext('2d'), e = gv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const at = (c, r) => [c * CELL, r * CELL];
  const copyGlow = (x, y, w, h, k = 1) => { e.globalAlpha = k; e.drawImage(cv, x, y, w, h, x, y, w, h); e.globalAlpha = 1; };
  const stains = (x, y, w, h, n = 40, a = 0.07) => {
    for (let i = 0; i < n; i++) {
      const sx = x + R() * w, sy = y + R() * h, sw = 2 + R() * 26, sh = 4 + R() * 60;
      const gr = g.createLinearGradient(0, sy, 0, sy + sh);
      gr.addColorStop(0, `rgba(40,34,28,${(R() * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(40,34,28,0)');
      g.fillStyle = gr; g.fillRect(sx, sy, sw, sh);
    }
  };
  const plaster = (x, y, w, h, col = '#ece6da') => {
    g.fillStyle = col; g.fillRect(x, y, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '60,50,40'},${(R() * 0.05).toFixed(3)})`; g.fillRect(x + R() * w, y + R() * h, 1 + R() * 3, 1 + R() * 3); }
    stains(x, y, w, h);
    const gr = g.createLinearGradient(0, y + h * 0.75, 0, y + h);   // grime at the foot of each storey
    gr.addColorStop(0, 'rgba(50,40,30,0)'); gr.addColorStop(1, 'rgba(50,40,30,0.18)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const interior = (x, y, w, h, warm) => {           // a lit room seen through a window (map + glow)
    const base = warm ? pick(['#ffcf86', '#ffd9a0', '#f8c070', '#ffe2b8']) : pick(['#cfe6ff', '#e6f2ff', '#9fc8ff']);
    for (const c of [g, e]) {
      const gr = c.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, base); gr.addColorStop(1, warm ? '#a8683a' : '#5a7090');
      c.fillStyle = gr; c.fillRect(x, y, w, h);
      // furniture silhouettes: a shelf, a lamp, a fan, someone's back
      c.fillStyle = 'rgba(30,20,16,0.55)';
      if (R() < 0.6) c.fillRect(x + R() * w * 0.6, y + h * 0.55, w * 0.3, h * 0.45);
      if (R() < 0.4) { c.beginPath(); c.arc(x + w * (0.3 + R() * 0.4), y + h * 0.35, h * 0.12, 0, Math.PI * 2); c.fill(); }
      if (R() < 0.3) c.fillRect(x + w * 0.1, y + h * 0.15, w * 0.15, h * 0.25);
    }
  };

  /* ---- rows 0–1: shophouse window bays (cell = one 4.2 m bay × one 3.2 m storey). 14 variants + plain wall + white ---- */
  // kind of each bay, for the 3D builder: lit (0/1) so it can hang a lantern / curtain glow; first cells lit.
  const bays = [];
  for (let i = 0; i < 14; i++) {
    const c = i % 8, r = Math.floor(i / 8), [x, y] = at(c, r);
    plaster(x, y, CELL, CELL, pick(['#ece6da', '#f2ebe0', '#e6e0d6', '#efe8dc']));
    const lit = i < 9 ? 1 : 0, warm = i % 4 !== 3;
    const type = i % 5;                     // 0 sliding alu, 1 wooden shutters, 2 grille, 3 two small windows, 4 breeze-block + window
    const wx = x + 62, wy = y + 52, ww = 132, wh = 132;
    const glass = (gx, gy, gw, gh) => {
      if (lit) interior(gx, gy, gw, gh, warm);
      else { const gr = g.createLinearGradient(gx, gy, gx + gw, gy + gh); gr.addColorStop(0, '#2c3646'); gr.addColorStop(1, '#141a24'); g.fillStyle = gr; g.fillRect(gx, gy, gw, gh); g.fillStyle = 'rgba(160,190,230,0.12)'; g.beginPath(); g.moveTo(gx, gy + gh * 0.7); g.lineTo(gx + gw * 0.5, gy); g.lineTo(gx + gw * 0.75, gy); g.lineTo(gx, gy + gh); g.fill(); }
    };
    // recess shadow
    g.fillStyle = 'rgba(30,26,22,0.45)'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    if (type === 3) {
      for (const k of [0, 1]) { const gx = wx + k * 72, gw = 60; glass(gx, wy + 10, gw, wh - 20); g.strokeStyle = '#d8d8d4'; g.lineWidth = 5; g.strokeRect(gx, wy + 10, gw, wh - 20); g.beginPath(); g.moveTo(gx + gw / 2, wy + 10); g.lineTo(gx + gw / 2, wy + wh - 10); g.stroke(); e.fillStyle = '#000'; e.fillRect(gx + gw / 2 - 3, wy + 10, 6, wh - 20); }
    } else {
      glass(wx, wy, ww, wh);
      if (lit && R() < 0.75) {               // curtains (drawn on both: lit curtains glow tinted)
        const cc = pick(['#c84a4a', '#3a6ab8', '#e8c060', '#6aa86a', '#d88ab8', '#f0f0e8']);
        const cw = ww * (0.25 + R() * 0.2);
        for (const c of [g, e]) { c.fillStyle = cc; c.globalAlpha = c === e ? 0.55 : 1; c.fillRect(wx, wy, cw, wh); c.fillRect(wx + ww - cw * (0.4 + R() * 0.6), wy, cw, wh); c.globalAlpha = 1; }
      }
      g.strokeStyle = type === 1 ? '#5a3a24' : '#cfd2d4'; g.lineWidth = 6; g.strokeRect(wx, wy, ww, wh);
      g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh * 0.3); g.lineTo(wx + ww, wy + wh * 0.3); g.stroke();
      e.fillStyle = '#000'; e.fillRect(wx + ww / 2 - 3, wy, 6, wh); e.fillRect(wx, wy + wh * 0.3 - 3, ww, 6);
      if (type === 1) {                      // open louvred shutters either side
        const sc = pick(['#2f6a52', '#3a5f8a', '#6a4a2a', '#4a7a8a']);
        for (const sx of [wx - 44, wx + ww + 4]) { g.fillStyle = sc; g.fillRect(sx, wy, 40, wh); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 16; k++) g.fillRect(sx + 3, wy + 4 + k * 8, 34, 3); }
      }
      if (type === 2) {                      // white security grille
        for (const c of [g, e]) { c.strokeStyle = c === g ? '#e8e8e4' : '#000'; c.lineWidth = 3; for (let k = 1; k < 8; k++) { c.beginPath(); c.moveTo(wx + k * ww / 8, wy); c.lineTo(wx + k * ww / 8, wy + wh); c.stroke(); } for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(wx + ww / 2, wy + wh * (0.2 + k * 0.22), 14, 0, Math.PI * 2); c.stroke(); } }
      }
    }
    if (type === 4) {                        // ventilation breeze blocks beside the window
      for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) { g.fillStyle = '#c8c0b0'; g.fillRect(x + 8 + j * 22, y + 60 + k * 22, 20, 20); g.fillStyle = '#4a4038'; g.beginPath(); g.arc(x + 18 + j * 22, y + 70 + k * 22, 6, 0, Math.PI * 2); g.fill(); }
    }
    // sill + stains running down from it
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx - 10, wy + wh + 8, ww + 20, 6);
    for (let k = 0; k < 5; k++) { const gr = g.createLinearGradient(0, wy + wh + 10, 0, y + CELL); gr.addColorStop(0, 'rgba(40,34,28,0.22)'); gr.addColorStop(1, 'rgba(40,34,28,0)'); g.fillStyle = gr; g.fillRect(wx + R() * ww, wy + wh + 10, 4 + R() * 8, CELL - wh - 60); }
    bays.push({ uv: cellUV(c, r), lit, warm });
  }
  // plain wall (alley sides, building bodies) and pure white (painted props that share the atlas material)
  { const [x, y] = at(6, 1); plaster(x, y, CELL, CELL, '#e8e2d6'); }
  { const [x, y] = at(7, 1); g.fillStyle = '#fff'; g.fillRect(x, y, CELL, CELL); }

  /* ---- row 2: shop interiors (back wall of an open shophouse front, 4.2 × 2.8 m) ---- */
  const shopKinds = ['grocery', 'gold', 'pharmacy', 'phone', 'noodle', 'clothes', 'mart', 'massage'];
  shopKinds.forEach((kind, c) => {
    const [x, y] = at(c, 2);
    const wall = { grocery: '#e8dcc0', gold: '#a8241c', pharmacy: '#f4f6f2', phone: '#f0f4f8', noodle: '#d8e8e0', clothes: '#e8d8e8', mart: '#f6f6f6', massage: '#b87a4a' }[kind];
    g.fillStyle = wall; g.fillRect(x, y, CELL, CELL);
    if (kind === 'noodle') { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (let k = 0; k < 16; k++) { g.beginPath(); g.moveTo(x + k * 16, y); g.lineTo(x + k * 16, y + CELL); g.stroke(); g.beginPath(); g.moveTo(x, y + k * 16); g.lineTo(x + CELL, y + k * 16); g.stroke(); } }
    const shelves = kind === 'massage' || kind === 'noodle' ? 0 : 4;
    for (let s = 0; s < shelves; s++) {
      const sy = y + 50 + s * 46;
      g.fillStyle = kind === 'gold' ? '#3a0c08' : '#8a8a86'; g.fillRect(x + 6, sy + 38, CELL - 12, 5);
      for (let px = x + 10; px < x + CELL - 14;) {
        const w = kind === 'gold' ? 10 : 6 + R() * 14, h = kind === 'gold' ? 8 + R() * 10 : 14 + R() * 22;
        g.fillStyle = kind === 'gold' ? pick(['#ffd860', '#f0c040', '#ffe890']) : kind === 'pharmacy' ? pick(['#ffffff', '#5ab0e0', '#e05050', '#60c080']) : kind === 'phone' ? pick(['#202428', '#e8e8ec', '#4080d0', '#d04060']) : kind === 'clothes' ? pick(['#c84a6a', '#4a6ac8', '#e8d0a0', '#2a2a2a', '#6ac8a8']) : pick(['#e84a3a', '#f0c030', '#3a8ad8', '#5ac05a', '#f08a2a', '#ffffff', '#a04ab0']);
        g.fillRect(px, sy + 38 - h, w, h);
        px += w + 1 + R() * 3;
      }
    }
    if (kind === 'pharmacy') { g.fillStyle = '#20a050'; g.fillRect(x + 108, y + 8, 40, 12); g.fillRect(x + 122, y - 6 + 8, 12, 40); }
    if (kind === 'noodle') { g.fillStyle = '#c03020'; g.fillRect(x + 20, y + 30, 216, 70); g.fillStyle = '#fff'; g.font = `700 34px ${THAI}`; g.textAlign = 'center'; g.fillText('ก๋วยเตี๋ยว', x + 128, y + 78); g.fillStyle = '#5a3a2a'; g.fillRect(x + 10, y + 180, 236, 76); }
    if (kind === 'massage') { g.fillStyle = '#6a3a20'; for (let k = 0; k < 3; k++) g.fillRect(x + 20 + k * 80, y + 60, 56, 196); g.fillStyle = '#e8c890'; g.fillRect(x + 30, y + 20, 196, 26); }
    // counter at the bottom
    g.fillStyle = kind === 'gold' ? '#d8b048' : 'rgba(80,70,60,0.85)'; g.fillRect(x, y + 222, CELL, 34);
    copyGlow(x, y, CELL, CELL, kind === 'massage' ? 0.45 : 0.75);
  });

  /* ---- row 3: shop / stall sign boards (4 per cell, 256 × 64 each) — 32 signs ---- */
  const signTexts = ['ร้านทอง', 'ก๋วยเตี๋ยว', 'ข้าวมันไก่', 'ร้านยา', 'MOBILE', 'ร้านกาแฟ', 'นวดแผนไทย', 'ผ้าไหม', 'รองเท้า', 'ข้าวต้ม', 'ส้มตำ', 'หมูกระทะ',
    'ชาไทย', 'ผลไม้สด', 'ตัดผม', 'MINI MART', 'ผัดไทย', 'โรตี', 'หมูปิ้ง', 'ไก่ย่าง', 'น้ำปั่น', 'ข้าวเหนียวมะม่วง', 'ลูกชิ้น', 'SEAFOOD',
    'เสื้อผ้า', 'กระเป๋า', 'ร้านเหล้า', 'ซ่อมมือถือ', 'ขนมไทย', 'ข้าวผัด', 'ปาท่องโก๋', 'ICE'];
  const signCols = [['#c0221a', '#fff'], ['#1f5fa8', '#fff'], ['#f0c020', '#2a1a10'], ['#1f7a4a', '#fff'], ['#ffffff', '#c0221a'], ['#2a2a2a', '#ffd040'], ['#e8641a', '#fff'], ['#7a2a8a', '#fff']];
  const signs = [];
  signTexts.forEach((t, i) => {
    const c = Math.floor(i / 4), sub = i % 4, [x0, y0] = at(c, 3), y = y0 + sub * 64;
    const [bg, fg] = signCols[i % signCols.length];
    g.fillStyle = bg; g.fillRect(x0, y, CELL, 64);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0, y, CELL, 6);
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x0 + 5, y + 5, CELL - 10, 54); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const thai = /[฀-๿]/.test(t);
    g.font = `800 ${t.length > 9 ? 26 : 36}px ${thai ? THAI : LAT}`;
    g.fillText(t, x0 + CELL / 2, y + 34, CELL - 24);
    const lit = i % 3 !== 2;
    if (lit) copyGlow(x0, y, CELL, 64, 0.9);
    signs.push({ uv: cellUV(c, 3, [0, sub * 64, CELL, 64]), lit });
  });

  /* ---- row 4: menu lightboxes (c0–3), price cards (c4), roller shutter (c5), AC front (c6), drinks fridge (c7) ---- */
  const menus = [];
  const foods = [['#e8a040', '#fff4d0'], ['#c84020', '#f0e0c0'], ['#f0d060', '#80a040'], ['#a05030', '#f8f0e0'], ['#e0c080', '#40a040'], ['#f08060', '#ffffff']];
  const menuTitles = ['ก๋วยเตี๋ยว', 'อาหารตามสั่ง', 'หมูปิ้ง', 'ขนมหวาน'];
  for (let c = 0; c < 4; c++) {
    const [x, y] = at(c, 4);
    g.fillStyle = '#fbf8f0'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = ['#c0221a', '#1f5fa8', '#e8641a', '#d8407a'][c]; g.fillRect(x, y, CELL, 52);
    g.fillStyle = '#fff'; g.font = `800 32px ${THAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(menuTitles[c], x + 128, y + 28, 236);
    for (let k = 0; k < 6; k++) {
      const px = x + 10 + (k % 3) * 82, py = y + 62 + Math.floor(k / 3) * 96;
      const [a, b] = foods[(k + c) % foods.length];
      g.fillStyle = '#3a2a24'; g.fillRect(px, py, 74, 60);
      g.fillStyle = b; g.beginPath(); g.ellipse(px + 37, py + 32, 30, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = a; g.beginPath(); g.ellipse(px + 37, py + 30, 20, 13, 0, 0, Math.PI * 2); g.fill();
      for (let j = 0; j < 5; j++) { g.fillStyle = pick(['#40a040', '#e04020', '#f0e0a0', '#80502a']); g.fillRect(px + 20 + R() * 34, py + 22 + R() * 16, 5, 4); }
      g.fillStyle = '#c0221a'; g.font = `800 20px ${LAT}`; g.fillText(`${(4 + Math.floor(R() * 8)) * 10}.-`, px + 37, py + 76);
    }
    copyGlow(x, y, CELL, CELL, 0.55);
    menus.push(cellUV(c, 4));
  }
  const prices = [];
  {
    const [x0, y0] = at(4, 4);
    const pt = ['฿20', '฿35', '3/100', '฿50', '฿10', '฿40', '2/50', '฿99'];
    for (let k = 0; k < 8; k++) {
      const x = x0 + (k % 4) * 64, y = y0 + Math.floor(k / 4) * 128;
      g.fillStyle = '#f8f4e8'; g.fillRect(x, y, 64, 128);
      g.fillStyle = pick(['#ff3a8a', '#ffe030', '#5aff6a', '#ff8a2a']);
      g.beginPath(); for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2, r = j % 2 ? 22 : 30; g.lineTo(x + 32 + Math.cos(a) * r, y + 44 + Math.sin(a) * r); } g.fill();
      g.fillStyle = '#c0101a'; g.font = `800 ${pt[k].length > 3 ? 17 : 21}px ${LAT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pt[k], x + 32, y + 45);
      g.fillStyle = '#1a1a1a'; g.font = `600 15px ${THAI}`; g.fillText(pick(['ถูก', 'สด', 'อร่อย', 'ลด']), x + 32, y + 98);
      prices.push(cellUV(4, 4, [(k % 4) * 64, Math.floor(k / 4) * 128, 64, 128]));
    }
  }
  {
    const [x, y] = at(5, 4);                  // roller shutter
    g.fillStyle = '#8a8e92'; g.fillRect(x, y, CELL, CELL);
    for (let k = 0; k < 40; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, y + k * 6.4, CELL, 3); }
    stains(x, y, CELL, CELL, 30, 0.15);
    g.strokeStyle = pick(['#d83a8a', '#3a8ad8', '#e8c020']); g.lineWidth = 7; g.beginPath(); g.moveTo(x + 40, y + 160); g.bezierCurveTo(x + 80, y + 90, x + 130, y + 200, x + 200, y + 130); g.stroke();   // a tag of graffiti
  }
  {
    const [x, y] = at(6, 4);                  // AC unit front
    g.fillStyle = '#e4e4de'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = '#3a3c3e'; g.beginPath(); g.arc(x + 150, y + 128, 92, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a8aaa8'; g.lineWidth = 4; for (let k = 1; k < 7; k++) { g.beginPath(); g.arc(x + 150, y + 128, k * 13, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 9; k++) g.fillRect(x + 14, y + 40 + k * 20, 26, 6);
    stains(x, y, CELL, CELL, 20, 0.2);
  }
  {
    const [x, y] = at(7, 4);                  // drinks fridge front (lit)
    g.fillStyle = '#c8202a'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = '#e8f4ff'; g.fillRect(x + 16, y + 30, CELL - 32, CELL - 46);
    for (let s = 0; s < 4; s++) for (let k = 0; k < 11; k++) { g.fillStyle = pick(['#e83a2a', '#30a040', '#f0d020', '#2a6ad8', '#f08a2a', '#ffffff', '#7a3a2a']); g.fillRect(x + 24 + k * 19, y + 50 + s * 50, 13, 38); }
    g.fillStyle = '#fff'; g.font = `800 22px ${LAT}`; g.textAlign = 'center'; g.fillText('COLD DRINKS', x + 128, y + 18);
    copyGlow(x, y, CELL, CELL, 0.7);
  }

  /* ---- row 5: fabrics — tarp stripes (c0–4), umbrella panel (c5), clothing prints (c6, c7: 4 each) ---- */
  const tarps = [];
  [['#1f5fa8', '#e8eef4'], ['#c0221a', '#f4ece4'], ['#1f7a4a', '#f0f0e4'], ['#2a62b8', null], ['#e8901a', '#f6e8c8']].forEach(([a, b], c) => {
    const [x, y] = at(c, 5);
    if (b) for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? a : b; g.fillRect(x + k * 32, y, 32, CELL); }
    else { g.fillStyle = a; g.fillRect(x, y, CELL, CELL); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(x, y + R() * CELL); g.lineTo(x + CELL, y + R() * CELL); g.stroke(); } }
    for (let k = 0; k < 6; k++) { const gr = g.createLinearGradient(x, y + k * 43, x, y + k * 43 + 43); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)'); g.fillStyle = gr; g.fillRect(x, y + k * 43, CELL, 43); }   // creases
    stains(x, y, CELL, CELL, 14, 0.12);
    tarps.push(cellUV(c, 5));
  });
  {
    const [x, y] = at(5, 5); g.fillStyle = '#fff'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let k = 0; k < 8; k++) g.fillRect(x, y + k * 32, CELL, 2);
  }
  const prints = [];
  const printCell = (c, sub, fn) => { const [x0, y0] = at(c, 5); const x = x0 + (sub % 2) * 128, y = y0 + Math.floor(sub / 2) * 128; fn(x, y); prints.push(cellUV(c, 5, [(sub % 2) * 128, Math.floor(sub / 2) * 128, 128, 128])); };
  printCell(6, 0, (x, y) => { g.fillStyle = '#c83a4a'; g.fillRect(x, y, 128, 128); for (let k = 0; k < 30; k++) { g.fillStyle = pick(['#ffd0e0', '#ffe080', '#ffffff']); g.beginPath(); g.arc(x + R() * 128, y + R() * 128, 4 + R() * 5, 0, 7); g.fill(); } });
  printCell(6, 1, (x, y) => { g.fillStyle = '#2a4a8a'; g.fillRect(x, y, 128, 128); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 0; k < 8; k++) { g.fillRect(x + k * 16, y, 5, 128); g.fillRect(x, y + k * 16, 128, 5); } });
  printCell(6, 2, (x, y) => { g.fillStyle = '#f2f2ee'; g.fillRect(x, y, 128, 128); g.fillStyle = pick(['#d82a2a', '#2a5ad8']); g.font = `800 30px ${LAT}`; g.textAlign = 'center'; g.fillText('THAI', x + 64, y + 60); g.fillText('LAND', x + 64, y + 92); });
  printCell(6, 3, (x, y) => { const gr = g.createRadialGradient(x + 64, y + 64, 4, x + 64, y + 64, 90); gr.addColorStop(0, '#ffe040'); gr.addColorStop(0.35, '#ff40a0'); gr.addColorStop(0.7, '#40a0ff'); gr.addColorStop(1, '#40e080'); g.fillStyle = gr; g.fillRect(x, y, 128, 128); });
  printCell(7, 0, (x, y) => { g.fillStyle = '#3a2a6a'; g.fillRect(x, y, 128, 128); g.strokeStyle = '#f0c060'; g.lineWidth = 2; for (let k = 0; k < 5; k++) for (let j = 0; j < 5; j++) { g.beginPath(); g.ellipse(x + 12 + k * 26, y + 12 + j * 26, 9, 6, 0.4, 0, 7); g.stroke(); } });   // elephant pants
  printCell(7, 1, (x, y) => { g.fillStyle = '#8a5a2a'; g.fillRect(x, y, 128, 128); for (let k = 0; k < 40; k++) { g.fillStyle = pick(['#f0d8a0', '#3a2414', '#c88a4a']); g.fillRect(x + R() * 128, y + R() * 128, 6 + R() * 14, 3); } });
  printCell(7, 2, (x, y) => { g.fillStyle = '#1e1e22'; g.fillRect(x, y, 128, 128); g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(x + 64, y + 66, 22, 0, 7); g.fill(); });
  printCell(7, 3, (x, y) => { g.fillStyle = '#f2d020'; g.fillRect(x, y, 128, 128); g.fillStyle = '#1a3a8a'; g.fillRect(x, y + 50, 128, 14); g.fillRect(x + 56, y, 16, 128); });

  /* ---- rows 6–7: apartment bays for the tall back blocks (one window + painted AC / laundry / rail) ---- */
  const apts = [];
  for (let i = 0; i < 16; i++) {
    const c = i % 8, r = 6 + Math.floor(i / 8), [x, y] = at(c, r);
    plaster(x, y, CELL, CELL, pick(['#d8d4cc', '#cfd6d8', '#e0d4c4', '#c8ccc4', '#d8c8b8']));
    const lit = i % 16 < 9;
    const wx = x + 40 + (i % 3) * 20, wy = y + 54, ww = 120, wh = 120;
    g.fillStyle = 'rgba(30,26,22,0.4)'; g.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
    if (lit) interior(wx, wy, ww, wh, i % 5 !== 2); else { g.fillStyle = '#1c222c'; g.fillRect(wx, wy, ww, wh); }
    g.strokeStyle = '#b8bcbe'; g.lineWidth = 5; g.strokeRect(wx, wy, ww, wh); g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke();
    e.fillStyle = '#000'; e.fillRect(wx + ww / 2 - 3, wy, 6, wh);
    // balcony rail across the bottom, laundry, AC box
    g.fillStyle = 'rgba(60,60,60,0.85)'; g.fillRect(x + 6, y + 186, CELL - 12, 5); for (let k = 0; k < 24; k++) g.fillRect(x + 8 + k * 10, y + 186, 2, 52);
    e.fillStyle = '#000'; e.fillRect(x + 6, y + 186, CELL - 12, 5);
    if (R() < 0.6) for (let k = 0; k < 5; k++) { const cl = pick(['#e84a4a', '#4a8ae8', '#f0f0f0', '#f0c040', '#40b080']); g.fillStyle = cl; g.fillRect(wx + k * 24, y + 150, 18, 30 + R() * 16); e.fillStyle = '#000'; e.fillRect(wx + k * 24, y + 150, 18, 46); }
    if (R() < 0.6) { const ax = R() < 0.5 ? x + 176 : x + 6; g.fillStyle = '#e8e8e2'; g.fillRect(ax, y + 110, 70, 48); g.fillStyle = '#5a5c5e'; g.beginPath(); g.arc(ax + 44, y + 134, 18, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + CELL - 8, CELL, 8);
    apts.push({ uv: cellUV(c, r), lit });
  }

  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return {
    map: mk(cv, true), glow: mk(gv, true),
    bays, plain: cellUV(6, 1), white: cellUV(7, 1, [96, 96, 64, 64]), shops: shopKinds.map((_, c) => cellUV(c, 2)), signs, menus, prices,
    shutter: cellUV(5, 4), ac: cellUV(6, 4), fridge: cellUV(7, 4), tarps, umbrella: cellUV(5, 5), prints, apts,
  };
}

/* ---- neon words + icons (1024²): 12 words (512 × 128) and 4 icons (256 × 256) ---- */
export function makeNeon() {
  const S = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#0b080c'; g.fillRect(0, 0, S, S);
  const words = [['NOODLES', '#ff3fa0'], ['ส้มตำ', '#3fe0ff'], ['MASSAGE', '#c77dff'], ['KARAOKE', '#ff6a3f'], ['BBQ', '#ffd23f'], ['ข้าวมันไก่', '#7cff6a'],
    ['OPEN 24', '#ff3f5a'], ['โรตี', '#ffb03f'], ['THAI TEA', '#3fffc8'], ['SATAY', '#ff7a3f'], ['BAR', '#3f8aff'], ['ผัดไทย', '#ff3fa0']];
  const uv = (x, y, w, h) => [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S];
  const out = { words: [], icons: [] };
  words.forEach(([t, col], i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 128;
    g.save(); g.beginPath(); g.rect(x, y, 512, 128); g.clip();
    g.fillStyle = '#0b080c'; g.fillRect(x, y, 512, 128);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${/[฀-๿]/.test(t) ? 74 : 86}px ${/[฀-๿]/.test(t) ? THAI : LAT}`;
    g.shadowColor = col; g.shadowBlur = 26; g.strokeStyle = col; g.lineWidth = 9; g.strokeText(t, x + 256, y + 68, 470);
    g.shadowBlur = 8; g.lineWidth = 4; g.strokeStyle = '#fff'; g.globalAlpha = 0.85; g.strokeText(t, x + 256, y + 68, 470); g.globalAlpha = 1;
    g.restore();
    out.words.push({ uv: uv(x + 4, y + 4, 504, 120), col: new THREE.Color(col), aspect: 504 / 120 });
  });
  const icon = (i, col, draw) => {
    const x = i * 256, y = 768;
    g.save(); g.beginPath(); g.rect(x, y, 256, 256); g.clip();
    g.shadowColor = col; g.shadowBlur = 24; g.strokeStyle = col; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    draw(x, y); g.shadowBlur = 6; g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.globalAlpha = 0.8; draw(x, y); g.globalAlpha = 1;
    g.restore();
    out.icons.push({ uv: uv(x + 4, y + 4, 248, 248), col: new THREE.Color(col) });
  };
  icon(0, '#ffb03f', (x, y) => { g.beginPath(); g.arc(x + 128, y + 130, 80, 0, Math.PI); g.closePath(); g.stroke(); for (const d of [-30, 0, 30]) { g.beginPath(); g.moveTo(x + 128 + d, y + 110); g.bezierCurveTo(x + 110 + d, y + 80, x + 150 + d, y + 60, x + 128 + d, y + 30); g.stroke(); } });   // steaming bowl
  icon(1, '#ff3f3f', (x, y) => { g.beginPath(); g.moveTo(x + 60, y + 70); g.bezierCurveTo(x + 40, y + 160, x + 120, y + 230, x + 200, y + 200); g.bezierCurveTo(x + 140, y + 170, x + 110, y + 120, x + 100, y + 70); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(x + 80, y + 70); g.lineTo(x + 70, y + 30); g.stroke(); });   // chili
  icon(2, '#ffd23f', (x, y) => { g.strokeRect(x + 70, y + 60, 90, 150); g.beginPath(); g.arc(x + 160, y + 135, 34, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.moveTo(x + 70, y + 90); g.lineTo(x + 160, y + 90); g.stroke(); });   // beer mug
  icon(3, '#3fe0ff', (x, y) => { g.beginPath(); g.moveTo(x + 40, y + 128); g.lineTo(x + 180, y + 128); g.moveTo(x + 140, y + 80); g.lineTo(x + 190, y + 128); g.lineTo(x + 140, y + 176); g.stroke(); });   // arrow
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  out.tex = t;
  return out;
}
