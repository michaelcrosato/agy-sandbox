/**
 * cluster-benchmark.js (SPEC-119)
 * Programmatic sharded-cluster performance regression benchmarking and latency gates.
 *
 * Spawns 3 concurrent sharded workers, runs a frontend LB sticky proxy, simulates 50
 * concurrent headless clients performing high-frequency transactions for 5 seconds,
 * aggregates performance telemetry, and asserts strict latency gates.
 */

import { Worker } from "worker_threads";
import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import {
  assignShard,
  RoomRegistry,
  routeConnection,
} from "../../src/net/roomRouter.js";
import { ProcessReaper } from "../../src/net/ProcessReaper.js";
import { JsonFileStore } from "../../src/persistence/Store.js";

const GATEWAY_PORT = 18210;
const PORT_WORKER_0 = 18211;
const PORT_WORKER_1 = 18212;
const PORT_WORKER_2 = 18213;
const DATA_DIR = "./data-benchmark-shared";

const storeInstance = new JsonFileStore({ dir: DATA_DIR });

/**
 * Resolves the port of the worker currently owning the specified roomId.
 *
 * @param {string} roomId
 * @returns {Promise<number>}
 */
async function getRoutePort(roomId) {
  try {
    const data = await storeInstance.load("presence:registry");
    const registry = RoomRegistry.fromJSON(data || {});
    const targetNodeId = routeConnection({
      roomId,
      registry,
      shardCount: 3,
    });
    if (targetNodeId === "node-2") return PORT_WORKER_2;
    if (targetNodeId === "node-1") return PORT_WORKER_1;
    return PORT_WORKER_0;
  } catch {
    const shardIdx = assignShard(roomId, 3);
    if (shardIdx === 2) return PORT_WORKER_2;
    if (shardIdx === 1) return PORT_WORKER_1;
    return PORT_WORKER_0;
  }
}

