# Operational Log & System Ledger

## Page 1: Rules of the Log (Specification v1.0)

### 1. Conformance Tier Matrix
- **MUST / REQUIRED**: Mandatory. Failing this item makes the file non-compliant.
- **SHOULD / RECOMMENDED**: Strong recommendation. Valid exceptions can exist, but implications must be understood and noted.
- **MAY / OPTIONAL**: Permissive. Truly optional fields or sections.
- **MUST NOT / SHALL NOT**: Absolute prohibition. Doing this breaks compliance or forensic safety.

### 2. File and Ordering Constraints
- This file (`docs/LOG.md`) **MUST** be the single source of truth for repository history.
- Root-level log files or duplicate files (like `LOOP_LOG.md`) **MUST NOT** exist in the workspace.
- Entries **MUST** be written in **newest-first (reverse-chronological)** order. 
- New entries **MUST** be programmatically prepended immediately below the `== LOG-ANCHOR ==` line.
- Agents and humans **MUST NOT** free-hand rewrite or hand-edit older historical entries.

### 3. Entry Content & Structure Rules
- An entry **MUST** be generated only when product code changes, gate status transitions, or a material architecture decision is made.
- Relational or no-op loop triggers that result in no codebase modification **MUST NOT** log an entry.
- Every entry **MUST** use this strict multiline markdown schema:
  `## YYYY-MM-DDThh:mm · iter-NNNN · STATUS · lowercase-kebab-slug`
  * `- **Baseline:**` (Git SHA and starting state)
  * `- **Move:**` (One sentence defining the loop iteration objective)
  * `- **Changed:**` (Bulleted changes list)
  * `- **Decisions:**` (tradeoffs made, or "none")
  * `- **Validation:**` (Command executed and its precise exit/response text)
  * `- **Notes:**` (**OPTIONAL / MAY** — Sandbox area for agent/human thoughts, commentary, or context)
  * `- **Next:**` (1-3 subsequent engineering paths)

### 4. Status Vocabulary
The `STATUS` token in the header line **MUST** be exactly one of: 
`GREEN` (Passed) | `AMBER` (Caveats) | `RED` (Failed) | `BLOCKED` (Waiting) | `INCIDENT` (System Error) | `ROLLBACK` (Reset).

### 5. Size Hard Boundaries
- Individual text lines **MUST NOT** exceed 2,000 characters (guards against single-line data dumps).
- Lines **SHOULD** wrap at or under 120 characters for clean terminal and diff presentation where practical.
- Entries **SHOULD** target 150–350 words, and **MUST NOT** exceed 500 words unless labeled an `INCIDENT` or `ROLLBACK`.
- This file **MUST** be rotated into monthly archives (`docs/log/YYYY-MM.md`) once it crosses 1,000 lines or 250 KB.

---
== LOG-ANCHOR ==

## 2026-05-28T19:45 · iter-0002 · GREEN · p7-state-codec

- **Baseline:** `c04ca91` on branch `overnight/bugfix-and-coverage`; 236 tests / 17 suites green.
- **Move:** Land Pillar P7's foundation — a pure, headless snapshot/delta codec the server can later use to replace full-state broadcasts with deltas.
- **Changed:**
  - New `src/net/StateCodec.js` exporting `encodeSnapshot(entities)`, `diff(prev, next)`, and `applyDelta(snapshot, delta)`. Snapshots index entities by id; diffs carry `{ added, updated:{id:{changedFieldsOnly}}, removed:[ids] }`; applyDelta is non-mutating and deep-clones outputs. Field-level granularity (nested objects replaced whole); `undefined` in updated[id] signals a field removal so round-trip handles disappearing fields.
  - New `src/net/StateCodec.test.js` — 23 deterministic Jest cases (hand-built entities, zero `Math.random`) proving the contract: empty/identity deltas, adds/removes/partials, nested-object replacement, field removal, world clear+populate, combined churn, and a chained sequential-delta scenario. The core invariant `applyDelta(prev, diff(prev,next))` deep-equals `next` is asserted across every shape.
- **Decisions:** Did **not** wire the codec into `src/server.js` — the task scoped it as the headless foundation, and that broadcast change deserves its own slice with reconnection/keyframe-cadence design.
- **Validation:** `npm test` → 259 passed (18 suites); `npm run lint` → clean; `npx prettier --check src/net/*.js` → clean.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review.
- **Next:** Wire StateCodec into `GameInstance` broadcast (per-client last-snapshot, keyframe cadence, reconnect handshake); add an interest-management filter (per-room then per-viewport); benchmark bandwidth vs. full-state in a 50-entity room.

## 2026-05-28T19:16 · iter-0001 · GREEN · combat-heartbeat-and-docs

- **Baseline:** `81c8b88` on branch `overnight/bugfix-and-coverage` (descends from `679ebe3`); 236 tests / 17 suites green prior to docs pass.
- **Move:** Land a combat-depth + living-economy increment, harden stability/perf, then polish all writable docs ahead of a 12-task overnight queue.
- **Changed:**
  - Combat & survival depth: shield-regen combat lockout, shield-piercing damage (`Projectile.shieldPierce`, `Ion Disruptor Array` outfit), afterburner boost (`controls.isBoosting`, Shift), ramming impact damage in `SpaceEngine`.
  - Living galaxy: `GalaxyHeartbeat` ages the economy with no players — prices diffuse along sector trade lanes and drift to baseline; `Planet` retains `.sector`; wired into `GameInstance` + an 8s server interval.
  - Stability/perf: `GameInstance` timer tracking + `destroy()` (fixes GC'd-room respawn-timer leak and the Jest open-handle warning); per-tick broadcast serialized once; `AIController.isPirateShip` null-safe guard.
  - Docs: rewrote `README.md` (game + friends-via-URL + controls + autonomous mechanisms); aligned `.github/AGENT_RULES.md` git workflow with the no-push overnight reality and added substrate/determinism rules; this ledger entry.
- **Decisions:** Treated combat/economy depth as engine-side and fully unit-tested so the gate stays meaningful; left browser/visual work for the queue. Removed obsolete untracked `README-old.md` (superseded; was blocking the clean-tree requirement).
- **Validation:** `npm test` → 236 passed (17 suites); `npm run lint` → clean; `npm run format` applied to README/AGENT_RULES for CI Prettier.
- **Notes:** Substrate (AXIOMS, AGENT-LOOP, gate scripts) untouched. Nothing pushed/merged; work is local on the feature branch.
- **Next:** Run the 12-task overnight queue (P7 codec → P2/P3/P5/P6 engine systems → netcode/persistence/HUD); then P1 persistence so the aged galaxy survives restarts.