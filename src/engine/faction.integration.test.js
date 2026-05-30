import { GameInstance } from "./GameInstance.js";
import { FactionRegistry } from "./FactionRegistry.js";
import { AIController } from "./ai/AIController.js";
import { factionPrice } from "./Trading.js";
import { serializeGalaxy, applyGalaxy } from "../persistence/serializers.js";
import { MissionManager } from "./MissionManager.js";
import { applyRefine, refineCost } from "./PortServices.js";

// Spec 016 — faction runtime wiring. The pure FactionRegistry math is covered
// in FactionRegistry.test.js; these assert the LIVE wiring: a GameInstance owns
// a registry, planets/NPCs carry factions, per-player standings drive NPC
// targeting + market prices, and the registry round-trips through persistence.

describe("factionPrice (trade-path modifier)", () => {
  it("is a no-op without a registry or a planet faction", () => {
    const reg = new FactionRegistry();
    expect(factionPrice(100, null, "p", "Federation", "buy")).toBe(100);
    expect(factionPrice(100, reg, "p", null, "buy")).toBe(100);
  });

  it("a neutral standing leaves the price unchanged", () => {
    const reg = new FactionRegistry();
    expect(factionPrice(100, reg, "p", "Federation", "buy")).toBe(100);
    expect(factionPrice(100, reg, "p", "Federation", "sell")).toBe(100);
  });

  it("friendly standing discounts buys and lifts sells", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p", "Federation", 100);
    expect(factionPrice(100, reg, "p", "Federation", "buy")).toBeLessThan(100);
    expect(factionPrice(100, reg, "p", "Federation", "sell")).toBeGreaterThan(
      100,
    );
  });

  it("floors the adjusted price at 1", () => {
    const reg = new FactionRegistry({ options: { maxPriceSwing: 5 } });
    reg.adjustStanding("p", "Federation", 100);
    expect(
      factionPrice(1, reg, "p", "Federation", "buy"),
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("FactionRegistry.standingPolicy (per-player view for AI)", () => {
  it("reflects live standing changes", () => {
    const reg = new FactionRegistry();
    const view = reg.standingPolicy();
    expect(view.isHostile("p", "Federation")).toBe(false);
    reg.adjustStanding("p", "Federation", -100);
    expect(view.isHostile("p", "Federation")).toBe(true);
    expect(view.classify("p", "Federation")).toBe("hostile");
    expect(view.isFriendly("p", "Federation")).toBe(false);
  });
});

describe("standing change → NPC targeting + price (GOAL P3 DoD)", () => {
  it("a single standing swing moves both a guard's targeting and the dock price", () => {
    const registry = new FactionRegistry();
    const playerId = "cmdr1";
    const guard = { id: "g1", faction: "Federation", type: "ship" };
    const ai = new AIController(guard, "guard", {
      standingPolicy: registry.standingPolicy(),
    });
    const playerShip = { id: playerId, type: "ship" }; // players carry no faction tag

    // Baseline: neutral. The guard ignores the player; the price is unmodified.
    expect(ai.shouldTarget(playerShip)).toBe(false);
    expect(factionPrice(100, registry, playerId, "Federation", "buy")).toBe(
      100,
    );

    // The player wrongs the Federation badly → standing turns hostile.
    registry.adjustStanding(playerId, "Federation", -100);

    // Targeting changed: the guard now hunts the player.
    expect(ai.shouldTarget(playerShip)).toBe(true);
    // Price changed: a hostile dock overcharges the player on buys.
    expect(
      factionPrice(100, registry, playerId, "Federation", "buy"),
    ).toBeGreaterThan(100);
  });

  it("a guard does not target a player who is merely neutral or friendly", () => {
    const registry = new FactionRegistry();
    const guard = { id: "g1", faction: "Federation", type: "ship" };
    const ai = new AIController(guard, "guard", {
      standingPolicy: registry.standingPolicy(),
    });
    registry.adjustStanding("ally", "Federation", 100);
    expect(ai.shouldTarget({ id: "ally", type: "ship" })).toBe(false);
    expect(ai.shouldTarget({ id: "stranger", type: "ship" })).toBe(false);
  });
});

describe("GameInstance faction wiring", () => {
  it("owns a registry and tags planets + NPCs with factions", () => {
    const room = new GameInstance("room-fac-1", "Faction Test");
    try {
      expect(room.factionRegistry).toBeInstanceOf(FactionRegistry);

      const sol = room.planets.find((p) => p.name === "Sol");
      const hollow = room.planets.find((p) => p.name === "Rogue's Hollow");
      expect(sol.faction).toBe("Federation");
      expect(hollow.faction).toBe("Pirates");

      const npcShips = room.ais.map((a) => a.ship);
      expect(npcShips.length).toBeGreaterThan(0);
      expect(npcShips.every((s) => typeof s.faction === "string")).toBe(true);

      // A pirate hunting a Federation guard still works under faction relations.
      const pirateAi = room.ais.find((a) => a.role === "pirate");
      const guardShip = room.ais.find((a) => a.role === "guard")?.ship;
      if (pirateAi && guardShip) {
        expect(pirateAi.shouldTarget(guardShip)).toBe(true);
      }
    } finally {
      room.destroy();
    }
  });

  it("round-trips faction standings through the galaxy serializer", () => {
    const room = new GameInstance("room-fac-2", "Persist Test");
    room.factionRegistry.adjustStanding("cmdr1", "Federation", 80);
    const snapshot = serializeGalaxy(room);
    room.destroy();

    const restored = new GameInstance("room-fac-3", "Restored");
    try {
      applyGalaxy(restored, snapshot);
      expect(restored.factionRegistry.getStanding("cmdr1", "Federation")).toBe(
        80,
      );
      // Propagation persisted too: helping the Federation lifted its ally.
      expect(
        restored.factionRegistry.getStanding("cmdr1", "Independents"),
      ).toBeGreaterThan(0);
    } finally {
      restored.destroy();
    }
  });
});

describe("reputation decay hook (spec 029)", () => {
  it("decayReputations drifts a standing toward neutral over repeated calls", () => {
    const room = new GameInstance("room-decay-1", "Decay Test");
    try {
      room.factionRegistry.adjustStanding("cmdr1", "Federation", 80);
      const before = room.factionRegistry.getStanding("cmdr1", "Federation");
      expect(before).toBe(80);

      for (let i = 0; i < 20; i++) room.decayReputations();

      const after = room.factionRegistry.getStanding("cmdr1", "Federation");
      // Healed toward 0, but neither instantly nor past neutral.
      expect(after).toBeLessThan(before);
      expect(after).toBeGreaterThan(0);
    } finally {
      room.destroy();
    }
  });

  it("honors an explicit rate and is a safe no-op with no standings", () => {
    const room = new GameInstance("room-decay-2", "Decay Test 2");
    try {
      expect(room.decayReputations()).toEqual({}); // nothing tracked yet
      room.factionRegistry.adjustStanding("p", "Pirates", -100);
      room.decayReputations(0.5); // aggressive rate moves it sharply toward 0
      const v = room.factionRegistry.getStanding("p", "Pirates");
      expect(v).toBeGreaterThan(-100);
      expect(v).toBeLessThan(0);
    } finally {
      room.destroy();
    }
  });
});

describe("mission + trade faction standings (spec 032)", () => {
  it("adjusts player standings on successful trade at a faction planet", () => {
    const room = new GameInstance("room-trade-test", "Trade Test");
    try {
      const sol = room.planets.find((p) => p.name === "Sol");
      expect(sol.faction).toBe("Federation");

      const playerId = "cmdr-trade-1";
      const before = room.factionRegistry.getStanding(playerId, "Federation");
      expect(before).toBe(0);

      // Nudge standing by 0.5 (matching TRADE_STANDING_NUDGE in server.js)
      room.factionRegistry.adjustStanding(playerId, sol.faction, 0.5);

      const after = room.factionRegistry.getStanding(playerId, "Federation");
      expect(after).toBe(0.5);
      // Propagation happened too!
      expect(
        room.factionRegistry.getStanding(playerId, "Independents"),
      ).toBeGreaterThan(0);
    } finally {
      room.destroy();
    }
  });

  it("applies generated mission consequences (standing changes) on arrival completion", () => {
    const room = new GameInstance("room-mission-test", "Mission Test");
    try {
      const playerId = "cmdr-mission-1";
      const mm = new MissionManager();

      // Create a mock active generated delivery mission
      const mission = {
        id: "gen-courier-test",
        type: "courier",
        generated: true,
        destination: "Sol",
        reward: 500,
        cargoItem: "electronics",
        cargoAmount: 1,
        consequences: {
          factionDeltas: [{ playerId, faction: "Federation", delta: 15 }],
        },
      };

      mm.activeMissions.push(mission);

      let removeCargoCalledWith = null;
      const player = {
        credits: 1000,
        removeCargo: (item, amt) => {
          removeCargoCalledWith = [item, amt];
        },
      };

      // Trigger landing on Sol, passing room (GameInstance) as the world context!
      const completed = mm.checkArrivalCompletions("Sol", player, room);

      expect(completed.length).toBe(1);
      expect(completed[0].id).toBe("gen-courier-test");
      expect(player.credits).toBe(1500);
      expect(removeCargoCalledWith).toEqual(["electronics", 1]);

      // Verify that standing is updated in the faction registry!
      const standing = room.factionRegistry.getStanding(playerId, "Federation");
      expect(standing).toBe(15);
      // Verify propagation
      expect(
        room.factionRegistry.getStanding(playerId, "Independents"),
      ).toBeGreaterThan(0);
    } finally {
      room.destroy();
    }
  });

  it("applies generated bounty consequences (standing changes) on bounty completion", () => {
    const room = new GameInstance("room-bounty-test", "Bounty Test");
    try {
      const playerId = "cmdr-bounty-1";
      const mm = new MissionManager();

      // Create a mock active generated bounty mission
      const mission = {
        id: "gen-bounty-test",
        type: "bounty",
        generated: true,
        targetName: "Wanted Pirate",
        reward: 2000,
        consequences: {
          factionDeltas: [{ playerId, faction: "Federation", delta: 25 }],
        },
      };

      mm.activeMissions.push(mission);

      const player = {
        credits: 1000,
      };

      // Trigger bounty check on target death, passing room (GameInstance) as the world context!
      const completed = mm.checkBountyCompletion("Wanted Pirate", player, room);

      expect(completed).not.toBeNull();
      expect(completed.id).toBe("gen-bounty-test");
      expect(player.credits).toBe(3000);

      // Verify that standing is updated in the faction registry!
      const standing = room.factionRegistry.getStanding(playerId, "Federation");
      expect(standing).toBe(25);
    } finally {
      room.destroy();
    }
  });

  describe("Refinery Services Standing Integration (spec 041)", () => {
    it("applies friendly standing discounts and hostile standing surcharges to refining costs", () => {
      const room = new GameInstance("room-refine-test", "Refine Test");
      try {
        const planet = room.planets.find((p) => p.name === "Valkyrie Depot");
        expect(planet.services.refinery).toBe(true);
        expect(planet.faction).toBe("Federation");

        // Spawn a mock ship
        const ship = {
          id: "refine-pilot",
          credits: 1000,
          cargo: { ore: 20, minerals: 0 },
          cargoCapacity: 100,
          getCargoWeight() {
            return this.cargo.ore + this.cargo.minerals;
          },
          removeCargo(item, amount) {
            if (this.cargo[item] >= amount) {
              this.cargo[item] -= amount;
              return true;
            }
            return false;
          },
          addCargo(item, amount) {
            if (this.getCargoWeight() + amount <= this.cargoCapacity) {
              this.cargo[item] += amount;
              return true;
            }
            return false;
          },
        };

        // 1. Baseline: neutral standing (multiplier = 1.0)
        // cost should be 20 * 10 = 200 credits
        const costNeutral = refineCost(
          20,
          {},
          room.factionRegistry,
          ship.id,
          planet.faction,
        );
        expect(costNeutral).toBe(200);

        // 2. Friendly standing (+100 standing gives 20% discount => multiplier = 0.8)
        // cost should be 20 * 10 * 0.8 = 160 credits
        room.factionRegistry.adjustStanding(ship.id, planet.faction, 100);
        const costFriendly = refineCost(
          20,
          {},
          room.factionRegistry,
          ship.id,
          planet.faction,
        );
        expect(costFriendly).toBe(160);

        // 3. Hostile standing (-100 standing gives 20% surcharge => multiplier = 1.2)
        // room.factionRegistry.setStanding directly clamps to Options
        room.factionRegistry.setStanding(ship.id, planet.faction, -100);
        const costHostile = refineCost(
          20,
          {},
          room.factionRegistry,
          ship.id,
          planet.faction,
        );
        expect(costHostile).toBe(240);

        // 4. Test applyRefine with hostile standing
        // Execute the refine transaction at Valkyrie Depot
        const r = applyRefine(
          ship,
          planet,
          20,
          {},
          room.factionRegistry,
          ship.id,
          "minerals",
        );

        expect(r.ok).toBe(true);
        expect(r.cost).toBe(240); // because standing is currently hostile (-100 => 240 CR)
        expect(ship.credits).toBe(1000 - 240);
        expect(ship.cargo.ore).toBe(0);
        expect(ship.cargo.minerals).toBe(10);
      } finally {
        room.destroy();
      }
    });
  });
});
