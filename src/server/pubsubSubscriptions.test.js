import { jest } from "@jest/globals";
import { registerPubSubSubscriptions } from "./pubsubSubscriptions.js";
import { Squad } from "./SquadManager.js";

describe("pubsubSubscriptions", () => {
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
      subscribe: jest.fn().mockImplementation(async (topic, callback) => {
        if (topic === "chat:global") globalChatCallback = callback;
        if (topic === "chat:squad") squadChatCallback = callback;
        if (topic === "squad:events") squadEventsCallback = callback;
        if (topic === "faction:campaign") factionCampaignCallback = callback;
      }),
    };

    mockInstances = {
      values: jest.fn().mockReturnValue([]),
      get: jest.fn(),
    };

    mockWss = {
      clients: new Set(),
    };

    mockSquadManager = {
      getSquadId: jest.fn(),
      squads: new Map(),
      playerToSquad: new Map(),
    };

    options = {
      pubsub: mockPubsub,
      instances: mockInstances,
      wss: mockWss,
      squadManager: mockSquadManager,
    };
  });

  test("should subscribe to all four channels", async () => {
    await registerPubSubSubscriptions(options);

    expect(mockPubsub.subscribe).toHaveBeenCalledWith(
      "chat:global",
      expect.any(Function),
    );
    expect(mockPubsub.subscribe).toHaveBeenCalledWith(
      "chat:squad",
      expect.any(Function),
    );
    expect(mockPubsub.subscribe).toHaveBeenCalledWith(
      "squad:events",
      expect.any(Function),
    );
    expect(mockPubsub.subscribe).toHaveBeenCalledWith(
      "faction:campaign",
      expect.any(Function),
    );
  });

  describe("chat:global", () => {
    test("should broadcast chat message to all clients in all active rooms", async () => {
      await registerPubSubSubscriptions(options);

      const client1 = { send: jest.fn() };
      const client2 = { send: jest.fn() };

      const room1 = { clients: new Map([["ws1", client1]]) };
      const room2 = { clients: new Map([["ws2", client2]]) };
      mockInstances.values.mockReturnValue([room1, room2]);

      const payload = {
        type: "chat",
        sender: "System",
        text: "Global announcement",
      };
      globalChatCallback(payload);

      expect(client1.send).toHaveBeenCalledWith(payload);
      expect(client2.send).toHaveBeenCalledWith(payload);
    });
  });

  describe("chat:squad", () => {
    test("should send squad chat only to connected local squad members", async () => {
      await registerPubSubSubscriptions(options);

      const client1 = { id: "p1", send: jest.fn() };
      const client2 = { id: "p2", send: jest.fn() };

      mockWss.clients.add({ clientObj: client1 });
      mockWss.clients.add({ clientObj: client2 });

      mockSquadManager.getSquadId.mockImplementation((id) => {
        if (id === "p1") return "sq-A";
        return "sq-B";
      });

      const payload = { squadId: "sq-A", type: "chat", text: "Squad plan" };
      squadChatCallback(payload);

      expect(client1.send).toHaveBeenCalledWith(payload);
      expect(client2.send).not.toHaveBeenCalled();
    });
  });

  describe("squad:events invite", () => {
    test("should route squad invite to target player by ID or target player by nickname", async () => {
      await registerPubSubSubscriptions(options);

      const clientTargetId = { id: "target-id", send: jest.fn() };
      const clientTargetNick = {
        id: "other-id",
        nickname: "NickTarget",
        send: jest.fn(),
      };

      mockWss.clients.add({ clientObj: clientTargetId });
      mockWss.clients.add({ clientObj: clientTargetNick });

      squadEventsCallback({
        type: "squad_invite",
        targetId: "target-id",
        senderId: "sender-123",
        senderNickname: "SenderGuy",
        squadId: "squad-A",
      });

      squadEventsCallback({
        type: "squad_invite",
        targetNickname: "NickTarget",
        senderId: "sender-123",
        senderNickname: "SenderGuy",
        squadId: "squad-A",
      });

      const expectedPayload = {
        type: "squad_invite_received",
        senderId: "sender-123",
        senderNickname: "SenderGuy",
        squadId: "squad-A",
      };

      expect(clientTargetId.send).toHaveBeenCalledWith(expectedPayload);
      expect(clientTargetNick.send).toHaveBeenCalledWith(expectedPayload);
    });
  });

  describe("squad:events update", () => {
    test("should dissolve squad and alert remaining local members if member list is empty", async () => {
      await registerPubSubSubscriptions(options);

      const client1 = { id: "p1", send: jest.fn(), sendStats: jest.fn() };
      mockWss.clients.add({ clientObj: client1 });

      const squadMock = { memberIds: new Set(["p1"]) };
      mockSquadManager.squads.set("sq-A", squadMock);
      mockSquadManager.playerToSquad.set("p1", "sq-A");

      squadEventsCallback({
        type: "squad_update",
        squadId: "sq-A",
        leaderId: "p1",
        memberIds: [],
      });

      expect(mockSquadManager.squads.has("sq-A")).toBe(false);
      expect(mockSquadManager.playerToSquad.has("p1")).toBe(false);
      expect(client1.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Your squad has been dissolved.",
        style: "info",
      });
      expect(client1.sendStats).toHaveBeenCalled();
    });

    test("should create a new Squad and register local mappings if squad does not exist", async () => {
      await registerPubSubSubscriptions(options);

      squadEventsCallback({
        type: "squad_update",
        squadId: "sq-new",
        leaderId: "p1",
        memberIds: ["p1", "p2"],
      });

      const createdSquad = mockSquadManager.squads.get("sq-new");
      expect(createdSquad).toBeInstanceOf(Squad);
      expect(createdSquad.leaderId).toBe("p1");
      expect(createdSquad.memberIds).toEqual(new Set(["p1", "p2"]));
      expect(mockSquadManager.playerToSquad.get("p1")).toBe("sq-new");
      expect(mockSquadManager.playerToSquad.get("p2")).toBe("sq-new");
    });

    test("should notify wingmen and trigger stats update when player joins/leaves a squad", async () => {
      await registerPubSubSubscriptions(options);

      const client1 = {
        id: "p1",
        nickname: "Leader",
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      const client2 = {
        id: "p2",
        nickname: "Wingman",
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      mockWss.clients.add({ clientObj: client1 });
      mockWss.clients.add({ clientObj: client2 });

      // Existing squad with p1
      const squadMock = new Squad("sq-A", "p1");
      squadMock.memberIds = new Set(["p1"]);
      mockSquadManager.squads.set("sq-A", squadMock);
      mockSquadManager.playerToSquad.set("p1", "sq-A");

      // Join event: p2 joins p1
      squadEventsCallback({
        type: "squad_update",
        squadId: "sq-A",
        leaderId: "p1",
        memberIds: ["p1", "p2"],
      });

      // Leader should get notification that Wingman joined
      expect(client1.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Wingman joined the squad!",
        style: "success",
      });
      expect(client1.sendStats).toHaveBeenCalled();

      // Now Wingman leaves squad (memberIds back to ["p1"])
      squadEventsCallback({
        type: "squad_update",
        squadId: "sq-A",
        leaderId: "p1",
        memberIds: ["p1"],
      });

      // Leader should get left notification
      expect(client1.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Wingman left the squad.",
        style: "info",
      });
    });
  });

  describe("faction:campaign", () => {
    test("should load faction campaign state and broadcast to sector clients", async () => {
      await registerPubSubSubscriptions(options);

      const mockWarCampaign = { load: jest.fn() };
      const mockRoom = {
        factionWarCampaign: mockWarCampaign,
        broadcast: jest.fn(),
      };
      mockInstances.get.mockReturnValueOnce(mockRoom);

      factionCampaignCallback({
        roomId: "sector-alpha",
        campaignState: { progress: 0.75 },
      });

      expect(mockInstances.get).toHaveBeenCalledWith("sector-alpha");
      expect(mockWarCampaign.load).toHaveBeenCalledWith({ progress: 0.75 });
      expect(mockRoom.broadcast).toHaveBeenCalledWith({
        type: "faction_campaign_sync",
        campaign: { progress: 0.75 },
      });
    });
  });

  describe("adversarial edge cases", () => {
    test("should send squad chat to players not in squad if payload squadId is null", async () => {
      await registerPubSubSubscriptions(options);

      const clientNotInSquad = { id: "p-no-squad", send: jest.fn() };
      mockWss.clients.add({ clientObj: clientNotInSquad });
      mockSquadManager.getSquadId.mockReturnValue(null);

      const payload = { squadId: null, type: "chat", text: "Global leak" };
      squadChatCallback(payload);

      expect(clientNotInSquad.send).toHaveBeenCalledWith(payload);
    });

    test("should notify only the first joiner when multiple players join simultaneously", async () => {
      await registerPubSubSubscriptions(options);

      const leader = {
        id: "leader",
        nickname: "Leader",
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      const joiner1 = {
        id: "j1",
        nickname: "Joiner1",
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      const joiner2 = {
        id: "j2",
        nickname: "Joiner2",
        send: jest.fn(),
        sendStats: jest.fn(),
      };

      mockWss.clients.add({ clientObj: leader });
      mockWss.clients.add({ clientObj: joiner1 });
      mockWss.clients.add({ clientObj: joiner2 });

      const squadMock = new Squad("sq-A", "leader");
      squadMock.memberIds = new Set(["leader"]);
      mockSquadManager.squads.set("sq-A", squadMock);

      squadEventsCallback({
        type: "squad_update",
        squadId: "sq-A",
        leaderId: "leader",
        memberIds: ["leader", "j1", "j2"],
      });

      expect(leader.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Joiner1 joined the squad!",
        }),
      );
      expect(leader.send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Joiner2 joined the squad!",
        }),
      );
    });

    test("should bubble up client send errors on chat:global if c.send throws", async () => {
      await registerPubSubSubscriptions(options);

      const clientGood = { send: jest.fn() };
      const clientBad = {
        send: jest.fn().mockImplementation(() => {
          throw new Error("Connection failed");
        }),
      };

      const room = {
        clients: new Map([
          ["ws1", clientBad],
          ["ws2", clientGood],
        ]),
      };
      mockInstances.values.mockReturnValue([room]);

      const payload = { type: "chat", text: "Global message" };

      expect(() => {
        globalChatCallback(payload);
      }).toThrow("Connection failed");

      expect(clientGood.send).not.toHaveBeenCalled();
    });

    test("should handle rapid client connect/disconnect during iteration safely", async () => {
      await registerPubSubSubscriptions(options);

      const activeClients = new Set();
      mockWss.clients = activeClients;

      const ws1 = { clientObj: { id: "p1", send: jest.fn() } };
      const ws2 = { clientObj: { id: "p2", send: jest.fn() } };

      activeClients.add(ws1);
      activeClients.add(ws2);

      mockSquadManager.getSquadId.mockReturnValue("squad-1");

      ws1.clientObj.send.mockImplementation(() => {
        activeClients.delete(ws2);
        ws2.clientObj = null;
      });

      const payload = { squadId: "squad-1", type: "chat", text: "rapid test" };

      expect(() => {
        squadChatCallback(payload);
      }).not.toThrow();

      expect(ws1.clientObj.send).toHaveBeenCalled();
    });
  });
});
