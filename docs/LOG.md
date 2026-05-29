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

## 2026-05-28T22:40 · iter-0007 · GREEN · p3-reputation-shapes-hostility-prices

- **Baseline:** `238d374` on branch `overnight/bugfix-and-coverage`; 361 tests / 21 suites green.
- **Move:** Make standing matter — give the P3 faction core a market and a target reticle, so the same number that classifies disposition also shapes prices and decides which faction-tagged ship a guard chases.
- **Changed:**
  - `src/engine/FactionRegistry.js`: added `maxPriceSwing: 0.2` to `DEFAULT_OPTIONS`; exported pure helpers `priceModifier(standing, opts, mode='buy'|'sell')` (linear in standing, saturating at the band edges, friendlier = lower buy / higher sell) and `dockingPermitted(standing, opts)` (hostile refused, neutral/friendly allowed); added instance methods `disposition`, `dockingPermitted`, `priceModifier`, and `factionPolicy()` returning a frozen `{ getRelation, isHostile, isAllied }` view derived from the relations table so consumers don't couple to the registry's player-standing surface.
  - `src/engine/Ship.js`: optional `faction` constructor parameter (default `null`) stored on the ship. Absent/null is the legacy state.
  - `src/engine/ai/AIController.js`: constructor takes a third options arg `{ factionPolicy }`; added `shouldTarget(ent)` predicate — when both self and candidate carry a faction AND a policy is supplied, guards target faction-hostile ships and pirates skip allies/own-faction; otherwise the legacy `isPirateShip` name classifier is used unchanged. `scanSensors` collapses to a single nearest-`shouldTarget` scan.
  - `src/engine/FactionRegistry.test.js`: +17 deterministic cases — `dockingPermitted` direction + custom thresholds, `priceModifier` zero-pivot / buy & sell direction / band clamping / swing tunability, registry-level `disposition`/`dockingPermitted`/`priceModifier` wiring, and `factionPolicy` shape (frozen, neutral self-vs-self, correct hostile/allied lookups).
  - `src/engine/ai/AIController.test.js`: +9 cases covering guard engaging hostile-faction non-pirate-named ships, ignoring allied and neutral factions, picking the nearer of two hostiles; pirate skipping fellow-pirates and same-faction ships; legacy name-based fallback when self lacks a faction, when target lacks a faction, and when no policy is configured; and merchant role rejecting targets under all conditions.
- **Decisions:** Made the faction path strictly additive — a policy is required AND both ships must carry a faction tag to leave the legacy code path, so every existing 386-strong test is unchanged and every server/main.js `new AIController(...)` call still works. Designed `priceModifier` with a single `mode` argument rather than two helpers, with `sell = 1 + t*swing` mirroring `buy = 1 - t*swing` so the algebra is one-line to reason about. Pushed `factionPolicy()` as a derived view rather than passing the whole registry into `AIController` to keep the controller decoupled from per-player standings (which it does not need to make pairwise faction decisions).
- **Validation:** `npm test` → 386 passed (21 suites); `npm run lint` → clean.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review. Pre-existing prettier drift on `FactionRegistry.js`/`FactionRegistry.test.js`/`ProductionModel.js` is unchanged; the new code I added in those files is prettier-clean.
- **Next:** Wire `factionPolicy()` into the live `GameInstance`/server NPC spawn paths so spawned guards/pirates actually receive it; expose `priceModifier` to `EconomyManager.getPrice` and the market UI so a friendly Federation dock shows a visibly discounted buy column; have `MissionManager` reward/penalize faction standings on outcome so the loop "action → standing → price/hostility" closes end-to-end.

## 2026-05-28T22:10 · iter-0006 · GREEN · p5-utility-ai-scoring

