// The office's clock in the top bar, and day or night: by the clock (night from 18:00 to 6:00), or picked in
// Settings → Time of day.
import { state } from '../core/state.js';
import { $, hhmm, officeNow } from '../core/env.js';
import { wxChip } from './weather.js';
import { renderSessionHead } from '../ui/session-drawer.js';

export let night = false;
export const isNightHour = () => { const h = officeNow().getHours(); return h >= 18 || h < 6; };
export function setNight(on) {
  night = on;
  $('stage-wrap')?.classList.toggle('is-day', !on);
  $('btn-night')?.setAttribute('aria-pressed', String(on));
  const m = state.nightManual ? (on ? 'night' : 'day') : 'auto';
  for (const b of document.querySelectorAll('[data-time]')) b.setAttribute('aria-pressed', String(b.dataset.time === m));
}
export function setTimeMode(m) { if (m === 'auto') { state.nightManual = false; setNight(isNightHour()); } else { state.nightManual = true; setNight(m === 'night'); } }

export function setup() {
  state.nightManual = false;
  setNight(isNightHour());
  const tick = () => {
    const v = hhmm(officeNow().getTime()) + wxChip(), c = $('clock'); if (c && c.textContent !== v) c.textContent = v;   // (changes once a minute)
    if (!state.nightManual && night !== isNightHour()) setNight(isNightHour());
    if (state.selectedId) renderSessionHead();
  };
  tick(); setInterval(tick, 1000);
}
