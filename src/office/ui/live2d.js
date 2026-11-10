// The game's own Live2D standing art, played in the café's card: its idle motions move the hair, the body and the
// face; on top of them the eyes blink, the mouth moves while the text types out, and the head follows the pointer.
// The runtime is Live2D's Cubism Core for Web (public/assets/vn/live2d/live2dcubismcore.min.js, fetched with the art by
// scripts/vn-assets.py: Live2D's own licence, never committed) drawn through pixi-live2d-display.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const CORE = `${BASE}/assets/vn/live2d/live2dcubismcore.min.js`;
// a mood for each state of a session, picked from the motions every model has
export const MOODS = { work: ['13Resolute', '17Serious', '01Normal'], wait: ['12Confuse', '07Curious', '01Normal'], rest: ['16Smile', '01Normal'],
  happy: ['05Happy', '16Smile', '01Normal'], hurt: ['14Hurt', '11Wronged', '01Normal'], normal: ['01Normal'] };

let libs = null;
function loadLibs() {
  libs ||= (async () => {
    if (!window.Live2DCubismCore) {
      await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = CORE; s.onload = ok; s.onerror = () => fail(new Error('no Cubism Core')); document.head.append(s); });
    }
    const PIXI = await import('pixi.js');
    window.PIXI = PIXI;   // (pixi-live2d-display looks for it there)
    const { Live2DModel } = await import('pixi-live2d-display/cubism4');
    return { PIXI, Live2DModel };
  })();
  libs.catch(() => { libs = null; });
  return libs;
}

/** Plays the model at url (a .model3.json) in `canvas`, framed as a bust (head to the thighs). Resolves to
 *  { talk(on), mood(state), stop() }, or rejects without the runtime or the model. */
export async function live2d(canvas, url, { frame = 0.62, mood = 'normal' } = {}) {
  const { PIXI, Live2DModel } = await loadLibs();
  const settings = await (await fetch(url)).json();
  settings.url = url;
  const motions = settings.FileReferences.Motions || {};
  delete motions['00Disable'];
  const pick = (k) => (MOODS[k] || MOODS.normal).find((m) => motions[m]) || Object.keys(motions)[0];
  motions.Idle = motions[pick(mood)] || [];   // (what plays when nothing else does)
  const box = canvas.parentElement.getBoundingClientRect();
  const app = new PIXI.Application({ view: canvas, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), width: box.width, height: box.height });
  const model = await Live2DModel.from(settings, { autoInteract: false });
  app.stage.addChild(model);
  // framing: from just over the head down `frame` of the figure (what is drawn, not the model's empty canvas) fills
  // the height, the figure in the middle
  model.scale.set(1);
  const fig = model.getLocalBounds();
  const place = () => {
    const b = canvas.parentElement.getBoundingClientRect(); app.renderer.resize(b.width, b.height);
    const k = (b.height * 0.97) / (fig.height * frame);
    model.scale.set(k); model.x = b.width / 2 - (fig.x + fig.width / 2) * k; model.y = b.height * 0.03 - fig.y * k;
  };
  place();
  addEventListener('resize', place);
  // eyes and mouth over whatever the motion does
  const core = model.internalModel.coreModel;
  let talking = false, blinkAt = performance.now() + 2500, t0 = performance.now();
  const set = (id, v) => { try { core.setParameterValueById(id, v); } catch { /* not in this model */ } };
  const get = (id) => { try { return core.getParameterValueById(id); } catch { return 1; } };
  model.internalModel.on('beforeModelUpdate', () => {
    const now = performance.now(), since = now - blinkAt;
    if (since > 0) {
      const k = since < 70 ? 1 - since / 70 : since < 160 ? (since - 70) / 90 : 1;   // shut in 70 ms, open again in 90
      set('ParamEyeLOpen', get('ParamEyeLOpen') * k); set('ParamEyeROpen', get('ParamEyeROpen') * k);
      if (since > 160) blinkAt = now + 2200 + Math.random() * 3800;
    }
    if (talking) set('ParamMouthOpenY', Math.abs(Math.sin((now - t0) / 1000 * 17)) * 0.8);
  });
  // the head turns towards the pointer
  const look = (e) => { const b = canvas.getBoundingClientRect(); model.focus(e.clientX - b.left, e.clientY - b.top); };
  addEventListener('pointermove', look);
  model.motion('Idle', 0, 1);
  return {
    talk(on) { talking = on; if (!on) set('ParamMouthOpenY', 0); },
    mood(state) { const m = pick(state); if (motions[m]) { motions.Idle = motions[m]; model.motion(m, 0, 3); } },
    stop() { removeEventListener('resize', place); removeEventListener('pointermove', look); app.destroy(false, { children: true, texture: false, baseTexture: false }); },
  };
}
