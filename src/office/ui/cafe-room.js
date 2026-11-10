// The café's room, in the art's own pixels (one unit = one pixel of the characters): the wall and its window, the
// shelves, the door, the floor, the desks, the counter and the lounge, and the light over all of it (sun through the
// window by day; lamps, string lights and the neon sign after dark). What never moves is drawn once into a picture of
// its own and only drawn again when the room changes (its size, day or night, the view out of the window).
// Every function takes the canvas context with the art-pixel transform already set, and L, the room's layout.

const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const PAL = {
  day: { wall: '#F0E2CC', wall2: '#E6D4BA', dot: '#D9C4A6', beam: '#7A5236', beam2: '#5E3E28', wain: '#8E5E3E', wain2: '#7A4E32', wainHi: '#A87452',
    floor: '#B27C52', floor2: '#9C6A44', floorHi: '#C48E62', frame: '#6B4630', frameHi: '#8A5E40', curtain: '#E78FA8', curtain2: '#CF7290', sky: '#9CC8EE' },
  night: { wall: '#3B2E45', wall2: '#33283D', dot: '#2C2236', beam: '#2A1E22', beam2: '#1E151A', wain: '#45302C', wain2: '#3A2824', wainHi: '#5A3E36',
    floor: '#4E3628', floor2: '#432E22', floorHi: '#5C4030', frame: '#4A3022', frameHi: '#5E3E2C', curtain: '#8E4A66', curtain2: '#743C54', sky: '#1B2440' },
};
const BULBS = ['#FFD36E', '#FF7AB6', '#7AD3FF', '#9CF29A', '#FFB36E'];

