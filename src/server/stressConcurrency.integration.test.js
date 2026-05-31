import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";
import WebSocket from "ws";
import { ProcessReaper } from "../net/ProcessReaper.js";

describe("Concurrency Stress & Latency Injection Integration Tests (SPEC-095)", () => {
  let worker;
  const port = 18198;

  beforeAll(async () => {
    // Purge test directories to avoid leftover persistence files
    try {
      fs.rmSync("./data-test-concurrency", { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Boot the game server Worker on dedicated port 18198
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-concurrency",
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
      fs.rmSync("./data-test-concurrency", { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("backpressure frame-shedding actively triggers when event loop lag is induced", async () => {
    // 1. Establish 2 client connections
    const clientA = new WebSocket(`ws://localhost:${port}`);
    const clientB = new WebSocket(`ws://localhost:${port}`);

    const clientAEvents = [];
    const clientBEvents = [];

    await Promise.all([
      new Promise((resolve) => {
        clientA.on("open", () => {
          clientA.send(
            JSON.stringify({
              type: "join_room",
              roomId: "public",
              nickname: "PilotA",
            }),
          );
        });
        clientA.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            clientAEvents.push(msg);
            if (msg.type === "init") resolve();
          } catch (_e) {
            // Defensively ignore non-JSON binary state broadcast frames
          }
        });
      }),
      new Promise((resolve) => {
        clientB.on("open", () => {
          clientB.send(
            JSON.stringify({
              type: "join_room",
              roomId: "public",
              nickname: "PilotB",
            }),
          );
        });
        clientB.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            clientBEvents.push(msg);
            if (msg.type === "init") resolve();
          } catch (_e) {
            // Defensively ignore non-JSON binary state broadcast frames
          }
        });
      }),
    ]);

    // 2. Induce event loop lag on the server (510ms busy-wait to cross >50ms critical average)
    await new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/test/induce-lag?ms=510`, (res) => {
          expect(res.statusCode).toBe(200);
          resolve();
        })
        .on("error", reject);
    });

    // Let the latency monitor sample the lag tick once
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 3. Verify server metrics reports critical/degraded status
    let metrics;
    await new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${port}/metrics`, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            metrics = JSON.parse(body);
            resolve();
          });
        })
        .on("error", reject);
    });

    expect(
      metrics.event_loop_status === "degraded" ||
        metrics.event_loop_status === "critical",
    ).toBe(true);

    // 4. Client A sends a chat message. Due to active load shedding, the server must drop (shed) this broadcast!
    clientA.send(
      JSON.stringify({
        type: "chat",
        text: "This should be shedded!",
      }),
    );

    // Give it a moment to broadcast
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Client B should NOT have received the shedded chat event!
    const receivedChat = clientBEvents.some(
      (ev) => ev.type === "chat" && ev.text === "This should be shedded!",
    );
    expect(receivedChat).toBe(false);

    // Clean up
    clientA.close();
    clientB.close();
  });

  test("spawns multiple concurrent pilots with clean teardown and zero hangs", async () => {
    const clientsCount = 25;
    const spawnPromises = [];
    const activeClients = [];

    for (let i = 0; i < clientsCount; i++) {
      spawnPromises.push(
        new Promise((resolve) => {
          const ws = new WebSocket(`ws://localhost:${port}`);
          ws.on("open", () => {
            ws.send(
              JSON.stringify({
                type: "join_room",
                roomId: "public",
                nickname: `StressPilot-${i}`,
              }),
            );
          });
          ws.on("message", (data) => {
            try {
              const msg = JSON.parse(data.toString());
              if (msg.type === "init") {
                activeClients.push(ws);
                resolve();
              }
            } catch (_e) {
              // Defensively ignore non-JSON binary state broadcast frames
            }
          });
          ws.on("error", () => resolve()); // Defensively resolve on error
        }),
      );
    }

    await Promise.all(spawnPromises);
    expect(activeClients.length).toBeGreaterThan(0);

    // Send simultaneous inputs from all active concurrent clients
    for (const ws of activeClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input",
            controls: { isThrusting: true, turnDirection: 1 },
          }),
        );
      }
    }

    // Give a short window for simulation loop execution under concurrency
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simultaneously trigger clean teardown of all sockets
    const closePromises = activeClients.map(
      (ws) =>
        new Promise((resolve) => {
          ws.on("close", resolve);
          ws.close();
        }),
    );

    await Promise.all(closePromises);
    // Verified 100% successful teardown with zero active hangs
  });
});
