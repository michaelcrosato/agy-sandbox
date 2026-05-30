# PROGRESS — Blueprint Execution Tracker

State for downstream agents. Legend: `[ ]` Todo · `[~]` In Progress · `[x]` Done. Update the line when
you claim/finish a spec. Order = recommended execution order (see [`ROADMAP.md`](ROADMAP.md)). Specs are
in [`specs/`](specs/).

_v1 baseline (2026-05-28): 569 tests / 33 suites; 2 high `npm audit` advisories (axios via localtunnel)._
_**v2 re-audit baseline (2026-05-29, after Phase 0+1 shipped): 614 tests / 42 suites green; 0 `npm audit`
vulnerabilities; ESLint 10 + Jest 30 + Prettier clean; ws hardened + observability + partial server
modularization.** Remaining = Wave A (020–025) + Phase 2 (014–019)._

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
- [ ] `014` Interest management (viewport/proximity delta filtering) — _blocked by: 015 (recommended)_
- [ ] `015` Binary wire protocol for broadcasts — _blocked by: none_
- [ ] `016` Faction runtime wiring (P3) — _blocked by: none_
- [ ] `017` Goal-driven NPC runtime (UtilityAI→AIController, P5) — _blocked by: none_
- [ ] `018` Production chains + ore commodity (P2) — _blocked by: none_
- [ ] `019` Horizontal scaling (multi-process/Redis, P7) — _blocked by: 007, 010, 015 (recommended)_

## Completed before this blueprint (context)
The EW1–EW9 easy-win backlog from `docs/ai/FEATURE_PLAN.md` is **done** (combat rating, jettison, port
services, passenger missions, name generator, FLAK+Interceptor, hyperdrive fuel, boarding, mining) —
see `tickets/TICKET006–014` and `docs/LOG.md` iter-0016…0024. Do not re-do these.
