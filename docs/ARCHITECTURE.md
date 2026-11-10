# Architecture

Agent Office is two programs in one repository:

1. **A local server** (`server/`, plain Node.js ESM, no build step). Claude Code hooks POST every event to it; it keeps one
   record per open session, measures the Mac, and streams compact events to the page over Server-Sent Events. It also
   hosts Next.js, which renders the page.
2. **The office** (`app/`, `src/`). A Next.js App Router page whose markup is static React components; the pixel café
   (`ui/cafe.js`, one canvas) and all the panels are driven by plain JavaScript modules in `src/office/`.

```
Claude Code ──hooks (curl, loopback only)──▶ server/index.mjs ──SSE /stream──▶ the page (src/office)
                                               │   ▲                               │
                    ~/.claude/sessions, transcripts   /api/* (sys, log, timeline, replay, todos, perm…)
Claude Code ──OpenTelemetry (OTLP/HTTP JSON)──▶ /v1/metrics, /v1/logs ──▶ server/otel.mjs ──/api/burn──▶ "What eats your plan"
```

## Server (`server/`)

| File | What it does |
| --- | --- |
| `index.mjs` | HTTP server: hook intake (`/event`, `/hook/*`), the live stream, the API, the phone PIN page; hands every page request to Next.js. Loopback-only for hooks, a host allow-list against DNS rebinding, a 6-digit PIN for phones. |
| `platform/` | The machine's readings, one module per system with the same functions: `darwin.mjs` (ps, top, vm_stat, lsof, the keychain), `linux.mjs` (/proc only, so it works in slim containers), `win32.mjs` (one PowerShell CIM reading shared for two seconds). |
| `system.mjs` | The Mac panel: memory, CPU, disk, dev servers, idle Claude sessions, cleanups; safe stops (a process is only signalled if its start time matches what you saw). |
| `usage.mjs` | Tokens and API-price equivalents read from transcripts. |
| `trophies.mjs` | All-time totals and milestones for the trophy cabinet (`data/totals.json`). |
| `redact.mjs` | Masks secrets in anything shown in the UI. |
| `git.mjs` | Git per session folder (branch, uncommitted files, commits and pushes by watching HEAD and the upstream) and the latest CI run through `gh`. |
| `wrapped.mjs` | The weekly recap: totals over the last seven replay logs. |
| `loops.mjs` | "Ngắt vòng lặp kẹt": a session going round in circles (the same call failing the same way N times, compaction after compaction, cost rising with nothing edited), from the hooks and the status line; the synchronous PreToolUse hook (`/hook/loop`) gets a deny, your hint or Stop back from it. |
| `otel.mjs` | "What eats your plan": an OpenTelemetry receiver for Claude Code's own cost and token counters and api_request events (OTLP/HTTP JSON at `/v1/metrics` and `/v1/logs`, loopback only). Delta and cumulative counters each counted once; a session is read from its counters, or from its events when it sent none; daily sums per session and attribution in `data/otel/`, 30 days. `src/shared/burn.js` sums them for `/api/burn` and the demo. |
| `otel-setup.mjs` | The telemetry block `install` adds to `~/.claude/settings.json` (only when there is none of yours, tagged so `uninstall` removes exactly it), and how to tell whose telemetry it is. |
| `tasks.mjs` | "Give work": a `claude -p` run on this Mac from the chat or a phone, carrying on a tagged conversation (`--resume --fork-session`) or new in a known folder; caps, photos, its answer back to the chat. |
| `bg-sessions.mjs` | Phone work as Claude Code background sessions: whether this Claude Code has them (`--help`), what `claude --bg` printed, a `claude agents --json` row as the card's state, and the settings each one gets (edits in place, `/hook/bind`, approvals and questions held until answered with `?long=1`). |
| `steer.mjs` | "Chen lời giữa chừng": a note into a working session through its inbox socket (the line it takes, whether it can take one now: permission mode and `crossSessionInbound`), else kept for when it is done. |
| `rewrite.mjs` | The chat's "✨ Viết lại cho rõ": a message for Claude rewritten as goal / context / done-when by `claude -p` on a small model, with no tools, one turn, no session saved and the hooks off; text only, one at a time, 20 an hour. The rest of the prompt helper is in the page (`src/shared/prompt-coach.js`). |
| `tenure.mjs` | Each project's working life (`data/tenure.json`): first and last session, on how many days, how many turns; which are due a farewell (Settings → More), which came back, which are still interns and which are ready to be made permanent. The first run reads, once, the dates and folders of Claude Code's transcripts (the projects already there). |
| `lift-service.mjs` | The lift's servicing after a start (a scene the office draws, `life/lift-service.js`): three minutes, five when the server starts on a build it has not run before (`data/lift.json` keeps the last one); the inspection sticker that build gets. In the live snapshot as `lift`. |
| `prefs.mjs` | The office's language (`data/prefs.json`, `OFFICE_LANG`) and the server's translator `tr()`. |