async function main() {
  console.log("🚀 STARTING CLUSTER PERFORMANCE REGRESSION BENCHMARK...");

  // 1. Purge legacy benchmark db directories
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log(`🧹 Purged legacy database directory: ${DATA_DIR}`);
  } catch (err) {
    console.warn(`⚠️ Failed to purge ${DATA_DIR}: ${err.message}`);
  }

  // 2. Spawn three sharded worker threads
  console.log(
    `⚙️  Booting Shards: Node-0 (port ${PORT_WORKER_0}), Node-1 (port ${PORT_WORKER_1}), Node-2 (port ${PORT_WORKER_2})...`,
  );

  const _worker0 = ProcessReaper.registerWorker(
    new Worker(new URL("../../src/server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(PORT_WORKER_0),
        SHARD_INDEX: "0",
        WORKERS: "3",
        PERSISTENCE_DIR: DATA_DIR,
      },
    }),
  );

  const _worker1 = ProcessReaper.registerWorker(
    new Worker(new URL("../../src/server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(PORT_WORKER_1),
        SHARD_INDEX: "1",
        WORKERS: "3",
        PERSISTENCE_DIR: DATA_DIR,
      },
    }),
  );

  const _worker2 = ProcessReaper.registerWorker(
    new Worker(new URL("../../src/server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(PORT_WORKER_2),
        SHARD_INDEX: "2",
        WORKERS: "3",
        PERSISTENCE_DIR: DATA_DIR,
      },
    }),
  );

  // Give workers time to boot and bind
  await new Promise((resolve) => setTimeout(resolve, 2500));
  console.log("💡 All 3 sharded workers are online!");

  // 3. Spin up sticky routing gateway proxy
  console.log(
    `🔌 Initializing active sticky routing gateway on port ${GATEWAY_PORT}...`,
  );

  const gatewayWss = new WebSocketServer({ noServer: true });

  const gatewayHttpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const roomId = url.searchParams.get("roomId") || "public";
    const targetPort = await getRoutePort(roomId);

    const proxyReq = http.request(
      {
        host: "localhost",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    req.pipe(proxyReq);
    proxyReq.on("error", (err) => {
      res.writeHead(502);
      res.end(`Bad Gateway Proxy: ${err.message}`);
    });
  });

  gatewayHttpServer.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const roomId = url.searchParams.get("roomId") || "public";
    const targetPort = await getRoutePort(roomId);

    gatewayWss.handleUpgrade(request, socket, head, (clientWs) => {
      const targetWs = new WebSocket(
        `ws://localhost:${targetPort}${request.url}`,
      );
      const buffer = [];

      clientWs.on("message", (message) => {
        if (targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(message);
        } else {
          buffer.push(message);
        }
      });

      targetWs.on("open", () => {
        while (buffer.length > 0) {
          targetWs.send(buffer.shift());
        }
      });

      targetWs.on("message", (message) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(message);
        }
      });

      const cleanup = () => {
        try {
          clientWs.close();
        } catch (_err) {
          /* ignore */
        }
        try {
          targetWs.close();
        } catch (_err) {
          /* ignore */
        }
      };

      clientWs.on("close", cleanup);
      targetWs.on("close", cleanup);
      clientWs.on("error", cleanup);
      targetWs.on("error", cleanup);
    });
  });

  await new Promise((resolve) =>
    gatewayHttpServer.listen(GATEWAY_PORT, resolve),
  );
  console.log("💡 Gateway proxy is online!");

  // 4. Track orchestrator event loop delay
  let lastTime = Date.now();
  const orchestratorLatency = [];
  const orchestratorTimer = setInterval(() => {
    const now = Date.now();
    const delay = now - lastTime - 50;
    orchestratorLatency.push(delay > 0 ? delay : 0);
    lastTime = now;
  }, 50);

  // 5. Connect 50 concurrent headless clients performing actions
  const clientsCount = 50;
  const durationMs = 5000;
  const clients = [];

  console.log(
    `🚀 Spawning ${clientsCount} concurrent clients performing high-frequency actions...`,
  );

  async function spawnClient(id) {
    return new Promise((resolve) => {
      const roomIndex = id % 10;
      const roomId = `room-${roomIndex}`;
      const ws = new WebSocket(
        `ws://localhost:${GATEWAY_PORT}/?roomId=${roomId}`,
      );
      let timer = null;

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId,
            nickname: `BenchPilot-${id}`,
          }),
        );
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        if (msg.type === "init") {
          timer = setInterval(() => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                const rand = Math.random();
                if (rand < 0.5) {
                  // Flight controls
                  ws.send(
                    JSON.stringify({
                      type: "controls",
                      keys: {
                        up: Math.random() < 0.8,
                        space: Math.random() < 0.1,
                      },
                      heading: Math.random() * Math.PI * 2,
                      warp: Math.random() < 0.05,
                    }),
                  );
                } else if (rand < 0.8) {
                  // Market Trade
                  ws.send(
                    JSON.stringify({
                      type: "trade",
                      planetName: "Sol",
                      commodity: "food",
                      amount: 1,
                      buy: Math.random() < 0.5,
                    }),
                  );
                } else {
                  // Chat message
                  ws.send(
                    JSON.stringify({
                      type: "chat",
                      text: `Performance test payload from client #${id}!`,
                    }),
                  );
                }
              }
            } catch {
              // Swallow
            }
          }, 100);

          clients.push({ ws, timer });
          resolve();
        }
      });

      ws.on("error", () => resolve());
      ws.on("close", () => {
        if (timer) clearInterval(timer);
      });
    });
  }

  const spawnPromises = [];
  for (let i = 0; i < clientsCount; i++) {
    spawnPromises.push(spawnClient(i));
  }
  await Promise.all(spawnPromises);
  console.log(
    `✅ All ${clients.length} headless clients connected successfully and running.`,
  );

  // 6. Periodically poll metrics from the 3 sharded workers
  const polledMetrics = {
    eventLoopLatencies: [],
    heapUsedSnapshots: [],
    broadcastBytesList: [],
    tickAveragesList: [],
  };

  const metricsTimer = setInterval(async () => {
    for (const port of [PORT_WORKER_0, PORT_WORKER_1, PORT_WORKER_2]) {
      try {
        const response = await fetch(`http://localhost:${port}/metrics`);
        if (response.ok) {
          const m = await response.json();
          if (m.event_loop_latency_ms !== undefined) {
            polledMetrics.eventLoopLatencies.push(m.event_loop_latency_ms);
          }
          if (m.sandbox_telemetry?.memory?.heapUsed !== undefined) {
            polledMetrics.heapUsedSnapshots.push(
              m.sandbox_telemetry.memory.heapUsed,
            );
          }
          if (m.broadcast_bytes_total !== undefined) {
            polledMetrics.broadcastBytesList.push(m.broadcast_bytes_total);
          }
          if (m.tick_ms_avg !== undefined) {
            polledMetrics.tickAveragesList.push(m.tick_ms_avg);
          }
        }
      } catch {
        // ignore offline polls during teardown
      }
    }
  }, 500);

  // Run benchmark for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  // 7. Cleanup clients, timers, and gateways
  console.log("\n🧹 Tearing down clients and collecting final metrics...");
  clearInterval(metricsTimer);
  clearInterval(orchestratorTimer);

  for (const c of clients) {
    if (c.timer) clearInterval(c.timer);
    try {
      c.ws.close();
    } catch (_err) {
      /* ignore */
    }
  }

  await new Promise((resolve) => gatewayHttpServer.close(resolve));
  gatewayWss.close();
  console.log("🛑 Gateway closed.");

  // Fetch final metrics from workers before termination
  for (const port of [PORT_WORKER_0, PORT_WORKER_1, PORT_WORKER_2]) {
    try {
      const response = await fetch(`http://localhost:${port}/metrics`);
      if (response.ok) {
        const m = await response.json();
        if (m.event_loop_latency_ms !== undefined) {
          polledMetrics.eventLoopLatencies.push(m.event_loop_latency_ms);
        }
        if (m.sandbox_telemetry?.memory?.heapUsed !== undefined) {
          polledMetrics.heapUsedSnapshots.push(
            m.sandbox_telemetry.memory.heapUsed,
          );
        }
        if (m.broadcast_bytes_total !== undefined) {
          polledMetrics.broadcastBytesList.push(m.broadcast_bytes_total);
        }
      }
    } catch {
      // ignore
    }
  }

  // Terminate workers using ProcessReaper
  await ProcessReaper.reap();
  console.log("🛑 All background workers terminated cleanly.");

  // Clean database directory
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch (_err) {
    /* ignore */
  }

  // 8. Analyze and print performance indicators
  const avgOrchestratorLatency =
    orchestratorLatency.reduce((a, b) => a + b, 0) /
    (orchestratorLatency.length || 1);
  const avgWorkerLatency =
    polledMetrics.eventLoopLatencies.reduce((a, b) => a + b, 0) /
    (polledMetrics.eventLoopLatencies.length || 1);

  const overallAvgLatency = (avgOrchestratorLatency + avgWorkerLatency) / 2;
  const peakHeapUsageBytes = Math.max(...polledMetrics.heapUsedSnapshots, 0);
  const peakHeapUsageMb = Math.round(peakHeapUsageBytes / (1024 * 1024));

  const totalBroadcastBytes = Math.max(...polledMetrics.broadcastBytesList, 0);
  const broadcastEgressRateKbs = Math.round(
    totalBroadcastBytes / 1024 / (durationMs / 1000),
  );

  const avgTickMs =
    polledMetrics.tickAveragesList.reduce((a, b) => a + b, 0) /
    (polledMetrics.tickAveragesList.length || 1);

  console.log("\n=======================================================");
  console.log("📊 CLUSTER PERFORMANCE BENCHMARK RESULTS:");
  console.log("=======================================================");
  console.log(
    `• Average Orchestrator Latency:   ${avgOrchestratorLatency.toFixed(2)} ms`,
  );
  console.log(
    `• Average Workers Latency:        ${avgWorkerLatency.toFixed(2)} ms`,
  );
  console.log(
    `• Combined Average Latency:       ${overallAvgLatency.toFixed(2)} ms`,
  );
  console.log(`• Peak Heap memory utilization:   ${peakHeapUsageMb} MB`);
  console.log(`• Average Tick simulation duration: ${avgTickMs.toFixed(2)} ms`);
  console.log(
    `• Broadcast egress total:          ${(totalBroadcastBytes / 1024).toFixed(2)} KB`,
  );
  console.log(
    `• Broadcast egress rate:           ${broadcastEgressRateKbs} KB/sec`,
  );
  console.log("=======================================================");

  // 9. Assert strict latency gates
  const MAX_LATENCY_MS = 40.0;
  if (overallAvgLatency > MAX_LATENCY_MS) {
    console.error(
      `❌ REGRESSION: Combined Average Latency (${overallAvgLatency.toFixed(2)}ms) exceeds limit of ${MAX_LATENCY_MS}ms!`,
    );
    process.exit(1);
  }

  console.log(
    `🎉 SUCCESS: Performance is high-performance, and latency gate is satisfied!`,
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ BENCHMARK EXECUTION ERROR!");
  console.error(err);
  await ProcessReaper.reap();
  process.exit(1);
});
