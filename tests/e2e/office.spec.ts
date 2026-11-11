import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// Collects uncaught errors and console errors while the page runs.
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  return errors;
}

test('the café starts in demo mode without errors', { tag: '@smoke' }, async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo');
  await expect(page.locator('#stage canvas.cafe-cv')).toBeVisible();
  await expect(page.locator('#demo-chip')).toBeVisible();
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});

test('settings: three tabs, time of day, language', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.click('#btn-look');
  await expect(page.locator('#pop-look')).toBeVisible();
  await expect(page.locator('[data-st-tab]')).toHaveCount(3);
  await page.click('[data-time="night"]');
  await expect(page.locator('[data-time="night"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-time="auto"]');
  await page.click('[data-st-tab="display"]');
  await expect(page.locator('#st-panel-display [data-lang]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pop-look')).toBeHidden();
  expect(errors).toEqual([]);
});

test('panels open and close', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 60_000 });   // (a busy machine takes ~17 s)
  await page.click('#btn-look');
  await expect(page.locator('#pop-look')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.click('#btn-mac');
  await expect(page.locator('#dr-mac')).toBeVisible();
  await page.click('#dr-mac [data-close]');
  await expect(page.locator('#dr-mac')).toBeHidden();
  await page.click('[data-hud-panel="right"]');   // (the activity log slides out over the stage)
  await page.click('#tl-open');
  await expect(page.locator('#tl')).toBeVisible();
  await page.click('#tl-close');
  expect(errors).toEqual([]);
});

test('hooks are accepted only from this machine and the page needs a token from elsewhere', { tag: '@smoke' }, async ({ request }) => {
  const r = await request.post('/event', { data: { hook_event_name: 'Ping' } });
  expect(r.status()).toBe(200);
  const health = await request.get('/health');
  expect(await health.text()).toBe('ok');
});

test('a session opens its drawer from the list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo');
  const row = page.locator('#rail-list .ri').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await page.click('[data-hud-panel="left"]');   // (the session list slides out over the stage)
  await row.click();
  await expect(page.locator('#dr-session')).toBeVisible();
  await page.click('#tab-subs');
  await page.click('#tab-act');
  await page.click('#dr-session [data-close]');
  await expect(page.locator('#dr-session')).toBeHidden();
  expect(errors).toEqual([]);
});

test('English by default, another language on request', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#btn-look')).toContainText('Settings');
  await page.goto('/?demo&lang=vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('#btn-look')).toContainText('Cài đặt');
});

