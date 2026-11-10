// A still portrait brought to life, the way a visual novel's standing art idles: drawn in thin horizontal strips, each
// pushed a little by the breath (the shoulders rise, the hips stay), a slow sway from the waist, the hair and the
// sleeves lifting in a breeze towards the bottom, and a small nod while the character speaks. Only the top of the
// figure is shown (head to waist), the visual novel's bust shot.
const STRIP = 2;   // canvas pixels per strip

/** Starts the portrait in `canvas`: img (loaded or loading), head = [x, y] of the face as fractions of the image.
 *  Returns { talk(on), stop() }. With reduced motion it is drawn once, still. */
export function puppet(canvas, img, head = [0.5, 0.08], still = false) {
  const g = canvas.getContext('2d');
  let raf = 0, talking = false, t0 = performance.now(), crop = null;
  const seed = Math.random() * 10;
  function size() {
    const iw = img.naturalWidth, ih = img.naturalHeight; if (!iw) return false;
    // from a little above the face to about the hips: half the figure
    const top = Math.max(0, (head[1] - 0.075) * ih), bottom = Math.min(ih, top + ih * 0.5), ch = bottom - top;
    const cw = Math.min(iw, ch * 0.95), cx = Math.min(iw - cw, Math.max(0, head[0] * iw - cw / 2));   // (round the face)
    crop = { x: cx, y: top, w: cw, h: ch };
    // as tall as the stage allows, but never blown up much past twice the picture's own pixels
    const box = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hh = Math.max(120, Math.min(box.height, ch * 2.2)), ww = hh * (crop.w / crop.h);
    canvas.style.height = `${hh}px`; canvas.style.width = `${ww}px`;
    canvas.width = Math.round(ww * dpr); canvas.height = Math.round(hh * dpr);
    return true;
  }
  function frame(now) {
    if (!crop && !size()) { raf = requestAnimationFrame(frame); return; }
    const t = (now - t0) / 1000 + seed, Wc = canvas.width, Hc = canvas.height, k = crop.h / Hc;
    g.clearRect(0, 0, Wc, Hc);
    const breathe = still ? 0 : Math.sin(t * (Math.PI * 2 / 3.8));
    const sway = still ? 0 : Math.sin(t * 0.75) * Wc * 0.006;
    const nod = !still && talking ? Math.sin(t * 13) * Hc * 0.0022 : 0;
    for (let y = 0; y < Hc; y += STRIP) {
      const v = y / Hc;   // 0 at the top of the bust, 1 at the hips
      const up = 1 - v;
      let dx = sway * up + (still ? 0 : Math.sin(t * 2.1 + v * 7) * Wc * 0.0018 * v * v);
      let dy = -breathe * Hc * 0.0055 * up;
      if (v < 0.32) { dy += nod * (1 - v / 0.32); dx += sway * 0.25; }
      g.drawImage(img, crop.x, crop.y + y * k, crop.w, (STRIP + 1) * k, dx, y + dy, Wc, STRIP + 1);
    }
    if (!still) raf = requestAnimationFrame(frame);
  }
  const start = () => { cancelAnimationFrame(raf); crop = null; raf = requestAnimationFrame(frame); };
  if (img.complete && img.naturalWidth) start(); else img.addEventListener('load', start, { once: true });
  const onResize = () => { crop = null; if (still) start(); };
  addEventListener('resize', onResize);
  return {
    talk(on) { talking = on; },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
  };
}
