import { describe, test, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("WebSocket Rate Limiter Integration Tests (SPEC-117)", () => {
  let worker;
  const port = 18205;
  const persistenceDir = "./data-test-ratelimiter";

  beforeAll(async () => {
    worker = await bootGameServerWorker({ port, persistenceDir });
  }, 25000);

  afterAll(async () => {
    await stopGameServerWorker(worker, persistenceDir);
  });

  test("enforces the 100 msgs/sec rate limit by returning rate_limit_exceeded", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let floodInterval = null;
      let safetyTimer = null;
      let settled = false;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearInterval(floodInterval);
        clearTimeout(safetyTimer);
        try {
          ws.close();
        } catch {
          // ignore close errors during teardown
        }
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      ws.on("open", () => {
        // Sustain a flood far above the 100 msgs/sec token-refill rate so the
        // limiter must trip no matter how the event loop schedules the reads.
        // The payload is deliberately invalid JSON: the limiter consumes a
        // token before parsing, and the server drops the message silently, so
        // the flood does not amplify into response traffic.
        floodInterval = setInterval(() => {
          for (let i = 0; i < 50 && ws.readyState === WebSocket.OPEN; i++) {
            ws.send("flood");
          }
        }, 20);
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (_e) {
          return;
        }

        if (msg.type === "rate_limit_exceeded") {
          finish();
        }
      });

      ws.on("error", (err) => {
        finish(err);
      });

      safetyTimer = setTimeout(() => {
        finish(new Error("Rate limit exceeded message was never received"));
      }, 12000);
    });
  }, 20000);
});
