# System Blueprint & Target Specification

## Lifecycle State Machine

- **CURRENT_STATE:** ACTIVE_SPECIFICATION
- **TARGET_INFRASTRUCTURE:** Multi-agent scale-out for sequential and concurrent autonomous coding
- **PRODUCT:** `Starfall: Living Galaxy` — a persistent browser-native multiplayer space sim where the world keeps living whether or not players are connected.

This file is the **product blueprint**: North Star, invariants, architecture constraints, and pillar intent. It is not the live work queue and not the loop prompt.

- Live work queue: `plan/PROGRESS.md` + `plan/specs/`
- Loop prompt: `plan/GOAL_PROMPT.md`
- Operating manual: root `AGENTS.md`

Real repo state outranks this document. When docs, code, tests, logs, and CI conflict, inspect reality, fix the repo, and update writable docs.

---

## North Star

Build a galaxy that is **alive without you**.

A player should be able to log off, return later, and find that the world changed for simulation-derived reasons: markets shifted, factions reacted, NPCs adapted, and ignored opportunities were resolved by the world rather than frozen in time.

The product bar:

- A stranger opens a browser tab and is flying within 60 seconds.
- Within 10 minutes, the player makes a choice the world remembers.
- The player can understand why the galaxy reacted.

---

## Design Tenets

1. **Simulation over scripting.** Prefer systems that produce stories over hand-authored story beats.
2. **Every action leaves a mark.** Trades, kills, missions, travel, docking, and presence should mutate state.
3. **Legible depth.** Deep systems must expose causes clearly to the player.
4. **The server dreams.** The authoritative server advances the galaxy independent of connected clients.
5. **Headless, testable core.** Simulation logic stays pure, deterministic, and unit-tested.
6. **Small green slices.** A shippable vertical slice beats a broad broken refactor.
7. **Parallel-safe work.** Specs should declare touched files so non-overlapping work can run concurrently.

---

## Invariants

1. **Main stays green.** Landed work must keep the required gate green.
2. **Substrate is sacred.** Never edit the protected files listed in `AGENTS.md §0` and `docs/AGENT-LOOP.md`.
3. **Authoritative server.** The server is the single source of truth; the client renders and requests.
4. **Determinism in tests.** Randomness in simulation code is seeded or injected.
5. **Engine purity.** `src/engine`, `src/physics`, `src/net`, and `src/persistence` do not depend on DOM, sockets, timers, direct filesystem effects, or unseeded randomness in test-reachable paths.
6. **No weakened gates.** Do not skip, delete, or loosen tests to hide failures.
7. **Preserve attempts.** Failed work is archived or logged before rollback.
8. **No placeholders.** Every change must be complete, tested, and production-ready for its slice.

---

## Current Product State

Verify current counts and details from `plan/PROGRESS.md`, `docs/LOG.md`, CI, and actual test output. Avoid hand-maintained LOC/test numbers in prose.

Delivered or substantially delivered:

- Authoritative multi-room WebSocket server and Canvas client.
- Persistent player and galaxy state behind a swappable store.
- Server-side galaxy heartbeat that advances economy and reputation decay without connected players.
- Dynamic markets, production chains, refining, shortages/surpluses, trade-lane propagation, and economic shock events.
- Faction standing model wired into prices, docking, taxes, tolls, patrols, contraband scans, NPC hostility, vouchers, and conflict zones.
- Mission, bounty, passenger, smuggler, and storyline foundations with faction consequences.
- Utility-AI advisor for NPC behavior with perception-driven FLEE/REGROUP/TRADE/ENGAGE behavior.
- Ship/outfit/fleet systems with heat, energy, mass, ramming, shield-pierce, interdiction, wingman orders, and command progression.
- Delta/keyframe state sync, interest filtering, binary broadcast framing, room routing, Redis-store foundations, worker supervisor, sticky routing, pub/sub presence leases, graceful drain, matchmaking, metrics, and dashboard.
- Client HUD/spaceport/radar/event presentation with Vitest client coverage and browser-test support.

Known frontiers:

- Wire generated, world-derived missions into the landing flow as the primary contract source.
- Finish fittings/loadout presets and deeper ship identity work.
- Make onboarding and game feel strong enough for a first-time player without external instructions.
- Continue shrinking `src/server.js` into tested handler modules.
- Add machine-generated repo maps/metrics so hand-written counts stop drifting.
- Prove multi-host scale and client/server happy paths with reproducible smoke/e2e gates.

---

## Product Pillars

### P1 — Persistent Living Universe

**Goal:** World and player state survive restarts, reconnects, and offline time.

**Status:** Core delivered for player and galaxy state; deepen faction/event persistence and migration coverage.

**DoD:** Kill server, restart, rejoin, and verify player plus heartbeat-aged world state restored. Offline ticks produce explainable market/faction drift.

### P2 — Emergent Economy

