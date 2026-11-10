// The live connection's sessions: one comes in or changes, one leaves.
import { state } from '../core/state.js';
import { $, short } from '../core/env.js';
import { addWorker, dn, dropSub, removeAgent, sessions, spawnSub, subs, workers } from '../people/workers.js';
import { queueUi } from '../ui/activity.js';
import { closeSession } from '../ui/session-drawer.js';
import { t as tr } from '../../i18n/index.js';

export let TOKEN;
export function setConn(on) { const c = $('conn'); c.dataset.state = on ? 'on' : 'off'; c.lastElementChild.textContent = tr(on ? 'activity.live.on' : 'activity.live.off'); }
/** A session's project: its git repository, else its folder. */
export const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || tr('activity.live.otherProject');

export function upsertSession(s) {
  sessions.set(s.id, s);
  let w = workers.get(s.id);
  if (!w) w = addWorker(s);
  w.setName(short(dn(s), 26));
  const live = new Set((s.subs || []).map((x) => x.id));
  for (const [aid, sw] of subs) if (sw.parent === w && !live.has(aid)) dropSub(aid);
  for (const x of s.subs || []) { const sw = subs.get(x.id) || spawnSub(w, x.id, x.type, x); if (sw && x.desc) sw.desc = x.desc; }
  w.setTeam([...subs.values()].filter((x) => x.parent === w).length);
  w.setAcct(s.acct);
  w.setStuck(s.stuck);
  queueUi();
}
export function removeSession(id) {
  sessions.delete(id); removeAgent(id);
  if (state.selectedId === id) closeSession();
  queueUi();
}

export function setup() {
  TOKEN = new URLSearchParams(location.search).get('k') || '';
  state.connectedOnce = false;
}
