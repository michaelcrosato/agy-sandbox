# agy-sandbox

A self-directed, principle-governed codebase that runs under a continuous autonomous-engineering loop. A human sets the strategic vision; deterministic gates enforce safety; a frontier reasoning engine designs and writes the code.

The product currently being built inside this sandbox is **a real-time multiplayer space-trading and combat game** (Endless Sky-inspired) — a WebSocket-backed Node server with a browser canvas client.

---

## Quick Start

### Play / run the game

```powershell
# Install dependencies
npm install

# Start the multiplayer server (HTTP static host + WebSocket on :8080)
node src/server.js

# ...or serve the static client only
npm run dev
```

Then open `http://localhost:8080` in a browser. The server also attempts a `localtunnel` for remote play.

### Run the checks

```powershell
npm test      # Jest suite (engine, physics, economy, missions, AI)
npm run lint  # ESLint over src and scripts
npm run format  # Prettier
```

---

## The Autonomous Loop

To run the headless engineering loop (human operator only):

```powershell
./scripts/run-autonomous-loop.ps1 'claude -p "Consult docs/AXIOMS.md and docs/AGENT-LOOP.md for compliance constraints. Reconcile workspace reality against docs/GOAL.md, and execute the next highest-leverage engineering move toward achieving that goal." --dangerously-skip-permissions'
```

Each loop tick:

1. Reads the constitution (`docs/AXIOMS.md`) and protocol (`docs/AGENT-LOOP.md`).
2. Reconciles the strategic target in `docs/GOAL.md` against real repo state.
3. Selects and executes the highest-leverage engineering move.
4. Runs the validation gate (`scripts/local-gate.ps1`). On green it commits; on red it rolls back to the last green `HEAD`.
5. Appends a compressed record to `docs/LOG.md`.

For overnight batch work, `scripts/claude-night.ps1` drains a queue of tasks from `night-queue/tasks.json`, one fresh headless Claude per task.

---

## Repository Layout

```text
├── docs/
│   ├── AXIOMS.md       <- The constitution (immutable principles)
│   ├── AGENT-LOOP.md   <- Compliance protocol & write-protection registry
│   ├── GOAL.md         <- Strategic target & system blueprint
│   └── LOG.md          <- Reverse-chronological operational ledger
├── scripts/
│   ├── assert-gate-integrity.ps1   <- Substrate integrity check
│   ├── local-gate.ps1              <- Workspace validation gate
│   ├── run-autonomous-loop.ps1     <- Core loop driver
│   ├── claude-night.ps1            <- Overnight task-queue runner
│   └── validate-log-compliance.py  <- Ledger compliance auditor
├── src/
│   ├── server.js       <- WebSocket + static HTTP game server
│   ├── main.js         <- Browser client entry/bootstrap
│   ├── engine/         <- Game simulation
│   │   ├── SpaceEngine.js      <- Physics orchestrator (spatial-grid broad-phase)
│   │   ├── GameInstance.js     <- Per-room authoritative world
│   │   ├── Ship.js, Projectile.js, Planet.js, CargoPod.js
│   │   ├── EconomyManager.js   <- Dynamic markets (price elasticity + events)
│   │   ├── MissionManager.js   <- Missions, bounties, storyline
│   │   └── ai/AIController.js   <- Merchant / guard / pirate / escort AI
│   ├── physics/Vector2D.js
│   └── client/         <- Canvas renderer, input, networking, UI
├── index.html, index.css
```

---

## Rules of Engagement for LLM Runtimes

### 1. Substrate isolation

These control-plane files are **write-protected** and must never be modified by an LLM:
`docs/AXIOMS.md`, `docs/AGENT-LOOP.md`, `scripts/assert-gate-integrity.ps1`, `scripts/local-gate.ps1`, `scripts/run-autonomous-loop.ps1`, `scripts/validate-log-compliance.py`, `scripts/manifest.txt`. They are verified at the start of every loop tick.

### 2. Autonomous sovereignty

Beyond the explicit governance constraints, the agent has full engineering autonomy to refactor, redesign, and pivot whenever it maximizes systemic value.

### 3. Machine-precise logging

Every iteration prepends a compressed, fluff-free record directly beneath the `== LOG-ANCHOR ==` token in `docs/LOG.md`.

---

## The Verification Ceiling

Verification is fully automated:

1. **Compilation fencing** — if an iteration introduces failing tests or syntax corruption, `scripts/local-gate.ps1` fails, uncommitted changes are wiped, and the repo rolls back to the last green `HEAD`.
2. **Context compression** — stack traces are filtered at the loop layer; humans interface only with clean commits and the compressed ledger.
