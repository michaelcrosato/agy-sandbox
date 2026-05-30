# PROGRESS — Blueprint Execution Tracker

State for downstream agents. Legend: `[ ]` Todo · `[~]` In Progress · `[x]` Done. Update the line when
you claim/finish a spec. Order = recommended execution order (see [`ROADMAP.md`](ROADMAP.md)). Specs are
in [`specs/`](specs/).

_v1 baseline (2026-05-28): 569 tests / 33 suites; 2 high `npm audit` advisories (axios via localtunnel)._
_v2 re-audit baseline (2026-05-29, after Phase 0+1): 614 tests / 42 suites; 0 CVEs._
_**v3 re-audit baseline (2026-05-30, ENTIRE v2 blueprint shipped): 696 Jest tests / 51 suites + 17 client
green; 0 `npm audit` vulnerabilities; `npm outdated` empty; typecheck gate + CI LTS matrix live; AoI +
binary protocol + factions + goal-driven NPCs + ore chain + scaling first slice all DONE.** Remaining =
v3 Phase 0 (026–029) + Phase 1 (030–035) + Phase 2 scale-out (019b–f, 036–038)._

## v3 — Next cycle (NEW · Todo) — see [`ROADMAP.md`](ROADMAP.md)

### Phase 0 — Quick Wins & Safety
- [ ] `026` CI Node 22/24/26 matrix + engines floor `>=22` — _blocked by: none_
- [ ] `027` Pin/document the `ws` CVE-2026-45736 security floor (≥ 8.20.1) — _blocked by: none_
- [ ] `028` Fix hit-flash armor-branch dead code (real bug, found by 021) — _blocked by: none_
- [ ] `029` Reputation `decayAll` heartbeat hook — _blocked by: none_

### Phase 1 — Core Upgrades & Debt Paydown
- [ ] `030` Engine typecheck ratchet (`src/engine` + `persistence`) — _blocked by: none_
- [ ] `031` `COMMODITIES` centralization — _blocked by: none_
- [ ] `032` Mission + trade faction standings — _blocked by: none_
- [ ] `033` UtilityAI advisor wider rollout + goal→action mapping — _blocked by: none_
- [ ] `034` Continue `server.js` extraction (round 3) — _blocked by: none_
- [ ] `035` Client visual layer (Vitest Browser Mode + Playwright) — _blocked by: none_

### Phase 2 — Scale-Out & Competitive Features
- [ ] `019b` RedisStore behind `Store` — _blocked by: none_
- [ ] `019c` Worker process model — _blocked by: 019b (recommended)_
- [ ] `019d` Sticky routing / LB front door — _blocked by: 019c (recommended)_
- [ ] `019e` Cross-process presence (Redis pub/sub + leases) — _blocked by: 019b_
- [ ] `019f` Graceful drain / zero-downtime restart — _blocked by: 019c, 019e (recommended)_
- [ ] `036` Matchmaking with room filters + queue — _blocked by: none_
- [ ] `037` `permessage-deflate` compression eval (benchmark) — _blocked by: none_
- [ ] `038` Schema-based state encoding eval — _blocked by: 015 (done)_

## ✅ Phase 0 — Quick Wins & Safety (DONE)
- [x] `001` Remediate localtunnel/axios CVEs — **done** (files: `src/server.js` dynamic optional import + graceful fallback, removed `localtunnel` from `package.json`/lockfile, `README.md` cloudflared guidance; `npm audit` → 0 vulnerabilities)
- [x] `002` Harden ws inbound (maxPayload + Origin verifyClient) — **done** (files: new `src/net/originPolicy.js` + `.test.js`; `src/server.js` WSS sets `maxPayload: 256KB` + `verifyClient` same-origin/allowlist check)
- [x] `003` ws connection heartbeat / dead-socket reaper — **done** (files: new `src/net/heartbeat.js` + `.test.js`; `src/server.js` 30s ping/terminate sweep, per-connection `isAlive`+pong, cleared on shutdown)
- [x] `004` ws outbound backpressure handling — **done** (files: new `src/net/backpressure.js` + `.test.js`; `src/server.js` broadcast loop checks `ws.bufferedAmount` → skip deltas / drop hopeless clients)
- [x] `005` Dependency hygiene (ws 8.21, http-server, engines, .nvmrc) — **done** (files: `package.json` ws@^8.21.0 + http-server devDep + `engines.node>=20` + `dev` uses local binary; `.nvmrc`; lockfile. Supersedes TICKET001)
- [x] `006` Economy NaN self-heal + heartbeat diffusion guard — **done** (files: `src/engine/EconomyManager.js` self-heals non-finite price→baseline; `src/engine/GalaxyHeartbeat.js` skips/guards non-finite operands; +3 tests. Closes TICKET003 follow-up)

