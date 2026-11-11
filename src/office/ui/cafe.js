// The office as a stage from the game: the only view. Every session is one of the game's pixel characters standing on
// one of its battle stages (ui/stage.js), at a holographic workstation of its own; they live by what their session does:
//   working        at their screen, typing in bursts (their attack move) as the edits come, thinking over a read
//   waiting on you hopping at the screen, a "!" over their head, a call for you
//   resting        a life of their own: up on a platform, a coffee at the cart, a chat with someone else resting, a nap,
//                  the odd sparring match
//   a commit, a deploy, green tests: their special move, confetti, a cheer from whoever is near, a word of victory;
//   a failure: knocked down, and someone comes over to see if they are all right
// A new session drops in from the sky; one that ends leaps away. Subagents are penguins at their boss's heels; a slime
// keeps the coffee cart and the odd customer drops by. Click someone: the visual-novel scene of them (their Live2D art
// over a painted background), what their AI is doing step by step, what it last said, and a line to write back to it.
// The art is the user's own copy of the game's (scripts/vn-assets.py builds it into public/assets/vn; git ignores it).
import { $, el, fmtClock, officeNow, reduceMotion, short } from '../core/env.js';
import { state } from '../core/state.js';
import { night } from '../life/daylight.js';
import { wx } from '../life/weather.js';
import { hash, sessions, subs, workers } from '../people/workers.js';
import { TYPE_ICON, icon } from './icons.js';
import { bubbleText } from './event-text.js';
import { openSession } from './session-drawer.js';
import { doingOf, fmtTok, fmtUsd, toast } from './activity.js';
import { puppet } from './puppet.js';
import { live2d } from './live2d.js';
import { cam, drawBack, frameCamera, loadStage, stage, stageThumb, surfaces, toScreen, toWorld } from './stage.js';
import { drawAir, drawCart, drawStation, drawVignette } from './stage-props.js';
import { sfx } from '../audio/sfx.js';
import { TOKEN } from '../net/live.js';
import { DEMO, demoLog } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const ART = `${BASE}/assets/vn`;
const CAST = ['mio', 'lilith', 'shigure', 'xao', 'mango', 'chika', 'police', 'mercenary', 'sparkle', 'believer'];   // who a newcomer plays, by preference
const GUESTS = ['thug', 'gangster', 'mafia', 'police', 'sparkle', 'believer', 'mercenary'];
const STAGES = ['street', 'church', 'arcade'];
const SCENE = { work: 'office', wait: 'office', rest: 'cafe', sub: 'office' };   // the painting behind someone's card
const CHEER = new Set(['commit', 'push', 'release', 'cigreen', 'testok', 'deploy']);
const OUCH = new Set(['fail', 'testfail', 'cired']);
const EMOTE = { read: '🔎', grep: '🔎', glob: '🔎', web: '🌐', fetch: '🌐', bash: '⚙️', test: '🧪', agent: '📋', substart: '📋', plan: '📝', mcp: '🔌', compact: '🗜️', prompt: '✉️' };
const CHAT_EMOTES = ['💬', '😆', '♪', '❓', '👍', '☕', '✨', '🙌'];
const WALK = 34, RUN = 82;   // stage pixels a second
const CAST_KEY = 'office-cafe-cast', STAGE_KEY = 'office-cafe-stage', LOG_MAX = 120;

export const cafe = { on: true };
let root, cv, g, cardEl, logEl, logList, stageMenu, signEl, noArtEl;
let art = null, artTried = false;
const sheets = new Map();          // sprite id -> Image
let castOf = {}, stageId = 'street';
const actors = new Map();          // key -> actor
const seen = new Map();            // agent key -> last line's signature
const log = [];
const parts = [];                  // particles (stage pixels): confetti, steam, dust, smoke
let lastT = 0, nextGuest = 25, hover = null, picked = null, firstLook = true, voiceAt = 0, dpr = 1;
const L = { stations: [], cart: 0, ground: null };

