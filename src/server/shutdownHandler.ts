import { stopPeriodicIntervals } from "./periodicIntervals.js";
import { assignShard } from "../net/roomRouter.js";

/**
 * Creates a graceful shutdown lifecycle handler for the server process.
 * @param {Object} options Options containing all server references
 * @returns {Function} Async function that triggers graceful shutdown
 */
export function createShutdownHandler({
  latencyMonitor,
  sandboxTelemetry,
  memoryLeakSentry,
  resourceLimiter,
  getConfigWatcher,
  physicsInterval,
  getPeriodicIntervalHandles,
  loadRegistry,
  saveRegistry,
  instances,
  persistenceManager,
  clients,
  wss,
  server,
  workers,
  shardIndex,
  forceExitTimeout = 2000,
  exitProcess = (code) => process.exit(code),
}) {
  return async () => {
    console.log("\n🔌 Shutting down server gracefully...");

    if (latencyMonitor && typeof latencyMonitor.stop === "function") {
      latencyMonitor.stop();
    }
    if (sandboxTelemetry && typeof sandboxTelemetry.stop === "function") {
      sandboxTelemetry.stop();
    }
    if (memoryLeakSentry && typeof memoryLeakSentry.stop === "function") {
      memoryLeakSentry.stop();
    }
    if (resourceLimiter && typeof resourceLimiter.stop === "function") {
      resourceLimiter.stop();
    }

    const configWatcher = getConfigWatcher ? getConfigWatcher() : null;
    if (configWatcher && typeof configWatcher.stop === "function") {
      try {
        configWatcher.stop();
        console.log("🛑 Configuration watcher closed.");
      } catch (e) {
        console.error("Error stopping config watcher:", e.message);
      }
    }

    // Clear heartbeat and simulation intervals
    if (physicsInterval) {
      clearInterval(physicsInterval);
    }
    const periodicIntervalHandles = getPeriodicIntervalHandles
      ? getPeriodicIntervalHandles()
      : null;
    if (periodicIntervalHandles) {
      stopPeriodicIntervals(periodicIntervalHandles);
    }

    // Graceful Drain (spec 019f)
    if (workers > 1 && typeof loadRegistry === "function") {
      console.log(
        "🌊 Gracefully draining worker presence and transferring rooms...",
      );
      try {
        const registry = await loadRegistry();
        const activeNodes = [];
        for (let i = 0; i < workers; i++) {
          activeNodes.push(`node-${i}`);
        }
        const drainingNodeId = `node-${shardIndex}`;
        const targets = activeNodes.filter((id) => id !== drainingNodeId);

        if (targets.length > 0 && instances) {
          const rooms = Array.from(instances.keys());
          if (rooms.length > 0) {
            console.log(
              `🌊 Graceful drain: transferring ${rooms.length} room(s) to peers.`,
            );
            for (const roomId of rooms) {
              const idx = assignShard(roomId, targets.length);
              const toNode = targets[idx];
              const room = instances.get(roomId);
              if (room) {
                // 1. Save room galaxy state
                if (
                  persistenceManager &&
                  typeof persistenceManager.saveGalaxy === "function"
                ) {
                  await persistenceManager.saveGalaxy(roomId, room);
                }

                // 2. Transfer registry ownership with a 10s lease
                if (registry && typeof registry.transfer === "function") {
                  registry.transfer(
                    roomId,
                    drainingNodeId,
                    toNode,
                    Date.now() + 10000,
                  );
                }

                // 3. Notify clients in this room to reconnect
                if (room.clients) {
                  for (const client of room.clients.values()) {
                    if (typeof client.send === "function") {
                      client.send({
                        type: "reconnect",
                        message:
                          "Server is restarting, reconnecting to new sector host...",
                      });
                    }
                    // Forcefully close the connection shortly after to trigger reconnect
                    setTimeout(() => {
                      try {
                        if (
                          client.ws &&
                          typeof client.ws.close === "function"
                        ) {
                          client.ws.close();
                        }
                      } catch {
                        // Ignore socket close errors
                      }
                    }, 100);
                  }
                }
              }
            }
            if (typeof saveRegistry === "function") {
              await saveRegistry(registry);
            }
          }
        }
      } catch (err) {
        console.error(`⚠️ Graceful drain failed: ${err.message}`);
      }
    }

    // Snapshot the world (and every connected pilot) to disk before tearing down
    if (persistenceManager) {
      if (typeof persistenceManager.stopAutosave === "function") {
        persistenceManager.stopAutosave();
      }
      try {
        if (
          instances &&
          typeof persistenceManager.saveAllGalaxies === "function"
        ) {
          const savedRooms = await persistenceManager.saveAllGalaxies(
            instances.values(),
          );
          console.log(`💾 Persisted ${savedRooms} galaxy snapshot(s).`);
        }
        let savedPlayers = 0;
        if (clients) {
          for (const client of clients.values()) {
            if (!client || !client.id || !client.ship) continue;
            if (typeof persistenceManager.savePlayer === "function") {
              const ok = await persistenceManager.savePlayer(
                client.id,
                client,
                client.roomId,
              );
              if (ok) savedPlayers++;
            }
          }
        }
        if (savedPlayers > 0) {
          console.log(`💾 Persisted ${savedPlayers} active player session(s).`);
        }
      } catch (e) {
        console.error("Persistence flush during shutdown failed:", e.message);
      }
    }

    // Force close timeout
    const forceExitTimer = setTimeout(() => {
      console.log("⚠️ Forcing shutdown after timeout...");
      exitProcess(1);
    }, forceExitTimeout);

    // Close WebSocket and HTTP Server
    if (wss && typeof wss.close === "function") {
      wss.close(() => {
        console.log("🛑 WebSocket server closed.");
        if (server && typeof server.close === "function") {
          server.close(() => {
            console.log("🛑 HTTP server closed.");
            clearTimeout(forceExitTimer);
            exitProcess(0);
          });
        } else {
          clearTimeout(forceExitTimer);
          exitProcess(0);
        }
      });
    } else if (server && typeof server.close === "function") {
      server.close(() => {
        console.log("🛑 HTTP server closed.");
        clearTimeout(forceExitTimer);
        exitProcess(0);
      });
    } else {
      clearTimeout(forceExitTimer);
      exitProcess(0);
    }
  };
}
