import { TerritoryControl } from "./TerritoryControl.js";
import { GameInstance } from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("TerritoryControl Invariants and Ownership Shift Tests", () => {
  test("initializes default sector controls and influence maps correctly", () => {
    const tc = new TerritoryControl();
    expect(tc.sectors.core.controllingFaction).toBe("Federation");
    expect(tc.sectors.frontier.controllingFaction).toBe("Frontier League");
    expect(tc.sectors.rim.controllingFaction).toBe("Independents");

    expect(tc.sectors.core.influence.Federation).toBe(80);
    expect(tc.sectors.rim.influence.Pirates).toBe(40);
  });

  test("adjustInfluence clamps values to [0, 100]", () => {
    const tc = new TerritoryControl();

    // Test upper clamp
    tc.adjustInfluence("core", "Federation", 50);
    expect(tc.sectors.core.influence.Federation).toBe(100);

    // Test lower clamp
    tc.adjustInfluence("core", "Federation", -150);
    expect(tc.sectors.core.influence.Federation).toBe(0);
  });

  test("control shift triggers only when rival influence differential > 10", () => {
    const tc = new TerritoryControl();
    // core owner = Federation (80), rival Pirates (0)

    // Set Federation to 50
    tc.sectors.core.influence.Federation = 50;

    // Pirates at 55 (differential is 5, no shift)
    let shifted = tc.adjustInfluence("core", "Pirates", 55);
    expect(shifted).toBe(false);
    expect(tc.sectors.core.controllingFaction).toBe("Federation");

    // Pirates at 60 (differential is 10, no shift yet)
    shifted = tc.adjustInfluence("core", "Pirates", 5);
    expect(shifted).toBe(false);
    expect(tc.sectors.core.controllingFaction).toBe("Federation");

    // Pirates at 61 (differential is 11 > 10, control shifts!)
    shifted = tc.adjustInfluence("core", "Pirates", 1);
    expect(shifted).toBe(true);
    expect(tc.sectors.core.controllingFaction).toBe("Pirates");
  });

  test("decayInfluence decays non-controlling factions and boosts owner", () => {
    const tc = new TerritoryControl();
    tc.sectors.core.influence.Federation = 80;
    tc.sectors.core.influence.Pirates = 10;

    // Run decay for 10 seconds (base decay rate = 0.2 points/sec)
    // Decay amount = 2 points
    tc.decayInfluence(10);

    expect(tc.sectors.core.influence.Pirates).toBe(8); // 10 - 2
    expect(tc.sectors.core.influence.Federation).toBe(81); // 80 + (2 * 0.5)
  });

  test("getSectorParameters returns correct security, tax, and spawn factor mappings", () => {
    const tc = new TerritoryControl();

    // Federation (high security)
    tc.sectors.core.controllingFaction = "Federation";
    expect(tc.getSectorParameters("core")).toEqual({
      security: "high",
      taxRate: 0.12,
      policeSpawnFactor: 1.5,
    });

    // Frontier League (medium security)
    tc.sectors.core.controllingFaction = "Frontier League";
    expect(tc.getSectorParameters("core")).toEqual({
      security: "medium",
      taxRate: 0.08,
      policeSpawnFactor: 1.0,
    });

    // Pirates (lawless security)
    tc.sectors.core.controllingFaction = "Pirates";
    expect(tc.getSectorParameters("core")).toEqual({
      security: "lawless",
      taxRate: 0.2,
      policeSpawnFactor: 0.0,
    });

    // Independents (low security)
    tc.sectors.core.controllingFaction = "Independents";
    expect(tc.getSectorParameters("core")).toEqual({
      security: "low",
      taxRate: 0.05,
      policeSpawnFactor: 0.5,
    });
  });

  test("save and load serializes and deserializes the state cleanly", () => {
    const tc1 = new TerritoryControl();
    tc1.sectors.core.controllingFaction = "Pirates";
    tc1.sectors.core.influence.Pirates = 95;

    const snapshot = tc1.save();

    const tc2 = new TerritoryControl();
    tc2.load(snapshot);

    expect(tc2.sectors.core.controllingFaction).toBe("Pirates");
    expect(tc2.sectors.core.influence.Pirates).toBe(95);
  });

  test("triggers onControlShift callback on successful control changes", () => {
    const tc = new TerritoryControl();
    tc.sectors.core.influence.Federation = 50;
    tc.sectors.core.influence.Pirates = 50;

    let callbackCalled = false;
    tc.onControlShift = (sectorId, oldOwner, newOwner) => {
      expect(sectorId).toBe("core");
      expect(oldOwner).toBe("Federation");
      expect(newOwner).toBe("Pirates");
      callbackCalled = true;
    };

    tc.adjustInfluence("core", "Pirates", 11);
    expect(callbackCalled).toBe(true);
  });

  test("end-to-end combat influence swing and planet faction takeover", () => {
    const room = new GameInstance("room-test-takeover", "Sector Takeover");
    try {
      // 1. Initial sector owner is Federation (80), Pirates (0)
      expect(room.territoryControl.sectors.core.controllingFaction).toBe(
        "Federation",
      );
      const solPlanet = room.planets.find((p) => p.name === "Sol");
      expect(solPlanet.faction).toBe("Federation");

      // Set Federation influence to 40 and Pirates to 45
      room.territoryControl.sectors.core.influence.Federation = 40;
      room.territoryControl.sectors.core.influence.Pirates = 45;

      // 2. Destroy a Pirate ship in core sector: should boost Federation influence +3 and decay Pirates -3
      const pirateShip = new Ship({
        id: "pirate-1",
        position: new Vector2D(0, 0),
      });
      pirateShip.role = "pirate";

      room.handleEntityDestroyed(pirateShip);

      // federation influence becomes 43, Pirates becomes 42
      expect(room.territoryControl.sectors.core.influence.Federation).toBe(43);
      expect(room.territoryControl.sectors.core.influence.Pirates).toBe(42);
      expect(room.territoryControl.sectors.core.controllingFaction).toBe(
        "Federation",
      );

      // 3. Destroy a Federation guard ship in core sector: should reduce Federation influence -5
      const fedShip = new Ship({
        id: "fed-1",
        position: new Vector2D(0, 0),
      });
      fedShip.faction = "Federation";

      // Let's set Pirates influence to 50 (differential would be 50 - 35 = 15 > 10, triggering shift!)
      room.territoryControl.sectors.core.influence.Pirates = 50;

      room.handleEntityDestroyed(fedShip);

      // federation influence becomes 43 - 5 = 38
      // pirates influence becomes 50 + 5 = 55 (since Pirates is current opposing faction / sector controller)
      // differential is 55 - 38 = 17 > 10, control shifts to Pirates!
      expect(room.territoryControl.sectors.core.controllingFaction).toBe(
        "Pirates",
      );

      // Planet faction also swaps!
      expect(solPlanet.faction).toBe("Pirates");
    } finally {
      room.destroy();
    }
  });
});