/* ---------- small helpers ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const any = (xs) => xs[Math.floor(Math.random() * xs.length)];
const keyOf = (wk) => (wk.sub ? `sub:${wk.id}` : `s:${wk.id}`);
const nameOf = (s) => (s ? s.title || s.name : '');
const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || '';
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
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
// a voice line from the game (the sound switch on, the window in front, one at a time and not too often)
function voice(a, kind, force = false) {
  const v = art?.voices?.[a?.sprite]?.[kind]; if (!v?.length || !sfx?.on || !document.hasFocus()) return;
  const now = performance.now();
  if (!force && (now - voiceAt < 7000 || now - (a.voiceAt || 0) < 20000)) return;
  voiceAt = now; a.voiceAt = now;
  const au = new Audio(`${ART}/${any(v)}`); au.volume = 0.45; au.play().catch(() => {});
}

/* ---------- actors ---------- */
// x, y: the feet, in stage pixels; surf: what they stand on ({ x0, x1, y }); z: the height of a hop; face 1 right, -1 left
function makeActor(key, sprite, x, surf, opt = {}) {
  const a = { key, sprite, x, y: surf.y, surf, z: 0, vz: 0, face: 1, anim: 'Idle', at: 0, once: null, path: [], leap: null, k: 1, alpha: 0, gone: false,
    kind: 'main', say: '', sayKind: '', sayUntil: 0, emo: '', emoUntil: 0, think: rnd(0.5, 2), act: null, desk: -1, ...opt };
  actors.set(key, a);
  return a;
}
const A = (a) => art?.sprites[a.sprite]?.anims || {};
function play(a, anim, then) {
  if (!A(a)[anim]) { then?.(); return; }
  a.anim = anim; a.at = 0; a.once = then || (() => {});
}
function loopAnim(a, anim) { if (a.once) return; if (a.anim !== anim) { a.anim = A(a)[anim] ? anim : 'Idle'; a.at = 0; } }
function hop(a, power = 120) { if (a.leap || a.z > 0 || a.vz) return; a.vz = power; a.once = null; a.anim = 'Rise'; a.at = 0; }
function say(a, text, kind = '', secs = 5) { a.say = text; a.sayKind = kind; a.sayUntil = performance.now() / 1000 + secs; }
function emote(a, e, secs = 2.5) { if (!a) return; a.emo = e; a.emoUntil = performance.now() / 1000 + secs; }
const clampX = (s, x) => Math.max(s.x0 + 8, Math.min(s.x1 - 8, x));
function walkTo(a, x, run = false, then = null) { a.path = [{ x: clampX(a.surf, x), run, then }]; }
// a jump from where they are to (x, on surf): an arc, a little higher than the way up; from the sky when y0 is given
function leapTo(a, x, surf, then = null, opt = {}) {
  const y1 = surf ? surf.y : opt.y1, x1 = surf ? clampX(surf, x) : x, y0 = opt.y0 ?? a.y;
  const h = opt.h ?? Math.max(16, (y0 - y1) * 0.55 + 18), dist = Math.hypot(x1 - a.x, y1 - y0);
  a.leap = { x0: a.x, y0, x1, y1, u: 0, T: opt.T ?? Math.min(1.1, 0.42 + dist / 340), h, then, surf };
  a.path = []; a.once = null; a.z = 0; a.vz = 0; a.anim = A(a).TakeOff ? 'TakeOff' : 'Rise'; a.at = 0;
  a.face = x1 > a.x + 1 ? 1 : x1 < a.x - 1 ? -1 : a.face;
}
// get to x on surf: walk if it is the same surface, else walk to the nearest point within a jump and jump
function goPlace(a, x, surf, run = false, then = null) {
  if (a.leap) return;
  if (surf === a.surf) { walkTo(a, x, run, then); return; }
  const tx = clampX(surf, x), reach = 120;
  if (Math.abs(tx - a.x) <= reach) { leapTo(a, tx, surf, then); return; }
  const stepX = clampX(a.surf, tx - Math.sign(tx - a.x) * reach * 0.7);
  walkTo(a, stepX, run, () => leapTo(a, tx, surf, then));
}
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
  a.alpha = Math.min(1, Math.max(0, a.alpha + (a.gone ? -dt * 2.5 : dt * 3)));
  if (a.leap) {   // in the air
    const l = a.leap; l.u = Math.min(1, l.u + dt / l.T);
    a.x = l.x0 + (l.x1 - l.x0) * l.u; a.y = l.y0 + (l.y1 - l.y0) * l.u - l.h * 4 * l.u * (1 - l.u);
    const want = l.u < 0.12 && A(a).TakeOff ? 'TakeOff' : l.u < 0.5 ? 'Rise' : 'Fall';
    if (a.anim !== want) { a.anim = A(a)[want] ? want : 'Idle'; a.at = 0; }
    if (l.u >= 1) {
      a.leap = null; a.y = l.y1; if (l.surf) a.surf = l.surf;
      dust(a.x, a.y, 5); play(a, 'Land', () => { a.once = null; }); l.then?.();
    }
    return;
  }
  if (a.vz || a.z > 0) {   // a hop on the spot
    a.vz -= 420 * dt; a.z = Math.max(0, a.z + a.vz * dt);
    if (a.z === 0 && a.vz < 0) { a.vz = 0; dust(a.x, a.y, 3); play(a, 'Land', () => { a.once = null; }); }
    else if (!a.once) { const want = a.vz > 0 ? 'Rise' : 'Fall'; if (a.anim !== want) { a.anim = want; a.at = 0; } }
    return;
  }
  const fr = frameOf(a);
  if (a.once && fr?.done) { const f = a.once; a.once = null; a.anim = 'Idle'; a.at = 0; f(); }
  if (a.once) return;
  const p = a.path[0];
  if (p) {
    const dx = p.x - a.x, d = Math.abs(dx), sp = (p.run ? RUN : WALK) * (a.kind === 'sub' ? 1.2 : 1);
    if (d < 1.5) { a.x = p.x; a.path.shift(); loopAnim(a, 'Idle'); p.then?.(); return; }
    a.face = dx > 0 ? 1 : -1;
    a.x += Math.sign(dx) * Math.min(d, sp * dt);
    loopAnim(a, p.run ? 'Run' : 'Walk');
    if (p.run && Math.random() < dt * 8) dust(a.x - a.face * 4, a.y, 1);
    return;
  }
  loopAnim(a, 'Idle');
}

/* ---------- where things are on the stage ---------- */
function layout() {
  const ground = stage.data?.ground; if (!ground) return;
  L.ground = surfaces()[0]; L.platforms = surfaces().slice(1);
  L.cart = ground.x1 - 40;
  const n = Math.max(3, [...actors.values()].filter((a) => a.kind === 'main' && !a.gone).length);
  const x0 = ground.x0 + 26, x1 = L.cart - 46, gap = Math.min(76, (x1 - x0) / n);
  L.stations = Array.from({ length: n }, (_, i) => x0 + gap * i + Math.max(0, (x1 - x0 - gap * n) / 2));
}
const seatOf = (a) => L.stations[a.desk] ?? L.ground.x0 + 30;
const atSeat = (a) => a.surf === L.ground && Math.abs(a.x - seatOf(a)) < 2 && !a.leap;
const restingNear = (a, r) => [...actors.values()].filter((o) => o !== a && o.kind === 'main' && !o.gone && !o.leaving && o.surf === a.surf && Math.abs(o.x - a.x) < r);

