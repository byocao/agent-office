# Agent Office

English · [Tiếng Việt](README.vi.md)

Your Claude Code sessions as characters on a side-view pixel stage. Each session has a holographic workstation: it
types while it works, hops with a "!" when it waits for you, does its special move on a commit and, while it rests,
lives a life of its own (up on a platform, a coffee at the cart, a chat or a sparring match with someone else). Click
someone for their visual-novel scene: their Live2D art, what their AI is doing step by step, what it last said, and a
line to write back to it. The art, stages and voices come from your own copy of a game (`scripts/vn-assets.py`), never
from this repository.

![Agent Office: six sessions at work on the neon street stage](docs/media/demo.gif)

| Click someone: their scene, what their AI is doing, a line back to it | Another stage: the cathedral |
| --- | --- |
| ![A session's visual-novel card: Live2D art, context, cost, its last steps and its last answer](docs/media/card.png) | ![The sessions on the cathedral stage](docs/media/church.png) |

> A community project, not made by or affiliated with Anthropic.

## Quick start

Needs **Node.js 20.9+** and **Claude Code**. Runs on macOS, Linux and Windows.

```bash
git clone https://github.com/byocao/agent-office.git && cd agent-office
npm install
node bin/cli.mjs install --service   # add the hooks and run the office in the background
node bin/cli.mjs doctor              # check that everything works
```

Open <http://localhost:4310>. Just want a look first? Run `npm run dev` and open <http://localhost:4310/?demo>
(made-up sessions, no Claude Code needed).

`install` backs up `~/.claude/settings.json` first and only adds its own hooks. To remove everything:
`node bin/cli.mjs uninstall`.

## The art

The characters, their Live2D models, the stages and the voice lines are built on your computer from your own copy of
the game, into `public/assets/vn/` (git ignores it):

```bash
pip install UnityPy pillow numpy
python -I scripts/vn-assets.py "<the game's folder>"            # the six heroines in colours of their own
python -I scripts/vn-assets.py "<the game's folder>" --original # the game's own colours
```

Without them the office says how to build them. The colours are set in `scripts/vn_recolor.py`.

## Commands

| Command | What it does |
| --- | --- |
| `install` | Adds the hooks, the status line and usage telemetry to Claude Code. |
| `uninstall` | Removes all of it and keeps the rest of your settings. |
| `doctor` | Checks each part and tells you how to fix what is missing. |
| `start` | Runs the server in this terminal. |
| `pin [--new]` | Shows (or changes) the PIN phones sign in with. |

Options for `install`:

- `--service`: start the office automatically at login.
- `--lan`: let phones on the same Wi-Fi open it.
- `--no-approve`: don't answer permission requests from the office.
- `--no-status`: leave your status line alone.
- `--no-otel`: don't turn on Claude Code's usage telemetry.

Logs are in `data/server.log`. `doctor` also prints how to restart the background service on your system.

## Features

**Watch your sessions**
- Every session is a character on the stage at a holographic workstation: blue and scrolling while it works, amber
  with a "!" while it waits for you. Subagents are penguins at their boss's heels.
- A commit, a push or green tests: the special move, confetti and a cheer from whoever is near. A failure knocks them
  down and someone comes over. New sessions drop in from the sky; finished ones leap away.
- Click someone for their visual-novel scene: Live2D art that blinks and talks, context and cost meters, the AI's
  last steps as they happen, its last answer, and a box to write back to it (a new turn, or between two steps).
- A timeline and replay of the last hour or day, and a weekly recap card.

**Answer Claude from the office**
- Permission requests, questions and plans appear as cards (keys Y / N / A).
- Risky commands (`rm -rf`, force push, `sudo`, `curl | sh`, anything with "prod") are red and need two clicks.
- A session that hits the same error 3 times in a row is stopped and told to try something else.

**Keep an eye on your plan and your machine**
- Plan usage (5-hour and weekly limits) with warnings at 80% and 95%. Several Claude accounts, with automatic
  switching when one runs out.
- "What eats your plan": cost split by MCP server, skill, subagent, model and project.
- RAM, CPU and disk, forgotten dev servers, idle sessions, and one-click cleanup.
- Forgotten work: worktrees with uncommitted or unpushed changes.

**Use it from your phone**
- Same Wi-Fi, Tailscale, or anywhere through a Cloudflare tunnel. Signed in with a 6-digit PIN.
- Watch, approve (if you allow it on the computer), chat with a session or give Claude new work.
- Push notifications when Claude answers or needs you.

**Have some fun**
- Three stages (neon street, cathedral, arcade) with parallax and animated neon, a camera that drifts and shakes.
- Resting sessions live their own lives: up on a platform, a coffee at the cart, a chat or a sparring match.
- Battle voice lines when you pick someone, when they win and when they fall (with the sound on), real weather, day
  and night, and a team group chat.
- English and Vietnamese (Settings → Display).

## Privacy

- **Everything runs on your computer.** Hooks post to `127.0.0.1`. If the office is off, Claude Code works as usual.
- Strings that look like passwords, tokens or API keys are masked before they are stored or shown.
- Your Claude login is read from the system keychain each time and never stored.
- Phones can only connect after you turn it on, need the PIN, and can't approve anything unless you allow it.
- Every stop, cleanup and approval is logged in `data/actions.log`.

These network calls can be turned off:

| Call | Off switch |
| --- | --- |
| Plan usage | `OFFICE_USAGE=0` |
| GitHub CI status (through your `gh` login) | `OFFICE_CI=0` |
| Translating to Vietnamese | `OFFICE_TRANSLATE=0` |
| Weather | leave the city empty in Settings |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OFFICE_PORT` | `4310` | Port |
| `OFFICE_HOST` | `127.0.0.1` | Address to listen on (`install --lan` sets it) |
| `OFFICE_LANG` | `en` | Default language (`en` or `vi`) |
| `OFFICE_DATA_DIR` | `data/` | Where the office keeps its files |

## Development

```bash
npm run dev                                    # http://localhost:4310/?demo with hot reload
npm run lint && npm run typecheck && npm test  # checks and unit tests
npm run build && npm run test:e2e              # end-to-end tests
```

| Part | Folder | Built with |
| --- | --- | --- |
| Server | `server/` | Node.js |
| Web page | `app/`, `src/components/` | Next.js |
| The café | `src/office/` | plain canvas |
| Text on screen | `src/i18n/locales/` | one folder per language |

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

- Ideas from agents-at-work, cubicle-crew (MIT, dangerous-command patterns) and cc-reaper (Apache-2.0, RAM and CPU
  rules).
- qrcode.js (MIT); Be Vietnam Pro and JetBrains Mono fonts (SIL OFL).
- [Simple Icons](https://simpleicons.org) (CC0); weather from [Open-Meteo](https://open-meteo.com).
- Live2D models are played with [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) (MIT) and
  Live2D's Cubism Core for Web, which `vn-assets.py` downloads from Live2D under its own licence.
- The characters, stages and voices belong to the game's studio; they are not part of this repository.

## License

[MIT](LICENSE)