`bin/cli.mjs` installs the hooks (curl on macOS and Linux, `hooks/send.mjs` on Windows) and, through `bin/service.mjs`, the
background service: launchd, a systemd user service, or a script in the Windows Startup folder.

Runtime state lives in `data/` (git-ignored): the access token, phone PIN, replay logs (7 days), usage sums (`otel/`, 30 days), totals, each project's working life (`tenure.json`), caches.

## The page (`app/`, `src/components/`, `src/styles/`)

* `app/layout.tsx` loads the stylesheets (one per area of the screen, in cascade order) and the QR library.
* `app/page.tsx` composes the static markup: `TopBar`, `SessionRail`, `Stage` (with its overlays), `ActivityPanel`,
  the drawers, the phone modal, the toast, and `OfficeBoot`.
* `src/components/OfficeBoot.tsx` is the only client component: once the markup is on screen it dynamically imports
  `src/office/main.js` and calls `startOffice()`.

The markup components render once and never re-render: the office finds elements by `id` and fills them in. Moving a
panel to stateful React is welcome, one panel at a time (see CONTRIBUTING).

## The office (`src/office/`)

Every module exports what other modules use, and may export a `setup()` that does its work at start: wiring its panel.
`main.js` runs the `setup()`s in a fixed order — the people's state first, then the café and the panels, the live
connection, and last the frame loop — so a module may use anything set up by a
module listed before it in `main.js`. Functions can call into later modules freely (they run after start-up).

Values that several modules assign (the clock `state.sim`, the selection `state.selectedId`, mode switches…) live on
the shared object in `core/state.js`; everything else is an ordinary import.

Things to know before changing the café:

* **The art is the user's own.** `scripts/vn-assets.py` builds `public/assets/vn/` (git ignores it) from a local copy
  of the game the characters come from; the café explains how when it is missing. Never commit it.
* **Frame budget**: 30 fps at most, 8 in the background (`core/loop.js`). People and their lines are read four times
  a second; only the animation runs every frame.

## Languages (`src/i18n/`)

The office has one language at a time, picked in Settings and kept by the server, because the server writes some of
the words too (event labels, cleanup tips, trophy names). On each page request the server puts it in the
`x-office-lang` header; components read it with `getT()` (`src/i18n/server.ts`), the layout sets `<html lang>`, and the
engine's `tr()` reads that attribute. Changing the language broadcasts `{k:'lang'}` and every open page reloads.
`?lang=vi` shows one visit in another language. The dictionaries are plain JS objects, one folder per language and one
file per area; English is the reference and the fallback.

## The online demo

`OFFICE_STATIC=1 next build` exports the page as a static site that runs demo mode with no server
(`scripts/build-demo.mjs` builds every language, English at the root and the others under `/<lang>/`;
`.github/workflows/pages.yml` publishes it). In that build `getLang()` takes the language from the build, and the
engine switches to demo mode and talks to no API.

### Module map

