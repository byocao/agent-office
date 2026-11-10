// The office as a pixel café, seen side on: the only view. Every session is one of the game's pixel characters with a
// desk by the big window; they walk, run, hop and celebrate with the game's own frame-by-frame animations, driven by
// what their session does:
//   working        at their desk, a burst of keystrokes (the attack move) now and then, a coffee run once in a while
//   waiting on you hopping at the desk with a "!" until you answer
//   resting        wandering: the counter, the sofa, the window
//   a commit, a deploy, green tests: the special move and confetti; a failure: knocked down, then back up
// Subagents are penguins sliding after their boss; a slime makes the coffee and the odd customer drops in for a cup.
// Click someone: their portrait and what their AI is doing, in a visual-novel box. The people still live their day in
// the simulation underneath (people/workers.js); this view reads what they last said and how their session stands.
// The art is the user's own copy of the game's (scripts/vn-assets.py builds it into public/assets/vn; git ignores it).
import { $, el, officeNow, reduceMotion, short } from '../core/env.js';
import { night } from '../life/daylight.js';
import { wx } from '../life/weather.js';
import { hash, sessions, subs, workers } from '../people/workers.js';
import { TYPE_ICON, icon } from './icons.js';
import { openSession } from './session-drawer.js';
import { doingOf } from './activity.js';
import { puppet } from './puppet.js';
import { drawCounter, drawDesk, drawLight, drawLive, drawStill, roomHooks } from './cafe-room.js';
import { TOKEN } from '../net/live.js';
import { DEMO, demoLog } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const ART = `${BASE}/assets/vn`;
const CAST = ['mio', 'lilith', 'shigure', 'xao', 'mango', 'chika', 'police', 'mercenary', 'sparkle', 'believer'];   // who a newcomer plays, by preference
const GUESTS = ['thug', 'gangster', 'mafia', 'police', 'sparkle', 'believer', 'mercenary'];
const PLACES = ['street', 'city', 'corner', 'church', 'deck', 'office', 'cafe', 'room', 'hall'];   // what the window looks out on
const CHEER = new Set(['commit', 'push', 'release', 'cigreen', 'testok', 'deploy']);
const OUCH = new Set(['fail', 'testfail', 'cired']);
const WALK = 34, RUN = 78, GRAV = 420;   // art pixels a second (and a second squared)
const CAST_KEY = 'office-cafe-cast', PLACE_KEY = 'office-cafe-view', LOG_MAX = 120;

export const cafe = { on: true };
let root, cv, g, cardEl, logEl, logList, placeMenu, signEl, noArtEl;
let art = null, artTried = false;
const sheets = new Map();          // sprite id -> Image
let castOf = {}, view = 'street';
const actors = new Map();          // key -> actor
const seen = new Map();            // worker key -> last line's signature
const log = [];
const parts = [];                  // particles: confetti, steam, dust
let S = 3, W = 0, H = 0, w = 0, h = 0, dpr = 1, lastT = 0, nextGuest = 20, hover = null, picked = null, firstLook = true;
let winCache = { key: '', c: null }, bgImg = null, bgUrl = '';
const L = {};                      // this frame's layout (art pixels)

/* ---------- small helpers ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const keyOf = (wk) => (wk.sub ? `sub:${wk.id}` : `s:${wk.id}`);
const nameOf = (s) => (s ? s.title || s.name : '');
const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || '';
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function saveCast() { try { localStorage.setItem(CAST_KEY, JSON.stringify(castOf)); } catch { /* storage blocked */ } }
function roleOf(s) {
  const have = CAST.filter((c) => art?.sprites[c]);
  if (castOf[s.name] && have.includes(castOf[s.name])) return castOf[s.name];
  const taken = new Set([...sessions.values()].filter((x) => x !== s).map((x) => castOf[x.name]).filter(Boolean));
  const pick = have.find((c) => !taken.has(c)) || have[hash(s.name) % have.length];
  castOf[s.name] = pick; saveCast();
  return pick;
}
function sheet(id) {
  let im = sheets.get(id);
  if (!im && art?.sprites[id]) { im = new Image(); im.src = `${ART}/${art.sprites[id].src}`; sheets.set(id, im); }
  return im?.complete && im.naturalWidth ? im : null;
}

