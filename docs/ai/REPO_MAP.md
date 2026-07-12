# Repo Map (for agents)

Where things live, what to read, and what to skip. Pair this with `git ls-files` (which already
excludes `node_modules/`) and `.aiignore`. Full operating rules: `../../AGENTS.md`.

## Entry points

| What | File | Notes |
| --- | --- | --- |
| **Game server** (authoritative) | `src/server.js` | Composition root: Node `ws` + static HTTP on `:8080`. Wires the tested modules under `src/server/`; covered by the `src/server/*.integration.test.js` suites. |
| **Browser client** bootstrap | `src/main.js` | Loaded by `index.html`; wires engine + `src/client/*`. Client units are tested under `src/client/__tests__/` (Vitest). |
| **Page shell** | `index.html`, `index.css` | DOM/HUD the client renders into. |

## Core product logic — `src/` (this is what you improve)

| Area | Path | Pure? | Tested? |
| --- | --- | --- | --- |
| AIController manages NPC behavior states (wander, chase, patrol, trade) and maps them into ship controls. | [`src/engine/ai/AIController.js`](../../src/engine/ai/AIController.js) | yes | yes |
| buildPerception: pure adapter from live engine state to the `UtilityAI` perception snapshot (spec 017). | [`src/engine/ai/buildPerception.js`](../../src/engine/ai/buildPerception.js) | yes | yes |
| UtilityAI: pure, headless, deterministic goal-scoring for NPC agents. | [`src/engine/ai/UtilityAI.js`](../../src/engine/ai/UtilityAI.js) | yes | yes |
| Boarding (EW2) — pure helpers for boarding a disabled ship: plundering a hostile (cargo + a cut of its credits) or repairing a friendly back to life. | [`src/engine/Boarding.js`](../../src/engine/Boarding.js) | yes | yes |
| Class representing physical floating cargo pods ejected from shattered asteroids or destroyed ships. | [`src/engine/CargoPod.js`](../../src/engine/CargoPod.js) | yes | yes |
| CombatRating (EW1) — pure, deterministic helpers for valuing ships and rating pilots by the credit-worth of what they have destroyed. | [`src/engine/CombatRating.js`](../../src/engine/CombatRating.js) | yes | yes |
| commodities — the single source of truth for the tradeable commodity set (spec 031). | [`src/engine/commodities.js`](../../src/engine/commodities.js) | yes | yes |
| Headless representation of a server-authoritative wandering cosmic storm. | [`src/engine/CosmicStorm.js`](../../src/engine/CosmicStorm.js) | yes | yes |
| High-performance physics-loop determinism auditing utility. | [`src/engine/DeterminismSentry.js`](../../src/engine/DeterminismSentry.js) | yes | yes |
| EconomyManager class that encapsulates dynamic market supply/demand, price elasticity, price normalization, and random economic events across all galactic sectors. | [`src/engine/EconomyManager.js`](../../src/engine/EconomyManager.js) | yes | yes |
| FactionRegistry: pure, deterministic data + logic for per-player faction standings and pairwise faction relations. | [`src/engine/FactionRegistry.js`](../../src/engine/FactionRegistry.js) | yes | yes |
| FactionWarCampaign. | [`src/engine/FactionWarCampaign.js`](../../src/engine/FactionWarCampaign.js) | yes | yes |
| GalaxyEventsManager: pure, deterministic class that manages periodic dynamic economic shocks and market events across galactic sectors. | [`src/engine/GalaxyEventsManager.js`](../../src/engine/GalaxyEventsManager.js) | yes | yes |
| GalaxyHeartbeat advances the galactic economy independently of any connected player. | [`src/engine/GalaxyHeartbeat.js`](../../src/engine/GalaxyHeartbeat.js) | yes | yes |
| GameInstance coordinates sector engine simulations, warp portals, entities, and room states. | [`src/engine/GameInstance.js`](../../src/engine/GameInstance.js) | yes | yes |
| GenerativeMissions: pure, seeded mission generator that composes missions from a snapshot of live world state. | [`src/engine/GenerativeMissions.js`](../../src/engine/GenerativeMissions.js) | yes | yes |
| Hyperdrive (EW3) — pure helpers for the hyperdrive fuel economy: gating and paying for sector jumps, and regenerating fuel (Ramscoop) / refilling it. | [`src/engine/Hyperdrive.js`](../../src/engine/Hyperdrive.js) | yes | yes |
| Authoritative Game Invariant Verifier & Self-Healing Loop (SPEC-091). | [`src/engine/InvariantVerifier.js`](../../src/engine/InvariantVerifier.js) | yes | yes |
| LoadoutManager coordinates outfitting mass, ship agility scaling, power grid calculations, and presets. | [`src/engine/LoadoutManager.js`](../../src/engine/LoadoutManager.js) | yes | yes |
| Mining (EW9) — pure, deterministic yield math for shattering asteroids. | [`src/engine/Mining.js`](../../src/engine/Mining.js) | yes | yes |
| Manages the procedural mission generation, active contract tracking, and completion cycles. | [`src/engine/MissionManager.js`](../../src/engine/MissionManager.js) | yes | yes |
| NameGenerator (EW8) — pure, deterministic pilot and ship name generation. | [`src/engine/NameGenerator.js`](../../src/engine/NameGenerator.js) | yes | yes |
| Technical configuration for the active Space Tactical Nebula zones. | [`src/engine/Nebulae.js`](../../src/engine/Nebulae.js) | yes | yes |
| outfitCatalog (spec 020) — the single source of truth for the default outfit catalogue. | [`src/engine/outfitCatalog.js`](../../src/engine/outfitCatalog.js) | yes | yes |
| Outfitting (spec 007) — pure application of an outfit's stat effects onto a ship. | [`src/engine/Outfitting.js`](../../src/engine/Outfitting.js) | yes | yes |
| Planet class representing static celestial hubs with markets, outfitters, and shipyards. | [`src/engine/Planet.js`](../../src/engine/Planet.js) | yes | yes |
| PortServices (EW5) — pure helpers for paid hull repair and hyperdrive refuel at a port. | [`src/engine/PortServices.js`](../../src/engine/PortServices.js) | yes | yes |
| ProductionModel: pure, deterministic data + logic for planetary production and consumption pressures on commodity prices. | [`src/engine/ProductionModel.js`](../../src/engine/ProductionModel.js) | yes | yes |
| Projectile class representing weapon discharges (e.g. laser bolts, plasma cells) in space. | [`src/engine/Projectile.js`](../../src/engine/Projectile.js) | yes | yes |
| Enhanced Ship class representing player and NPC ships with shields, armor, cargo, credits, weapons, and upgrade systems. | [`src/engine/Ship.js`](../../src/engine/Ship.js) | yes | yes |
| Orchestrator class managing simulation state, entity updates, weapon fires, and circular elastic collisions. | [`src/engine/SpaceEngine.js`](../../src/engine/SpaceEngine.js) | yes | yes |
| Base class representing a physical object in a 2D top-down space environment. | [`src/engine/SpaceEntity.js`](../../src/engine/SpaceEntity.js) | yes | yes |
| TerritoryControl. | [`src/engine/TerritoryControl.js`](../../src/engine/TerritoryControl.js) | yes | yes |
| Trading (spec 025) — pure decision/mutation cores extracted from the server's `trade` and `ship_buy` message handlers, so the credit/cargo/hull math is unit-testable instead of inline in the socket file. | [`src/engine/Trading.js`](../../src/engine/Trading.js) | yes | yes |
| WeaponArchetypes: pure data model of unified weapon archetypes. | [`src/engine/WeaponArchetypes.js`](../../src/engine/WeaponArchetypes.js) | yes | yes |
| Low-overhead rolling window statistical anomaly detection sentry. | [`src/net/AnomalyDetector.js`](../../src/net/AnomalyDetector.js) | yes | yes |
| ApiRateLimiter (P0). | [`src/net/ApiRateLimiter.js`](../../src/net/ApiRateLimiter.js) | yes | yes |
| backpressure (spec 004) — pure decision for whether to send a frame to a client given how much data is already queued on its socket (`bufferedAmount`). | [`src/net/backpressure.js`](../../src/net/backpressure.js) | yes | yes |
| BinaryCodec — pure, versioned binary encoder/decoder for the P7 world-state broadcast frames (spec 015). | [`src/net/BinaryCodec.js`](../../src/net/BinaryCodec.js) | yes | yes |
| BroadcastFramer — pure framing helper for the P7 snapshot/delta world-state broadcast pipeline. | [`src/net/BroadcastFramer.js`](../../src/net/BroadcastFramer.js) | yes | yes |
| Monitors and hot-reloads configurations from a target file (defaults to `plan/config. | [`src/net/ConfigWatcher.js`](../../src/net/ConfigWatcher.js) | yes | yes |
| ConnectionFloodSentry. | [`src/net/ConnectionFloodSentry.js`](../../src/net/ConnectionFloodSentry.js) | yes | yes |
| DnsEgressSentry. | [`src/net/DnsEgressSentry.js`](../../src/net/DnsEgressSentry.js) | yes | yes |
| DynamicResourceGovernor. | [`src/net/DynamicResourceGovernor.js`](../../src/net/DynamicResourceGovernor.js) | yes | yes |
| GuestLoader. | [`src/net/GuestLoader.js`](../../src/net/GuestLoader.js) | yes | yes |
| GuestRpcSentry. | [`src/net/GuestRpcSentry.js`](../../src/net/GuestRpcSentry.js) | yes | yes |
| GuestRunner. | [`src/net/GuestRunner.js`](../../src/net/GuestRunner.js) | yes | yes |
| GuestRunnerWorker. | [`src/net/GuestRunnerWorker.js`](../../src/net/GuestRunnerWorker.js) | yes | yes |
| heartbeat (spec 003) — pure helper for the WebSocket liveness sweep. | [`src/net/heartbeat.js`](../../src/net/heartbeat.js) | yes | yes |
| HTTP/WebSocket security helpers shared by the server surface. | [`src/net/httpSecurity.js`](../../src/net/httpSecurity.js) | yes | yes |
| IntegrityGuard. | [`src/net/IntegrityGuard.js`](../../src/net/IntegrityGuard.js) | yes | yes |
| interest. | [`src/net/interest.js`](../../src/net/interest.js) | yes | yes |
| IntrusionDetectionSentry. | [`src/net/IntrusionDetectionSentry.js`](../../src/net/IntrusionDetectionSentry.js) | yes | yes |
| Event-Loop Latency Monitor & Dynamic Backpressure Shedding (SPEC-090). | [`src/net/LatencyMonitor.js`](../../src/net/LatencyMonitor.js) | yes | yes |
| logger (spec 010) — a tiny structured (JSON-line) logger with level filtering and no dependencies. | [`src/net/logger.js`](../../src/net/logger.js) | yes | yes |
| MemoryLeakSentry. | [`src/net/MemoryLeakSentry.js`](../../src/net/MemoryLeakSentry.js) | yes | yes |
| metrics (spec 010) — a tiny, dependency-free runtime metrics registry: counters (monotonic), gauges (point-in-time), and observations (count/sum/ avg/min/max for things like tick duration). | [`src/net/metrics.js`](../../src/net/metrics.js) | yes | yes |
| originPolicy (spec 002) — pure decision for whether to accept a WebSocket upgrade based on its `Origin` header. | [`src/net/originPolicy.js`](../../src/net/originPolicy.js) | yes | yes |
| PortReclaimer. | [`src/net/PortReclaimer.js`](../../src/net/PortReclaimer.js) | yes | yes |
| ProcessReaper. | [`src/net/ProcessReaper.js`](../../src/net/ProcessReaper.js) | yes | yes |
| ProcessSentinel. | [`src/net/ProcessSentinel.js`](../../src/net/ProcessSentinel.js) | yes | yes |
| PubSub — process-agnostic publish-subscribe transport abstraction (spec 019e). | [`src/net/PubSub.js`](../../src/net/PubSub.js) | yes | yes |
| ResourceLimiter (spec 116) — light-overhead resource monitor and backpressure sentinel that regularly polls host system/thread health metrics (memory usage, CPU event loop latency) and actively prevents runaway infinite loops or Out-Of-Memory (OOM) failures. | [`src/net/ResourceLimiter.js`](../../src/net/ResourceLimiter.js) | yes | yes |
| roomRouter — pure room→shard assignment and a process-agnostic room ownership registry (spec 019, horizontal-scaling first slice). | [`src/net/roomRouter.js`](../../src/net/roomRouter.js) | yes | yes |
| SandboxFirewall. | [`src/net/SandboxFirewall.js`](../../src/net/SandboxFirewall.js) | yes | yes |
| SandboxSecurityRegistry. | [`src/net/SandboxSecurityRegistry.js`](../../src/net/SandboxSecurityRegistry.js) | yes | yes |
| Sandbox Resource Telemetry Recorder (SPEC-094). | [`src/net/SandboxTelemetry.js`](../../src/net/SandboxTelemetry.js) | yes | yes |
| SchemaRegistry. | [`src/net/SchemaRegistry.js`](../../src/net/SchemaRegistry.js) | yes | yes |
| SchemaValidator. | [`src/net/SchemaValidator.js`](../../src/net/SchemaValidator.js) | yes | yes |
| SecureModuleRegistry. | [`src/net/SecureModuleRegistry.js`](../../src/net/SecureModuleRegistry.js) | yes | yes |
| StateCodec — pure, deterministic snapshot + delta codec for the authoritative world broadcast pipeline (P7: Netcode & Scale). | [`src/net/StateCodec.js`](../../src/net/StateCodec.js) | yes | yes |
| StaticSecuritySentry. | [`src/net/StaticSecuritySentry.js`](../../src/net/StaticSecuritySentry.js) | yes | yes |
| statsPayload (spec 007) — builds the per-client `stats` message from a live client object. | [`src/net/statsPayload.js`](../../src/net/statsPayload.js) | yes | yes |
| TokenCostGovernor. | [`src/net/TokenCostGovernor.js`](../../src/net/TokenCostGovernor.js) | yes | yes |
| WorkspaceDriftSentry. | [`src/net/WorkspaceDriftSentry.js`](../../src/net/WorkspaceDriftSentry.js) | yes | yes |
| wsCompression — `permessage-deflate` configuration + evaluation helper (spec 037). | [`src/net/wsCompression.js`](../../src/net/wsCompression.js) | yes | yes |
| ZeroTraceTeardown. | [`src/net/ZeroTraceTeardown.js`](../../src/net/ZeroTraceTeardown.js) | yes | yes |
| GalacticChronicle (P1 / P2). | [`src/persistence/GalacticChronicle.js`](../../src/persistence/GalacticChronicle.js) | yes | yes |
| PersistenceManager (P1). | [`src/persistence/PersistenceManager.js`](../../src/persistence/PersistenceManager.js) | yes | yes |
| Redis-backed persistence store (spec 019b). | [`src/persistence/RedisStore.js`](../../src/persistence/RedisStore.js) | yes | yes |
| Persistence serializers (P1). | [`src/persistence/serializers.js`](../../src/persistence/serializers.js) | yes | yes |
| Persistence Store interface (P1). | [`src/persistence/Store.js`](../../src/persistence/Store.js) | yes | yes |
| Standard 2D Vector representation for space navigation and physics calculation. | [`src/physics/Vector2D.js`](../../src/physics/Vector2D.js) | yes | yes |
| Handles trade transaction requests (buying/selling commodities) authoritatively. | [`src/server/actionHandlers.js`](../../src/server/actionHandlers.js) | no | yes |
| Handles the "chat" WebSocket message. | [`src/server/chatHandler.js`](../../src/server/chatHandler.js) | no | yes |
| Creates and initializes a connection client state object. | [`src/server/clientConnection.js`](../../src/server/clientConnection.js) | no | yes |
| Sends player and squad statistics updates to a client. | [`src/server/clientStats.js`](../../src/server/clientStats.js) | no | yes |
| Strips HTML/control characters and caps length on a free-text room field. | [`src/server/connectionHandlers.js`](../../src/server/connectionHandlers.js) | no | yes |
| Handles room joining lifecycle logic including switching cleanup, dynamic instantiations, ship spawning, and initialization syncing. | [`src/server/connectionLifecycle.js`](../../src/server/connectionLifecycle.js) | no | yes |
| Handles "escort_command" and "escort_formation" WebSocket messages. | [`src/server/escortHandlers.js`](../../src/server/escortHandlers.js) | no | yes |
| Handles "fleet_create", "fleet_join", and "fleet_leave" WebSocket messages. | [`src/server/fleetHandlers.js`](../../src/server/fleetHandlers.js) | no | yes |
| Executes the economy tick (shortage/surplus events) for a room. | [`src/server/galaxyTicker.js`](../../src/server/galaxyTicker.js) | no | yes |
| Handles the "controls" message: updates ship controls and heading. | [`src/server/gameplayHandlers.js`](../../src/server/gameplayHandlers.js) | no | yes |
| Compiles metadata for all active room instances. | [`src/server/lobbySync.js`](../../src/server/lobbySync.js) | no | yes |
| matchmaking — pure room matchmaking + a join queue (spec 036, upgraded spec 069). | [`src/server/matchmaking.js`](../../src/server/matchmaking.js) | no | yes |
| Sweeps the matchmaking queue for players waiting to join the specified room. | [`src/server/matchmakingQueueProcessor.js`](../../src/server/matchmakingQueueProcessor.js) | no | yes |
| Routes and dispatches incoming WebSocket message payloads to their corresponding modular handlers. | [`src/server/messageRouter.js`](../../src/server/messageRouter.js) | no | yes |
| Registers callback handlers on a player's missionManager to handle storylines, bounties, and escort target spawns within the player's active sector room. | [`src/server/missionSpawnHandlers.js`](../../src/server/missionSpawnHandlers.js) | no | yes |
| Saves current outfitting configuration to a custom preset slot. | [`src/server/outfittingPresetHandlers.js`](../../src/server/outfittingPresetHandlers.js) | no | yes |
| Starts all periodic background intervals for the server. | [`src/server/periodicIntervals.js`](../../src/server/periodicIntervals.js) | no | yes |
| Updates AI entities in the room, handles caravan refueling and merchant destination routing. | [`src/server/physicsTickHandlers.js`](../../src/server/physicsTickHandlers.js) | no | yes |
| Executes a single authoritative physics and simulation tick for a given room. | [`src/server/physicsTickProcessor.js`](../../src/server/physicsTickProcessor.js) | no | yes |
| Handles purchase of an outfit from a planet. | [`src/server/portHandlers.js`](../../src/server/portHandlers.js) | no | yes |
| Registers global Redis/InMemory PubSub message subscribers. | [`src/server/pubsubSubscriptions.js`](../../src/server/pubsubSubscriptions.js) | no | yes |
| Initializes and connects the storage and Pub/Sub adapters based on environment variables. | [`src/server/redisSetup.js`](../../src/server/redisSetup.js) | no | yes |
| Executes a single heartbeat tick of the room registry lease renewal. | [`src/server/registryHeartbeat.js`](../../src/server/registryHeartbeat.js) | no | yes |
| Writes a JSON response with the standard header set. | [`src/server/restHandlers.js`](../../src/server/restHandlers.js) | no | yes |
| Broadcasts the current room world state to all connected clients. | [`src/server/roomBroadcast.js`](../../src/server/roomBroadcast.js) | no | yes |
| Sweeps room instances and reaps idle custom sectors. | [`src/server/roomGc.js`](../../src/server/roomGc.js) | no | yes |
| Initializes default permanent rooms (like the "public" Arena) on their designated shards and restores their saved states from the persistence manager. | [`src/server/roomInitializer.js`](../../src/server/roomInitializer.js) | no | yes |
| roomLifecycle (spec 007) — pure room-lifecycle decisions extracted from the server: whether an idle non-public room should be garbage-collected, and how a player nickname is sanitized. | [`src/server/roomLifecycle.js`](../../src/server/roomLifecycle.js) | no | yes |
| Room Registry Store | [`src/server/roomRegistryStore.js`](../../src/server/roomRegistryStore.js) | no | yes |
| Creates a graceful shutdown lifecycle handler for the server process. | [`src/server/shutdownHandler.js`](../../src/server/shutdownHandler.js) | no | yes |
| Handles accepting a dynamic generative mission. | [`src/server/spaceportMissionHandlers.js`](../../src/server/spaceportMissionHandlers.js) | no | yes |
| Handles "squad_invite", "squad_join", and "squad_leave" WebSocket messages. | [`src/server/squadHandlers.js`](../../src/server/squadHandlers.js) | no | yes |
| SquadManager — manages co-op player party squads (SPEC-059). | [`src/server/SquadManager.js`](../../src/server/SquadManager.js) | no | yes |
| Pure supervisor worker planner (spec 019c). | [`src/server/supervisor.js`](../../src/server/supervisor.js) | no | yes |
| Boots `src/server. | [`src/server/testSupport/integrationHarness.js`](../../src/server/testSupport/integrationHarness.js) | no | no |
| Handles starting the dynamic interactive tutorial. | [`src/server/tutorialHandlers.js`](../../src/server/tutorialHandlers.js) | no | yes |
| Validates WebSocket connection upgrades (URI length, payload length, allowed origins, flood sentry). | [`src/server/verifyWebSocketClient.js`](../../src/server/verifyWebSocketClient.js) | no | yes |

Rule of thumb: anything under `engine/`, `physics/`, `net/`, `persistence/` is pure and **must** stay
that way (no DOM, sockets, timers, or `Math.random` in test-reachable paths). Tests sit beside source
as `*.test.js`.

## Config & tooling

- `package.json` — scripts (`test`, `lint`, `format`, `format:check`, `agent:bootstrap`, `agent:check`), deps.
- `eslint.config.js` — flat config; `no-unused-vars: warn`; globals node+jest+browser.
- `.github/workflows/ci.yml` — the gate of record on push/PR to `main`/`develop`: substrate verify → prettier **--check** → eslint → typecheck → jest (Node 22/24/26 matrix) + Vitest client job.
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
