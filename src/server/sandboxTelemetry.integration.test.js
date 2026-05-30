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
});
