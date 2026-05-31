import {
  validatePreset,
  calculatePresetCost,
  canLoadPreset,
} from "./LoadoutManager.js";
import { DEFAULT_OUTFITS } from "./outfitCatalog.js";

describe("LoadoutManager (SPEC-100)", () => {
  let mockShip;
  let mockPlanet;
  let mockFactionRegistry;

  beforeEach(() => {
    mockShip = {
      credits: 15000,
      outfits: ["Basic Laser", "Heavy Shields"],
      powerGridCapacity: 120,
      maxOutfitMass: 3000,
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
        {
          name: "Plasma Cannon",
          cost: 1800,
          type: "weapon",
          value: 25,
          mass: 300,
        },
        {
          name: "Neutron Blaster",
          cost: 4200,
          type: "weapon",
          value: 55,
          mass: 600,
        },
        {
          name: "Ion Disruptor Array",
          cost: 5200,
          type: "pierce",
          value: 0.5,
          mass: 250,
        },
        {
          name: "Overcharged Engines",
          cost: 1500,
          type: "engine",
          value: 12000,
          mass: 200,
        },
        {
          name: "Cold-Fusion Reactor",
          cost: 3000,
          type: "reactor",
          value: 30,
          mass: 350,
        },
        {
          name: "Hyper-Drive Thrusters",
          cost: 3800,
          type: "engine",
          value: 25000,
          mass: 400,
        },
      ],
    };

    mockFactionRegistry = {
      standing: 0,
      getStanding(_playerId, _faction) {
        return this.standing;
      },
    };
  });

  describe("validatePreset", () => {
    test("allows valid configurations", () => {
      const preset = [
        "Basic Laser",
        "Plasma Cannon",
        "Heavy Shields",
        "Overcharged Engines",
      ];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(true);
    });

    test("rejects configurations exceeding weapon slot limits", () => {
      // Weapon slots cap at 2. Basic Laser (weapon), Plasma Cannon (weapon), Neutron Blaster (weapon) = 3
      const preset = ["Basic Laser", "Plasma Cannon", "Neutron Blaster"];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Weapon slots cap (Max 2)!");
    });

    test("rejects configurations exceeding shield slot limits", () => {
      // Shield slots cap at 1
      const preset = ["Heavy Shields", "Heavy Shields"];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Shield slot cap (Max 1)!");
    });

    test("rejects configurations exceeding utility slot limits", () => {
      // Utility slots cap at 1
      const preset = ["Tractor Beam Matrix", "Security Decoy Jammer"];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Utility slot cap (Max 1)!");
    });

    test("rejects configurations exceeding virtual power capacity limits", () => {
      // Aegis Shield Matrix (80 MW) + Hyper-Drive Thrusters (40 MW) + Plasma Cannon (15 MW) = 135 MW > 120 MW
      const preset = [
        "Aegis Shield Matrix",
        "Hyper-Drive Thrusters",
        "Plasma Cannon",
      ];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceeds ship capacity (120 MW)");
    });

    test("allows high power draw when ship virtual power capacity is upgraded", () => {
      mockShip.powerGridCapacity = 200;
      const preset = [
        "Aegis Shield Matrix",
        "Hyper-Drive Thrusters",
        "Plasma Cannon",
      ];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(true);
    });

    test("rejects configurations exceeding cumulative outfit mass limits", () => {
      // Sub-space Cargo Compressor (1200) + Expanded Cargo Holds (500) + Aegis Shield Matrix (1500) = 3200 > 3000
      const preset = [
        "Sub-space Cargo Compressor",
        "Expanded Cargo Holds",
        "Aegis Shield Matrix",
      ];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(
        "exceeds ship outfit mass limit (3000 kg)",
      );
    });

    test("allows high mass when ship max outfit mass is upgraded", () => {
      mockShip.maxOutfitMass = 5000;
      const preset = [
        "Sub-space Cargo Compressor",
        "Expanded Cargo Holds",
        "Aegis Shield Matrix",
      ];
      const result = validatePreset(mockShip, preset);
      expect(result.allowed).toBe(true);
    });
  });

  describe("calculatePresetCost", () => {
    test("correctly calculates missing pieces and net credits change with no standings/taxes", () => {
      // Current: ["Basic Laser", "Heavy Shields"]
      // Target: ["Basic Laser", "Plasma Cannon", "Overcharged Engines"]
      // Sell: Heavy Shields (cost 1200, refund 90% = 1080)
      // Buy: Plasma Cannon (cost 1800), Overcharged Engines (cost 1500) -> Total Buy = 3300
      // Net credit change = 1080 - 3300 = -2220 CR
      const preset = ["Basic Laser", "Plasma Cannon", "Overcharged Engines"];
      const result = calculatePresetCost(
        mockShip,
        preset,
        DEFAULT_OUTFITS,
        "player-1",
      );

      expect(result.toBuy).toEqual(["Plasma Cannon", "Overcharged Engines"]);
      expect(result.toSell).toEqual(["Heavy Shields"]);
      expect(result.totalCost).toBe(3300);
      expect(result.totalRefund).toBe(1080);
      expect(result.netCreditsChange).toBe(-2220);
    });

    test("applies faction standing discount (Allied standing >= 50)", () => {
      mockFactionRegistry.standing = 60; // Friendly/Allied (15% discount)

      const preset = ["Basic Laser", "Plasma Cannon"]; // buy Plasma Cannon (cost 1800 * 0.85 = 1530)
      const result = calculatePresetCost(
        mockShip,
        preset,
        DEFAULT_OUTFITS,
        "player-1",
        mockFactionRegistry,
        "Federation",
      );

      expect(result.totalCost).toBe(1530);
    });

    test("applies transaction tax (Hostile standing <= -16, tax 15%)", () => {
      mockFactionRegistry.standing = -30; // Hostile (15% transaction tax)

      const preset = ["Basic Laser", "Plasma Cannon"]; // buy Plasma Cannon (cost 1800. Tax 15% -> 1800 * 1.15 = 2070)
      const result = calculatePresetCost(
        mockShip,
        preset,
        DEFAULT_OUTFITS,
        "player-1",
        mockFactionRegistry,
        "Federation",
      );

      expect(result.totalCost).toBe(2484);
    });
  });

  describe("canLoadPreset", () => {
    test("rejects if preset lacks physical validity", () => {
      const preset = ["Heavy Shields", "Heavy Shields"]; // 2 shields exceeds slots
      const result = canLoadPreset(
        mockShip,
        preset,
        mockPlanet,
        "player-1",
        mockFactionRegistry,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Shield slot cap");
    });

    test("rejects if player lacks credits to purchase missing items", () => {
      mockShip.credits = 100;
      const preset = ["Basic Laser", "Plasma Cannon"]; // needs 1800 credits
      const result = canLoadPreset(
        mockShip,
        preset,
        mockPlanet,
        "player-1",
        mockFactionRegistry,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Insufficient credits");
    });

    test("rejects if missing item is not sold at target planet", () => {
      const preset = ["Basic Laser", "Security Decoy Jammer"]; // not in mockPlanet.outfitter list
      const result = canLoadPreset(
        mockShip,
        preset,
        mockPlanet,
        "player-1",
        mockFactionRegistry,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("is out of stock");
    });

    test("rejects if missing item is rank locked for player", () => {
      // Ion Disruptor Array requires LIEUTENANT rank (standing >= 20)
      // Mock player is recruit (standing 0)
      mockFactionRegistry.standing = 0;
      const preset = ["Basic Laser", "Ion Disruptor Array"];
      const result = canLoadPreset(
        mockShip,
        preset,
        mockPlanet,
        "player-1",
        mockFactionRegistry,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Rank Locked");
    });

    test("allows loading preset when all requirements are met", () => {
      const preset = ["Basic Laser", "Plasma Cannon"];
      const result = canLoadPreset(
        mockShip,
        preset,
        mockPlanet,
        "player-1",
        mockFactionRegistry,
      );
      expect(result.allowed).toBe(true);
    });
  });
});
