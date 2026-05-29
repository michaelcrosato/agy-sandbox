# Starfall: Living Galaxy

A real-time, browser-native **multiplayer space-trading and combat game** — built inside a self-directed, principle-governed autonomous-engineering sandbox.

There are two stories here:

- **The game.** A Node WebSocket server simulates an authoritative galaxy; a canvas client lets anyone fly, fight, trade, and take missions in a shared, persistent world. No install — just a URL.
- **The sandbox.** The repository runs under a continuous autonomous loop where a human sets the vision, deterministic gates enforce safety, and a frontier reasoning engine designs and writes the code.

The North Star: **a galaxy that is alive without you** — prices shift, factions move, and the world ages whether or not anyone is watching. See [`docs/GOAL.md`](docs/GOAL.md) for the full blueprint.

---

## Quick Start — Play the Game

```powershell
# 1. Install dependencies (first time only)
npm install

# 2. Start the authoritative multiplayer server (HTTP + WebSocket on :8080)
node src/server.js
```

Then open **http://localhost:8080** in any modern browser.

> `npm run dev` only serves static files — it does **not** run the simulation or multiplayer. Use `node src/server.js` for the real game.

### Play with friends — they only need the URL

The server is the authoritative host — keep `node src/server.js` running and expose it with a tunnel. The recommended, dependency-free way is **Cloudflare Tunnel** (`cloudflared`):

```bash
cloudflared tunnel --url http://localhost:8080
```

It prints a public `https://…trycloudflare.com` link — send it to friends, they open it in a browser and join your live sector. **They install nothing.**

> **Why not bundled?** The previously-bundled `localtunnel` pulls a years-old, vulnerable `axios` (SSRF/DoS advisories), so it was removed from the runtime dependencies. The server still supports it as an **optional** extra: run `npm i localtunnel` and it will auto-open a `*.loca.lt` URL on startup (otherwise it prints the `cloudflared` hint and runs fine locally).

### Controls

| Action        | Keys              |
| ------------- | ----------------- |
| Thrust        | `W` / `↑`         |
| Brake (retro) | `S` / `↓`         |
| Turn          | `A` `D` / `←` `→` |
| Fire weapon   | `Space`           |
| Afterburner   | `Shift` (hold)    |

Approach a planet slowly to land, then use the on-screen spaceport to trade commodities, buy outfits, purchase ships, and accept missions.

---

## Features

- **Authoritative multiplayer** — 30Hz server simulation, multiple sector rooms, lobby, and squad fleets.
- **Living economy** — six commodities with dynamic price elasticity, shortage/surplus events, and a **galaxy heartbeat** that ages the market and diffuses price shocks along sector trade lanes even with no players online.
- **Deep combat** — shields, armor, energy and heat budgets, overheat meltdown, disable-before-destroy, **shield-piercing weapons**, **ramming impact damage**, and an **afterburner**.
- **Ships & outfitting** — six purchasable hulls and a dozen outfit modules (shields, engines, weapons, cargo, reactors, tractor beam, Ion Disruptor, and more).
- **Missions & progression** — delivery contracts, bounties, and a multi-stage storyline.
- **A populated galaxy** — merchant, guard, pirate, and escort AI; multi-sector navigation with warp gates, autopilot, and a galaxy map; nebula hazards and sector-wide EMP/siege events.
- **Physics** — uniform spatial-grid broad-phase collision with elastic resolution.

---

## Testing & Quality

```powershell
npm run agent:check   # the full gate: Prettier --check + ESLint + Jest (mirrors CI)
npm test              # Jest suite (engine, physics, economy, missions, AI, netcode)
npm run lint          # ESLint over src and scripts
npm run format        # Prettier (src, scripts, .github markdown, README)
```

The engine is written headless and pure (no DOM, no sockets) so the simulation is fully unit-tested. Every feature ships with tests; the suite and lint must stay green.

---

## Repository Layout