test('the weekly recap draws its card', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.click('[data-hud-panel="right"]');
  await page.click('#wrap-open');
  await expect(page.locator('#wrap-modal')).toBeVisible();
  await expect(page.locator('#wrap-note')).not.toContainText('Adding up');
  // the card is drawn: its middle is not the empty canvas
  const painted = await page.evaluate(() => {
    const c = document.getElementById('wrap-canvas') as HTMLCanvasElement;
    return c.getContext('2d')!.getImageData(540, 800, 1, 1).data[3] > 0;
  });
  expect(painted).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#wrap-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the group chat: people post, a poll, @ someone and they answer, a reply, recall, reactions, stickers, a reminder, the unread count', async ({ page }) => {
  test.setTimeout(420_000);   // (many steps, and a headless browser draws the office slowly)
  const errors = watchErrors(page);
  // (list mode: the office keeps going behind the chat, drawn once a second; a headless browser draws it slowly)
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-lite', 'on'); if (!sessionStorage.getItem('e2e-chat')) { localStorage.removeItem('office-chat-demo'); sessionStorage.setItem('e2e-chat', '1'); } } catch { /* private mode */ } });   // (cleared once: not again on the reload below)
  await page.goto('/?demo&debug');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 60_000 });
  type Eng = { poll: (from: string, q: string, o: string[]) => void, remind: (from: string, t: string, at: number, rep: string) => void };
  type Chat = { chat: { msgs: { kind: string, from: string, text: string }[] }, chatSay: (from: string, text: string, o?: object) => void, chatEngine: () => Eng,
    sessions: Map<string, { id: string, name: string, title?: string }>, pauseDemo: () => void };
  await page.waitForFunction(() => !!(window as unknown as { __office?: { chat?: unknown } }).__office?.chat);
  await page.evaluate(() => (window as unknown as { __office: Chat }).__office.pauseDemo());
  await page.click('#btn-chat');
  const zc = page.locator('#zchat');
  await expect(zc).toBeVisible();
  await expect(zc.locator('.zc-title b')).toHaveText('Agent Office team');
  await expect(zc.locator('.zc-sub')).toContainText('members');
  // a poll (pinned): you vote
  await page.evaluate(() => (window as unknown as { __office: Chat }).__office.chatEngine().poll('reception', 'Lunch?', ['Phở', 'Bún bò', 'Cơm tấm']));
  const poll = zc.locator('.zc-poll').last();
  await expect(poll).toBeVisible({ timeout: 15_000 });
  await expect(zc.locator('.zc-pin')).toBeVisible();
  await poll.locator('.zc-poll-o').nth(1).click();
  await expect(poll.locator('.zc-poll-o').nth(1)).toHaveClass(/is-mine/);
  // a reminder card: you're going
  await page.evaluate(() => (window as unknown as { __office: Chat }).__office.chatEngine().remind('hr', 'Stand-up', Date.now() + 3600e3, 'week'));
  const rem = zc.locator('.zc-remind').last();
  await expect(rem).toBeVisible({ timeout: 15_000 });
  await rem.locator('.zc-rm-b.is-yes').click();
  await expect(rem.locator('.zc-rm-b.is-yes')).toHaveClass(/is-on/);
  // @ someone: they answer with what they're doing, quoting you
  const name = await page.evaluate(() => { const s = [...(window as unknown as { __office: Chat }).__office.sessions.values()][0]; return s.title || s.name; });
  await zc.locator('.zc-in').fill(`@${name} how is it going?`);
  await zc.locator('.zc-in').press('Enter');
  await expect(zc.locator('.zc-row.is-mine').last()).toContainText('how is it going?');
  await expect(zc.locator('.zc-at').last()).toHaveText(`@${name}`);
  await expect(zc.locator('.zc-row:not(.is-mine) .zc-quote').last()).toContainText('how is it going?', { timeout: 15_000 });
  // a reaction and a reply on their bubble
  const bub = zc.locator('.zc-row:not(.is-mine) .zc-bub').last();
  await bub.hover();
  await bub.locator('.zc-pick-b', { hasText: '😆' }).click();
  await expect(bub.locator('.zc-rx')).toContainText('😆');
  await bub.hover();
  await bub.locator('.zc-tool').first().click();
  await expect(zc.locator('.zc-reply')).toBeVisible();
  await zc.locator('.zc-in').fill('thanks');
  await zc.locator('.zc-in').press('Enter');
  await expect(zc.locator('.zc-row.is-mine').last().locator('.zc-quote')).toBeVisible();
  // recall your own
  const mine = zc.locator('.zc-row.is-mine .zc-bub').last();
  await mine.hover();
  await mine.locator('.zc-tool').last().click();
  await expect(zc.locator('.zc-row.is-mine').last()).toContainText('unsent');
  // a sticker (the toolbar's first button), an emoji into the text (😊 by the input), a 👍 shown big
  await zc.locator('.zc-toolbar .zc-ib').first().click();
  await zc.locator('.zc-stk').first().click();
  await expect(zc.locator('.zc-row.is-mine .zc-sticker').last()).toBeVisible();
  await zc.locator('.zc-bar .zc-ib.zc-pc').click();
  await zc.locator('.zc-emo').first().click();
  await expect(zc.locator('.zc-in')).toHaveValue(/\S/);
  await zc.locator('.zc-in').fill('');
  await zc.locator('.zc-like-send').click();
  await expect(zc.locator('.zc-row.is-mine .zc-bigemo').last()).toHaveText('👍');
  // shut: a new message counts as unread, with a card by the button; open again: "New messages" where you stopped
  await page.click('#btn-chat');
  await expect(zc).toBeHidden();
  await page.evaluate(() => (window as unknown as { __office: Chat }).__office.chatSay('reception', 'Hello from reception', { now: true }));
  await expect(page.locator('#chat-badge')).toBeVisible();
  await expect(page.locator('#zc-peek')).toContainText('Hello from reception');
  await page.click('#btn-chat');
  await expect(zc.locator('.zc-newline')).toBeVisible();
  // kept on this device (the demo has no server): the conversation is there after a reload
  const said = 'Hello from reception';
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __office?: { chat?: unknown } }).__office?.chat);
  expect(await page.evaluate((t) => (window as unknown as { __office: Chat }).__office.chat.msgs.some((m) => m.text === t), said)).toBe(true);
  expect(errors).toEqual([]);
});

test('the group chat in the office: one conversation for every page, kept by the server; the work comes from the hooks', async ({ page, context, request }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  // (both pages in list mode: two whole 3D offices are too slow side by side in a headless browser)
  await context.addInitScript(() => { try { localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } });
  // (the button works once the office's code has started: click until the window is there)
  const openChat = (p: Page) => expect(async () => { if (!(await p.locator('#zchat').isVisible())) await p.click('#btn-chat'); await expect(p.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await page.goto('/');
  await openChat(page);
  const zc = page.locator('#zchat');
  await zc.locator('.zc-in').fill('hello from the Mac');
  await zc.locator('.zc-in').press('Enter');
  await expect(zc.locator('.zc-row.is-mine').last()).toContainText('hello from the Mac');
  // a second page (a phone, say) sees the same conversation, and what it writes shows on the first
  const other = await context.newPage();
  await other.goto('/');
  await openChat(other);
  await expect(other.locator('#zchat .zc-row.is-mine', { hasText: 'hello from the Mac' })).toBeVisible({ timeout: 20_000 });
  await other.locator('#zchat .zc-in').fill('and from the phone');
  await other.locator('#zchat .zc-in').press('Enter');
  await expect(zc.locator('.zc-row.is-mine', { hasText: 'and from the phone' })).toBeVisible({ timeout: 20_000 });
  // a session's work, from the hooks: your task in the group and their "on it", with no page needed to write it
  const base = { session_id: `e2e-chat-${Date.now()}`, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, 'e2e-chat.jsonl') };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'polish the chat window' } });
  await expect(zc.locator('.zc-row.is-mine', { hasText: 'polish the chat window' })).toBeVisible({ timeout: 20_000 });
  const chat = await (await request.get('/api/chat')).json();
  expect(chat.msgs.some((m: { text: string }) => m.text.includes('hello from the Mac'))).toBe(true);
  await other.close();
  expect(errors).toEqual([]);
});

