import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";
import { ProcessReaper } from "../net/ProcessReaper.js";

describe("Event-Loop Latency Monitoring Integration Tests (SPEC-090)", () => {
  let worker;
  const port = 18196;

  beforeAll(async () => {
    // Clean up any old test persistence dir
    try {
      fs.rmSync("./data-test-latency", { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Boot the game server Worker on dedicated port 18196
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-latency",
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
      fs.rmSync("./data-test-latency", { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("metrics endpoint exposes event loop latency and status", () => {
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
            expect(metrics).toHaveProperty("event_loop_latency_ms");
            expect(metrics).toHaveProperty("event_loop_status");
            expect(typeof metrics.event_loop_latency_ms).toBe("number");
            expect(typeof metrics.event_loop_status).toBe("string");
            expect(["normal", "degraded", "critical"]).toContain(
              metrics.event_loop_status,
            );
            resolve();
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  });
});
