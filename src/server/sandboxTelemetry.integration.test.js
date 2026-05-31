import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";
import { ProcessReaper } from "../net/ProcessReaper.js";

describe("Sandbox Telemetry Observability Integration Tests (SPEC-094)", () => {
  let worker;
  const port = 18197;

  beforeAll(async () => {
    // Clean up any old test persistence dir
    try {
      fs.rmSync("./data-test-telemetry-integration", {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }

    // Boot the game server Worker on dedicated port 18197
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-telemetry-integration",
      },
    });

    // Register worker with the ProcessReaper for clean teardown safety (SPEC-092)
    ProcessReaper.registerWorker(worker);

    // Wait for the server to bind and start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Terminate worker & reap process resources cleanly
    await ProcessReaper.reap();
    try {
      fs.rmSync("./data-test-telemetry-integration", {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
  });

  test("metrics endpoint exposes accurate sandbox telemetry metrics", () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/metrics`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("application/json");

          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            const metrics = JSON.parse(body);
            expect(metrics).toHaveProperty("sandbox_telemetry");

            const telemetry = metrics.sandbox_telemetry;
            expect(telemetry).toHaveProperty("cpu_percent");
            expect(telemetry).toHaveProperty("memory");
            expect(telemetry).toHaveProperty("disk");
            expect(telemetry).toHaveProperty("uptimeSeconds");

            expect(typeof telemetry.cpu_percent).toBe("number");
            expect(typeof telemetry.memory.rss).toBe("number");
            expect(typeof telemetry.memory.heapUsed).toBe("number");
            expect(typeof telemetry.memory.heapTotal).toBe("number");
            expect(typeof telemetry.memory.peakRss).toBe("number");
            expect(typeof telemetry.memory.peakHeapUsed).toBe("number");
            expect(typeof telemetry.memory.leakRateBytesPerMin).toBe("number");
            expect(typeof telemetry.disk.repositorySizeBytes).toBe("number");
            expect(typeof telemetry.uptimeSeconds).toBe("number");

            expect(telemetry.memory.rss).toBeGreaterThan(0);
            expect(telemetry.memory.heapUsed).toBeGreaterThan(0);
            expect(telemetry.disk.repositorySizeBytes).toBeGreaterThan(0);

            resolve();
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  });

  test("metrics endpoint exposes sandbox firewall and memory leak sentry metrics", () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/metrics`, (res) => {
          expect(res.statusCode).toBe(200);
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            const metrics = JSON.parse(body);
            // Firewall checks
            expect(metrics).toHaveProperty("sandbox_firewall");
            expect(metrics.sandbox_firewall.block_count).toBe(0);
            expect(Array.isArray(metrics.sandbox_firewall.blocked_events)).toBe(
              true,
            );

            // Memory Leak Sentry checks
            expect(metrics).toHaveProperty("memory_leak_alerts");
            expect(metrics.memory_leak_alerts.alertCount).toBe(0);
            expect(metrics.memory_leak_alerts.hasFired).toBe(false);
            expect(typeof metrics.memory_leak_alerts.leakRateBytesPerMin).toBe(
              "number",
            );

            // Determinism Sentry checks (SPEC-123)
            expect(metrics).toHaveProperty("determinism_drift_alerts_total");
            expect(metrics.determinism_drift_alerts_total).toBe(0);

            // Anomaly Detector checks (SPEC-124)
            expect(metrics).toHaveProperty("anomaly_triggers_total");
            expect(metrics.anomaly_triggers_total).toBe(0);
            expect(metrics).toHaveProperty("anomaly_detector");
            expect(metrics.anomaly_detector.anomalyTriggersTotal).toBe(0);
            expect(metrics.anomaly_detector).toHaveProperty("diagnostics");

            resolve();
          });
        })
        .on("error", reject);
    });
  });

  test("metrics endpoint exposes sandbox security registry violations (SPEC-131)", () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/metrics`, (res) => {
          expect(res.statusCode).toBe(200);
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            const metrics = JSON.parse(body);
            expect(metrics).toHaveProperty("sandbox_security");

            const sec = metrics.sandbox_security;
            expect(sec).toHaveProperty("security_violations_total");
            expect(sec).toHaveProperty("security_violations_by_category");
            expect(Array.isArray(sec.recent_violations)).toBe(true);

            expect(typeof sec.security_violations_total).toBe("number");
            expect(sec.security_violations_by_category).toHaveProperty(
              "filesystem",
            );
            expect(sec.security_violations_by_category).toHaveProperty(
              "firewall",
            );
            expect(sec.security_violations_by_category).toHaveProperty(
              "rate_limit",
            );
            expect(sec.security_violations_by_category).toHaveProperty(
              "process",
            );

            resolve();
          });
        })
        .on("error", reject);
    });
  });

  test("metrics endpoint exposes guest sandbox telemetry metrics (SPEC-142)", () => {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/metrics`, (res) => {
          expect(res.statusCode).toBe(200);
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            const metrics = JSON.parse(body);
            expect(metrics).toHaveProperty("guest_sandbox");

            const gs = metrics.guest_sandbox;
            expect(Array.isArray(gs.active_runs)).toBe(true);
            expect(Array.isArray(gs.recent_runs)).toBe(true);

            resolve();
          });
        })
        .on("error", reject);
    });
  });
});
