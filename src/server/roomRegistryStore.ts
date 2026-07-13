import { RoomRegistry } from "../net/roomRouter.js";

export const REGISTRY_KEY = "presence:registry";

/**
 * Loads the RoomRegistry from the database store.
 *
 * @param {object} storeInstance - Swappable database store (e.g. JsonFileStore or RedisStore).
 * @returns {Promise<RoomRegistry>} The loaded RoomRegistry object.
 */
export async function loadRegistry(storeInstance) {
  try {
    const data = await storeInstance.load(REGISTRY_KEY);
    return RoomRegistry.fromJSON(data || {});
  } catch (err) {
    console.error(`⚠️ Failed to load RoomRegistry from store: ${err.message}`);
    return new RoomRegistry();
  }
}

/**
 * Saves the RoomRegistry to the database store with retry behavior.
 *
 * @param {object} storeInstance - Swappable database store.
 * @param {RoomRegistry} registry - The RoomRegistry instance.
 * @returns {Promise<void>}
 */
export async function saveRegistry(storeInstance, registry) {
  let attempts = 0;
  while (attempts < 5) {
    try {
      await storeInstance.save(REGISTRY_KEY, registry.serialize());
      return;
    } catch (err) {
      attempts++;
      if (attempts >= 5) {
        console.error(
          `⚠️ Failed to save RoomRegistry to store after 5 attempts: ${err.message}`,
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
      }
    }
  }
}