/* ---------- the still part, drawn once ---------- */
function curtain(g, x, y, w, h, P, flip) {
  for (let i = 0; i < w; i += 3) R(g, x + i, y, 3, h - (flip ? i : w - i) * 0.15, (i / 3) % 2 ? P.curtain : P.curtain2);
  R(g, x - 1, y + h * 0.58, w + 2, 3, '#F3D27A');   // the tie-back
}
function books(g, x, y, w) {
  const C = ['#C2577A', '#3F7CC4', '#E8742A', '#2A9D8F', '#C9A227', '#8C4FA8', '#6A8042'];
  for (let i = 0, cx = x; cx < x + w - 3; i++) { const bw = 3 + (i * 7) % 3, bh = 9 + (i * 5) % 5; R(g, cx, y - bh, bw, bh, C[i % C.length]); R(g, cx, y - bh + 2, bw, 1, 'rgba(255,255,255,.25)'); cx += bw + ((i % 4) === 3 ? 3 : 0); }
}
function plantPot(g, x, y, big) {
  const s = big ? 1.6 : 1;
  R(g, x - 4 * s, y - 7 * s, 8 * s, 7 * s, '#B5653A'); R(g, x - 5 * s, y - 8 * s, 10 * s, 2 * s, '#C8794A');
  for (let k = -2; k <= 2; k++) R(g, x + k * 2.2 * s - 1, y - (14 + (2 - Math.abs(k)) * 4) * s, 3 * s, (8 + (2 - Math.abs(k)) * 3) * s, k % 2 ? '#4E8C4A' : '#5FA85A');
}
export function drawStill(g, L, env) {
  const { w, h, night } = env, P = night ? PAL.night : PAL.day;
  // the wall: patterned paper over wooden panelling
  R(g, 0, 0, w, L.floor, P.wall);
  for (let y = 14; y < L.wain; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < w; x += 10) { R(g, x, y, 2, 2, P.dot); R(g, x + 1, y - 1, 1, 1, P.wall2); }
  R(g, 0, L.wain, w, L.floor - L.wain, P.wain); R(g, 0, L.wain, w, 3, P.wainHi); R(g, 0, L.wain + 3, w, 1, P.wain2);
  for (let x = 6; x < w - 20; x += 30) { R(g, x, L.wain + 8, 24, L.floor - L.wain - 13, P.wain2); R(g, x + 1, L.wain + 9, 22, L.floor - L.wain - 15, P.wain); }
  R(g, 0, 0, w, 7, P.beam); R(g, 0, 7, w, 2, P.beam2); R(g, 0, 9, w, 2, P.wainHi);
  // the window: the view (pixelated to the room's pixels), curtains each side, a sill with plants
  const x0 = L.win0, y0 = L.winTop, ww = L.win1 - L.win0, wh = L.winBot - L.winTop;
  R(g, x0 - 5, y0 - 5, ww + 10, wh + 10, P.frame); R(g, x0 - 5, y0 - 5, ww + 10, 2, P.frameHi);
  if (env.pic) g.drawImage(env.pic, x0, y0, ww, wh); else R(g, x0, y0, ww, wh, P.sky);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(x0 + ww * 0.08, y0); g.lineTo(x0 + ww * 0.2, y0); g.lineTo(x0 + ww * 0.06, y0 + wh); g.lineTo(x0, y0 + wh); g.lineTo(x0, y0 + wh * 0.5); g.fill();   // (a glint on the glass)
  for (let x = x0 + 56; x < x0 + ww - 12; x += 56) R(g, x - 1, y0, 3, wh, P.frame);
  R(g, x0, y0 + Math.round(wh * 0.6), ww, 3, P.frame);
  R(g, x0 - 9, y0 + wh + 4, ww + 18, 4, P.frameHi); R(g, x0 - 9, y0 + wh + 8, ww + 18, 2, P.frame);
  for (let x = x0 + 18; x < x0 + ww - 10; x += 64) plantPot(g, x, y0 + wh + 4, false);
  curtain(g, x0 - 16, y0 - 8, 14, wh + 16, P, false); curtain(g, x0 + ww + 3, y0 - 8, 14, wh + 16, P, true);
  for (let x = x0 - 18; x < x0 + ww + 18; x += 6) { R(g, x, y0 - 10, 6, 4, P.curtain2); R(g, x + 1, y0 - 6, 4, 2, P.curtain); }   // the valance
  // shelves between the window and the counter: books, jars, a framed photo
  const s0 = L.win1 + 22, s1 = L.counter - 12;
  if (s1 - s0 > 34) {
    for (const [i, sy] of [[0, y0 + 26], [1, y0 + 56]]) {
      R(g, s0, sy, s1 - s0, 3, P.frameHi); R(g, s0 + 3, sy + 3, 2, 4, P.frame); R(g, s1 - 5, sy + 3, 2, 4, P.frame);
      if (i === 0) { books(g, s0 + 2, sy, (s1 - s0) * 0.55); plantPot(g, s1 - 8, sy, false); }
      else { for (let k = 0; k < 3; k++) { R(g, s0 + 4 + k * 9, sy - 9, 7, 9, ['#F2E6C8', '#D9EAF2', '#F7D2DC'][k]); R(g, s0 + 4 + k * 9, sy - 10, 7, 2, '#8A5E40'); } R(g, s1 - 20, sy - 14, 14, 14, P.frame); R(g, s1 - 18, sy - 12, 10, 10, night ? '#6B5A8A' : '#A9D4E8'); R(g, s1 - 16, sy - 6, 6, 4, '#5FA85A'); }
    }
  }
  // the menu board over the counter
  const cx = L.counter, cw = L.counterW;
  R(g, cx - 4, y0 + 2, cw + 8, 36, '#4A3022'); R(g, cx - 2, y0 + 4, cw + 4, 32, '#1F3A2E');
  g.fillStyle = '#F6E6C4'; g.font = '700 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CLAUDE CAFÉ', cx + cw / 2, y0 + 11);
  g.font = '5px monospace'; g.fillStyle = '#C9E8D2'; g.fillText('LATTE · TOKENS · BUGS', cx + cw / 2, y0 + 20); g.fillText('GIT PUSH ☕ 25K', cx + cw / 2, y0 + 28);
  R(g, cx + 6, y0 + 33, cw - 12, 1, 'rgba(201,232,210,.35)');
  // the back shelf: syrups and jars behind the counter
  R(g, cx, L.back - 52, cw, 2, P.frameHi);
  for (let k = 0; k * 7 < cw - 6; k++) R(g, cx + 3 + k * 7, L.back - 61 + (k % 2), 4, 9 - (k % 2), ['#C2577A', '#E8B04A', '#7AB8FF', '#6A8042', '#D9EAF2'][k % 5]);
  // the door: wood, glass, the bell; a mat and a big plant beside it
  const d = L.door;
  R(g, d - 16, L.floor - 68, 32, 68, P.frame); R(g, d - 13, L.floor - 65, 26, 65, '#7C5236'); R(g, d - 10, L.floor - 60, 20, 28, night ? '#F3C76A' : '#BFE3F5');
  R(g, d - 10, L.floor - 47, 20, 1, P.frame); R(g, d - 1, L.floor - 60, 1, 28, P.frame); R(g, d + 7, L.floor - 28, 3, 3, '#F3D27A'); R(g, d - 2, L.floor - 70, 4, 3, '#E0B04A');
  R(g, d - 14, L.front - 3, 28, 3, '#6E4A6A');
  plantPot(g, d + 28, L.floor + 2, true);
  // the floor: boards, darker at the back, a runner under the desks
  const fy = L.floor;
  R(g, 0, fy, w, h - fy, P.floor);
  for (let y = fy + 3, i = 0; y < h; y += 6, i++) { R(g, 0, y, w, 1, P.floor2); for (let x = (i % 3) * 17; x < w; x += 52) R(g, x, y - 5, 1, 5, P.floor2); R(g, 0, y + 1, w, 1, P.floorHi); }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, fy, w, 4);
  R(g, 0, fy - 3, w, 3, P.beam);
  R(g, L.win0 - 4, L.back + 1, L.win1 - L.win0 + 8, 5, night ? '#3F2E4A' : '#C98FA0'); R(g, L.win0 - 2, L.back + 2, L.win1 - L.win0 + 4, 1, night ? '#56406A' : '#E3B0BF');
  // the lounge: a rug, the sofa, a side table, the bookcase in the corner
  const sx = L.sofa;
  R(g, sx - 40, L.front - 4, 80, 6, night ? '#3A4A6A' : '#7FA7C9'); for (let k = sx - 36; k < sx + 36; k += 8) R(g, k, L.front - 3, 4, 4, night ? '#4E6088' : '#A9C7E0');
  R(g, sx - 28, L.front - 24, 56, 12, '#C2577A'); R(g, sx - 30, L.front - 34, 8, 24, '#A8466A'); R(g, sx + 22, L.front - 34, 8, 24, '#A8466A'); R(g, sx - 26, L.front - 37, 52, 14, '#D16A8E');
  R(g, sx - 26, L.front - 37, 52, 2, '#E384A6'); R(g, sx - 1, L.front - 35, 2, 11, '#B85A7E'); R(g, sx - 26, L.front - 12, 3, 12, '#4A2E22'); R(g, sx + 23, L.front - 12, 3, 12, '#4A2E22');
  R(g, sx - 50, L.front - 16, 16, 3, P.frameHi); R(g, sx - 46, L.front - 13, 2, 13, P.frame); R(g, sx - 39, L.front - 13, 2, 13, P.frame); R(g, sx - 45, L.front - 21, 4, 5, '#F2F2F2');
  const bx = w - 26;
  if (bx > sx + 32) { R(g, bx, L.floor - 74, 24, 74, P.frame); for (let k = 0; k < 4; k++) { R(g, bx + 2, L.floor - 72 + k * 18, 20, 16, P.wain2); books(g, bx + 3, L.floor - 57 + k * 18, 18); } }
}

