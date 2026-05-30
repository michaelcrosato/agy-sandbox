# ROADMAP

Engineering roadmap for `agy-sandbox`. This is the **how we harden and ship** view; the **what the
game becomes** view (North Star + pillars P1–P8) lives in [`docs/GOAL.md`](docs/GOAL.md) and is not
duplicated here. Operating rules: [`AGENTS.md`](AGENTS.md).

## Assessment (2026-05-28)

- **Health:** 496 Jest tests / 27 suites green; ESLint clean; Prettier clean across CI scope.
- **Was red, now fixed:** CI's `prettier --check` step was failing on 8 `src/` files because the
  local gate only ran lint+test. Reformatted; the new `npm run agent:check` mirrors CI so it can't recur.
- **Architecture:** clean separation — pure headless engine (`engine/physics/net/persistence`),
  orchestrating server, rendering client. Engine is well-tested; **`src/server.js` (~1900 lines) and
  `src/client/*` are not unit-tested.**
- **Product state:** P1 persistence (save/restore + autosave) and P7 delta netcode have shipped;
  P2/P3/P4/P5/P6 foundations exist as pure modules but several are **not yet wired into the live
  runtime** (e.g. `FactionRegistry`, `GenerativeMissions`, `UtilityAI`). See each pillar's "Next" in `docs/LOG.md`.

## Phases

Work top-down; within a phase, take the smallest green slice.

### 1. Stabilize ✅
- Verify and fix the gate so `main`/CI is green. → **done** (Prettier fix; see `tickets/TICKET003` context).

### 2. Tooling & deps ✅
- `npm run agent:check` mirrors CI; cross-platform `scripts/agent/*` wrappers; `.aiignore`; `.env.example`. → **done** (`tickets/TICKET002`).
- Dependency hygiene: declare `http-server` (used by `npm run dev` via `npx`), add an `engines` field / `.nvmrc`. → **done** (`tickets/TICKET001`).

### 3. Docs & onboarding ✅
- `AGENTS.md`, `ROADMAP.md`, `docs/ai/REPO_MAP.md`, refreshed `README.md`. → **done** (`tickets/TICKET002` / updated).
- Keep `docs/GOAL.md` ↔ repo reality in sync each iteration (per the loop).

### 4. Bugs & tests
- Fix NaN price-poisoning in `EconomyManager.normalizePrices`. → **done** (`tickets/TICKET003`).
- Self-heal already-non-finite market values + guard heartbeat diffusion. → **open** (`tickets/TICKET015`).
- Kill→restart→rejoin persistence integration test (proves the "world moved" showcase). → **open** (`tickets/TICKET016`).
- All other early bugs, sector boundaries, presence leases, and mining multiplier fixes. → **done** (`tickets/TICKET006` through `TICKET014`).

### 5. Modularity ✅
- Extract testable units out of `src/server.js` (handlers, broadcast, persistence wiring) so the
  orchestration layer gains real test coverage without a rewrite. → **done** (extracted supervisor, GC, galaxy ticker, lobby sync; see `tickets/TICKET005`).

### 6. Features (product pillars — `docs/GOAL.md`)
- Wire faction standings dynamically into planetary market price calculations. → **open** (`tickets/TICKET017`).
- Wire the other already-built pure systems into the live runtime (P3 factions → NPC spawns;
  P4 generative missions → landing flow; P5 utility AI → `AIController` advisory), then P2 production
  chains and P7 interest management. Acceptance = each pillar's DoD in `docs/GOAL.md`.

### 7. CI
- CI already runs format+lint+test on push/PR to `main`. Future: add the Prettier/lint/test matrix on
  Node 20/22, and consider gating the overnight runner on `agent:check` (it currently runs lint+test only).

## Risks & blockers

- **Substrate is read-only** (`AGENTS.md §0`) — never modify; plan around it.
- **`src/server.js` is large and untested** — highest regression risk; change surgically, prefer extraction.
- **Client is not headlessly testable** — verify UI changes in a browser; don't claim UI success from tests.
- **localtunnel** (public play) is an external dependency with a first-visit gate; not needed for local dev.
- No secrets are committed; automation env vars are documented in `.env.example` (see `.env.example`).

## Maintenance loop

Every iteration follows the loop in `AGENTS.md §2`: status → orient → select one unblocked ticket →
change + test → `npm run agent:check` → update docs/ticket/`docs/LOG.md` → file follow-ups → (commit on
green per `.github/AGENT_RULES.md`) → summarize.
