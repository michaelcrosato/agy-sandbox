import { describe, test, expect } from "vitest";
import { GameInstance } from "../engine/GameInstance.js";
import { PersistenceManager } from "./PersistenceManager.js";
import { InMemoryStore } from "./Store.js";
import { RedisStore } from "./RedisStore.js";
import { applyGalaxy } from "./serializers.js";
import { RoomRegistry } from "../net/roomRouter.js";
import { RedisPubSub } from "../net/PubSub.js";

/**
 * Spec 019 (horizontal-scaling first slice) — prove the orchestration primitives
 * without real multi-host infra: two in-test "nodes" sharing ONE store + a
 * RoomRegistry both see the same persisted galaxy, and a room handed off between
 * them preserves state. The shared backend here runs on both InMemoryStore
 * and RedisStore (both satisfy the same `Store` contract) to verify seamless interoperability.
 */

const REGISTRY_KEY = "presence:registry";

async function saveRegistry(store, reg) {
  await store.save(REGISTRY_KEY, reg.serialize());
}
async function loadRegistry(store) {
  const data = await store.load(REGISTRY_KEY);
  return RoomRegistry.fromJSON(data || {});
}

class FakeRedisClient {
  constructor() {
    this.data = new Map();
  }
  async set(key, value) {
    this.data.set(key, value);
  }
  async get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }
}

const backends = [
  { name: "InMemoryStore", makeStore: () => new InMemoryStore() },
  {
    name: "RedisStore",
    makeStore: () => new RedisStore({ client: new FakeRedisClient() }),
  },
];