/* ---------- actors ---------- */
// x, y: the feet, in art pixels; z: height of a jump; face 1 right, -1 left
function makeActor(key, sprite, x, y, opt = {}) {
  const a = { key, sprite, x, y, z: 0, vz: 0, face: 1, anim: 'Idle', at: 0, once: null, path: [], wait: 0, k: opt.k || 1, alpha: 0, gone: false,
    kind: opt.kind || 'main', sid: opt.sid, say: '', sayKind: '', sayUntil: 0, think: rnd(0.5, 2), desk: -1, ...opt };
  actors.set(key, a);
  return a;
}
const A = (a) => art?.sprites[a.sprite]?.anims || {};
function play(a, anim, then) {
  if (!A(a)[anim]) { then?.(); return; }
  a.anim = anim; a.at = 0; a.once = then || (() => {});
}
function loopAnim(a, anim) { if (a.once) return; if (a.anim !== anim) { a.anim = A(a)[anim] ? anim : 'Idle'; a.at = 0; } }
function goTo(a, x, y = a.y, run = false, then = null) { a.path = [{ x, y, run, then }]; }
function hop(a, power = 150) { if (a.z > 0 || a.vz) return; a.vz = power; a.once = null; a.anim = 'Rise'; a.at = 0; }
function say(a, text, kind = '', secs = 6) { a.say = text; a.sayKind = kind; a.sayUntil = performance.now() / 1000 + secs; }
function frameOf(a) {
  const an = A(a)[a.anim] || A(a).Idle; if (!an) return null;
  const total = an.frames.reduce((t, f) => t + f[1], 0), ms = a.at * 1000;
  if (!an.loop && a.once !== null && ms >= total) return { f: an.frames[an.frames.length - 1][0], done: true };
  let t = an.loop || a.once === null ? ms % total : Math.min(ms, total - 1);
  for (const [f, d] of an.frames) { if (t < d) return { f, done: false }; t -= d; }
  return { f: an.frames[an.frames.length - 1][0], done: false };
}
function stepActor(a, dt) {
  a.at += dt;
  a.alpha = Math.min(1, Math.max(0, a.alpha + (a.gone ? -dt * 2 : dt * 3)));
  // a jump
  if (a.vz || a.z > 0) {
    a.vz -= GRAV * dt; a.z = Math.max(0, a.z + a.vz * dt);
    if (a.z === 0 && a.vz < 0) { a.vz = 0; dust(a.x, a.y, 4); play(a, 'Land', () => { a.once = null; }); }
    else if (!a.once) { const want = a.vz > 0 ? 'Rise' : 'Fall'; if (a.anim !== want) { a.anim = want; a.at = 0; } }
    return;
  }
  const fr = frameOf(a);
  if (a.once && fr?.done) { const f = a.once; a.once = null; a.anim = 'Idle'; a.at = 0; f(); }
  if (a.once) return;
  // walking somewhere
  const p = a.path[0];
  if (p) {
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy), sp = (p.run ? RUN : WALK) * (a.kind === 'sub' ? 1.15 : 1);
    if (d < 1.5) { a.x = p.x; a.y = p.y; a.path.shift(); loopAnim(a, 'Idle'); p.then?.(); return; }
    a.face = dx > 0.3 ? 1 : dx < -0.3 ? -1 : a.face;
    a.x += (dx / d) * Math.min(d, sp * dt); a.y += (dy / d) * Math.min(d, sp * dt);
    loopAnim(a, p.run ? 'Run' : 'Walk');
    if (p.run && Math.random() < dt * 6) dust(a.x - a.face * 4, a.y, 1);
    return;
  }
  loopAnim(a, 'Idle');
}

/* ---------- what each one does ---------- */
// desks under the window, in one row or, when the room is full, two (the second a step forward, between the first's)
function desk(i) { const row = i < L.perRow ? 0 : 1, k = row ? i - L.perRow : i; return { x: L.desk0 + k * L.deskGap + row * L.deskGap / 2, y: row ? L.mid : L.back }; }
const seat = (i) => { const d = desk(i); return [d.x - 10, d.y]; };
function brainMain(a, s, now) {
  if (!s) return;
  const atDesk = a.desk >= 0 && Math.abs(a.x - seat(a.desk)[0]) < 2 && Math.abs(a.y - seat(a.desk)[1]) < 2;
  a.think -= 0.25; if (a.think > 0) return;   // (called four times a second)
  if (s.status === 'wait') {
    if (!atDesk && !a.path.length) goTo(a, ...seat(a.desk), true, () => { a.face = 1; });
    else if (atDesk && !reduceMotion) hop(a, 120);
    say(a, tr('ui.cafe.waiting'), 'wait', 3);
    a.think = 1.6; return;
  }
  if (s.status === 'work') {
    if (!atDesk) { if (!a.path.length) goTo(a, ...seat(a.desk), false, () => { a.face = 1; }); a.think = 1; return; }
    a.face = 1;
    // now and then a coffee run, while the work goes on
    if (now > (a.coffeeAt ||= now + rnd(50, 120))) {
      a.coffeeAt = now + rnd(70, 160);
      goTo(a, L.counter - 14, L.front, false, () => { a.face = 1; order(); setTimeout(() => goTo(a, ...seat(a.desk), false, () => { a.face = 1; }), 3500); });
    }
    a.think = rnd(2, 4); return;
  }
  // resting: somewhere else, for a while
  if (a.path.length) { a.think = 1; return; }
  // somewhere nobody else is going: the counter, the sofa, the window, anywhere on the floor
  const spots = [[L.counter - 14, L.front], [L.sofa - 16, L.front], [L.sofa + 16, L.front], [rnd(L.win0 + 10, L.win1 - 10), L.front], [rnd(L.door + 40, w - 30), L.front], [rnd(L.door + 40, w - 30), L.mid + 2]];
  const busy = [...actors.values()].filter((o) => o !== a).map((o) => o.path[0]?.x ?? o.x);
  let x, y;
  for (let k = 0; k < 8; k++) { [x, y] = spots[Math.floor(Math.random() * spots.length)]; if (!busy.some((bx) => Math.abs(bx - x) < 18)) break; }
  goTo(a, x, y, Math.random() < 0.18, () => { a.face = x > w * 0.7 ? -1 : Math.random() < 0.5 ? 1 : -1; if (Math.abs(x - (L.counter - 14)) < 2) order(); });
  a.think = rnd(6, 14);
}
function brainSub(a, boss) {
  if (!boss || boss.gone) { if (!a.gone && !a.path.length) goTo(a, L.door, L.front, true, () => { a.gone = true; }); return; }
  const i = [...actors.values()].filter((x) => x.kind === 'sub' && x.boss === boss.key && !x.gone).indexOf(a);
  const tx = boss.x - boss.face * (16 + i * 14), ty = Math.min(L.front, boss.y + 6);
  if (Math.abs(a.x - tx) > 10 || Math.abs(a.y - ty) > 4) { if (!a.path.length || Math.abs(a.path[0].x - tx) > 10) goTo(a, tx, ty, Math.abs(a.x - tx) > 60); }
  else if (!a.path.length) a.face = boss.x > a.x ? 1 : -1;
}
function order() {
  const b = actors.get('barista'); if (!b) return;
  b.face = -1; play(b, 'Attack1'); steam(L.counter + 8, L.back - 30, 6);
  setTimeout(() => say(b, tr('ui.cafe.coffee'), '', 2.5), 500);
}
// a new line from someone: how they take it
function react(a, line) {
  if (!a) return;
  say(a, short(line.text, 46), line.kind, line.kind === 'wait' ? 8 : 6);
  if (reduceMotion || a.z > 0) return;
  if (CHEER.has(line.type)) { play(a, 'Special'); confetti(a.x, a.y - 30); hop(a, 130); }
  else if (OUCH.has(line.type) || line.kind === 'fail') play(a, 'GroundHurt', () => { a.think = 1; });
  else if (a.kind === 'main' && sessions.get(a.sid)?.status === 'work' && Math.random() < 0.4) play(a, 'Attack1');
  else if (a.kind === 'sub' && Math.random() < 0.3) hop(a, 100);
}

