# Repo Map (for agents)

Where things live, what to read, and what to skip. Pair this with `git ls-files` (which already
excludes `node_modules/`) and `.aiignore`. Full operating rules: `../../AGENTS.md`.

## Entry points

| What | File | Notes |
| --- | --- | --- |
| **Game server** (authoritative) | `src/server.js` | Node `ws` + static HTTP on `:8080`. ~1900 lines, **not unit-tested**, organized by lettered section headers (e.g. "J. Authoritative World State Broadcast"). Read the section you need. |
| **Browser client** bootstrap | `src/main.js` | Loaded by `index.html`; wires engine + `src/client/*`. Not unit-tested. |
| **Page shell** | `index.html`, `index.css` | DOM/HUD the client renders into. |
| `package.json` `main` | `src/index.js` | ⚠️ A demo stub (`add`/`subtract`/`greet`) — **not** a real entry point. Don't be misled. |

## Core product logic — `src/` (this is what you improve)

| Area | Path | Pure? | Tested? |
| --- | --- | --- | --- |
| AIController manages NPC behavior states (wander, chase, patrol, trade) and maps them into ship controls. | [`src/engine/ai/AIController.js`](file:///C:/dev/agy-sandbox/src/engine/ai/AIController.js) | yes | yes |
| buildPerception: pure adapter from live engine state to the `UtilityAI` perception snapshot (spec 017). | [`src/engine/ai/buildPerception.js`](file:///C:/dev/agy-sandbox/src/engine/ai/buildPerception.js) | yes | yes |
| UtilityAI: pure, headless, deterministic goal-scoring for NPC agents. | [`src/engine/ai/UtilityAI.js`](file:///C:/dev/agy-sandbox/src/engine/ai/UtilityAI.js) | yes | yes |
| Boarding (EW2) — pure helpers for boarding a disabled ship: plundering a hostile (cargo + a cut of its credits) or repairing a friendly back to life. | [`src/engine/Boarding.js`](file:///C:/dev/agy-sandbox/src/engine/Boarding.js) | yes | yes |
| Class representing physical floating cargo pods ejected from shattered asteroids or destroyed ships. | [`src/engine/CargoPod.js`](file:///C:/dev/agy-sandbox/src/engine/CargoPod.js) | yes | yes |
| CombatRating (EW1) — pure, deterministic helpers for valuing ships and rating pilots by the credit-worth of what they have destroyed. | [`src/engine/CombatRating.js`](file:///C:/dev/agy-sandbox/src/engine/CombatRating.js) | yes | yes |
| commodities — the single source of truth for the tradeable commodity set (spec 031). | [`src/engine/commodities.js`](file:///C:/dev/agy-sandbox/src/engine/commodities.js) | yes | yes |
| Headless representation of a server-authoritative wandering cosmic storm. | [`src/engine/CosmicStorm.js`](file:///C:/dev/agy-sandbox/src/engine/CosmicStorm.js) | yes | yes |
| High-performance physics-loop determinism auditing utility. | [`src/engine/DeterminismSentry.js`](file:///C:/dev/agy-sandbox/src/engine/DeterminismSentry.js) | yes | yes |
| EconomyManager class that encapsulates dynamic market supply/demand, price elasticity, price normalization, and random economic events across all galactic sectors. | [`src/engine/EconomyManager.js`](file:///C:/dev/agy-sandbox/src/engine/EconomyManager.js) | yes | yes |
| FactionRegistry: pure, deterministic data + logic for per-player faction standings and pairwise faction relations. | [`src/engine/FactionRegistry.js`](file:///C:/dev/agy-sandbox/src/engine/FactionRegistry.js) | yes | yes |
| FactionWarCampaign. | [`src/engine/FactionWarCampaign.js`](file:///C:/dev/agy-sandbox/src/engine/FactionWarCampaign.js) | yes | yes |
| GalaxyEventsManager: pure, deterministic class that manages periodic dynamic economic shocks and market events across galactic sectors. | [`src/engine/GalaxyEventsManager.js`](file:///C:/dev/agy-sandbox/src/engine/GalaxyEventsManager.js) | yes | yes |
| GalaxyHeartbeat advances the galactic economy independently of any connected player. | [`src/engine/GalaxyHeartbeat.js`](file:///C:/dev/agy-sandbox/src/engine/GalaxyHeartbeat.js) | yes | yes |
| GameInstance coordinates sector engine simulations, warp portals, entities, and room states. | [`src/engine/GameInstance.js`](file:///C:/dev/agy-sandbox/src/engine/GameInstance.js) | yes | yes |
| GenerativeMissions: pure, seeded mission generator that composes missions from a snapshot of live world state. | [`src/engine/GenerativeMissions.js`](file:///C:/dev/agy-sandbox/src/engine/GenerativeMissions.js) | yes | yes |
| Hyperdrive (EW3) — pure helpers for the hyperdrive fuel economy: gating and paying for sector jumps, and regenerating fuel (Ramscoop) / refilling it. | [`src/engine/Hyperdrive.js`](file:///C:/dev/agy-sandbox/src/engine/Hyperdrive.js) | yes | yes |
| Authoritative Game Invariant Verifier & Self-Healing Loop (SPEC-091). | [`src/engine/InvariantVerifier.js`](file:///C:/dev/agy-sandbox/src/engine/InvariantVerifier.js) | yes | yes |
| LoadoutManager coordinates outfitting mass, ship agility scaling, power grid calculations, and presets. | [`src/engine/LoadoutManager.js`](file:///C:/dev/agy-sandbox/src/engine/LoadoutManager.js) | yes | yes |
| Mining (EW9) — pure, deterministic yield math for shattering asteroids. | [`src/engine/Mining.js`](file:///C:/dev/agy-sandbox/src/engine/Mining.js) | yes | yes |
| Manages the procedural mission generation, active contract tracking, and completion cycles. | [`src/engine/MissionManager.js`](file:///C:/dev/agy-sandbox/src/engine/MissionManager.js) | yes | yes |
| NameGenerator (EW8) — pure, deterministic pilot and ship name generation. | [`src/engine/NameGenerator.js`](file:///C:/dev/agy-sandbox/src/engine/NameGenerator.js) | yes | yes |
| Technical configuration for the active Space Tactical Nebula zones. | [`src/engine/Nebulae.js`](file:///C:/dev/agy-sandbox/src/engine/Nebulae.js) | yes | yes |
| outfitCatalog (spec 020) — the single source of truth for the default outfit catalogue. | [`src/engine/outfitCatalog.js`](file:///C:/dev/agy-sandbox/src/engine/outfitCatalog.js) | yes | yes |
| Outfitting (spec 007) — pure application of an outfit's stat effects onto a ship. | [`src/engine/Outfitting.js`](file:///C:/dev/agy-sandbox/src/engine/Outfitting.js) | yes | yes |
| Planet class representing static celestial hubs with markets, outfitters, and shipyards. | [`src/engine/Planet.js`](file:///C:/dev/agy-sandbox/src/engine/Planet.js) | yes | yes |
| PortServices (EW5) — pure helpers for paid hull repair and hyperdrive refuel at a port. | [`src/engine/PortServices.js`](file:///C:/dev/agy-sandbox/src/engine/PortServices.js) | yes | yes |
| ProductionModel: pure, deterministic data + logic for planetary production and consumption pressures on commodity prices. | [`src/engine/ProductionModel.js`](file:///C:/dev/agy-sandbox/src/engine/ProductionModel.js) | yes | yes |
| Projectile class representing weapon discharges (e.g. laser bolts, plasma cells) in space. | [`src/engine/Projectile.js`](file:///C:/dev/agy-sandbox/src/engine/Projectile.js) | yes | yes |
| Enhanced Ship class representing player and NPC ships with shields, armor, cargo, credits, weapons, and upgrade systems. | [`src/engine/Ship.js`](file:///C:/dev/agy-sandbox/src/engine/Ship.js) | yes | yes |
| Orchestrator class managing simulation state, entity updates, weapon fires, and circular elastic collisions. | [`src/engine/SpaceEngine.js`](file:///C:/dev/agy-sandbox/src/engine/SpaceEngine.js) | yes | yes |
| Base class representing a physical object in a 2D top-down space environment. | [`src/engine/SpaceEntity.js`](file:///C:/dev/agy-sandbox/src/engine/SpaceEntity.js) | yes | yes |
| TerritoryControl. | [`src/engine/TerritoryControl.js`](file:///C:/dev/agy-sandbox/src/engine/TerritoryControl.js) | yes | yes |
| Trading (spec 025) — pure decision/mutation cores extracted from the server's `trade` and `ship_buy` message handlers, so the credit/cargo/hull math is unit-testable instead of inline in the socket file. | [`src/engine/Trading.js`](file:///C:/dev/agy-sandbox/src/engine/Trading.js) | yes | yes |
| WeaponArchetypes: pure data model of unified weapon archetypes. | [`src/engine/WeaponArchetypes.js`](file:///C:/dev/agy-sandbox/src/engine/WeaponArchetypes.js) | yes | yes |
| Low-overhead rolling window statistical anomaly detection sentry. | [`src/net/AnomalyDetector.js`](file:///C:/dev/agy-sandbox/src/net/AnomalyDetector.js) | yes | yes |
| ApiRateLimiter (P0). | [`src/net/ApiRateLimiter.js`](file:///C:/dev/agy-sandbox/src/net/ApiRateLimiter.js) | yes | yes |
| backpressure (spec 004) — pure decision for whether to send a frame to a client given how much data is already queued on its socket (`bufferedAmount`). | [`src/net/backpressure.js`](file:///C:/dev/agy-sandbox/src/net/backpressure.js) | yes | yes |
| BinaryCodec — pure, versioned binary encoder/decoder for the P7 world-state broadcast frames (spec 015). | [`src/net/BinaryCodec.js`](file:///C:/dev/agy-sandbox/src/net/BinaryCodec.js) | yes | yes |
| BroadcastFramer — pure framing helper for the P7 snapshot/delta world-state broadcast pipeline. | [`src/net/BroadcastFramer.js`](file:///C:/dev/agy-sandbox/src/net/BroadcastFramer.js) | yes | yes |
| Monitors and hot-reloads configurations from a target file (defaults to `plan/config. | [`src/net/ConfigWatcher.js`](file:///C:/dev/agy-sandbox/src/net/ConfigWatcher.js) | yes | yes |
| ConnectionFloodSentry. | [`src/net/ConnectionFloodSentry.js`](file:///C:/dev/agy-sandbox/src/net/ConnectionFloodSentry.js) | yes | yes |
| DeltaStateCodec — snapshot delta compression utility (spec 072). | [`src/net/DeltaStateCodec.js`](file:///C:/dev/agy-sandbox/src/net/DeltaStateCodec.js) | yes | yes |
| DnsEgressSentry. | [`src/net/DnsEgressSentry.js`](file:///C:/dev/agy-sandbox/src/net/DnsEgressSentry.js) | yes | yes |
| DynamicResourceGovernor. | [`src/net/DynamicResourceGovernor.js`](file:///C:/dev/agy-sandbox/src/net/DynamicResourceGovernor.js) | yes | yes |
| EphemeralSandbox (spec 115) — copy-on-write virtual workspace sandboxing cloner. | [`src/net/EphemeralSandbox.js`](file:///C:/dev/agy-sandbox/src/net/EphemeralSandbox.js) | yes | yes |
| GuestLoader. | [`src/net/GuestLoader.js`](file:///C:/dev/agy-sandbox/src/net/GuestLoader.js) | yes | yes |
| GuestRpcSentry. | [`src/net/GuestRpcSentry.js`](file:///C:/dev/agy-sandbox/src/net/GuestRpcSentry.js) | yes | yes |
| GuestRunner. | [`src/net/GuestRunner.js`](file:///C:/dev/agy-sandbox/src/net/GuestRunner.js) | yes | yes |
| GuestRunnerWorker. | [`src/net/GuestRunnerWorker.js`](file:///C:/dev/agy-sandbox/src/net/GuestRunnerWorker.js) | yes | no |
| heartbeat (spec 003) — pure helper for the WebSocket liveness sweep. | [`src/net/heartbeat.js`](file:///C:/dev/agy-sandbox/src/net/heartbeat.js) | yes | yes |
| IntegrityGuard. | [`src/net/IntegrityGuard.js`](file:///C:/dev/agy-sandbox/src/net/IntegrityGuard.js) | yes | yes |
| interest. | [`src/net/interest.js`](file:///C:/dev/agy-sandbox/src/net/interest.js) | yes | yes |
| IntrusionDetectionSentry. | [`src/net/IntrusionDetectionSentry.js`](file:///C:/dev/agy-sandbox/src/net/IntrusionDetectionSentry.js) | yes | yes |
| Event-Loop Latency Monitor & Dynamic Backpressure Shedding (SPEC-090). | [`src/net/LatencyMonitor.js`](file:///C:/dev/agy-sandbox/src/net/LatencyMonitor.js) | yes | yes |
| logger (spec 010) — a tiny structured (JSON-line) logger with level filtering and no dependencies. | [`src/net/logger.js`](file:///C:/dev/agy-sandbox/src/net/logger.js) | yes | yes |
| MainThreadWatchdog. | [`src/net/MainThreadWatchdog.js`](file:///C:/dev/agy-sandbox/src/net/MainThreadWatchdog.js) | yes | yes |
| MainThreadWatchdogWorker. | [`src/net/MainThreadWatchdogWorker.js`](file:///C:/dev/agy-sandbox/src/net/MainThreadWatchdogWorker.js) | yes | no |
| MemoryLeakSentry. | [`src/net/MemoryLeakSentry.js`](file:///C:/dev/agy-sandbox/src/net/MemoryLeakSentry.js) | yes | yes |
| metrics (spec 010) — a tiny, dependency-free runtime metrics registry: counters (monotonic), gauges (point-in-time), and observations (count/sum/ avg/min/max for things like tick duration). | [`src/net/metrics.js`](file:///C:/dev/agy-sandbox/src/net/metrics.js) | yes | yes |
| mockFreezeScript. | [`src/net/mockFreezeScript.js`](file:///C:/dev/agy-sandbox/src/net/mockFreezeScript.js) | yes | no |
| Network Latency & Packet-Loss Injector (SPEC-095). | [`src/net/NetworkLatencyInjector.js`](file:///C:/dev/agy-sandbox/src/net/NetworkLatencyInjector.js) | yes | yes |
| originPolicy (spec 002) — pure decision for whether to accept a WebSocket upgrade based on its `Origin` header. | [`src/net/originPolicy.js`](file:///C:/dev/agy-sandbox/src/net/originPolicy.js) | yes | yes |
| PortReclaimer. | [`src/net/PortReclaimer.js`](file:///C:/dev/agy-sandbox/src/net/PortReclaimer.js) | yes | yes |
| ProcessReaper. | [`src/net/ProcessReaper.js`](file:///C:/dev/agy-sandbox/src/net/ProcessReaper.js) | yes | yes |
| ProcessSentinel. | [`src/net/ProcessSentinel.js`](file:///C:/dev/agy-sandbox/src/net/ProcessSentinel.js) | yes | yes |
| PubSub — process-agnostic publish-subscribe transport abstraction (spec 019e). | [`src/net/PubSub.js`](file:///C:/dev/agy-sandbox/src/net/PubSub.js) | yes | yes |
| ResourceLimiter (spec 116) — light-overhead resource monitor and backpressure sentinel that regularly polls host system/thread health metrics (memory usage, CPU event loop latency) and actively prevents runaway infinite loops or Out-Of-Memory (OOM) failures. | [`src/net/ResourceLimiter.js`](file:///C:/dev/agy-sandbox/src/net/ResourceLimiter.js) | yes | yes |
| roomRouter — pure room→shard assignment and a process-agnostic room ownership registry (spec 019, horizontal-scaling first slice). | [`src/net/roomRouter.js`](file:///C:/dev/agy-sandbox/src/net/roomRouter.js) | yes | yes |
| SandboxFirewall. | [`src/net/SandboxFirewall.js`](file:///C:/dev/agy-sandbox/src/net/SandboxFirewall.js) | yes | yes |
| SandboxSecurityRegistry. | [`src/net/SandboxSecurityRegistry.js`](file:///C:/dev/agy-sandbox/src/net/SandboxSecurityRegistry.js) | yes | yes |
| Sandbox Resource Telemetry Recorder (SPEC-094). | [`src/net/SandboxTelemetry.js`](file:///C:/dev/agy-sandbox/src/net/SandboxTelemetry.js) | yes | yes |
| SchemaCodec — an evaluation codec (spec 038) that extends the spec-015 `BinaryCodec` with a **value-string dictionary**. | [`src/net/SchemaCodec.js`](file:///C:/dev/agy-sandbox/src/net/SchemaCodec.js) | yes | yes |
| SchemaRegistry. | [`src/net/SchemaRegistry.js`](file:///C:/dev/agy-sandbox/src/net/SchemaRegistry.js) | yes | yes |
| SchemaValidator. | [`src/net/SchemaValidator.js`](file:///C:/dev/agy-sandbox/src/net/SchemaValidator.js) | yes | yes |
| SecureModuleRegistry. | [`src/net/SecureModuleRegistry.js`](file:///C:/dev/agy-sandbox/src/net/SecureModuleRegistry.js) | yes | yes |
| StateCodec — pure, deterministic snapshot + delta codec for the authoritative world broadcast pipeline (P7: Netcode & Scale). | [`src/net/StateCodec.js`](file:///C:/dev/agy-sandbox/src/net/StateCodec.js) | yes | yes |
| StaticSecuritySentry. | [`src/net/StaticSecuritySentry.js`](file:///C:/dev/agy-sandbox/src/net/StaticSecuritySentry.js) | yes | yes |
| statsPayload (spec 007) — builds the per-client `stats` message from a live client object. | [`src/net/statsPayload.js`](file:///C:/dev/agy-sandbox/src/net/statsPayload.js) | yes | yes |
| TokenCostGovernor. | [`src/net/TokenCostGovernor.js`](file:///C:/dev/agy-sandbox/src/net/TokenCostGovernor.js) | yes | yes |
| WorkspaceDriftSentry. | [`src/net/WorkspaceDriftSentry.js`](file:///C:/dev/agy-sandbox/src/net/WorkspaceDriftSentry.js) | yes | yes |
| wsCompression — `permessage-deflate` configuration + evaluation helper (spec 037). | [`src/net/wsCompression.js`](file:///C:/dev/agy-sandbox/src/net/wsCompression.js) | yes | yes |
| ZeroTraceTeardown. | [`src/net/ZeroTraceTeardown.js`](file:///C:/dev/agy-sandbox/src/net/ZeroTraceTeardown.js) | yes | yes |
| GalacticChronicle (P1 / P2). | [`src/persistence/GalacticChronicle.js`](file:///C:/dev/agy-sandbox/src/persistence/GalacticChronicle.js) | yes | yes |
| PersistenceManager (P1). | [`src/persistence/PersistenceManager.js`](file:///C:/dev/agy-sandbox/src/persistence/PersistenceManager.js) | yes | yes |
| Redis-backed persistence store (spec 019b). | [`src/persistence/RedisStore.js`](file:///C:/dev/agy-sandbox/src/persistence/RedisStore.js) | yes | yes |
| Persistence serializers (P1). | [`src/persistence/serializers.js`](file:///C:/dev/agy-sandbox/src/persistence/serializers.js) | yes | yes |
| ShardedStore — horizontal database partition-sharding adapter (spec 070). | [`src/persistence/ShardedStore.js`](file:///C:/dev/agy-sandbox/src/persistence/ShardedStore.js) | yes | yes |
| Persistence Store interface (P1). | [`src/persistence/Store.js`](file:///C:/dev/agy-sandbox/src/persistence/Store.js) | yes | yes |
| Standard 2D Vector representation for space navigation and physics calculation. | [`src/physics/Vector2D.js`](file:///C:/dev/agy-sandbox/src/physics/Vector2D.js) | yes | yes |
| Handles trade transaction requests (buying/selling commodities) authoritatively. | [`src/server/actionHandlers.js`](file:///C:/dev/agy-sandbox/src/server/actionHandlers.js) | no | yes |
| Handles the "chat" WebSocket message. | [`src/server/chatHandler.js`](file:///C:/dev/agy-sandbox/src/server/chatHandler.js) | no | yes |
| Handles the "join", "quick_join", "create_room", and "join_room" WebSocket messages. | [`src/server/connectionHandlers.js`](file:///C:/dev/agy-sandbox/src/server/connectionHandlers.js) | no | yes |
| Handles room joining lifecycle logic including switching cleanup, dynamic instantiations, ship spawning, and initialization syncing. | [`src/server/connectionLifecycle.js`](file:///C:/dev/agy-sandbox/src/server/connectionLifecycle.js) | no | yes |
| Handles "escort_command" and "escort_formation" WebSocket messages. | [`src/server/escortHandlers.js`](file:///C:/dev/agy-sandbox/src/server/escortHandlers.js) | no | yes |
| Handles "fleet_create", "fleet_join", and "fleet_leave" WebSocket messages. | [`src/server/fleetHandlers.js`](file:///C:/dev/agy-sandbox/src/server/fleetHandlers.js) | no | yes |
| Executes the economy tick (shortage/surplus events) for a room. | [`src/server/galaxyTicker.js`](file:///C:/dev/agy-sandbox/src/server/galaxyTicker.js) | no | yes |
| Handles the "controls" message: updates ship controls and heading. | [`src/server/gameplayHandlers.js`](file:///C:/dev/agy-sandbox/src/server/gameplayHandlers.js) | no | yes |
| Compiles metadata for all active room instances. | [`src/server/lobbySync.js`](file:///C:/dev/agy-sandbox/src/server/lobbySync.js) | no | yes |
| matchmaking — pure room matchmaking + a join queue (spec 036, upgraded spec 069). | [`src/server/matchmaking.js`](file:///C:/dev/agy-sandbox/src/server/matchmaking.js) | no | yes |
| Saves current outfitting configuration to a custom preset slot. | [`src/server/outfittingPresetHandlers.js`](file:///C:/dev/agy-sandbox/src/server/outfittingPresetHandlers.js) | no | yes |
| Handles purchase of an outfit from a planet. | [`src/server/portHandlers.js`](file:///C:/dev/agy-sandbox/src/server/portHandlers.js) | no | yes |
| Reads a file synchronously with retries on lock contention. | [`src/server/restHandlers.js`](file:///C:/dev/agy-sandbox/src/server/restHandlers.js) | no | yes |
| Sweeps room instances and reaps idle custom sectors. | [`src/server/roomGc.js`](file:///C:/dev/agy-sandbox/src/server/roomGc.js) | no | yes |
| roomLifecycle (spec 007) — pure room-lifecycle decisions extracted from the server: whether an idle non-public room should be garbage-collected, and how a player nickname is sanitized. | [`src/server/roomLifecycle.js`](file:///C:/dev/agy-sandbox/src/server/roomLifecycle.js) | no | yes |
| Handles accepting a dynamic generative mission. | [`src/server/spaceportMissionHandlers.js`](file:///C:/dev/agy-sandbox/src/server/spaceportMissionHandlers.js) | no | yes |
| Handles "squad_invite", "squad_join", and "squad_leave" WebSocket messages. | [`src/server/squadHandlers.js`](file:///C:/dev/agy-sandbox/src/server/squadHandlers.js) | no | yes |
| SquadManager — manages co-op player party squads (SPEC-059). | [`src/server/SquadManager.js`](file:///C:/dev/agy-sandbox/src/server/SquadManager.js) | no | yes |
| Pure supervisor worker planner (spec 019c). | [`src/server/supervisor.js`](file:///C:/dev/agy-sandbox/src/server/supervisor.js) | no | yes |
| Handles starting the dynamic interactive tutorial. | [`src/server/tutorialHandlers.js`](file:///C:/dev/agy-sandbox/src/server/tutorialHandlers.js) | no | yes |

Rule of thumb: anything under `engine/`, `physics/`, `net/`, `persistence/` is pure and **must** stay
that way (no DOM, sockets, timers, or `Math.random` in test-reachable paths). Tests sit beside source
as `*.test.js`.

## Config & tooling

- `package.json` — scripts (`test`, `lint`, `format`, `format:check`, `agent:bootstrap`, `agent:check`), deps.
- `eslint.config.js` — flat config; `no-unused-vars: warn`; globals node+jest+browser.
- `.github/workflows/ci.yml` — the gate of record: prettier **--check** → eslint → jest on push/PR to `main`.
- `scripts/agent/*.{sh,ps1}` — agent-facing wrappers; `check` mirrors CI exactly.
- `.env.example` — runtime/automation env vars (copy to `.env`, which is gitignored).

## Governance / substrate (read; never modify the substrate set)

- `docs/AXIOMS.md`, `docs/AGENT-LOOP.md` — constitution + loop protocol (**substrate, read-only**).
- `docs/GOAL.md` — product blueprint (writable; the North Star and pillars P1–P8).
- `docs/LOG.md` — append-only ledger, newest-first.
- `.github/AGENT_RULES.md` — coding standards + git workflow (writable).
- `scripts/{assert-gate-integrity,local-gate,run-autonomous-loop}.ps1`, `scripts/validate-log-compliance.py`,
  `scripts/manifest.txt` — **substrate, read-only**.
- `scripts/{claude-night.ps1, run-agent.js}` — autonomous launchers (writable, not substrate).

## Skip (don't read into context)

- `node_modules/`, `.git/`, `package-lock.json`, `coverage/`, `data/` (runtime saves, gitignored),
  `night-queue/` (local task queue, gitignored), `.claude/`. See `.aiignore`.
