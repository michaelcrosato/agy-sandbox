import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { exec } from "child_process";

import { registerMissionSpawnHandlers } from "./server/missionSpawnHandlers.js";

import { perMessageDeflateOption } from "./net/wsCompression.js";
import { squadManager } from "./server/SquadManager.js";
import { JoinQueue } from "./server/matchmaking.js";
import { JsonFileStore } from "./persistence/Store.js";
import { PersistenceManager } from "./persistence/PersistenceManager.js";
import { GalacticChronicle } from "./persistence/GalacticChronicle.js";
import {
  ApiRateLimiter,
  activateOutboundSentinel,
} from "./net/ApiRateLimiter.js";
import { SandboxFirewall, activateFirewall } from "./net/SandboxFirewall.js";
import { initializeDefaultRooms } from "./server/roomInitializer.js";
import { InMemoryPubSub } from "./net/PubSub.js";

import { createRegistry } from "./net/metrics.js";
import { createLogger } from "./net/logger.js";
import { LatencyMonitor } from "./net/LatencyMonitor.js";
import { SandboxTelemetry } from "./net/SandboxTelemetry.js";
import { ResourceLimiter } from "./net/ResourceLimiter.js";
import { MemoryLeakSentry } from "./net/MemoryLeakSentry.js";
import { AnomalyDetector } from "./net/AnomalyDetector.js";
import { ConfigWatcher } from "./net/ConfigWatcher.js";
import { ConnectionFloodSentry } from "./net/ConnectionFloodSentry.js";
import { routeMessage } from "./server/messageRouter.js";
import { handleRestRequest } from "./server/restHandlers.js";
import {
  joinRoom as joinRoomExt,
  handleClientDisconnect,
} from "./server/connectionLifecycle.js";
import { verifyWebSocketClient as verifyWebSocketClientExt } from "./server/verifyWebSocketClient.js";
import { processMatchmakingQueueForRoom as processMatchmakingQueueForRoomExt } from "./server/matchmakingQueueProcessor.js";
import { processPhysicsTickForRoom } from "./server/physicsTickProcessor.js";
import { startPeriodicIntervals } from "./server/periodicIntervals.js";
import { createShutdownHandler } from "./server/shutdownHandler.js";
import { buildStatsPayload } from "./net/statsPayload.js";
import { registerWebSocketConnection } from "./server/clientConnection.js";
import {
  loadRegistry as loadRegistryStore,
  saveRegistry as saveRegistryStore,
} from "./server/roomRegistryStore.js";
import { setupRedis } from "./server/redisSetup.js";
import { validateMessage } from "./net/SchemaValidator.js";
import { registerPubSubSubscriptions } from "./server/pubsubSubscriptions.js";
import { broadcastLobbySync, sendLobbyList } from "./server/lobbySync.js";
import { routeConnection } from "./net/roomRouter.js";

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
let periodicIntervalHandles = null;
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
  processMatchmakingQueueForRoomExt(room, {
    matchmakingQueue,
    joinRoom,
    broadcastLobbySync,
    instances,
    clients,
  });
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

    processPhysicsTickForRoom(room, dt, {
      squadManager,
      latencyMonitor,
      metrics,
      interestEnabled: INTEREST_ENABLED,
      interestRadius: INTEREST_RADIUS,
      binaryProtocol: BINARY_PROTOCOL,
    });
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

// Room economy shortage, environmental siege, normalization, and galaxy heartbeat intervals
// are managed under startPeriodicIntervals.

const loadRegistry = () => loadRegistryStore(storeInstance);
const saveRegistry = (registry) => saveRegistryStore(storeInstance, registry);

// Custom GC, lobby sync, and multi-worker registry heartbeat intervals
// are managed under startPeriodicIntervals.

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
  return verifyWebSocketClientExt(info, cb, {
    allowedOrigins: ALLOWED_ORIGINS,
    connectionFloodSentry,
  });
}

// 6. WebSockets Server Core Implementation
const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD,
  perMessageDeflate: perMessageDeflateOption(WS_COMPRESSION),
  verifyClient: verifyWebSocketClient,
});

periodicIntervalHandles = startPeriodicIntervals({
  instances,
  pubsub,
  wss,
  clients,
  metrics,
  latencyMonitor,
  anomalyDetector,
  connectionFloodSentry,
  resourceLimiter,
  loadRegistry,
  saveRegistry,
  shardIndex: SHARD_INDEX,
  workers: WORKERS,
});

wss.on("connection", (ws, req) => {
  registerWebSocketConnection(ws, req, {
    metrics,
    logger,
    latencyMonitor,
    storeInstance,
    instances,
    squadManager,
    buildStatsPayload,
    registerMissionSpawnHandlers,
    clients,
    wsRateLimitConfig,
    resourceLimiter,
    validateMessage,
    routeMessage,
    persistentSessions,
    persistenceManager,
    galacticChronicle,
    pubsub,
    wss,
    WORKERS,
    SHARD_INDEX,
    matchmakingQueue,
    joinRoom,
    sendLobbyList,
    broadcastLobbySync,
    connectionFloodSentry,
    handleClientDisconnect,
    processMatchmakingQueueForRoom,
  });
});

let activeTunnel = null;

const shutdown = createShutdownHandler({
  latencyMonitor,
  sandboxTelemetry,
  memoryLeakSentry,
  resourceLimiter,
  getConfigWatcher: () => configWatcher,
  physicsInterval,
  getPeriodicIntervalHandles: () => periodicIntervalHandles,
  loadRegistry,
  saveRegistry,
  instances,
  persistenceManager,
  clients,
  getActiveTunnel: () => activeTunnel,
  wss,
  server,
  workers: WORKERS,
  shardIndex: SHARD_INDEX,
});

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
export async function startServer({
  port = PORT,
  shardIndex = SHARD_INDEX,
  workers = WORKERS,
} = {}) {
  // 1. Initialize storage and Pub/Sub connections
  const redisSetup = await setupRedis();
  storeInstance = redisSetup.storeInstance;
  pubsub = redisSetup.pubsub;

  await registerPubSubSubscriptions({
    pubsub,
    instances,
    wss,
    squadManager,
  });

  // 2. Create Default permanent Public Arena Room ONLY if this shard owns it
  await initializeDefaultRooms({
    workers,
    shardIndex,
    instances,
    galacticChronicle,
    persistenceManager,
  });

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