/* ---------- particles ---------- */
function dust(x, y, n) { if (reduceMotion) return; for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-4, 4), y, vx: rnd(-14, 14), vy: rnd(-12, -4), life: rnd(0.3, 0.6), c: 'rgba(230,220,200,.7)', s: 1 }); }
function steam(x, y, n) { if (reduceMotion) return; for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-2, 2), y, vx: rnd(-3, 3), vy: rnd(-14, -8), life: rnd(1, 1.8), c: 'rgba(255,255,255,.5)', s: 2 }); }
function confetti(x, y) { if (reduceMotion) return; const C = ['#FF5FA8', '#FFD23F', '#3DDC84', '#7AB8FF', '#FFFFFF']; for (let i = 0; i < 26; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-90, -30), life: rnd(0.9, 1.6), c: C[i % C.length], s: 2, g: 120 }); }
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; if (p.life <= 0) parts.splice(i, 1); }
}

/* ---------- keeping the cast in step with the office ---------- */
function sync(now) {
  const live = new Set();
  const mains = [...workers.values()].filter((wk) => sessions.has(wk.id));
  // desks: in the order people arrived, kept
  const used = new Set([...actors.values()].filter((a) => a.kind === 'main' && !a.gone).map((a) => a.desk));
  for (const wk of mains) {
    const k = keyOf(wk), s = sessions.get(wk.id); live.add(k);
    let a = actors.get(k);
    if (a && a.gone) { actors.delete(k); a = null; }
    if (!a) {
      let d = 0; while (used.has(d)) d++; used.add(d);
      a = makeActor(k, roleOf(s), firstLook ? seat(d)[0] : L.door, firstLook ? seat(d)[1] : L.front, { sid: wk.id, desk: d });
      if (!firstLook) { a.face = 1; goTo(a, ...seat(d), true, () => { a.face = 1; hop(a, 140); }); say(a, tr('ui.cafe.hello', { proj: projOf(s) || nameOf(s) }), '', 5); }
    }
    a.sprite = roleOf(s); a.name = short(nameOf(s), 22); a.status = s.status;
  }
  for (const wk of subs.values()) {
    const boss = wk.parent && actors.get(keyOf(wk.parent)); if (!boss) continue;
    const k = keyOf(wk); live.add(k);
    let a = actors.get(k);
    if (!a) { a = makeActor(k, 'penguin', firstLook ? boss.x - 16 : L.door, L.front, { kind: 'sub', boss: boss.key, k: 0.8, sid: boss.sid }); a.name = short(wk.desc || wk.cfg?.name || '', 22); }
  }
  // the ones gone from the office walk out of the door
  for (const a of actors.values()) {
    if ((a.kind === 'main' || a.kind === 'sub') && !live.has(a.key) && !a.leaving) {
      a.leaving = true; a.say = ''; goTo(a, L.door, L.front, a.kind === 'sub', () => { a.gone = true; });
    }
  }
  // the counter is never left alone
  if (!actors.has('barista') && art.sprites.popsicle) { const b = makeActor('barista', 'popsicle', L.counter + 18, L.bar, { kind: 'barista', k: 0.72 }); b.face = -1; }
  // a customer now and then
  if (now > nextGuest && [...actors.values()].filter((a) => a.kind === 'guest').length < 2) {
    nextGuest = now + rnd(35, 90);
    const taken = new Set([...actors.values()].map((a) => a.sprite)), pick = GUESTS.filter((x) => art.sprites[x] && !taken.has(x));
    if (pick.length) {
      const gst = makeActor(`guest:${now}`, pick[Math.floor(Math.random() * pick.length)], L.door, L.front, { kind: 'guest', k: 0.95 });
      goTo(gst, L.counter - 26 - rnd(0, 10), L.front, false, () => {
        gst.face = 1; order();
        setTimeout(() => goTo(gst, rnd(L.win0 + 20, L.win1 - 20), L.front, false, () => { gst.face = Math.random() < 0.5 ? 1 : -1; setTimeout(() => goTo(gst, L.door, L.front, false, () => { gst.gone = true; }), rnd(8000, 20000)); }), 4000);
      });
    }
  }
  for (const [k, a] of actors) if (a.gone && a.alpha <= 0) actors.delete(k);
}
// what everyone said since the last look
function listen() {
  for (const wk of [...workers.values(), ...subs.values()]) {
    const said = wk.lastSay; if (!said?.text) continue;
    const k = keyOf(wk), sig = `${said.type}|${said.text}|${said.kind}`;
    if (seen.get(k) === sig) continue;
    const first = !seen.has(k); seen.set(k, sig);
    if (first && firstLook) continue;
    const s = sessions.get(wk.sub ? wk.parent?.id : wk.id);
    const line = { key: k, sid: s?.id, who: wk.sub ? short(wk.desc || wk.cfg?.name || tr('ui.cafe.helper'), 30) : short(nameOf(s), 30), sub: !!wk.sub, sprite: actors.get(k)?.sprite,
      text: said.text, type: said.type, kind: said.kind || (s?.status === 'wait' && !wk.sub ? 'wait' : ''), at: Date.now() };
    log.push(line); if (log.length > LOG_MAX) log.shift();
    if (!logEl.hidden) addLogRow(line, true);
    react(actors.get(k), line);
    if (picked === k) paintCard();
  }
}

