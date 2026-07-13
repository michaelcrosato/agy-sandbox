/**
 * Executes a single heartbeat tick of the room registry lease renewal.
 * Claims active rooms on the current node and reaps expired rooms from dead workers.
 *
 * @param {object} options - Options context dependencies.
 * @param {Map<string, object>} options.instances - Map of active room instances on this node.
 * @param {string} options.nodeId - The identifier of this sharded worker node.
 * @param {function} options.loadRegistry - Asynchronous function loading the RoomRegistry.
 * @param {function} options.saveRegistry - Asynchronous function saving the RoomRegistry.
 * @param {number} [options.now] - Optional timestamp (defaults to Date.now()).
 * @returns {Promise<void>}
 */
export async function tickRegistryHeartbeat(options) {
  const {
    instances,
    nodeId,
    loadRegistry,
    saveRegistry,
    now = Date.now(),
  } = options;

  try {
    const registry = await loadRegistry();
    if (!registry) return;

    // 1. Reap any expired rooms hosted by dead workers
    const reaped = registry.reapExpired(now);
    if (reaped > 0) {
      console.log(`🧹 Presence heartbeat: reaped ${reaped} expired rooms.`);
    }

    // 2. Renew lease/TTL for all active rooms owned by this worker
    let changed = false;
    for (const roomId of instances.keys()) {
      const leaseTime = 10000; // 10-second lease/TTL
      const success = registry.claim(roomId, nodeId, now + leaseTime, now);
      if (success) {
        changed = true;
      }
    }

    if (changed || reaped > 0) {
      await saveRegistry(registry);
    }
  } catch (err) {
    console.error(`⚠️ Registry heartbeat tick failed: ${err.message}`);
  }
}

/**
 * Starts the periodic multi-worker room registry heartbeat loop.
 *
 * @param {object} options - Options context dependencies.
 * @param {Map<string, object>} options.instances - Map of active room instances on this node.
 * @param {string} options.nodeId - The identifier of this sharded worker node.
 * @param {function} options.loadRegistry - Asynchronous function loading the RoomRegistry.
 * @param {function} options.saveRegistry - Asynchronous function saving the RoomRegistry.
 * @param {number} [options.intervalMs=4000] - Interval period in milliseconds.
 * @returns {any} The interval handle.
 */
export function startRegistryHeartbeat(options) {
  const { intervalMs = 4000 } = options;
  const interval = setInterval(async () => {
    await tickRegistryHeartbeat(options);
  }, intervalMs);
  return interval;
}