/* ---------- what moves, every frame ---------- */
export function drawLive(g, L, env) {
  const { w, t, night } = env;
  // rain running down the glass
  if (env.rain > 0.15 && !env.still) {
    g.fillStyle = 'rgba(210,225,255,.45)';
    const x0 = L.win0, ww = L.win1 - L.win0, y0 = L.winTop, wh = L.winBot - L.winTop;
    for (let i = 0; i < 46; i++) g.fillRect(Math.round(x0 + ((i * 53 + t * 40) % ww)), Math.round(y0 + ((i * 37 + t * 230) % wh)), 1, 4);
  }
  // string lights along the beam, twinkling
  for (let x = 4, i = 0; x < w; x += 9, i++) {
    const sag = Math.sin(((x % 72) / 72) * Math.PI) * 6, y = 12 + sag, on = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7);
    R(g, x, y - 2, 1, 2, '#2B1D17');
    g.globalAlpha = night ? 0.6 + 0.4 * on : 0.85; R(g, x - 1, y, 3, 3, BULBS[i % BULBS.length]); g.globalAlpha = 1;
  }
  // the neon sign over the shelves, with a flicker now and then
  const nx = (L.win1 + L.counter) / 2, ny = L.winTop + 12, flick = Math.sin(t * 23) > 0.96 ? 0.35 : 1;
  if (L.counter - L.win1 > 50) {
    g.save(); g.font = 'italic 700 10px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#FF4FA3'; g.shadowBlur = night ? 8 : 3; g.fillStyle = `rgba(255,${night ? 150 : 110},${night ? 205 : 180},${flick})`;
    g.fillText('Claude Café', nx, ny); g.restore();
  }
  // the clock over the lounge
  const ck = { x: L.sofa, y: L.winTop + 16 }, d = env.now, ang = (k, n) => (k / n) * Math.PI * 2 - Math.PI / 2;
  g.fillStyle = '#F7F1E6'; g.beginPath(); g.arc(ck.x, ck.y, 10, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6B4630'; g.lineWidth = 2; g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = '#2B1D17'; g.beginPath(); g.moveTo(ck.x, ck.y); g.lineTo(ck.x + Math.cos(ang(d.getHours() % 12 + d.getMinutes() / 60, 12)) * 5, ck.y + Math.sin(ang(d.getHours() % 12 + d.getMinutes() / 60, 12)) * 5); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.moveTo(ck.x, ck.y); g.lineTo(ck.x + Math.cos(ang(d.getMinutes(), 60)) * 8, ck.y + Math.sin(ang(d.getMinutes(), 60)) * 8); g.stroke();
  // pendant lamps
  for (const lx of L.lamps) { R(g, lx, 11, 1, 14, '#2B1D17'); g.fillStyle = '#2B2A2A'; g.beginPath(); g.moveTo(lx - 6, 31); g.lineTo(lx + 7, 31); g.lineTo(lx + 3, 24); g.lineTo(lx - 2, 24); g.fill(); R(g, lx - 3, 31, 7, 2, '#FFE7A8'); }
  // a hanging plant, swaying
  const hx = L.win1 + 12, sway = Math.sin(t * 0.9) * 1.5;
  R(g, hx, 11, 1, 22, '#C9A27A'); R(g, hx - 5 + sway, 33, 11, 7, '#E8E2D6');
  for (let k = 0; k < 4; k++) R(g, hx - 6 + k * 4 + sway * (1 + k * 0.2), 38, 2, 8 + ((k * 5) % 7), k % 2 ? '#4E8C4A' : '#5FA85A');
  // the cat asleep on the sofa: its tail swishes, a "z" drifts up now and then
  const cx = L.sofa + 8, cy = L.front - 26, tail = Math.sin(t * 1.6) > 0.6 ? -1 : 0;
  R(g, cx - 6, cy - 4, 12, 5, '#E8954A'); R(g, cx + 4, cy - 6, 5, 5, '#E8954A'); R(g, cx + 4, cy - 8, 1, 2, '#E8954A'); R(g, cx + 8, cy - 8, 1, 2, '#E8954A');
  R(g, cx - 4, cy - 3, 2, 1, '#C47538'); R(g, cx, cy - 3, 2, 1, '#C47538'); R(g, cx + 5, cy - 4, 1, 1, '#4A2E22'); R(g, cx + 7, cy - 4, 1, 1, '#4A2E22');
  R(g, cx - 10, cy - 2 + tail, 5, 2, '#E8954A');
  if (!env.still && (t % 5) < 2.4) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 5px monospace'; g.fillText('z', cx + 10 + (t % 5) * 2, cy - 10 - (t % 5) * 4); }
}

