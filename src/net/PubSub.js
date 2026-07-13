/**
 * PubSub — process-agnostic publish-subscribe transport abstraction (spec 019e).
 *
 * Provides a uniform pub/sub interface that supports both local in-memory
 * delivery (ideal for unit/integration tests) and Redis-backed sharded/global
 * messaging (for production multi-worker clusters).
 */

/**
 * Abstract base class defining the contract for process-agnostic publish-subscribe transports.
 * Supports both local InMemoryPubSub and distributed RedisPubSub implementations.
 */
export class PubSub {
  /**
   * Publishes a message to a channel.
   * @param {string} _channel
   * @param {Object} _msg
   * @param {Object} [_options]
   * @param {boolean} [_options.sharded] - Use Redis sharded pub/sub if available.
   * @returns {Promise<void>}
   */
  async publish(_channel, _msg, _options = {}) {
    throw new Error("PubSub.publish must be implemented by subclass");
  }

  /**
   * Subscribes to a channel, invoking cb when a message arrives.
   * @param {string} _channel
   * @param {function(Object): void} _cb
   * @param {Object} [_options]
   * @param {boolean} [_options.sharded] - Use Redis sharded pub/sub if available.
   * @returns {Promise<void>}
   */
  async subscribe(_channel, _cb, _options = {}) {
    throw new Error("PubSub.subscribe must be implemented by subclass");
  }

  /**
   * Unsubscribes from a channel.
   * @param {string} _channel
   * @param {function(Object): void} [_cb] - Optional callback to remove.
   * @param {Object} [_options]
   * @param {boolean} [_options.sharded] - Use Redis sharded pub/sub if available.
   * @returns {Promise<void>}
   */
  async unsubscribe(_channel, _cb = null, _options = {}) {
    throw new Error("PubSub.unsubscribe must be implemented by subclass");
  }
}

/**
 * Headless, process-local PubSub transport.
 * Used for fast in-process tests and single-process execution.
 */
export class InMemoryPubSub extends PubSub {
  constructor() {
    super();
    /** @type {Map<string, Set<function(Object): void>>} */
    this.subscriptions = new Map();
  }

  async publish(channel, msg) {
    const subs = this.subscriptions.get(channel);
    if (!subs) return;

    // Deep clone to ensure receiver isolation
    const payload = JSON.parse(JSON.stringify(msg));
    for (const cb of subs) {
      Promise.resolve().then(() => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`⚠️ Error in InMemoryPubSub callback: ${err.message}`);
        }
      });
    }
  }

  async subscribe(channel, cb) {
    let subs = this.subscriptions.get(channel);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(channel, subs);
    }
    subs.add(cb);
  }

  async unsubscribe(channel, cb = null) {
    if (!cb) {
      this.subscriptions.delete(channel);
      return;
    }
    const subs = this.subscriptions.get(channel);
    if (subs) {
      subs.delete(cb);
      if (subs.size === 0) {
        this.subscriptions.delete(channel);
      }
    }
  }
}

/**
 * Redis-backed PubSub transport.
 * Integrates with standard Redis pub/sub and Redis 7+ sharded pub/sub.
 */
export class RedisPubSub extends PubSub {
  /**
   * @param {Object} params
   * @param {Object} [params.client] - Redis client to fallback to.
   * @param {Object} [params.pubClient] - Redis client dedicated to publishing.
   * @param {Object} [params.subClient] - Redis client dedicated to subscribing.
   */
  constructor({ client, pubClient = null, subClient = null } = {}) {
    super();
    this.pubClient = pubClient || client;
    this.subClient = subClient || client;
    if (!this.pubClient || !this.subClient) {
      throw new Error(
        "RedisPubSub constructor: pubClient/subClient or client must be provided",
      );
    }
    // Track active callbacks to allow graceful cleanup/unsubscribes
    /** @type {Map<string, Map<function(Object): void, function(string): void>>} */
    this.wrappedCallbacks = new Map();
  }

  async publish(channel, msg, options = {}) {
    const payload = JSON.stringify(msg);
    if (options.sharded && typeof this.pubClient.spublish === "function") {
      await this.pubClient.spublish(channel, payload);
    } else {
      await this.pubClient.publish(channel, payload);
    }
  }

  async subscribe(channel, cb, options = {}) {
    const wrapped = (message) => {
      try {
        cb(JSON.parse(message));
      } catch (err) {
        console.error(`⚠️ RedisPubSub parse failure: ${err.message}`);
      }
    };

    let chanMap = this.wrappedCallbacks.get(channel);
    if (!chanMap) {
      chanMap = new Map();
      this.wrappedCallbacks.set(channel, chanMap);
    }
    chanMap.set(cb, wrapped);

    if (options.sharded && typeof this.subClient.ssubscribe === "function") {
      await this.subClient.ssubscribe(channel, wrapped);
    } else {
      await this.subClient.subscribe(channel, wrapped);
    }
  }

  async unsubscribe(channel, cb = null, options = {}) {
    const chanMap = this.wrappedCallbacks.get(channel);

    if (!cb) {
      this.wrappedCallbacks.delete(channel);
      if (
        options.sharded &&
        typeof this.subClient.sunsubscribe === "function"
      ) {
        await this.subClient.sunsubscribe(channel);
      } else {
        await this.subClient.unsubscribe(channel);
      }
      return;
    }

    if (chanMap) {
      const wrapped = chanMap.get(cb);
      if (wrapped) {
        chanMap.delete(cb);
        if (
          options.sharded &&
          typeof this.subClient.sunsubscribe === "function"
        ) {
          await this.subClient.sunsubscribe(channel, wrapped);
        } else {
          await this.subClient.unsubscribe(channel, wrapped);
        }
      }
      if (chanMap.size === 0) {
        this.wrappedCallbacks.delete(channel);
      }
    }
  }
}
