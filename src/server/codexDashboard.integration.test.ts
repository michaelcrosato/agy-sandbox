import { describe, test, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("Living Codex & Dashboard HTTP Integration Tests (SPEC-102)", () => {
  let worker;
  const port = 18199;
  const persistenceDir = "./data-test-codex-dashboard";

  beforeAll(async () => {
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
    worker = await bootGameServerWorker({ port, persistenceDir });
  }, 25000);

  afterAll(async () => {
    await stopGameServerWorker(worker, persistenceDir);
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
          // SPEC-122 Cluster telemetry memory card validation
          expect(body).toContain('id="chart-val-memory"');
          // SPEC-126 Egress firewall cockpit dashboard card elements validation
          expect(body).toContain('id="firewall-rules-panel"');
          expect(body).toContain('id="firewall-domains-list"');
          expect(body).toContain('id="firewall-block-count"');
          expect(body).toContain('id="firewall-block-meter"');
          expect(body).toContain('id="api-rate-display"');
          expect(body).toContain('id="api-rate-meter"');
          expect(body).toContain('id="memory-leak-alerts-display"');

          // SPEC-129 Epistemic Sentry and circular progress rings validation
          expect(body).toContain('id="epistemic-sentry-panel"');
          expect(body).toContain('id="ring-jsdoc"');
          expect(body).toContain('id="ring-specs"');
          expect(body).toContain('id="stat-jsdoc-symbols"');
          expect(body).toContain('id="stat-jsdoc-missing"');
          expect(body).toContain('id="stat-spec-files"');
          expect(body).toContain('id="stat-untested-files"');

          // SPEC-132 Containment Breach Console panel validation
          expect(body).toContain('id="containment-breach-console"');
          expect(body).toContain('id="breach-active-indicator"');
          expect(body).toContain('id="breach-log-list"');

          // SPEC-135 CPU Watchdog & Tamper Sentry Gauge Card elements validation
          expect(body).toContain('id="cpu-tamper-panel"');
          expect(body).toContain('id="cpu-latency-value"');
          expect(body).toContain('id="cpu-latency-meter"');
          expect(body).toContain('id="prototype-sentry-status"');
          expect(body).toContain('id="global-pollution-status"');

          // SPEC-142 Guest Sandbox Footprint HUD Gauge Card elements validation
          expect(body).toContain('id="guest-sandbox-panel"');
          expect(body).toContain('id="ring-guest-memory"');
          expect(body).toContain('id="guest-memory-text"');
          expect(body).toContain('id="ring-guest-cpu"');
          expect(body).toContain('id="guest-cpu-text"');
          expect(body).toContain('id="guest-active-count"');
          expect(body).toContain('id="guest-heap-display"');
          expect(body).toContain('id="guest-cpu-display"');
          expect(body).toContain('id="guest-last-script"');
          expect(body).toContain('id="guest-last-status"');

          // SPEC-147 Guest RPC & Workspace Drift HUD Card validation
          expect(body).toContain('id="guest-rpc-panel"');
          expect(body).toContain('id="ring-integrity-status"');
          expect(body).toContain('id="integrity-health-text"');
          expect(body).toContain('id="rpc-total-requests"');
          expect(body).toContain('id="rpc-blocked-requests"');
          expect(body).toContain('id="drift-self-heals"');
          expect(body).toContain('id="drift-files-healed"');
          expect(body).toContain('id="rpc-feed-ticker"');

          // SPEC-153 Guest CLI Sandbox Terminal Card validation
          expect(body).toContain('id="guest-cli-panel"');
          expect(body).toContain('id="cli-terminal-body"');
          expect(body).toContain('id="cli-input-field"');
          expect(body).toContain('id="cli-send-btn"');
          expect(body).toContain('id="cli-rss-indicator"');
          expect(body).toContain('id="cli-kill-btn"');
          expect(body).toContain('id="cli-active-pid"');

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
