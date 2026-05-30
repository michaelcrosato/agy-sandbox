import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { exec } from "child_process";

import { Vector2D } from "./physics/Vector2D.js";
import { Ship } from "./engine/Ship.js";
import { AIController } from "./engine/ai/AIController.js";
import { MissionManager } from "./engine/MissionManager.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { GameInstance } from "./engine/GameInstance.js";
import { nextFrame } from "./net/BroadcastFramer.js";
import { interestFilter, buildSpatialGrid } from "./net/interest.js";
import { encode as encodeFrame } from "./net/BinaryCodec.js";
import { perMessageDeflateOption } from "./net/wsCompression.js";
import { squadManager } from "./server/SquadManager.js";
import {
  matchRoom,
  JoinQueue,
  freeSlots,
  roomMatches,
} from "./server/matchmaking.js";
import { JsonFileStore } from "./persistence/Store.js";
import { PersistenceManager } from "./persistence/PersistenceManager.js";
import { applyGalaxy, applyPlayer } from "./persistence/serializers.js";
import { InMemoryPubSub } from "./net/PubSub.js";
import {
  applyRepair,
  applyRefuel,
  applyRefine,
} from "./engine/PortServices.js";
import {
  consumeJump,
  DEFAULT_HYPERDRIVE_OPTIONS,
  validateWarpJump,
  getWarpToll,
} from "./engine/Hyperdrive.js";

import {
  plunder,
  boardRepair,
  boardSalvage,
  boardCapture,
} from "./engine/Boarding.js";
import { isAllowedOrigin } from "./net/originPolicy.js";
import { selectDeadSockets, DEFAULT_HEARTBEAT_MS } from "./net/heartbeat.js";
import { sendDecision } from "./net/backpressure.js";
import { createRegistry } from "./net/metrics.js";
import { createLogger } from "./net/logger.js";
import { applyOutfitStats } from "./engine/Outfitting.js";
import { DEFAULT_OUTFITS } from "./engine/outfitCatalog.js";
import {
  handleOutfitBuy,
  handleShipBuy,
  handleMissionAccept,
  handleMissionAbandon,
  handleEscortCommand,
  handleVoucherRedeem,
  handleOutfitSell,
  handlePresetSave,
  handlePresetLoad,
} from "./server/portHandlers.js";
import {
  tradeOne,
  factionPrice,
  getTransactionTaxRate,
} from "./engine/Trading.js";
import { buildStatsPayload } from "./net/statsPayload.js";
import { sanitizeNickname } from "./server/roomLifecycle.js";
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

