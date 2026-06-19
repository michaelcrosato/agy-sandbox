import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { exec } from "child_process";

import { MissionManager } from "./engine/MissionManager.js";
import { registerMissionSpawnHandlers } from "./server/missionSpawnHandlers.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { GameInstance } from "./engine/GameInstance.js";
import { nextFrame } from "./net/BroadcastFramer.js";
import { interestFilter, buildSpatialGrid } from "./net/interest.js";
import { encode as encodeFrame } from "./net/BinaryCodec.js";
import { perMessageDeflateOption } from "./net/wsCompression.js";
import { squadManager, Squad } from "./server/SquadManager.js";
import { JoinQueue, freeSlots, roomMatches } from "./server/matchmaking.js";
import { JsonFileStore } from "./persistence/Store.js";
import { PersistenceManager } from "./persistence/PersistenceManager.js";
import { GalacticChronicle } from "./persistence/GalacticChronicle.js";
import {
  ApiRateLimiter,
  activateOutboundSentinel,
} from "./net/ApiRateLimiter.js";
import { SandboxFirewall, activateFirewall } from "./net/SandboxFirewall.js";
import { applyGalaxy } from "./persistence/serializers.js";
import { InMemoryPubSub } from "./net/PubSub.js";
import { isAllowedOrigin } from "./net/originPolicy.js";
import { selectDeadSockets, DEFAULT_HEARTBEAT_MS } from "./net/heartbeat.js";
import { sendDecision } from "./net/backpressure.js";
import { createRegistry } from "./net/metrics.js";
import { createLogger } from "./net/logger.js";
import { LatencyMonitor } from "./net/LatencyMonitor.js";
import { SandboxTelemetry } from "./net/SandboxTelemetry.js";
import { ResourceLimiter } from "./net/ResourceLimiter.js";
import { MemoryLeakSentry } from "./net/MemoryLeakSentry.js";
import { AnomalyDetector } from "./net/AnomalyDetector.js";
import { ConfigWatcher } from "./net/ConfigWatcher.js";
import { ConnectionFloodSentry } from "./net/ConnectionFloodSentry.js";
import {
  handleOutfitBuy,
  handleShipBuy,
  handleVoucherRedeem,
  handleOutfitSell,
  handleOreRefine,
  handleDistressBeacon,
} from "./server/portHandlers.js";
import {
  handlePresetSave,
  handlePresetLoad,
  handlePresetDelete,
} from "./server/outfittingPresetHandlers.js";
import {
  handleMissionAccept,
  handleMissionAbandon,
} from "./server/spaceportMissionHandlers.js";
import {
  handleTrade,
  handlePortService,
  handleJettison,
  handleWarpJump,
  handleBoardingAction,
} from "./server/actionHandlers.js";
import { handleChat } from "./server/chatHandler.js";
import { handleFleetAction } from "./server/fleetHandlers.js";
import {
  handleControls,
  handleLand,
  handleLaunch,
} from "./server/gameplayHandlers.js";
import { handleSquadAction } from "./server/squadHandlers.js";
import { handleEscortAction } from "./server/escortHandlers.js";
import {
  handleTutorialStart,
  handleTutorialProgress,
  handleTutorialComplete,
} from "./server/tutorialHandlers.js";
import { handleConnectionAction } from "./server/connectionHandlers.js";
import { handleRestRequest } from "./server/restHandlers.js";
import {
  joinRoom as joinRoomExt,
  handleClientDisconnect,
} from "./server/connectionLifecycle.js";
import { buildStatsPayload } from "./net/statsPayload.js";
import { sendClientStats } from "./server/clientStats.js";
import {
  createClientObject,
  preprocessMessage,
} from "./server/clientConnection.js";
import { validateMessage } from "./net/SchemaValidator.js";
import {
  runEconomyShortageInterval,
  runEnvironmentalSiegeInterval,
  runEconomyNormalizationInterval,
  runGalaxyHeartbeatInterval,
} from "./server/galaxyTicker.js";
import { runGcSweep } from "./server/roomGc.js";
import { broadcastLobbySync, sendLobbyList } from "./server/lobbySync.js";
import {
  assignShard,
  RoomRegistry,
  routeConnection,
} from "./net/roomRouter.js";

// Interest management (spec 014): per-client area-of-interest filtering of the
// world-state broadcast — a client receives only entities near its ship (plus
// its own). Enabled by default; set INTEREST_MANAGEMENT=0 to fall back to
// sending every entity to every client. INTEREST_RADIUS (world units) tunes how
// far a client sees.
const INTEREST_ENABLED = process.env.INTEREST_MANAGEMENT !== "0";
const INTEREST_RADIUS = Number(process.env.INTEREST_RADIUS) || 3000;

// Binary wire protocol (spec 015): encode the state_snapshot/state_delta frames
// as compact binary (BinaryCodec) instead of JSON text. Enabled by default; set
// BINARY_PROTOCOL=0 to fall back to JSON for one release to de-risk. Only the
// world-state broadcast is binary — chat/notifications/market stay JSON.
const BINARY_PROTOCOL = process.env.BINARY_PROTOCOL !== "0";

// Observability (spec 010): a dependency-free metrics registry exposed at
// GET /metrics, plus a leveled JSON logger for structured events.
const metrics = createRegistry();
const logger = createLogger({ level: process.env.LOG_LEVEL || "info" });
const latencyMonitor = new LatencyMonitor();
latencyMonitor.start();
const sandboxTelemetry = new SandboxTelemetry();
sandboxTelemetry.start();

const memoryLeakSentry = new MemoryLeakSentry({
  sandboxTelemetry,
  isActiveLoad: () => {
    try {
      return (
        typeof wss !== "undefined" && wss && wss.clients && wss.clients.size > 0
      );
    } catch (_err) {
      return false;
    }
  },
});
memoryLeakSentry.start();

const anomalyDetector = new AnomalyDetector(60, 3.0);
const anomalyInterval = setInterval(() => {
  try {
    const clients =
      typeof wss !== "undefined" && wss && wss.clients ? wss.clients.size : 0;
    const latency = latencyMonitor.getLatency();
    const heapUsed = process.memoryUsage().heapUsed;
    anomalyDetector.observe(clients, latency, heapUsed);
  } catch (_e) {
    // safe catch-all
  }
}, 1000);
const resourceLimiter = new ResourceLimiter({
  onHardLimit: () => {
    if (process.env.NODE_ENV === "test") {
      console.log(
        "⚠️ [RESOURCE LIMITER] Hard limit crossed but ignored in test environment",
      );
      return;
    }
    console.error(
      "🚨 [RESOURCE LIMITER] Hard limit crossed! Triggering server shutdown.",
    );
    shutdown();
  },
});
resourceLimiter.start();

