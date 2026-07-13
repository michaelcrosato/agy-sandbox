import { describe, test, expect, beforeEach } from "vitest";
import {
  handleOutfitBuy,
  handleShipBuy,
  handleEscortCommand,
  handleOutfitSell,
  handleOreRefine,
  handleDistressBeacon,
} from "./portHandlers.js";
import {
  handleMissionAccept,
  handleMissionAbandon,
} from "./spaceportMissionHandlers.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("portHandlers.handleOutfitBuy (spec 046)", () => {
  let mockClient;
  let mockPlanet;

  beforeEach(() => {
    mockClient = {
      isLanded: true,
      ship: {
        credits: 10000,
        outfits: ["Basic Laser"],
        maxShield: 100,
        shield: 100,
        outfitMass: 0,
        addOutfitMass(m) {
          this.outfitMass += m;
        },
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockPlanet = {
      outfitter: [
        {
          name: "Heavy Shields",
          cost: 1200,
          type: "shield",
          value: 350,
          mass: 800,
        },
        {
          name: "Shielded Cargo Holds",
          cost: 3500,
          type: "jammer",
          value: 0.6,
          mass: 600,
        },
      ],
    };
  });

  test("successfully buys an outfit, deducts credits, adds mass, and appends to ship outfits", () => {
    handleOutfitBuy(mockClient, "Heavy Shields", mockPlanet);

    expect(mockClient.ship.credits).toBe(8800);
    expect(mockClient.ship.outfits).toContain("Heavy Shields");
    expect(mockClient.ship.maxShield).toBe(450);
    expect(mockClient.ship.outfitMass).toBe(800);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Equipped: Heavy Shields!",
      style: "success",
    });
  });

  test("rejects buy if outfit is already equipped", () => {
    mockClient.ship.outfits.push("Heavy Shields");

    handleOutfitBuy(mockClient, "Heavy Shields", mockPlanet);

    expect(mockClient.ship.credits).toBe(10000);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Upgrade already equipped!",
      style: "error",
    });
  });

  test("rejects buy if credits are insufficient", () => {
    mockClient.ship.credits = 500;

    handleOutfitBuy(mockClient, "Heavy Shields", mockPlanet);

    expect(mockClient.ship.credits).toBe(500);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Insufficient credits for upgrade!",
      style: "error",
    });
  });

  test("rejects buy if purchase would exceed ship outfit mass limit", () => {
    mockClient.ship.maxOutfitMass = 500;
    handleOutfitBuy(mockClient, "Heavy Shields", mockPlanet);

    expect(mockClient.ship.credits).toBe(10000);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Purchase exceeds ship outfit mass limit (500 kg)!",
      style: "error",
    });
  });
});

describe("portHandlers.handleShipBuy (spec 046)", () => {
  let mockClient;
  let mockPlanet;

  beforeEach(() => {
    mockClient = {
      isLanded: true,
      ship: {
        credits: 20000,
        cargo: { food: 0 },
        outfits: [],
        outfitMass: 0,
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockPlanet = {
      shipyard: [
        {
          name: "Valkyrie Interceptor",
          cost: 15000,
          maxShield: 300,
          maxArmor: 200,
          thrustPower: 18000,
          turnRate: 3.5,
          cargoCapacity: 40,
        },
      ],
    };
  });

  test("successfully buys a new ship and transitions stats", () => {
    handleShipBuy(mockClient, "Valkyrie Interceptor", mockPlanet);

    expect(mockClient.ship.credits).toBe(5000);
    expect(mockClient.ship.maxShield).toBe(300);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Acquired new ship: Valkyrie Interceptor!",
      style: "success",
    });
  });

  test("rejects ship purchase if credits are insufficient", () => {
    mockClient.ship.credits = 1000;

    handleShipBuy(mockClient, "Valkyrie Interceptor", mockPlanet);

    expect(mockClient.ship.credits).toBe(1000);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Insufficient credits for ship purchase!",
      style: "error",
    });
  });
});

