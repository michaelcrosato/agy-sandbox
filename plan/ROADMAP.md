# ROADMAP — Audit-Driven Development Blueprint (v3 · 2026-05-30)

Refreshed after the **entire v2 blueprint shipped** — Phase 0 (`001–006`), Phase 1 (`007–013`), Wave A
(`020–025`), and all of Phase 2 (`014–019`) are **DONE and green**. This is the **execution order** for the
next cycle. Atomic work lives in [`specs/`](specs/); status in [`PROGRESS.md`](PROGRESS.md); runtime rules
in [`AGENTS.md`](AGENTS.md). Product North Star + pillars (P1–P8): [`../docs/GOAL.md`](../docs/GOAL.md).

> **What changed since v2:** the repo went from 614 tests / 42 suites (netcode/sim features unbuilt) to
> **696 Jest tests / 51 suites + 17 client tests, 0 CVEs**, now shipping per-client **interest management**
> (AoI), a **binary wire protocol** (key-dictionary codec), **faction runtime wiring** (standings drive
> prices + NPC targeting + docking), **goal-driven NPCs** (UtilityAI advisor), a **production chain** (raw
> `ore` → refined goods), a **client test harness** (Vitest+jsdom), an **engine typecheck gate** (scoped),
> a **CI Node LTS matrix**, and the **horizontal-scaling first slice** (router + shared-store proof +
> decomposition). The remaining work is a **continued-hardening / 2026-modernization** wave, a set of
> **debt-paydown** items surfaced by this re-audit + `BACKLOG.md`, and the **scaling build-out** (`019b–f`)
> plus competitive features.

---

## REPO BASELINE (measured 2026-05-30, HEAD `ac7461b` on `main`)

**Core purpose.** `Starfall: Living Galaxy` — a browser-native, authoritative-server **multiplayer space
trading & combat sim**, inside a self-directed autonomous-engineering harness.

| Dimension | Value |
| --- | --- |
| Runtime | Node.js (ESM, `engines >=20`; **Active LTS = Node 24**, Maintenance = 22, **Current = 26**, Node 20 ≈ EOL) |
| Server | `ws` 8.21 + `http` (`src/server.js`, **2,014 LOC**; partially extracted) + `src/server/*`, `src/net/*` (11 modules) |
| Client | Vanilla JS + Canvas 2D (`src/main.js`, `src/client/*`), no framework/bundler/TS |
| Engine | Pure/headless, fully unit-tested: `src/engine` (24) + `engine/ai` (3), `src/physics`, `src/net`, `src/persistence` |
| Netcode | snapshot/delta (`StateCodec`) + per-client **AoI** (`interest.js`) + **binary** wire (`BinaryCodec`) + `BroadcastFramer`; `roomRouter` (shard/registry) for scale |
| Data | JSON-file persistence (`JsonFileStore` → `./data`; swappable `Store`), in-memory rooms; **no DB** |
| Build | none (static + node) · **Typecheck:** `tsc --noEmit` checkJs over `src/net|physics|server` (engine ratchet pending) |
| Tests | Jest **30.4** = **696 / 51 suites**; Vitest+jsdom **17 client**; `npm run test:client` separate |
| Lint/format | ESLint **10.4** (flat) + Prettier, clean. Gate: `npm run agent:check` (= prettier + eslint + typecheck + jest) |
| Security | `npm audit` **0 vulnerabilities**; ws payload-capped + Origin-checked + heartbeat + backpressure; ws `^8.21` > CVE-2026-45736 floor (8.20.1) |
| Observability | `GET /metrics` (counters/gauges/observations) + structured JSON logger |
| CI | `.github/workflows/ci.yml` — prettier → eslint → typecheck → jest on **Node 20/22/24** + a separate `client-tests` job |
| Scale (LOC) | 16.1k src JS / 10.4k test JS · 51 modules · 53 test files |

**Architecture (monolith, single process, multi-room; scaling primitives staged):**

```mermaid
flowchart TD
  subgraph Browser["Browser client (no build; logic tested via Vitest+jsdom)"]
    UI["src/client/* — CanvasRenderer · InputHandler · UIController · SpaceportUI"]
    NET["NetworkHandler (binary/JSON decode · snapshot/delta apply)"]
    UI <--> NET
  end
  NET <-->|"WebSocket (ws · BINARY frames + JSON channels · payload-capped · Origin-checked)"| SRV
  subgraph Node["Node process · src/server.js 2014 LOC"]
    SRV["WSS + http · dispatch · 30Hz tick · PER-CLIENT AoI broadcast (binary, backpressure)"]
    HB["heartbeat reaper · GalaxyHeartbeat (econ + production chain) · autosave"]
    OBS["/metrics + logger"]
    EXT["src/server/roomLifecycle · src/net/{originPolicy,heartbeat,backpressure,metrics,logger,statsPayload,interest,BinaryCodec,roomRouter}"]
  end
  SRV --> ENG
  SRV --> PM["PersistenceManager"]
  PM <-->|JSON, swappable Store| DISK[("./data")]
  ROUTER["roomRouter: assignShard + RoomRegistry (presence)"] -.staged for multi-process.-> SRV
  subgraph Engine["Pure engine (unit-tested)"]
    ENG["GameInstance (+ FactionRegistry)"] --> SE["SpaceEngine"] & ECON["Economy/ProductionModel (ore chain)"] & MIS["Missions"] & AI["AIController + buildPerception/UtilityAI"] & CR["CombatRating/Boarding/Hyperdrive/PortServices/Mining/Outfitting/Trading"] & CODEC["StateCodec/BroadcastFramer"]
  end
  subgraph Substrate["READ-ONLY harness (never modify)"]
    AX["docs/AXIOMS · AGENT-LOOP"]; GATE["scripts gate · validate-log-compliance.py · manifest.txt"]
  end
```