// ws inbound hardening (spec 002): cap inbound frame size to blunt memory-DoS,
// and accept only same-origin upgrades + an optional ALLOWED_ORIGINS allowlist
// (defends against Cross-Site WebSocket Hijacking).
const WS_MAX_PAYLOAD = 256 * 1024; // 256 KB — far above any legit client message
// spec 037: permessage-deflate is opt-in (off by default; AoI + binary already
// shrink the broadcast, and zlib costs CPU/memory at high concurrency).
const WS_COMPRESSION = process.env.WS_COMPRESSION === "1";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Process-level uncaught error and promise rejection logging
process.on("uncaughtException", (err) => {
  console.error("🚨 CRITICAL UNCAUGHT EXCEPTION:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "🚨 CRITICAL UNHANDLED REJECTION at:",
    promise,
    "reason:",
    reason,
  );
});

// Paths for static file server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 8080;
const WORKERS = Number(process.env.WORKERS) || 1;
const SHARD_INDEX = Number(process.env.SHARD_INDEX) || 0;

// Initialize HTTP Server (static file delivery)
const server = http.createServer((req, res) => {
  handleRestRequest(req, res, {
    metrics,
    instances,
    matchmakingQueue,
    latencyMonitor,
    sandboxTelemetry,
    apiRateLimiter,
    sandboxFirewall,
    memoryLeakSentry,
    anomalyDetector,
    clients,
    galacticChronicle,
    PORT,
    WORKERS,
    SHARD_INDEX,
    wss,
    ROOT_DIR,
  });
});

// Authoritative World State Instances Directory
const instances = new Map();
const matchmakingQueue = new JoinQueue();

/**
 * Sweeps the matchmaking queue for players waiting to join the specified room.
 * @param {Object} room
 */
function processMatchmakingQueueForRoom(room) {
  const free = freeSlots(room.metadata());
  if (free <= 0) return;

  const admitted = [];
  // Scan the queue for any matching candidates
  for (let i = 0; i < matchmakingQueue.waiting.length; i++) {
    const candidate = matchmakingQueue.waiting[i];

    // Prune dead/disconnected client sockets from the queue
    if (
      !candidate.clientObj.ws ||
      candidate.clientObj.ws.readyState !== 1 /* OPEN */
    ) {
      matchmakingQueue.waiting.splice(i, 1);
      i--;
      continue;
    }

    if (roomMatches(room.metadata(), candidate.criteria)) {
      admitted.push(candidate);
      matchmakingQueue.waiting.splice(i, 1);
      i--;
      if (admitted.length >= free) break;
    }
  }

  // Admit candidates
  for (const candidate of admitted) {
    console.log(
      `📡 Queue: Admitting queued player ${candidate.nickname} to sector ${room.name} (${room.id})`,
    );
    joinRoom(candidate.clientObj, room.id, candidate.nickname);
    candidate.clientObj.send({
      type: "match_admitted",
      roomId: room.id,
    });
  }

  if (admitted.length > 0) {
    broadcastLobbySync(instances, clients);
  }
}
const persistentSessions = new Map(); // sessionToken -> clientObj
const clients = new Map(); // ws -> clientObj

let pubsub = new InMemoryPubSub();

// Persistence layer (P1): swappable Store + serializers behind a manager that
// silently absorbs disk failures. Tests against an InMemoryStore live in
// `src/persistence/PersistenceManager.test.js`; here we wire the real file
// store so the public sector survives restarts.
let storeInstance = new JsonFileStore({
  dir: process.env.PERSISTENCE_DIR || "./data",
});

const persistenceManager = new PersistenceManager({
  store: {
    async save(key, obj) {
      return storeInstance.save(key, obj);
    },
    async load(key) {
      return storeInstance.load(key);
    },
    async has(key) {
      return storeInstance.has(key);
    },
  },
});

const galacticChronicle = new GalacticChronicle({
  store: {
    async save(key, obj) {
      return storeInstance.save(key, obj);
    },
    async load(key) {
      return storeInstance.load(key);
    },
    async has(key) {
      return storeInstance.has(key);
    },
  },
});
await galacticChronicle.load();

const apiRateLimiter = new ApiRateLimiter({
  maxPerMinute: Number(process.env.API_LIMIT_MINUTE) || 10,
  maxPerHour: Number(process.env.API_LIMIT_HOUR) || 200,
  allowlistDomains: [
    "google.com",
    "api.google.com",
    "openai.com",
    "api.openai.com",
    "localhost",
    "127.0.0.1",
  ],
});
activateOutboundSentinel(apiRateLimiter);

const sandboxFirewall = new SandboxFirewall({
  allowlistDomains: [
    "google.com",
    "api.google.com",
    "openai.com",
    "api.openai.com",
    "localhost",
    "127.0.0.1",
  ],
});
activateFirewall(sandboxFirewall);

export const wsRateLimitConfig = {
  maxPerSecond: 100,
};

export const connectionFloodSentry = new ConnectionFloodSentry({
  maxConnectionsPerIp: 5,
});

let configWatcher = null;
configWatcher = new ConfigWatcher("plan/config.json", {
  apiRateLimiter,
  sandboxFirewall,
  wsRateLimitConfig,
  instances,
  connectionFloodSentry,
  resourceLimiter,
});
configWatcher.start();

// Setup multi-room ticker loops
const TICK_RATE = 30;
const dt = 1 / TICK_RATE;

