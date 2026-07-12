import http from "http";
import { ProcessReaper } from "../net/ProcessReaper.js";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("Event-Loop Latency Monitoring Integration Tests (SPEC-090)", () => {
  let worker;
  const port = 18196;
  const persistenceDir = "./data-test-latency";

  beforeAll(async () => {
    // Boot the game server Worker on dedicated port 18196
    worker = await bootGameServerWorker({ port, persistenceDir });

    // Register worker with the ProcessReaper for clean teardown safety (SPEC-092)
    ProcessReaper.registerWorker(worker);
  }, 25000);

  afterAll(async () => {
    // Terminate worker & reap process resources cleanly
    await ProcessReaper.reap();
    await stopGameServerWorker(worker, persistenceDir);
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
