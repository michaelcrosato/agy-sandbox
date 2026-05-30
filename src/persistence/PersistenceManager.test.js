import fs from "fs/promises";
import os from "os";
import path from "path";

import { GameInstance } from "../engine/GameInstance.js";
import { MissionManager } from "../engine/MissionManager.js";
import { Ship } from "../engine/Ship.js";

import { PersistenceManager } from "./PersistenceManager.js";
import { InMemoryStore, JsonFileStore } from "./Store.js";
import { applyGalaxy, applyPlayer } from "./serializers.js";

/**
 * Build a stub client that quacks like a live server `clientObj` for the
 * persistence layer: it has an id, nickname, mission manager, and a ship.
 * Nothing here touches sockets or the engine ticker.
 */
function makeClient({ id = "player-test", nickname = "Pilot" } = {}) {
  return {
    id,
    nickname,
    ship: new Ship({
      id,
      name: nickname,
      maxShield: 200,
      maxArmor: 100,
      credits: 1000,
      cargoCapacity: 20,
    }),
    missionManager: new MissionManager(),
  };
}

describe("PersistenceManager (in-memory)", () => {
  test("constructor rejects a missing store", () => {
    expect(() => new PersistenceManager({})).toThrow(TypeError);
  });

  test("saveGalaxy + loadGalaxy round-trip restores markets on a fresh instance", async () => {
    const store = new InMemoryStore();
    const manager = new PersistenceManager({ store, logger: () => {} });

    const source = new GameInstance("public", "Public Arena");
    try {
      // Mutate the source's markets to non-baseline values so the restore is
      // testable: if applyGalaxy works the fresh instance must end up with
      // these exact numbers, not the seeded defaults.
      const solSrc = source.planets.find((p) => p.name === "Sol");
      solSrc.market.food = 777;
      solSrc.market.electronics = 13;
      source.galaxyHeartbeat.pulses = 99;

      const saved = await manager.saveGalaxy(source.id, source);
      expect(saved).toBe(true);

      const fresh = new GameInstance("public", "Public Arena");
      try {
        const solFresh = fresh.planets.find((p) => p.name === "Sol");
        // Sanity: fresh starts on the seeded baseline, not source's aged values.
        expect(solFresh.market.food).not.toBe(777);

        const snapshot = await manager.loadGalaxy(source.id);
        expect(snapshot).not.toBeNull();
        applyGalaxy(fresh, snapshot);

        const solRestored = fresh.planets.find((p) => p.name === "Sol");
        expect(solRestored.market.food).toBe(777);
        expect(solRestored.market.electronics).toBe(13);
        expect(fresh.galaxyHeartbeat.pulses).toBe(99);
      } finally {
        fresh.destroy();
      }
    } finally {
      source.destroy();
    }
  });

  test("loadGalaxy returns null for an unknown room (no crash, no throw)", async () => {
    const manager = new PersistenceManager({
      store: new InMemoryStore(),
      logger: () => {},
    });
    await expect(manager.loadGalaxy("never-saved")).resolves.toBeNull();
  });

  test("loadGalaxy swallows a backing-store read failure and returns null", async () => {
    const exploding = new InMemoryStore();
    exploding.load = async () => {
      throw new Error("simulated I/O failure");
    };
    const errors = [];
    const manager = new PersistenceManager({
      store: exploding,
      logger: (msg, err) => errors.push({ msg, err }),
    });

    await expect(manager.loadGalaxy("public")).resolves.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toMatch(/loadGalaxy/);
  });

  test("saveGalaxy reports false (and does not throw) if the store explodes", async () => {
    const exploding = new InMemoryStore();
    exploding.save = async () => {
      throw new Error("simulated disk-full");
    };
    const manager = new PersistenceManager({
      store: exploding,
      logger: () => {},
    });

    const source = new GameInstance("room-x", "Crash Test");
    try {
      await expect(manager.saveGalaxy(source.id, source)).resolves.toBe(false);
    } finally {
      source.destroy();
    }
  });

  test("savePlayer + loadPlayer round-trip preserves credits, cargo, outfits, room", async () => {
    const store = new InMemoryStore();
    const manager = new PersistenceManager({ store, logger: () => {} });

    const source = makeClient({ id: "player-42", nickname: "Renata" });
    source.ship.credits = 9999;
    source.ship.addCargo("luxuries", 4);
    source.ship.outfits.push("Aegis Shield Matrix");
    source.ship.weaponShieldPierce = 0.6;

    const ok = await manager.savePlayer("player-42", source, "public");
    expect(ok).toBe(true);

    const wrapped = await manager.loadPlayer("player-42");
    expect(wrapped).not.toBeNull();
    expect(wrapped.roomId).toBe("public");
    expect(wrapped.player).toBeDefined();

    const dest = makeClient({ id: "player-blank", nickname: "Blank" });
    applyPlayer(dest, wrapped.player);

    expect(dest.nickname).toBe("Renata");
    expect(dest.ship.credits).toBe(9999);
    expect(dest.ship.cargo.luxuries).toBe(4);
    expect(dest.ship.outfits).toContain("Aegis Shield Matrix");
    expect(dest.ship.weaponShieldPierce).toBe(0.6);
  });

  test("loadPlayer returns null for an unknown token", async () => {
    const manager = new PersistenceManager({
      store: new InMemoryStore(),
      logger: () => {},
    });
    await expect(manager.loadPlayer("nobody-home")).resolves.toBeNull();
  });

  test("loadPlayer is defensive against unwrapped legacy snapshots", async () => {
    const store = new InMemoryStore();
    // Pretend an older save shape exists: the raw serializePlayer output sitting
    // directly under the key, not wrapped in { roomId, player }. The loader
    // should still surface it as a player snapshot rather than returning null.
    await store.save("player-legacy", { version: 1, nickname: "Legacy" });
    const manager = new PersistenceManager({ store, logger: () => {} });

    const wrapped = await manager.loadPlayer("legacy");
    expect(wrapped).not.toBeNull();
    expect(wrapped.player.nickname).toBe("Legacy");
    expect(wrapped.roomId).toBeNull();
  });

  test("saveAllGalaxies persists every room exactly once", async () => {
    const store = new InMemoryStore();
    const manager = new PersistenceManager({ store, logger: () => {} });

    const rA = new GameInstance("room-a", "Alpha");
    const rB = new GameInstance("room-b", "Beta");
    try {
      const saved = await manager.saveAllGalaxies([rA, rB]);
      expect(saved).toBe(2);
      await expect(store.has("galaxy-room-a")).resolves.toBe(true);
      await expect(store.has("galaxy-room-b")).resolves.toBe(true);
    } finally {
      rA.destroy();
      rB.destroy();
    }
  });

  test("saveAllGalaxies skips null entries without throwing", async () => {
    const manager = new PersistenceManager({
      store: new InMemoryStore(),
      logger: () => {},
    });
    await expect(
      manager.saveAllGalaxies([null, undefined, { id: "" }]),
    ).resolves.toBe(0);
  });
});

