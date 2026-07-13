import { MissionManager } from "../engine/MissionManager.js";
import { sendClientStats } from "./clientStats.js";
import { clientIpFromRequest, isProxyTrusted } from "../net/httpSecurity.js";

/**
 * Creates and initializes a connection client state object.
 *
 * @param {object} ws - The active WebSocket connection.
 * @param {object} req - The incoming upgrade HTTP request.
 * @param {object} options - Unified context singletons.
 * @returns {object} The initialized client state object.
 */
export function createClientObject(ws, req, options) {
  const {
    latencyMonitor,
    storeInstance,
    instances,
    squadManager,
    getClients,
    buildStatsPayload,
  } = options;

  const clientIp = clientIpFromRequest(req, { trustProxy: isProxyTrusted() });

  const clientId = "player-" + Math.random().toString(36).substring(2, 9);

  return {
    ws,
    id: clientId,
    nickname: "Pilot",
    ip: clientIp,
    ship: null,
    missionManager: new MissionManager(),
    isLanded: false,
    planetLandedOn: null,
    fleetName: null,
    roomId: null,
    rateLimitTokens: 100,
    rateLimitLastRefill: Date.now(),
    send(data) {
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        // Dynamic Load-Shedding (SPEC-090):
        if (data) {
          if (data.type === "chat" && latencyMonitor.shouldShed("chat")) {
            return; // Drop non-essential chat message
          }
          if (
            data.type === "notification" &&
            latencyMonitor.shouldShed("chat")
          ) {
            return; // Drop verbose system notifications
          }
        }
        this.ws.send(JSON.stringify(data));
      }
    },
    async sendStats() {
      return sendClientStats(this, {
        storeInstance,
        instances,
        squadManager,
        getClients,
        buildStatsPayload,
      });
    },
  };
}

/**
 * Runs connection rate limiting, backpressure checking, JSON parsing,
 * and payload schema validation for incoming WebSocket messages.
 *
 * @param {object} clientObj - The target client state object.
 * @param {string} msgStr - The raw incoming message string.
 * @param {object} ws - The raw WebSocket connection.
 * @param {object} options - Refilling and validation singletons.
 * @returns {object|null} The sanitized, validated message, or null if validation/rate limit checks failed.
 */
export function preprocessMessage(clientObj, msgStr, ws, options) {
  const { wsRateLimitConfig, metrics, resourceLimiter, validateMessage } =
    options;

  // SPEC-117: Zero-Trust WebSocket connection rate limiter (cap dynamic messages/sec)
  const now = Date.now();
  const elapsed = (now - clientObj.rateLimitLastRefill) / 1000;
  clientObj.rateLimitLastRefill = now;
  const maxRate = wsRateLimitConfig.maxPerSecond;
  clientObj.rateLimitTokens = Math.min(
    maxRate,
    clientObj.rateLimitTokens + elapsed * maxRate,
  );

  if (clientObj.rateLimitTokens < 1) {
    metrics.inc("rate_limits_triggered");
    try {
      clientObj.send({
        type: "rate_limit_exceeded",
        message: `Too many requests. WebSocket message rate limit exceeded (Max ${maxRate}/sec).`,
      });
    } catch (_err) {
      // ignore send errors
    }
    return null;
  }
  clientObj.rateLimitTokens -= 1;

  if (resourceLimiter.isBackpressureActive && process.env.NODE_ENV !== "test") {
    if (typeof ws.pause === "function") {
      ws.pause();
      setTimeout(() => {
        try {
          if (typeof ws.resume === "function") {
            ws.resume();
          }
        } catch (_err) {
          // ignore socket resume errors
        }
      }, 200);
    }
    try {
      clientObj.send({
        type: "notification",
        message:
          "Server is experiencing transient high resource load. Throttling messages...",
        style: "warning",
      });
    } catch (_err) {
      // ignore socket send errors
    }
    return null;
  }

  let rawMsg;
  try {
    rawMsg = JSON.parse(msgStr);
  } catch {
    return null;
  }

  const validation = validateMessage(rawMsg);
  if (!validation.valid) {
    clientObj.send({
      type: "notification",
      message: "Invalid network payload: " + validation.error,
      style: "error",
    });
    return null;
  }

  return validation.sanitized;
}

/**
 * Registers WebSocket connection event handlers (pong, message, close),
 * constructs and registers the player client state object, and routes incoming messages.
 *
 * @param {object} ws - The active WebSocket connection.
 * @param {object} req - The incoming upgrade HTTP request.
 * @param {object} options - Unified context singletons.
 * @param {object} options.metrics - The metrics registry.
 * @param {object} options.logger - Leveled logger.
 * @param {object} options.latencyMonitor - The latency monitor.
 * @param {object} options.storeInstance - Swappable database store.
 * @param {object} options.instances - Authoritative world-state room map.
 * @param {object} options.squadManager - The squads manager.
 * @param {object} options.buildStatsPayload - Helper to build stats payload.
 * @param {function} options.registerMissionSpawnHandlers - Mission spawn registrator.
 * @param {Map} options.clients - Client lookup maps.
 * @param {object} options.wsRateLimitConfig - WebSocket rate limit config.
 * @param {object} options.resourceLimiter - Backpressure and resource monitor.
 * @param {function} options.validateMessage - Payload validator.
 * @param {function} options.routeMessage - Asynchronous message router.
 * @param {Map} options.persistentSessions - Session lookup maps.
 * @param {object} options.persistenceManager - Swappable database/persistence manager.
 * @param {object} options.galacticChronicle - Chronicle persistence.
 * @param {object} options.pubsub - Sharded pub/sub pipeline.
 * @param {object} options.wss - WebSocket server.
 * @param {number} options.WORKERS - Sharded worker count.
 * @param {number} options.SHARD_INDEX - Active worker shard index.
 * @param {object} options.matchmakingQueue - Player matching queue.
 * @param {function} options.joinRoom - Join room orchestrator.
 * @param {function} options.sendLobbyList - Lobby list sender.
 * @param {function} options.broadcastLobbySync - Lobby sync broadcaster.
 * @param {object} options.connectionFloodSentry - Connection flood protector.
 * @param {function} options.handleClientDisconnect - Client disconnect handler.
 * @param {function} options.processMatchmakingQueueForRoom - Matchmaking queue processor.
 */
export function registerWebSocketConnection(ws, req, options) {
  const {
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
  } = options;

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
    getClients: () => Array.from(wss.clients).map((w: any) => w.clientObj),
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

    await routeMessage(clientObj, msg, ws, {
      instances,
      clients,
      persistentSessions,
      persistenceManager,
      galacticChronicle,
      squadManager,
      pubsub,
      wss,
      WORKERS,
      SHARD_INDEX,
      matchmakingQueue,
      joinRoom,
      sendLobbyList,
      broadcastLobbySync,
    });
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
}
