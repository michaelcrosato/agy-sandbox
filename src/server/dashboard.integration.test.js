import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";

describe("Dashboard and Metrics HTTP Integration Tests (spec 044)", () => {
  let worker;
  const port = 18089;

  beforeAll(async () => {
    // Purge test directories to avoid leftover registry or sector files dirtying the state
    try {
      fs.rmSync("./data-test-dashboard", { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Boot Worker on custom port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-dashboard",
      },
    });

    // Wait for the worker to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await worker.terminate();
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
          resolve();
        });

        res.on("error", reject);
      });
    });
  });
});