test('the phone window: a switch to open the office to phones (off), how to use it when out, and Remote Control', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');   // (the real office on this computer: the switch is only offered here)
  await page.click('#btn-phone-top');
  const body = page.locator('#pm-body');
  const lan = body.locator('.pm-approve').first();
  await expect(lan).toContainText('Open on phones');
  await expect(lan.locator('input')).not.toBeChecked();   // (off by default; nothing listens beyond 127.0.0.1)
  await expect(body.locator('.pm-note').first()).toContainText('PIN');
  await expect(body).not.toContainText('install');         // (no terminal command to type)
  await expect(body.locator('.pm-tab')).toHaveCount(2);    // (the two ways in: home, and when you're out)
  await expect(body.locator('.pm-list .pm-toggle')).toHaveCount(3);   // (what phones may do: approve, give work, Remote Control)
  await expect(body).toContainText('/rc');
  // Remote Control in every new session: written into Claude Code's settings (this test's own home folder), and back out
  const rc = body.locator('.pm-approve', { hasText: 'Remote Control' }), cc = path.join(HOME_DIR, '.claude', 'settings.json');
  await rc.locator('input').click();
  await expect.poll(() => { try { return JSON.parse(fs.readFileSync(cc, 'utf8')).remoteControlAtStartup; } catch { return null; } }).toBe(true);
  await body.locator('.pm-approve', { hasText: 'Remote Control' }).locator('input').click();
  await expect.poll(() => { try { return JSON.parse(fs.readFileSync(cc, 'utf8')).remoteControlAtStartup ?? false; } catch { return null; } }).toBe(false);
  expect(errors).toEqual([]);
});

