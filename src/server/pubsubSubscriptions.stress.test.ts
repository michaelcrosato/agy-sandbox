import { describe, test, expect, beforeEach, vi } from "vitest";
import { registerPubSubSubscriptions } from "./pubsubSubscriptions.js";
import { Squad } from "./SquadManager.js";

describe("pubsubSubscriptions Stress & Adversarial Tests", () => {
  let mockPubsub;
  let mockInstances;
  let mockWss;
  let mockSquadManager;
  let options;

  let globalChatCallback;
  let squadChatCallback;
  let squadEventsCallback;
  let factionCampaignCallback;

  beforeEach(() => {
    mockPubsub = {
      subscribe: vi.fn().mockImplementation(async (topic, callback) => {
        if (topic === "chat:global") globalChatCallback = callback;
        if (topic === "chat:squad") squadChatCallback = callback;
        if (topic === "squad:events") squadEventsCallback = callback;
        if (topic === "faction:campaign") factionCampaignCallback = callback;
      }),
    };

    mockInstances = new Map();

    mockWss = {
      clients: new Set(),
    };

    mockSquadManager = {
      getSquadId: vi.fn(),
      squads: new Map(),
      playerToSquad: new Map(),
      getSquadForPlayer: vi.fn(),
    };

    options = {
      pubsub: mockPubsub,
      instances: mockInstances,
      wss: mockWss,
      squadManager: mockSquadManager,
    };
  });

  describe("Error Handling & Robustness on Malformed Payloads", () => {
    test("chat:global should fail or handle when room client list is modified concurrently", async () => {
      await registerPubSubSubscriptions(options);

      const mockClient = {
        send: vi.fn().mockImplementation(() => {
          // Simulate dynamic modification during iteration
          mockWss.clients.clear();
        }),
      };

      const room = {
        clients: new Map([["ws1", mockClient]]),
      };
      mockInstances.set("room1", room);

      // Execute global chat message
      expect(() => {
        globalChatCallback({ text: "Hello" });
      }).not.toThrow();
    });

    test("chat:global with circular payload should throw during JSON serialization", async () => {
      await registerPubSubSubscriptions(options);

      const mockClient = {
        send(data) {
          JSON.stringify(data);
        },
      };

      const room = {
        clients: new Map([["ws1", mockClient]]),
      };
      mockInstances.set("room1", room);

      const circular = {};
      circular.self = circular;

      expect(() => {
        globalChatCallback(circular);
      }).toThrow();
    });

    test("chat:squad should handle missing properties or null payload without crashing the event loop (or identify if it throws)", async () => {
      await registerPubSubSubscriptions(options);

      // Null payload test
      expect(() => {
        squadChatCallback(null);
      }).toThrow(); // Expect it to throw as it tries to access payload.squadId

      // Undefined payload test
      expect(() => {
        squadChatCallback(undefined);
      }).toThrow();
    });

    test("squad:events with null payload should throw", async () => {
      await registerPubSubSubscriptions(options);

      expect(() => {
        squadEventsCallback(null);
      }).toThrow();
    });

    test("squad:events update with missing memberIds should throw", async () => {
      await registerPubSubSubscriptions(options);

      expect(() => {
        squadEventsCallback({
          type: "squad_update",
          squadId: "squad-1",
          leaderId: "leader-1",
          // memberIds is missing
        });
      }).toThrow();
    });
  });

  describe("Rapid client connect/disconnect and concurrency stress", () => {
    test("should handle rapid client connect/disconnect safely during squad updates", async () => {
      await registerPubSubSubscriptions(options);

      // Simulate 100 clients joining and leaving
      const memberIds = [];
      for (let i = 0; i < 50; i++) {
        const id = `player-${i}`;
        memberIds.push(id);
        const clientObj = {
          id,
          nickname: `Pilot-${i}`,
          send: vi.fn(),
          sendStats: vi.fn(),
        };
        mockWss.clients.add({ clientObj });
      }

      // Initial squad update (create squad)
      squadEventsCallback({
        type: "squad_update",
        squadId: "squad-stress",
        leaderId: "player-0",
        memberIds: [...memberIds],
      });

      // Assert squad is stored
      expect(mockSquadManager.squads.has("squad-stress")).toBe(true);

      // Rapidly disconnect half of the clients
      const clientsArray = Array.from(mockWss.clients);
      for (let i = 0; i < 25; i++) {
        mockWss.clients.delete(clientsArray[i]);
        memberIds.splice(memberIds.indexOf(clientsArray[i].clientObj.id), 1);
      }

      // Trigger squad update for remaining members
      expect(() => {
        squadEventsCallback({
          type: "squad_update",
          squadId: "squad-stress",
          leaderId: "player-25",
          memberIds: [...memberIds],
        });
      }).not.toThrow();
    });

    test("should verify playerToSquad mapping bug when player switches squads and updates arrive out of sync", async () => {
      await registerPubSubSubscriptions(options);

      // Setup Squad A with Player X
      const squadA = new Squad("squad-A", "leader-A");
      squadA.memberIds = new Set(["leader-A", "player-X"]);
      mockSquadManager.squads.set("squad-A", squadA);
      mockSquadManager.playerToSquad.set("leader-A", "squad-A");
      mockSquadManager.playerToSquad.set("player-X", "squad-A");

      // Setup Squad B without Player X initially
      const squadB = new Squad("squad-B", "leader-B");
      squadB.memberIds = new Set(["leader-B"]);
      mockSquadManager.squads.set("squad-B", squadB);
      mockSquadManager.playerToSquad.set("leader-B", "squad-B");

      // Step 1: Player X joins Squad B, B updates first
      squadEventsCallback({
        type: "squad_update",
        squadId: "squad-B",
        leaderId: "leader-B",
        memberIds: ["leader-B", "player-X"],
      });

      // Assert X is now mapped to Squad B
      expect(mockSquadManager.playerToSquad.get("player-X")).toBe("squad-B");

      // Step 2: Squad A updates (removing Player X)
      squadEventsCallback({
        type: "squad_update",
        squadId: "squad-A",
        leaderId: "leader-A",
        memberIds: ["leader-A"],
      });

      // Assert Player X mapping is now broken (bug: deleted because Squad A update wiped it)
      const mappedSquad = mockSquadManager.playerToSquad.get("player-X");
      console.log(
        `[BUG DETECTED] player-X squad mapping after Squad A update: ${mappedSquad}`,
      );
      expect(mappedSquad).toBeUndefined(); // Verify it gets deleted due to the out-of-sync update bug
    });
  });

  describe("Faction campaign pubsub updates under load", () => {
    test("should handle rapid faction campaign state changes without corruption", async () => {
      await registerPubSubSubscriptions(options);

      const mockCampaign = {
        load: vi.fn(),
      };
      const room = {
        factionWarCampaign: mockCampaign,
        broadcast: vi.fn(),
      };
      mockInstances.set("public", room);

      // Fire 500 campaign sync updates
      for (let i = 0; i < 500; i++) {
        factionCampaignCallback({
          roomId: "public",
          campaignState: { ticks: i },
        });
      }

      expect(mockCampaign.load).toHaveBeenCalledTimes(500);
      expect(room.broadcast).toHaveBeenCalledTimes(500);
    });
  });
});