/* ---------- what each one does (four times a second) ---------- */
function brainMain(a, s, now) {
  if (!s || a.leap || a.once) return;
  a.think -= 0.25; if (a.think > 0) return;
  if (s.status !== 'rest' && a.act) endAct(a);
  if (s.status === 'wait') {
    if (!atSeat(a)) { if (!a.path.length) goPlace(a, seatOf(a), L.ground, true, () => { a.face = 1; }); a.think = 0.5; return; }
    a.face = 1; emote(a, '!', 2); if (!reduceMotion) hop(a, 110);
    a.think = 1.8; return;
  }
  if (s.status === 'work') {
    if (!atSeat(a)) { if (!a.path.length) goPlace(a, seatOf(a), L.ground, false, () => { a.face = 1; }); a.think = 0.6; return; }
    a.face = 1;
    // typing in bursts while the edits come; a coffee now and then on a long run
    const since = (Date.now() - (s.lastAt || 0)) / 1000;
    if (since < 25 && Math.random() < 0.3 && !reduceMotion) play(a, 'Attack1');
    else if (since > 40 && Math.random() < 0.3) emote(a, '…', 2.5);
    if (now > (a.coffeeAt ||= now + rnd(90, 200))) { a.coffeeAt = now + rnd(120, 260); coffeeRun(a, () => goPlace(a, seatOf(a), L.ground, false, () => { a.face = 1; })); }
    a.think = rnd(2, 4); return;
  }
  // resting: a life of their own
  if (a.act && now < a.act.until && !a.act.done) { tickAct(a, now); a.think = 1; return; }
  if (a.act) endAct(a);
  startAct(a, now);
  a.think = 1;
}
function coffeeRun(a, then) {
  goPlace(a, L.cart - 22 - rnd(0, 8), L.ground, false, () => {
    a.face = 1; order(); emote(a, '☕', 3);
    setTimeout(() => { if (!a.gone) then?.(); }, 3500);
  });
}
function startAct(a, now) {
  const others = [...actors.values()].filter((o) => o !== a && o.kind === 'main' && !o.gone && !o.leaving && !o.act?.partner && sessions.get(o.sid)?.status === 'rest' && !o.leap);
  const free = L.platforms.filter((p) => [...actors.values()].filter((o) => o.surf === p).length < 2);
  const choices = [['wander', 2], ['nap', 1.5], ['coffee', 2]];
  if (free.length) choices.push(['perch', 3]);
  if (others.length) choices.push(['chat', 3.5], ['spar', reduceMotion ? 0 : 0.5]);
  let r = Math.random() * choices.reduce((t, c) => t + c[1], 0), kind = 'wander';
  for (const [k, w] of choices) { if ((r -= w) <= 0) { kind = k; break; } }
  const act = a.act = { kind, until: now + rnd(14, 30) };
  if (kind === 'perch') { const p = any(free); goPlace(a, rnd(p.x0 + 12, p.x1 - 12), p, false, () => { a.face = a.x < (L.ground.x0 + L.ground.x1) / 2 ? 1 : -1; emote(a, any(['♪', '✨', '😌']), 3); }); act.until = now + rnd(20, 45); }
  else if (kind === 'coffee') { act.until = now + 30; coffeeRun(a, () => { act.done = true; }); }
  else if (kind === 'nap') { if (a.surf !== L.ground || Math.random() < 0.5) goPlace(a, rnd(L.ground.x0 + 20, L.cart - 50), L.ground); act.until = now + rnd(16, 30); }
  else if (kind === 'chat' || kind === 'spar') {
    const o = any(others), side = o.x < a.x ? 1 : -1;
    act.partner = o.key; act.until = now + (kind === 'spar' ? 9 : rnd(10, 18));
    if (o.act) endAct(o);
    o.act = { kind, partner: a.key, until: act.until, follower: true };
    goPlace(a, o.x + side * 18, o.surf, false, () => { a.face = -side; o.face = side; o.path = []; act.met = true; o.act.met = true; });
  } else { goPlace(a, rnd(L.ground.x0 + 14, L.ground.x1 - 14), L.ground, Math.random() < 0.2); act.until = now + rnd(6, 12); }
}
function tickAct(a, now) {
  const act = a.act;
  if (act.kind === 'nap' && !a.path.length && !a.leap) emote(a, 'Zz', 2);
  if ((act.kind === 'chat' || act.kind === 'spar') && act.met && !act.follower) {
    const o = actors.get(act.partner); if (!o || o.gone || o.act?.partner !== a.key) { act.done = true; return; }
    if (act.kind === 'chat') { const who = Math.random() < 0.5 ? a : o; emote(who, any(CHAT_EMOTES), 1.8); if (Math.random() < 0.15) hop(who, 90); }
    else {
      const [hit, got] = Math.random() < 0.5 ? [a, o] : [o, a];
      play(hit, 'Attack1'); setTimeout(() => { if (!got.leap) { play(got, 'GroundHurt'); emote(got, '💢', 1.5); } }, 260);
      if (now > act.until - 2) { emote(a, '😆', 2.5); emote(o, '😆', 2.5); }
    }
  }
  if (act.kind === 'perch' && Math.random() < 0.08) emote(a, any(['♪', '✨', '😌', '☕']), 2.5);
}
function endAct(a) {
  const act = a.act; a.act = null;
  if (act?.partner) { const o = actors.get(act.partner); if (o?.act?.partner === a.key) o.act = null; }
}
function brainSub(a, boss) {
  if (a.leap || a.once) return;
  if (!boss || boss.gone || boss.leaving) { if (!a.leaving) leave(a); return; }
  const team = [...actors.values()].filter((x) => x.kind === 'sub' && x.boss === boss.key && !x.gone), i = team.indexOf(a);
  const tx = boss.x - boss.face * (15 + i * 12);
  if (boss.leap) return;
  if (a.surf !== boss.surf) { goPlace(a, tx, boss.surf, true); return; }
  if (Math.abs(a.x - tx) > 8) { if (!a.path.length || Math.abs(a.path[0].x - tx) > 8) walkTo(a, tx, Math.abs(a.x - tx) > 50); }
  else if (!a.path.length) a.face = boss.x > a.x ? 1 : -1;
}
function order() {
  const b = actors.get('barista'); if (!b) return;
  b.face = -1; play(b, 'Attack1'); steam(L.cart + 10, L.ground.y - 36, 6);
  setTimeout(() => say(b, tr('ui.cafe.coffee'), '', 2.2), 500);
}
// leaving: a run-up and a leap off the top of the stage
function leave(a) {
  a.leaving = true; a.say = ''; a.act = null;
  const go = () => leapTo(a, a.x + (a.face || 1) * 70, null, () => { a.gone = true; }, { y1: (stage.data?.ground?.y ?? 300) - 420, h: 0, T: 0.7 });
  if (a.leap) setTimeout(go, 800); else if (A(a).TakeOff) play(a, 'TakeOff', go); else go();
}
// arriving: a drop from the sky, a landing in a puff of dust
function arrive(a, x, surf) {
  a.x = x; a.y = surf.y - 380; a.alpha = 1;
  leapTo(a, x, surf, () => { emote(a, '👋', 2.5); voice(a, 'BattleStart'); }, { y0: surf.y - 380, h: 0, T: 0.75 });
}
// a new line from someone: how they take it
function react(a, line) {
  if (!a) return;
  const s = sessions.get(a.sid);
  if (a.kind === 'sub' || s?.status !== 'rest' || line.kind) say(a, short(line.text, 38), line.kind, line.kind === 'wait' ? 7 : 4.5);
  if (EMOTE[line.type]) emote(a, EMOTE[line.type], 2.2);
  if (reduceMotion || a.leap) return;
  if (picked === a.key && (CHEER.has(line.type) || OUCH.has(line.type))) doll?.mood?.(CHEER.has(line.type) ? 'happy' : 'hurt');
  if (CHEER.has(line.type)) {
    play(a, 'Special'); confetti(a.x, a.y - 30); voice(a, 'Victory', true);
    if (line.type === 'push' || line.type === 'deploy' || line.type === 'release') cam.shake = 0.6;
    for (const o of restingNear(a, 130)) { emote(o, any(['🎉', '👏', '✨']), 2.5); setTimeout(() => hop(o, 110), rnd(100, 500)); }
  } else if (OUCH.has(line.type) || line.kind === 'fail') {
    play(a, 'GroundHurt', () => { a.think = 1; }); smoke(a.x, a.y - 20); voice(a, 'Damage');
    const o = restingNear(a, 400).find((x) => sessions.get(x.sid)?.status === 'rest' && !x.act?.partner);
    if (o) { if (o.act) endAct(o); o.act = { kind: 'help', until: performance.now() / 1000 + 8 }; goPlace(o, a.x + (o.x < a.x ? -16 : 16), a.surf, true, () => { o.face = a.x > o.x ? 1 : -1; emote(o, '💦', 3); }); }
  } else if (line.kind === 'wait') { emote(a, '!', 4); voice(a, 'Ready'); }
  else if ((line.type === 'edit' || line.type === 'write') && a.kind === 'main' && atSeat(a)) play(a, 'Attack1');
  else if (a.kind === 'sub' && Math.random() < 0.3) hop(a, 90);
}

