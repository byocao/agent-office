// The game-style HUD over the stage (a computer's screen; a phone keeps its own layout): a fighter card for each session
// along the bottom (their face, how full their context is as the big number, what they are doing), the latest moves as
// a feed down the right, and two buttons that slide out the full session list and the full activity log.
import { $, el, short } from '../core/env.js';
import { state } from '../core/state.js';
import { dn, sessions } from '../people/workers.js';
import { TYPE_ICON, icon } from './icons.js';
import { bubbleText } from './event-text.js';
import { doingOf } from './activity.js';
import { openSession } from './session-drawer.js';
import { faceUrl, pickSession } from './cafe.js';
import { t as tr } from '../../i18n/index.js';

let cardsEl, feedEl, lastFeed = 0;
const cards = new Map();   // session id -> card element
const ORDER = { wait: 0, work: 1, rest: 2 };

function card(s) {
  const b = el('button', 'hud-card'); b.type = 'button'; b.dataset.id = s.id;
  b.innerHTML = '<span class="hud-face"></span><span class="hud-badge">!</span><span class="hud-num"><b></b><i>%</i></span><span class="hud-lbl"></span><span class="hud-name"></span><span class="hud-doing"></span><span class="hud-bar"><i></i></span>';
  b.addEventListener('click', () => { if (!pickSession(s.id)) openSession(s.id); });
  b.addEventListener('dblclick', () => openSession(s.id));
  return b;
}
function paintCards() {
  const list = [...sessions.values()].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || (a.desk ?? 0) - (b.desk ?? 0));
  for (const [id, c] of cards) if (!sessions.has(id)) { c.remove(); cards.delete(id); }
  list.forEach((s, i) => {
    let c = cards.get(s.id); if (!c) { c = card(s); cards.set(s.id, c); }
    if (cardsEl.children[i] !== c) cardsEl.insertBefore(c, cardsEl.children[i] || null);
    const u = s.usage, pct = u?.ctxMax ? Math.round((u.ctx / u.ctxMax) * 100) : null, face = faceUrl(s);
    const key = `${s.status}|${pct}|${dn(s)}|${face}|${doingOf(s).text}`;
    if (c.dataset.key === key) return;
    c.dataset.key = key; c.dataset.st = s.status; c.dataset.hot = String(pct >= 80);
    c.querySelector('.hud-face').style.backgroundImage = face ? `url("${face}")` : '';
    c.querySelector('.hud-num b').textContent = pct == null ? '--' : String(pct).padStart(3, '0');
    c.querySelector('.hud-lbl').textContent = tr(`ui.hud.st.${s.status}`);
    c.querySelector('.hud-name').textContent = short(dn(s), 22);
    const d = doingOf(s), dEl = c.querySelector('.hud-doing'); dEl.replaceChildren(icon(d.ic || 'sparkle'), document.createTextNode(short(d.text, 40)));
    c.querySelector('.hud-bar i').style.width = `${pct ?? 0}%`;
    c.title = `${dn(s)} · ${tr('ui.hud.ctx')} ${pct ?? '--'}%`;
  });
  $('stage-wrap').classList.toggle('hud-empty', !list.length);
}
// the latest moves, newest at the top, each gone after a while
function paintFeed() {
  const feed = state.feed || []; if (!feed.length) return;
  const fresh = feed.filter((e) => (e.id || e.ts) > lastFeed && !e.quiet && e.type !== 'start' && !e.agent);
  lastFeed = Math.max(lastFeed, ...feed.map((e) => e.id || e.ts || 0));
  for (const e of fresh.slice(-3)) {
    const s = sessions.get(e.sess), row = el('button', `hud-ev hud-ev--${e.type === 'fail' || e.type === 'testfail' ? 'bad' : e.type === 'wait' || e.type === 'ask' ? 'wait' : ['commit', 'push', 'deploy', 'testok', 'cigreen', 'release'].includes(e.type) ? 'good' : 'n'}`);
    row.type = 'button';
    const f = el('span', 'hud-ev-face'), face = faceUrl(s); if (face) f.style.backgroundImage = `url("${face}")`;
    row.append(f, el('b', '', short(dn(s) || e.name || '', 16)), icon(TYPE_ICON[e.type] || 'sparkle'), el('span', '', short(bubbleText(e) || e.label || e.type, 44)));
    row.addEventListener('click', () => { if (e.sess && !pickSession(e.sess)) openSession(e.sess); });
    feedEl.prepend(row);
    setTimeout(() => { row.classList.add('is-out'); setTimeout(() => row.remove(), 500); }, 9000);
  }
  while (feedEl.children.length > 5) feedEl.lastChild.remove();
}
// the full session list (left) and activity log (right), slid out over the stage
function togglePanel(side, on) {
  const cls = `hud-${side}-open`, now = on ?? !document.body.classList.contains(cls);
  document.body.classList.toggle(cls, now);
  for (const b of document.querySelectorAll(`[data-hud-panel="${side}"]`)) b.setAttribute('aria-pressed', String(now));
}

export function setup() {
  const wrap = $('stage-wrap');
  cardsEl = el('div', 'hud-cards'); cardsEl.setAttribute('aria-label', tr('ui.hud.cards'));
  feedEl = el('div', 'hud-feed'); feedEl.setAttribute('aria-live', 'polite');
  wrap.append(cardsEl, feedEl);
  // the two panel buttons, with the stage's own round buttons
  const top = document.querySelector('.cafe-top');
  for (const [side, ic, label] of [['right', 'timeline', tr('ui.hud.activity')], ['left', 'users', tr('ui.hud.sessions')]]) {   // (each put first: the list ends up first)
    const b = el('button', 'cafe-btn'); b.type = 'button'; b.dataset.hudPanel = side; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false');
    b.append(icon(ic)); b.addEventListener('click', () => togglePanel(side));
    top?.prepend(b);
  }
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.body.classList.contains('hud-left-open') || document.body.classList.contains('hud-right-open')) { togglePanel('left', false); togglePanel('right', false); }
  });
  // a session picked from the list closes the list
  $('rail-list')?.addEventListener('click', () => setTimeout(() => togglePanel('left', false), 0));
  lastFeed = Math.max(0, ...(state.feed || []).map((e) => e.id || e.ts || 0));
  setInterval(() => { paintCards(); paintFeed(); }, 500);
}