/* ---------- drawing ---------- */
function layout() {
  const b = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = b.width; H = b.height; S = Math.max(2, Math.min(5, Math.round(Math.min(H / 230, W / 440)))); w = W / S; h = H / S;
  const Wp = Math.round(W * dpr), Hp = Math.round(H * dpr); if (cv.width !== Wp || cv.height !== Hp) { cv.width = Wp; cv.height = Hp; }
  Object.assign(L, { floor: Math.round(h * 0.7), back: Math.round(h * 0.78), mid: Math.round(h * 0.86), front: Math.round(h * 0.95), bar: Math.round(h * 0.75), door: 18 });
  L.win0 = Math.round(w * 0.1); L.win1 = Math.round(w * 0.6); L.winTop = Math.round(h * 0.1); L.winBot = Math.round(h * 0.5);
  L.counter = Math.round(w * 0.7); L.counterW = Math.max(56, Math.round(w * 0.13)); L.sofa = Math.round(w * 0.86); L.wain = L.floor - 34;
  L.lamps = [L.win0 + 30, (L.win0 + L.win1) / 2, L.win1 - 30, L.counter + L.counterW / 2, L.sofa];
  const n = Math.max(3, [...actors.values()].filter((a) => a.kind === 'main' && !a.gone).length);
  const room = L.win1 - L.win0 - 30; L.perRow = Math.max(2, Math.min(n, Math.floor(room / 40)));
  L.deskGap = Math.max(40, Math.min(70, room / L.perRow)); L.desk0 = L.win0 + 24;
}
function lightNow() {
  const P = art?.places[view] || {}, hr = officeNow().getHours();
  if (wx.rain > 0.3 && P.rain) return 'rain';
  if (night) return hr >= 18 && hr < 21 && P.eve ? 'eve' : P.night ? 'night' : 'day';
  if (hr >= 16 && P.dusk) return 'dusk';
  return 'day';
}
function windowPic(ww, hh) {
  const P = art?.places[view] || Object.values(art?.places || {})[0]; if (!P) return null;
  const url = `${ART}/${P[lightNow()] || P.day || Object.values(P)[0]}`;
  if (url !== bgUrl) { bgUrl = url; bgImg = new Image(); bgImg.src = url; winCache.key = ''; }
  if (!bgImg.complete || !bgImg.naturalWidth) return null;
  const key = `${url}|${ww}x${hh}`; if (winCache.key === key) return winCache.c;
  // the view, pixelated to the room's own pixels
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(ww)); c.height = Math.max(1, Math.round(hh));
  const x = c.getContext('2d'), k = Math.max(c.width / bgImg.width, c.height / bgImg.height);
  x.imageSmoothingQuality = 'high'; x.drawImage(bgImg, (c.width - bgImg.width * k) / 2, (c.height - bgImg.height * k) * 0.6, bgImg.width * k, bgImg.height * k);
  winCache = { key, c };
  return c;
}
// the room's still part, drawn into a picture of its own when it changes (size, day or night, the view, the desks)
let still = { key: '', c: null };
function stillRoom(pic, n) {
  const key = `${cv.width}x${cv.height}|${S}|${night}|${bgUrl}|${!!pic}|${n}`;
  if (still.key !== key) {
    const c = still.c || document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d'); x.setTransform(dpr * S, 0, 0, dpr * S, 0, 0); x.imageSmoothingEnabled = false; x.clearRect(0, 0, w, h);
    drawStill(x, L, { w, h, night, pic });
    still = { key, c };
  }
  return still.c;
}
function drawActor(a) {
  const sp = art.sprites[a.sprite], im = sheet(a.sprite), fr = frameOf(a); if (!sp || !im || !fr) return;
  const sx = (fr.f % sp.cols) * sp.cw, sy = Math.floor(fr.f / sp.cols) * sp.ch, k = a.k;
  g.globalAlpha = a.alpha;
  // a shadow on the floor, smaller as they leave it
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(a.x, a.y, 9 * k * Math.max(0.5, 1 - a.z / 80), 2.2 * k, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(Math.round(a.x), Math.round(a.y - a.z)); g.scale(a.face * k, k);
  if (hover === a || picked === a.key) g.filter = 'brightness(1.3)';
  g.drawImage(im, sx, sy, sp.cw, sp.ch, -sp.px, -sp.py, sp.cw, sp.ch);
  g.restore(); g.globalAlpha = 1;
  const tall = (sp.tall || 54) * k;
  a.top = a.y - a.z - tall;   // (the top of the head, for the bubble)
  a.box = { x0: a.x - 12 * k, x1: a.x + 12 * k, y0: a.top, y1: a.y };
}
// names and bubbles at screen resolution, over the pixels. A name shows over whoever works, waits, speaks, or is
// pointed at; a label that would land on another moves up above it.
function drawLabels(now) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const taken = [];
  const place = (x, y, ww, hh) => {   // (bottom-up: the first free spot at or above y)
    for (let k = 0; k < 8; k++) { if (!taken.some((r) => x < r.x + r.w && x + ww > r.x && y < r.y + r.h && y + hh > r.y)) break; y -= hh + 3; }
    taken.push({ x, y, w: ww, h: hh }); return y;
  };
  for (const a of [...actors.values()].sort((p, q) => q.y - p.y)) {
    if (a.alpha < 0.3 || a.top == null) continue;
    const X = a.x * S, Y = a.top * S;
    const st = a.kind === 'main' ? sessions.get(a.sid)?.status : null, talking = a.say && now < a.sayUntil;
    let y = Y - 4;
    if (a.kind === 'main' && a.name && (st !== 'rest' || talking || hover === a || picked === a.key)) {
      g.font = '700 11px system-ui, sans-serif'; const name = short(a.name, 20), tw = g.measureText(name).width + 18;
      const ty = place(X - tw / 2, y - 16, tw, 16);
      g.fillStyle = 'rgba(20,14,30,.8)'; g.beginPath(); g.roundRect(X - tw / 2, ty, tw, 16, 8); g.fill();
      g.fillStyle = st === 'wait' ? '#FFB020' : st === 'work' ? '#3DDC84' : '#9AA4B2'; g.beginPath(); g.arc(X - tw / 2 + 8, ty + 8, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(name, X - tw / 2 + 14, ty + 8.5); y = ty - 4;
    }
    if (talking) {
      g.font = '600 12px system-ui, sans-serif'; const txt = short(a.say, 40), tw = Math.min(260, g.measureText(txt).width) + 16, bh = 22;
      const by = place(X - tw / 2, y - bh - 6, tw, bh + 6);
      const col = a.sayKind === 'wait' ? '#FFB020' : a.sayKind === 'fail' ? '#E04E5E' : '#FFFFFF';
      g.fillStyle = col; g.strokeStyle = '#2B1D2F'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(X - tw / 2, by, tw, bh, 6); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(X - 5, by + bh); g.lineTo(X, by + bh + 6); g.lineTo(X + 5, by + bh); g.fill();
      g.fillStyle = col === '#FFFFFF' ? '#1E1626' : '#1E1200'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, X, by + bh / 2 + 0.5, 260);
    }
  }
}