| Module | Lines | What it is |
| --- | ---: | --- |
| `audio/sfx.js` | 75 | Sounds, synthesized in the browser. |
| `core/env.js` | 42 | Page-wide basics: DOM helpers, replay clock, office clock, formatting. |
| `core/loop.js` | 29 | The frame loop: the café, at most 30 frames a second (8 when the window is in the background, 2 under a phone's full-screen sheet), and the bits of office life that tick with it. |
| `core/state.js` | 3 | Values that more than one module assigns (the clock, the selection, mode switches…), on one shared object so any module can change them. |
| `demo/demo-log.js` | 17 | The demo's conversation logs (a session's, shown in its drawer, and each subagent's steps), kept to what the drawer can show. |
| `demo/demo.js` | 315 | Demo mode: fictional projects and a fictional Mac. |
| `life/daylight.js` | 28 | The office's clock in the top bar, and day or night: by the clock (night from 18:00 to 6:00), or picked in Settings → Time of day. |
| `life/incidents.js` | 56 | What happens in the office when a session does something: the feed, the sounds, the toasts, what the agent says (the café shows it over their head), the group chat. |
| `life/weather.js` | 46 | Real weather outside (Open-Meteo). |
| `life/your-turn.js` | 36 | "Your turn": sessions that finished or wait for you. |
| `net/live.js` | 36 | The live connection's sessions: one comes in or changes, one leaves. |
| `people/workers.js` | 82 | Sessions and the agents working in them: who is in the office and what each last said. |
| `replay/replay.js` | 157 | Replay and recording. |
| `replay/timeline.js` | 192 | The timeline: one lane per session. |
| `ui/activity.js` | 278 | The activity column and the session list. |
| `ui/burn.js` | 212 | What eats your plan: where Claude Code's usage goes, by model, MCP server, skill, plugin, subagent, project and session. |
| `ui/cache-words.js` | 53 | How a session's prompt cache reads on screen ("Đồng hồ bộ nhớ đệm", src/shared/cache-clock.js; the cups on the desks are world/props/cups.js): the line under the session drawer's folder, the one under the chat's "Gửi tới" and in its list of conversations, list mode's cards, and the switch in Settings → More for the "about to go cold" notification. |
| `ui/cafe-room.js` | 114 | The café's scene: one of the game's painted backgrounds (the café, the office, the street… each in the light of the time of day), the people's holographic workstations floating in front of it, and the air: light shafts by day, drifting motes of light, rain when it rains, a colour grade and a vignette. |
| `ui/cafe.js` | 588 | The office as a pixel café, seen side on: the only view. |
| `ui/chat-avatars.js` | 19 | Round photos for the group chat (group-chat-view.js): each session's face is the portrait of the character it plays in the café (ui/cafe.js). |
| `ui/event-text.js` | 118 | How events read on screen: actions per event type, verbs, bubble text, streamer mode. |
| `ui/group-chat-view.js` | 890 | The group chat's window (the conversation: group-chat.js), drawn after the Vietnamese messenger's group chat on a phone (its own web CSS and string table, and a 2026 screenshot of the app, for the colours, sizes and words): the blue gradient bar with the back chevron, the group's name and "👥 N thành viên", call, video and ☰; the pinned message under it; the conversation on a lavender-grey ground, gathered at the bottom like the app's, the others' white bubbles on the left (the name at the top inside the first of a run, the face beside it, the time inside the last), yours pale blue on the right with who has seen it; dark pills for the time lines, white ones for what the group does; "Tin nhắn mới" where you stopped reading; replies quoting what they answer; a recalled message's "Tin nhắn đã được thu hồi"; the ♡ on a bubble's corner and a small pill once someone reacts (hover a bubble for the six, a reply and, on yours, recall); polls and reminders as cards in the middle; "… đang soạn tin"; the input bar: stickers and emoji, "Tin nhắn", ••• (a poll, @ someone), the mic and a photo, or send once you type; writing to Claude, a prompt helper over it. |
| `ui/group-chat.js` | 183 | The company group chat, on the page (the window: group-chat-view.js; the people and what they say: src/shared/chat-engine.js). |
| `ui/icons.js` | 85 | Stroke icons (24 px grid) and the icon helper. |
| `ui/image-view.js` | 28 | Images in the feed: a session that read, wrote or edited an image gets a thumbnail on that line (activity.js), and a click opens it here, large, over the office (the server serves it by id: GET /api/image). |
| `ui/live2d.js` | 74 | The game's own Live2D standing art, played in the café's card: its idle motions move the hair, the body and the face; on top of them the eyes blink, the mouth moves while the text types out, and the head follows the pointer. |
| `ui/mac-drawer.js` | 684 | The Mac drawer: memory, CPU, dev servers, plan limits, cleanup. |
| `ui/notify.js` | 64 | Notifications on this phone (Web Push: server/push.mjs sends them, public/sw.js shows them): Claude's answers in the group chat and an approval waiting, even with the office closed and the phone locked. |
| `ui/permissions.js` | 148 | Approve / deny cards and Claude's questions. |
| `ui/phone.js` | 94 | The office on a phone: an app-like layout for small screens, upright or held sideways. |
| `ui/puppet.js` | 51 | A still portrait brought to life, the way a visual novel's standing art idles: drawn in thin horizontal strips, each pushed a little by the breath (the shoulders rise, the hips stay), a slow sway from the waist, the hair and the sleeves lifting in a breeze towards the bottom, and a small nod while the character speaks. |
| `ui/session-account.js` | 54 | "Change account" in a session's drawer (on this computer only): the accounts of the plan card, each with what it has left. |
| `ui/session-drawer.js` | 380 | The session drawer: chat, steps, subagents. |
| `ui/settings.js` | 89 | Settings popover: time of day, weather, language, toggles. |
| `ui/stranded.js` | 159 | "Việc bỏ quên" in the Mac drawer: the worktrees and checkouts of the repositories the office knows that still hold work (files not committed, commits not pushed, stashes), and worktrees with nothing left in them that could go. |
| `ui/stuck.js` | 97 | Stuck sessions ("Ngắt vòng lặp kẹt", server/loops.mjs): the card in the group chat (what repeats, Stop, a hint for Claude) and the row in Settings → More (on or off, after how many failures, after how many minutes of spending with nothing edited). |
| `ui/task-sheet.js` | 98 | "Giao việc": giving Claude work from the group chat (server/tasks.mjs runs it on the Mac). |
| `ui/topbar.js` | 230 | Phone modal, notifications, the night switch. |
| `ui/wrapped.js` | 103 | The week in review: a 1080 × 1350 picture card (the office as it looks right now, then the week's numbers) to save as a PNG or copy, for sharing. |