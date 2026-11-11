#!/usr/bin/env node
// Takes the README's still pictures of the demo office (docs/media/card.png, church.png); the moving one is
// scripts/record-gif.mjs.
//
//   npm run dev &                               # any running office will do
//   node scripts/readme-shots.mjs               # Playwright's Chromium
//   node scripts/readme-shots.mjs --channel msedge
//
// The pictures show the art built by scripts/vn-assets.py from your own copy of the game.
import { chromium } from '@playwright/test';
import path from 'node:path';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('url', 'http://127.0.0.1:4310'), LANG = arg('lang', 'en'), OUT = path.resolve(arg('out', 'docs/media'));
const browser = await chromium.launch({ channel: arg('channel', undefined), args: ['--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 })).newPage();
await page.addInitScript(() => { try { localStorage.setItem('office-sound', 'off'); localStorage.setItem('office-cafe-stage', 'street'); } catch { /* storage blocked */ } });
await page.goto(`${BASE}/?demo&debug&lang=${LANG}`, { waitUntil: 'load', timeout: 120_000 });
await page.waitForFunction(() => window.__office?.cafe?.ready, null, { timeout: 120_000 });
await page.waitForTimeout(16_000);   // (the demo gets going: people at work, someone waiting, someone resting)
const shot = (name) => page.screenshot({ path: path.join(OUT, name) });
// someone's card: the first project (the demo has its conversation, so its card has Claude's last answer)
const sid = await page.evaluate((name) => [...window.__office.sessions.values()].find((s) => s.name === name)?.id, arg('card', 'shop-api'));
await page.evaluate((id) => window.__office.cafe.pick(id), sid);
await page.waitForTimeout(6000);   // (the Live2D model loads, the line types out)
await shot('card.png');
await page.evaluate(() => window.__office.cafe.close());
await page.evaluate(() => window.__office.cafe.stage('church'));
await page.waitForTimeout(9000);
await shot('church.png');
await browser.close();
console.log(`Wrote card.png and church.png to ${OUT}`);