**Goal:** Prices and opportunities emerge from production, consumption, shocks, routes, factions, and player action.

**Status:** Core delivered; deepen multi-tier chains, smuggling economics, and UI cause explanations.

**DoD:** Supply shocks propagate through connected systems; bulk trades move price; generated missions reference and mutate real market state.

### P3 — Faction & Reputation Web

**Goal:** Factions remember and react.

**Status:** Substantially delivered; deepen territory control and long-term conflict pressure.

**DoD:** Player action changes standing; standing changes NPC behavior, port economics, and access; changes persist.

### P4 — Generative Missions & Narrative

**Goal:** Missions arise from actual galaxy state.

**Status:** Foundations delivered; runtime landing-flow integration remains the main frontier.

**DoD:** Generated missions reference current shortages, conflict, piracy, or faction state; completion mutates world state; generation is seeded and tested.

### P5 — Intelligent NPCs

**Goal:** NPCs pursue goals, adapt to threats/opportunity, and create pressure in the world.

**Status:** Utility advisor delivered; deepen persistent goals, learned routes, vengeance, territory pressure, and fleet-level decisions.

**DoD:** NPC plans change when world state changes, under deterministic tests.

### P6 — Ship Identity & Fleet Command

**Goal:** Ships, fittings, and fleets create meaningful tradeoffs and tactical identity.

**Status:** Mostly delivered; fittings/loadout presets remain a current live spec.

**DoD:** Loadouts produce measurable performance differences; wingmen execute commands; fitting math is tested.

### P7 — Netcode & Scale

**Goal:** Authoritative multiplayer remains efficient, resilient, and horizontally scalable.

**Status:** Major foundations delivered; prove multi-host scale and load targets.

**DoD:** Target entity/client counts hold tick/bandwidth budgets; reconnect and room handoff preserve state.

### P8 — Presentation & Game Feel

**Goal:** A first-time player can understand and enjoy the game without external explanation.

**Status:** Partial; this is a top remaining product frontier.

**DoD:** A first-time player can fly, fight, dock, trade, accept a mission, and understand consequences within 60 seconds; automated smoke/e2e covers the happy path.

---

## Phase II Horizon

Promote these into `plan/specs/` when P1-P8 depth stops producing higher-leverage work.

- **H1 — The Chronicle:** player-readable causal history explaining why the galaxy changed.
- **H2 — Territory & Conquest:** faction borders move with conflict outcomes and player action.
- **H3 — Proven Scale:** reproducible multi-worker/Redis load harness with p99 tick and bandwidth targets.
- **H4 — Ship-Quality Onboarding:** touch input, audio, damage/thruster feedback, and first-session polish.

---

## Target Architecture

- `src/server.js` trends toward a thin composition root. Runtime behavior belongs in tested modules under `src/server/`, `src/engine/`, `src/net/`, or `src/persistence`.
- Engine, physics, net, and persistence modules remain pure and deterministic.
- Backward-compatible additive slices are preferred over rewrites.
- Parallel work uses non-overlapping file sets and isolated branches/worktrees.
- Generated context should replace hand-maintained volatile metrics where practical.

---

## Non-Goals

- Offline client-authoritative game mode.
- High-fidelity 3D/WebGL rewrite.
- Custom TCP/UDP networking beyond application framing over WebSockets.
- Payment, licensing, anti-cheat, or commercialization systems.
- Dependency on one model vendor or one agent runtime.
- Broad rewrites without an incremental green migration path.

---

## Constraints & Assumptions

- **Node policy:** `.nvmrc` pins local dev to Node 24; `package.json` requires Node `>=22`; CI verifies Node 22/24/26.
- **Language:** plain ESM JavaScript with JSDoc/checkJs; no CommonJS; no runtime compilation; no build step.
- **Randomness:** core simulation packages must use injected or seeded randomness.
- **Shard model:** each shard/worker owns isolated state boundaries; cross-shard coordination uses store/pub-sub/lease abstractions.

---

## How to Pick the Next Move

1. Read the canonical order in `AGENTS.md`.
2. Confirm no substrate mutation is planned.
3. Reconcile this blueprint against `plan/PROGRESS.md`, selected spec, code, tests, CI, and recent `docs/LOG.md` entries.
4. Prefer repo-health work if the gate, docs, queue, or safety layer would mislead agents.
5. Otherwise choose the lowest-numbered unblocked product pillar/spec that visibly advances the North Star.
6. Implement the smallest green slice.
7. Run the required gate.
8. Update progress, writable docs, and log entries truthfully.

---

## Definition of Done

A slice is done only when:

1. The required gate actually ran and passed; usually `npm run agent:check`.
2. Behavior changes have deterministic tests.
3. No substrate file changed.
4. Purity boundaries held.
5. `plan/PROGRESS.md` and the selected spec are updated.
6. `docs/LOG.md` is updated when its schema requires it.
7. The final handoff states validation run, unvalidated areas, and the next best move.