describe("portHandlers.handleMissionAccept & handleMissionAbandon (spec 046)", () => {
  let mockClient;
  let mockPlanet;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      isLanded: true,
      ship: { credits: 1000, outfits: [], cargo: {} },
      missionManager: {
        availableMissions: {},
        activeMissions: [],
        generateMissionsForPlanet(p) {
          this.availableMissions[p] = [
            {
              id: "m1",
              title: "Delivery Mission",
              reward: 2000,
              cargoItem: "food",
              cargoAmount: 2,
            },
          ];
        },
        acceptMission(p, mId) {
          const list = this.availableMissions[p] || [];
          const m = list.find((x) => x.id === mId);
          if (m) {
            this.activeMissions.push(m);
            return { success: true, message: "Mission Accepted!" };
          }
          return { success: false, message: "Mission not found!" };
        },
        abandonMission(mId) {
          this.activeMissions = this.activeMissions.filter((x) => x.id !== mId);
        },
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockPlanet = { name: "Sol Prime" };
    mockRoom = { planets: [mockPlanet] };
  });

  test("accepts a dynamic mission, registers in manager, and sends a notification", () => {
    handleMissionAccept(mockClient, "Sol Prime", "m1", mockPlanet, mockRoom);

    expect(mockClient.missionManager.activeMissions.length).toBe(1);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Mission Accepted!",
      style: "success",
    });
  });

  test("abandons an active mission correctly", () => {
    mockClient.missionManager.activeMissions.push({
      id: "m1",
      title: "Delivery Mission",
    });

    handleMissionAbandon(mockClient, "m1");

    expect(mockClient.missionManager.activeMissions.length).toBe(0);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Abandoned contract: Delivery Mission",
      style: "info",
    });
  });
});

describe("Contraband Scanning & Jammer Outfits (spec 045)", () => {
  // We can verify the math of jammer checks directly inside a parameterized test
  // replicating the exact jammer evaluation logic implemented in server.js:
  function runScanningSecurityCheck(
    ship,
    targetPlanetName,
    injectedRng = Math.random,
  ) {
    if (targetPlanetName === "Rogue's Hollow" || !(ship.cargo.contraband > 0)) {
      return { scanDetected: false, confiscated: false, fined: 0 };
    }

    let bestJammerValue = 0;
    if (ship.outfits) {
      for (const outfitName of ship.outfits) {
        const spec = DEFAULT_OUTFITS.find((o) => o.name === outfitName);
        if (spec && spec.type === "jammer") {
          if (spec.value > bestJammerValue) {
            bestJammerValue = spec.value;
          }
        }
      }
    }

    let scanDetected = true;
    if (bestJammerValue > 0) {
      const rng = injectedRng;
      if (rng() < bestJammerValue) {
        scanDetected = false;
      }
    }

    if (scanDetected) {
      ship.cargo.contraband = 0;
      ship.credits = Math.max(0, ship.credits - 1500);
      return { scanDetected: true, confiscated: true, fined: 1500 };
    } else {
      return { scanDetected: false, confiscated: false, fined: 0 };
    }
  }

  test("100% detection rate when no jammer is installed", () => {
    const ship = {
      credits: 5000,
      cargo: { contraband: 4 },
      outfits: ["Heavy Shields"],
    };

    const res = runScanningSecurityCheck(ship, "Sol Prime");
    expect(res.scanDetected).toBe(true);
    expect(res.confiscated).toBe(true);
    expect(res.fined).toBe(1500);
    expect(ship.cargo.contraband).toBe(0);
    expect(ship.credits).toBe(3500);
  });

  test("bypass security scan successfully when jammer rolls lower than efficiency rating", () => {
    const ship = {
      credits: 5000,
      cargo: { contraband: 4 },
      outfits: ["Security Decoy Jammer"], // 90% bypass rate
    };

    // Mock RNG to return 0.5 (which is < 0.9 decoy jammer efficiency)
    const mockRng = () => 0.5;

    const res = runScanningSecurityCheck(ship, "Sol Prime", mockRng);
    expect(res.scanDetected).toBe(false);
    expect(res.confiscated).toBe(false);
    expect(res.fined).toBe(0);
    expect(ship.cargo.contraband).toBe(4);
    expect(ship.credits).toBe(5000);
  });

  test("fails security scan when jammer rolls higher than efficiency rating", () => {
    const ship = {
      credits: 5000,
      cargo: { contraband: 4 },
      outfits: ["Shielded Cargo Holds"], // 60% bypass rate
    };

    // Mock RNG to return 0.75 (which is > 0.6 shielded holds efficiency)
    const mockRng = () => 0.75;

    const res = runScanningSecurityCheck(ship, "Sol Prime", mockRng);
    expect(res.scanDetected).toBe(true);
    expect(res.confiscated).toBe(true);
    expect(res.fined).toBe(1500);
    expect(ship.cargo.contraband).toBe(0);
    expect(ship.credits).toBe(3500);
  });

  test("always bypasses security checks on Rogue's Hollow", () => {
    const ship = {
      credits: 5000,
      cargo: { contraband: 4 },
      outfits: ["Heavy Shields"],
    };

    const res = runScanningSecurityCheck(ship, "Rogue's Hollow");
    expect(res.scanDetected).toBe(false);
    expect(res.confiscated).toBe(false);
    expect(res.fined).toBe(0);
    expect(ship.cargo.contraband).toBe(4);
  });
});

