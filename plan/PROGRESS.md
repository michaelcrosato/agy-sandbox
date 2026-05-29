# PROGRESS — Blueprint Execution Tracker

State for downstream agents. Legend: `[ ]` Todo · `[~]` In Progress · `[x]` Done. Update the line when
you claim/finish a spec. Order = recommended execution order (see [`ROADMAP.md`](ROADMAP.md)). Specs are
in [`specs/`](specs/).

_Baseline at blueprint generation (2026-05-28): 569 tests / 33 suites green; ESLint + Prettier clean;
2 high `npm audit` advisories (axios via localtunnel)._

## Phase 0 — Quick Wins & Safety
- [x] `001` Remediate localtunnel/axios CVEs — **done** (files: `src/server.js` dynamic optional import + graceful fallback, removed `localtunnel` from `package.json`/lockfile, `README.md` cloudflared guidance; `npm audit` → 0 vulnerabilities)
- [x] `002` Harden ws inbound (maxPayload + Origin verifyClient) — **done** (files: new `src/net/originPolicy.js` + `.test.js`; `src/server.js` WSS sets `maxPayload: 256KB` + `verifyClient` same-origin/allowlist check)
- [x] `003` ws connection heartbeat / dead-socket reaper — **done** (files: new `src/net/heartbeat.js` + `.test.js`; `src/server.js` 30s ping/terminate sweep, per-connection `isAlive`+pong, cleared on shutdown)
- [ ] `004` ws outbound backpressure handling — _blocked by: none_
- [ ] `005` Dependency hygiene (ws 8.21, http-server, engines, .nvmrc) — _blocked by: none_
- [ ] `006` Economy NaN self-heal + heartbeat diffusion guard — _blocked by: none_

## Phase 1 — Core Upgrades
- [ ] `007` Modularize server.js (extract tested units) — _blocked by: none (eased by 002–004)_
- [ ] `008` Persistence kill→restart→rejoin integration test — _blocked by: none_
- [ ] `009` Decouple threat detection from ship names; wire seeded names — _blocked by: none_
- [ ] `010` Observability: structured logging + runtime metrics — _blocked by: none_
- [ ] `011` ESLint 9→10 migration — _blocked by: none_
- [ ] `012` Jest 29→30 migration — _blocked by: none_
- [ ] `013` Migrate @google/generative-ai → @google/genai — _blocked by: none_

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