- **Baseline:** `3fc5655` on branch `overnight/bugfix-and-coverage`; 329 tests / 20 suites green.
- **Move:** Lay Pillar P5's groundwork — a pure, headless, deterministic utility-scoring module that scores high-level NPC goals from a perception snapshot, without disturbing the existing `AIController` FSM.
- **Changed:**
  - `src/engine/ai/UtilityAI.js` (new) exports `Goals` (ENGAGE/FLEE/TRADE/REGROUP/PATROL), `GOAL_ORDER`, `DEFAULT_UTILITY_OPTIONS` (frozen tuning knobs: `sensorRange`, `engageBoost`, `engageThreatPenalty`, `fleeArmorWeight`/`fleeThreatBase`/`fleeThreatArmorWeight`, `tradeThreatPower`, `regroupBoost`/`regroupArmorFloor`/`regroupArmorDamp`, `patrolBaseline`, `readinessArmorWeight`/`readinessShieldWeight`), helper primitives (`clamp01`, `proximityFactor`, `maxThreatPressure`, `bestOpportunity`, `combatReadiness`, `normalizeSelf`, `selfStateFromShip`), per-goal scorers (`scoreEngage`, `scoreFlee`, `scoreTrade`, `scoreRegroup`, `scorePatrol`), and the two top-level entry points `evaluateGoals(perception, options?)` and `selectGoal(perception, options?)`. ENGAGE = `bestPrey * readiness * (1 - engageThreatPenalty * threat) * engageBoost`, readiness = `armor * (armorW + shieldW * shield)` (multiplicative in armor so a glass-cannon never reads ready). FLEE = `armorPanic * fleeArmorWeight + threat * (fleeThreatBase + fleeThreatArmorWeight * armorPanic)` with `armorPanic = (1 - armor)^2` (sharp ramp). TRADE = `bestTrade * (1 - threat)^tradeThreatPower` (collapses near hostiles). REGROUP = `(1 - shield) * armorOK * (1 - threat)^2 * regroupBoost` where armorOK damps to `regroupArmorDamp` below `regroupArmorFloor` so FLEE wins at critical armor. PATROL = constant `patrolBaseline`. Pure JS — no DOM/sockets/`Math.random`; option merging via `{ ...DEFAULT, ...options }` so partial overrides stay safe.
  - `src/engine/ai/UtilityAI.test.js` (new) — 32 deterministic Jest cases covering: primitive bounds (clamp01 rejects non-finite, proximity is 1 at touch and 0 at sensor edge), threat aggregation (max not sum, ignores out-of-range), best-opportunity scoring, monotonic FLEE in armor and threat, ENGAGE rising with prey weakness/proximity and falling under threat, TRADE collapsing near hostiles, REGROUP rewarding shield-deficit+safety but damped when armor is critical or hostiles loom, PATROL as a tunable constant baseline. Five "representative situations" assert end-to-end goal selection: healthy + weak prey → ENGAGE, critical armor + threat → FLEE (even when tempting prey is available), idle (no opps, no threats) → PATROL, safe + juicy trade → TRADE, low-shield + healthy armor + safe → REGROUP, plus a threat-saturated case and a weak-far-prey case that confirms ENGAGE doesn't always dominate. Determinism is locked down: same perception → identical output across calls, `evaluateGoals` accepts deeply-frozen inputs without throwing (no mutation), ties broken by `GOAL_ORDER`, partial option overrides correctly merge with defaults, `DEFAULT_UTILITY_OPTIONS` is frozen. `selfStateFromShip` is verified against a real `Ship` instance (full and wounded).
- **Decisions:** Made ENGAGE's readiness *multiplicative* in armor (not weighted-sum) so the spec's "FLEE dominates ENGAGE at critical armor" property holds robustly without needing a hard FLEE override — at armor=0.1 the engage ceiling drops below 0.12 even with full shields/energy and a perfect prey, while FLEE rises past 0.9 with any threat. Used `(1 - armor)^2` rather than a linear ramp for FLEE so a wounded but not yet critical agent doesn't panic, but a critical one does — a *legible* sharp curve. Picked `max(threat * proximity)` over a sum for threat pressure to keep the scale in [0,1] regardless of crowd size (a single close fighter and a swarm of distant ones both produce coherent scores). Broke ties by a fixed `GOAL_ORDER` instead of insertion order on a Map so the determinism property is documented and testable. Kept `AIController` untouched — the task asked for a consultable helper, and tangling the FSM with this would risk regressions in the existing 36 AIController tests.
- **Validation:** `npm test` → 361 passed (21 suites); `npm run lint` → clean; `npx prettier --check src/engine/ai/UtilityAI.js src/engine/ai/UtilityAI.test.js` → clean after `--write`.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review. Pre-existing prettier drift on `src/engine/FactionRegistry.js`, `FactionRegistry.test.js`, and `ProductionModel.js` is unchanged — out of scope.
- **Next:** Wire `selectGoal` into `AIController` as an advisory layer behind a feature flag — e.g. let pirates consult UtilityAI each scan to decide whether to keep chasing or break off; have merchants reroute when FLEE clears a threshold near a known threat. Build `buildPerception(ship, entities)` so callers don't hand-roll the snapshot. Extend the goal catalogue with PURSUE (long-range chase distinct from ENGAGE) and DOCK (when a planet/station is nearby and cargo is high).

## 2026-05-28T21:35 · iter-0005 · GREEN · p6-outfit-mass-handling