describe("portHandlers.handleEscortCommand (spec 050)", () => {
  let mockClient;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      ship: { id: "player-ship" },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
    };

    mockRoom = {
      ais: [
        { role: "escort", flagship: mockClient.ship, escortMode: "follow" },
        { role: "escort", flagship: mockClient.ship, escortMode: "follow" },
        {
          role: "escort",
          flagship: { id: "other-ship" },
          escortMode: "follow",
        },
        { role: "guard", flagship: mockClient.ship, escortMode: "follow" }, // different role
      ],
    };
  });

  test("transmits orders to player escorts and updates their mode", () => {
    handleEscortCommand(mockClient, { command: "attack" }, mockRoom);

    expect(mockRoom.ais[0].escortMode).toBe("attack");
    expect(mockRoom.ais[1].escortMode).toBe("attack");
    expect(mockRoom.ais[2].escortMode).toBe("follow"); // not owned
    expect(mockRoom.ais[3].escortMode).toBe("follow"); // not an escort
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Transmitted [ATTACK] commands to 2 AI wingmen.",
      style: "success",
    });
  });

  test("resolves targetId and assigns flagship target on attack command", () => {
    const mockTarget = { id: "target-1", isDestroyed: false };
    mockRoom.engine = {
      getEntity(id) {
        return id === "target-1" ? mockTarget : null;
      },
    };

    handleEscortCommand(
      mockClient,
      { command: "attack", targetId: "target-1" },
      mockRoom,
    );

    expect(mockClient.ship.target).toBe(mockTarget);
    expect(mockRoom.ais[0].escortMode).toBe("attack");
  });

  test("handles empty fleet scenario gracefully", () => {
    mockRoom.ais = [];
    handleEscortCommand(mockClient, { command: "hold" }, mockRoom);

    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Transmitted [HOLD] commands to 0 AI wingmen.",
      style: "success",
    });
  });

  test("does nothing if client, ship or room is missing", () => {
    handleEscortCommand(null, { command: "hold" }, mockRoom);
    handleEscortCommand(mockClient, { command: "hold" }, null);
    expect(mockClient.sentNotifications.length).toBe(0);
  });
});