// 1. Authoritative Room Physics Updates Loop (30Hz)
const physicsInterval = setInterval(() => {
  const now = Date.now();
  for (const room of instances.values()) {
    if (room.clients.size > 0) {
      room.lastActiveTime = now;
    }

    // A. Drive AI merchant itineraries and update active AIs
    const prevOres = new Map(room.planets.map((p) => [p.name, p.market.ore]));

    for (const ai of room.ais) {
      if (ai.ship.isDestroyed) continue;

      if (ai.isRefuelTanker && ai.refuelTargetId) {
        const targetClient = room.clients.get(ai.refuelTargetId);
        if (
          targetClient &&
          targetClient.ship &&
          !targetClient.ship.isDestroyed
        ) {
          ai.destination = targetClient.ship.position.clone();

          const dist = ai.ship.position.distance(targetClient.ship.position);
          if (dist < 90) {
            targetClient.ship.hyperFuel = targetClient.ship.maxHyperFuel;
            targetClient.send({
              type: "notification",
              message:
                "Rescue Caravan: Allied Refuel Tanker transferred maximum hyperFuel!",
              style: "success",
            });
            targetClient.sendStats();

            const alertMsg = `RESCUE: ${targetClient.nickname} has been refueled by an allied Refuel Tanker.`;
            room.broadcastNotification(alertMsg, "info");
            room.broadcast({
              type: "chat",
              channel: "global",
              sender: "GALAXY-NEWS",
              text: alertMsg,
            });

            ai.ship.isDestroyed = true;
            room.engine.removeEntity(ai.ship.id);
            continue;
          }
        } else {
          ai.ship.isDestroyed = true;
          room.engine.removeEntity(ai.ship.id);
          continue;
        }
      }

      if (ai.role === "merchant" && !ai.destination) {
        const potentialHubs = room.planets.filter(
          (p) => p.position.distance(ai.ship.position) > 250,
        );
        if (potentialHubs.length > 0) {
          const nextHub =
            potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
          ai.destination = nextHub.position.clone();
        }
      }
      ai.update(dt, room.engine.entities);
    }

    for (const p of room.planets) {
      const prevVal = prevOres.get(p.name);
      if (prevVal !== undefined && p.market.ore !== prevVal) {
        room.broadcast({
          type: "market_sync",
          planetName: p.name,
          market: p.market,
        });
      }
    }

    // B. Apply Solar EMP Events Shield Regen nerfing
    const originalRegens = new Map();
    const originalCooldowns = new Map();
    if (room.activeSectorEvent && room.activeSectorEvent.type === "emp") {
      const empPlanet = room.planets.find(
        (p) => p.name === room.activeSectorEvent.planetName,
      );
      if (empPlanet) {
        for (const ent of room.engine.entities) {
          if (ent.type === "ship" && !ent.isDestroyed) {
            const dist = ent.position.distance(empPlanet.position);
            if (dist <= 400) {
              originalRegens.set(ent, ent.shieldRegen);
              ent.shieldRegen = 0;
            }
          }
        }
      }
    }

    // C. Apply Tractor Beam Matrix pull forces
    for (const ent of room.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed) {
        if (ent.outfits && ent.outfits.includes("Tractor Beam Matrix")) {
          for (const pod of room.engine.entities) {
            if (pod.type === "cargo_pod") {
              const toShip = ent.position.subtract(pod.position);
              const dist = toShip.magnitude();
              if (dist > 1 && dist <= 250) {
                const forceMag = 400000 / (dist * dist + 100);
                const pullForce = toShip
                  .normalize()
                  .multiply(forceMag * pod.mass);
                pod.applyForce(pullForce);
              }
            }
          }
        }
      }
    }

    // D. Cargo collection ingestion
    const podsToRemove = [];
    for (const pod of room.engine.entities) {
      if (pod.type === "cargo_pod") {
        for (const ship of room.engine.entities) {
          if (ship.type === "ship" && !ship.isDestroyed) {
            const dist = ship.position.distance(pod.position);
            if (dist <= ship.radius + pod.radius) {
              if (pod.isTrainingSalvage) {
                podsToRemove.push(pod);
                const client = Array.from(room.clients.values()).find(
                  (c) => c.ship === ship,
                );
                if (client) {
                  client.tutorialStep = "dock_at_port";
                  client.send({
                    type: "notification",
                    message:
                      "Salvage harvested! Return to the spaceport and land [L] to complete onboarding.",
                    style: "success",
                  });
                  client.send({
                    type: "tutorial_state",
                    step: "dock_at_port",
                  });
                  client.send({
                    type: "cargo_pickup",
                    resourceType: pod.resourceType,
                    amount: pod.amount,
                    x: pod.position.x,
                    y: pod.position.y,
                  });
                  client.sendStats();
                }
                break;
              }

              const success = ship.addCargo(pod.resourceType, pod.amount);
              if (success) {
                podsToRemove.push(pod);
                const client = Array.from(room.clients.values()).find(
                  (c) => c.ship === ship,
                );
                if (client) {
                  client.send({
                    type: "notification",
                    message: `+${pod.amount} ${pod.resourceType.toUpperCase()} collected!`,
                    style: "success",
                  });
                  client.send({
                    type: "cargo_pickup",
                    resourceType: pod.resourceType,
                    amount: pod.amount,
                    x: pod.position.x,
                    y: pod.position.y,
                  });
                  client.sendStats();
                }
                break;
              } else {
                const client = Array.from(room.clients.values()).find(
                  (c) => c.ship === ship,
                );
                if (
                  client &&
                  (!ship.lastCargoFullAlert ||
                    Date.now() - ship.lastCargoFullAlert > 2000)
                ) {
                  ship.lastCargoFullAlert = Date.now();
                  client.send({
                    type: "notification",
                    message:
                      "Cargo bay is FULL! Upgrade cargo holds or sell commodities.",
                    style: "error",
                  });
                }
              }
            }
          }
        }
      }
    }

    for (const pod of podsToRemove) {
      room.engine.removeEntity(pod);
    }

    // E. Apply Nebula Hazards
    for (const ent of room.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed) {
        let activeNebula = null;
        for (const neb of NEBULAE) {
          const dx = ent.position.x - neb.position.x;
          const dy = ent.position.y - neb.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= neb.radius) {
            activeNebula = neb;
            break;
          }
        }

        if (activeNebula) {
          if (room.engine.globalDrag > 0 && ent.velocity.magnitude() > 0) {
            const extraDragCoef = activeNebula.dragMultiplier - 1.0;
            const extraDragForce = ent.velocity.multiply(
              -extraDragCoef * room.engine.globalDrag * ent.mass,
            );
            ent.applyForce(extraDragForce);
          }
          if (activeNebula.hazardType === "shield_dampen") {
            const currentRegen = originalRegens.has(ent) ? 0 : ent.shieldRegen;
            if (!originalRegens.has(ent)) {
              originalRegens.set(ent, ent.shieldRegen);
            }
            ent.shieldRegen = currentRegen * 0.5;
          }
        }
      }
    }

    // E2. Apply Authoritative Cosmic Storm Hazards
    for (const ent of room.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed) {
        for (const storm of room.engine.entities) {
          if (storm.type === "cosmic_storm") {
            const dx = ent.position.x - storm.position.x;
            const dy = ent.position.y - storm.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= storm.radius) {
              if (storm.hazardType === "emp_storm") {
                // Drain ship energy reserves (-15 energy/sec)
                ent.energy = Math.max(0, ent.energy - 15 * dt);
                // Double weapon cooldown delay
                if (!originalCooldowns.has(ent)) {
                  originalCooldowns.set(ent, ent.weaponCooldown);
                }
                ent.weaponCooldown = originalCooldowns.get(ent) * 2.0;
              } else if (storm.hazardType === "radioactive_cloud") {
                // Deals slow, direct armor decay if shields are depleted (-5 armor/sec)
                if (ent.shield <= 0) {
                  ent.armor = Math.max(0, ent.armor - 5 * dt);
                }
              }
            }
          }
        }
      }
    }

    // F. Scramble aggressive interceptor patrols for hostile players
    room.checkReputationPatrolSpawns(dt);
    room.checkEliteHunterSpawns(dt);
    room.checkEscortAmbushSpawns(dt);
    room.checkContrabandSpaceScans(dt);

    // G. Update local room physical kinematics
    room.engine.update(dt);

    // Audit physics loop determinism (SPEC-123)
    if (room.determinismSentry) {
      room.determinismSentry.audit(room);
    }

    // G. Restore shield regens and weapon cooldowns
    for (const [ship, origRegen] of originalRegens.entries()) {
      ship.shieldRegen = origRegen;
    }
    for (const [ship, origCooldown] of originalCooldowns.entries()) {
      ship.weaponCooldown = origCooldown;
    }

    // H. Replenish Asteroids
    const activeAsteroids = room.engine.entities.filter(
      (e) => e.type === "generic" || e.type === "gem_asteroid",
    );
    if (activeAsteroids.length < 35) {
      room.spawnNewAsteroid(false);
    }

    // I. Update active fleets coordinates
    for (const code of room.fleets.keys()) {
      room.broadcastFleetUpdate(code);
    }

    // K. Tick down sector-wide Galaxy Dynamic Economic Events (SPEC-057)
    if (room.galaxyEventsManager && room.galaxyEventsManager.activeEvent) {
      const expired = room.galaxyEventsManager.tick(dt);
      if (expired) {
        // Restore all planet prices to pre-event values
        for (const p of room.planets) {
          if (p.preEventMarket) {
            p.market = { ...p.preEventMarket };
            delete p.preEventMarket;
          }
        }

        // Broadcast event clear
        room.broadcast({
          type: "galaxy_event_announcement",
          event: null,
        });

        const alertMsg = `GALAXY SHOCK OVER: The dynamic economic shock has subsided. Sector markets returned to baseline.`;
        room.broadcastNotification(alertMsg, "success");

        const chatPayload = {
          type: "chat",
          channel: "global",
          sender: "SYSTEM-ECONOMY",
          text: alertMsg,
        };
        for (const c of room.clients.values()) {
          c.send(chatPayload);
        }

        // Broadcast market synchronizations
        for (const p of room.planets) {
          room.broadcast({
            type: "market_sync",
            planetName: p.name,
            market: p.market,
          });
        }
      }
    }

    // J. Authoritative World State Broadcast (P7: snapshots + deltas).
    // Frame this tick as either a full keyframe (`state_snapshot`) or a delta
    // against the previous broadcast (`state_delta`). The wire string is built
    // ONCE per tick and reused for every client so cost stays O(clients) on the
    // socket layer alone, not O(clients * entities) on JSON.stringify.
    // Interest management (spec 014): serialize the room's entities once, then
    // frame PER CLIENT against that client's area-of-interest filter and its own
    // keyframe/delta baseline. A client receives only entities near its ship
    // (plus its own), so bandwidth scales with what a player can see rather than
    // with room size. Entities entering/leaving the AOI surface as natural
    // add/remove deltas via StateCodec, so nothing lingers client-side.
    const allEntities = room.serializeEntities();
    const spatialGrid = INTEREST_ENABLED
      ? buildSpatialGrid(allEntities, INTEREST_RADIUS)
      : null;
    const roomForceKeyframe = !!room.needsKeyframe;
    room.needsKeyframe = false;
    for (const client of room.clients.values()) {
      if (client.ws.readyState !== client.ws.OPEN) continue;

      const viewer = client.ship;
      let squadmates = [];
      if (viewer) {
        const squad = squadManager.getSquadForPlayer(client.id);
        if (squad) {
          for (const memberId of squad.memberIds) {
            if (memberId === client.id) continue;
            const smClient = room.clients.get(memberId);
            if (smClient && smClient.ship && smClient.ship.position) {
              squadmates.push({
                x: smClient.ship.position.x,
                y: smClient.ship.position.y,
              });
            }
          }
        }
      }

      let visible =
        INTEREST_ENABLED && viewer && viewer.position
          ? interestFilter(
              allEntities,
              { x: viewer.position.x, y: viewer.position.y },
              {
                radius: INTEREST_RADIUS,
                alwaysIncludeId: client.id,
                spatialGrid,
                squadmates,
              },
            )
          : allEntities;

      // Event-Loop Latency Backpressure load-shedding (SPEC-090):
      if (latencyMonitor.shouldShed("optional")) {
        visible = visible.filter(
          (ent) => ent.type !== "asteroid" && ent.type !== "projectile",
        );
      }

      const frame = nextFrame({
        entities: visible,
        prev: client.broadcastState,
        forceKeyframe:
          roomForceKeyframe || !client.broadcastState || !!client.needsKeyframe,
      });

      // Backpressure (spec 004): a slow client's send buffer must not grow
      // unbounded. Skip deltas to a backed-up client (it resyncs on the next
      // keyframe); drop one that is hopelessly behind. The per-client baseline
      // advances ONLY on a successful send, so a skipped client's next delta is
      // computed against the state it actually holds — no desync.
      const decision = sendDecision(client.ws.bufferedAmount, {
        isKeyframe: frame.isKeyframe,
      });
      if (decision === "drop") {
        client.ws.terminate();
        metrics.inc("slow_client_drops");
      } else if (decision === "send") {
        client.broadcastState = frame.nextState;
        client.needsKeyframe = false;
        const statePayload = BINARY_PROTOCOL
          ? encodeFrame(frame.payload)
          : JSON.stringify(frame.payload);
        client.ws.send(statePayload);
        metrics.inc(
          "broadcast_bytes",
          BINARY_PROTOCOL ? statePayload.byteLength : statePayload.length,
        );
      }
    }
  }
  metrics.observe("tick_ms", Date.now() - now);
  metrics.gauge("rooms", instances.size);
  metrics.gauge("clients", wss.clients.size);
  metrics.gauge("matchmaking_queue", matchmakingQueue.size);

  let totalEconomyDrifts = 0;
  for (const room of instances.values()) {
    if (room.galaxyHeartbeat && room.galaxyHeartbeat.economyDriftsTotal) {
      totalEconomyDrifts += room.galaxyHeartbeat.economyDriftsTotal;
    }
  }
  metrics.gauge("economy_drift_violations", totalEconomyDrifts);
}, 1000 / TICK_RATE);

