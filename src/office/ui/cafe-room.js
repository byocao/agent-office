// The café's scene: one of the game's painted backgrounds (the café, the office, the street… each in the light of the
// time of day), the people's holographic workstations floating in front of it, and the air: light shafts by day,
// drifting motes of light, rain when it rains, a colour grade and a vignette. The painting is drawn at the screen's own
// resolution (it is anime art, not pixels); everything else is in the art's units (one unit = one pixel of the
// characters), with the café's transform already set on the context.

/* ---------- the painting, drawn once per size and picture ---------- */
export function drawStill(g, L, env) {
  const { img, cw, ch } = env;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (img) {
    // cover the canvas, anchored a little below the middle (the floor of a painting is near its bottom)
    const k = Math.max(cw / img.naturalWidth, ch / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, (cw - w) / 2, (ch - h) * 0.7, w, h);
  } else { g.fillStyle = '#2A2238'; g.fillRect(0, 0, cw, ch); }
  // the floor the people walk on: a soft shade so they stand on something
  const fl = g.createLinearGradient(0, ch * 0.66, 0, ch);
  fl.addColorStop(0, 'rgba(10,6,20,0)'); fl.addColorStop(1, 'rgba(10,6,20,.42)');
  g.fillStyle = fl; g.fillRect(0, ch * 0.66, cw, ch * 0.34);
  g.restore();
}

/* ---------- the air: what moves over the painting ---------- */
const motes = Array.from({ length: 46 }, (_, i) => ({ x: (i * 97) % 1000 / 1000, y: (i * 53) % 1000 / 1000, r: 0.6 + ((i * 7) % 5) / 3, s: 0.3 + ((i * 13) % 7) / 10, p: i * 1.7 }));
export function drawLive(g, L, env) {
  const { w, h, t, night, still } = env;
  // light shafts slanting in from the top left by day, a cooler sheen by night
  g.save(); g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 4; i++) {
    const x = w * (0.08 + i * 0.17) + Math.sin(t * 0.2 + i) * 6, a = (night ? 0.035 : 0.075) * (0.7 + 0.3 * Math.sin(t * 0.5 + i * 2));
    const gr = g.createLinearGradient(x, 0, x + h * 0.5, h);
    gr.addColorStop(0, night ? `rgba(150,170,255,${a})` : `rgba(255,236,190,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 22, 0); g.lineTo(x + 22 + h * 0.5, h); g.lineTo(x + h * 0.5 - 14, h); g.fill();
  }
  // motes of light drifting up, twinkling
  if (!still) for (const m of motes) {
    const x = ((m.x * w + Math.sin(t * 0.3 + m.p) * 10) % w + w) % w, y = h - ((m.y * h + t * 6 * m.s) % h), a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 1.3 + m.p));
    const gr = g.createRadialGradient(x, y, 0, x, y, m.r * 2.4); gr.addColorStop(0, night ? `rgba(255,200,240,${a})` : `rgba(255,250,220,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - m.r * 3, y - m.r * 3, m.r * 6, m.r * 6);
  }
  g.restore();
  // rain, slanting, over everything
  if (env.rain > 0.15 && !still) {
    g.strokeStyle = 'rgba(200,215,255,.35)'; g.lineWidth = 0.6; g.beginPath();
    for (let i = 0; i < 90; i++) { const x = (i * 37 + t * 60) % (w + 20) - 10, y = (i * 53 + t * 260) % (h + 20) - 10; g.moveTo(x, y); g.lineTo(x - 2, y + 7); }
    g.stroke();
  }
}

