import { GameInstance } from "./GameInstance.js";
import { FactionRegistry } from "./FactionRegistry.js";
import { AIController } from "./ai/AIController.js";
import {
  factionPrice,
  getTransactionTaxRate,
  getModifiedUpgradePrice,
} from "./Trading.js";
import { serializeGalaxy, applyGalaxy } from "../persistence/serializers.js";
import { MissionManager } from "./MissionManager.js";
import { applyRefine, refineCost } from "./PortServices.js";
import { Vector2D } from "../physics/Vector2D.js";
import { validateWarpJump, getWarpToll } from "./Hyperdrive.js";

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

  describe("Reputation Patrol Scramble Spawns (spec 047)", () => {
    it("scrambles aggressive interceptor patrols if player standing is highly hostile", () => {
      const room = new GameInstance("room-patrol-1", "Patrol Test");
      try {
        const playerShip = {
          id: "player-cmdr-1",
          type: "ship",
          outfits: ["Heavy Shields"],
          cargo: { food: 0 },
          position: new Vector2D(0, 0),
          isPlayerMock: true,
        };
        room.engine.addEntity(playerShip);

        // Standing is initially neutral (0)
        room.checkReputationPatrolSpawns(11); // triggers the 10s timer

        let interceptors = room.engine.entities.filter(
          (e) => e.type === "ship" && e.name && e.name.includes("Interceptor"),
        );
        expect(interceptors.length).toBe(0);

        // Player commits hostile crimes and reputation drops to -50
        room.factionRegistry.setStanding(playerShip.id, "Federation", -50);

        // Run check after standing turns hostile
        room.checkReputationPatrolSpawns(11);

        interceptors = room.engine.entities.filter(
          (e) => e.type === "ship" && e.name && e.name.includes("Interceptor"),
        );
        expect(interceptors.length).toBe(1);
        expect(interceptors[0].faction).toBe("Federation");
        expect(interceptors[0].role).toBe("guard");

        // Verify the patrol's AI targets the hostile player
        const controller = room.ais.find((ai) => ai.ship === interceptors[0]);
        expect(controller).toBeDefined();
        expect(controller.target).toBe(playerShip);
      } finally {
        room.destroy();
      }
    });
  });

  describe("Contraband Space Patrol Scans (spec 048)", () => {
    it("skips scan if player has no contraband or is not in governing faction space", () => {
      const room = new GameInstance("room-scan-skip", "Scan Skip Test");
      try {
        const playerShip = {
          id: "player-cmdr-scan-skip",
          type: "ship",
          outfits: [],
          cargo: { contraband: 0 },
          position: new Vector2D(0, 0),
          isPlayerMock: true,
        };
        room.engine.addEntity(playerShip);

        // Spawn a guard
        const guard = {
          id: "guard-1",
          type: "ship",
          role: "guard",
          faction: "Federation",
          position: new Vector2D(100, 100),
        };
        room.engine.addEntity(guard);

        // Trigger scan check
        room.checkContrabandSpaceScans(5);
        expect(playerShip.spaceScanCooldown).toBeUndefined();
      } finally {
        room.destroy();
      }
    });

    it("triggers scan and successfully bypasses it using a jammer with a seeded RNG", () => {
      const room = new GameInstance("room-scan-bypass", "Scan Bypass Test");
      try {
        const playerShip = {
          id: "player-cmdr-scan-bypass",
          type: "ship",
          outfits: ["Security Decoy Jammer"],
          cargo: { contraband: 5 },
          position: new Vector2D(0, 0),
          isPlayerMock: true,
          // 90% bypass rate. Seed RNG so it returns < 0.90
          rng: () => 0.5,
        };
        room.engine.addEntity(playerShip);

        const guard = {
          id: "guard-2",
          type: "ship",
          role: "guard",
          faction: "Federation",
          position: new Vector2D(100, 100),
        };
        room.engine.addEntity(guard);

        // We must have the correct sector faction (by having a planet with Federation faction)
        room.planets.push({
          name: "Test Federation Planet",
          faction: "Federation",
        });

        // Trigger scan check
        room.checkContrabandSpaceScans(5);

        // Scan triggered: cooldown should be set to 30
        expect(playerShip.spaceScanCooldown).toBe(30);

        // Standing should NOT be reduced since we bypassed it successfully
        const standing = room.factionRegistry.getStanding(
          playerShip.id,
          "Federation",
        );
        expect(standing).toBe(0);
      } finally {
        room.destroy();
      }
    });

    it("triggers scan and fails scanning sweep, resulting in standing reduction and hostile guard targeting", () => {
      const room = new GameInstance("room-scan-fail", "Scan Fail Test");
      try {
        const playerShip = {
          id: "player-cmdr-scan-fail",
          type: "ship",
          outfits: ["Shielded Cargo Holds"], // 60% bypass rate
          cargo: { contraband: 5 },
          position: new Vector2D(0, 0),
          isPlayerMock: true,
          // Seed RNG so it returns > 0.60, causing a failed bypass
          rng: () => 0.8,
        };
        room.engine.addEntity(playerShip);

        const guard = {
          id: "guard-3",
          type: "ship",
          role: "guard",
          faction: "Federation",
          position: new Vector2D(100, 100),
        };
        room.engine.addEntity(guard);

        // Add a mock guard AI controller
        const guardCtrl = new AIController(guard, "guard", {
          standingPolicy: room.factionRegistry.standingPolicy(),
        });
        room.ais.push(guardCtrl);

        // Add Federation planet to set governing faction
        room.planets.push({
          name: "Test Federation Planet",
          faction: "Federation",
        });

        // Trigger scan check
        room.checkContrabandSpaceScans(5);

        // Scan triggered: cooldown should be set to 30
        expect(playerShip.spaceScanCooldown).toBe(30);

        // Standing should be reduced by 15 points
        const standing = room.factionRegistry.getStanding(
          playerShip.id,
          "Federation",
        );
        expect(standing).toBe(-15);

        // Verify guard controller target is set to the player ship
        expect(guardCtrl.target).toBe(playerShip);
        expect(guard.target).toBe(playerShip);
      } finally {
        room.destroy();
      }
    });
  });

  describe("Stargate Warp Tolls & Port Transaction Taxes (spec 052)", () => {
    it("applies reputation-based stargate warp tolls and gates jump correctly", () => {
      const registry = new FactionRegistry();
      const gate = {
        id: "gate",
        type: "warp_gate",
        position: new Vector2D(0, 0),
      };
      const ship = {
        id: "p1",
        credits: 1000,
        hyperFuel: 100,
        position: new Vector2D(0, 0),
      };

      // 1. Neutral standing: 150 CR toll
      expect(getWarpToll(ship, registry, "Federation")).toBe(150);
      expect(validateWarpJump(ship, gate, 20, registry, "Federation").ok).toBe(
        true,
      );

      // 2. Friendly/Allied standing (>= 50): 100% waiver (0 CR toll)
      registry.setStanding(ship.id, "Federation", 60);
      expect(getWarpToll(ship, registry, "Federation")).toBe(0);
      expect(validateWarpJump(ship, gate, 20, registry, "Federation").ok).toBe(
        true,
      );

      // 3. Hostile standing (<= -16): 500 CR toll
      registry.setStanding(ship.id, "Federation", -20);
      expect(getWarpToll(ship, registry, "Federation")).toBe(500);
      expect(validateWarpJump(ship, gate, 20, registry, "Federation").ok).toBe(
        true,
      );

      // 4. Insufficient credits for toll (hostile gate requires 500 CR, ship has 400 CR)
      ship.credits = 400;
      const val = validateWarpJump(ship, gate, 20, registry, "Federation");
      expect(val.ok).toBe(false);
      expect(val.reason).toContain("Requires 500 CR");
    });

    it("applies correct transaction tax rates on commodity trade values", () => {
      const registry = new FactionRegistry();
      const playerId = "p1";

      // 1. Neutral standing (-15 to 49): 5% tax
      expect(getTransactionTaxRate(registry, playerId, "Federation")).toBe(
        0.05,
      );

      // 2. Allied/Friendly standing (>= 50): 0% tax
      registry.setStanding(playerId, "Federation", 50);
      expect(getTransactionTaxRate(registry, playerId, "Federation")).toBe(0.0);

      // 3. Hostile standing (<= -16): 15% tax
      registry.setStanding(playerId, "Federation", -30);
      expect(getTransactionTaxRate(registry, playerId, "Federation")).toBe(
        0.15,
      );
    });

    it("applies correct discounts and surcharges on shipyard hulls and outfits", () => {
      const registry = new FactionRegistry();
      const playerId = "p1";

      const basePrice = 1000;

      // 1. Neutral: standard price
      expect(
        getModifiedUpgradePrice(basePrice, registry, playerId, "Federation"),
      ).toBe(1000);

      // 2. Allied/Friendly (>= 50): 15% discount -> 850 CR
      registry.setStanding(playerId, "Federation", 50);
      expect(
        getModifiedUpgradePrice(basePrice, registry, playerId, "Federation"),
      ).toBe(850);

      // 3. Hostile (<= -16): 20% surcharge -> 1200 CR
      registry.setStanding(playerId, "Federation", -30);
      expect(
        getModifiedUpgradePrice(basePrice, registry, playerId, "Federation"),
      ).toBe(1200);
    });
  });

  describe("Faction Conflict Battlegrounds (054)", () => {
    it("sets conflict zone variables and spawns opposing fleets", () => {
      const room = new GameInstance("room-war", "Sector War");
      expect(room.isConflictZone).toBe(false);

      // Trigger conflict between Federation and Pirates
      room.triggerConflictZone("Federation", "Pirates");
      expect(room.isConflictZone).toBe(true);
      expect(room.conflictFactionA).toBe("Federation");
      expect(room.conflictFactionB).toBe("Pirates");

      // Verify fleet combatants spawned
      const fedShips = room.engine.entities.filter(
        (e) =>
          e &&
          e.type === "ship" &&
          e.faction === "Federation" &&
          e.name.includes("Federation Defender"),
      );
      const pirateShips = room.engine.entities.filter(
        (e) =>
          e &&
          e.type === "ship" &&
          e.faction === "Pirates" &&
          e.name.includes("Pirates Raider"),
      );

      expect(fedShips.length).toBe(3);
      expect(pirateShips.length).toBe(3);
    });

    it("ensures opposing conflict ships perceive each other as threats override", () => {
      const room = new GameInstance("room-war-ai", "Sector War AI");
      room.triggerConflictZone("Federation", "Pirates");

      // Grab one Federation ship and one Pirate ship
      const fedShip = room.engine.entities.find(
        (e) =>
          e &&
          e.type === "ship" &&
          e.faction === "Federation" &&
          e.name.includes("Federation Defender"),
      );
      const pirateShip = room.engine.entities.find(
        (e) =>
          e &&
          e.type === "ship" &&
          e.faction === "Pirates" &&
          e.name.includes("Pirates Raider"),
      );

      const fedController = room.ais.find((ai) => ai.ship === fedShip);
      const pirateController = room.ais.find((ai) => ai.ship === pirateShip);

      expect(fedController).toBeDefined();
      expect(pirateController).toBeDefined();

      // Trigger sensor scan and threat assessment
      fedController.scanSensors(room.engine.entities);
      pirateController.scanSensors(room.engine.entities);

      // Verify that they target/perceive each other as threats!
      expect(fedController.shouldTarget(pirateShip)).toBe(true);
      expect(pirateController.shouldTarget(fedShip)).toBe(true);
    });

    it("rewards specialized standing merits (+2.0 / -2.5) on conflict kills", () => {
      const room = new GameInstance("room-war-kills", "Sector War Kills");
      room.triggerConflictZone("Federation", "Pirates");

      // Create a mock player client
      const playerShip = {
        id: "player1",
        type: "ship",
        position: { x: 0, y: 0 },
      };
      const clientObj = {
        id: "player1",
        ship: playerShip,
        missionManager: {
          checkBountyCompletion: () => null,
        },
        send: () => {},
        sendStats: () => {},
      };
      room.clients.set("ws1", clientObj);

      // Find a Pirate Raider ship to destroy
      const targetRaider = room.engine.entities.find(
        (e) =>
          e &&
          e.type === "ship" &&
          e.faction === "Pirates" &&
          e.name.includes("Pirates Raider"),
      );

      // Baseline standings: neutral (0)
      expect(room.factionRegistry.getStanding("player1", "Federation")).toBe(0);
      expect(room.factionRegistry.getStanding("player1", "Pirates")).toBe(0);

      // Attrib kill and destroy the Raider
      targetRaider.destroyedBy = "player1";
      room.handleEntityDestroyed(targetRaider);

      // Destroying a Pirate Raider:
      // +2.0 merits to the opposing faction (Federation) -> propagates -1.0 to Pirates
      // -2.5 merits to the destroyed faction (Pirates) -> propagates +1.25 to Federation
      // Net Federation: 0 + 2.0 + 1.25 = 3.25
      // Net Pirates:    0 - 1.0 - 2.5  = -3.5
      expect(room.factionRegistry.getStanding("player1", "Federation")).toBe(
        3.25,
      );
      expect(room.factionRegistry.getStanding("player1", "Pirates")).toBe(-3.5);
    });
  });
});