// 2. Room Economy Shortage/Surplus events loops (45 seconds)
const economyShortageInterval = setInterval(() => {
  runEconomyShortageInterval(instances);
}, 45000);

// 3. Room Environmental Siege/EMP events loops (90 seconds)
const environmentalSiegeInterval = setInterval(() => {
  runEnvironmentalSiegeInterval(instances);
}, 90000);

// 4. Room Economy Normalization drift loops (6 seconds)
const economyNormalizationInterval = setInterval(() => {
  runEconomyNormalizationInterval(instances);
}, 6000);

// 4b. Galaxy Heartbeat: age the economy and diffuse prices across trade lanes
// even when nobody is in the sector (8 seconds).
const galaxyHeartbeatInterval = setInterval(() => {
  if (latencyMonitor.shouldShed("cosmetic")) {
    return; // Pause cosmetic/non-essential heartbeat updates when loop is degraded/critical
  }
  runGalaxyHeartbeatInterval(instances);

  // SPEC-165: Synchronize campaign state across all worker processes on heartbeat pulses
  for (const [roomId, room] of instances.entries()) {
    if (room.factionWarCampaign) {
      pubsub.publish("faction:campaign", {
        roomId,
        campaignState: room.factionWarCampaign.save(),
      });
    }
  }
}, 8000);