test('away from home: the tunnel switch, and all that comes through it is from the internet (PIN only, nothing that controls the Mac)', async ({ page, request }) => {
  test.setTimeout(300_000);   // (a second office page, the phone's)
  const errors = watchErrors(page);
  await page.goto('/');
  await page.click('#btn-phone-top');
  await page.locator('#pm-body .pm-tab', { hasText: 'out' }).click();
  const sw = page.locator('#pm-body .pm-approve', { hasText: 'Cloudflare' });
  await sw.locator('input').click();
  await expect(page.locator('#pm-body')).toContainText('e2e-office-test.trycloudflare.com', { timeout: 20_000 });   // (tests/e2e/fake-cloudflared.sh)
  await expect(page.locator('#pm-body .pm-digits')).toBeVisible();
  const t = await (await request.get('/api/tunnel')).json();
  expect(t.state).toBe('on');
  if (process.platform === 'darwin') expect(t.awake.held).toBe(true);   // (caffeinate -s, while the tunnel is on)
  // straight to the tunnel's own listener, the way cloudflared comes in: from 127.0.0.1, and still not this computer
  const via = `http://127.0.0.1:${t.port}`, host = { Host: 'e2e-office-test.trycloudflare.com' }, token = fs.readFileSync(path.join(DATA_DIR, 'token'), 'utf8').trim();
  expect((await request.get(`${via}/?k=${token}`, { headers: host, maxRedirects: 0 })).headers().location).toBe('/pin');   // (no token links)
  expect((await request.post(`${via}/event`, { headers: host, data: { hook_event_name: 'SessionStart', session_id: 'e2e-tunnel' } })).status()).toBe(403);
  expect((await request.post(`${via}/api/sys/action`, { headers: host, data: { action: 'kill', target: 1 } })).status()).toBe(403);
  expect((await request.post(`${via}/api/accounts/auto`, { headers: host, data: { on: true } })).status()).toBe(403);
  expect((await request.post(`${via}/api/tunnel`, { headers: host, data: { on: false } })).status()).toBe(403);
  expect((await request.post(`${via}/api/lan`, { headers: host, data: { on: true } })).status()).toBe(403);
  expect((await request.get(`${via}/api/sys`, { headers: host })).status()).toBe(401);   // (watching needs the PIN)
  expect((await request.get(`${via}/`, { headers: { Host: 'evil.example' }, maxRedirects: 0 })).status()).toBe(421);   // (not the tunnel's name)
  // the PIN gets in, with an https-only cookie: kept a year with "Remember this device" (ticked at first), this visit only without
  const login = (pin: string, keep = true) => request.post(`${via}/pin`, { headers: { ...host, Origin: 'https://e2e-office-test.trycloudflare.com', 'Content-Type': 'application/x-www-form-urlencoded' }, data: `pin=${pin}${keep ? '&keep=1' : ''}`, maxRedirects: 0 });
  const r = await login(t.pin);
  expect(r.status()).toBe(303);
  const kept = String(r.headers()['set-cookie']), cookie = kept.split(';')[0];
  expect(kept).toContain('Secure');
  expect(kept).toContain('SameSite=Lax');   // (opened from the camera's QR code or a chat link, the cookie still goes)
  expect(kept).toContain(`Max-Age=${365 * 86400}`);
  expect(String((await login(t.pin, false)).headers()['set-cookie'])).not.toContain('Max-Age');
  expect((await request.get(`${via}/api/chat`, { headers: { ...host, Cookie: cookie } })).status()).toBe(200);
  // the app on a phone's home screen: its manifest and worker are public (fetched without the PIN's cookie)
  const manifest = await request.get(`${via}/manifest.webmanifest`, { headers: host });
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).display).toBe('standalone');
  expect((await request.get(`${via}/sw.js`, { headers: host })).status()).toBe(200);
  // notifications: the office's key; a subscription only to a browser's push service, kept, counted on the Mac
  const key = (await (await request.get(`${via}/api/push`, { headers: { ...host, Cookie: cookie } })).json()).key;
  expect(Buffer.from(key, 'base64url').length).toBe(65);
  const p256dh = crypto.createECDH('prime256v1'); p256dh.generateKeys();
  const sub = { endpoint: 'https://web.push.apple.com/QE2e', keys: { p256dh: p256dh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  const subscribe = (b: object) => request.post(`${via}/api/push`, { headers: { ...host, Cookie: cookie, 'Content-Type': 'application/json' }, data: b });
  expect((await subscribe({ op: 'add', sub: { ...sub, endpoint: 'https://evil.example/push' } })).status()).toBe(400);
  expect((await (await subscribe({ op: 'add', sub })).json()).count).toBe(1);
  await page.locator('#pm-body .pm-tab', { hasText: 'out' }).click();   // (the window drawn again: the count asked again)
  await expect(page.locator('#pm-body .pm-pushrow')).toContainText('1 phone', { timeout: 10_000 });
  expect((await (await subscribe({ op: 'remove', endpoint: sub.endpoint })).json()).count).toBe(0);
  // through the tunnel a page asks (/api/live, which answers as soon as there is something) instead of keeping a stream
  // open, which a quick tunnel holds back: the snapshot first, then what is broadcast after it
  const live = async (since?: number) => (await request.get(`${via}/api/live${since == null ? '' : `?since=${since}`}`, { headers: { ...host, Cookie: cookie } })).json();
  const first = await live();
  expect(first.msgs[0].k).toBe('snap');
  await request.post('/api/chat', { data: { op: 'say', from: 'hr', text: 'over the tunnel', key: `e2e-live-${Date.now()}` } });
  let seen = '', at = first.seq;
  for (let k = 0; k < 6 && !seen.includes('over the tunnel'); k++) { const r = await live(at); at = r.seq; seen += JSON.stringify(r.msgs); }
  expect(seen).toContain('over the tunnel');
  // a PIN of your own, set on the Mac: an easy one is turned down; the new one signs every phone out
  await page.locator('#pm-body .pm-pin button', { hasText: 'Set your own' }).click();
  await page.locator('#pm-body .pm-pinin').fill('123456');
  await page.locator('#pm-body .pm-setpin button[type=submit]').click();
  await expect(page.locator('#pm-body .pm-setpin + .pm-err')).toContainText('123456');
  await page.locator('#pm-body .pm-pinin').fill('20051990');
  await page.locator('#pm-body .pm-setpin button[type=submit]').click();
  await expect(page.locator('#pm-body .pm-digits')).toHaveText('2005 1990');
  expect((await request.get(`${via}/api/chat`, { headers: { ...host, Cookie: cookie } })).status()).toBe(401);
  expect((await login('20051990')).status()).toBe(303);
  // on a phone (a page through the tunnel): the PIN changed there, with the one it has now, and that phone stays in;
  // what the Mac allows it, each with where to turn it on
  const phone = await page.context().newPage();
  await phone.addInitScript(() => { try { localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } });
  await phone.goto(`${via}/pin`);
  await phone.locator('input[name=pin]').fill('20051990');
  await phone.locator('button[type=submit]').click();
  const side = phone.locator('#pm-body .pm-side');
  await expect.poll(() => phone.evaluate(() => document.getElementById('btn-phone')?.hidden === false), { timeout: 120_000 }).toBe(true);   // (the office's first news: the window is offered)
  await phone.click('#btn-look'); await phone.click('#st-tab-more'); await phone.click('#btn-phone');
  await expect(side).toBeVisible();
  await expect(phone.locator('#pm-body')).toContainText('Give Claude work from a phone: off');
  await expect(phone.locator('#pm-body .pm-notify')).toContainText(/Turn on notifications|blocked/);   // (the switch; a headless Chromium says notifications are blocked whatever it was granted)
  await side.locator('input').nth(0).fill('11111111');
  await side.locator('input').nth(1).fill('31121999');
  await side.locator('button').click();
  await expect(phone.locator('#pm-body .pm-side + .pm-err')).toContainText('Wrong PIN');
  await side.locator('input').nth(0).fill('20051990');
  await side.locator('button').click();
  await expect.poll(() => fs.readFileSync(path.join(DATA_DIR, 'pin'), 'utf8').trim()).toBe('31121999');
  await phone.reload();
  await expect(phone.locator('#btn-look')).toBeVisible();   // (still in: not sent back to the PIN page)
  expect(new URL(phone.url()).pathname).toBe('/');
  await phone.close();
  expect((await (await request.post('/api/pin', { data: { pin: '111111' } })).json()).ok).toBe(false);
  // off: the listener closes
  await sw.locator('input').click();
  await expect.poll(async () => (await (await request.get('/api/tunnel')).json()).state).toBe('off');
  if (process.platform === 'darwin') expect((await (await request.get('/api/tunnel')).json()).awake.held).toBe(false);
  await expect(request.get(`${via}/health`, { headers: host, timeout: 3000 })).rejects.toThrow();
  expect(errors).toEqual([]);
});

