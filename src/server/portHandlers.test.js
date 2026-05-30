import {
  handleOutfitBuy,
  handleShipBuy,
  handleMissionAccept,
  handleMissionAbandon,
  handleEscortCommand,
} from "./portHandlers.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";

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