const JUMP_FUEL_COST = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost;

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
  let safeUrl = req.url.split("?")[0];

  // Observability endpoint (spec 010): read-only runtime metrics snapshot.
  if (safeUrl === "/metrics" || safeUrl === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metrics.snapshot()));
    return;
  }

  if (safeUrl === "/" || safeUrl === "") {
    safeUrl = "/index.html";
  }

  const filePath = path.join(ROOT_DIR, safeUrl);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let mime = "text/plain";
    if (ext === ".html") mime = "text/html";
    else if (ext === ".css") mime = "text/css";
    else if (ext === ".js") mime = "application/javascript";
    else if (ext === ".json") mime = "application/json";
    else if (ext === ".png") mime = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".svg") mime = "image/svg+xml";

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
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

      const visible =
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
  runGalaxyHeartbeatInterval(instances);
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
  // 1. Clean up from previous room if switching
  if (clientObj.roomId) {
    const prevRoom = instances.get(clientObj.roomId);
    if (prevRoom && prevRoom.id !== roomId) {
      console.log(
        `🧼 Cleaning up client [${clientObj.nickname}] (${clientObj.id}) from previous sector: [${prevRoom.name}]`,
      );

      // Leave fleet
      prevRoom.leaveCurrentFleet(clientObj);

      // Clean up escorts
      if (clientObj.ship) {
        const escortsToRemove = [];
        for (const ai of prevRoom.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            escortsToRemove.push(ai);
          }
        }
        for (const ai of escortsToRemove) {
          prevRoom.engine.removeEntity(ai.ship.id);
          const idx = prevRoom.ais.indexOf(ai);
          if (idx !== -1) {
            prevRoom.ais.splice(idx, 1);
          }
        }

        // Remove ship from previous room engine
        prevRoom.engine.removeEntity(clientObj.ship.id);
      }

      // Remove client mapping
      prevRoom.clients.delete(clientObj.ws);

      prevRoom.broadcastNotification(
        `${clientObj.nickname} has left the sector.`,
        "info",
      );
      prevRoom.broadcastRosterUpdate();

      // Freed slot inside prevRoom -> scan the matchmaking queue!
      processMatchmakingQueueForRoom(prevRoom);
    }
  }

  let room = instances.get(roomId);
  if (!room && WORKERS > 1 && roomId) {
    const registry = await loadRegistry();
    const ownerNodeId = routeConnection({
      roomId,
      registry,
      shardCount: WORKERS,
    });
    console.log(
      `[DEBUG] Shard ${SHARD_INDEX} check for ${roomId}: ownerNodeId=${ownerNodeId}, registry=${JSON.stringify(registry.serialize())}`,
    );
    if (ownerNodeId === `node-${SHARD_INDEX}`) {
      room = new GameInstance(roomId, `Sector ${roomId}`);
      instances.set(roomId, room);
      console.log(
        `🌌 Dynamically instantiated custom sector on owning shard: [${room.name}] (${roomId})`,
      );

      // Restore any saved dynamic room galaxy state from store
      try {
        const snapshot = await persistenceManager.loadGalaxy(roomId);
        if (snapshot) {
          applyGalaxy(room, snapshot);
          console.log(
            `💾 Restored galaxy state for dynamic sector [${room.name}]`,
          );
        }
      } catch (err) {
        console.error(
          `⚠️ Failed to restore dynamic room galaxy: ${err.message}`,
        );
      }

      // Claim immediately inside the shared RoomRegistry presence
      registry.claim(roomId, `node-${SHARD_INDEX}`, Date.now() + 10000);
      await saveRegistry(registry);
    } else {
      clientObj.send({
        type: "notification",
        message: `Sector [${roomId}] is hosted on a different shard!`,
        style: "error",
      });
      return;
    }
  }

  if (!room) {
    room = instances.get("public");
  }

  if (!room) {
    clientObj.send({
      type: "notification",
      message: `Sector [${roomId}] is hosted on a different shard!`,
      style: "error",
    });
    return;
  }

  clientObj.roomId = room.id;
  clientObj.nickname = sanitizeNickname(nickname);

  room.clients.set(clientObj.ws, clientObj);
  room.lastActiveTime = Date.now();
  // Force the next broadcast to be a keyframe so the newcomer starts from a
  // full snapshot instead of waiting up to ~1s for the next scheduled one.
  room.needsKeyframe = true;
  // Per-client broadcast baseline (spec 014): the newcomer's snapshot/delta
  // stream is framed independently each tick against its own AOI; start it from
  // a fresh keyframe.
  clientObj.broadcastState = null;
  clientObj.needsKeyframe = true;

  const spawnPos = new Vector2D(
    (Math.random() - 0.5) * 150,
    -150 + (Math.random() - 0.5) * 50,
  );
  const ship = new Ship({
    id: clientObj.id,
    name: clientObj.nickname,
    position: spawnPos,
    velocity: new Vector2D(0, 0),
    heading: -Math.PI / 2,
    maxShield: 200,
    maxArmor: 100,
    credits: 5000,
    cargoCapacity: 20,
    thrustPower: 90000,
    brakePower: 50000,
    maxSpeed: 1800,
    turnRate: 3.2,
  });

  clientObj.ship = ship;
  room.engine.addEntity(ship);

  // Set up global session token
  const sessionToken = clientObj.id;
  persistentSessions.set(sessionToken, clientObj);

  clientObj.send({
    type: "init",
    playerId: clientObj.id,
    nickname: clientObj.nickname,
    sessionToken: sessionToken,
    roomId: room.id,
    roomName: room.name,
  });

  clientObj.send({
    type: "notification",
    message: `Welcome aboard Commander ${clientObj.nickname}! Sector ${room.name.toUpperCase()} systems nominal.`,
    style: "success",
  });

  room.broadcastNotification(`${clientObj.nickname} entered sector!`, "info");
  clientObj.sendStats();

  const bulkMarkets = {};
  for (const p of room.planets) {
    bulkMarkets[p.name] = p.market;
  }
  clientObj.send({
    type: "market_bulk_sync",
    markets: bulkMarkets,
  });

  clientObj.send({
    type: "event_sync",
    event: room.activeSectorEvent
      ? {
          type: room.activeSectorEvent.type,
          planetName: room.activeSectorEvent.planetName,
        }
      : null,
  });

  if (room.galaxyEventsManager && room.galaxyEventsManager.activeEvent) {
    clientObj.send({
      type: "galaxy_event_announcement",
      event: room.galaxyEventsManager.activeEvent,
    });
  }

  room.broadcastRosterUpdate();
}

