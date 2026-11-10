// The frame loop: the café, at most 30 frames a second (8 when the window is in the background, 2 under a phone's
// full-screen sheet), and the bits of office life that tick with it.
import { state } from './state.js';
import { replay } from './env.js';
import { updateIncident } from '../life/incidents.js';
import { REPLAY_MOTION, replayTick } from '../replay/replay.js';
import { drawCafe } from '../ui/cafe.js';

let lastFrame = 0, last = 0;
function frameGap() {
  if (state.covered) return 1000 / 2;   // (a phone's full-screen sheet over it: nobody sees the café)
  if (!document.hasFocus()) return 1000 / 8;
  return 1000 / 30;
}
export function loop(now = 0) {
  requestAnimationFrame(loop);
  if (now - lastFrame < frameGap() - 2) return;
  lastFrame = now;
  const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
  replayTick();
  state.sim += dt * (replay.on && replay.playing ? REPLAY_MOTION : 1);
  updateIncident();
  drawCafe();
}

export function setup() {
  state.sim = 0;
  requestAnimationFrame(loop);
}