/* ---------- a workstation: a holographic screen that floats in front of whoever works there ---------- */
export function drawDesk(g, L, i, x, y, st, t, still) {
  const on = st === 'work' || st === 'wait', wait = st === 'wait';
  const c = wait ? [255, 176, 32] : on ? [96, 214, 255] : [170, 160, 220];
  const rgba = (a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const fl = still ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + i * 2);
  const sx = x + 2, sy = y - 44, sw = 26, sh = 16;
  g.save();
  // the beam from the little projector on the floor up to the screen
  const beam = g.createLinearGradient(0, y, 0, sy + sh);
  beam.addColorStop(0, rgba(on ? 0.35 : 0.12)); beam.addColorStop(1, rgba(0));
  g.fillStyle = beam; g.beginPath(); g.moveTo(sx + sw / 2 - 2, y - 1); g.lineTo(sx + sw / 2 + 2, y - 1); g.lineTo(sx + sw, sy + sh); g.lineTo(sx, sy + sh); g.fill();
  g.fillStyle = rgba(0.9); g.fillRect(sx + sw / 2 - 3, y - 2, 6, 2);
  // the screen: a glowing pane with a frame, lines of code scrolling by while they work
  g.shadowColor = rgba(0.9); g.shadowBlur = on ? 6 : 2;
  g.fillStyle = rgba((on ? 0.22 : 0.1) * fl); g.fillRect(sx, sy, sw, sh);
  g.shadowBlur = 0; g.strokeStyle = rgba(0.85 * fl); g.lineWidth = 0.6; g.strokeRect(sx + 0.3, sy + 0.3, sw - 0.6, sh - 0.6);
  g.fillStyle = rgba(0.9); g.fillRect(sx, sy, 5, 1); g.fillRect(sx + sw - 5, sy + sh - 1, 5, 1);
  if (on && !wait) {
    g.save(); g.beginPath(); g.rect(sx + 1, sy + 1, sw - 2, sh - 2); g.clip();
    for (let k = 0; k < 6; k++) { const ly = sy + 2 + ((k * 3 + (still ? 0 : t * 9)) % (sh - 2)), lw = 4 + ((k * 7 + i * 3) % 14); g.fillStyle = k % 3 ? 'rgba(220,245,255,.75)' : 'rgba(255,140,200,.8)'; g.fillRect(sx + 2 + (k % 2) * 2, ly, lw, 0.8); }
    g.restore();
  } else if (wait) {
    g.fillStyle = `rgba(255,220,140,${still ? 1 : 0.6 + 0.4 * Math.sin(t * 6)})`; g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', sx + sw / 2, sy + sh / 2 + 0.5);
  } else {
    g.fillStyle = rgba(0.6); g.font = '700 5px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z z', sx + sw / 2, sy + sh / 2);
  }
  // a keyboard of light under their hands
  g.fillStyle = rgba(on ? 0.3 : 0.12); g.fillRect(sx + 3, y - 24, 18, 3);
  g.restore();
  return on;
}

/* ---------- the coffee cart the barista keeps ---------- */
export function drawCounter(g, L, t, still) {
  const x = L.counter, y = L.back;
  g.save();
  g.fillStyle = 'rgba(30,18,30,.55)'; g.beginPath(); g.ellipse(x + 14, y, 26, 3, 0, 0, Math.PI * 2); g.fill();
  const body = g.createLinearGradient(0, y - 26, 0, y);
  body.addColorStop(0, '#F4E3CF'); body.addColorStop(1, '#D9BFA6');
  g.fillStyle = body; g.fillRect(x - 6, y - 26, 40, 22);
  g.fillStyle = '#E5287F'; g.fillRect(x - 8, y - 30, 44, 5);
  g.fillStyle = '#FFFFFF'; for (let k = 0; k < 44; k += 8) g.fillRect(x - 8 + k, y - 30, 4, 5);   // the striped awning
  g.fillStyle = '#6B4630'; g.fillRect(x - 6, y - 5, 40, 2);
  g.fillStyle = '#3A2A2A'; g.beginPath(); g.arc(x, y - 2, 3, 0, Math.PI * 2); g.arc(x + 28, y - 2, 3, 0, Math.PI * 2); g.fill();
  g.font = '700 6px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#6B4630'; g.fillText('☕ CAFÉ', x + 14, y - 15);
  g.restore();
  if (!still && Math.random() < 0.05) env0.steam?.(x + 6, y - 32);
}
const env0 = {};
/** Hooks the scene uses (the cart's steam goes into the café's particles). */
export function roomHooks(h) { Object.assign(env0, h); }

/* ---------- the grade over everything ---------- */
export function drawLight(g, L, env) {
  const { w, h, night } = env;
  g.save(); g.globalCompositeOperation = 'screen';
  for (const s of env.screens) { const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 30); gr.addColorStop(0, s.wait ? 'rgba(255,176,32,.25)' : 'rgba(96,214,255,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(s.x - 30, s.y - 30, 60, 60); }
  g.restore();
  // a soft vignette, warmer by day, deeper at night
  const vg = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.4, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(8,4,24,.55)' : 'rgba(60,24,40,.28)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}