/** A session's face (the portrait of the character it plays), as an image URL, or null without the art. */
export function faceUrl(s) {
  if (!art || !s) return null;
  const c = art.cast[roleOf(s)];
  return c ? `${ART}/${c.face}` : null;
}
/** The café's canvas as it is now (the Wrapped card draws it in). */
export const cafeCanvas = () => (cv?.width ? cv : null);
/** The café as it is now, for the group chat: the middle of the view, 4:3, 480 px wide, as a JPEG data URL. */
export function cafeShot() {
  if (!cv?.width) return null;
  const ww = 480, hh = 360, c = document.createElement('canvas'); c.width = ww; c.height = hh;
  const sw = Math.min(cv.width, (cv.height * 4) / 3), sh = (sw * 3) / 4;
  c.getContext('2d').drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, 0, 0, ww, hh);
  try { return c.toDataURL('image/jpeg', 0.8); } catch { return null; }
}

/** Draws one frame of the café (called by the render loop: the only view). */
export function drawCafe() {
  if (!cv || !art) return;
  const now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
  layout();
  if (now - (drawCafe.tick || 0) > 0.25) {   // (the people and their lines: four times a second is plenty)
    drawCafe.tick = now;
    listen(); sync(now);
    for (const a of actors.values()) { if (a.kind === 'main' && !a.leaving) brainMain(a, sessions.get(a.sid), now); else if (a.kind === 'sub' && !a.leaving) brainSub(a, actors.get(a.boss)); }
    firstLook = false;
    paintSign();
    if (picked) paintCard(false);
  }
  for (const a of actors.values()) stepActor(a, dt);
  stepParts(dt);
  const n = Math.max(3, [...actors.values()].filter((a) => a.kind === 'main' && !a.gone).length);
  const pic = windowPic(L.win1 - L.win0, L.winBot - L.winTop), env = { w, h, t: now, night, rain: wx.rain, still: reduceMotion, now: officeNow(), screens: [] };
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(stillRoom(pic, n), 0, 0);
  g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0); g.imageSmoothingEnabled = false;
  drawLive(g, L, env);
  // furniture and people back to front; a desk just in front of whoever stands at it
  const layers = [];
  for (let i = 0; i < n; i++) {
    const d = desk(i), who = [...actors.values()].find((a) => a.kind === 'main' && a.desk === i && !a.gone), st = who ? sessions.get(who.sid)?.status : null;
    layers.push([d.y + 0.5, () => { if (drawDesk(g, L, i, d.x, d.y, st, now, reduceMotion)) env.screens.push({ x: d.x + 2, y: d.y - 27, wait: st === 'wait' }); }]);
  }
  layers.push([L.back + 0.5, () => drawCounter(g, L, now, reduceMotion)]);
  for (const a of actors.values()) layers.push([a.y, () => drawActor(a)]);
  for (const [, f] of layers.sort((p, q) => p[0] - q[0])) f();
  for (const p of parts) { g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.life * 2); g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  g.globalAlpha = 1;
  drawLight(g, L, env);
  drawLabels(now);
}