- **Baseline:** `334c65b` on branch `overnight/bugfix-and-coverage`; 320 tests / 20 suites green.
- **Move:** Land Pillar P6's first slice — give every outfit a real downside so loadout becomes a tradeoff instead of free stat gain, by scaling acceleration and turn responsiveness inversely with total ship mass.
- **Changed:**
  - `src/engine/Ship.js` captures `hullMass` at construction (from the mass `SpaceEntity` assigns), tracks `outfitMass` (starts at 0), and exposes `addOutfitMass(delta)` (ignores non-finite / non-positive deltas, sums into `outfitMass`, keeps `this.mass = hullMass + outfitMass`) plus `getEffectiveTurnRate()` (returns `turnRate * hullMass / mass`, falling back to the raw rate if mass is degenerate). The rotational control branch in `update()` now drives `angularVelocity` from the effective rate, so heavy ships pivot slower under the same nominal turnRate. Linear acceleration already scaled via `SpaceEntity.update`'s `a = F / m`, so no new code is needed on the linear axis.
  - `src/engine/Planet.js` outfitter catalogue now carries an optional `mass` (kg) on every default entry. Calibrated per the task spec: Heavy Shields 800, Aegis Shield Matrix 1500, Sub-space Cargo Compressor 1200, Expanded Cargo Holds 500, Neutron Blaster 600, Plasma Cannon 300, Ion Disruptor Array 250, Cold-Fusion Reactor 350, Cryo-Cooling Radiator 250, Supercapacitor Cells 200, Tractor Beam Matrix 200, Overcharged Engines 200, Hyper-Drive Thrusters 400 — shields/cargo dominate; engines and small modules barely register.
  - `src/server.js` outfit_buy and salvage paths call `clientObj.ship.addOutfitMass(outfit.mass)` after applying stat gains, so the runtime ship that the client steers actually inherits the handling tradeoff. Salvage's inline `defaultCatalog` mirror was updated to carry the same mass values.
  - `src/engine/Ship.test.js` extended with a `Ship outfit mass handling tradeoff (P6)` describe — 6 deterministic Jest cases: defaults capture hullMass/outfitMass, addOutfitMass accumulates and updates `mass` (hullMass immutable), guards on 0/negative/NaN/Infinity, `getEffectiveTurnRate` is 1x at hull mass and scales with the mass ratio, two ships with identical thrust but 4× mass land velocities in a 1:4 ratio after 1s thrust, two ships with identical turnRate but 2× mass yield heading 2.5 vs 1.25 after 1s right turn, and a fully-loaded build (+2800 kg outfit mass on a 2000 kg hull) accelerates and turns by exactly the stock/loaded mass ratio.
  - `src/engine/Planet.test.js` extended with two cases asserting every default outfit has a positive numeric mass and the shields/bulk-cargo > engines mass ordering holds.
- **Decisions:** Stored `hullMass` once at construction rather than re-deriving from the spec table — clean, headless, and keeps every existing call site (server, AI, missions) blind to mass plumbing. Scaled rotation by `hullMass / totalMass` (linear mass scaling) instead of by `1 / mass^k` — matches the task framing that mass should make ships sluggish in direct proportion, parallels the natural linear `a = F / m` axis, and is trivial to reason about in tests. Mirrored the mass table into the salvage defaultCatalog rather than pulling it from the planet's outfitter so plundering an outfit at zero range still applies the right mass even when the originating planet is out of scope.
- **Validation:** `npm test` → 329 passed (20 suites); `npm run lint` → clean; `npx prettier --check src/engine/Ship.test.js src/engine/Planet.test.js src/engine/Ship.js src/engine/Planet.js src/server.js` → clean.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review. Pre-existing prettier drift on `src/engine/FactionRegistry.js`, `FactionRegistry.test.js`, and `ProductionModel.js` is unchanged — out of scope for this slice.
- **Next:** Surface ship mass + outfit-mass total in the stats payload so the HUD can show players the handling cost; expose `mass` (or a derived "agility" stat) in the spaceport outfitter UI so the tradeoff is legible at purchase time; let hulls carry distinct `hullMass` values from the shipyard catalogue so a Heavy Freighter isn't just a "Shuttle with more stats" — it's intrinsically more sluggish.

## 2026-05-28T21:05 · iter-0004 · GREEN · p3-faction-reputation-core

