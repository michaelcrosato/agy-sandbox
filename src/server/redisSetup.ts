import { JsonFileStore } from "../persistence/Store.js";
import { InMemoryPubSub } from "../net/PubSub.js";

/**
 * Initializes and connects the storage and Pub/Sub adapters based on environment variables.
 *
 * @param {object} options - Configuration options.
 * @param {string} [options.redisUrl] - Redis connection URL.
 * @param {string} [options.redisScaleOut] - Redis scale out flag.
 * @param {string} [options.persistenceDir] - Local persistence directory.
 * @param {object} [options.redisLib] - Optional injected Redis library for testing.
 * @param {object} [options.redisStoreLib] - Optional injected RedisStore library for testing.
 * @param {object} [options.redisPubSubLib] - Optional injected RedisPubSub library for testing.
 * @returns {Promise<{storeInstance: object, pubsub: object}>} The resolved storage and pubsub instances.
 */
export async function setupRedis(options: any = {}) {
  const redisUrl = options.redisUrl || process.env.REDIS_URL;
  const redisScaleOut = options.redisScaleOut || process.env.REDIS_SCALE_OUT;
  const persistenceDir =
    options.persistenceDir || process.env.PERSISTENCE_DIR || "./data";

  let storeInstance = new JsonFileStore({ dir: persistenceDir });
  let pubsub = new InMemoryPubSub();

  if (redisUrl) {
    try {
      let createClient;
      if (options.redisLib) {
        createClient = options.redisLib.createClient;
      } else {
        const redisModule = await import("redis" as any);
        createClient = redisModule.createClient;
      }

      const RedisStore = options.redisStoreLib
        ? options.redisStoreLib.RedisStore
        : (await import("../persistence/RedisStore.js")).RedisStore;

      const client = createClient({ url: redisUrl });
      await client.connect();
      storeInstance = new RedisStore({ client });
      console.log(`🔌 Connected to shared RedisStore at ${redisUrl}`);

      if (redisScaleOut === "1") {
        const RedisPubSub = options.redisPubSubLib
          ? options.redisPubSubLib.RedisPubSub
          : (await import("../net/PubSub.js")).RedisPubSub;

        const pubClient = createClient({ url: redisUrl });
        const subClient = createClient({ url: redisUrl });
        await Promise.all([pubClient.connect(), subClient.connect()]);
        pubsub = new RedisPubSub({ pubClient, subClient });
        console.log(`🔌 Wired sharded RedisPubSub for multi-worker routing`);
      }
    } catch (err) {
      console.error(
        `⚠️ Failed to connect to Redis, falling back to JsonFileStore: ${err.message}`,
      );
    }
  }

  return { storeInstance, pubsub };
}
