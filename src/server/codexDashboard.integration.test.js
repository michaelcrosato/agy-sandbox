import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";
import path from "path";

describe("Living Codex & Dashboard HTTP Integration Tests (SPEC-102)", () => {
  let worker;
  const port = 18199;

  beforeAll(async () => {
    // Purge test directories
    try {
      fs.rmSync("./data-test-codex-dashboard", {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }

    // Ensure codex.json exists for the server to load
    const codexPath = path.resolve("plan/codex.json");
    if (!fs.existsSync(codexPath)) {
      fs.writeFileSync(
        codexPath,
        JSON.stringify({ stats: { totalLoc: 15600 } }),
        "utf8",
      );
    }

    // Boot Worker on custom port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-codex-dashboard",
      },
    });

    // Wait for the worker to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await worker.terminate();
  });

  test("GET /codex returns 200 and application/json Content-Type", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/codex`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("application/json");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const data = JSON.parse(body);
          expect(data).toHaveProperty("stats");
          resolve();
        });

        res.on("error", reject);
      });
    });
  });

  test("GET /dashboard-codex redirects and serves dashboard-codex.html as text/html", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/dashboard-codex`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          expect(body).toContain("<title>📖 Starfall Living Codex");
          expect(body).toContain('id="metric-loc"');
          expect(body).toContain('id="tree-container"');
          // SPEC-112 Interactive WS generator validation
          expect(body).toContain('id="tab-generator"');
          expect(body).toContain('id="action-select"');
          expect(body).toContain('id="schema-fields-container"');
          expect(body).toContain('id="code-preview"');
          resolve();
        });

        res.on("error", reject);
      });
    });
  });

  test("GET /dashboard-codex.html returns 200 and text/html Content-Type", () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/dashboard-codex.html`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          expect(body).toContain("<title>📖 Starfall Living Codex");
          resolve();
        });

        res.on("error", reject);
      });
    });
  });
});
