import { Store } from "./Store.js";

/**
 * Redis-backed persistence store (spec 019b).
 *
 * Implements the Store interface against a shared Redis backend. To keep
 * the package clean and the unit-test gate headless, the redis client is
 * injected in the constructor. This allows passing a fake/mock client in
 * tests while wiring a real client in production.
 *
 * All operations are async and return Promises, matching the Store contract.
 */
export class RedisStore extends Store {
  /**
   * @param {Object} [config]
   * @param {Object} [config.client] - The injected Redis (or fake) client. Must implement async `get`, `set`, and `exists`.
   * @param {string} [config.keyPrefix="starfall:"] - Prefix for Redis keys to isolate namespaces.
   */
  constructor({ client, keyPrefix = "starfall:" } = {}) {
    super();
    if (!client) {
      throw new Error("RedisStore constructor: client must be provided");
    }
    this.client = client;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Persists `obj` under `key` inside Redis as a serialized JSON string.
   * @param {string} key
   * @param {Object} obj
   * @returns {Promise<void>}
   */
  async save(key, obj) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("RedisStore.save: key must be a non-empty string");
    }
    const fullKey = this.keyPrefix + key;
    const payload = JSON.stringify(obj);
    await this.client.set(fullKey, payload);
  }

  /**
   * Reads and parses the value stored under `key` from Redis. Returns `null` when the key is absent.
   * @param {string} key
   * @returns {Promise<Object|null>}
   */
  async load(key) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("RedisStore.load: key must be a non-empty string");
    }
    const fullKey = this.keyPrefix + key;
    const raw = await this.client.get(fullKey);
    if (raw === null || raw === undefined) {
      return null;
    }
    return JSON.parse(raw);
  }

  /**
   * Reports whether `key` exists in Redis.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("RedisStore.has: key must be a non-empty string");
    }
    const fullKey = this.keyPrefix + key;
    const count = await this.client.exists(fullKey);
    return !!count;
  }
}