/* ---------- a desk, the counter (drawn among the people, in order of depth) ---------- */
export function drawDesk(g, L, i, x, y, st, t, still) {
  const on = st === 'work' || st === 'wait';
  R(g, x - 23, y - 21, 36, 4, '#9C6A48'); R(g, x - 23, y - 21, 36, 1, '#B98260'); R(g, x - 21, y - 17, 32, 17, '#6B4630'); R(g, x - 19, y - 15, 28, 1, '#7C5236'); R(g, x - 19, y - 8, 28, 1, '#7C5236');
  R(g, x - 5, y - 32, 15, 11, '#2B2A2A');   // the laptop's lid, its screen towards its owner
  R(g, x - 4, y - 31, 13, 9, on ? (st === 'wait' ? (Math.sin(t * 6) > 0 ? '#FFB020' : '#7A5A10') : `rgba(110,200,255,${0.75 + 0.25 * Math.sin(t * 9 + i)})`) : '#3A4250');
  R(g, x - 7, y - 22, 19, 1, '#9AA4B2');
  if (on && !still && st === 'work') for (let k = 0; k < 3; k++) R(g, x - 3 + k * 4, y - 29 + ((t * 8 + k * 3 + i) % 6), 2, 1, '#E8F6FF');   // lines of code scrolling
  if (i % 3 === 0) { R(g, x + 13, y - 25, 4, 4, '#F2F2F2'); R(g, x + 17, y - 24, 1, 2, '#F2F2F2'); }   // a mug
  else if (i % 3 === 1) { R(g, x + 13, y - 26, 5, 5, '#B5653A'); R(g, x + 13, y - 31, 2, 5, '#5FA85A'); R(g, x + 16, y - 30, 2, 4, '#4E8C4A'); }   // a little plant
  else { R(g, x + 14, y - 33, 1, 12, '#3A3030'); R(g, x + 11, y - 35, 6, 3, '#E8B04A'); }   // a desk lamp
  return on;
}
export function drawCounter(g, L, t, still) {
  const x = L.counter, cw = L.counterW, y = L.back;
  R(g, x, y - 24, cw, 24, '#5A3A26'); for (let k = x + 3; k < x + cw - 3; k += 6) R(g, k, y - 20, 3, 17, '#6B4630');
  R(g, x - 3, y - 28, cw + 6, 5, '#E9E4DC'); R(g, x - 3, y - 28, cw + 6, 1, '#FFFFFF'); for (let k = x; k < x + cw; k += 13) R(g, k, y - 26, 5, 1, '#C9C2B8');   // marble top
  // the pastry case: three cakes and a tray of macarons
  R(g, x + 2, y - 40, 22, 12, 'rgba(210,235,255,.35)'); R(g, x + 2, y - 40, 22, 1, 'rgba(255,255,255,.6)');
  R(g, x + 4, y - 34, 5, 5, '#F7D2DC'); R(g, x + 4, y - 35, 5, 1, '#C2577A'); R(g, x + 11, y - 34, 5, 5, '#6B4630'); R(g, x + 11, y - 35, 5, 1, '#F2E6C8'); for (let k = 0; k < 3; k++) R(g, x + 18 + (k % 2), y - 33 + k * 1.5, 2, 1, ['#9CF29A', '#FFB0C8', '#FFD36E'][k]);
  // the espresso machine, the grinder, cups
  const m = x + cw - 26;
  R(g, m, y - 44, 16, 16, '#B9BEC6'); R(g, m, y - 44, 16, 2, '#DDE1E6'); R(g, m + 2, y - 40, 12, 4, '#2B2A2A'); R(g, m + 6, y - 35, 4, 3, '#3A3030'); R(g, m + 12, y - 42, 3, 3, '#F2F2F2');
  if (!still && Math.random() < 0.06) env0.steam?.(m + 8, y - 46);
  R(g, m + 18, y - 40, 5, 12, '#2B2A2A'); R(g, m + 18, y - 44, 5, 4, '#6B4630');
  for (let k = 0; k < 3; k++) R(g, x + 28 + k * 5, y - 32, 4, 4, ['#F2F2F2', '#FFCF8A', '#F2F2F2'][k]);
}
const env0 = {};
/** Hooks the room uses (the espresso machine's steam goes into the café's particles). */
export function roomHooks(h) { Object.assign(env0, h); }