test('giving Claude work from the chat: a folder or a tagged conversation, the result in the group; from a phone only when the Mac allows it', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { try { localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } });
  // a session that has worked in a folder: the folder becomes somewhere work can go
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const base = { session_id: `e2e-task-sess-${Date.now()}`, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, 'e2e-task.jsonl') };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await expect.poll(async () => (await (await request.get('/api/tasks')).json()).projects.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const said0 = (await (await request.get('/api/chat')).json()).msgs.filter((m: { tag?: string }) => m.tag === 'claude').length;   // (answers from earlier runs)
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  const zc = page.locator('#zchat');
  await zc.locator('.zc-task-btn').click();
  const sheet = zc.locator('.zc-task');
  await expect(sheet.locator('.zc-task-o').first()).toBeVisible({ timeout: 20_000 });
  await sheet.locator('.zc-task-o', { hasText: path.basename(HOME_DIR) }).last().click();   // (a new conversation in that folder)
  await sheet.locator('.zc-task-in').fill('write a hello file');
  await sheet.locator('.zc-task-go').click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });
  await expect(zc.locator('.zc-row.is-mine', { hasText: 'write a hello file' })).toBeVisible({ timeout: 20_000 });
  await expect(zc).toContainText('Done: the e2e task.', { timeout: 30_000 });   // (tests/e2e/fake-claude.sh answers for `claude -p`)
  // its card: the steps it took (the fake one reads a README), then done
  await expect(zc.locator('.zc-work.is-done').first()).toBeVisible({ timeout: 20_000 });
  await zc.locator('.zc-work.is-done .zc-readmore').first().click();
  await expect(zc.locator('.zc-work-steps').first()).toContainText('README.md');
  // its conversation on a screen of its own: what was said (Claude's laid out) and the steps, from its transcript
  fs.writeFileSync(base.transcript_path, [
    { type: 'user', timestamp: new Date().toISOString(), message: { content: 'fix the header please' } },
    { type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/e2e/Header.tsx' } }] } },
    { type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'text', text: '**Fixed** the header:\n- smaller logo' }] } },
  ].map((x) => JSON.stringify(x)).join('\n') + '\n');
  await zc.locator('.zc-to-chip').click();
  await zc.locator(`.zc-to-pick .zc-to-o[data-sid="${base.session_id}"] .zc-to-see`).click();
  const convo = zc.locator('.zc-conv');
  await expect(convo.locator('.zc-conv-row.is-mine')).toContainText('fix the header please', { timeout: 20_000 });
  await expect(convo.locator('.zc-md b')).toHaveText('Fixed');
  await expect(convo.locator('.zc-conv-steps')).toBeVisible();
  await convo.locator('.zc-conv-h .zc-ib').click();
  await expect(convo).toBeHidden();
  // writing to that conversation ("To", over the input): that very conversation carried on (no branch), the answer from
  // its person, marked Claude; and again
  const asked = () => { try { return fs.readFileSync(path.join(HOME_DIR, '.fake-claude.log'), 'utf8'); } catch { return ''; } };
  const claudeSaid = async () => (await (await request.get('/api/chat')).json()).msgs.filter((m: { tag?: string }) => m.tag === 'claude').length - said0;
  await zc.locator('.zc-to-chip').click();
  await zc.locator(`.zc-to-pick .zc-to-o[data-sid="${base.session_id}"]`).click();
  await expect(zc.locator('.zc-to-chip')).toHaveClass(/is-on/);
  await zc.locator('.zc-in').fill('what are you on?');
  await zc.locator('.zc-in').press('Enter');
  await expect(zc.locator('.zc-row.is-mine', { hasText: 'what are you on?' })).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => asked().trim().split('\n').pop(), { timeout: 20_000 }).toMatch(new RegExp(`--resume ${base.session_id}( |$)`));
  await expect.poll(claudeSaid, { timeout: 30_000 }).toBeGreaterThan(1);   // (the folder's work answered first)
  await expect(zc.locator('.zc-claude').first()).toBeVisible();
  await zc.locator('.zc-in').fill('and then?');
  await zc.locator('.zc-in').press('Enter');
  await expect.poll(() => asked().trim().split('\n').length, { timeout: 20_000 }).toBeGreaterThan(2);
  expect(asked().trim().split('\n').pop()).toMatch(new RegExp(`--resume ${base.session_id}( |$)`));
  // a new conversation in a project ("＋"): no conversation to carry on the first time, then that one
  const runs = () => asked().trim().split('\n').length;
  await expect.poll(claudeSaid, { timeout: 30_000 }).toBeGreaterThan(2);
  await zc.locator('.zc-to-chip').click();
  await zc.locator('.zc-to-pick .zc-to-o[data-dir]').first().click();
  await expect(zc.locator('.zc-to-chip')).toContainText(path.basename(HOME_DIR));
  const before = runs();
  await zc.locator('.zc-in').fill('start something new');
  await zc.locator('.zc-in').press('Enter');
  await expect.poll(runs, { timeout: 20_000 }).toBe(before + 1);
  expect(asked().trim().split('\n').pop()).not.toContain('--resume');
  await expect.poll(claudeSaid, { timeout: 30_000 }).toBeGreaterThan(3);
  await zc.locator('.zc-in').fill('and go on');
  await zc.locator('.zc-in').press('Enter');
  await expect.poll(() => asked().trim().split('\n').pop(), { timeout: 20_000 }).toMatch(/--resume e2e-task-1( |$)/);
  // an answer in Markdown (laid out), and a picture of the page it names (SCREENSHOT: this computer's), asked for outside the conversation
  await expect.poll(claudeSaid, { timeout: 30_000 }).toBeGreaterThan(4);   // ('and go on' answered: the next one may go)
  await zc.locator('.zc-in').fill('and now with a picture');
  await zc.locator('.zc-in').press('Enter');
  await expect(zc.locator('.zc-md b', { hasText: 'Done' }).last()).toBeVisible({ timeout: 30_000 });
  await expect(zc.locator('.zc-md li').last()).toContainText('code');
  await expect(zc.locator('.zc-md').last()).toContainText('📸');
  await expect(zc.locator('.zc-photo img').last()).toBeVisible({ timeout: 60_000 });
  expect(asked().trim().split('\n').pop()).toContain('--append-system-prompt');
  // stopped from its card, on purpose: "Stopped", not an error
  await expect.poll(claudeSaid, { timeout: 30_000 }).toBeGreaterThan(5);
  await zc.locator('.zc-in').fill('take it slowly');
  await zc.locator('.zc-in').press('Enter');
  await zc.locator('.zc-work.is-work .zc-work-btn.is-stop').last().click({ timeout: 20_000 });
  await expect(zc.locator('.zc-work.is-stopped').last()).toBeVisible({ timeout: 20_000 });
  await expect(zc.locator('.zc-row', { hasText: 'Stopped, as you asked' }).last()).toBeVisible({ timeout: 20_000 });
  // quick commands: a tap fills the input; ✎ changes them (kept on the Mac, for the phones too)
  await zc.locator('.zc-quick .zc-quick-c').first().click();
  await expect(zc.locator('.zc-in')).toHaveValue(/tests/);
  await zc.locator('.zc-quick .zc-quick-c.is-edit').click();
  await zc.locator('.zc-quick-ed .zc-quick-c', { hasText: 'Add' }).click();
  await zc.locator('.zc-quick-row input').last().fill('Lint');
  await zc.locator('.zc-quick-row textarea').last().fill('Run the linter.');
  await zc.locator('.zc-quick-ed .zc-quick-c.is-save').click();
  await expect(zc.locator('.zc-quick .zc-quick-c', { hasText: 'Lint' })).toBeVisible();
  expect((await (await request.get('/api/quick')).json()).list.at(-1).prompt).toBe('Run the linter.');
  // a photo with what you write: from this device, made smaller, read by Claude from its path
  const chooser = page.waitForEvent('filechooser');
  await zc.locator('.zc-bar .zc-photo-btn, .zc-toolbar .zc-photo-btn').first().click();
  await (await chooser).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: fs.readFileSync(path.resolve('public/icon-512.png')) });
  await expect(zc.locator('.zc-attach-t')).toHaveCount(1);
  await zc.locator('.zc-in').fill('what is in this picture');
  await zc.locator('.zc-in').press('Enter');
  await expect.poll(() => asked().trim().split('\n').pop(), { timeout: 20_000 }).toContain('task-images');   // (its path, under "Attached image")
  expect(asked()).toContain('Attached image');
  await zc.locator('.zc-to-x').click();
  await expect(zc.locator('.zc-to-chip')).not.toHaveClass(/is-on/);
  // from a phone (through the tunnel's listener, with the PIN): refused until the Mac allows it
  await request.post('/api/tunnel', { data: { on: true } });
  await expect.poll(async () => (await (await request.get('/api/tunnel')).json()).state).toBe('on');
  const t = await (await request.get('/api/tunnel')).json();
  const via = `http://127.0.0.1:${t.port}`, host = { Host: 'e2e-office-test.trycloudflare.com', Origin: 'https://e2e-office-test.trycloudflare.com' };
  const login = await request.post(`${via}/pin`, { headers: { ...host, 'Content-Type': 'application/x-www-form-urlencoded' }, data: `pin=${t.pin}`, maxRedirects: 0 });
  const cookie = String(login.headers()['set-cookie'] || '').split(';')[0];
  const dir = (await (await request.get('/api/tasks')).json()).projects[0].dir;
  const give = () => request.post(`${via}/api/tasks`, { headers: { ...host, Cookie: cookie }, data: { dir, text: 'from the phone' } });
  expect((await give()).status()).toBe(403);
  await request.post('/api/tasks/allow', { data: { on: true } });
  expect((await give()).status()).toBe(200);
  await request.post('/api/tasks/allow', { data: { on: false } });
  await request.post('/api/tunnel', { data: { on: false } });
  expect(errors).toEqual([]);
});


