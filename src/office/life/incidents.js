// What happens in the office when a session does something: the feed, the sounds, the toasts, what the agent says
// (the café shows it over their head), the group chat. Three failures in five minutes are an incident: a red banner.
import { state } from '../core/state.js';
import { $, nowMs } from '../core/env.js';
import { bubbleText } from '../ui/event-text.js';
import { dn, dropSub, sessions, spawnSub, subs, workers } from '../people/workers.js';
import { addFeed, toast } from '../ui/activity.js';
import { scheduleLog } from '../ui/session-drawer.js';
import { notifyWait } from '../ui/topbar.js';
import { onTurnDone, unseenDone } from './your-turn.js';
import { sfx } from '../audio/sfx.js';
import { chatEvent } from '../ui/group-chat.js';
import { t as tr } from '../../i18n/index.js';

export const fails = [];
function startIncident(s) {
  state.incidentUntil = state.sim + 25; $('stage-wrap').classList.add('is-incident'); sfx.play('siren');
  const b = $('incident'); b.textContent = `${tr('incident.banner')}${s ? ` · ${dn(s)}` : ''}`; b.hidden = false;
  for (const w of workers.values()) if (sessions.get(w.id)?.status === 'work') w.say('fail', tr('incident.bubble'), 'fail');
}
/** The banner comes down once the incident is over. */
export function updateIncident() {
  if (state.sim >= state.incidentUntil && !$('incident').hidden) { $('incident').hidden = true; $('stage-wrap').classList.remove('is-incident'); }
}
export function onEvent(e) {
  chatEvent(e);   // (the group chat: ui/group-chat.js)
  const s = sessions.get(e.sess);
  if (e.type === 'push') { sfx.play('deploy'); toast(tr('incident.pushed', { name: dn(s) || e.repo, branch: state.streamer ? 'git' : e.branch || 'git' })); }
  if (e.type === 'cired') { sfx.play('siren'); toast(tr('incident.ciRed', { label: e.label || tr('incident.ciRedDefault'), repo: e.repo }), 6500); }
  if (e.type === 'cigreen') toast(tr('incident.ciGreen', { label: e.label || '', repo: e.repo }));
  if (e.type === 'stop' && s) onTurnDone(s);
  if ((e.type === 'wait' || e.type === 'ask') && !e.agent) sfx.play('perm');
  if ((e.type === 'edit' || e.type === 'write') && !e.agent) sfx.play('key');
  if (e.type === 'deploy') { sfx.play('deploy'); if (s) toast(tr('incident.deployed', { name: dn(s), label: e.label })); }
  if (e.type === 'fail') { const now = nowMs(); fails.push(now); while (fails.length && now - fails[0] > 300e3) fails.shift(); if (fails.length >= 3 && state.sim >= state.incidentUntil) { fails.length = 0; startIncident(s); } }
  if (state.selectedId === e.sess) { unseenDone.delete(e.sess); scheduleLog(); }
  if (!e.quiet && e.type !== 'start') addFeed(e);
  const w = workers.get(e.sess);
  if (!w || !s) return;
  if (e.type === 'substart') { spawnSub(w, e.agent, e.label); return; }
  if (e.type === 'substop') { const sw = subs.get(e.agent); if (sw && e.desc) sw.desc = e.desc; dropSub(e.agent); return; }
  const kind = e.type === 'fail' ? 'fail' : e.type === 'wait' || e.type === 'ask' ? 'wait' : '';
  if (e.agent) {
    const sw = subs.get(e.agent) || spawnSub(w, e.agent, e.agentType || 'agent');
    if (e.desc) sw.desc = e.desc;
    sw.say(e.type, bubbleText(e), kind);
    return;
  }
  if (e.type === 'start' || e.type === 'end') return;
  if (e.type === 'wait' || e.type === 'ask') notifyWait(s, e);
  w.say(e.type, bubbleText(e), kind);
}

export function setup() {
  state.incidentUntil = 0;
}
