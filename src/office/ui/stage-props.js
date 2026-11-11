// What the café adds to a stage, drawn in the stage's pixels: each session's holographic workstation, the coffee cart
// with its barista, and the air (motes of light drifting up, rain when it rains, a soft vignette).

/** A workstation: a little projector on the floor and a screen of light beside the one who works there (blue and
 *  scrolling while they work, amber with a "!" while they wait for you, dim while they rest). x, y: the floor where its
 *  owner stands. */
export function drawStation(g, i, x, y, st, t, still) {
  const on = st === 'work' || st === 'wait', wait = st === 'wait';
  const c = wait ? [255, 176, 32] : on ? [96, 214, 255] : [170, 160, 220];
  const rgba = (a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const fl = still ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + i * 2);
  const sx = x + 9, sy = y - 46, sw = 24, sh = 15;
  g.save();
  const beam = g.createLinearGradient(0, y, 0, sy + sh);
  beam.addColorStop(0, rgba(on ? 0.35 : 0.12)); beam.addColorStop(1, rgba(0));
  g.fillStyle = beam; g.beginPath(); g.moveTo(sx + sw / 2 - 2, y - 1); g.lineTo(sx + sw / 2 + 2, y - 1); g.lineTo(sx + sw, sy + sh); g.lineTo(sx, sy + sh); g.fill();
  g.fillStyle = 'rgba(30,30,44,.9)'; g.fillRect(sx + sw / 2 - 4, y - 3, 8, 3); g.fillStyle = rgba(0.9); g.fillRect(sx + sw / 2 - 2, y - 3, 4, 1);
  g.shadowColor = rgba(0.9); g.shadowBlur = on ? 6 : 2;
  g.fillStyle = rgba((on ? 0.24 : 0.1) * fl); g.fillRect(sx, sy, sw, sh);
  g.shadowBlur = 0; g.strokeStyle = rgba(0.85 * fl); g.lineWidth = 0.6; g.strokeRect(sx + 0.3, sy + 0.3, sw - 0.6, sh - 0.6);
  g.fillStyle = rgba(0.95); g.fillRect(sx, sy, 5, 1); g.fillRect(sx + sw - 5, sy + sh - 1, 5, 1);
  if (on && !wait) {
    g.save(); g.beginPath(); g.rect(sx + 1, sy + 1, sw - 2, sh - 2); g.clip();
    for (let k = 0; k < 6; k++) { const ly = sy + 2 + ((k * 3 + (still ? 0 : t * 9)) % (sh - 2)), lw = 4 + ((k * 7 + i * 3) % 13); g.fillStyle = k % 3 ? 'rgba(220,245,255,.8)' : 'rgba(255,140,200,.85)'; g.fillRect(sx + 2 + (k % 2) * 2, ly, lw, 0.8); }
    g.restore();
  } else if (wait) {
    g.fillStyle = `rgba(255,225,150,${still ? 1 : 0.6 + 0.4 * Math.sin(t * 6)})`; g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', sx + sw / 2, sy + sh / 2 + 0.5);
  } else {
    g.fillStyle = rgba(0.6); g.font = '700 5px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z z', sx + sw / 2, sy + sh / 2);
  }
  g.restore();
}

/** The coffee cart: a striped awning, a sign, cups on the counter. x: its middle, y: the floor. */
export function drawCart(g, x, y) {
  g.save();
  g.fillStyle = 'rgba(10,6,20,.45)'; g.beginPath(); g.ellipse(x, y, 24, 3, 0, 0, Math.PI * 2); g.fill();
  const body = g.createLinearGradient(0, y - 24, 0, y);
  body.addColorStop(0, '#F4E3CF'); body.addColorStop(1, '#C9AA8E');
  g.fillStyle = body; g.fillRect(x - 20, y - 24, 40, 20);
  g.fillStyle = '#7A4E32'; g.fillRect(x - 21, y - 25, 42, 2);
  for (let k = 0; k < 3; k++) { g.fillStyle = ['#FFFFFF', '#FFCF8A', '#FFFFFF'][k]; g.fillRect(x - 15 + k * 6, y - 29, 4, 4); }
  g.fillStyle = '#2B2A2A'; g.fillRect(x + 6, y - 35, 10, 10); g.fillStyle = '#B9BEC6'; g.fillRect(x + 7, y - 34, 8, 3);
  g.fillStyle = '#5A3A26'; g.fillRect(x - 21, y - 52, 2, 27); g.fillRect(x + 19, y - 52, 2, 27);
  for (let k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#FFFFFF' : '#E5287F'; g.beginPath(); g.moveTo(x - 24 + k * 7, y - 52); g.lineTo(x - 17 + k * 7, y - 52); g.lineTo(x - 17 + k * 7, y - 46); g.lineTo(x - 20.5 + k * 7, y - 44); g.lineTo(x - 24 + k * 7, y - 46); g.fill(); }
  g.font = '700 6px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#7A4E32'; g.fillText('☕ CAFÉ', x, y - 14);
  g.fillStyle = '#3A2A2A'; g.beginPath(); g.arc(x - 14, y - 2, 3, 0, Math.PI * 2); g.arc(x + 14, y - 2, 3, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** The air over the stage (stage pixels; view: { x0, y0, x1, y1 } what the camera sees). */
const motes = Array.from({ length: 40 }, (_, i) => ({ x: ((i * 97) % 1000) / 1000, y: ((i * 53) % 1000) / 1000, r: 0.5 + ((i * 7) % 5) / 4, s: 0.3 + ((i * 13) % 7) / 10, p: i * 1.7 }));
export function drawAir(g, view, t, { rain = 0, still = false } = {}) {
  const w = view.x1 - view.x0, h = view.y1 - view.y0;
  if (!still) {
    g.save(); g.globalCompositeOperation = 'screen';
    for (const m of motes) {
      const x = view.x0 + (((m.x * w + Math.sin(t * 0.3 + m.p) * 10) % w) + w) % w, y = view.y1 - ((m.y * h + t * 6 * m.s) % h), a = 0.2 + 0.35 * Math.max(0, Math.sin(t * 1.3 + m.p));
      const gr = g.createRadialGradient(x, y, 0, x, y, m.r * 2.4); gr.addColorStop(0, `rgba(255,220,250,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - m.r * 3, y - m.r * 3, m.r * 6, m.r * 6);
    }
    g.restore();
  }
  if (rain > 0.15 && !still) {
    g.strokeStyle = 'rgba(200,215,255,.4)'; g.lineWidth = 0.6; g.beginPath();
    for (let i = 0; i < 110; i++) { const x = view.x0 + ((i * 37 + t * 60) % (w + 20)) - 10, y = view.y0 + ((i * 53 + t * 280) % (h + 20)) - 10; g.moveTo(x, y); g.lineTo(x - 2, y + 7); }
    g.stroke();
  }
}

/** A soft vignette over the whole picture (device pixels). */
export function drawVignette(g, W, H, night) {
  const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.42, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(8,4,24,.5)' : 'rgba(20,10,30,.3)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