/* ---------- the sign, the card, the backlog ---------- */
function paintSign() {
  const list = [...sessions.values()], work = list.filter((s) => s.status === 'work').length, wait = list.filter((s) => s.status === 'wait').length;
  signEl.querySelector('small').textContent = [hm(officeNow()), tr('ui.cafe.count', { n: list.length }), work ? tr('ui.cafe.working', { n: work }) : '', wait ? tr('ui.cafe.waitingN', { n: wait }) : ''].filter(Boolean).join(' · ');
  root.querySelector('.cafe-empty').hidden = list.length > 0;
}
function pick(a) {
  if (!a || a.kind === 'barista' || a.kind === 'guest') { if (a) { say(a, tr(a.kind === 'barista' ? 'ui.cafe.baristaHi' : 'ui.cafe.guestHi'), '', 3); hop(a, 110); } return; }
  picked = a.key; paintCard(true); hop(a, 100);
}
// what the session's AI last wrote to you (its transcript's last answer), fetched when the card opens and again while it
// stays open; the demo keeps its own
const replies = new Map();   // session id -> { text, at }
let doll = null;             // the portrait being animated
const plain = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
async function loadReply(sid) {
  const was = replies.get(sid); if (was && Date.now() - was.at < 8000) return;
  replies.set(sid, { text: was?.text || '', at: Date.now() });
  let items = [];
  if (DEMO) items = demoLog.get(sid) || [];
  else {
    try { const r = await fetch(`/api/log?id=${encodeURIComponent(sid)}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`); items = (await r.json()).items || []; } catch { return; }
  }
  const last = [...items].reverse().find((x) => x.role === 'claude' && x.text);
  const text = last ? short(plain(last.text), 420) : '';
  if (text !== (was?.text || '')) { replies.set(sid, { text, at: Date.now() }); if (actors.get(picked)?.sid === sid) paintCard(); }
}
function paintCard(fresh = false) {
  const a = actors.get(picked); if (!a) { closeCard(); return; }
  const s = sessions.get(a.sid), sub = a.kind === 'sub', cast = sub ? null : art.cast[a.sprite];
  cardEl.hidden = false; cardEl.dataset.kind = sub ? 'sub' : s?.status || 'rest';
  const pic = cardEl.querySelector('.cafe-portrait');
  if (fresh) {
    doll?.stop(); doll = null; pic.replaceChildren();
    if (cast) {
      const im = new Image(); im.src = `${ART}/${cast.src}`;
      const c = document.createElement('canvas'); pic.append(c); pic.dataset.kind = 'art';
      doll = puppet(c, im, cast.head, reduceMotion);
    } else { const c = document.createElement('canvas'), sp = art.sprites[a.sprite], ims = sheet(a.sprite); c.width = sp.cw; c.height = sp.ch; if (ims) c.getContext('2d').drawImage(ims, 0, 0, sp.cw, sp.ch, 0, 0, sp.cw, sp.ch); pic.append(c); pic.dataset.kind = 'pixel'; }
    pic.classList.remove('is-in'); void pic.offsetWidth; pic.classList.add('is-in');
    if (s && !sub) loadReply(s.id);
  }
  const wk = sub ? subs.get(a.key.slice(4)) : workers.get(a.sid), said = wk?.lastSay;
  cardEl.querySelector('.cafe-name').textContent = sub ? a.name || tr('ui.cafe.helper') : nameOf(s);
  cardEl.querySelector('.cafe-role').textContent = sub ? tr('ui.cafe.helperOf', { name: nameOf(s) }) : `${cast?.name || a.sprite} · ${tr(`ui.cafe.status.${s?.status || 'rest'}`)}`;
  // what they are doing now, in a line; what their AI last said to you, as the dialogue
  const doing = sub ? said?.text : s?.status === 'wait' ? tr('ui.cafe.waiting') : said?.text || (s && doingOf(s).text) || '';
  const dEl = cardEl.querySelector('.cafe-doing'); dEl.hidden = !doing;
  dEl.replaceChildren(icon(TYPE_ICON[said?.type] || (s?.status === 'rest' ? 'coffee' : 'sparkle')), document.createTextNode(doing || ''));
  const reply = sub ? '' : replies.get(a.sid)?.text || '';
  const text = reply || (sub ? said?.text : '') || (s ? doingOf(s).text : '') || tr('ui.cafe.quiet'), t = cardEl.querySelector('.cafe-text');
  if (t.dataset.full !== text) { t.dataset.full = text; t.textContent = ''; t.dataset.at = String(performance.now()); }
  const n = reduceMotion ? text.length : Math.min(text.length, Math.floor((performance.now() - Number(t.dataset.at)) / 18));
  t.textContent = text.slice(0, n); doll?.talk(n < text.length);
  if (n < text.length) requestAnimationFrame(() => picked === a.key && paintCard(false));
  cardEl.querySelector('.cafe-task').textContent = !sub && s?.lastPrompt ? `「${short(s.lastPrompt, 140)}」` : '';
  const todo = cardEl.querySelector('.cafe-todo'); const items = sub ? [] : (s?.todos || []).slice(0, 5);
  const tkey = items.map((x) => x.status + x.text).join('|');
  if (todo.dataset.key !== tkey) { todo.dataset.key = tkey; todo.replaceChildren(...items.map((x) => el('li', `is-${x.status}`, x.text))); }
  cardEl.querySelector('[data-cafe="approve"]').hidden = sub || s?.status !== 'wait';
  cardEl.querySelector('[data-cafe="swap"]').hidden = sub;
  if (s && !sub && !fresh) loadReply(s.id);   // (at most every 8 seconds)
}
function closeCard() { picked = null; cardEl.hidden = true; doll?.stop(); doll = null; }
function swapRole(a) {
  const s = sessions.get(a?.sid); if (!s || a.kind !== 'main') return;
  const have = CAST.filter((c) => art.sprites[c]), i = have.indexOf(roleOf(s));
  const taken = new Set([...sessions.values()].filter((x) => x !== s).map((x) => castOf[x.name]));
  for (let k = 1; k <= have.length; k++) { const c = have[(i + k) % have.length]; if (!taken.has(c) || k === have.length) { castOf[s.name] = c; break; } }
  saveCast(); a.sprite = castOf[s.name]; hop(a, 140); confetti(a.x, a.y - 30); paintCard(true);
}
function addLogRow(l, scroll) {
  const row = el('button', 'cafe-log-row'); row.type = 'button';
  const face = el('span', 'cafe-log-face'), c = art.cast[l.sprite];
  if (c && !l.sub) face.style.backgroundImage = `url("${ART}/${c.face}")`; else face.classList.add('is-sub');
  const body = el('span', 'cafe-log-body');
  body.append(el('b', '', l.who), el('small', '', hm(new Date(l.at))), el('span', '', l.text));
  row.append(face, body);
  row.addEventListener('click', () => { if (l.sid && sessions.has(l.sid)) openSession(l.sid); });
  logList.append(row); while (logList.children.length > LOG_MAX) logList.firstChild.remove();
  if (scroll) logList.scrollTop = logList.scrollHeight;
}
function toggleLog(on = logEl.hidden) {
  logEl.hidden = !on;
  if (on) { logList.replaceChildren(); for (const l of log) addLogRow(l, false); if (!log.length) logList.append(el('p', 'cafe-log-empty', tr('ui.cafe.logEmpty'))); logList.scrollTop = logList.scrollHeight; }
}
function setView(p) {
  if (!PLACES.includes(p)) return;
  view = p; try { localStorage.setItem(PLACE_KEY, p); } catch { /* storage blocked */ }
  for (const b of placeMenu.querySelectorAll('[data-place]')) b.setAttribute('aria-pressed', String(b.dataset.place === p));
}
function actorAt(e) {
  const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) / S, y = (e.clientY - b.top) / S;
  let best = null;
  for (const a of actors.values()) if (a.box && a.alpha > 0.5 && x >= a.box.x0 && x <= a.box.x1 && y >= a.box.y0 && y <= a.box.y1 && (!best || a.y > best.y)) best = a;
  return best;
}

