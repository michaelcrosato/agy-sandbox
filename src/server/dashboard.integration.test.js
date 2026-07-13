import http from "http";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("Dashboard and Metrics HTTP Integration Tests (spec 044)", () => {
  let worker;
  const port = 18089;
  const persistenceDir = "./data-test-dashboard";

  beforeAll(async () => {
    // Boot Worker on custom port
    worker = await bootGameServerWorker({ port, persistenceDir });
  }, 25000);

  afterAll(async () => {
    await stopGameServerWorker(worker, persistenceDir);
  });

  test("GET /metrics returns 200 and application/json Content-Type", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/metrics`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("application/json");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const data = JSON.parse(body);
          expect(data).toHaveProperty("ts");
          expect(data).toHaveProperty("counters");
          expect(data).toHaveProperty("gauges");
          // SPEC-073: verify augmented dashboard properties
          expect(data).toHaveProperty("clients_active");
          expect(data).toHaveProperty("rooms_active");
          expect(data).toHaveProperty("tick_ms_avg");
          expect(data).toHaveProperty("broadcast_bytes_total");
          expect(data).toHaveProperty("matchmaking_queue_size");
          // SPEC-097: verify api_limiter properties exist in metrics payload
          expect(data).toHaveProperty("api_limiter");
          expect(data.api_limiter).toHaveProperty("block_count");
          expect(data.api_limiter).toHaveProperty("expended_tokens");
          expect(data).toHaveProperty("rooms");
          expect(Array.isArray(data.rooms)).toBe(true);
          resolve();
        });

        res.on("error", reject);
      });
    });
  });

  test("GET /chronicle returns 200, application/json, and valid array body (SPEC-096)", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/chronicle`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("application/json");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const data = JSON.parse(body);
          expect(Array.isArray(data)).toBe(true);
          resolve();
        });

        res.on("error", reject);
      });
    });
  });

  test("GET /dashboard.html returns 200 and text/html Content-Type", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/dashboard.html`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          expect(body).toContain("<!DOCTYPE html>");
          expect(body).toContain("STARFALL GALAXY");
          // SPEC-073: verify canvas selectors and new elements are present in output
          expect(body).toContain('id="sparkline-tick"');
          expect(body).toContain('id="sparkline-bandwidth"');
          expect(body).toContain('id="sparkline-queue"');
          expect(body).toContain('id="val-queue"');
          // SPEC-096: verify chronicle elements are present in output
          expect(body).toContain('id="panel-chronicle"');
          expect(body).toContain('id="chronicle-feed"');
          // SPEC-097: verify api limiter UI elements are present in output
          expect(body).toContain('id="val-limiter-blocks"');
          expect(body).toContain('id="val-limiter-tokens"');
          resolve();
        });

        res.on("error", reject);
      });
    });
  });
});