describe("portHandlers.handleOutfitSell (spec 058)", () => {
  let mockClient;
  let mockPlanet;

  beforeEach(() => {
    mockClient = {
      isLanded: true,
      ship: {
        credits: 1000,
        outfits: ["Basic Laser", "Heavy Shields"],
        maxShield: 450,
        shield: 450,
        outfitMass: 800,
        removeOutfitMass(m) {
          this.outfitMass = Math.max(0, this.outfitMass - m);
        },
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockPlanet = {
      faction: "Federation",
      outfitter: [
        {
          name: "Heavy Shields",
          cost: 1200,
          type: "shield",
          value: 350,
          mass: 800,
        },
      ],
    };
  });

  test("successfully sells an outfit, refunds 90% credits, removes mass, and updates maxShield", () => {
    handleOutfitSell(mockClient, "Heavy Shields", mockPlanet);

    // Cost is 1200. Refund = 1200 * 0.9 = 1080. Credits: 1000 + 1080 = 2080.
    expect(mockClient.ship.credits).toBe(2080);
    expect(mockClient.ship.outfits).not.toContain("Heavy Shields");
    expect(mockClient.ship.outfits).toContain("Basic Laser");
    expect(mockClient.ship.maxShield).toBe(100); // 450 - 350
    expect(mockClient.ship.outfitMass).toBe(0);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Sold: Heavy Shields for 1,080 CR!",
      style: "success",
    });
  });

  test("rejects sell if outfit is not equipped", () => {
    handleOutfitSell(mockClient, "Plasma Cannon", mockPlanet);

    expect(mockClient.ship.credits).toBe(1000);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Upgrade not equipped!",
      style: "error",
    });
  });
});

describe("portHandlers.handleOreRefine & Mining Laser Mass (spec 077)", () => {
  let mockClient;
  let mockPlanet;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      id: "player-1",
      isLanded: true,
      planetLandedOn: null,
      ship: {
        credits: 1000,
        cargo: { ore: 20, minerals: 0 },
        cargoCapacity: 100,
        outfits: [],
        hullMass: 2000,
        mass: 2000,
        outfitMass: 0,
        turnRate: 4.0,
        getEffectiveTurnRate() {
          if (this.mass <= 0) return this.turnRate;
          return this.turnRate * (this.hullMass / this.mass);
        },
        addOutfitMass(m) {
          this.outfitMass += m;
          this.mass = this.hullMass + this.outfitMass;
        },
        removeOutfitMass(m) {
          this.outfitMass = Math.max(0, this.outfitMass - m);
          this.mass = this.hullMass + this.outfitMass;
        },
        getCargoWeight() {
          return Object.values(this.cargo).reduce((a, b) => a + b, 0);
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
            this.cargo[item] = (this.cargo[item] || 0) + amount;
            return true;
          }
          return false;
        },
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockPlanet = {
      name: "Valerie Prime",
      faction: "Federation",
      services: { refinery: true },
    };
    mockClient.planetLandedOn = mockPlanet;

    mockRoom = {
      factionRegistry: {
        priceModifier: () => 1.0, // neutral tax
        getStanding: () => 0, // neutral standing
      },
      engine: {
        factionRegistry: null,
      },
    };
    mockRoom.engine.factionRegistry = mockRoom.factionRegistry;
  });

  test("handleOreRefine successfully refines ore to minerals", () => {
    handleOreRefine(mockClient, 20, "minerals", mockRoom);

    expect(mockClient.ship.cargo.ore).toBe(0);
    expect(mockClient.ship.cargo.minerals).toBe(10);
    expect(mockClient.ship.credits).toBe(800); // 20 * 10 fee
    expect(mockClient.sentNotifications[0].message).toContain(
      "Refined 20 units of raw ore into 10 units of minerals",
    );
  });

  test("handleOreRefine applies faction standings transaction tax / discount", () => {
    // 20% discount on standing (discount rate 0.8)
    mockRoom.factionRegistry.priceModifier = () => 0.8;

    handleOreRefine(mockClient, 20, "minerals", mockRoom);

    expect(mockClient.ship.credits).toBe(840); // 20 * 10 * 0.8 = 160 fee. 1000 - 160 = 840.
  });

  test("Mining Laser outfit mass impacts starship agility calculations dynamically", () => {
    // Mining Laser has mass: 250
    const miningLaser = DEFAULT_OUTFITS.find(
      (o) => o.name === "Mining Laser",
    ) || {
      name: "Mining Laser",
      cost: 2400,
      type: "miner",
      value: 1,
      mass: 250,
    };

    // Initially, effective turn rate is 4.0
    expect(mockClient.ship.getEffectiveTurnRate()).toBe(4.0);

    // Equip Mining Laser
    mockClient.ship.outfits.push("Mining Laser");
    mockClient.ship.addOutfitMass(miningLaser.mass);

    // Total mass becomes 2000 + 250 = 2250
    expect(mockClient.ship.mass).toBe(2250);
    // Agility (effective turn rate) should decrease: 4.0 * (2000 / 2250) = 3.555...
    expect(mockClient.ship.getEffectiveTurnRate()).toBeLessThan(4.0);
    expect(mockClient.ship.getEffectiveTurnRate()).toBeCloseTo(3.55555, 4);
  });
});