// how tall someone stands: the first row with paint in their first idle frame, above their feet
function measure(id) {
  const sp = art.sprites[id], im = sheets.get(id), f = sp.anims.Idle?.frames[0]?.[0] ?? 0;
  const c = document.createElement('canvas'); c.width = sp.cw; c.height = sp.ch;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, (f % sp.cols) * sp.cw, Math.floor(f / sp.cols) * sp.ch, sp.cw, sp.ch, 0, 0, sp.cw, sp.ch);
  const d = x.getImageData(0, 0, sp.cw, sp.ch).data;
  for (let y = 0; y < sp.ch; y++) for (let i = 0; i < sp.cw; i++) if (d[(y * sp.cw + i) * 4 + 3] > 40) { sp.tall = sp.py - y; return; }
}
async function loadArt() {
  if (artTried) return; artTried = true;
  try {
    const r = await fetch(`${ART}/manifest.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    art = await r.json();
    if (!art?.sprites || !Object.keys(art.sprites).length) throw new Error('no pixel characters');
    art.cast ||= {}; art.places ||= {};
    for (const id of Object.keys(art.sprites)) { sheet(id); sheets.get(id).addEventListener('load', () => measure(id), { once: true }); }
    for (const c of Object.values(art.cast)) new Image().src = `${ART}/${c.src}`;   // (the portraits, ready for the card)
    for (const b of placeMenu.querySelectorAll('[data-place]')) { const P = art.places[b.dataset.place]; b.hidden = !P; if (P) b.querySelector('i').style.backgroundImage = `url("${ART}/${P.day || Object.values(P)[0]}")`; }
    if (!art.places[view]) view = Object.keys(art.places)[0] || view;
    noArtEl.hidden = true;
  } catch {
    art = null; noArtEl.hidden = false;
  }
}

export function setup() {
  roomHooks({ steam: (x, y) => steam(x, y, 1) });
  try { castOf = JSON.parse(localStorage.getItem(CAST_KEY) || '{}') || {}; const v = localStorage.getItem(PLACE_KEY); if (PLACES.includes(v)) view = v; } catch { /* storage blocked */ }
  document.body.classList.add('is-cafe');
  root = el('section', 'cafe'); root.setAttribute('aria-label', tr('ui.cafe.label'));
  root.innerHTML = `
    <canvas class="cafe-cv"></canvas>
    <div class="cafe-top">
      <button type="button" class="cafe-btn" data-cafe="view" title="${tr('ui.cafe.viewTitle')}"></button>
      <button type="button" class="cafe-btn" data-cafe="log" title="${tr('ui.cafe.log')} (L)"></button>
      <button type="button" class="cafe-btn" data-cafe="full" title="${tr('ui.cafe.fullscreen')}"></button>
    </div>
    <div class="cafe-places" hidden role="menu">${PLACES.map((p) => `<button type="button" role="menuitemradio" data-place="${p}" aria-pressed="false"><i></i><span>${tr(`ui.cafe.place.${p}`)}</span></button>`).join('')}</div>
    <div class="cafe-sign"><b>Claude Café</b><small></small></div>
    <p class="cafe-empty" hidden>${tr('ui.cafe.empty')}</p>
    <div class="cafe-card" hidden>
      <div class="cafe-portrait"></div>
      <div class="cafe-box">
        <div class="cafe-plate"><b class="cafe-name"></b><small class="cafe-role"></small></div>
        <button type="button" class="cafe-x" data-cafe="close" aria-label="${tr('ui.cafe.close')}"></button>
        <p class="cafe-doing" hidden></p>
        <p class="cafe-text"></p>
        <p class="cafe-task"></p>
        <ul class="cafe-todo"></ul>
        <div class="cafe-acts">
          <button type="button" data-cafe="approve" class="is-main">${tr('ui.cafe.approve')}</button>
          <button type="button" data-cafe="open">${tr('ui.cafe.open')}</button>
          <button type="button" data-cafe="swap">${tr('ui.cafe.swap')}</button>
        </div>
      </div>
    </div>
    <div class="cafe-log" hidden><div class="cafe-log-head"><b>${tr('ui.cafe.log')}</b><button type="button" data-cafe="log-close" aria-label="${tr('ui.cafe.close')}"></button></div><div class="cafe-log-list"></div></div>
    <div class="cafe-noart" hidden><b>${tr('ui.cafe.noArtTitle')}</b><span>${tr('ui.cafe.noArt')}</span><code>python -I scripts/vn-assets.py "&lt;${tr('ui.cafe.gameFolder')}&gt;"</code></div>`;
  $('stage').append(root);
  const q = (s) => root.querySelector(s);
  cv = q('.cafe-cv'); g = cv.getContext('2d'); cardEl = q('.cafe-card'); logEl = q('.cafe-log'); logList = q('.cafe-log-list');
  placeMenu = q('.cafe-places'); signEl = q('.cafe-sign'); noArtEl = q('.cafe-noart');
  q('[data-cafe="view"]').append(icon('image')); q('[data-cafe="log"]').append(icon('list')); q('[data-cafe="full"]').append(icon('maximize'));
  q('[data-cafe="close"]').append(icon('x')); q('[data-cafe="log-close"]').append(icon('x'));
  setView(view);

  cv.addEventListener('pointermove', (e) => { hover = actorAt(e); cv.style.cursor = hover ? 'pointer' : ''; });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('click', (e) => { placeMenu.hidden = true; const a = actorAt(e); if (a) pick(a); else closeCard(); });
  cv.addEventListener('dblclick', (e) => { const a = actorAt(e); if (a?.sid && sessions.has(a.sid)) openSession(a.sid); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cafe]');
    const pl = e.target.closest('[data-place]'); if (pl) { setView(pl.dataset.place); placeMenu.hidden = true; return; }
    if (!b) return;
    const act = b.dataset.cafe, a = actors.get(picked);
    if (act === 'view') placeMenu.hidden = !placeMenu.hidden;
    else if (act === 'log') toggleLog();
    else if (act === 'log-close') toggleLog(false);
    else if (act === 'full') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    else if (act === 'close') closeCard();
    else if (act === 'swap') swapRole(a);
    else if ((act === 'open' || act === 'approve') && a?.sid && sessions.has(a.sid)) openSession(a.sid);
  });
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, button, [contenteditable="true"], .drawer, #perm-stack')) return;
    if (e.key === 'Escape') { if (!logEl.hidden) toggleLog(false); else if (picked) closeCard(); else placeMenu.hidden = true; }
    else if (e.key.toLowerCase() === 'l') toggleLog();
  });
  loadArt();
}
