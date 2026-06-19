import { jest } from "@jest/globals";
import { createClientObject, preprocessMessage } from "./clientConnection.js";
import { sendClientStats } from "./clientStats.js";

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

    test("should extract client IP from x-forwarded-for header with priority", () => {
      const req = {
        headers: {
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        },
      };
      const client = createClientObject(ws, req, options);
      expect(client.ip).toBe("1.2.3.4");
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
});