**Operational-health findings (this re-audit):**
- ✅ **Resolved since v2:** AoI filtering, binary protocol, faction wiring, goal-driven NPCs, ore production
  chain, client test harness, typecheck gate (scoped), CI LTS matrix, scaling first slice.
- ⚠️ **`server.js` grew back to 2,014 LOC** — the faction/AoI/binary wiring re-thickened the monolith;
  more message handlers remain inline/untested (`specs/034`).
- ⚠️ **Typecheck covers only `net|physics|server`** — `src/engine` + `src/persistence` are unchecked
  (~70 JSDoc findings); ratchet pending (`specs/030`).
- ⚠️ **Client visual/canvas layer still untested** — 021 covered NetworkHandler/UIController *logic* via
  jsdom; CanvasRenderer/InputHandler/SpaceportUI/main.js have **no** browser/visual tests (`specs/035`).
- ⚠️ **Known latent bug (BACKLOG):** `UIController._updateCombatFeedback` hit-flash classifier — the
  `"armor"` branch is unreachable, so armor hits flash the shield vignette (`specs/028`).
- ⚠️ **Node 20 in CI is ≈EOL** (Apr 2026) while 26 is Current — matrix should move to 22/24/26 (`specs/026`).
- ⏳ **Scaling is a first slice only:** real multi-process / Redis is unbuilt (`specs/019b–019f`); and there
  is no matchmaking-with-filters or wire compression yet (`specs/036–038`).
- 🐛 **BACKLOG carry-overs:** mission/trade faction standings + reputation decay, UtilityAI advisor rollout,
  `COMMODITIES` centralization (see `BACKLOG.md`).

---

## RESEARCH SYNTHESIS (2026 · web-verified this cycle)

- **Node.js (2026):** Active LTS = **Node 24**; Maintenance = **22**; **Node 26** is Current (released
  2026-05-05, enters LTS Oct 2026); **Node 20 reaches EOL ~Apr 2026**. Production must run an LTS — drop 20
  from CI, move to **22/24/26**, bump the floor to `>=22` (`specs/026`).
- **`ws` security:** **CVE-2026-45736** — uninitialized-memory disclosure in `websocket.close()` with a
  TypedArray `reason`; **fixed in ws 8.20.1**. The repo's `^8.21.0` is already above the floor (`npm audit`
  clean) — document/pin the floor so a future downgrade can't regress it (`specs/027`). The Next.js
  WebSocket-upgrade SSRF (CVE-2026-44578) doesn't apply (no Next.js) but reinforces the existing
  Origin/upgrade hardening.
- **Competitive landscape — Colyseus** is the Node.js authoritative-multiplayer reference: "state sync that
  just works — delta-compressed **and binary-encoded**", **room-based matchmaking** with filtering/queuing,
  reconnection. Starfall has now **converged** on the delta+binary+room core; the remaining gaps vs the
  market leader are **matchmaking with room filters/queue** (`specs/036`) and a **schema-based** state
  encoding (`specs/038`). geckos.io (WebRTC/UDP) and Hathora (serverless rooms) remain alternative paths.
- **Client testing — Vitest Browser Mode** (real Chromium via the Playwright provider; shared context,
  ~30% faster than classic Playwright E2E) is the 2026 standard for **canvas/WebGL/computed-style** tests —
  exactly the layer 021 deferred. Add it as a **separate CI job** (`--with-deps`, `headless:true`, ~30s
  timeout, `maxWorkers:4`) for CanvasRenderer visual-regression (`specs/035`).
- **Wire compression — permessage-deflate:** ws disables it server-side by default; it trades CPU/memory
  (Node zlib fragments memory at high concurrency) for size. Since AoI + binary already shrank the payload,
  treat compression as **benchmark-behind-a-flag**, not a default (`specs/037`).
- **Horizontal scaling pattern:** worker processes (~50–100k conns each) + **Redis pub/sub** for cross-node
  broadcast, **sharded pub/sub (Redis 7+ `SPUBLISH`/`SSUBSCRIBE`)** to keep messages on-shard, **NGINX/
  HAProxy `least_conn`** sticky LB, and a Redis-backed client→server presence map — directly validating the
  `019b–f` decomposition in [`specs/019a_scaling_decomposition.md`](specs/019a_scaling_decomposition.md).

