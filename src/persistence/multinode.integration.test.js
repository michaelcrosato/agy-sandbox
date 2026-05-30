import { GameInstance } from "../engine/GameInstance.js";
import { PersistenceManager } from "./PersistenceManager.js";
import { InMemoryStore } from "./Store.js";
import { applyGalaxy } from "./serializers.js";
import { RoomRegistry } from "../net/roomRouter.js";

/**
 * Spec 019 (horizontal-scaling first slice) — prove the orchestration primitives
 * without real multi-host infra: two in-test "nodes" sharing ONE store + a
 * RoomRegistry both see the same persisted galaxy, and a room handed off between
 * them preserves state. The shared backend here is an InMemoryStore standing in
 * for a RedisStore (both satisfy the same `Store` contract); real Redis/process
 * spawning is documented as an ops follow-up in plan/specs/019a.
 */

const REGISTRY_KEY = "presence:registry";

async function saveRegistry(store, reg) {
  await store.save(REGISTRY_KEY, reg.serialize());
}
async function loadRegistry(store) {
  const data = await store.load(REGISTRY_KEY);
  return RoomRegistry.fromJSON(data || {});
}

describe("multi-node room sharing over one store (spec 019)", () => {
  test("two nodes sharing a store see the same persisted galaxy", async () => {
    const store = new InMemoryStore(); // the shared backend both nodes talk to
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
    const store = new InMemoryStore();
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
      expect(roomB.planets.find((p) => p.name === "Sol").market.minerals).toBe(
        mineralsA,
      );
    } finally {
      roomB.destroy();
    }
  });
});