// Shared presence/registry keys & helpers (spec 019e)
const REGISTRY_KEY = "presence:registry";

async function loadRegistry() {
  try {
    const data = await storeInstance.load(REGISTRY_KEY);
    return RoomRegistry.fromJSON(data || {});
  } catch (err) {
    console.error(`⚠️ Failed to load RoomRegistry from store: ${err.message}`);
    return new RoomRegistry();
  }
}

async function saveRegistry(registry) {
  let attempts = 0;
  while (attempts < 5) {
    try {
      await storeInstance.save(REGISTRY_KEY, registry.serialize());
      return;
    } catch (err) {
      attempts++;
      if (attempts >= 5) {
        console.error(
          `⚠️ Failed to save RoomRegistry to store after 5 attempts: ${err.message}`,
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
      }
    }
  }
}

// 5. Inactive Custom Rooms Garbage Collection (10 seconds)
const gcInterval = setInterval(() => {
  runGcSweep(instances, {
    now: Date.now(),
    workersCount: WORKERS,
    nodeId: `node-${SHARD_INDEX}`,
    loadRegistry,
    saveRegistry,
    onRoomGc: () => {
      broadcastLobbySync(instances, clients);
    },
  });
}, 10000);

// 6. Periodic Lobby Sync Refresh for clients still on the lobby screen (5 seconds)
const lobbySyncInterval = setInterval(() => {
  broadcastLobbySync(instances, clients);
}, 5000);

// 7. Periodic Multi-worker Room Registry Heartbeat, Lease Renewal & Reaping Loop (4 seconds)
let registryHeartbeatInterval = null;
if (WORKERS > 1 || process.env.REDIS_SCALE_OUT === "1") {
  registryHeartbeatInterval = setInterval(async () => {
    const now = Date.now();
    const registry = await loadRegistry();

    // 1. Reap any expired rooms hosted by dead workers
    const reaped = registry.reapExpired(now);
    if (reaped > 0) {
      console.log(`🧹 Presence heartbeat: reaped ${reaped} expired rooms.`);
    }

    // 2. Renew lease/TTL for all active rooms owned by this worker
    let changed = false;
    const nodeId = `node-${SHARD_INDEX}`;
    for (const roomId of instances.keys()) {
      const leaseTime = 10000; // 10-second lease/TTL
      const success = registry.claim(roomId, nodeId, now + leaseTime, now);
      if (success) {
        changed = true;
      }
    }

    if (changed || reaped > 0) {
      await saveRegistry(registry);
    }
  }, 4000);
}

// Note: Heartbeat economy ticks, room GC, and lobby synchronization helper functions
// have been extracted to modular sub-modules under ./server/ for testability (spec 042).

async function joinRoom(clientObj, roomId, nickname) {
  return joinRoomExt(clientObj, roomId, nickname, {
    instances,
    WORKERS,
    SHARD_INDEX,
    loadRegistry,
    routeConnection,
    galacticChronicle,
    persistenceManager,
    saveRegistry,
    persistentSessions,
    processMatchmakingQueueForRoom,
  });
}

export function verifyWebSocketClient(info, cb) {
  const req = info.req;

  // 1. Raw upgrade URI length validation (>2048)
  if (req && req.url && req.url.length > 2048) {
    console.warn(
      `[ws] rejected upgrade: request URI length (${req.url.length}) exceeds maximum limit (2048)`,
    );
    return cb(false, 414, "URI Too Long");
  }

  // 2. Raw Content-Length validation (>4096)
  if (req && req.headers) {
    const contentLengthHeader = req.headers["content-length"];
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > 4096) {
        console.warn(
          `[ws] rejected upgrade: request Content-Length (${contentLength}) exceeds maximum limit (4096)`,
        );
        return cb(false, 413, "Payload Too Large");
      }
    }
  }

  // 3. Origin checking
  const allowed = isAllowedOrigin(info.origin, {
    host: req && req.headers ? req.headers.host : "",
    allow: ALLOWED_ORIGINS,
  });
  if (!allowed) {
    console.warn(
      `[ws] rejected upgrade from disallowed origin: ${info.origin}`,
    );
    return cb(false, 403, "Forbidden");
  }

  // 4. Inbound Connection Flood Protection & Active IP Sentry
  const ip = req
    ? req.headers["x-forwarded-for"]
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : req.socket
        ? req.socket.remoteAddress
        : "unknown"
    : "unknown";

  const floodCheck = connectionFloodSentry.register(ip);
  if (!floodCheck.allowed) {
    console.warn(`[ws] rejected upgrade from ${ip}: ${floodCheck.reason}`);
    return cb(false, 429, "Too Many Requests");
  }

  cb(true);
}

// 6. WebSockets Server Core Implementation
const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD,
  perMessageDeflate: perMessageDeflateOption(WS_COMPRESSION),
  verifyClient: verifyWebSocketClient,
});

