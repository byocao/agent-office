// The café's stage: one of the game's battle stages (scripts/vn_stage.py), drawn in its own pixels (32 to a unit,
// the characters' own) through a camera that drifts slowly, follows what is happening and shakes on a big moment. Each
// layer moves with the camera by its parallax rate, the way the game draws it; animated layers (neon signs, the claw
// machine, the church's lights) are a base picture and the patches that change. The floor and the platforms are where
// people can stand.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const ART = `${BASE}/assets/vn`;

export const stage = { data: null, id: '', ready: false };
export const cam = { x: 0, y: 0, k: 2, tx: 0, ty: 0, shake: 0, focus: null, ox: 0, oy: 0, W: 0, H: 0 };
const imgs = new Map();
function img(src) {
  let im = imgs.get(src);
  if (!im) { im = new Image(); im.src = src; imgs.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}

/** Loads a stage (its id in the manifest's stages); resolves once its pictures are in. */
export async function loadStage(art, id) {
  const path = art.stages?.[id]; if (!path) return false;
  const dir = `${ART}/${path.replace(/[^/]+$/, '')}`;
  const d = await (await fetch(`${ART}/${path}`)).json();
  d.dir = dir;
  const all = d.layers.flatMap((L) => [L.src, ...(L.frames || []).map((f) => f[0]?.src).filter(Boolean)]);
  await Promise.all(all.map((s) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = dir + s; imgs.set(dir + s, im); })));
  for (const L of d.layers) if (L.frames) L.total = L.frames.reduce((t, f) => t + f[1], 0);
  stage.data = d; stage.id = id; stage.ready = true;
  cam.x = cam.tx = d.ground ? (d.ground.x0 + d.ground.x1) / 2 : d.home[0];
  return true;
}

/** A thumbnail of a stage for the picker: its farthest layer. */
export function stageThumb(art, id) {
  const path = art.stages?.[id]; if (!path) return '';
  return `${ART}/${path.replace(/[^/]+$/, '')}01.png`;
}

/** Fits the camera to the canvas (device pixels): the floor and a little either side across, the floor low in the
 *  picture. Whole device pixels to a stage pixel when that is near enough, so the pixel art stays crisp. */
export function frameCamera(Wd, Hd, t, dt) {
  const d = stage.data; if (!d) return;
  const gw = d.ground ? d.ground.x1 - d.ground.x0 : d.w * 0.6;
  let k = Math.min(Wd / (gw + 36), Hd / 250);
  k = k >= 2 ? Math.floor(k) : k >= 1.25 ? Math.round(k * 2) / 2 : k;
  cam.k = k; cam.W = Wd; cam.H = Hd;
  const vw = Wd / k, vh = Hd / k, gy = d.ground ? d.ground.y : d.h * 0.75;
  // home: the floor's middle, the floor at 70% of the height; a slow drift; a pull towards whatever is in focus
  let tx = d.ground ? (d.ground.x0 + d.ground.x1) / 2 : d.home[0], ty = gy - vh * 0.24;
  if (cam.focus) { tx += (cam.focus.x - tx) * 0.35; ty += (cam.focus.y - 30 - ty) * 0.2; }
  tx += Math.sin(t * 0.06) * 14; ty += Math.sin(t * 0.045 + 1) * 4;
  // never past the stage's art
  const minX = Math.min(...d.layers.map((L) => L.x)), maxX = Math.max(...d.layers.map((L) => L.x + L.w));
  const minY = Math.min(...d.layers.map((L) => L.y)), maxY = Math.max(...d.layers.map((L) => L.y + L.h));
  tx = Math.max(minX + vw / 2, Math.min(maxX - vw / 2, tx)); ty = Math.max(minY + vh / 2, Math.min(maxY - vh / 2, ty));
  const f = Math.min(1, dt * 1.6);
  cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * (cam.y ? f : 1);
  if (!cam.y) cam.y = ty;
  cam.shake = Math.max(0, cam.shake - dt * 2.5);
  const sh = cam.shake > 0 ? cam.shake * 4 : 0;
  cam.ox = Wd / 2 - cam.x * k + (sh ? (Math.random() - 0.5) * sh * k : 0);
  cam.oy = Hd / 2 - cam.y * k + (sh ? (Math.random() - 0.5) * sh * k : 0);
}
/** World (stage pixels) to device pixels, and back. */
export const toScreen = (x, y) => [x * cam.k + cam.ox, y * cam.k + cam.oy];
export const toWorld = (sx, sy) => [(sx - cam.ox) / cam.k, (sy - cam.oy) / cam.k];

function drawLayer(g, L, t) {
  const d = stage.data, base = img(d.dir + L.src); if (!base) return;
  // parallax: the layer follows the camera by its rate (1: the sky, far away; 0: the floor)
  const px = (cam.x - d.home[0]) * L.rate[0], py = (cam.y - d.home[1]) * L.rate[1];
  g.imageSmoothingEnabled = !!L.smooth;
  g.drawImage(base, Math.round(L.x + px), Math.round(L.y + py), L.w, L.h);
  if (L.frames) {
    let ms = (t * 1000) % L.total, f = L.frames[0];
    for (const fr of L.frames) { if (ms < fr[1]) { f = fr; break; } ms -= fr[1]; }
    const p = f[0] && img(d.dir + f[0].src);
    if (p) g.drawImage(p, Math.round(L.x + px + f[0].x), Math.round(L.y + py + f[0].y));
  }
}
/** The stage behind the people: the sky's colour, then every layer that is not in front. */
export function drawBack(g, t) {
  const d = stage.data; if (!d) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = d.clear; g.fillRect(0, 0, cam.W, cam.H);
  g.setTransform(cam.k, 0, 0, cam.k, cam.ox, cam.oy);
  for (const L of d.layers) if (L.zone !== 'front') drawLayer(g, L, t);   // (the game's foreground signs would hide the people)
  g.imageSmoothingEnabled = false;
}

/** Where people can stand: the floor first, then the platforms (each { x0, x1, y }). */
export function surfaces() {
  const d = stage.data; if (!d) return [];
  return [{ ...d.ground, floor: true }, ...d.platforms];
}