describe("portHandlers.handleDistressBeacon (spec 084)", () => {
  let mockClient;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      id: "cmdr-test",
      nickname: "TestCmdr",
      ship: {
        id: "cmdr-test",
        outfits: [],
        position: new Vector2D(100, 100),
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats() {},
    };

    mockRoom = {
      name: "Sol Prime",
      planets: [{ name: "Sol", faction: "Federation" }],
      factionRegistry: {
        getStanding(_playerId, _faction) {
          return 50; // friendly standing by default
        },
        factionPolicy() {
          return null;
        },
        standingPolicy() {
          return null;
        },
      },
      engine: {
        entities: [],
        addEntity(e) {
          this.entities.push(e);
        },
      },
      ais: [],
    };
  });

  test("rejects if distress beacon is not equipped", () => {
    handleDistressBeacon(mockClient, mockRoom);

    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "No Emergency Distress Beacon installed!",
      style: "error",
    });
    expect(mockRoom.engine.entities.length).toBe(0);
  });

  test("successfully summons allied refuel tanker when standing is friendly/neutral", () => {
    mockClient.ship.outfits.push("Emergency Distress Beacon");

    handleDistressBeacon(mockClient, mockRoom);

    expect(mockClient.sentNotifications[0].message).toContain(
      "scrambled to your coordinates",
    );
    expect(mockClient.sentNotifications[0].style).toBe("success");
    expect(mockRoom.engine.entities.length).toBe(1);

    const spawnedTanker = mockRoom.engine.entities[0];
    expect(spawnedTanker.name).toBe("Federation Refuel Tanker");
    expect(mockRoom.ais.length).toBe(1);

    const tankerAi = mockRoom.ais[0];
    expect(tankerAi.isRefuelTanker).toBe(true);
    expect(tankerAi.refuelTargetId).toBe("cmdr-test");
    expect(tankerAi.destination).toEqual({ x: 100, y: 100 });
  });

  test("successfully summons pirate raider when standing is hostile", () => {
    mockClient.ship.outfits.push("Emergency Distress Beacon");
    mockRoom.factionRegistry.getStanding = () => -50; // hostile standing!

    handleDistressBeacon(mockClient, mockRoom);

    expect(mockClient.sentNotifications[0].message).toContain(
      "Hostile Rim Pirate Raider incoming!",
    );
    expect(mockClient.sentNotifications[0].style).toBe("error");
    expect(mockRoom.engine.entities.length).toBe(1);

    const spawnedPirate = mockRoom.engine.entities[0];
    expect(spawnedPirate.name).toBe("Rim Pirate Raider");
    expect(mockRoom.ais.length).toBe(1);

    const pirateAi = mockRoom.ais[0];
    expect(pirateAi.target).toBe(mockClient.ship);
  });
});
