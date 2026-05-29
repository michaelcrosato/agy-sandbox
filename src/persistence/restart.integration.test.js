import fs from "fs/promises";
import os from "os";
import path from "path";

import { GameInstance } from "../engine/GameInstance.js";
import { MissionManager } from "../engine/MissionManager.js";
import { Ship } from "../engine/Ship.js";

import { PersistenceManager } from "./PersistenceManager.js";
import { JsonFileStore } from "./Store.js";
import { applyGalaxy, applyPlayer } from "./serializers.js";

/**
 * Spec 008 — end-to-end "the world moved" proof: age a galaxy + a player, persist
 * through a REAL JsonFileStore, then restore into a brand-new manager/instance
 * (a simulated process restart) and assert everything comes back. Deterministic:
 * explicit heartbeat pulses, no Math.random in assertions.
 */
function makeClient(id, nickname) {
  return {
    id,
    nickname,
    ship: new Ship({ id, name: nickname, cargoCapacity: 20 }),
    missionManager: new MissionManager(),
  };
}

describe("Persistence kill→restart→rejoin integration (spec 008)", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-restart-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("a fresh process restores the aged galaxy and the returning player", async () => {
    // --- Node A: age the world + a player, persist through a real file store ---
    const pmA = new PersistenceManager({
      store: new JsonFileStore({ dir }),
      logger: () => {},
    });
    const roomA = new GameInstance("public", "Public Arena");
    const playerA = makeClient("player-7", "Vega");
    let pulsesA;
    let marketsA;
    try {
      const solA = roomA.planets.find((p) => p.name === "Sol");
      solA.market.food = 654;
      solA.market.minerals = 21;
      for (let i = 0; i < 12; i++) roomA.galaxyHeartbeat.pulse();
      pulsesA = roomA.galaxyHeartbeat.pulses;
      marketsA = roomA.planets.map((p) => ({
        name: p.name,
        market: { ...p.market },
      }));

      playerA.ship.credits = 13370;
      playerA.ship.addCargo("luxuries", 5);
      playerA.ship.outfits.push("Mining Laser");
      playerA.ship.kills = 9;
      playerA.ship.combatValue = 5400;
      playerA.ship.combatRating = 77;
      playerA.ship.passengerCapacity = 6;
      playerA.ship.ramscoopRate = 4;
      playerA.ship.miningYieldMultiplier = 2;

      expect(await pmA.saveGalaxy("public", roomA)).toBe(true);
      expect(await pmA.savePlayer("player-7", playerA, "public")).toBe(true);
    } finally {
      roomA.destroy();
    }

    // --- Node B: a brand-new manager + store over the same dir (a "restart") ---
    const pmB = new PersistenceManager({
      store: new JsonFileStore({ dir }),
      logger: () => {},
    });
    const roomB = new GameInstance("public", "Public Arena");
    const playerB = makeClient("player-blank", "Blank");
    try {
      const snapshot = await pmB.loadGalaxy("public");
      expect(snapshot).not.toBeNull();
      applyGalaxy(roomB, snapshot);

      expect(roomB.galaxyHeartbeat.pulses).toBe(pulsesA);
      for (const { name, market } of marketsA) {
        const pb = roomB.planets.find((p) => p.name === name);
        expect(pb.market).toEqual(market);
      }

      const wrapped = await pmB.loadPlayer("player-7");
      expect(wrapped).not.toBeNull();
      expect(wrapped.roomId).toBe("public");
      applyPlayer(playerB, wrapped.player);

      expect(playerB.nickname).toBe("Vega");
      expect(playerB.ship.credits).toBe(13370);
      expect(playerB.ship.cargo.luxuries).toBe(5);
      expect(playerB.ship.outfits).toContain("Mining Laser");
      // Combat ledger + EW stat fields all survive the restart (PLAYER_HULL_FIELDS).
      expect(playerB.ship.kills).toBe(9);
      expect(playerB.ship.combatValue).toBe(5400);
      expect(playerB.ship.combatRating).toBe(77);
      expect(playerB.ship.passengerCapacity).toBe(6);
      expect(playerB.ship.ramscoopRate).toBe(4);
      expect(playerB.ship.miningYieldMultiplier).toBe(2);
    } finally {
      roomB.destroy();
    }
  });
});