/* ---------- the light over everything ---------- */
export function drawLight(g, L, env) {
  const { w, h, t, night } = env;
  if (night) {
    // the room dims (multiply), then the lamps, the bulbs, the screens and the sign glow through (screen)
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#B8ACD8'; g.fillRect(0, 0, w, h); g.restore();
    g.save(); g.globalCompositeOperation = 'screen';
    const glow = (x, y, r, c, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c.replace('A', a)); gr.addColorStop(1, c.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const lx of L.lamps) glow(lx, 34, 70, 'rgba(255,200,120,A)', 0.42);
    for (let x = 4, i = 0; x < w; x += 18, i++) glow(x, 13 + Math.sin(((x % 72) / 72) * Math.PI) * 6, 9, 'rgba(255,210,150,A)', 0.22 + 0.12 * Math.sin(t * 2.2 + i));
    for (const s of env.screens) glow(s.x, s.y, 22, s.wait ? 'rgba(255,176,32,A)' : 'rgba(110,200,255,A)', 0.3);
    if (L.counter - L.win1 > 50) glow((L.win1 + L.counter) / 2, L.winTop + 12, 40, 'rgba(255,80,170,A)', 0.35);
    glow(L.door, L.floor - 46, 30, 'rgba(255,200,110,A)', 0.25);
    g.restore();
  } else {
    // the sun through the window: soft beams across the floor, and dust turning in them
    g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(255,240,200,.16)';
    const x0 = L.win0, x1 = L.win1, yb = L.winBot, sh = (L.front - yb) * 0.55;
    for (let x = x0; x < x1; x += 56) { g.beginPath(); g.moveTo(x + 4, yb); g.lineTo(Math.min(x1, x + 52), yb); g.lineTo(Math.min(x1, x + 52) + sh, L.front); g.lineTo(x + 4 + sh, L.front); g.fill(); }
    if (!env.still) { g.fillStyle = 'rgba(255,250,230,.8)'; for (let i = 0; i < 26; i++) { const px = x0 + ((i * 47 + t * 3) % (x1 - x0 + sh)), py = yb + ((i * 29 + Math.sin(t * 0.5 + i) * 8 + t * 2) % (L.front - yb)); g.fillRect(Math.round(px), Math.round(py), 1, 1); } }
    g.restore();
  }
  // a soft vignette, to hold the eye in the middle
  const vg = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.45, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(6,2,14,.5)' : 'rgba(40,20,10,.22)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}
