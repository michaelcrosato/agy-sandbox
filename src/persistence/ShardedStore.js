import { Store } from "./Store.js";

/**
 * ShardedStore — horizontal database partition-sharding adapter (spec 070).
 *
 * Implements the Store interface by distributing keys horizontally across multiple
 * underlying Store instances (shards). It resolves shard ownership by running a
 * uniform 32-bit FNV-1a hashing algorithm over keys and modulo-indexing them.
 *
 * This allows distributed sharding of player and galaxy states without single-node bottlenecks.
 */
export class ShardedStore extends Store {
  /**
   * Creates a ShardedStore.
   * @param {Object} [config]
   * @param {Array<Store>} [config.shards] - A list of underlying Store instances.
   * @param {Function} [config.hashFn] - Optional custom hashing function returning a positive integer.
   */
  constructor({ shards = [], hashFn } = {}) {
    super();
    if (!Array.isArray(shards) || shards.length === 0) {
      throw new Error(
        "ShardedStore constructor: shards must be a non-empty array of Store instances",
      );
    }
    for (const shard of shards) {
      if (!(shard instanceof Store)) {
        throw new TypeError(
          "ShardedStore constructor: all shards must be instances of Store",
        );
      }
    }
    this.shards = shards;
    this.hashFn = hashFn || defaultHashFn;
  }

  /**
   * Dynamic hash-to-shard resolution.
   * @param {string} key - Database key.
   * @returns {Store} The resolved shard.
   */
  resolveShard(key) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("ShardedStore: key must be a non-empty string");
    }
    const hash = this.hashFn(key);
    const index = Math.abs(hash) % this.shards.length;
    return this.shards[index];
  }

  /**
   * Persists `obj` on the designated shard.
   * @param {string} key
   * @param {Object} obj
   * @returns {Promise<void>}
   */
  async save(key, obj) {
    const shard = this.resolveShard(key);
    await shard.save(key, obj);
  }

  /**
   * Loads `obj` from the designated shard.
   * @param {string} key
   * @returns {Promise<Object|null>}
   */
  async load(key) {
    const shard = this.resolveShard(key);
    return await shard.load(key);
  }

  /**
   * Verifies if key exists on its designated shard.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const shard = this.resolveShard(key);
    return await shard.has(key);
  }
}

/**
 * Standard uniform 32-bit FNV-1a string hashing.
 * @param {string} str
 * @returns {number}
 */
function defaultHashFn(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