/* ---------- particles (stage pixels) ---------- */
function dust(x, y, n) { if (reduceMotion) return; for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-4, 4), y, vx: rnd(-16, 16), vy: rnd(-12, -4), life: rnd(0.3, 0.6), c: 'rgba(230,220,200,.75)', s: 1 }); }
function steam(x, y, n) { if (reduceMotion) return; for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-2, 2), y, vx: rnd(-3, 3), vy: rnd(-14, -8), life: rnd(1, 1.8), c: 'rgba(255,255,255,.55)', s: 2 }); }
function smoke(x, y) { if (reduceMotion) return; for (let i = 0; i < 10; i++) parts.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-8, 8), vy: rnd(-16, -6), life: rnd(0.6, 1.1), c: 'rgba(150,150,170,.7)', s: 3 }); }
function confetti(x, y) { if (reduceMotion) return; const C = ['#FF5FA8', '#FFD23F', '#3DDC84', '#7AB8FF', '#FFFFFF']; for (let i = 0; i < 30; i++) parts.push({ x, y, vx: rnd(-55, 55), vy: rnd(-95, -30), life: rnd(0.9, 1.6), c: C[i % C.length], s: 2, g: 120 }); }
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; if (p.life <= 0) parts.splice(i, 1); }
}

/* ---------- keeping the cast in step with the office ---------- */
function sync(now) {
  const live = new Set();
  const mains = [...workers.values()].filter((wk) => sessions.has(wk.id));
  const used = new Set([...actors.values()].filter((a) => a.kind === 'main' && !a.gone).map((a) => a.desk));
  for (const wk of mains) {
    const k = keyOf(wk), s = sessions.get(wk.id); live.add(k);
    let a = actors.get(k);
    if (a && a.gone) { actors.delete(k); a = null; }
    if (!a) {
      let d = 0; while (used.has(d)) d++; used.add(d);
      layout();
      a = makeActor(k, roleOf(s), L.stations[d] ?? L.ground.x0 + 30, L.ground, { sid: wk.id, desk: d });
      if (firstLook) { a.alpha = 1; a.face = 1; if (s.status === 'rest') a.think = rnd(0.2, 3); }
      else { arrive(a, a.x, L.ground); say(a, tr('ui.cafe.hello', { proj: projOf(s) || nameOf(s) }), '', 5); }
    }
    a.sprite = roleOf(s); a.name = short(nameOf(s), 22);
  }
  for (const wk of subs.values()) {
    const boss = wk.parent && actors.get(keyOf(wk.parent)); if (!boss) continue;
    const k = keyOf(wk); live.add(k);
    if (!actors.has(k)) {
      const a = makeActor(k, 'penguin', boss.x - 16, boss.surf, { kind: 'sub', boss: boss.key, k: 0.85, sid: boss.sid });
      a.name = short(wk.desc || wk.type || '', 22);
      if (firstLook) a.alpha = 1; else { arrive(a, boss.x - boss.face * 16, boss.surf); emote(boss, '📋', 2.5); }
    }
  }
  for (const a of actors.values()) {
    if ((a.kind === 'main' || a.kind === 'sub') && !live.has(a.key) && !a.leaving) {
      if (a.kind === 'sub') { const b = actors.get(a.boss); if (b && !b.leaving) emote(b, '👍', 2); emote(a, '✓', 1.5); setTimeout(() => leave(a), 900); a.leaving = true; }
      else leave(a);
    }
  }
  if (!actors.has('barista') && art.sprites.popsicle) { const b = makeActor('barista', 'popsicle', L.cart + 8, L.ground, { kind: 'barista', k: 0.72 }); b.face = -1; b.alpha = 1; }
  // a customer now and then: dropped in, a coffee, a look round, and away
  if (now > nextGuest && [...actors.values()].filter((a) => a.kind === 'guest').length < 1) {
    nextGuest = now + rnd(45, 110);
    const taken = new Set([...actors.values()].map((a) => a.sprite)), pick = GUESTS.filter((x) => art.sprites[x] && !taken.has(x));
    if (pick.length) {
      const gst = makeActor(`guest:${now}`, any(pick), L.ground.x0 + 14, L.ground, { kind: 'guest', k: 0.95 });
      arrive(gst, L.ground.x0 + 14, L.ground);
      setTimeout(() => goPlace(gst, L.cart - 30, L.ground, false, () => {
        gst.face = 1; order();
        setTimeout(() => { emote(gst, '☕', 3); goPlace(gst, rnd(L.ground.x0 + 30, L.cart - 70), L.ground, false, () => { gst.face = Math.random() < 0.5 ? 1 : -1; setTimeout(() => leave(gst), rnd(6000, 14000)); }); }, 3500);
      }), 1200);
    }
  }
  for (const [k, a] of actors) if (a.gone && a.alpha <= 0) actors.delete(k);
}
// what everyone said since the last look
function listen() {
  for (const wk of [...workers.values(), ...subs.values()]) {
    const said = wk.lastSay; if (!said?.text) continue;
    const k = keyOf(wk), sig = `${said.type}|${said.text}|${said.kind}|${said.at}`;
    if (seen.get(k) === sig) continue;
    const first = !seen.has(k); seen.set(k, sig);
    if (first && firstLook) continue;
    const s = sessions.get(wk.sub ? wk.parent?.id : wk.id);
    const line = { key: k, sid: s?.id, who: wk.sub ? short(wk.desc || wk.type || tr('ui.cafe.helper'), 30) : short(nameOf(s), 30), sub: !!wk.sub, sprite: actors.get(k)?.sprite,
      text: said.text, type: said.type, kind: said.kind || (s?.status === 'wait' && !wk.sub ? 'wait' : ''), at: Date.now() };
    log.push(line); if (log.length > LOG_MAX) log.shift();
    if (!logEl.hidden) addLogRow(line, true);
    react(actors.get(k), line);
    if (picked && (picked === k || actors.get(picked)?.sid === s?.id)) paintCard();
  }
}