## ✅ Phase 1 — Core Upgrades (DONE)
- [x] `007` Modularize server.js (extract tested units) — **done** (files: new `src/engine/Outfitting.js` (applyOutfitStats), `src/net/statsPayload.js` (buildStatsPayload), `src/server/roomLifecycle.js` (shouldGcRoom + sanitizeNickname) + tests; `src/server.js` routes through them, behavior-identical, boots. Supersedes TICKET005)
- [x] `008` Persistence kill→restart→rejoin integration test — **done** (file: new `src/persistence/restart.integration.test.js` — real JsonFileStore round-trip, fresh manager/instance, asserts markets+pulses+full player ledger. Supersedes TICKET004)
- [x] `009` Decouple threat detection from ship names; wire seeded names — **done** (files: `AIController.isPirateShip` role-precedence + null-safe; `GameInstance` loot branch routes through it; `spawnNPCPirate` sets `role="pirate"` + procedural `NameGenerator` names; +3 tests)
- [x] `010` Observability: structured logging + runtime metrics — **done** (files: new `src/net/metrics.js` + `src/net/logger.js` + tests; `src/server.js` `/metrics` route + clients/rooms gauges, tick_ms, broadcast_bytes, slow_client_drops, heartbeat_reaps, connections_total)
- [x] `011` ESLint 9→10 migration — **done** (files: `package.json` eslint ^10 + explicit `@eslint/js`/`globals` devDeps; fixed 3 real `no-useless-assignment` findings in `CanvasRenderer.js`/`UIController.js`; flat config unchanged; lint exit 0)
- [x] `012` Jest 29→30 migration — **done** (files: `package.json` jest ^30.4; suite passes unchanged (614/42) under the existing ESM invocation; no config/source changes; no open handles, no flakiness over 2 runs)
- [x] `013` Migrate @google/generative-ai → @google/genai — **done** (files: `scripts/run-agent.js` new unified SDK — `GoogleGenAI({apiKey})`, `models.generateContent`, `Type.*` schema, `result.text`, model `gemini-2.5-pro`; `package.json` swap to devDependency `@google/genai`; runtime `dependencies` now just `ws`; no-key path exits with a clear message, no stack trace)