// Liveness heartbeat (spec 003): ping every socket each interval; any socket that
// has not ponged since the last sweep is dead (half-open TCP) and is terminated,
// which routes through the normal disconnect cleanup via its "close" event.
const heartbeatInterval = setInterval(() => {
  const sockets = [...wss.clients];
  for (const dead of selectDeadSockets(sockets)) {
    dead.terminate();
    metrics.inc("heartbeat_reaps");
  }
  for (const ws of sockets) {
    if (ws.isAlive === false) continue; // just terminated above
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* socket already closing */
    }
  }
}, DEFAULT_HEARTBEAT_MS);
heartbeatInterval.unref();

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  metrics.inc("connections_total");
  logger.info("client_connected", { clients: wss.clients.size });

  const clientObj = createClientObject(ws, req, {
    latencyMonitor,
    storeInstance,
    instances,
    squadManager,
    getClients: () => Array.from(wss.clients).map((w) => w.clientObj),
    buildStatsPayload,
  });

  registerMissionSpawnHandlers(clientObj, (roomId) => instances.get(roomId));

  clients.set(ws, clientObj);

  ws.on("message", async (msgStr) => {
    const msg = preprocessMessage(clientObj, msgStr, ws, {
      wsRateLimitConfig,
      metrics,
      resourceLimiter,
      validateMessage,
    });
    if (!msg) return;

    const room = clientObj.roomId ? instances.get(clientObj.roomId) : null;

    if (
      msg.type === "join" ||
      msg.type === "quick_join" ||
      msg.type === "create_room" ||
      msg.type === "join_room"
    ) {
      handleConnectionAction(clientObj, msg, ws, {
        instances,
        clients,
        persistentSessions,
        persistenceManager,
        galacticChronicle,
        WORKERS,
        SHARD_INDEX,
        matchmakingQueue,
        joinRoom,
        sendLobbyList,
        broadcastLobbySync,
      });
    } else if (msg.type === "controls") {
      handleControls(clientObj, msg);
    } else if (msg.type === "land") {
      if (clientObj.tutorialStep === "dock_at_port") {
        await handleTutorialComplete(
          clientObj,
          instances,
          persistenceManager,
          joinRoom,
        );
      } else {
        handleLand(clientObj, room, persistenceManager);
      }
    } else if (msg.type === "launch") {
      handleLaunch(clientObj, room);
    } else if (msg.type === "trade") {
      handleTrade(clientObj, msg, room);
    } else if (msg.type === "port_service") {
      handlePortService(clientObj, msg);
    } else if (msg.type === "port_refine" || msg.type === "ore_refine") {
      handleOreRefine(clientObj, msg.quantity, msg.targetCommodity, room);
    } else if (msg.type === "jettison") {
      handleJettison(clientObj, msg, room);
    } else if (msg.type === "outfit_buy") {
      handleOutfitBuy(
        clientObj,
        msg.outfitName,
        clientObj.planetLandedOn,
        room,
      );
    } else if (msg.type === "outfit_sell") {
      handleOutfitSell(
        clientObj,
        msg.outfitName,
        clientObj.planetLandedOn,
        room,
      );
    } else if (msg.type === "preset_save") {
      handlePresetSave(clientObj, msg.presetIndex, msg.presetName);
    } else if (msg.type === "preset_load") {
      handlePresetLoad(
        clientObj,
        msg.presetIndex,
        clientObj.planetLandedOn,
        room,
      );
    } else if (msg.type === "preset_delete") {
      handlePresetDelete(clientObj, msg.presetIndex);
    } else if (msg.type === "ship_buy") {
      handleShipBuy(clientObj, msg.shipName, clientObj.planetLandedOn, room);
    } else if (
      msg.type === "squad_invite" ||
      msg.type === "squad_join" ||
      msg.type === "squad_leave"
    ) {
      handleSquadAction(clientObj, msg, wss, squadManager, pubsub);
    } else if (msg.type === "port_redeem_vouchers") {
      handleVoucherRedeem(clientObj, room);
    } else if (msg.type === "mission_accept") {
      handleMissionAccept(
        clientObj,
        msg.planetName,
        msg.missionId,
        clientObj.planetLandedOn,
        room,
      );
    } else if (msg.type === "mission_abandon") {
      handleMissionAbandon(clientObj, msg.missionId);
    } else if (
      msg.type === "fleet_create" ||
      msg.type === "fleet_join" ||
      msg.type === "fleet_leave"
    ) {
      handleFleetAction(clientObj, msg, room);
    } else if (msg.type === "chat") {
      await handleChat(clientObj, msg, room, pubsub, squadManager);
    } else if (msg.type === "warp_jump") {
      handleWarpJump(clientObj, msg, room);
    } else if (msg.type === "boarding_action") {
      handleBoardingAction(clientObj, msg, room);
    } else if (
      msg.type === "escort_command" ||
      msg.type === "escort_formation"
    ) {
      handleEscortAction(clientObj, msg, room);
    } else if (msg.type === "distress_beacon") {
      handleDistressBeacon(clientObj, room);
    } else if (msg.type === "tutorial_start") {
      await handleTutorialStart(clientObj, instances, joinRoom);
    } else if (msg.type === "tutorial_progress") {
      handleTutorialProgress(clientObj, msg);
    } else if (msg.type === "tutorial_complete") {
      handleTutorialComplete(clientObj, instances, persistenceManager);
    } else if (msg.type === "ping") {
      clientObj.send({
        type: "pong",
        time: msg.time,
      });
    }
  });

  ws.on("close", () => {
    handleClientDisconnect(ws, clientObj, {
      clients,
      connectionFloodSentry,
      matchmakingQueue,
      instances,
      persistenceManager,
      persistentSessions,
      processMatchmakingQueueForRoom,
      broadcastLobbySync,
    });
  });
});

let activeTunnel = null;

