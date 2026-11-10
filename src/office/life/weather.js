// Real weather outside (Open-Meteo).
import { $, hhmm, officeNow } from '../core/env.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- real weather outside: Open-Meteo (free, no key). Off until you pick a city, then every 15 minutes.
   The café's window shows it (rain on the glass: ui/cafe.js); the clock in the top bar says it.
   Idea from cubicle-crew (MIT, weather.js). ---------- */
// City names are proper nouns and stay as written, except Ho Chi Minh City, whose "TP." (city) prefix is translated.
const WX_CITIES = { hn: ['Hà Nội', 21.03, 105.85], hcm: [null, 10.78, 106.7], dn: ['Đà Nẵng', 16.05, 108.2], hue: ['Huế', 16.46, 107.59],
  hp: ['Hải Phòng', 20.86, 106.68], ct: ['Cần Thơ', 10.03, 105.78], dl: ['Đà Lạt', 11.94, 108.44], nt: ['Nha Trang', 12.24, 109.19] };
const cityName = (k) => WX_CITIES[k][0] ?? tr('life.weather.' + k);
const WX_TEXT = (c) => tr('life.weather.' + (c === 0 ? 'clear' : c <= 2 ? 'partly' : c === 3 ? 'cloudy' : c <= 48 ? 'fog' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'snow' : c <= 82 ? 'showers' : 'storm'));
const WX_ICON = (c) => (c === 0 ? '☀️' : c <= 2 ? '🌤' : c === 3 ? '☁️' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '❄️' : c <= 82 ? '🌦' : '⛈');
export const wx = { city: '', code: null, temp: null, cloud: 0, rain: 0, storm: false, fog: false, at: 0, flashAt: 0, flash: 0 };
export const wxChip = () => (wx.city && wx.code != null ? ` · ${WX_ICON(wx.code)} ${Math.round(wx.temp)}°` : '');
async function fetchWeather() {
  const c = WX_CITIES[wx.city]; if (!c) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c[1]}&longitude=${c[2]}&current=temperature_2m,weather_code,precipitation,cloud_cover&timezone=auto`);
    const cur = (await r.json()).current; if (!cur) return;
    const code = cur.weather_code;
    Object.assign(wx, { code, temp: cur.temperature_2m, cloud: (cur.cloud_cover ?? 0) / 100, at: Date.now(), storm: code >= 95, fog: code === 45 || code === 48,
      rain: code >= 95 ? 1 : (code >= 80 && code <= 82) ? 0.55 + (code - 80) * 0.2 : (code >= 61 && code <= 67) ? 0.35 + (code - 61) * 0.12 : (code >= 51 && code <= 57) ? 0.18 : 0 });
    applyWeather();
  } catch { $('wx-now').textContent = tr('life.weather.failed'); }
}
export function applyWeather() {
  for (const b of document.querySelectorAll('[data-wx]')) b.setAttribute('aria-pressed', String(b.dataset.wx === (wx.city || '')));
  if (wx.city && wx.code != null) $('wx-now').textContent = `${cityName(wx.city)} · ${Math.round(wx.temp)}° · ${WX_TEXT(wx.code)}`;
  else if (!wx.city) $('wx-now').textContent = tr('life.weather.off');
  $('clock').textContent = hhmm(officeNow().getTime()) + wxChip();
}
export function setup() {
  try { wx.city = localStorage.getItem('office-wx') || ''; } catch { /* storage blocked */ }
  for (const b of document.querySelectorAll('[data-wx]')) b.setAttribute('aria-pressed', String(b.dataset.wx === wx.city));
  // Settings → Real weather: one chip per city, "Off" first
  $('wx-cities').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wx]'); if (!b) return;
    wx.city = b.dataset.wx; wx.code = null;
    for (const x of document.querySelectorAll('[data-wx]')) x.setAttribute('aria-pressed', String(x === b));
    try { localStorage.setItem('office-wx', wx.city); } catch { /* storage blocked */ }
    if (wx.city) { $('wx-now').textContent = tr('life.weather.loading'); fetchWeather(); } else applyWeather();
  });
  if (wx.city) fetchWeather();
  setInterval(() => { if (wx.city && document.visibilityState === 'visible') fetchWeather(); }, 15 * 60e3);
}
