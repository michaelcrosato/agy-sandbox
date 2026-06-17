import {
  handlePresetSave,
  handlePresetLoad,
  handlePresetDelete,
} from "./outfittingPresetHandlers.js";

describe("outfittingPresetHandlers CRUD Integration Suite", () => {
  let mockClient;
  let mockPlanet;

  beforeEach(() => {
    mockClient = {
      id: "player-1",
      isLanded: true,
      presets: [null, null, null],
      ship: {
        credits: 10000,
        outfits: ["Basic Laser", "Heavy Shields"],
        maxShield: 450,
        shield: 450,
        outfitMass: 800,
        addOutfitMass(m) {
          this.outfitMass += m;
        },
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
        {
          name: "Plasma Cannon",
          cost: 1800,
          type: "weapon",
          value: 25,
          mass: 300,
        },
      ],
    };
  });

  describe("Save Presets", () => {
    test("saves presets successfully with slot default naming", () => {
      handlePresetSave(mockClient, 0);

      expect(mockClient.presets[0]).toEqual({
        name: "Preset Slot 1",
        outfits: ["Basic Laser", "Heavy Shields"],
      });
      expect(mockClient.sentNotifications[0].message).toContain(
        'Saved Preset: "Preset Slot 1"!',
      );
    });

    test("saves presets successfully with custom naming", () => {
      handlePresetSave(mockClient, 2, "My Heavy Fighter Setup");

      expect(mockClient.presets[2]).toEqual({
        name: "My Heavy Fighter Setup",
        outfits: ["Basic Laser", "Heavy Shields"],
      });
      expect(mockClient.sentNotifications[0].message).toContain(
        'Saved Preset: "My Heavy Fighter Setup"!',
      );
    });

    test("rejects saves if not landed or missing parameters", () => {
      mockClient.isLanded = false;
      handlePresetSave(mockClient, 0);
      expect(mockClient.presets[0]).toBeNull(); // no save

      mockClient.isLanded = true;
      handlePresetSave(mockClient, 5); // out of bounds
      expect(mockClient.sentNotifications[0].message).toContain(
        "Invalid preset slot (0-2)!",
      );
    });
  });

  describe("Load Presets", () => {
    test("loads presets successfully with correct net credit calculations", () => {
      mockClient.presets[0] = {
        name: "Mock Preset",
        outfits: ["Basic Laser", "Plasma Cannon"],
      };

      // Sell Heavy Shields (+1080 CR), Buy Plasma Cannon (-1800 CR) => Net Change: -720 CR
      handlePresetLoad(mockClient, 0, mockPlanet);

      expect(mockClient.ship.outfits).toEqual(["Basic Laser", "Plasma Cannon"]);
      expect(mockClient.ship.credits).toBe(9280);
      expect(mockClient.sentNotifications[0].message).toContain(
        'Loaded Preset "Mock Preset"! Net Transaction: -720 CR',
      );
    });

    test("rejects loading if empty or invalid preset indices", () => {
      handlePresetLoad(mockClient, 1, mockPlanet);
      expect(mockClient.sentNotifications[0].message).toContain(
        "No preset saved in slot 2!",
      );

      handlePresetLoad(mockClient, 9, mockPlanet);
      expect(mockClient.sentNotifications[1].message).toContain(
        "Invalid preset slot (0-2)!",
      );
    });

    test("rejects preset loading if credits are insufficient", () => {
      mockClient.presets[0] = {
        name: "Heavy Preset",
        outfits: ["Basic Laser", "Plasma Cannon"],
      };
      mockClient.ship.credits = 100; // Not enough for the net -720 CR transaction

      handlePresetLoad(mockClient, 0, mockPlanet);
      expect(mockClient.ship.outfits).toEqual(["Basic Laser", "Heavy Shields"]); // unchanged
      expect(mockClient.sentNotifications[0].message).toContain(
        "Insufficient credits to load preset!",
      );
    });

    test("rejects preset loading if slot capacity bounds are exceeded", () => {
      mockClient.presets[0] = {
        name: "Illegal Shield Stack",
        outfits: ["Basic Laser", "Heavy Shields", "Aegis Shield Matrix"], // 2 shields (limit 1)
      };

      handlePresetLoad(mockClient, 0, mockPlanet);
      expect(mockClient.sentNotifications[0].message).toContain(
        "Preset exceeds Shield slot cap",
      );
    });
  });

  describe("Delete Presets", () => {
    test("deletes a saved preset successfully", () => {
      mockClient.presets[1] = {
        name: "Setup to Purge",
        outfits: ["Basic Laser"],
      };

      handlePresetDelete(mockClient, 1);

      expect(mockClient.presets[1]).toBeNull();
      expect(mockClient.sentNotifications[0].message).toContain(
        'Deleted Preset: "Setup to Purge"!',
      );
    });

    test("handles deleting an empty preset slot gracefully", () => {
      handlePresetDelete(mockClient, 0);

      expect(mockClient.presets[0]).toBeNull();
      expect(mockClient.sentNotifications[0].message).toContain(
        'Deleted Preset: "Preset Slot 1"!',
      );
    });

    test("rejects deleting if index is out of bounds or client unlanded", () => {
      handlePresetDelete(mockClient, -1);
      expect(mockClient.sentNotifications[0].message).toContain(
        "Invalid preset slot (0-2)!",
      );

      mockClient.isLanded = false;
      handlePresetDelete(mockClient, 0); // no action
    });
  });
});
