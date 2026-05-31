import { Worker } from "worker_threads";
import WebSocket from "ws";
import fs from "fs";

describe("WebSocket Rate Limiter Integration Tests (SPEC-117)", () => {
  let worker;
  const port = 18205;

  beforeAll(async () => {
    try {
      fs.rmSync("./data-test-ratelimiter", { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Boot the game server Worker on a dedicated port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-ratelimiter",
      },
    });

    // Wait for the server to start and bind
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await worker.terminate();
    try {
      fs.rmSync("./data-test-ratelimiter", { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("enforces the 100 msgs/sec rate limit by returning rate_limit_exceeded", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let rateLimitWarningReceived = false;

      ws.on("open", () => {
        // Send a burst of 110 messages. Since the bucket holds max 100, the last 10 should hit the limit.
        for (let i = 0; i < 110; i++) {
          ws.send(
            JSON.stringify({
              type: "join_room",
              roomId: "public",
              nickname: "FloodClient",
            }),
          );
        }
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (e) {
          return;
        }

        if (msg.type === "rate_limit_exceeded") {
          rateLimitWarningReceived = true;
          ws.close();
          resolve();
        }
      });

      ws.on("error", (err) => {
        reject(err);
      });

      // Timeout safety
      setTimeout(() => {
        ws.close();
        if (rateLimitWarningReceived) {
          resolve();
        } else {
          reject(new Error("Rate limit exceeded message was never received"));
        }
      }, 10000);
    });
  }, 15000);
});