- **Baseline:** `25feb2b` on branch `overnight/bugfix-and-coverage`; 290 tests / 20 suites green.
- **Move:** Land Pillar P3's foundation — a pure, headless faction & reputation core whose standings clamp, propagate through allies/enemies, classify, and decay toward neutral, ready for P1 persistence to save later.
- **Changed:**
  - New `src/engine/FactionRegistry.js` exporting `DEFAULT_FACTIONS` (Federation, Frontier League, Pirates, Independents), `DEFAULT_RELATIONS` (symmetric ally/enemy/neutral table), `DEFAULT_OPTIONS` (band `[-100,100]`, classify thresholds `±30`, propagation `0.5`, decay `0.01`), `classifyStanding` helper, and a `FactionRegistry` class with `getStanding` / `setStanding` (clamped) / `getAllStandings` / `getRelation` / `adjustStanding` (propagates a fraction of the requested delta to allies as same-sign, to enemies as opposite-sign — even when the primary write clamps, so diplomatic fallout survives a cap) / `classify` / `decay` (per-player toward zero) / `decayAll` / `serialize` (deep-copy, JSON-safe) / static `fromJSON`.
  - New `src/engine/FactionRegistry.test.js` — 30 deterministic Jest cases covering classify thresholds and inclusivity, default roster + relation symmetry, getRelation fallback to neutral, clamping at floor/ceiling with default and custom bands, zero-delta no-op, primary clamp under propagation pressure, per-player isolation, malformed-relations self-reference guard, classify thresholds + overrides, decay direction for positive/negative/zero standings, many-step decay-toward-zero without crossover, decayAll touching every player, determinism across two registries, and serialize/fromJSON round-trip + JSON-safety + defensive copy.
- **Decisions:** Propagation uses the REQUESTED delta, not the post-clamp change — the task framed it as a player's action having consequences, so being already maxed with Faction A still angers A's enemies. Kept the class headless, plain-data, and not wired into the server or AI (also per task spec) so P1 persistence can serialize `registry.serialize()` alongside markets without coupling to runtime state. Inclusive classification at the threshold (`>=30` friendly, `<=-30` hostile) so callers can hit "friendly" exactly at `30`.
- **Validation:** `npm test` → 320 passed (20 suites); `npm run lint` → clean.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review.
- **Next:** Wire `FactionRegistry` into `GameInstance` and have `AIController` consult `classify()` to gate hostility/hails so the standing actually changes NPC behaviour (the P3 DoD); have `EconomyManager` skew buy/sell prices by player's faction standing where the planet sits; extend `GalaxyHeartbeat` to decay standings on its slow pulse so reputation ages with the world.

## 2026-05-28T20:30 · iter-0003 · GREEN · p2-production-model

- **Baseline:** `86b6c6b` on branch `overnight/bugfix-and-coverage`; 259 tests / 18 suites green.
- **Move:** Land Pillar P2's first slice — turn the heartbeat from pure diffusion into a real producer/consumer economy whose planets actually make and use goods.
- **Changed:**
  - New `src/engine/ProductionModel.js` exporting `PLANET_PROFILES` (data table mapping each seeded planet to a producer/consumer mix — agri worlds produce food, mining hubs produce minerals, industrial colonies produce machinery/electronics, pirate anchorage produces contraband, etc.), `computeCommodityPressure` (pure, bounded next-price function: `current + baseline * (consume*rate - produce*rate)` clamped to `[minFactor, maxFactor] * baseline`), and `applyProductionPulse` (mutates one planet's market for one pulse, rounded, returning changed-commodity list).
  - `GalaxyHeartbeat.pulse()` now applies the production step first, before lane diffusion and equilibrium drift. New `profiles` and `productionOptions` constructor fields default to `{}` / `DEFAULT_PRODUCTION_OPTIONS`, so existing heartbeat tests/call sites continue to behave identically when no profiles are configured.
  - `GameInstance` imports and passes `PLANET_PROFILES` into its `GalaxyHeartbeat`, wiring the real economy in for live game rooms.
  - New `src/engine/ProductionModel.test.js` — 19 deterministic Jest cases covering pressure direction, bounds clamping at floor and ceiling, no-op when profile is empty or commodity is missing, profile-table coverage of every seeded planet, single- and multi-pulse heartbeat integration, propagation of production pressure through lane diffusion to a neighbor, and backwards-compatibility (heartbeat with no profiles behaves like before).
- **Decisions:** Production runs sequentially before diffusion within a pulse rather than being folded into a single simultaneous update — the task spec explicitly required "before lane diffusion," and since each planet's production depends only on its own market the order remains irrelevant within the production step. Kept profile strengths conservative (mostly 1.0) and rates gentle (2% of baseline per pulse) so diffusion and equilibrium still matter at the showcase scale.
- **Validation:** `npm test` → 278 passed (19 suites); `npm run lint` → clean.
- **Notes:** Substrate untouched. No push/merge — local on the feature branch for human review.
- **Next:** Add a propagation showcase test (a producer's surplus measurably depresses neighbor prices over N pulses against a baseline); model raw → refined → manufactured production chains so mining hubs feed industrial colonies; let player bulk trades feed the same pressure model so a cornered commodity ripples like a shock.

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