---

## EXECUTION WAVES (v3)

Completed waves (`001–025`, `014–019`) are recorded DONE in `PROGRESS.md`. The live work:

### Phase 0 — Quick Wins & Safety (NEW) — `026`–`029`
`026` CI Node 22/24/26 + floor bump · `027` document/pin ws CVE-2026-45736 floor · `028` fix hit-flash
armor-branch bug · `029` reputation `decayAll` heartbeat hook.

### Phase 1 — Core Upgrades & Debt Paydown (NEW) — `030`–`035`
`030` engine typecheck ratchet · `031` `COMMODITIES` centralization · `032` mission/trade faction standings
· `033` UtilityAI advisor wider rollout + goal→action mapping · `034` continue `server.js` extraction ·
`035` client visual layer (Vitest Browser Mode + Playwright).

### Phase 2 — Scale-Out & Competitive Features — `019b`–`019f`, `036`–`038`
`019b` RedisStore · `019c` worker process model · `019d` sticky routing/LB · `019e` cross-process presence
(Redis pub/sub) · `019f` graceful drain · `036` matchmaking with room filters/queue · `037` permessage-
deflate eval (benchmark) · `038` schema-based state encoding eval.

---

## MASTER PRIORITIZATION TABLE (next-cycle work)

Scores 1–5 (5 = best). Risk: 5 = low risk. Σ = Impact + Feasibility + Risk + Fit.

| Spec | Title | Phase | Impact | Feasibility | Risk(5=safe) | Fit | Σ |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| 028 | Fix hit-flash armor-branch dead code (bug) | 0 | 3 | 5 | 5 | 5 | 18 |
| 026 | CI Node 22/24/26 + engines floor | 0 | 4 | 5 | 5 | 5 | 19 |
| 027 | Pin/document ws CVE-2026-45736 floor | 0 | 3 | 5 | 5 | 5 | 18 |
| 029 | Reputation `decayAll` heartbeat hook | 0 | 3 | 5 | 4 | 5 | 17 |
| 031 | `COMMODITIES` centralization | 1 | 3 | 4 | 4 | 5 | 16 |
| 030 | Engine typecheck ratchet | 1 | 4 | 3 | 4 | 4 | 15 |
| 033 | UtilityAI advisor rollout + mapping | 1 | 4 | 3 | 4 | 4 | 15 |
| 032 | Mission/trade faction standings | 1 | 4 | 3 | 3 | 4 | 14 |
| 034 | Continue `server.js` extraction | 1 | 4 | 2 | 3 | 4 | 13 |
| 035 | Client visual layer (Vitest Browser Mode) | 1 | 5 | 2 | 3 | 4 | 14 |
| 019b | RedisStore behind `Store` | 2 | 4 | 3 | 4 | 4 | 15 |
| 036 | Matchmaking with room filters/queue | 2 | 4 | 3 | 3 | 4 | 14 |
| 037 | permessage-deflate eval (benchmark) | 2 | 3 | 3 | 3 | 4 | 13 |
| 038 | Schema-based state encoding eval | 2 | 3 | 2 | 3 | 3 | 11 |
| 019c | Worker process model | 2 | 5 | 2 | 2 | 3 | 12 |
| 019d | Sticky routing / LB front door | 2 | 4 | 2 | 3 | 3 | 12 |
| 019e | Cross-process presence (Redis pub/sub) | 2 | 4 | 2 | 3 | 3 | 12 |
| 019f | Graceful drain / zero-downtime | 2 | 4 | 2 | 3 | 3 | 12 |

**Recommended start:** `026`/`028`/`027` (Σ19/18/18 — safety + a real bug, all small), then `029`, then the
debt-paydown `031`/`030`/`033`, then product `032`. `035` (client visual) is high-impact but infra-heavy
(real browser) — keep it a separate CI job. Scale-out (`019b–f`) is the North-Star epic: land `019b`
(RedisStore) first, then the process model, **decompose, don't build-as-one**.

## Risks & guardrails
- **Substrate is read-only** (`AGENTS.md §0`) — never modify.
- Client **canvas/visual** is still not headlessly verifiable without a real browser — `035` adds it; until
  then verify UI by booting `node src/server.js` (+ the existing `ws`-client smoke pattern).
- A parallel/rogue writer corrupted `docs/LOG.md` once (recovered, iter-0037) — **serialize ledger edits**
  and always anchor on the standalone `== LOG-ANCHOR ==` line, never the first substring match.
- Scale-out specs touch the hot broadcast path — gate each behind a flag (`INTEREST_MANAGEMENT`,
  `BINARY_PROTOCOL` precedents) so single-process stays the default and is never regressed.
- Every spec lands behind a green `npm run agent:check` (+ `npm run test:client` where client-touching);
  nothing pushed without authorization.