## Wave A — Continued hardening & 2026 modernization (NEW · v2 re-audit)
- [x] `020` Salvage outfit dedup (→ applyOutfitStats) — **done** (files: new `src/engine/outfitCatalog.js` (DEFAULT_OUTFITS, single source) + `.test.js`; `Planet.js` + `server.js` salvage both import it; salvage applies stats via `applyOutfitStats` — now covers the EW outfits it silently ignored; server.js −107 LOC → 1979; tractor-mass note → BACKLOG.md)
- [x] `021` Client test harness (Vitest + jsdom) — **done** (files: new `vitest.config.js` (jsdom env, scoped to `src/client/**`), `jest.config.json` (ignores `/src/client/` so the two runners never cross), `test:client` npm script, `.github/workflows/ci.yml` separate `client-tests` job; extracted `NetworkHandler.applySnapshotMessage`/`applyDeltaMessage` out of the socket closure; new `src/client/__tests__/NetworkHandler.test.js` (7) + `UIController.test.js` (10) = 17 client tests green. Jest engine suite untouched at 628/44; `agent:check` stays green. jsdom (not browser-mode) chosen — no browser binary in sandbox; the spec's own test strategy lists `browser/jsdom`. Found a real dead-branch bug (armor hit-flash unreachable) → BACKLOG. Playwright visual-regression smoke deferred → BACKLOG-worthy follow-up.)
- [x] `022` CI Node LTS matrix (20/22/24) + version alignment — **done** (files: `.github/workflows/ci.yml` `strategy.matrix.node-version: [20,22,24]` + `${{ matrix.node-version }}`, `fail-fast: false`; `.nvmrc` → 22 (Maintenance LTS). Local gate green on Node 24; CI runs 20/22 on push.)
- [x] `023` dotenv 16→17 bump — **done** (files: `package.json` dotenv ^17.4; `scripts/run-agent.js` `dotenv.config({ quiet: true })` to suppress the new v17 banner; no-key smoke clean; `npm outdated` now empty; audit 0)
- [x] `024` JSDoc typecheck gate (`tsc --noEmit` over checkJs) — **done** (files: `tsconfig.json` (checkJs, phase-1 scope = net/physics/server, green); `typescript`+`@types/node` devDeps; `typecheck` npm script now in `agent:check` + `ci.yml`; fixed a real stale `@type` in `WeaponArchetypes.js` (missing FLAK). Engine ratchet (~70 JSDoc findings) → BACKLOG.)
- [x] `025` Continue server.js extraction (message handlers) — **done** (files: new `src/engine/Trading.js` (`tradeOne` + `applyHullPurchase`) + `.test.js` (9); `server.js` `trade` + `ship_buy` handlers route through them, behavior-identical, boots; server.js → 1938 LOC)

## Phase 2 — Major Features
- [x] `014` Interest management (viewport/proximity delta filtering) — **done** (files: new pure `src/net/interest.js` (`interestFilter(entities, viewer, {radius, alwaysIncludeId, alwaysIncludeIds})`, fail-open, order-preserving) + `.test.js` (9, incl. the DoD 50-entity/8-viewer bandwidth-reduction harness). `server.js` broadcast loop reworked from one-frame-for-all to **per-client** framing: serialize the room once, then per client AOI-filter against its ship + frame via `nextFrame` against a **per-client** baseline (`client.broadcastState`), always including the client's own ship; the baseline advances only on a successful send so a backpressure-skipped client never desyncs; `joinRoom` seeds the per-client baseline. Entities entering/leaving AOI become natural add/remove deltas (StateCodec), so no client-side ghosts. `INTEREST_MANAGEMENT=0` env restores send-all. 670 tests / 48 suites green; live `ws` smoke confirmed a client receives init + state_snapshot (40 in-AOI entities) + state_delta. Browser visual-render check is the only headlessly-unverifiable bit; combat-target always-include refinement → BACKLOG-worthy.)
- [x] `015` Binary wire protocol for broadcasts — **done** (files: new pure `src/net/BinaryCodec.js` — versioned TLV `encode(frame)→Uint8Array`/`decode(buf)→frame` whose key win is a per-frame **key dictionary** (entity field names written once, referenced by varint index) plus zig-zag varint ints + float64 + length-prefixed UTF-8; preserves `undefined` delta-removal fields JSON drops. `BinaryCodec.test.js` (13): exhaustive round-trip (`toStrictEqual`), version/truncation/type-guard rejection, **binary < JSON for a 40-entity keyframe**, and a `StateCodec` churn integration. `server.js` broadcast encodes state frames to binary (default on; `BINARY_PROTOCOL=0` → JSON fallback) and counts `broadcast_bytes` by byteLength; `NetworkHandler` sets `binaryType="arraybuffer"` and decodes ArrayBuffer frames (chat/etc. stay JSON). 683 tests / 49 suites + 17 client green; live `ws` smoke confirmed a client decodes **binary** state_snapshot (52 entities) + state_delta end-to-end. Browser visual render is the only headlessly-unverifiable bit; a string-value dictionary is a future compaction.)
- [x] `016` Faction runtime wiring (P3) — **done** (files: `GameInstance` now owns a `FactionRegistry` (created before `seedGalaxy`), tags planets via new `assignPlanetFactions()` + NPC ships by role (Pirates/Federation/Independents), hands guards a `standingPolicy()` + `factionPolicy()` and pirates a `factionPolicy()`, and adjusts the killer's standing with the victim's faction on every NPC kill (propagates to allies/enemies). New `FactionRegistry.standingPolicy()` (per-player view) + `AIController` `standingPolicy` option → a guard now targets a player whose standing with its faction is hostile. New `Trading.factionPrice()` applied in the `server.js` trade handler (friendly discount / hostile surcharge); `server.js` land handler refuses docking when hostile; `Planet` gains a `faction` field. Persistence already round-trips the registry (verified). New `faction.integration.test.js` (9) incl. the scripted DoD: one standing swing changes BOTH guard targeting AND dock price. 657 tests / 47 suites green; server boots. Mission/trade standing hooks + reputation decay → BACKLOG (the generated-mission consequence pipeline isn't server-wired yet).)
- [x] `017` Goal-driven NPC runtime (UtilityAI→AIController, P5) — **done** (files: new `src/engine/ai/buildPerception.js` (pure live-state→perception adapter: threats/prey/trades classifiers, all overridable) + `.test.js` (14, incl. the selectGoal showcase); `AIController` gains `useUtilityAdvisor` (default **off** so the 36 legacy tests are byte-identical) — when on it consults `selectGoal(buildPerception(...))`, stores `currentGoal`, and lets **FLEE** pre-empt the role FSM via new `executeFlee` (evade nearest threat); new `AIController.advisor.test.js` (6); `GameInstance` enables the advisor at all merchant/guard/pirate spawns. Delivers GOAL P5 "changes its plan": a merchant flees a pirate then patrols when clear; a wounded pirate breaks off a guard. 648 tests / 46 suites green; server boots. Wider rollout (server boss/escort, REGROUP/TRADE/ENGAGE mapping) → BACKLOG.)
- [x] `018` Production chains + ore commodity (P2) — **done** (files: new 7th commodity `ore` added consistently to `Ship.cargo`, `Trading.applyHullPurchase` reset, `Planet` default market, and all 8 `BASE_MARKETS` (mining hubs cheap, industrial worlds pricier); `Mining.oreResource` `minerals`→`ore` so generic asteroids drop raw ore. `ProductionModel`: New Polaris/Aurelia are now ore-producing **mining hubs**; Sigma Draconis/Valkyrie consume ore and **refine** it into minerals/machinery via a new `refines` profile edge + `refineGain`/`maxRefineBoost` options + chain coupling in `applyProductionPulse` (cheap input boosts refined output → upstream shock propagates downstream). Tests: `Planet.test`/`serializers.test` updated to the 7-commodity set, `Mining.test` to raw ore, +4 chain tests in `ProductionModel.test`. Serializers are generic (spread) so ore auto-persists. 661 tests / 47 suites green; server boots. `COMMODITIES` centralization + player-side ore refining → BACKLOG.)
- [x] `019` Horizontal scaling (multi-process/Redis, P7) — **first slice done** (DoD met: decomposition doc + minimal slice + no single-process regression). Files: new pure `src/net/roomRouter.js` — `assignShard(roomId, shardCount)` (deterministic FNV-1a hash → shard) + `RoomRegistry` (roomId→nodeId ownership with claim/release/transfer/`roomsForNode`/serialize) + `roomRouter.test.js` (11); `src/persistence/multinode.integration.test.js` (2) — two in-test "nodes" sharing one `Store` both restore the same persisted galaxy and a room handed off A→B preserves state (presence persisted via the store); design doc `plan/specs/019a_scaling_decomposition.md` decomposing the epic into shippable sub-specs **019b** RedisStore, **019c** worker process model, **019d** sticky routing, **019e** cross-process presence/lease, **019f** graceful drain — each with its own DoD. Router/registry are standalone (not wired into the live server) so single-process local play is unchanged; server still boots. 696 tests / 51 suites green. Real Redis/multi-host infra is the documented ops follow-up (019b–f).

## Completed before this blueprint (context)
The EW1–EW9 easy-win backlog from `docs/ai/FEATURE_PLAN.md` is **done** (combat rating, jettison, port
services, passenger missions, name generator, FLAK+Interceptor, hyperdrive fuel, boarding, mining) —
see `tickets/TICKET006–014` and `docs/LOG.md` iter-0016…0024. Do not re-do these.
