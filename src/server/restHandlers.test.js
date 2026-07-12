import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { fileURLToPath } from "url";
import { handleRestRequest } from "./restHandlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

class MockReq extends EventEmitter {
  constructor(method, url, { remoteAddress = "127.0.0.1", headers = {} } = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.socket = { remoteAddress };
    this.destroy = () => {};
  }
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    end(data) {
      this.body = data;
      if (this.onEnd) {
        this.onEnd(data);
      }
    },
  };
  return res;
}

describe("REST API Modular Handlers Unit & Integration Tests (SPEC-161)", () => {
  let mockOptions;

  beforeEach(() => {
    mockOptions = {
      metrics: {
        snapshot: () => ({
          ts: Date.now(),
          counters: { broadcast_bytes: 100 },
          gauges: {},
          observations: { tick_ms: { avg: 5 } },
        }),
      },
      instances: new Map(),
      matchmakingQueue: { size: 0 },
      latencyMonitor: {
        getLatency: () => 1.2,
        getStatus: () => "NORMAL",
      },
      sandboxTelemetry: {
        getMetrics: () => ({ cpu: 10, memory: 50 }),
      },
      apiRateLimiter: {
        blockCount: 0,
        expendedTokens: 5,
        maxPerMinute: 60,
        maxPerHour: 1000,
        allowlistDomains: ["api.starfall.net"],
      },
      sandboxFirewall: {
        blockCount: 2,
        blockedEvents: [],
        allowlistDomains: ["allow.com"],
      },
      memoryLeakSentry: {
        getDiagnostics: () => ({ leakAlertsCount: 0 }),
      },
      anomalyDetector: {
        anomalyTriggersTotal: 0,
        getDiagnostics: () => ({ rollingAvg: 1 }),
      },
      clients: new Map(),
      galacticChronicle: {
        getEvents: () => [{ id: 1, text: "Nova Event" }],
      },
      PORT: 8080,
      WORKERS: 1,
      SHARD_INDEX: 0,
      wss: { clients: { size: 0 } },
      ROOT_DIR,
    };
  });

  test("CORS preflight OPTIONS request returns 204 with correct headers", () => {
    const req = new MockReq("OPTIONS", "/metrics");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toContain(
      "GET, POST, OPTIONS",
    );
  });

  test("GET /metrics returns 200 and augmented telemetry JSON snapshot", () => {
    const req = new MockReq("GET", "/metrics");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(res.body);
    expect(payload).toHaveProperty("cluster_worker_ports");
    expect(payload).toHaveProperty("clients_active", 0);
    expect(payload).toHaveProperty("event_loop_status", "NORMAL");
    expect(payload).toHaveProperty("api_limiter");
    expect(payload).toHaveProperty("process_reaper");
    expect(payload.api_limiter.max_per_minute).toBe(60);
  });

  test("GET /healthz behaves identically to /metrics", () => {
    const req = new MockReq("GET", "/healthz");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toHaveProperty("workers_total", 1);
  });

  test("GET /chronicle returns 200 and the list of active chronicle events", () => {
    const req = new MockReq("GET", "/chronicle");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toEqual([{ id: 1, text: "Nova Event" }]);
  });

  test("GET /schema returns centralized commodities and schemas metadata", () => {
    const req = new MockReq("GET", "/schema");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toHaveProperty("commodities");
    expect(payload).toHaveProperty("schemas");
  });

  test("GET /codex returns plan/codex.json if it exists", () => {
    const req = new MockReq("GET", "/codex");
    const res = createMockRes();

    const codexPath = path.resolve(ROOT_DIR, "plan/codex.json");
    const exists = fs.existsSync(codexPath);

    handleRestRequest(req, res, mockOptions);

    if (exists) {
      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toBe("application/json");
      expect(() => JSON.parse(res.body)).not.toThrow();
    } else {
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain("not found");
    }
  });

  test("GET /test/induce-lag induces busy-wait loop when NODE_ENV is test", () => {
    const req = new MockReq("GET", "/test/induce-lag?ms=10");
    const res = createMockRes();

    const start = Date.now();
    handleRestRequest(req, res, mockOptions);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).induced).toBe(10);
  });

  test("POST /api/firewall/rules rejects invalid JSON payload", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("POST", "/api/firewall/rules");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(body.toString())).toHaveProperty(
            "error",
            "Invalid JSON payload",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
      req.emit("data", Buffer.from("invalid-json{"));
      req.emit("end");
    });
  });

  test("POST /api/firewall/rules rejects invalid action parameter", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("POST", "/api/firewall/rules");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(body.toString()).error).toContain(
            "Action must be 'allow' or 'block'",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
      req.emit(
        "data",
        Buffer.from(JSON.stringify({ action: "invalid", domain: "test.com" })),
      );
      req.emit("end");
    });
  });

  test("POST /api/firewall/rules rejects malformed domain parameter", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("POST", "/api/firewall/rules");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(body.toString()).error).toContain(
            "Invalid domain name format",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
      req.emit(
        "data",
        Buffer.from(
          JSON.stringify({ action: "allow", domain: "not-a-domain" }),
        ),
      );
      req.emit("end");
    });
  });

  test("GET /api/outfitting/metrics returns outfitting status for active clients", () => {
    const req = new MockReq("GET", "/api/outfitting/metrics");
    const res = createMockRes();

    mockOptions.clients.set("ws-1", {
      id: "player-1",
      ship: {
        name: "Specter V",
        hullMass: 1000,
        outfitMass: 250,
        mass: 1250,
        maxOutfitMass: 2000,
        turnRate: 3.1,
        maxSpeed: 320,
        thrustPower: 5000,
        outfits: ["shield_gen_i"],
      },
    });

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body.toString());
    expect(payload.ok).toBe(true);
    expect(payload.metrics[0].name).toBe("Specter V");
    expect(payload.metrics[0].totalMass).toBe(1250);
  });

  test("POST /api/sandbox/execute rejects requests without code", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("POST", "/api/sandbox/execute");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(body.toString()).error).toContain(
            "Code parameter is required",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
      req.emit("data", Buffer.from(JSON.stringify({})));
      req.emit("end");
    });
  });

  test("Static file server serves local files safely with correct MIME type", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("GET", "/index.html");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(200);
          expect(res.headers["Content-Type"]).toBe("text/html");
          expect(body.toString()).toContain("<!DOCTYPE html>");
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
    });
  });

  test("Static file server refuses traversal boundary escapes", () => {
    const req = new MockReq("GET", "/../secrets.json");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(404);
    expect(res.body.toString()).toBe("Not Found");
  });

  test("Static file server refuses to serve secrets, VCS internals, and config", () => {
    for (const target of [
      "/.env",
      "/.git/config",
      "/package.json",
      "/plan/config.json",
      "/data/players.json",
    ]) {
      const req = new MockReq("GET", target);
      const res = createMockRes();
      handleRestRequest(req, res, mockOptions);
      expect(res.statusCode).toBe(404);
    }
  });

  test("admin endpoints reject non-loopback callers without a token", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("POST", "/api/sandbox/execute", {
        remoteAddress: "203.0.113.7",
      });
      const res = createMockRes();
      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(403);
          expect(JSON.parse(body.toString()).error).toContain("Forbidden");
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      handleRestRequest(req, res, mockOptions);
    });
  });

  test("admin endpoints accept a non-loopback caller with a valid token", () => {
    return new Promise((resolve, reject) => {
      mockOptions.adminToken = "s3cret-token";
      const req = new MockReq("POST", "/api/sandbox/execute", {
        remoteAddress: "203.0.113.7",
        headers: { "x-admin-token": "s3cret-token" },
      });
      const res = createMockRes();
      res.onEnd = (body) => {
        try {
          // Passes the auth gate, then fails validation on the missing code.
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(body.toString()).error).toContain(
            "Code parameter is required",
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      handleRestRequest(req, res, mockOptions);
      req.emit("data", Buffer.from(JSON.stringify({})));
      req.emit("end");
    });
  });

  test("Static file server handles non-existent files with 404 Not Found", () => {
    return new Promise((resolve, reject) => {
      const req = new MockReq("GET", "/non-existent-file-xyz.html");
      const res = createMockRes();

      res.onEnd = (body) => {
        try {
          expect(res.statusCode).toBe(404);
          expect(body.toString()).toBe("Not Found");
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      handleRestRequest(req, res, mockOptions);
    });
  });

  test("GET /api/faction/campaign returns 200 and faction war campaign metrics", () => {
    const mockCampaign = {
      ticks: 10,
      militaryPower: { core: { Federation: 90 } },
      activeSieges: { core: null },
      blockades: { core: null },
      battleHistory: [{ id: "battle-1", title: "Battle" }],
    };

    mockOptions.instances.set("public-room", {
      factionWarCampaign: mockCampaign,
    });

    const req = new MockReq("GET", "/api/faction/campaign?room=public-room");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(true);
    expect(payload.ticks).toBe(10);
    expect(payload.militaryPower.core.Federation).toBe(90);
    expect(payload.battleHistory).toEqual([
      { id: "battle-1", title: "Battle" },
    ]);
  });

  test("GET /api/faction/campaign falls back to first active instance if no room specified", () => {
    const mockCampaign = {
      ticks: 15,
      militaryPower: { frontier: { "Frontier League": 95 } },
      activeSieges: { frontier: null },
      blockades: { frontier: null },
      battleHistory: [],
    };

    mockOptions.instances.set("default-room", {
      factionWarCampaign: mockCampaign,
    });

    const req = new MockReq("GET", "/api/faction/campaign");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(true);
    expect(payload.ticks).toBe(15);
    expect(payload.militaryPower.frontier["Frontier League"]).toBe(95);
  });

  test("GET /api/faction/campaign returns 404 if no campaign state is available", () => {
    const req = new MockReq("GET", "/api/faction/campaign");
    const res = createMockRes();

    handleRestRequest(req, res, mockOptions);

    expect(res.statusCode).toBe(404);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("not found");
  });
});
