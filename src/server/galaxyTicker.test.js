import {
  runEconomyTickForRoom,
  runEconomyNormalizationForRoom,
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
});