// 6. WebSockets Server Core Implementation
const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD,
  perMessageDeflate: perMessageDeflateOption(WS_COMPRESSION),
  verifyClient: (info) => {
    const allowed = isAllowedOrigin(info.origin, {
      host: info.req && info.req.headers ? info.req.headers.host : "",
      allow: ALLOWED_ORIGINS,
    });
    if (!allowed) {
      console.warn(
        `[ws] rejected upgrade from disallowed origin: ${info.origin}`,
      );
    }
    return allowed;
  },
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

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  metrics.inc("connections_total");
  logger.info("client_connected", { clients: wss.clients.size });

  const clientId = "player-" + Math.random().toString(36).substring(2, 9);

  const clientObj = {
    ws,
    id: clientId,
    nickname: "Pilot",
    ship: null,
    missionManager: new MissionManager(),
    isLanded: false,
    planetLandedOn: null,
    fleetName: null,
    roomId: null,
    send(data) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    sendStats() {
      const room = instances.get(this.roomId);
      const registry = room ? room.factionRegistry : null;

      let squadMembers = [];
      const squad = squadManager.getSquadForPlayer(this.id);
      if (squad) {
        for (const memberId of squad.memberIds) {
          if (memberId === this.id) continue;
          const smClient = Array.from(wss.clients)
            .map((w) => w.clientObj)
            .find((c) => c && c.id === memberId);
          if (smClient) {
            squadMembers.push(smClient);
          }
        }
      }

      const payload = buildStatsPayload(this, registry, squadMembers);
      if (payload) this.send(payload);
    },
  };

  clientObj.missionManager.onStorylineStageAdvanced = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 220;
    const spawnPos = destPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    let bossShip;
    if (mission.stage === 2) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 500,
        maxArmor: 300,
        thrustPower: 26000,
        turnRate: 2.8,
        weaponDamage: 30,
        weaponCooldown: 0.2,
      });
    } else if (mission.stage === 3) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 1500,
        maxArmor: 1000,
        thrustPower: 35000,
        turnRate: 1.2,
        weaponDamage: 60,
        weaponCooldown: 0.4,
      });
    }

    const controller = new AIController(bossShip, "pirate", {
      useUtilityAdvisor: true,
    });
    room.engine.addEntity(bossShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `STORY ALERT: ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error",
    });
  };

  clientObj.missionManager.onBountyAccepted = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 200;
    const spawnPos = destPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    const bossShip = new Ship({
      name: mission.targetName,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 700,
      maxArmor: 450,
      thrustPower: 22000,
      turnRate: 2.2,
      weaponDamage: 40,
      weaponCooldown: 0.22,
    });

    const controller = new AIController(bossShip, "pirate", {
      useUtilityAdvisor: true,
    });
    room.engine.addEntity(bossShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `ALERT: Wanted threat ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error",
    });
  };

  clientObj.missionManager.onEscortAccepted = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const originPlanet = room.planets.find((p) => p.name === mission.origin);
    if (!originPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = originPlanet.landingRadius + 180;
    const spawnPos = originPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
    );

    const transportShip = new Ship({
      name: "Diplomatic Transport",
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 400,
      maxArmor: 300,
      thrustPower: 12000,
      turnRate: 2.0,
      weaponDamage: 10,
      weaponCooldown: 0.5,
    });
    transportShip.role = "escort";
    transportShip.faction = mission.faction;

    const controller = new AIController(transportShip, "escort", {
      useUtilityAdvisor: true,
      factionPolicy: room.factionRegistry.factionPolicy(),
      standingPolicy: room.factionRegistry.standingPolicy(),
    });
    controller.flagship = clientObj.ship;
    controller.escortMode = "follow";

    room.engine.addEntity(transportShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message:
        "ESCORT ACTIVE: Keep the Diplomatic Transport safe on the way to destination!",
      style: "success",
    });
  };

  clients.set(ws, clientObj);

  ws.on("message", async (msgStr) => {
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch {
      return;
    }

    const room = clientObj.roomId ? instances.get(clientObj.roomId) : null;

    if (msg.type === "join") {
      const token = msg.sessionToken;

      if (token && !persistentSessions.has(token)) {
        // First-touch after a server restart: the in-memory session map is
        // empty even though the client carries a valid token from before.
        // Try to revive them from disk; if no save exists, fall through to
        // the lobby flow below.
        persistenceManager
          .loadPlayer(token)
          .then((wrapped) => {
            if (!wrapped || !wrapped.player) {
              sendLobbyList(clientObj, instances);
              return;
            }
            // Use the saved id so the engine entity (and future saves) keep
            // the same stable identity. `applyPlayer` will also reapply this
            // but joinRoom builds the ship from `clientObj.id` first.
            if (typeof wrapped.player.id === "string" && wrapped.player.id) {
              clientObj.id = wrapped.player.id;
            }
            const targetRoomId =
              wrapped.roomId && instances.has(wrapped.roomId)
                ? wrapped.roomId
                : "public";
            joinRoom(
              clientObj,
              targetRoomId,
              wrapped.player.nickname || clientObj.nickname,
            );
            applyPlayer(clientObj, wrapped.player);
            clientObj.send({
              type: "notification",
              message: `Welcome back, Commander ${clientObj.nickname}. State restored from last session.`,
              style: "success",
            });
            clientObj.sendStats();
          })
          .catch(() => {
            // The manager already logged; just route the client to the lobby.
            sendLobbyList(clientObj, instances);
          });
        return;
      }

      if (token && persistentSessions.has(token)) {
        const sessionClient = persistentSessions.get(token);

        if (sessionClient.cleanupTimeout) {
          clearTimeout(sessionClient.cleanupTimeout);
          sessionClient.cleanupTimeout = null;
        }

        sessionClient.ws = ws;
        clients.delete(ws);
        clients.set(ws, sessionClient);

        const currentRoom =
          instances.get(sessionClient.roomId) || instances.get("public");
        sessionClient.roomId = currentRoom.id;

        // Clean up any stale WebSocket mapping for this client in the room to prevent double broadcasts
        for (const [oldWs, cl] of currentRoom.clients.entries()) {
          if (cl === sessionClient && oldWs !== ws) {
            currentRoom.clients.delete(oldWs);
          }
        }
        currentRoom.clients.set(ws, sessionClient);
        // Reconnecting client needs a full keyframe — their local snapshot/seq
        // has gone stale across the disconnect.
        currentRoom.needsKeyframe = true;

        if (sessionClient.ship) {
          const existing = currentRoom.engine.entities.find(
            (e) => e.id === sessionClient.id,
          );
          if (!existing) {
            currentRoom.engine.addEntity(sessionClient.ship);
          }
        }

        sessionClient.send({
          type: "init",
          playerId: sessionClient.id,
          nickname: sessionClient.nickname,
          sessionToken: token,
          roomId: currentRoom.id,
          roomName: currentRoom.name,
        });

        sessionClient.send({
          type: "notification",
          message: `Neural link re-established! Welcome back, Commander ${sessionClient.nickname}.`,
          style: "success",
        });

        currentRoom.broadcastNotification(
          `Commander ${sessionClient.nickname} has re-established neural link!`,
          "success",
        );
        sessionClient.sendStats();

        const bulkMarkets = {};
        for (const p of currentRoom.planets) {
          bulkMarkets[p.name] = p.market;
        }
        sessionClient.send({
          type: "market_bulk_sync",
          markets: bulkMarkets,
        });

        sessionClient.send({
          type: "event_sync",
          event: currentRoom.activeSectorEvent
            ? {
                type: currentRoom.activeSectorEvent.type,
                planetName: currentRoom.activeSectorEvent.planetName,
              }
            : null,
        });

        currentRoom.broadcastRosterUpdate();
        if (sessionClient.fleetName) {
          currentRoom.broadcastFleetUpdate(sessionClient.fleetName);
        }
      } else {
        sendLobbyList(clientObj, instances);
      }
    } else if (msg.type === "quick_join") {
      // spec 036: route the client into a room by criteria — join the fullest
      // matching room with a free slot, create a new one if nothing matches, or
      // tell the client to wait when every matching room is full.
      const criteria = {
        mode: msg.mode,
        tags: Array.isArray(msg.tags) ? msg.tags : undefined,
      };
      const roomsMeta = [];
      for (const r of instances.values()) roomsMeta.push(r.metadata());
      const decision = matchRoom(roomsMeta, criteria);

      if (decision.action === "join") {
        joinRoom(clientObj, decision.roomId, msg.nickname);
        broadcastLobbySync(instances, clients);
      } else if (decision.action === "create") {
        let qRoomId;
        let qAttempts = 0;
        do {
          qRoomId = "room-" + Math.random().toString(36).substring(2, 9);
          qAttempts++;
        } while (
          WORKERS > 1 &&
          assignShard(qRoomId, WORKERS) !== SHARD_INDEX &&
          qAttempts < 100
        );
        const created = new GameInstance(
          qRoomId,
          (msg.name || "Quick Match").trim().substring(0, 20) || "Quick Match",
        );
        if (typeof msg.mode === "string") created.mode = msg.mode;
        if (Number.isFinite(msg.maxPlayers))
          created.maxPlayers = msg.maxPlayers;
        if (Array.isArray(msg.tags)) created.tags = msg.tags;
        instances.set(qRoomId, created);
        joinRoom(clientObj, qRoomId, msg.nickname);
        broadcastLobbySync(instances, clients);
      } else {
        // Every matching sector is full — the client waits for a freed slot.
        matchmakingQueue.enqueue({
          clientObj,
          criteria,
          nickname: msg.nickname || clientObj.nickname,
        });

        clientObj.send({
          type: "matchmaking_queued",
          message: "All matching sectors are full. You are in the queue.",
          criteria,
        });
      }
    } else if (msg.type === "create_room") {
      const name = (msg.name || "").trim().substring(0, 20);
      if (!name) {
        clientObj.send({
          type: "notification",
          message: "Invalid Sector Name!",
          style: "error",
        });
        return;
      }
      let newRoomId;
      let attempts = 0;
      do {
        newRoomId = "room-" + Math.random().toString(36).substring(2, 9);
        attempts++;
      } while (
        WORKERS > 1 &&
        assignShard(newRoomId, WORKERS) !== SHARD_INDEX &&
        attempts < 100
      );
      const newRoomInstance = new GameInstance(newRoomId, name);
      instances.set(newRoomId, newRoomInstance);
      console.log(`🌌 Created custom sector: [${name}] (${newRoomId})`);

      joinRoom(clientObj, newRoomId, msg.nickname);
      broadcastLobbySync(instances, clients);
    } else if (msg.type === "join_room") {
      joinRoom(clientObj, msg.roomId || "public", msg.nickname);
      broadcastLobbySync(instances, clients);
    } else if (msg.type === "controls") {
      if (
        clientObj.ship &&
        !clientObj.isLanded &&
        !clientObj.ship.isDestroyed
      ) {
        clientObj.ship.setControls(msg.controls);
        clientObj.ship.heading = msg.heading;
      }
    } else if (msg.type === "land") {
      if (
        clientObj.ship &&
        !clientObj.isLanded &&
        !clientObj.ship.isDestroyed &&
        room
      ) {
        const targetPlanet = room.planets.find((p) =>
          p.canLand(clientObj.ship),
        );
        if (targetPlanet) {
          // spec 016: refuse docking when the player's standing with the
          // planet's controlling faction is hostile.
          if (
            room.factionRegistry &&
            targetPlanet.faction &&
            !room.factionRegistry.dockingPermitted(
              clientObj.id,
              targetPlanet.faction,
            )
          ) {
            clientObj.send({
              type: "notification",
              message: `Docking refused at ${targetPlanet.name}: ${targetPlanet.faction} considers you hostile.`,
              style: "error",
            });
            return;
          }
          const completed = clientObj.missionManager.checkArrivalCompletions(
            targetPlanet.name,
            clientObj.ship,
            room,
          );
          for (const m of completed) {
            if (m.promotionMessage) {
              clientObj.send({
                type: "notification",
                message: m.promotionMessage,
                style: "success",
              });
            }
            if (clientObj.fleetName) {
              const fleetSet = room.fleets.get(clientObj.fleetName);
              if (fleetSet && fleetSet.size > 1) {
                const share = Math.floor(m.reward / fleetSet.size);
                clientObj.ship.credits -= m.reward;
                for (const member of fleetSet) {
                  if (member.ship) {
                    member.ship.credits += share;
                    member.send({
                      type: "notification",
                      message: `Fleet Contract Completed: ${m.title} by ${clientObj.nickname}! Share: +${share.toLocaleString()} CR`,
                      style: "success",
                    });
                    member.sendStats();
                  }
                }
                continue;
              }
            }

            clientObj.send({
              type: "notification",
              message: `Contract Completed: ${m.title}! Received +${m.reward.toLocaleString()} CR`,
              style: "success",
            });
          }

          if (
            targetPlanet.name !== "Rogue's Hollow" &&
            clientObj.ship.cargo.contraband > 0
          ) {
            let bestJammerValue = 0;
            if (clientObj.ship.outfits) {
              for (const outfitName of clientObj.ship.outfits) {
                const spec = DEFAULT_OUTFITS.find((o) => o.name === outfitName);
                if (spec && spec.type === "jammer") {
                  if (spec.value > bestJammerValue) {
                    bestJammerValue = spec.value;
                  }
                }
              }
            }

            let scanDetected = true;
            if (bestJammerValue > 0) {
              const rng = clientObj.ship.rng || Math.random;
              if (rng() < bestJammerValue) {
                scanDetected = false;
              }
            }

            if (scanDetected) {
              clientObj.ship.cargo.contraband = 0;
              clientObj.ship.credits = Math.max(
                0,
                clientObj.ship.credits - 1500,
              );
              clientObj.send({
                type: "notification",
                message:
                  "Security Scan: Contraband detected! Confiscated and fined 1,500 CR.",
                style: "error",
              });
            } else {
              clientObj.send({
                type: "notification",
                message:
                  "Security Scan: Contraband jamming successful! Scan bypassed.",
                style: "success",
              });
            }
          }

          clientObj.isLanded = true;
          clientObj.planetLandedOn = targetPlanet;
          clientObj.ship.velocity = new Vector2D(0, 0);
          clientObj.ship.clearControls();
          clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel;
          room.engine.removeEntity(clientObj.id);

          // Generate available missions authoritatively on the server
          if (!clientObj.missionManager.availableMissions[targetPlanet.name]) {
            clientObj.missionManager.generateMissionsForPlanet(
              targetPlanet.name,
              room.planets,
              room.factionRegistry,
              clientObj.id,
            );
          }
          const available =
            clientObj.missionManager.availableMissions[targetPlanet.name];

          clientObj.send({
            type: "landed",
            planetName: targetPlanet.name,
            availableMissions: available,
          });
          clientObj.send({
            type: "notification",
            message: `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
            style: "success",
          });
          clientObj.sendStats();
          room.broadcastRosterUpdate();

          // Docking is a natural save-point: state is stable and trades have
          // just happened. Fire-and-forget; errors are swallowed by the manager.
          persistenceManager.savePlayer(clientObj.id, clientObj, room.id);
        } else {
          clientObj.send({
            type: "notification",
            message:
              "Cannot land here. Travel within trigger radius at low speed (< 80 u/s).",
            style: "error",
          });
        }
      }
    } else if (msg.type === "launch") {
      if (clientObj.ship && clientObj.isLanded && room) {
        const p = clientObj.planetLandedOn;
        clientObj.isLanded = false;
        clientObj.planetLandedOn = null;

        clientObj.ship.position = p.position.add(
          new Vector2D(0, p.landingRadius + 40),
        );
        clientObj.ship.velocity = new Vector2D(0, 0);
        clientObj.ship.clearControls();
        room.engine.addEntity(clientObj.ship);

        clientObj.send({ type: "launched" });
        clientObj.send({
          type: "notification",
          message: "Launch sequence completed! Thrusters online.",
          style: "success",
        });
        clientObj.sendStats();
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "trade") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        const p = clientObj.planetLandedOn;
        const basePrice = p.market[msg.item];
        if (basePrice === undefined) return;
        // spec 016: friendly standing discounts buys / lifts sells at a faction
        // dock; hostile standing does the inverse. No-op without a faction.
        const price = factionPrice(
          basePrice,
          room.factionRegistry,
          clientObj.id,
          p.faction,
          msg.action,
        );

        const taxRate = getTransactionTaxRate(
          room.factionRegistry,
          clientObj.id,
          p.faction,
        );
        const finalPrice =
          msg.action === "buy"
            ? Math.round(price * (1 + taxRate))
            : Math.max(1, Math.round(price * (1 - taxRate)));

        const result = tradeOne(
          clientObj.ship,
          msg.item,
          msg.action,
          finalPrice,
        );
        if (result.ok) {
          if (msg.action === "buy") {
            room.economyManager.registerBuy(p.name, msg.item);
          } else {
            room.economyManager.registerSell(p.name, msg.item);
          }

          // spec 032: successful trading at a faction-controlled port nudges standing
          if (room.factionRegistry && p.faction) {
            const TRADE_STANDING_NUDGE = 0.5;
            room.factionRegistry.adjustStanding(
              clientObj.id,
              p.faction,
              TRADE_STANDING_NUDGE,
            );
          }
          clientObj.send({
            type: "notification",
            message:
              result.reason === "bought"
                ? `Purchased 1 ton of ${msg.item} for ${finalPrice} CR`
                : `Sold 1 ton of ${msg.item} for ${finalPrice} CR`,
            style: "success",
          });
          clientObj.sendStats();
          room.broadcast({
            type: "market_sync",
            planetName: p.name,
            market: p.market,
          });
        } else if (result.reason !== "unknown_action") {
          clientObj.send({
            type: "notification",
            message:
              result.reason === "insufficient_credits"
                ? "Insufficient credits!"
                : result.reason === "cargo_full"
                  ? "Cargo hold is full!"
                  : `No ${msg.item} in cargo bay!`,
            style: "error",
          });
        }
      }
    } else if (msg.type === "port_service") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        const services = clientObj.planetLandedOn.services || {};
        if (msg.service === "repair" && services.repair) {
          const r = applyRepair(clientObj.ship);
          clientObj.send({
            type: "notification",
            message: r.ok
              ? `Hull repaired (+${r.repaired} armor) for ${r.cost} CR.`
              : r.cost > 0
                ? "Insufficient credits to repair hull."
                : "Hull is already at full integrity.",
            style: r.ok ? "success" : "error",
          });
          if (r.ok) clientObj.sendStats();
        } else if (msg.service === "refuel" && services.refuel) {
          const r = applyRefuel(clientObj.ship);
          clientObj.send({
            type: "notification",
            message: r.ok
              ? `Hyperdrive refueled (+${r.refueled}) for ${r.cost} CR.`
              : r.cost > 0
                ? "Insufficient credits to refuel."
                : "Hyperdrive fuel is already full.",
            style: r.ok ? "success" : "error",
          });
          if (r.ok) clientObj.sendStats();
        }
      }
    } else if (msg.type === "port_refine") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        const qty = parseInt(msg.quantity, 10);
        const targetComm = msg.targetCommodity || "minerals";
        const registry = room.engine.factionRegistry || null;

        const r = applyRefine(
          clientObj.ship,
          clientObj.planetLandedOn,
          qty,
          {},
          registry,
          clientObj.ship.id,
          targetComm,
        );

        if (r.ok) {
          clientObj.send({
            type: "notification",
            message: `Refined ${r.refined} units of raw ore into ${r.produced} units of ${targetComm} for ${r.cost} CR.`,
            style: "success",
          });
          clientObj.sendStats();
        } else {
          let errorMsg = "Refining failed.";
          if (r.reason === "no_refinery_services") {
            errorMsg = "This planet does not possess refinery services.";
          } else if (r.reason === "invalid_target_commodity") {
            errorMsg = "Invalid target commodity for refining.";
          } else if (r.reason === "invalid_quantity") {
            errorMsg = "Invalid refine quantity specified.";
          } else if (r.reason.startsWith("quantity_must_be_multiple_of")) {
            errorMsg = r.reason.replace(/_/g, " ");
          } else if (r.reason === "insufficient_ore") {
            errorMsg = "You do not possess enough raw ore in your cargo.";
          } else if (r.reason === "insufficient_credits") {
            errorMsg = `Insufficient credits! Needs ${r.cost} CR.`;
          } else if (r.reason === "cargo_full") {
            errorMsg = "Cargo hold is full!";
          }
          clientObj.send({
            type: "notification",
            message: errorMsg,
            style: "error",
          });
        }
      }
    } else if (msg.type === "jettison") {
      if (clientObj.ship && room) {
        const pod = room.jettisonFromShip(
          clientObj.ship,
          msg.item,
          Number(msg.amount) || 1,
        );
        if (pod) {
          clientObj.send({
            type: "notification",
            message: `Jettisoned ${pod.amount} ton(s) of ${pod.resourceType}.`,
            style: "info",
          });
          clientObj.sendStats();
        } else {
          clientObj.send({
            type: "notification",
            message: "Nothing to jettison.",
            style: "error",
          });
        }
      }
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
      handlePresetSave(clientObj, msg.presetIndex);
    } else if (msg.type === "preset_load") {
      handlePresetLoad(
        clientObj,
        msg.presetIndex,
        clientObj.planetLandedOn,
        room,
      );
    } else if (msg.type === "ship_buy") {
      handleShipBuy(clientObj, msg.shipName, clientObj.planetLandedOn, room);
    } else if (msg.type === "squad_invite") {
      const target = Array.from(wss.clients)
        .map((ws) => ws.clientObj)
        .find(
          (c) =>
            c &&
            (c.id === msg.targetId ||
              (msg.targetNickname && c.nickname === msg.targetNickname)),
        );
      if (!target) {
        clientObj.send({
          type: "notification",
          message: "Target player not found!",
          style: "error",
        });
        return;
      }
      let squad = squadManager.getSquadForPlayer(clientObj.id);
      if (!squad) {
        squad = squadManager.createSquad(clientObj.id);
      }
      target.send({
        type: "squad_invite_received",
        senderId: clientObj.id,
        senderNickname: clientObj.nickname,
        squadId: squad.id,
      });
      clientObj.send({
        type: "notification",
        message: `Sent squad invite to ${target.nickname}!`,
        style: "success",
      });
    } else if (msg.type === "squad_join") {
      const res = squadManager.joinSquad(msg.squadId, clientObj.id);
      if (res.success) {
        const squad = squadManager.getSquadForPlayer(clientObj.id);
        const squadMembers = Array.from(wss.clients)
          .map((ws) => ws.clientObj)
          .filter((c) => c && squad.memberIds.has(c.id));
        for (const member of squadMembers) {
          member.send({
            type: "notification",
            message: `${clientObj.nickname} joined the squad!`,
            style: "success",
          });
          member.sendStats();
        }
      } else {
        clientObj.send({
          type: "notification",
          message: res.reason,
          style: "error",
        });
      }
    } else if (msg.type === "squad_leave") {
      const squad = squadManager.getSquadForPlayer(clientObj.id);
      if (squad) {
        const squadId = squad.id;
        squadManager.leaveSquad(clientObj.id);
        clientObj.send({
          type: "notification",
          message: "You left the squad.",
          style: "info",
        });
        clientObj.sendStats();

        const remainingMembers = Array.from(wss.clients)
          .map((ws) => ws.clientObj)
          .filter((c) => c && squadManager.getSquadId(c.id) === squadId);
        for (const member of remainingMembers) {
          member.send({
            type: "notification",
            message: `${clientObj.nickname} left the squad.`,
            style: "info",
          });
          member.sendStats();
        }
      }
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
    } else if (msg.type === "fleet_create" || msg.type === "fleet_join") {
      const code = (msg.fleetName || "").toUpperCase().trim().substring(0, 10);
      if (!code) {
        clientObj.send({
          type: "notification",
          message: "Invalid Fleet Code!",
          style: "error",
        });
        return;
      }

      if (room) {
        room.leaveCurrentFleet(clientObj);
        clientObj.fleetName = code;
        if (!room.fleets.has(code)) {
          room.fleets.set(code, new Set());
        }
        room.fleets.get(code).add(clientObj);

        clientObj.send({
          type: "notification",
          message: `Joined fleet: ${code}`,
          style: "success",
        });

        room.broadcastFleetUpdate(code);
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "fleet_leave") {
      if (clientObj.fleetName && room) {
        const oldCode = clientObj.fleetName;
        room.leaveCurrentFleet(clientObj);
        clientObj.send({
          type: "notification",
          message: `Left fleet: ${oldCode}`,
          style: "info",
        });
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "chat") {
      const channel = msg.channel || "global";
      const text = (msg.text || "").trim().substring(0, 100);
      if (!text) return;

      let isSquadMsg = channel === "squad";
      let squadText = text;
      if (text.startsWith("/squad ")) {
        isSquadMsg = true;
        squadText = text.substring(7).trim();
      }

      if (isSquadMsg) {
        const squad = squadManager.getSquadForPlayer(clientObj.id);
        if (!squad) {
          clientObj.send({
            type: "notification",
            message:
              "You are not in a squad! Invite someone using /squad invite or join a squad.",
            style: "error",
          });
          return;
        }

        const chatPayload = {
          type: "chat",
          channel: "squad",
          sender: clientObj.nickname,
          text: squadText,
          squadId: squad.id,
        };

        await pubsub.publish("chat:squad", chatPayload);
      } else if (channel === "fleet" && room) {
        if (!clientObj.fleetName) {
          clientObj.send({
            type: "notification",
            message: "You are not in a fleet! Join a fleet to use Fleet comms.",
            style: "error",
          });
          return;
        }

        const fleetSet = room.fleets.get(clientObj.fleetName);
        if (fleetSet) {
          const chatPayload = {
            type: "chat",
            channel: "fleet",
            sender: clientObj.nickname,
            text: text,
          };
          for (const member of fleetSet) {
            member.send(chatPayload);
          }
        }
      } else if (room) {
        const chatPayload = {
          type: "chat",
          channel: "global",
          sender: clientObj.nickname,
          text: text,
        };
        await pubsub.publish("chat:global", chatPayload);
      }
    } else if (msg.type === "warp_jump") {
      if (room) {
        const gate = room.engine.getEntity(msg.gateId);
        const governingFaction = room.getGoverningFaction();
        const val = validateWarpJump(
          clientObj.ship,
          gate,
          JUMP_FUEL_COST,
          room.factionRegistry,
          governingFaction,
          room.engine.entities,
        );
        if (!val.ok) {
          clientObj.send({
            type: "notification",
            message: val.reason,
            style: "error",
          });
          return;
        }

        const toll = getWarpToll(
          clientObj.ship,
          room.factionRegistry,
          governingFaction,
        );
        consumeJump(clientObj.ship, JUMP_FUEL_COST);
        if (toll > 0) {
          clientObj.ship.credits = Math.max(0, clientObj.ship.credits - toll);
        }
        clientObj.ship.position = gate.targetPosition.clone();
        clientObj.ship.velocity.set(0, 0);

        clientObj.send({
          type: "warp_success",
          targetSector: gate.targetSector,
          position: { x: gate.targetPosition.x, y: gate.targetPosition.y },
          hyperFuel: clientObj.ship.hyperFuel,
        });

        clientObj.send({
          type: "notification",
          message: `Hyperspace drive engaged! Warp transition to ${gate.targetSector.toUpperCase()} Sector completed.`,
          style: "success",
        });

        let escortCount = 0;
        for (const ai of room.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            ai.ship.position = gate.targetPosition.add(
              new Vector2D(
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100,
              ),
            );
            ai.ship.velocity.set(0, 0);
            escortCount++;
          }
        }
        if (escortCount > 0) {
          clientObj.send({
            type: "notification",
            message: `${escortCount} AI escorts made the hyperspace jump with you.`,
            style: "info",
          });
        }

        clientObj.sendStats();
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "boarding_action") {
      if (room) {
        const target = room.engine.getEntity(msg.targetId);
        if (!target || target.type !== "ship" || !target.isDisabled) {
          clientObj.send({
            type: "notification",
            message: "Target invalid or not disabled!",
            style: "error",
          });
          return;
        }
        const dist = clientObj.ship.position.distance(target.position);
        if (dist > 250) {
          clientObj.send({
            type: "notification",
            message: "Target too far for boarding! Move within 250u.",
            style: "error",
          });
          return;
        }

        if (msg.action === "plunder") {
          const result = plunder(clientObj.ship, target, {
            boardRange: 250,
            maxBoardSpeed: Number.POSITIVE_INFINITY,
          });
          if (result.ok) {
            const tons = Object.values(result.cargo).reduce((a, b) => a + b, 0);
            clientObj.send({
              type: "notification",
              message: `Plundered ${tons} ton(s) of cargo and ${result.credits.toLocaleString()} CR.`,
              style: "success",
            });
            clientObj.sendStats();
          } else {
            clientObj.send({
              type: "notification",
              message:
                "Nothing to plunder — this hulk has already been stripped.",
              style: "info",
            });
          }
        } else if (msg.action === "repair") {
          const result = boardRepair(clientObj.ship, target, {
            boardRange: 250,
            maxBoardSpeed: Number.POSITIVE_INFINITY,
          });
          if (result.ok) {
            clientObj.send({
              type: "notification",
              message: `Boarding repair complete: restored ${result.repaired} armor and revived the ship.`,
              style: "success",
            });
          } else {
            clientObj.send({
              type: "notification",
              message: "Cannot repair: target is not boardable.",
              style: "error",
            });
          }
        } else if (msg.action === "salvage") {
          const result = boardSalvage(clientObj.ship, target);
          if (result.ok) {
            if (result.salvaged) {
              const match = DEFAULT_OUTFITS.find(
                (o) => o.name === result.salvaged,
              );
              if (match) applyOutfitStats(clientObj.ship, match);

              clientObj.send({
                type: "notification",
                message: `Hull Component Salvaged! Equipped: ${result.salvaged}`,
                style: "success",
              });
            } else {
              clientObj.send({
                type: "notification",
                message: `No new modules found. Salvaged scrap for +${result.credits} CR.`,
                style: "info",
              });
            }
            clientObj.sendStats();
          }
        } else if (msg.action === "capture") {
          const result = boardCapture(clientObj.ship, target, 1500);
          if (!result.ok) {
            clientObj.send({
              type: "notification",
              message: result.reason,
              style: "error",
            });
            return;
          }

          target.name = `${clientObj.nickname}'s Escort`;

          const controller = new AIController(target, "escort", {
            useUtilityAdvisor: true,
          });
          controller.flagship = clientObj.ship;
          room.ais.push(controller);

          clientObj.send({
            type: "notification",
            message: `Neural Command Link Established! Escort active.`,
            style: "success",
          });
          clientObj.sendStats();
        } else if (msg.action === "scuttle") {
          const scrapReward = Math.floor(
            target.maxArmor * 4 + Math.random() * 200,
          );
          clientObj.ship.credits += scrapReward;
          room.engine.removeEntity(target.id);

          clientObj.send({
            type: "notification",
            message: `Hull scuttled. Salvaged scrap for +${scrapReward} CR`,
            style: "success",
          });
          clientObj.sendStats();
        }

        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "escort_command") {
      handleEscortCommand(clientObj, msg, room);
    } else if (msg.type === "ping") {
      clientObj.send({
        type: "pong",
        time: msg.time,
      });
    }
  });

  ws.on("close", () => {
    const activeClient = clients.get(ws) || clientObj;

    // Prune this client from the matchmaking queue immediately on disconnect
    matchmakingQueue.remove(activeClient);
    matchmakingQueue.waiting = matchmakingQueue.waiting.filter(
      (c) => c.clientObj !== activeClient && c.clientObj.ws !== ws,
    );

    activeClient.cleanupTimeout = setTimeout(() => {
      const currentRoom = instances.get(activeClient.roomId);
      // Persist the player's final state before evicting session from
      // memory; this is the only chance to capture credits/cargo/missions for
      // a returning pilot who reconnects after the server restarts.
      persistenceManager.savePlayer(
        activeClient.id,
        activeClient,
        activeClient.roomId,
      );
      if (currentRoom) {
        currentRoom.leaveCurrentFleet(activeClient);
        if (activeClient.ship) {
          // Also clean up any escorts belonging to this client!
          const escortsToRemove = [];
          for (const ai of currentRoom.ais) {
            if (ai.role === "escort" && ai.flagship === activeClient.ship) {
              escortsToRemove.push(ai);
            }
          }
          for (const ai of escortsToRemove) {
            currentRoom.engine.removeEntity(ai.ship.id);
            const idx = currentRoom.ais.indexOf(ai);
            if (idx !== -1) {
              currentRoom.ais.splice(idx, 1);
            }
          }

          currentRoom.engine.removeEntity(activeClient.id);
        }
        currentRoom.clients.delete(ws);
      }
      clients.delete(ws);
      persistentSessions.delete(activeClient.id);
      if (currentRoom) {
        currentRoom.broadcastNotification(
          `${activeClient.nickname} has left the sector (neural link lost).`,
          "info",
        );
        currentRoom.broadcastRosterUpdate();

        // Freed slot inside currentRoom -> scan the matchmaking queue!
        processMatchmakingQueueForRoom(currentRoom);
      }
      broadcastLobbySync(instances, clients);
    }, 30000);

    clients.delete(ws);
    const currentRoom = instances.get(activeClient.roomId);
    if (currentRoom) {
      currentRoom.broadcastNotification(
        `${activeClient.nickname} neural link disconnected. Standby recovery active...`,
        "warning",
      );
      currentRoom.broadcastRosterUpdate();
    }
  });
});

let activeTunnel = null;

const shutdown = async () => {
  console.log("\n🔌 Shutting down server gracefully...");

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
  return new Promise((resolve) => {
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
