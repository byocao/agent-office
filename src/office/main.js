// Boots the office. Every module's setup() runs once, in this order: the basics, the people's state, the panels, the
// café, the live connection and the frame loop.
import { state } from './core/state.js';
import * as coreEnv from './core/env.js';
import * as uiEventText from './ui/event-text.js';
import * as uiIcons from './ui/icons.js';
import * as peopleWorkers from './people/workers.js';
import * as lifeDaylight from './life/daylight.js';
import * as lifeWeather from './life/weather.js';
import * as uiCafe from './ui/cafe.js';
import * as uiActivity from './ui/activity.js';
import * as uiSessionDrawer from './ui/session-drawer.js';
import * as uiHud from './ui/hud.js';
import * as uiMacDrawer from './ui/mac-drawer.js';
import * as uiBurn from './ui/burn.js';
import * as uiTopbar from './ui/topbar.js';
import * as uiSettings from './ui/settings.js';
import * as uiWrapped from './ui/wrapped.js';
import * as uiGroupChat from './ui/group-chat.js';
import * as uiGroupChatView from './ui/group-chat-view.js';
import * as uiStuck from './ui/stuck.js';
import * as uiCacheWords from './ui/cache-words.js';
import * as netLive from './net/live.js';
import * as lifeYourTurn from './life/your-turn.js';
import * as lifeIncidents from './life/incidents.js';
import * as audioSfx from './audio/sfx.js';
import * as uiPermissions from './ui/permissions.js';
import * as uiPhone from './ui/phone.js';
import * as uiNotify from './ui/notify.js';
import * as demoDemo from './demo/demo.js';
import * as replayReplay from './replay/replay.js';
import * as replayTimeline from './replay/timeline.js';
import * as coreLoop from './core/loop.js';

const MODULES = [
  coreEnv,
  uiEventText,
  uiIcons,
  peopleWorkers,
  lifeDaylight,
  lifeWeather,
  uiCafe,
  uiActivity,
  uiSessionDrawer,
  uiHud,
  uiMacDrawer,
  uiBurn,
  uiTopbar,
  uiSettings,
  uiWrapped,
  uiGroupChat,
  uiGroupChatView,
  uiStuck,
  uiCacheWords,
  netLive,
  lifeYourTurn,
  lifeIncidents,
  audioSfx,
  uiPermissions,
  uiPhone,
  uiNotify,
  demoDemo,
  replayReplay,
  replayTimeline,
  coreLoop,
];

// the tests' hooks (?debug): the office's state, and ways to make things happen in it (the group chat adds its own)
function debugHooks() {
  if (!new URLSearchParams(location.search).has('debug')) return;
  window.__office = { get workers() { return peopleWorkers.workers; }, get sessions() { return peopleWorkers.sessions; }, get subs() { return peopleWorkers.subs; },
    upsert: (x) => netLive.upsertSession(x), emit: (m) => demoDemo.applyMsg(m), get wx() { return lifeWeather.wx; }, select: (id) => uiSessionDrawer.openSession(id),
    get feed() { return state.feed; }, pauseDemo: () => { demoDemo.demoTimers.forEach(clearTimeout); demoDemo.demoTimers.clear(); } };
}

let started = false;
export function startOffice() {
  if (started) return;
  started = true;
  debugHooks();
  for (const m of MODULES) m.setup();
  uiSettings.syncToggles();
  uiMacDrawer.startMac();
}
