import { GameInstance } from "../engine/GameInstance.js";
import { applyGalaxy } from "../persistence/serializers.js";
import { assignShard } from "../net/roomRouter.js";

/**
 * Initializes default permanent rooms (like the "public" Arena) on their designated shards
 * and restores their saved states from the persistence manager.
 *
 * @param {object} options - Configuration and dependencies.
 * @param {number} options.workers - Total worker/shard count.
 * @param {number} options.shardIndex - This process's shard index.
 * @param {Map} options.instances - Authoritative world-state room map.
 * @param {object} options.galacticChronicle - Shared chronicle database.
 * @param {object} options.persistenceManager - Persistent storage manager.
 * @returns {Promise<void>}
 */
export async function initializeDefaultRooms(options) {
  const {
    workers,
    shardIndex,
    instances,
    galacticChronicle,
    persistenceManager,
  } = options;

  if (workers === 1 || assignShard("public", workers) === shardIndex) {
    const publicInstance = new GameInstance("public", "Public Arena");
    publicInstance.chronicle = galacticChronicle;
    instances.set("public", publicInstance);

    const persistenceDir = process.env.PERSISTENCE_DIR || "./data";
    try {
      const snapshot = await persistenceManager.loadGalaxy(publicInstance.id);
      if (snapshot) {
        applyGalaxy(publicInstance, snapshot);
        console.log(
          `💾 Restored galaxy state for [${publicInstance.name}] from ${persistenceDir}`,
        );
      }
    } catch (err) {
      console.error(`⚠️ Failed to restore public room galaxy: ${err.message}`);
    }
  }
}