/* ---------- drawing ---------- */
function drawActor(a) {
  const sp = art.sprites[a.sprite], im = sheet(a.sprite), fr = frameOf(a); if (!sp || !im || !fr) return;
  const sx = (fr.f % sp.cols) * sp.cw, sy = Math.floor(fr.f / sp.cols) * sp.ch, k = a.k;
  g.globalAlpha = a.alpha;
  // a shadow on what they stand on, smaller the higher they are
  const sy0 = a.leap ? (a.leap.surf?.y ?? a.y) : a.surf.y, off = Math.max(0, sy0 - a.y + a.z);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(a.x, sy0, 9 * k * Math.max(0.35, 1 - off / 90), 2.2 * k, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(Math.round(a.x), Math.round(a.y - a.z)); g.scale(a.face * k, k);
  if (hover === a || picked === a.key) g.filter = 'brightness(1.3) drop-shadow(0 0 2px #fff)';
  g.drawImage(im, sx, sy, sp.cw, sp.ch, -sp.px, -sp.py, sp.cw, sp.ch);
  g.restore(); g.globalAlpha = 1;
  const tall = (sp.tall || 54) * k;
  a.top = a.y - a.z - tall;
  a.box = { x0: a.x - 12 * k, x1: a.x + 12 * k, y0: a.top, y1: a.y - a.z };
}
// names, lines and emotes at the screen's own resolution, over the pixels; a label that would land on another moves up
function drawLabels(now) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const taken = [], u = dpr;
  const place = (x, y, ww, hh) => {
    for (let k = 0; k < 8; k++) { if (!taken.some((r) => x < r.x + r.w && x + ww > r.x && y < r.y + r.h && y + hh > r.y)) break; y -= hh + 3 * u; }
    taken.push({ x, y, w: ww, h: hh }); return y;
  };
  for (const a of [...actors.values()].sort((p, q) => q.y - p.y)) {
    if (a.alpha < 0.3 || a.top == null) continue;
    const [X, Y] = toScreen(a.x, a.top);
    const st = a.kind === 'main' ? sessions.get(a.sid)?.status : null, talking = a.say && now < a.sayUntil;
    let y = Y - 4 * u;
    if (a.emo && now < a.emoUntil) {   // the emote right over the head, bobbing
      const bob = reduceMotion ? 0 : Math.sin(now * 6) * 1.5 * u, wait = a.emo === '!', sz = 22 * u;
      g.fillStyle = wait ? '#FFB020' : 'rgba(255,255,255,.95)'; g.strokeStyle = 'rgba(30,20,40,.9)'; g.lineWidth = 1.5 * u;
      g.beginPath(); g.roundRect(X + 6 * u, y - sz - 2 * u + bob, sz, sz, 7 * u); g.fill(); g.stroke();
      g.font = `${wait ? 900 : 400} ${wait ? 14 * u : 13 * u}px system-ui, "Segoe UI Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = wait ? '#2A1600' : '#2A1E36'; g.fillText(a.emo, X + 6 * u + sz / 2, y - sz / 2 - 1 * u + bob);
    }
    if (a.kind === 'main' && a.name && (st !== 'rest' || talking || hover === a || picked === a.key)) {
      g.font = `700 ${11 * u}px system-ui, sans-serif`; const name = short(a.name, 20), tw = g.measureText(name).width + 18 * u, th = 16 * u;
      const ty = place(X - tw / 2, y - th, tw, th);
      g.fillStyle = 'rgba(20,14,30,.82)'; g.beginPath(); g.roundRect(X - tw / 2, ty, tw, th, 8 * u); g.fill();
      g.fillStyle = st === 'wait' ? '#FFB020' : st === 'work' ? '#3DDC84' : '#9AA4B2'; g.beginPath(); g.arc(X - tw / 2 + 8 * u, ty + th / 2, 3 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(name, X - tw / 2 + 14 * u, ty + th / 2 + 0.5 * u); y = ty - 4 * u;
    }
    if (talking) {
      g.font = `600 ${12 * u}px system-ui, sans-serif`; const txt = a.say, tw = Math.min(260 * u, g.measureText(txt).width) + 16 * u, bh = 22 * u;
      const by = place(X - tw / 2, y - bh - 6 * u, tw, bh + 6 * u);
      const col = a.sayKind === 'wait' ? '#FFB020' : a.sayKind === 'fail' ? '#E04E5E' : '#FFFFFF';
      g.fillStyle = col; g.strokeStyle = '#2B1D2F'; g.lineWidth = 2 * u;
      g.beginPath(); g.roundRect(X - tw / 2, by, tw, bh, 6 * u); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(X - 5 * u, by + bh); g.lineTo(X, by + bh + 6 * u); g.lineTo(X + 5 * u, by + bh); g.fill();
      g.fillStyle = col === '#FFFFFF' ? '#1E1626' : '#1E1200'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, X, by + bh / 2 + 0.5 * u, 260 * u);
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

/** Draws one frame of the stage (called by the render loop: the only view). */
export function drawCafe() {
  if (!cv || !art || !stage.ready) return;
  const now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
  const b = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wd = Math.round(b.width * dpr), Hd = Math.round(b.height * dpr); if (!Wd || !Hd) return;
  if (cv.width !== Wd || cv.height !== Hd) { cv.width = Wd; cv.height = Hd; }
  layout();
  if (now - (drawCafe.tick || 0) > 0.25) {
    drawCafe.tick = now;
    listen(); sync(now);
    for (const a of actors.values()) { if (a.leaving) continue; if (a.kind === 'main') brainMain(a, sessions.get(a.sid), now); else if (a.kind === 'sub') brainSub(a, actors.get(a.boss)); }
    firstLook = false;
    paintSign();
    if (picked) paintCard(false);
  }
  for (const a of actors.values()) stepActor(a, dt);
  stepParts(dt);
  const sel = actors.get(picked) || null;
  cam.focus = sel && !sel.gone ? { x: sel.x, y: sel.y } : null;
  frameCamera(Wd, Hd, reduceMotion ? 0 : now, dt);
  drawBack(g, now);
  g.setTransform(cam.k, 0, 0, cam.k, cam.ox, cam.oy); g.imageSmoothingEnabled = false;
  // the workstations, the cart, then the people (the higher up, the farther back)
  for (const a of actors.values()) {
    if (a.kind !== 'main' || a.gone || a.desk < 0) continue;
    drawStation(g, a.desk, seatOf(a), L.ground.y, sessions.get(a.sid)?.status, now, reduceMotion);
  }
  drawCart(g, L.cart, L.ground.y);
  for (const a of [...actors.values()].sort((p, q) => (p.surf === L.ground) - (q.surf === L.ground) || p.y - q.y)) drawActor(a);
  for (const p of parts) { g.fillStyle = p.c; g.globalAlpha = Math.min(1, p.life * 2); g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  g.globalAlpha = 1;
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(Wd, Hd);
  drawAir(g, { x0, y0, x1, y1 }, now, { rain: wx.rain, still: reduceMotion });
  g.setTransform(1, 0, 0, 1, 0, 0); drawVignette(g, Wd, Hd, night);
  drawLabels(now);
}

/* ---------- the sign, the card, the backlog ---------- */
function paintSign() {
  const list = [...sessions.values()], work = list.filter((s) => s.status === 'work').length, wait = list.filter((s) => s.status === 'wait').length;
  signEl.querySelector('b').textContent = tr(`ui.cafe.stage.${stageId}`);
  signEl.querySelector('small').textContent = [hm(officeNow()), tr('ui.cafe.count', { n: list.length }), work ? tr('ui.cafe.working', { n: work }) : '', wait ? tr('ui.cafe.waitingN', { n: wait }) : ''].filter(Boolean).join(' · ');
  root.querySelector('.cafe-empty').hidden = list.length > 0;
}
function pick(a) {
  if (!a || a.kind === 'barista' || a.kind === 'guest') { if (a) { say(a, tr(a.kind === 'barista' ? 'ui.cafe.baristaHi' : 'ui.cafe.guestHi'), '', 3); hop(a, 110); } return; }
  picked = a.key; paintCard(true); hop(a, 100); voice(a, 'Selection', true);
}
// what the session's AI last wrote to you: the server keeps its last answer; the demo (and an older answer) from its log
const replies = new Map();   // session id -> { text, at }
let doll = null;             // the portrait being animated
const plain = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
async function loadReply(sid) {
  const was = replies.get(sid); if (was && Date.now() - was.at < 8000) return;
  replies.set(sid, { text: was?.text || '', at: Date.now() });
  let items = [];
  if (DEMO) items = demoLog.get(sid) || [];
  else { try { const r = await fetch(`/api/log?id=${encodeURIComponent(sid)}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`); items = (await r.json()).items || []; } catch { return; } }
  const last = [...items].reverse().find((x) => x.role === 'claude' && x.text);
  const text = last ? short(plain(last.text), 420) : '';
  if (text !== (was?.text || '')) { replies.set(sid, { text, at: Date.now() }); if (actors.get(picked)?.sid === sid) paintCard(); }
}
const ago = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
function scenePic(kind) {
  const P = art?.places?.[SCENE[kind] || 'office'] || Object.values(art?.places || {})[0]; if (!P) return '';
  const h = officeNow().getHours(), light = wx.rain > 0.3 && P.rain ? 'rain' : night ? (h >= 18 && h < 21 && P.eve ? 'eve' : P.night ? 'night' : 'day') : h >= 16 && P.dusk ? 'dusk' : 'day';
  return `${ART}/${P[light] || P.day || Object.values(P)[0]}`;
}
function paintCard(fresh = false) {
  const a = actors.get(picked); if (!a) { closeCard(); return; }
  const s = sessions.get(a.sid), sub = a.kind === 'sub', cast = sub ? null : art.cast[a.sprite];
  cardEl.hidden = false;
  const kind = sub ? 'sub' : s?.status || 'rest';
  if (!fresh && cardEl.dataset.kind !== kind) { doll?.mood?.(kind); cardEl.querySelector('.cafe-vnbg').style.backgroundImage = `url("${scenePic(kind)}")`; }
  cardEl.dataset.kind = kind;
  const pic = cardEl.querySelector('.cafe-portrait');
  if (fresh) {
    cardEl.querySelector('.cafe-vnbg').style.backgroundImage = `url("${scenePic(kind)}")`;
    doll?.stop(); doll = null; pic.replaceChildren();
    const l2d = !sub && art.live2d?.[a.sprite];
    if (l2d) {
      const c = document.createElement('canvas'); pic.append(c); pic.dataset.kind = 'live2d';
      const mine = a.key, mood = s?.status || 'normal';
      live2d(c, `${ART}/${l2d}`, { mood }).then((d) => { if (picked === mine && pic.contains(c)) { doll?.stop(); doll = d; } else d.stop(); })
        .catch((err) => { console.warn('live2d', err); if (picked === mine && pic.contains(c) && cast) { c.remove(); const cc = document.createElement('canvas'); pic.append(cc); pic.dataset.kind = 'art'; const im = new Image(); im.src = `${ART}/${cast.src}`; doll = puppet(cc, im, cast.head, reduceMotion); } });
    } else if (cast) {
      const im = new Image(); im.src = `${ART}/${cast.src}`;
      const c = document.createElement('canvas'); pic.append(c); pic.dataset.kind = 'art';
      doll = puppet(c, im, cast.head, reduceMotion);
    } else { const c = document.createElement('canvas'), sp = art.sprites[a.sprite], ims = sheet(a.sprite); c.width = sp.cw; c.height = sp.ch; if (ims) c.getContext('2d').drawImage(ims, 0, 0, sp.cw, sp.ch, 0, 0, sp.cw, sp.ch); pic.append(c); pic.dataset.kind = 'pixel'; }
    pic.classList.remove('is-in'); void pic.offsetWidth; pic.classList.add('is-in');
    const input = cardEl.querySelector('.cafe-reply input'); input.value = ''; input.placeholder = tr('ui.cafe.replyTo', { name: short(nameOf(s), 24) });
    cardEl.querySelector('.cafe-reply').hidden = !s;
  }
  const wk = sub ? subs.get(a.key.slice(4)) : workers.get(a.sid), said = wk?.lastSay;
  cardEl.querySelector('.cafe-name').textContent = sub ? a.name || tr('ui.cafe.helper') : nameOf(s);
  cardEl.querySelector('.cafe-role').textContent = sub ? tr('ui.cafe.helperOf', { name: nameOf(s) }) : cast?.name || a.sprite;
  const chip = cardEl.querySelector('.cafe-chip'); chip.textContent = tr(`ui.cafe.status.${sub ? 'work' : s?.status || 'rest'}`); chip.dataset.st = sub ? 'work' : s?.status || 'rest';
  // the meters: how full its context is, what it has cost, how long it has been at it, what it has done
  const m = cardEl.querySelector('.cafe-meters'), u = s?.usage, pct = u?.ctxMax ? Math.round((u.ctx / u.ctxMax) * 100) : null;
  const mkey = `${pct}|${u?.cost}|${s?.counts?.read}|${s?.counts?.edit}|${s?.counts?.cmd}|${Math.floor((Date.now() - (s?.taskStart || 0)) / 1000)}|${s?.status}`;
  if (m.dataset.key !== mkey && s && !sub) {
    m.dataset.key = mkey;
    const bar = el('div', 'cafe-ctx'), fill = el('i'); fill.style.width = `${pct ?? 0}%`; fill.dataset.hot = String(pct >= 80); bar.append(fill);
    const ctx = el('div', 'cafe-m'); ctx.append(el('small', '', tr('ui.cafe.ctx')), bar, el('b', '', pct == null ? '–' : `${pct}%${u?.ctx ? ` · ${fmtTok(u.ctx)}` : ''}`));
    const cost = el('div', 'cafe-m'); cost.append(el('small', '', tr('ui.cafe.cost')), el('b', '', u ? fmtUsd(u.cost) : '–'));
    const time = el('div', 'cafe-m'); time.append(el('small', '', tr(s.status === 'rest' ? 'ui.cafe.restFor' : 'ui.cafe.onIt')), el('b', '', s.status === 'rest' ? ago(s.lastAt || Date.now()) : s.taskStart ? fmtClock((Date.now() - s.taskStart) / 1000) : '–'));
    const did = el('div', 'cafe-m cafe-did'); did.append(el('small', '', tr('ui.cafe.did')), el('b', '', `📄 ${s.counts?.read || 0} · ✏️ ${s.counts?.edit || 0} · ⌘ ${s.counts?.cmd || 0}`));
    m.replaceChildren(ctx, cost, time, did);
  }
  m.hidden = sub || !s;
  // its last steps, newest first
  const steps = cardEl.querySelector('.cafe-steps');
  const evs = (state.feed || []).filter((e) => e.sess === s?.id && (sub ? e.agent === a.key.slice(4) : !e.agent) && e.type !== 'start').slice(-4).reverse();
  const skey = evs.map((e) => e.id || e.ts).join('|');
  if (steps.dataset.key !== skey) {
    const fresh2 = steps.dataset.key && evs[0] && !steps.dataset.key.startsWith(String(evs[0].id || evs[0].ts));
    steps.dataset.key = skey;
    steps.replaceChildren(...evs.map((e, i) => { const li = el('li', i === 0 && fresh2 ? 'is-new' : ''); li.append(icon(TYPE_ICON[e.type] || 'sparkle'), el('span', '', short(bubbleText(e) || e.label || e.type, 70)), el('time', '', ago(e.ts || Date.now()))); return li; }));
  }
  steps.hidden = !evs.length;
  // the dialogue: what its AI last said to you (else what it is doing)
  const reply = sub ? '' : s?.lastReply || replies.get(a.sid)?.text || '';
  const text = reply || said?.text || (s ? doingOf(s).text : '') || tr('ui.cafe.quiet'), t = cardEl.querySelector('.cafe-text');
  if (t.dataset.full !== text) { t.dataset.full = text; t.textContent = ''; t.dataset.at = String(performance.now()); }
  const n = reduceMotion ? text.length : Math.min(text.length, Math.floor((performance.now() - Number(t.dataset.at)) / 16));
  t.textContent = text.slice(0, n); doll?.talk(n < text.length);
  if (n < text.length) requestAnimationFrame(() => picked === a.key && paintCard(false));
  cardEl.querySelector('.cafe-task').textContent = !sub && s?.lastPrompt ? `「${short(s.lastPrompt, 140)}」` : '';
  const todo = cardEl.querySelector('.cafe-todo'); const items = sub ? [] : (s?.todos || []).slice(0, 4);
  const tkey = items.map((x) => x.status + x.text).join('|');
  if (todo.dataset.key !== tkey) { todo.dataset.key = tkey; todo.replaceChildren(...items.map((x) => el('li', `is-${x.status}`, x.text))); }
  cardEl.querySelector('[data-cafe="approve"]').hidden = sub || s?.status !== 'wait';
  cardEl.querySelector('[data-cafe="swap"]').hidden = sub;
  if (s && !sub && !s.lastReply && fresh) loadReply(s.id);
}
function closeCard() { picked = null; cardEl.hidden = true; doll?.stop(); doll = null; }
// a line to the session's AI from the card: into its conversation (a new turn), or, while it works, between two steps
async function sendTo(a, text) {
  const s = sessions.get(a?.sid); if (!s || !text) return;
  const name = nameOf(s);
  if (DEMO) { toast(tr('ui.cafe.sentDemo', { name })); emote(a, '✉️', 3); hop(a, 100); return; }
  let sid = null;
  try { const r = await (await fetch(`/api/tasks${tq()}`)).json(); sid = r.sessions?.find((x) => x.id === s.id)?.sid || null; } catch { /* the office is offline */ }
  if (!sid) { toast(tr('ui.cafe.cantSend', { name }), 6000); return; }
  const post = (path, body) => fetch(`${path}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
  let r = await post('/api/tasks', { sid, text, chat: true });
  if (r?.code === 'busy' || r?.code === 'macBusy') r = await post('/api/tasks/steer', { sid, text });
  if (r?.ok) { toast(tr('ui.cafe.sent', { name })); emote(a, '✉️', 3); hop(a, 100); return; }
  toast(r?.code === 'notAllowed' ? tr('chat.to.notAllowed') : r?.message || tr('drawer.unreachable'), 7000);
}
function swapRole(a) {
  const s = sessions.get(a?.sid); if (!s || a.kind !== 'main') return;
  const have = CAST.filter((c) => art.sprites[c]), i = have.indexOf(roleOf(s));
  const taken = new Set([...sessions.values()].filter((x) => x !== s).map((x) => castOf[x.name]));
  for (let k = 1; k <= have.length; k++) { const c = have[(i + k) % have.length]; if (!taken.has(c) || k === have.length) { castOf[s.name] = c; break; } }
  saveCast(); a.sprite = castOf[s.name]; hop(a, 140); confetti(a.x, a.y - 30); voice(a, 'Selection', true); paintCard(true);
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
// another stage: everyone is put back on its floor (people on a platform that is not there any more drop down)
async function setStage(id) {
  if (!art?.stages?.[id]) return;
  stageId = id; try { localStorage.setItem(STAGE_KEY, id); } catch { /* storage blocked */ }
  for (const b of stageMenu.querySelectorAll('[data-stage]')) b.setAttribute('aria-pressed', String(b.dataset.stage === id));
  stage.ready = false;
  if (!(await loadStage(art, id))) return;
  layout();
  for (const a of actors.values()) {
    a.surf = L.ground; a.path = []; a.leap = null; a.act = null; a.z = 0; a.vz = 0;
    a.x = a.kind === 'main' ? seatOf(a) : a.kind === 'barista' ? L.cart + 8 : clampX(L.ground, a.x); a.y = L.ground.y;
    if (a.kind === 'main' || a.kind === 'sub') arrive(a, a.x, L.ground);
  }
  paintSign();
}
function actorAt(e) {
  const b = cv.getBoundingClientRect(), [x, y] = toWorld((e.clientX - b.left) * dpr, (e.clientY - b.top) * dpr);
  let best = null;
  for (const a of actors.values()) if (a.box && a.alpha > 0.5 && x >= a.box.x0 - 3 && x <= a.box.x1 + 3 && y >= a.box.y0 && y <= a.box.y1 + 2 && (!best || a.y > best.y)) best = a;
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
    if (!art?.sprites || !Object.keys(art.sprites).length || !art.stages || !Object.keys(art.stages).length) throw new Error('no art');
    art.cast ||= {}; art.places ||= {};
    for (const id of Object.keys(art.sprites)) { sheet(id); sheets.get(id).addEventListener('load', () => measure(id), { once: true }); }
    for (const b of stageMenu.querySelectorAll('[data-stage]')) { const ok = !!art.stages[b.dataset.stage]; b.hidden = !ok; if (ok) b.querySelector('i').style.backgroundImage = `url("${stageThumb(art, b.dataset.stage)}")`; }
    if (!art.stages[stageId]) stageId = Object.keys(art.stages)[0];
    await setStage(stageId);
    noArtEl.hidden = true;
  } catch (err) {
    console.warn('café art', err);
    art = null; noArtEl.hidden = false;
  }
}

export function setup() {
  try { castOf = JSON.parse(localStorage.getItem(CAST_KEY) || '{}') || {}; const v = localStorage.getItem(STAGE_KEY); if (STAGES.includes(v)) stageId = v; } catch { /* storage blocked */ }
  document.body.classList.add('is-cafe');
  root = el('section', 'cafe'); root.setAttribute('aria-label', tr('ui.cafe.label'));
  root.innerHTML = `
    <canvas class="cafe-cv"></canvas>
    <div class="cafe-top">
      <button type="button" class="cafe-btn" data-cafe="view" title="${tr('ui.cafe.viewTitle')}"></button>
      <button type="button" class="cafe-btn" data-cafe="log" title="${tr('ui.cafe.log')} (L)"></button>
      <button type="button" class="cafe-btn" data-cafe="full" title="${tr('ui.cafe.fullscreen')}"></button>
    </div>
    <div class="cafe-places" hidden role="menu">${STAGES.map((p) => `<button type="button" role="menuitemradio" data-stage="${p}" aria-pressed="false"><i></i><span>${tr(`ui.cafe.stage.${p}`)}</span></button>`).join('')}</div>
    <div class="cafe-sign"><b></b><small></small></div>
    <p class="cafe-empty" hidden>${tr('ui.cafe.empty')}</p>
    <div class="cafe-card" hidden>
      <div class="cafe-vnbg"></div>
      <div class="cafe-portrait"></div>
      <div class="cafe-box">
        <div class="cafe-plate"><b class="cafe-name"></b><small class="cafe-role"></small><span class="cafe-chip"></span></div>
        <button type="button" class="cafe-x" data-cafe="close" aria-label="${tr('ui.cafe.close')}"></button>
        <div class="cafe-meters"></div>
        <ol class="cafe-steps"></ol>
        <p class="cafe-text"></p>
        <p class="cafe-task"></p>
        <ul class="cafe-todo"></ul>
        <form class="cafe-reply" autocomplete="off"><input type="text" maxlength="2000" enterkeyhint="send"><button type="submit" aria-label="${tr('ui.cafe.send')}"></button></form>
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
  stageMenu = q('.cafe-places'); signEl = q('.cafe-sign'); noArtEl = q('.cafe-noart');
  q('[data-cafe="view"]').append(icon('image')); q('[data-cafe="log"]').append(icon('list')); q('[data-cafe="full"]').append(icon('maximize'));
  q('[data-cafe="close"]').append(icon('x')); q('[data-cafe="log-close"]').append(icon('x')); q('.cafe-reply button').append(icon('send'));

  cv.addEventListener('pointermove', (e) => { hover = actorAt(e); cv.style.cursor = hover ? 'pointer' : ''; });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('click', (e) => { stageMenu.hidden = true; const a = actorAt(e); if (a) pick(a); else closeCard(); });
  cv.addEventListener('dblclick', (e) => { const a = actorAt(e); if (a?.sid && sessions.has(a.sid)) openSession(a.sid); });
  q('.cafe-reply').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = q('.cafe-reply input'), text = input.value.trim(); if (!text) return;
    input.value = ''; sendTo(actors.get(picked), text);
  });
  q('.cafe-reply input').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.target.blur(); closeCard(); } });
  // a click on the painted background (not the box) closes the card
  q('.cafe-vnbg').addEventListener('click', closeCard);
  root.addEventListener('click', (e) => {
    const st = e.target.closest('[data-stage]'); if (st) { setStage(st.dataset.stage); stageMenu.hidden = true; return; }
    const b = e.target.closest('[data-cafe]'); if (!b) return;
    const act = b.dataset.cafe, a = actors.get(picked);
    if (act === 'view') stageMenu.hidden = !stageMenu.hidden;
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
    if (e.key === 'Escape') { if (!logEl.hidden) toggleLog(false); else if (picked) closeCard(); else stageMenu.hidden = true; }
    else if (e.key.toLowerCase() === 'l') toggleLog();
  });
  // the tests' and the README pictures' hooks (?debug): who is on the stage, open someone's card, another stage
  if (window.__office) Object.assign(window.__office, { cafe: {
    get ready() { return !!(art && stage.ready && actors.size); },
    actors: () => [...actors.values()].map((a) => ({ key: a.key, kind: a.kind, sid: a.sid, x: a.x, y: a.y })),
    pick: (sid) => { const a = [...actors.values()].find((x) => x.kind === 'main' && x.sid === sid); if (a) pick(a); return !!a; },
    close: () => closeCard(),
    stage: (id) => setStage(id),
  } });
  loadArt();
}
