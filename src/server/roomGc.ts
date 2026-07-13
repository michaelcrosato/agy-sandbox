import { shouldGcRoom } from "./roomLifecycle.js";

/**
 * Sweeps room instances and reaps idle custom sectors.
 *
 * @param {Map} instances - Active room instances.
 * @param {Object} options
 * @param {number} [options.now=Date.now()] - Current timestamp.
 * @param {number} [options.workersCount=1] - Dynamic worker processes limit.
 * @param {string} [options.nodeId="node-0"] - Server node identifier.
 * @param {Function} [options.loadRegistry] - Callback to retrieve multi-worker registry.
 * @param {Function} [options.saveRegistry] - Callback to persist multi-worker registry.
 * @param {Function} [options.onRoomGc] - GC sweep notification hook.
 * @returns {Promise<Array<string>>} Reaped room IDs list.
 */
export async function runGcSweep(
  instances,
  {
    now = Date.now(),
    workersCount = 1,
    nodeId = "node-0",
    loadRegistry = null,
    saveRegistry = null,
    onRoomGc = null,
  } = {},
) {
  const reapedIds = [];
  for (const [id, room] of instances.entries()) {
    if (shouldGcRoom(room, { now })) {
      console.log(
        `🧹 Garbage Collecting inactive sector: [${room.name}] (${id})`,
      );
      room.destroy();
      instances.delete(id);
      reapedIds.push(id);

      if (onRoomGc) {
        onRoomGc(id);
      }

      if (workersCount > 1 && loadRegistry && saveRegistry) {
        try {
          const reg = await loadRegistry();
          if (reg.release(id, nodeId)) {
            await saveRegistry(reg);
          }
        } catch (err) {
          console.error(
            `⚠️ RoomGC: Failed to release presence for room ${id}: ${err.message}`,
          );
        }
      }
    }
  }
  return reapedIds;
}