backends.forEach(({ name, makeStore }) => {
  describe(`multi-node room sharing over ${name} (spec 019)`, () => {
    test("two nodes sharing a store see the same persisted galaxy", async () => {
      const store = makeStore(); // the shared backend both nodes talk to
      const pmA = new PersistenceManager({ store, logger: () => {} });
      const pmB = new PersistenceManager({ store, logger: () => {} });

      // --- Node A owns "public", ages the galaxy, and persists it ---
      const reg = new RoomRegistry();
      expect(reg.claim("public", "nodeA")).toBe(true);
      await saveRegistry(store, reg);

      const roomA = new GameInstance("public", "Public Arena");
      let pulsesA;
      let solFoodA;
      try {
        const sol = roomA.planets.find((p) => p.name === "Sol");
        sol.market.food = 654;
        for (let i = 0; i < 9; i++) roomA.galaxyHeartbeat.pulse();
        pulsesA = roomA.galaxyHeartbeat.pulses;
        solFoodA = roomA.planets.find((p) => p.name === "Sol").market.food;
        expect(await pmA.saveGalaxy("public", roomA)).toBe(true);
      } finally {
        roomA.destroy();
      }

      // --- Node B (a different process) loads from the SAME store ---
      const roomB = new GameInstance("public", "Public Arena");
      try {
        const snapshot = await pmB.loadGalaxy("public");
        expect(snapshot).not.toBeNull();
        applyGalaxy(roomB, snapshot);

        expect(roomB.galaxyHeartbeat.pulses).toBe(pulsesA);
        expect(roomB.planets.find((p) => p.name === "Sol").market.food).toBe(
          solFoodA,
        );

        // Presence is visible cross-node too: Node B reads who owns the room.
        const regB = await loadRegistry(store);
        expect(regB.owner("public")).toBe("nodeA");
      } finally {
        roomB.destroy();
      }
    });

    test("a room handed off between nodes preserves its state", async () => {
      const store = makeStore();
      const pmA = new PersistenceManager({ store, logger: () => {} });
      const pmB = new PersistenceManager({ store, logger: () => {} });

      // Node A owns + mutates + saves, then drains the room to Node B.
      const reg = new RoomRegistry();
      reg.claim("public", "nodeA");

      const roomA = new GameInstance("public", "Public Arena");
      let mineralsA;
      try {
        const sol = roomA.planets.find((p) => p.name === "Sol");
        sol.market.minerals = 321;
        mineralsA = sol.market.minerals;
        await pmA.saveGalaxy("public", roomA);
      } finally {
        roomA.destroy();
      }

      // Graceful drain: ownership moves A → B (only the owner can transfer).
      expect(reg.transfer("public", "nodeB", "nodeC")).toBe(false);
      expect(reg.transfer("public", "nodeA", "nodeB")).toBe(true);
      await saveRegistry(store, reg);

      // Node B picks the room up and restores its exact state from the store.
      const regB = await loadRegistry(store);
      expect(regB.owner("public")).toBe("nodeB");

      const roomB = new GameInstance("public", "Public Arena");
      try {
        const snapshot = await pmB.loadGalaxy("public");
        applyGalaxy(roomB, snapshot);
        expect(
          roomB.planets.find((p) => p.name === "Sol").market.minerals,
        ).toBe(mineralsA);
      } finally {
        roomB.destroy();
      }
    });

    test("a node crash (expiry of lease) allows another node to claim and restore the room", async () => {
      const store = makeStore();
      const pmA = new PersistenceManager({ store, logger: () => {} });
      const pmB = new PersistenceManager({ store, logger: () => {} });

      // Node A claims "public" with a lease that expires at t=2000
      let reg = new RoomRegistry();
      expect(reg.claim("public", "nodeA", 2000, 1000)).toBe(true);
      await saveRegistry(store, reg);

      // Node A saves the room state
      const roomA = new GameInstance("public", "Public Arena");
      try {
        const sol = roomA.planets.find((p) => p.name === "Sol");
        sol.market.machinery = 456;
        await pmA.saveGalaxy("public", roomA);
      } finally {
        roomA.destroy();
      }

      // At t=1500, Node B tries to claim but fails because the lease is still active
      reg = await loadRegistry(store);
      expect(reg.claim("public", "nodeB", 3000, 1500)).toBe(false);
      expect(reg.owner("public")).toBe("nodeA");

      // At t=2500, Node B tries to claim. Since the lease of A expired at 2000, this succeeds!
      expect(reg.claim("public", "nodeB", 4000, 2500)).toBe(true);
      expect(reg.owner("public")).toBe("nodeB");
      await saveRegistry(store, reg);

      // Node B loads and restores the room state successfully
      const restoredReg = await loadRegistry(store);
      expect(restoredReg.owner("public")).toBe("nodeB");

      const roomB = new GameInstance("public", "Public Arena");
      try {
        const snapshot = await pmB.loadGalaxy("public");
        applyGalaxy(roomB, snapshot);
        expect(
          roomB.planets.find((p) => p.name === "Sol").market.machinery,
        ).toBe(456);
      } finally {
        roomB.destroy();
      }
    });
  });
});

describe("RedisPubSub Integration & Cross-Process Message Routing (spec 062)", () => {
  class FakeRedisPubSubClient {
    constructor() {
      this.channels = new Map();
    }
    async publish(channel, message) {
      const cbs = this.channels.get(channel) || [];
      for (const cb of cbs) {
        cb(message);
      }
    }
    async subscribe(channel, cb) {
      let cbs = this.channels.get(channel);
      if (!cbs) {
        cbs = [];
        this.channels.set(channel, cbs);
      }
      cbs.push(cb);
    }
    async unsubscribe(channel, cb) {
      const cbs = this.channels.get(channel) || [];
      const idx = cbs.indexOf(cb);
      if (idx !== -1) {
        cbs.splice(idx, 1);
      }
    }
  }

  test("two RedisPubSub instances sharing a pub/sub backbone can exchange messages", async () => {
    const backbone = new FakeRedisPubSubClient();
    const pubsub1 = new RedisPubSub({ client: backbone });
    const pubsub2 = new RedisPubSub({ client: backbone });

    const received = [];
    await pubsub2.subscribe("chat:global", (msg) => {
      received.push(msg);
    });

    await pubsub1.publish("chat:global", { sender: "Alice", text: "Hello!" });

    // Allow macro-task queue to clear
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ sender: "Alice", text: "Hello!" });
  });
});
