import {
  runEconomyShortageInterval,
  runEnvironmentalSiegeInterval,
  runEconomyNormalizationInterval,
  runGalaxyHeartbeatInterval,
} from "./galaxyTicker.js";
import { runGcSweep } from "./roomGc.js";
import { broadcastLobbySync } from "./lobbySync.js";
import { startRegistryHeartbeat } from "./registryHeartbeat.js";
import { selectDeadSockets, DEFAULT_HEARTBEAT_MS } from "../net/heartbeat.js";

/**
 * Starts all periodic background intervals for the server.
 * @param {Object} options
 * @param {Map} options.instances
 * @param {Object} options.pubsub
 * @param {Object} options.wss
 * @param {Map} options.clients
 * @param {Object} options.metrics
 * @param {Object} options.latencyMonitor
 * @param {Object} options.anomalyDetector
 * @param {Object} options.connectionFloodSentry
 * @param {Object} options.resourceLimiter
 * @param {Function} options.loadRegistry
 * @param {Function} options.saveRegistry
 * @param {number} options.shardIndex
 * @param {number} options.workers
 * @param {number} [options.heartbeatMs]
 * @returns {Object} Handles for all started intervals
 */
export function startPeriodicIntervals({
  instances,
  pubsub,
  wss,
  clients,
  metrics,
  latencyMonitor,
  anomalyDetector,
  connectionFloodSentry,
  resourceLimiter,
  loadRegistry,
  saveRegistry,
  shardIndex,
  workers,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
}) {
  const handles = {};

  // 1. Anomaly detection monitor (1 second)
  handles.anomalyInterval = setInterval(() => {
    try {
      const activeClients = wss && wss.clients ? wss.clients.size : 0;
      const latency = latencyMonitor ? latencyMonitor.getLatency() : 0;
      const heapUsed = process.memoryUsage().heapUsed;
      if (anomalyDetector) {
        anomalyDetector.observe(activeClients, latency, heapUsed);
      }
    } catch (_e) {
      // safe catch-all
    }
  }, 1000);

  // 2. Room Economy Shortage/Surplus events loops (45 seconds)
  handles.economyShortageInterval = setInterval(() => {
    try {
      runEconomyShortageInterval(instances);
    } catch (err) {
      console.error("⚠️ Error in economyShortageInterval:", err.message);
    }
  }, 45000);

  // 3. Room Environmental Siege/EMP events loops (90 seconds)
  handles.environmentalSiegeInterval = setInterval(() => {
    try {
      runEnvironmentalSiegeInterval(instances);
    } catch (err) {
      console.error("⚠️ Error in environmentalSiegeInterval:", err.message);
    }
  }, 90000);

  // 4. Room Economy Normalization drift loops (6 seconds)
  handles.economyNormalizationInterval = setInterval(() => {
    try {
      runEconomyNormalizationInterval(instances);
    } catch (err) {
      console.error("⚠️ Error in economyNormalizationInterval:", err.message);
    }
  }, 6000);

  // 5. Galaxy Heartbeat: age the economy and diffuse prices across trade lanes (8 seconds)
  handles.galaxyHeartbeatInterval = setInterval(() => {
    try {
      if (latencyMonitor && latencyMonitor.shouldShed("cosmetic")) {
        return; // Pause cosmetic/non-essential heartbeat updates when loop is degraded/critical
      }
      runGalaxyHeartbeatInterval(instances);

      // SPEC-165: Synchronize campaign state across all worker processes on heartbeat pulses
      if (pubsub) {
        for (const [roomId, room] of instances.entries()) {
          if (room.factionWarCampaign) {
            pubsub.publish("faction:campaign", {
              roomId,
              campaignState: room.factionWarCampaign.save(),
            });
          }
        }
      }
    } catch (err) {
      console.error("⚠️ Error in galaxyHeartbeatInterval:", err.message);
    }
  }, 8000);

  // 6. Inactive Custom Rooms Garbage Collection (10 seconds)
  handles.gcInterval = setInterval(() => {
    try {
      runGcSweep(instances, {
        now: Date.now(),
        workersCount: workers,
        nodeId: `node-${shardIndex}`,
        loadRegistry,
        saveRegistry,
        onRoomGc: () => {
          broadcastLobbySync(instances, clients);
        },
      });
    } catch (err) {
      console.error("⚠️ Error in gcInterval:", err.message);
    }
  }, 10000);

  // 7. Periodic Lobby Sync Refresh for clients still on the lobby screen (5 seconds)
  handles.lobbySyncInterval = setInterval(() => {
    try {
      broadcastLobbySync(instances, clients);
    } catch (err) {
      console.error("⚠️ Error in lobbySyncInterval:", err.message);
    }
  }, 5000);

  // 8. Periodic Multi-worker Room Registry Heartbeat, Lease Renewal & Reaping Loop (4 seconds)
  if (workers > 1 || process.env.REDIS_SCALE_OUT === "1") {
    try {
      handles.registryHeartbeatInterval = startRegistryHeartbeat({
        instances,
        nodeId: `node-${shardIndex}`,
        loadRegistry,
        saveRegistry,
      });
    } catch (err) {
      console.error("⚠️ Error in registryHeartbeatInterval:", err.message);
    }
  }

  // 9. Liveness heartbeat (30 seconds)
  handles.heartbeatInterval = setInterval(() => {
    try {
      if (!wss || !wss.clients) return;
      const sockets = [...wss.clients];
      for (const dead of selectDeadSockets(sockets)) {
        dead.terminate();
        if (metrics) {
          metrics.inc("heartbeat_reaps");
        }
      }
      for (const ws of sockets) {
        if (ws.isAlive === false) continue; // just terminated above
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          /* socket already closing */
        }
      }
    } catch (err) {
      console.error("⚠️ Error in heartbeatInterval:", err.message);
    }
  }, heartbeatMs);

  if (handles.heartbeatInterval.unref) {
    handles.heartbeatInterval.unref();
  }

  return handles;
}

/**
 * Clears all periodic background intervals.
 * @param {Object} handles Handles returned by startPeriodicIntervals
 */
export function stopPeriodicIntervals(handles) {
  if (!handles) return;
  for (const key of Object.keys(handles)) {
    if (handles[key]) {
      clearInterval(handles[key]);
    }
  }
}
