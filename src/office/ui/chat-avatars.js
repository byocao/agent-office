// Round photos for the group chat (group-chat-view.js): each session's face is the portrait of the character it plays
// in the café (ui/cafe.js). Without one (you, or before the art has loaded), a coloured circle with their initials, the
// way Zalo shows someone without a photo.
import { hash } from '../people/workers.js';

const INITIAL_BG = ['#4F8EF7', '#F2994A', '#27AE60', '#9B51E0', '#EB5757', '#2D9CDB', '#F2C94C', '#219653'];
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);

/** A round avatar for { key, name, face }: the face when there is one, the initials otherwise. size in px. */
export function avatar(p, size = 40) {
  const el = document.createElement('span'); el.className = 'zc-av'; el.style.width = el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  if (p?.key === '__claude') { el.textContent = '✳'; el.style.background = 'linear-gradient(135deg, #D97757, #E8A07A)'; el.style.fontSize = `${Math.round(size * 0.5)}px`; return el; }   // (Claude itself: a new conversation's answers)
  el.style.background = p?.key === 'me' ? 'linear-gradient(135deg, #2B3A55, #4A6491)' : INITIAL_BG[hash(p?.name || '') % INITIAL_BG.length];
  el.style.fontSize = `${Math.round(size * 0.38)}px`;
  if (p?.face && p.key !== 'me') { el.style.backgroundImage = `url("${p.face}")`; el.style.backgroundSize = 'cover'; return el; }
  el.textContent = initials(p?.name);
  return el;
}
