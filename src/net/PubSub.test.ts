import { describe, test, expect, beforeEach } from "vitest";
import { InMemoryPubSub, RedisPubSub } from "./PubSub.js";

class FakePubSubRedisClient {
  constructor() {
    this.subs = new Map();
    this.shardedSubs = new Map();
    this.published = [];
    this.shardedPublished = [];
  }

  async publish(channel, message) {
    this.published.push({ channel, message });
    const listeners = this.subs.get(channel) || [];
    for (const cb of listeners) {
      cb(message);
    }
  }

  async subscribe(channel, cb) {
    let listeners = this.subs.get(channel);
    if (!listeners) {
      listeners = [];
      this.subs.set(channel, listeners);
    }
    listeners.push(cb);
  }

  async unsubscribe(channel, cb) {
    if (!cb) {
      this.subs.delete(channel);
      return;
    }
    const listeners = this.subs.get(channel);
    if (listeners) {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  async spublish(channel, message) {
    this.shardedPublished.push({ channel, message });
    const listeners = this.shardedSubs.get(channel) || [];
    for (const cb of listeners) {
      cb(message);
    }
  }

  async ssubscribe(channel, cb) {
    let listeners = this.shardedSubs.get(channel);
    if (!listeners) {
      listeners = [];
      this.shardedSubs.set(channel, listeners);
    }
    listeners.push(cb);
  }

  async sunsubscribe(channel, cb) {
    if (!cb) {
      this.shardedSubs.delete(channel);
      return;
    }
    const listeners = this.shardedSubs.get(channel);
    if (listeners) {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }
}

describe("InMemoryPubSub", () => {
  let pubsub;

  beforeEach(() => {
    pubsub = new InMemoryPubSub();
  });

  test("publishes to multiple subscribers asynchronously", async () => {
    let received1 = null;
    let received2 = null;

    await pubsub.subscribe("global-chat", (msg) => {
      received1 = msg;
    });

    await pubsub.subscribe("global-chat", (msg) => {
      received2 = msg;
    });

    await pubsub.publish("global-chat", { text: "hello" });

    // Wait a brief tick for async delivery
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(received1).toEqual({ text: "hello" });
    expect(received2).toEqual({ text: "hello" });
  });

  test("does not deliver to unsubscribed callback", async () => {
    let count = 0;
    const cb = () => {
      count++;
    };

    await pubsub.subscribe("game-events", cb);
    await pubsub.publish("game-events", { val: 1 });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(count).toBe(1);

    await pubsub.unsubscribe("game-events", cb);
    await pubsub.publish("game-events", { val: 2 });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(count).toBe(1);
  });
});

describe("RedisPubSub", () => {
  let client;
  let pubsub;

  beforeEach(() => {
    client = new FakePubSubRedisClient();
    pubsub = new RedisPubSub({ client });
  });

  test("publishes and subscribes standard channel", async () => {
    let received = null;
    await pubsub.subscribe("lobby", (msg) => {
      received = msg;
    });

    await pubsub.publish("lobby", { action: "create" });
    expect(client.published).toHaveLength(1);
    expect(client.published[0]).toEqual({
      channel: "lobby",
      message: '{"action":"create"}',
    });
    expect(received).toEqual({ action: "create" });
  });

  test("publishes and subscribes sharded channel if available", async () => {
    let received = null;
    await pubsub.subscribe(
      "room:123",
      (msg) => {
        received = msg;
      },
      { sharded: true },
    );

    await pubsub.publish("room:123", { action: "join" }, { sharded: true });
    expect(client.shardedPublished).toHaveLength(1);
    expect(client.shardedPublished[0]).toEqual({
      channel: "room:123",
      message: '{"action":"join"}',
    });
    expect(received).toEqual({ action: "join" });
  });

  test("unsubscribes specific callback on sharded channel", async () => {
    let count = 0;
    const cb = () => {
      count++;
    };

    await pubsub.subscribe("room:abc", cb, { sharded: true });
    await pubsub.publish("room:abc", { data: "hi" }, { sharded: true });
    expect(count).toBe(1);

    await pubsub.unsubscribe("room:abc", cb, { sharded: true });
    await pubsub.publish("room:abc", { data: "hi" }, { sharded: true });
    expect(count).toBe(1);
  });
});