describe("PersistenceManager (JsonFileStore)", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-persist-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("end-to-end: save -> fresh instance -> load restores heartbeat-aged markets via disk", async () => {
    const store = new JsonFileStore({ dir: tmpDir });
    const manager = new PersistenceManager({ store, logger: () => {} });

    const source = new GameInstance("public", "Public Arena");
    try {
      const polarisSrc = source.planets.find((p) => p.name === "New Polaris");
      polarisSrc.market.minerals = 999;
      source.galaxyHeartbeat.pulses = 5;

      await manager.saveGalaxy(source.id, source);

      // Construct a totally fresh instance and confirm its baseline differs.
      const fresh = new GameInstance("public", "Public Arena");
      try {
        const polarisFresh = fresh.planets.find(
          (p) => p.name === "New Polaris",
        );
        expect(polarisFresh.market.minerals).not.toBe(999);

        const snapshot = await manager.loadGalaxy(source.id);
        applyGalaxy(fresh, snapshot);

        expect(
          fresh.planets.find((p) => p.name === "New Polaris").market.minerals,
        ).toBe(999);
        expect(fresh.galaxyHeartbeat.pulses).toBe(5);
      } finally {
        fresh.destroy();
      }
    } finally {
      source.destroy();
    }
  });

  test("missing save file means loadGalaxy returns null rather than throwing", async () => {
    const store = new JsonFileStore({ dir: tmpDir });
    const manager = new PersistenceManager({ store, logger: () => {} });
    await expect(manager.loadGalaxy("public")).resolves.toBeNull();
  });

  test("corrupt save file does not crash the manager", async () => {
    // Write a deliberately broken JSON file under the key the manager would use.
    const store = new JsonFileStore({ dir: tmpDir });
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "galaxy-public.json"),
      "{this is not json",
      "utf8",
    );
    const errors = [];
    const manager = new PersistenceManager({
      store,
      logger: (msg, err) => errors.push({ msg, err }),
    });

    await expect(manager.loadGalaxy("public")).resolves.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toMatch(/loadGalaxy/);
  });
});

describe("PersistenceManager autosave", () => {
  test("autosave fires saveAllGalaxies on its cadence and stop() halts it", async () => {
    // Use real timers with a very short cadence (Jest ESM mode does not expose
    // the `jest` global, so we can't rely on fake timers here).
    const store = new InMemoryStore();
    const manager = new PersistenceManager({ store, logger: () => {} });
    const rooms = [new GameInstance("public", "Public Arena")];
    try {
      let saveCount = 0;
      const origSaveAll = manager.saveAllGalaxies.bind(manager);
      manager.saveAllGalaxies = async (iter) => {
        saveCount++;
        return origSaveAll(iter);
      };

      const stop = manager.startAutosave(() => rooms, 20);
      // Wait long enough that the interval should have fired ~10 times. The
      // assertion is a lower bound to avoid flakiness on slow CI runners.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(saveCount).toBeGreaterThanOrEqual(2);

      stop();
      const beforeStop = saveCount;
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(saveCount).toBe(beforeStop);
    } finally {
      for (const r of rooms) r.destroy();
    }
  });

  test("autosave rejects a non-function getRooms argument", () => {
    const manager = new PersistenceManager({
      store: new InMemoryStore(),
      logger: () => {},
    });
    expect(() => manager.startAutosave(null, 1000)).toThrow(TypeError);
  });

  test("stopAutosave is a no-op when no timer is running", () => {
    const manager = new PersistenceManager({
      store: new InMemoryStore(),
      logger: () => {},
    });
    expect(() => manager.stopAutosave()).not.toThrow();
  });
});