```text
├── docs/
│   ├── AXIOMS.md       <- The constitution (immutable principles, read-only substrate)
│   ├── AGENT-LOOP.md   <- Compliance protocol & write-protection registry (substrate)
│   ├── GOAL.md         <- Strategic blueprint (Starfall: Living Galaxy, pillars P1-P8)
│   ├── LOG.md          <- Reverse-chronological operational ledger
│   └── ai/REPO_MAP.md  <- Repo map for agents (where logic/tests/config live)
├── scripts/
│   ├── run-autonomous-loop.ps1   <- Core local autonomous loop driver
│   ├── claude-night.ps1          <- Unattended overnight task-queue runner
│   ├── run-agent.js              <- GitHub Actions issue-triggered agent
│   ├── local-gate.ps1            <- Workspace validation gate (substrate)
│   ├── agent/                    <- Cross-platform agent wrappers (check = CI gate, doctor, status...)
│   └── ...                       <- Integrity/compliance tooling (substrate)
├── src/
│   ├── server.js       <- WebSocket + static HTTP game server
│   ├── main.js         <- Browser client bootstrap
│   ├── engine/         <- Headless simulation
│   │   ├── SpaceEngine.js      <- Physics orchestrator (spatial grid, collisions, ramming)
│   │   ├── GameInstance.js     <- Per-room authoritative world
│   │   ├── GalaxyHeartbeat.js  <- Player-independent economic simulation
│   │   ├── EconomyManager.js   <- Dynamic markets (elasticity + events)
│   │   ├── MissionManager.js   <- Missions, bounties, storyline
│   │   ├── Ship.js, Projectile.js, Planet.js, CargoPod.js
│   │   └── ai/AIController.js   <- Merchant / guard / pirate / escort AI
│   ├── physics/Vector2D.js
│   └── client/         <- Canvas renderer, input, networking, spaceport UI
├── index.html, index.css
├── AGENTS.md           <- Canonical agent operating manual (CLAUDE.md is a thin pointer to it)
├── ROADMAP.md          <- Engineering phases + ticket map
├── tickets/            <- Atomic, executable work items (TICKET0NN.md)
└── night-queue/        <- Local-only overnight task queue (gitignored)
```

---

## Project documentation

| Doc                                          | What                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                     | Canonical operating manual for coding agents — **read first**. |
| [`docs/GOAL.md`](docs/GOAL.md)               | Product blueprint: North Star, invariants, pillars P1–P8.      |
| [`ROADMAP.md`](ROADMAP.md)                   | Engineering phases and the prioritized ticket map.             |
| [`docs/ai/REPO_MAP.md`](docs/ai/REPO_MAP.md) | Where everything lives; what to skip.                          |
| [`tickets/`](tickets/)                       | Atomic, executable work items.                                 |
| [`docs/LOG.md`](docs/LOG.md)                 | Reverse-chronological operational ledger.                      |

---

## Autonomous Development

This repo is designed to build itself. Two mechanisms drive it:

### 1. The local autonomous loop

```powershell
./scripts/run-autonomous-loop.ps1 'claude -p "Consult docs/AXIOMS.md and docs/AGENT-LOOP.md for compliance constraints. Reconcile workspace reality against docs/GOAL.md, and execute the next highest-leverage engineering move toward that goal." --dangerously-skip-permissions'
```

Each tick the agent grounds itself in the Axioms, reconciles `docs/GOAL.md` against real repo state, ships the highest-leverage increment, forces the validation gate, and — only on green — commits and appends a compressed record to `docs/LOG.md`.

### 2. The overnight task queue

For batched, unattended work, `scripts/claude-night.ps1` drains `night-queue/tasks.json` — one fresh headless Claude per task:

```powershell
pwsh -File scripts/claude-night.ps1            # uses the current feature branch
pwsh -File scripts/claude-night.ps1 -Model sonnet -TaskTimeoutMinutes 30
```

After each task it independently re-runs `npm run lint` and `npm test`, keeping the work **only** if both pass and a commit was made — otherwise it rolls the branch back. It **never pushes and never merges**; everything stays local for review:

```powershell
git log <branch>            # what landed overnight
git diff main..<branch>     # the full change set
```

It refuses to start on a dirty tree or on `main`/`master`, and aborts after three consecutive failures.

### 3. GitHub Actions (issue-triggered)

Opening a GitHub issue with the `autonomous` label triggers `.github/workflows/autonomous-coder.yml`, which runs `scripts/run-agent.js` to implement the task and open a pull request. `ci.yml` runs Prettier, ESLint, and the Jest suite on every push and PR to `main`.

---

## Rules of Engagement (for LLM runtimes)

- **Substrate is sacred.** `docs/AXIOMS.md`, `docs/AGENT-LOOP.md`, and the gate/integrity scripts listed in `docs/AGENT-LOOP.md` are write-protected and must never be modified by an agent.
- **Keep main green.** Only fully validated work (lint + tests passing) lands.
- **Log the truth.** Every code-changing iteration appends a compressed entry to `docs/LOG.md`.
- **Determinism in tests.** Randomness is seeded or injected so the suite is reproducible.

---

## Status & Known Gaps

Health: **496 Jest tests / 27 suites green**, ESLint and Prettier clean (`npm run agent:check`).

**Shipped:** P1 persistence — the heartbeat-aged galaxy and player state autosave to disk and restore on restart/rejoin; P7 delta netcode — the authoritative broadcast ships keyframes + deltas with self-healing resync.

**Next pillars** (foundations built as pure modules; runtime wiring in progress): faction reputation shaping live NPC hostility and prices (P3), generative missions in the landing flow (P4), goal-driven NPCs (P5), and production chains (P2). See [`docs/GOAL.md`](docs/GOAL.md) and [`ROADMAP.md`](ROADMAP.md).
