import { MissionManager } from "../engine/MissionManager.js";
import { sendClientStats } from "./clientStats.js";

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

  const clientIp =
    req && req.headers
      ? req.headers["x-forwarded-for"]
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : req.socket
          ? req.socket.remoteAddress
          : "unknown"
      : "unknown";

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
