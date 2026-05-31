import {
  runEconomyTickForRoom,
  runEconomyNormalizationForRoom,
  runGalaxyHeartbeatInterval,
} from "./galaxyTicker.js";

describe("galaxyTicker module (Spec-042)", () => {
  it("runEconomyTickForRoom triggers events, broadcasts market synchronizations, and logs announcements", () => {
    let broadcastSyncCalled = false;
    let notifyCalled = false;
    let chatSentCount = 0;

    const mockRoom = {
      clients: new Map([
        [
          "c1",
          {
            send: () => {
              chatSentCount++;
            },
          },
        ],
      ]),
      planets: [{ name: "Sol", market: {} }],
      economyManager: {
        activeEconomicEvent: null,
        clearActiveEvent() {},
        triggerRandomEvent() {
          return {
            planetName: "Sol",
            commodity: "ore",
            isShortage: true,
            newPrice: 300,
          };
        },
      },
      broadcast(payload) {
        if (payload.type === "market_sync") {
          broadcastSyncCalled = true;
        }
      },
      broadcastNotification() {
        notifyCalled = true;
      },
    };

    runEconomyTickForRoom(mockRoom);
    expect(broadcastSyncCalled).toBe(true);
    expect(notifyCalled).toBe(true);
    expect(chatSentCount).toBe(1);
  });

  it("runEconomyNormalizationForRoom normalizes price lists and broadcasts updates to clients", () => {
    let broadcastCount = 0;
    const mockRoom = {
      economyManager: {
        normalizePrices() {
          return [{ name: "Sol", market: {} }];
        },
      },
      broadcast(payload) {
        if (payload.type === "market_sync") {
          broadcastCount++;
        }
      },
    };

    runEconomyNormalizationForRoom(mockRoom);
    expect(broadcastCount).toBe(1);
  });

  it("runGalaxyHeartbeatInterval periodic ticker decays active player standing toward zero", () => {
    let decayCalled = false;
    const mockRoom = {
      planets: [],
      galaxyHeartbeat: {
        pulse() {
          return [];
        },
      },
      decayReputations() {
        decayCalled = true;
      },
      broadcast() {},
    };

    const instances = new Map([["room-1", mockRoom]]);
    runGalaxyHeartbeatInterval(instances);

    expect(decayCalled).toBe(true);
  });

  it("runGalaxyHeartbeatInterval records standings decay changes in the GalacticChronicle", () => {
    let decayCalled = false;
    let chronicleEventRecorded = null;

    const mockRoom = {
      id: "room-1",
      planets: [],
      clients: new Map([["ws-p1", { id: "p1", nickname: "CommanderValeria" }]]),
      galaxyHeartbeat: {
        pulse() {
          return [];
        },
      },
      decayReputations() {
        decayCalled = true;
        return {
          p1: {
            "Rim Cartel": 12.5,
          },
        };
      },
      chronicle: {
        recordEvent(event) {
          chronicleEventRecorded = event;
        },
      },
      broadcast() {},
    };

    const instances = new Map([["room-1", mockRoom]]);
    runGalaxyHeartbeatInterval(instances);

    expect(decayCalled).toBe(true);
    expect(chronicleEventRecorded).toBeDefined();
    expect(chronicleEventRecorded.category).toBe("system");
    expect(chronicleEventRecorded.title).toBe(
      "Standing Decay: CommanderValeria",
    );
    expect(chronicleEventRecorded.description).toContain("Rim Cartel");
    expect(chronicleEventRecorded.description).toContain("12.5");
  });
});
