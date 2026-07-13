# Starfall: Living Galaxy

A browser-native multiplayer space-trading and combat game built inside an autonomous-engineering sandbox.

There are two layers:

- **The game:** an authoritative Node/WebSocket server simulates a persistent galaxy; a Canvas client lets players fly, fight, trade, dock, and take missions in a shared world.
- **The harness:** a principle-governed autonomous loop uses specs, deterministic gates, and an operational ledger to keep improving the repo.

North Star: **a galaxy that is alive without you** — markets, factions, NPCs, missions, and consequences continue to evolve server-side. See [`docs/GOAL.md`](docs/GOAL.md).

---

## Quick start

Requires Node.js ≥ 22 (`.nvmrc` pins 24).

```powershell
npm ci
node src/server.js
```

Open **http://localhost:8080** in a modern browser.

> `npm run dev` only serves static files. It does not run the authoritative simulation or multiplayer server.

### Play with friends

Keep `node src/server.js` running and expose it with a tunnel, for example:

```bash
cloudflared tunnel --url http://localhost:8080
```

Send the generated `https://…trycloudflare.com` URL. Other players need only a browser.

### Controls

| Action      | Keys              |
| ----------- | ----------------- |
| Thrust      | `W` / `↑`         |
| Brake       | `S` / `↓`         |
| Turn        | `A` `D` / `←` `→` |
| Fire        | `Space`           |
| Afterburner | `Shift`           |

Approach a planet slowly to land, then use the spaceport UI to trade, outfit, buy ships, and take missions.

---

## Configuration

Everything is optional; the server boots with sensible defaults.

- **Environment variables** — documented in [`.env.example`](.env.example) (port, persistence dir,
  autosave cadence, protocol feature flags, origin allowlist, scaling, guest-sandbox secrets).
- **Hot-reloaded tunables** — [`plan/config.json`](plan/config.json) is watched at runtime
  (`src/net/ConfigWatcher.js`): WebSocket/API rate limits, faction-standing thresholds,
  connection-flood caps, resource limits, firewall allowlist. Edits apply without a restart.
- **Scaling** — single process by default. Set `WORKERS=N` for sharded cluster mode
  (`src/server/supervisor.js`), and `REDIS_URL` (+ `REDIS_SCALE_OUT=1`) to swap the JSON file store
  and in-memory pub/sub for Redis. Without Redis the server persists to `PERSISTENCE_DIR` (default
  `./data`). Smoke-test cluster mode with `npm run cluster:smoke`; benchmark with
  `npm run benchmark:cluster`.
- **Observability** — `/metrics` endpoint, plus two HTML dashboards served by the game server:
  `http://localhost:8080/dashboard.html` (ops telemetry) and
  `http://localhost:8080/dashboard-codex.html` (the "Living Codex" code map). The codex dashboard
  is a static page that fetches `/codex`; run `npm run codex:generate` first to produce the
  `plan/codex.json` it reads.

---

## Validation

```powershell
npm run agent:check          # full gate: substrate integrity + format + lint + typecheck + Jest + client tests
npm run agent:check:core     # faster inner-loop gate, excludes client tests
npm test                     # Jest suite (engine/physics/net/persistence/server, incl. integration)
npm run test:client          # Vitest client suite (jsdom)
npm run test:client:browser  # Vitest browser suite (Playwright/Chromium; win32 golden screenshots)
npm run lint
npm run typecheck
npm run format:check
```

Do not claim a change is green unless the relevant command actually ran and passed.

CI (`.github/workflows/ci.yml`) mirrors the gate on Node 22/24/26 for every push/PR to `main`/`master`/`develop`, plus the jsdom client suite. The browser-screenshot suite is local-only (Windows baselines).

---

## Architecture

```text
Browser client (index.html + src/main.js + src/client/*)
  │  WebSocket (JSON in / binary state broadcasts out)
  ▼
verifyWebSocketClient (origin allowlist, flood sentry)
  ▼
clientConnection.preprocessMessage (rate limit, backpressure, parse, schema validation)
  ▼
messageRouter → ~20 typed handlers (src/server/*Handlers.js)
  ▼
GameInstance rooms tick at 30 Hz (src/engine/* pure simulation)
  ▼
roomBroadcast (area-of-interest filtering + binary codec) → clients
```

- `src/server.js` is a composition root: it wires the tested modules under `src/server/` and owns
  only the tick interval and process lifecycle.
- `src/engine/`, `src/physics/`, `src/net/`, `src/persistence/` are pure (no DOM, sockets, timers,
  or unseeded randomness in test-reachable paths) — enforced by convention and tests.
- Persistence is JSON snapshots via `src/persistence/Store.js` by default, Redis optional.
- The guest-runner sandbox under `src/net/Guest*.js` is harness infrastructure for running
  untrusted automation scripts locally with egress/resource governance; it is not part of the
  player-facing game loop.

For a per-module map, regenerate and read [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) (`npm run codex:generate`).

---

## Canonical docs