const shutdown = async () => {
  console.log("\n🔌 Shutting down server gracefully...");
  latencyMonitor.stop();
  sandboxTelemetry.stop();
  memoryLeakSentry.stop();
  resourceLimiter.stop();
  if (configWatcher) {
    try {
      configWatcher.stop();
      console.log("🛑 Configuration watcher closed.");
    } catch (e) {
      console.error("Error stopping config watcher:", e.message);
    }
  }

  // Clear all heartbeat and simulation intervals immediately to prevent race conditions during teardown (spec 019f)
  clearInterval(physicsInterval);
  clearInterval(economyShortageInterval);
  clearInterval(environmentalSiegeInterval);
  clearInterval(economyNormalizationInterval);
  clearInterval(galaxyHeartbeatInterval);
  clearInterval(gcInterval);
  clearInterval(lobbySyncInterval);
  if (registryHeartbeatInterval) {
    clearInterval(registryHeartbeatInterval);
  }
  clearInterval(heartbeatInterval);
  clearInterval(anomalyInterval);

  // Graceful Drain (spec 019f)
  if (WORKERS > 1) {
    console.log(
      "🌊 Gracefully draining worker presence and transferring rooms...",
    );
    try {
      const registry = await loadRegistry();
      const activeNodes = [];
      for (let i = 0; i < WORKERS; i++) {
        activeNodes.push(`node-${i}`);
      }
      const drainingNodeId = `node-${SHARD_INDEX}`;
      const targets = activeNodes.filter((id) => id !== drainingNodeId);

      if (targets.length > 0) {
        const rooms = Array.from(instances.keys());
        if (rooms.length > 0) {
          console.log(
            `🌊 Graceful drain: transferring ${rooms.length} room(s) to peers.`,
          );
          for (const roomId of rooms) {
            const idx = assignShard(roomId, targets.length);
            const toNode = targets[idx];
            const room = instances.get(roomId);
            if (room) {
              // 1. Save room galaxy state
              await persistenceManager.saveGalaxy(roomId, room);

              // 2. Transfer registry ownership with a 10s lease
              registry.transfer(
                roomId,
                drainingNodeId,
                toNode,
                Date.now() + 10000,
              );

              // 3. Notify clients in this room to reconnect
              for (const client of room.clients.values()) {
                client.send({
                  type: "reconnect",
                  message:
                    "Server is restarting, reconnecting to new sector host...",
                });
                // Forcefully close the connection shortly after to trigger reconnect
                setTimeout(() => {
                  try {
                    client.ws.close();
                  } catch {
                    // Ignore socket close errors
                  }
                }, 100);
              }
            }
          }
          await saveRegistry(registry);
        }
      }
    } catch (err) {
      console.error(`⚠️ Graceful drain failed: ${err.message}`);
    }
  }

  // Snapshot the world (and every connected pilot) to disk before tearing
  // down. The manager swallows errors so a flaky filesystem still lets us
  // proceed with the WS/HTTP teardown.
  persistenceManager.stopAutosave();
  try {
    const savedRooms = await persistenceManager.saveAllGalaxies(
      instances.values(),
    );
    console.log(`💾 Persisted ${savedRooms} galaxy snapshot(s).`);
    let savedPlayers = 0;
    for (const client of clients.values()) {
      if (!client || !client.id || !client.ship) continue;
      const ok = await persistenceManager.savePlayer(
        client.id,
        client,
        client.roomId,
      );
      if (ok) savedPlayers++;
    }
    if (savedPlayers > 0) {
      console.log(`💾 Persisted ${savedPlayers} active player session(s).`);
    }
  } catch (e) {
    console.error("Persistence flush during shutdown failed:", e.message);
  }

  if (activeTunnel) {
    try {
      activeTunnel.close();
      console.log("🛑 Localtunnel closed.");
    } catch (e) {
      console.error("Error closing localtunnel:", e.message);
    }
  }
  wss.close(() => {
    console.log("🛑 WebSocket server closed.");
    server.close(() => {
      console.log("🛑 HTTP server closed.");
      process.exit(0);
    });
  });

  // Force close after 2 seconds
  setTimeout(() => {
    console.log("⚠️ Forcing shutdown after timeout...");
    process.exit(1);
  }, 2000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import("worker_threads")
  .then(({ parentPort }) => {
    if (parentPort) {
      parentPort.on("message", (msg) => {
        if (msg === "shutdown") {
          shutdown();
        }
      });
    }
  })
  .catch(() => {});

/**
 * Parameterized server startup (spec 019c).
 * @param {Object} [config]
 * @param {number} [config.port]
 * @param {number} [config.shardIndex]
 * @param {number} [config.workers]
 * @returns {Promise<import("http").Server>}
 */
async function setupPubSubSubscriptions() {
  await pubsub.subscribe("chat:global", (payload) => {
    for (const room of instances.values()) {
      for (const c of room.clients.values()) {
        c.send(payload);
      }
    }
  });

  await pubsub.subscribe("chat:squad", (payload) => {
    const squadId = payload.squadId;
    for (const ws of wss.clients) {
      const c = ws.clientObj;
      if (c && squadManager.getSquadId(c.id) === squadId) {
        c.send(payload);
      }
    }
  });

  await pubsub.subscribe("squad:events", (payload) => {
    if (payload.type === "squad_invite") {
      for (const ws of wss.clients) {
        const c = ws.clientObj;
        if (
          c &&
          (c.id === payload.targetId ||
            (payload.targetNickname && c.nickname === payload.targetNickname))
        ) {
          c.send({
            type: "squad_invite_received",
            senderId: payload.senderId,
            senderNickname: payload.senderNickname,
            squadId: payload.squadId,
          });
        }
      }
    } else if (payload.type === "squad_update") {
      const { squadId, leaderId, memberIds } = payload;
      const squad = squadManager.squads.get(squadId);
      const oldMembers = squad ? Array.from(squad.memberIds) : [];

      if (memberIds.length === 0) {
        squadManager.squads.delete(squadId);
        for (const mId of oldMembers) {
          squadManager.playerToSquad.delete(mId);
          const localC = Array.from(wss.clients)
            .map((w) => w.clientObj)
            .find((c) => c && c.id === mId);
          if (localC) {
            localC.send({
              type: "notification",
              message: "Your squad has been dissolved.",
              style: "info",
            });
            localC.sendStats();
          }
        }
      } else {
        let sq = squadManager.squads.get(squadId);
        if (!sq) {
          sq = new Squad(squadId, leaderId);
          sq.memberIds = new Set(memberIds);
          squadManager.squads.set(squadId, sq);
        } else {
          sq.leaderId = leaderId;
          sq.memberIds = new Set(memberIds);
        }

        for (const mId of memberIds) {
          squadManager.playerToSquad.set(mId, squadId);
        }
        for (const mId of oldMembers) {
          if (!memberIds.includes(mId)) {
            squadManager.playerToSquad.delete(mId);
          }
        }

        if (oldMembers.length > 0) {
          const joinedId = memberIds.find((m) => !oldMembers.includes(m));
          if (joinedId) {
            let joinedNickname = "A player";
            const localJoined = Array.from(wss.clients)
              .map((w) => w.clientObj)
              .find((c) => c && c.id === joinedId);
            if (localJoined) {
              joinedNickname = localJoined.nickname;
            }

            for (const ws of wss.clients) {
              const c = ws.clientObj;
              if (c && memberIds.includes(c.id) && c.id !== joinedId) {
                c.send({
                  type: "notification",
                  message: `${joinedNickname} joined the squad!`,
                  style: "success",
                });
                c.sendStats();
              }
            }
          }

          const leftId = oldMembers.find((m) => !memberIds.includes(m));
          if (leftId) {
            let leftNickname = "A player";
            const localLeft = Array.from(wss.clients)
              .map((w) => w.clientObj)
              .find((c) => c && c.id === leftId);
            if (localLeft) {
              leftNickname = localLeft.nickname;
            }

            for (const ws of wss.clients) {
              const c = ws.clientObj;
              if (c && memberIds.includes(c.id)) {
                c.send({
                  type: "notification",
                  message: `${leftNickname} left the squad.`,
                  style: "info",
                });
                c.sendStats();
              }
            }
          }
        }
      }
    }
  });

  await pubsub.subscribe("faction:campaign", (payload) => {
    const { roomId, campaignState } = payload;
    const room = instances.get(roomId);
    if (room && room.factionWarCampaign) {
      room.factionWarCampaign.load(campaignState);
      room.broadcast({
        type: "faction_campaign_sync",
        campaign: campaignState,
      });
    }
  });
}

export async function startServer({
  port = PORT,
  shardIndex = SHARD_INDEX,
  workers = WORKERS,
} = {}) {
  // 1. Lazy load RedisStore if REDIS_URL is provided
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = await import("redis");
      const { RedisStore } = await import("./persistence/RedisStore.js");
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      storeInstance = new RedisStore({ client });
      console.log(
        `🔌 Connected to shared RedisStore at ${process.env.REDIS_URL}`,
      );

      if (process.env.REDIS_SCALE_OUT === "1") {
        const { RedisPubSub } = await import("./net/PubSub.js");
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = createClient({ url: process.env.REDIS_URL });
        await Promise.all([pubClient.connect(), subClient.connect()]);
        pubsub = new RedisPubSub({ pubClient, subClient });
        console.log(`🔌 Wired sharded RedisPubSub for multi-worker routing`);
      }
    } catch (err) {
      console.error(
        `⚠️ Failed to connect to Redis, falling back to JsonFileStore: ${err.message}`,
      );
    }
  }

  await setupPubSubSubscriptions();

  // 2. Create Default permanent Public Arena Room ONLY if this shard owns it
  if (workers === 1 || assignShard("public", workers) === shardIndex) {
    const publicInstance = new GameInstance("public", "Public Arena");
    publicInstance.chronicle = galacticChronicle;
    instances.set("public", publicInstance);

    // Restore any saved galaxy state
    const persistenceDir = process.env.PERSISTENCE_DIR || "./data";
    try {
      const snapshot = await persistenceManager.loadGalaxy(publicInstance.id);
      if (snapshot) {
        applyGalaxy(publicInstance, snapshot);
        console.log(
          `💾 Restored galaxy state for [${publicInstance.name}] from ${persistenceDir}`,
        );
      }
    } catch (err) {
      console.error(`⚠️ Failed to restore public room galaxy: ${err.message}`);
    }
  }

  // 3. Periodic galaxy autosave (P1): persist every live room
  const AUTOSAVE_INTERVAL_MS =
    Number(process.env.AUTOSAVE_INTERVAL_MS) || 30000;
  persistenceManager.startAutosave(
    () => instances.values(),
    AUTOSAVE_INTERVAL_MS,
  );

  // 4. Start HTTP/WS listening
  return new Promise((resolve, reject) => {
    server.on("error", async (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(
          `[SERVER BOOT] Port [${port}] is occupied. Initiating Port Conflict Self-Healer...`,
        );
        try {
          const { reclaimPort } = await import("./net/PortReclaimer.js");
          const reclaimed = await reclaimPort(port);
          if (reclaimed) {
            console.log(
              `[SERVER BOOT] Port [${port}] successfully reclaimed! Retrying listen...`,
            );
            server.listen(port);
          } else {
            console.error(
              `[SERVER BOOT] Port reclamation failed for port [${port}]. Exiting.`,
            );
            reject(err);
          }
        } catch (reclaimErr) {
          console.error(
            `[SERVER BOOT] Port reclaimer encountered error: ${reclaimErr.message}`,
          );
          reject(err);
        }
      } else {
        console.error(
          `[SERVER BOOT] HTTP server encountered an error: ${err.message}`,
        );
        reject(err);
      }
    });

    server.listen(port, async () => {
      console.log(
        `================================================================`,
      );
      console.log(
        `    NEBULA SECTOR AUTHORITATIVE MULTIPLAYER SERVER LISTENING    `,
      );
      console.log(
        `    PORT: ${port} | Shard: ${shardIndex}/${workers}            `,
      );
      console.log(
        `    URL: http://localhost:${port}                              `,
      );
      console.log(
        `================================================================`,
      );

      // Programmatic localtunnel startup
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.NODE_ENV !== "test"
      ) {
        try {
          const { default: localtunnel } = await import("localtunnel");
          console.log(`📡 Spinning up optional localtunnel...`);
          const tunnel = await localtunnel({ port: port });
          activeTunnel = tunnel;
          console.log(`🚀 Public Multiplayer URL: ${tunnel.url}`);

          exec(`echo ${tunnel.url} | clip`, (err) => {
            if (!err) {
              console.log(
                "📋 Public URL successfully copied to clipboard! Share it (Ctrl+V) with friends.",
              );
            } else {
              console.log("Could not copy URL to clipboard automatically.");
            }
          });

          tunnel.on("error", (err) => {
            console.error("⚠️ Localtunnel error encountered:", err.message);
          });

          tunnel.on("close", () => {
            console.log("Localtunnel connection closed.");
          });
        } catch (e) {
          console.log(
            `ℹ️  Public tunnel unavailable (${e.message}). localtunnel is optional — ` +
              `install it with \`npm i localtunnel\`, or share your game with ` +
              `\`cloudflared tunnel --url http://localhost:${port}\`.`,
          );
        }
      }
      resolve(server);
    });
  });
}

// Check if run directly or as a clustered worker
import { isMainThread } from "worker_threads";
import cluster from "cluster";

const isMain =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith("server.js"));

if (isMain) {
  const workersCount = Number(process.env.WORKERS) || 1;
  if (isMainThread && cluster.isPrimary && workersCount > 1) {
    // Supervisor Mode
    const { runSupervisor } = await import("./server/supervisor.js");
    runSupervisor(workersCount);
  } else {
    // Worker / Single Process Mode
    startServer({
      port: Number(process.env.PORT) || 8080,
      shardIndex: Number(process.env.SHARD_INDEX) || 0,
      workers: workersCount,
    });
  }
}

// MOCK DRY RUN ACTIVE - 1780988042019