test('adding a Claude account: a folder of its own, connected to the office, signed in from the card', async ({ page }) => {
  test.setTimeout(420_000);   // (signing in, renaming, picking, then the page once more: ~5 min on a busy machine)
  const errors = watchErrors(page), dir = path.join(HOME_DIR, '.claude-cong-ty');
  fs.rmSync(dir, { recursive: true, force: true });
  await page.goto('/');   // (the real office, on this computer: not the demo)
  await page.click('#btn-plan');
  await page.click('.plan-add-btn');
  await page.fill('.pa-form input', 'Công ty');
  await page.click('.pa-form [type=submit]');
  // the sign-in runs by itself (tests/e2e/fake-claude.sh stands in for Claude Code): the page to open again, then done
  await expect(page.locator('.pa-browser')).toBeVisible({ timeout: 20_000 });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  expect(settings.hooks?.SessionStart?.length).toBeGreaterThan(0);   // (its sessions show in the office too)
  await expect(page.locator('.pa-done')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.plan-other b', { hasText: 'cong-ty' })).toBeVisible();
  // hovering an account: a name of the user's own, and "Use" for the account new sessions start on
  const acct = (name: string) => page.locator('.acct-block', { has: page.locator('.acct-name b', { hasText: name }) });
  await acct('cong-ty').hover();
  await acct('cong-ty').locator('.acct-name').click();
  await page.fill('.acct-rename input', 'Việc công ty');
  await page.keyboard.press('Enter');
  await expect(acct('Việc công ty')).toBeVisible();
  await acct('Việc công ty').hover();
  await acct('Việc công ty').locator('.acct-use').click();
  await expect(acct('Việc công ty').locator('.acct-badge--on')).toBeVisible();
  await expect(page.locator('.acct-block').first()).toContainText('Việc công ty');   // ("Use" puts it at the top of the order)
  const main = acct('Main account');
  await main.hover();
  await main.locator('.acct-use').click();   // (back to the main account: the other tests expect it)
  await expect(main.locator('.acct-badge--on')).toBeVisible();
  // switching by itself when one runs out
  const sw = page.locator('.acct-switch');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  // the name stays; then back to the folder's own name for the next run
  await page.reload();
  await expect(page.locator('#btn-plan')).toBeVisible({ timeout: 90_000 });   // (shown once the limits arrive)
  await page.click('#btn-plan');
  await expect(acct('Việc công ty')).toBeVisible({ timeout: 20_000 });
  await acct('Việc công ty').locator('.acct-name').click();
  await page.fill('.acct-rename input', '');
  await page.keyboard.press('Enter');
  await expect(acct('cong-ty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an open conversation moves to another account: stopped while it rests, started on that account when resumed', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page), data = DATA_DIR, sessDir = path.join(HOME_DIR, '.claude', 'sessions');
  const acctDir = path.join(HOME_DIR, '.claude-phu-e2e'), sid = crypto.randomUUID(), pin = path.join(data, 'resume-on', sid);
  fs.mkdirSync(path.join(HOME_DIR, '.claude', 'projects'), { recursive: true });   // (the history the accounts share)
  fs.mkdirSync(path.join(HOME_DIR, '.vscode', 'extensions', 'anthropic.claude-code-e2e'), { recursive: true });   // (an editor with Claude Code's extension)
  fs.mkdirSync(sessDir, { recursive: true });
  // a second account, signed in the way the card does it (tests/e2e/fake-claude.sh)
  fs.rmSync(acctDir, { recursive: true, force: true });
  expect((await request.post('/api/accounts', { data: { name: 'phu e2e' } })).ok()).toBeTruthy();
  await expect.poll(() => fs.existsSync(path.join(acctDir, '.claude.json')), { timeout: 30_000 }).toBe(true);
  // a conversation open in the editor and resting: a process of its own and the session file Claude Code writes for it
  const open = () => {
    const p = spawn('sleep', ['600'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(sessDir, `${p.pid}.json`), JSON.stringify({ pid: p.pid, sessionId: sid, cwd: HOME_DIR, startedAt: Date.now(), kind: 'interactive', entrypoint: 'claude-vscode', name: 'e2e-move', status: 'idle', updatedAt: Date.now() }));
    return p;
  };
  const first = open();
  await page.goto('/');
  const row = page.locator('#rail-list .ri', { hasText: 'e2e-move' });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await page.click('[data-hud-panel="left"]');
  await row.click();
  const acts = page.locator('#ds-actions'), change = acts.getByRole('button', { name: 'Change account' });
  await expect(change).toBeVisible({ timeout: 30_000 });
  await change.click();
  await expect(acts.locator('.acct-opt').first()).toContainText('in use');   // (the main account, the one it is on)
  await acts.locator('.acct-opt', { hasText: 'phu-e2e' }).click();
  await expect(acts).toContainText('Moved to', { timeout: 20_000 });
  await expect.poll(() => { try { process.kill(first.pid!, 0); return true; } catch { return false; } }).toBe(false);
  // the office's script went into the editor, and starts this conversation (only this one) on the new account
  expect(fs.readFileSync(pin, 'utf8').trim()).toBe(acctDir);
  const cfg = path.join(HOME_DIR, ...(process.platform === 'darwin' ? ['Library', 'Application Support'] : ['.config']), 'Code', 'User', 'settings.json');
  const wrapper = JSON.parse(fs.readFileSync(cfg, 'utf8'))['claudeCode.claudeProcessWrapper'];
  expect(wrapper).toBe(path.join(data, 'claude-switch.sh'));
  const run = (...args: string[]) => execFileSync('sh', [wrapper, '/bin/sh', '-c', 'printf %s "$CLAUDE_CONFIG_DIR"', ...args], { env: { ...process.env, CLAUDE_CONFIG_DIR: '' }, encoding: 'utf8' });
  expect(run(`--resume=${sid}`)).toBe(acctDir);
  expect(run('--resume', sid)).toBe(acctDir);
  expect(run(`--resume=${crypto.randomUUID()}`)).not.toBe(acctDir);
  // its person waits at the desk; when the editor starts it again (same conversation, a new process) it is the same one
  await expect(row).toHaveCount(1);
  const second = open();
  await expect(acts).not.toContainText('Moved to', { timeout: 30_000 });
  await expect.poll(() => fs.existsSync(pin)).toBe(false);
  await expect(row).toHaveCount(1);
  await change.click();
  await expect(acts.locator('.acct-opt', { hasText: 'phu-e2e' })).toContainText('in use');
  second.kill();
  for (const p of [first, second]) fs.rmSync(path.join(sessDir, `${p.pid}.json`), { force: true });
  fs.rmSync(acctDir, { recursive: true, force: true });
  fs.rmSync(path.join(HOME_DIR, '.vscode'), { recursive: true, force: true });
  expect(errors).toEqual([]);
});

test('an image a session reads shows in the feed as a thumbnail, and a click opens it large', async ({ page, request }) => {
  const errors = watchErrors(page), dir = path.join(HOME_DIR, 'shots'), file = path.join(dir, 'acct.png');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGN43xUPRww4OQC2ZhYhiIqZKgAAAABJRU5ErkJggg==', 'base64'));   // (4 × 3, coral)
  await page.goto('/');
  const base = { session_id: `e2e-img-${Date.now()}`, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, 'e2e-img.jsonl') };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: file } } });
  const thumb = page.locator('.fg-thumb').first();
  await expect(thumb).toBeVisible({ timeout: 20_000 });
  await thumb.click();
  await expect(page.locator('.img-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (document.querySelector('.img-view img') as HTMLImageElement | null)?.naturalWidth || 0)).toBe(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('.img-view')).toBeHidden();
  // an id the office never handed out serves nothing
  expect((await request.get('/api/image?id=0000000000000000')).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('the machine drawer says why it is slow, closes idle sessions in one go and can do it on a timer', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  const errors = watchErrors(page);
  await page.goto('/?demo');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 60_000 });   // (17 s on a Mac deep in swap)
  await page.locator('#btn-mac').evaluate((b: HTMLElement) => b.click());
  const body = page.locator('#mac-body');
  await expect(body.locator('.verdict')).toHaveAttribute('data-level', 'warn');
  await expect(body.locator('.verdict .mspark')).toHaveCount(2);                   // (RAM and swap, each on its own chart)
  await expect(body.locator('.meters .meter')).toHaveCount(4);                      // (no plan reading in the demo)
  // who holds the RAM: one bar, a legend entry per segment, the editor's parts
  const segs = await body.locator('.held-bar i').count();
  expect(segs).toBeGreaterThan(2);
  await expect(body.locator('.held-legend li')).toHaveCount(segs);
  await expect(body.locator('.row--ide .ide-parts li').first()).toBeVisible();
  // the Claude sessions as you know them: the conversation's title, the app it runs in and since when, the one you are in
  const you = body.locator('.row--you');
  await expect(you).toHaveCount(1);
  await expect(you.locator('.row-name')).toContainText('New hero section and WebP images');
  await expect(you.locator('.row-badge--you')).toHaveText("you're talking here");
  await expect(you.locator('.row-sub').first()).toHaveText(/^Cursor · opened .*\d\d:\d\d · ~\/projects\/landing-page$/);
  await expect(body.locator('.row-name', { hasText: 'Cart pagination and shipping fees' })).toBeVisible();
  // the main action asks first, then (in the demo) does nothing on a real machine. Both clicks in one go: the drawer is
  // rebuilt every 5 seconds and the question goes away after 4.5, longer than a slow page takes between two steps.
  await expect(body.locator('.verdict-acts .btn--primary')).toBeVisible({ timeout: 10_000 });
  const asked = await body.evaluate((b) => {
    const seen: string[] = [], t = document.getElementById('toast')!;
    new MutationObserver(() => { if (!t.hidden) seen.push(t.textContent || ''); }).observe(t, { attributes: true, childList: true, subtree: true, characterData: true });
    (window as unknown as { seenToasts: string[] }).seenToasts = seen;
    (b.querySelector('.verdict-acts .btn--primary') as HTMLElement).click();
    const sure = b.querySelector('.verdict-acts .btn--confirm') as HTMLElement | null;
    sure?.click();
    return sure?.textContent || '';
  });
  expect(asked).toMatch(/\?/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { seenToasts: string[] }).seenToasts.length)).toBeGreaterThan(0);
  const press = (sel: string) => body.locator(sel).first().evaluate((b: HTMLElement) => b.click());
  // closing idle sessions on a timer: off by default, one choice at a time
  const opts = body.locator('.auto-close [role="radio"]');
  await expect(opts).toHaveCount(4);
  await expect(opts.first()).toHaveAttribute('aria-checked', 'true');
  await press('.auto-close [role="radio"]:nth-child(2)');
  await expect(body.locator('.auto-close [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(body.locator('.auto-close [role="radio"]').first()).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});