| File                                         | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                     | Canonical operating manual for agents and humans. Read first.  |
| [`docs/AXIOMS.md`](docs/AXIOMS.md)           | Immutable constitution; substrate, read-only.                  |
| [`docs/AGENT-LOOP.md`](docs/AGENT-LOOP.md)   | Compliance protocol; substrate, read-only.                     |
| [`docs/GOAL.md`](docs/GOAL.md)               | Product blueprint and architecture intent.                     |
| [`plan/PROGRESS.md`](plan/PROGRESS.md)       | Live work queue and resume anchor.                             |
| [`plan/specs/`](plan/specs/)                 | Atomic specs for waves 001–177 (status in `plan/PROGRESS.md`). |
| [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) | Generated repo navigation map for agents.                      |
| [`docs/LOG.md`](docs/LOG.md)                 | Reverse-chronological operational ledger.                      |

Historical ledgers (completed waves, journals, superseded blueprints) live in [`plan/archive/`](plan/archive/).

---

## Repository layout

```text
├── AGENTS.md                 <- canonical agent/human operating manual
├── docs/
│   ├── AXIOMS.md             <- substrate constitution
│   ├── AGENT-LOOP.md         <- substrate compliance protocol
│   ├── GOAL.md               <- product blueprint
│   ├── LOG.md                <- operational ledger (rotated into docs/log/)
│   └── ai/REPO_MAP.md        <- generated agent repo map
├── plan/
│   ├── GOAL_PROMPT.md        <- unattended loop prompt
│   ├── PROGRESS.md           <- live queue / resume anchor
│   ├── config.json           <- hot-reloaded runtime tunables
│   ├── specs/                <- atomic specs (001–177)
│   └── archive/              <- completed-wave ledgers
├── scripts/
│   ├── agent/                <- cross-platform gate helpers, codex generator, cluster smoke/bench
│   ├── run-agent.js          <- GitHub issue-triggered agent (label: autonomous)
│   ├── run-afk-loop.*        <- local unattended loop launchers
│   └── claude-night.ps1      <- overnight task queue runner
├── src/
│   ├── server.js             <- authoritative server composition root
│   ├── server/               <- extracted server modules (+ testSupport/ harness)
│   ├── engine/               <- pure simulation modules
│   ├── physics/              <- pure physics primitives
│   ├── net/                  <- protocol, security sentries, metrics, guest sandbox
│   ├── persistence/          <- store/persistence abstractions
│   └── client/               <- browser client logic (+ __tests__/)
└── index.html, index.css     <- game client shell
```

Generated locally (gitignored): `plan/CODEX.md`, `plan/codex.json`, `plan/monitoring_report.json`, `browser_recordings/`, `data/`.

---

## Security

The server is designed to be safe to run locally and to expose to friends; a few controls matter
when exposing it to the public internet:

- **Admin/sandbox HTTP API** (`/api/sandbox/execute`, `/api/sandbox/kill`, `/api/firewall/rules`) is
  gated: it accepts only loopback callers, or requests carrying a matching `X-Admin-Token` header
  when `ADMIN_TOKEN` is set (constant-time compared). With no token set, remote callers are refused
  rather than served — so exposing the port does not expose remote code execution.
- **Static file serving** is allowlist-based (`src/net/httpSecurity.js`): only web asset extensions
  are served, and dotfiles (`.env`, `.git`), config, `data/`, and `node_modules/` are refused.
- **`X-Forwarded-For`** is ignored unless `TRUST_PROXY=1`, so connection-flood limits can't be
  bypassed with a spoofed header when the server is directly exposed.
- **Request bodies** on admin POST routes are capped (256 KB) to prevent memory-exhaustion.
- Client-supplied room `mode`/`tags` are sanitized server-side before storage, neutralizing stored
  XSS into the operator dashboards.

Residual risks when publicly exposed (see `plan/BACKLOG.md`): `/metrics` and other telemetry
endpoints are unauthenticated reads (put behind a reverse proxy / firewall if the data is
sensitive), and the HTML dashboards render server data via `innerHTML` (the server-side sanitization
above is the active mitigation; escaping in the dashboards themselves is still recommended).

## Known limitations

- No authentication or accounts: players are identified by a per-connection random id and a
  self-chosen nickname. Fine for friendly servers; not for open internet deployment.
- `ALLOWED_ORIGINS` defaults to allowing all origins — set it when exposing the server publicly.
- The guest-runner sandbox (`src/net/Guest*.js`) hardens untrusted script execution with static
  analysis, egress/DNS allowlists, and resource caps, but is defense-in-depth, not a security
  boundary; only expose `/api/sandbox/*` to trusted operators.
- The browser visual-regression suite runs only on Windows (win32 golden screenshots) and is not in CI.
- Server logs mix human-oriented emoji lines with the structured JSON logger (`LOG_LEVEL` applies to
  the latter); unification is tracked in `plan/BACKLOG.md`.

## Rules of engagement

- Never modify substrate files listed in `AGENTS.md §0`.
- Keep main green.
- Keep simulation logic deterministic and testable.
- Prefer small vertical slices over broad rewrites.
- Update the spec/progress/log truthfully when work changes reality.
