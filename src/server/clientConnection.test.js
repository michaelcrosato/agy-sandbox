import { jest } from "@jest/globals";
import {
  createClientObject,
  preprocessMessage,
  registerWebSocketConnection,
} from "./clientConnection.js";

// Mock the imported sendClientStats function
jest.unstable_mockModule("./clientStats.js", () => ({
  sendClientStats: jest.fn(),
}));

describe("clientConnection", () => {
  describe("createClientObject", () => {
    let ws;
    let options;
    let mockLatencyMonitor;

    beforeEach(() => {
      ws = {
        send: jest.fn(),
        readyState: 1, // OPEN
        OPEN: 1,
      };

      mockLatencyMonitor = {
        shouldShed: jest.fn().mockReturnValue(false),
      };

      options = {
        latencyMonitor: mockLatencyMonitor,
        storeInstance: {},
        instances: {},
        squadManager: {},
        getClients: jest.fn(),
        buildStatsPayload: jest.fn(),
      };
    });

    test("should initialize client state with unique ID and default values", () => {
      const client = createClientObject(ws, null, options);
      expect(client.id).toMatch(/^player-[a-z0-9]+/);
      expect(client.nickname).toBe("Pilot");
      expect(client.isLanded).toBe(false);
      expect(client.planetLandedOn).toBeNull();
      expect(client.roomId).toBeNull();
      expect(client.rateLimitTokens).toBe(100);
    });

    test("should ignore spoofable x-forwarded-for by default and use the socket peer", () => {
      const req = {
        headers: {
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        },
        socket: {
          remoteAddress: "203.0.113.7",
        },
      };
      const client = createClientObject(ws, req, options);
      expect(client.ip).toBe("203.0.113.7");
    });

    test("should honor x-forwarded-for only when TRUST_PROXY is enabled", () => {
      const prev = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      try {
        const req = {
          headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
          socket: { remoteAddress: "203.0.113.7" },
        };
        const client = createClientObject(ws, req, options);
        expect(client.ip).toBe("1.2.3.4");
      } finally {
        if (prev === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = prev;
      }
    });

    test("should fallback client IP to socket remote address", () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: "192.168.1.100",
        },
      };
      const client = createClientObject(ws, req, options);
      expect(client.ip).toBe("192.168.1.100");
    });

    test("should fallback client IP to unknown if no request/socket details", () => {
      const client = createClientObject(ws, null, options);
      expect(client.ip).toBe("unknown");
    });

    test("should serialize and send WebSocket payloads normally", () => {
      const client = createClientObject(ws, null, options);
      client.send({ type: "notification", message: "Hello" });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "notification", message: "Hello" }),
      );
    });

    test("should shed chat messages under high latency stress", () => {
      mockLatencyMonitor.shouldShed.mockReturnValueOnce(true); // Sheds chat/notifications

      const client = createClientObject(ws, null, options);
      client.send({ type: "chat", message: "Hello Wingman" });

      expect(ws.send).not.toHaveBeenCalled();
    });

    test("should shed verbose system notifications under high latency stress", () => {
      mockLatencyMonitor.shouldShed.mockReturnValueOnce(true); // Sheds chat/notifications

      const client = createClientObject(ws, null, options);
      client.send({ type: "notification", message: "System alert info" });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("preprocessMessage", () => {
    let clientObj;
    let ws;
    let options;
    let mockMetrics;
    let mockResourceLimiter;
    let mockValidateMessage;

    beforeEach(() => {
      clientObj = {
        id: "player-123",
        rateLimitTokens: 10,
        rateLimitLastRefill: Date.now() - 5000, // 5 seconds ago
        send: jest.fn(),
      };

      ws = {
        pause: jest.fn(),
        resume: jest.fn(),
      };

      mockMetrics = {
        inc: jest.fn(),
      };

      mockResourceLimiter = {
        isBackpressureActive: false,
      };

      mockValidateMessage = jest.fn().mockReturnValue({
        valid: true,
        sanitized: { type: "controls", thrust: true },
      });

      options = {
        wsRateLimitConfig: { maxPerSecond: 20 },
        metrics: mockMetrics,
        resourceLimiter: mockResourceLimiter,
        validateMessage: mockValidateMessage,
      };
    });

    test("should accumulate rate limiting tokens on refill", () => {
      // 5s elapsed * maxRate (20/s) = 100 tokens refilled. Clamped at maxRate (20).
      const msg = preprocessMessage(
        clientObj,
        '{"type":"controls"}',
        ws,
        options,
      );

      expect(clientObj.rateLimitTokens).toBe(19); // 20 max refilled, minus 1 for this msg
      expect(msg).toEqual({ type: "controls", thrust: true });
    });

    test("should deny message and trigger metric update when tokens are depleted", () => {
      clientObj.rateLimitTokens = 0;
      clientObj.rateLimitLastRefill = Date.now(); // No refill elapsed time

      const msg = preprocessMessage(
        clientObj,
        '{"type":"controls"}',
        ws,
        options,
      );

      expect(msg).toBeNull();
      expect(mockMetrics.inc).toHaveBeenCalledWith("rate_limits_triggered");
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "rate_limit_exceeded" }),
      );
    });

    test("should throttle message and pause socket under active backpressure", () => {
      mockResourceLimiter.isBackpressureActive = true;
      // Mock process.env.NODE_ENV temporary override to bypass test exclusions
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      jest.useFakeTimers();

      const msg = preprocessMessage(
        clientObj,
        '{"type":"controls"}',
        ws,
        options,
      );

      expect(msg).toBeNull();
      expect(ws.pause).toHaveBeenCalled();
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          style: "warning",
        }),
      );

      // Fast-forward resume timer
      jest.advanceTimersByTime(200);
      expect(ws.resume).toHaveBeenCalled();

      // Clean up environment and timers
      process.env.NODE_ENV = origEnv;
      jest.useRealTimers();
    });

    test("should return null for malformed JSON inputs", () => {
      const msg = preprocessMessage(clientObj, "{invalidJson:", ws, options);
      expect(msg).toBeNull();
    });

    test("should handle validation failures by sending alert and returning null", () => {
      mockValidateMessage.mockReturnValueOnce({
        valid: false,
        error: "Missing required type parameter",
      });

      const msg = preprocessMessage(clientObj, '{"bad":true}', ws, options);

      expect(msg).toBeNull();
      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Invalid network payload: Missing required type parameter",
        style: "error",
      });
    });
  });

  describe("registerWebSocketConnection", () => {
    let ws;
    let req;
    let options;
    let eventListeners;

    beforeEach(() => {
      eventListeners = {};
      ws = {
        isAlive: false,
        on: jest.fn((event, cb) => {
          eventListeners[event] = cb;
        }),
        send: jest.fn(),
        readyState: 1, // OPEN
        OPEN: 1,
      };

      req = {
        headers: {
          "x-forwarded-for": "1.2.3.4",
        },
      };

      options = {
        metrics: { inc: jest.fn() },
        logger: { info: jest.fn() },
        latencyMonitor: { shouldShed: jest.fn().mockReturnValue(false) },
        storeInstance: {},
        instances: new Map(),
        squadManager: {},
        buildStatsPayload: jest.fn(),
        registerMissionSpawnHandlers: jest.fn(),
        clients: new Map(),
        wsRateLimitConfig: { maxPerSecond: 100 },
        resourceLimiter: { isBackpressureActive: false },
        validateMessage: jest.fn().mockReturnValue({
          valid: true,
          sanitized: { type: "chat", message: "hello" },
        }),
        routeMessage: jest.fn(),
        persistentSessions: new Map(),
        persistenceManager: {},
        galacticChronicle: {},
        pubsub: {},
        wss: { clients: new Set([ws]) },
        WORKERS: 1,
        SHARD_INDEX: 0,
        matchmakingQueue: {},
        joinRoom: jest.fn(),
        sendLobbyList: jest.fn(),
        broadcastLobbySync: jest.fn(),
        connectionFloodSentry: {},
        handleClientDisconnect: jest.fn(),
        processMatchmakingQueueForRoom: jest.fn(),
      };
    });

    test("should initialize connection state and register listeners", () => {
      registerWebSocketConnection(ws, req, options);

      expect(ws.isAlive).toBe(true);
      expect(options.metrics.inc).toHaveBeenCalledWith("connections_total");
      expect(options.logger.info).toHaveBeenCalledWith("client_connected", {
        clients: 1,
      });
      expect(options.registerMissionSpawnHandlers).toHaveBeenCalled();
      expect(options.clients.get(ws)).toBeDefined();

      expect(ws.on).toHaveBeenCalledWith("pong", expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
    });

    test("should set isAlive on pong", () => {
      registerWebSocketConnection(ws, req, options);
      ws.isAlive = false;

      // Trigger pong callback
      eventListeners["pong"]();
      expect(ws.isAlive).toBe(true);
    });

    test("should preprocess and route incoming messages", async () => {
      registerWebSocketConnection(ws, req, options);

      const msgStr = JSON.stringify({ type: "chat", message: "hello" });
      await eventListeners["message"](msgStr);

      expect(options.validateMessage).toHaveBeenCalled();
      expect(options.routeMessage).toHaveBeenCalledWith(
        options.clients.get(ws),
        { type: "chat", message: "hello" },
        ws,
        expect.any(Object),
      );
    });

    test("should not route messages if validation or preprocessing fails", async () => {
      options.validateMessage.mockReturnValueOnce({
        valid: false,
        error: "invalid",
      });
      registerWebSocketConnection(ws, req, options);

      await eventListeners["message"]('{"bad":true}');

      expect(options.routeMessage).not.toHaveBeenCalled();
    });

    test("should handle client disconnect on close", () => {
      registerWebSocketConnection(ws, req, options);
      const clientObj = options.clients.get(ws);

      eventListeners["close"]();

      expect(options.handleClientDisconnect).toHaveBeenCalledWith(
        ws,
        clientObj,
        expect.any(Object),
      );
    });
  });
});
