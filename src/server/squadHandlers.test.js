import { describe, test, expect, beforeEach, vi } from "vitest";
import { handleSquadAction } from "./squadHandlers.js";

describe("squadHandlers", () => {
  let clientObj;
  let targetClient;
  let wss;
  let squadManager;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      nickname: "Player1",
      send: vi.fn(),
      sendStats: vi.fn(),
    };
    targetClient = {
      id: "p2",
      nickname: "Player2",
      send: vi.fn(),
      sendStats: vi.fn(),
    };
    wss = {
      clients: new Set([{ clientObj: clientObj }, { clientObj: targetClient }]),
    };
    squadManager = {
      getSquadForPlayer: vi.fn(),
      createSquad: vi.fn().mockReturnValue({ id: "squad1" }),
      joinSquad: vi.fn(),
      leaveSquad: vi.fn(),
      getSquadId: vi.fn(),
    };
  });

  describe("squad_invite", () => {
    test("sends squad invite when target player is found by ID", () => {
      squadManager.getSquadForPlayer.mockReturnValue({ id: "squad1" });
      handleSquadAction(
        clientObj,
        { type: "squad_invite", targetId: "p2" },
        wss,
        squadManager,
      );

      expect(targetClient.send).toHaveBeenCalledWith({
        type: "squad_invite_received",
        senderId: "p1",
        senderNickname: "Player1",
        squadId: "squad1",
      });
      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Sent squad invite to Player2!",
        style: "success",
      });
    });

    test("creates a new squad if inviting player is not in one", () => {
      squadManager.getSquadForPlayer.mockReturnValue(null);
      handleSquadAction(
        clientObj,
        { type: "squad_invite", targetId: "p2" },
        wss,
        squadManager,
      );

      expect(squadManager.createSquad).toHaveBeenCalledWith("p1");
    });

    test("sends error notification when target player is not found", () => {
      handleSquadAction(
        clientObj,
        { type: "squad_invite", targetId: "p-unknown" },
        wss,
        squadManager,
      );

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Target player not found!",
        style: "error",
      });
    });
  });

  describe("squad_join", () => {
    test("joins squad successfully and notifies all squad members", () => {
      squadManager.joinSquad.mockReturnValue({ success: true });
      squadManager.getSquadForPlayer.mockReturnValue({
        id: "squad1",
        memberIds: new Set(["p1", "p2"]),
      });

      handleSquadAction(
        clientObj,
        { type: "squad_join", squadId: "squad1" },
        wss,
        squadManager,
      );

      expect(squadManager.joinSquad).toHaveBeenCalledWith("squad1", "p1");
      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Player1 joined the squad!",
        style: "success",
      });
      expect(clientObj.sendStats).toHaveBeenCalled();
      expect(targetClient.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Player1 joined the squad!",
        style: "success",
      });
      expect(targetClient.sendStats).toHaveBeenCalled();
    });

    test("sends error notification when joinSquad fails", () => {
      squadManager.joinSquad.mockReturnValue({
        success: false,
        reason: "Squad is full",
      });

      handleSquadAction(
        clientObj,
        { type: "squad_join", squadId: "squad1" },
        wss,
        squadManager,
      );

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Squad is full",
        style: "error",
      });
    });
  });

  describe("squad_leave", () => {
    test("leaves squad successfully and notifies remaining members", () => {
      squadManager.getSquadForPlayer.mockReturnValue({ id: "squad1" });
      squadManager.getSquadId.mockImplementation((id) =>
        id === "p2" ? "squad1" : null,
      );

      handleSquadAction(clientObj, { type: "squad_leave" }, wss, squadManager);

      expect(squadManager.leaveSquad).toHaveBeenCalledWith("p1");
      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "You left the squad.",
        style: "info",
      });
      expect(clientObj.sendStats).toHaveBeenCalled();
      expect(targetClient.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Player1 left the squad.",
        style: "info",
      });
      expect(targetClient.sendStats).toHaveBeenCalled();
    });

    test("does nothing if player is not in a squad", () => {
      squadManager.getSquadForPlayer.mockReturnValue(null);
      handleSquadAction(clientObj, { type: "squad_leave" }, wss, squadManager);

      expect(squadManager.leaveSquad).not.toHaveBeenCalled();
      expect(clientObj.send).not.toHaveBeenCalled();
    });
  });

  describe("squad scale-out distributed routing over pubsub", () => {
    let mockPubsub;

    beforeEach(() => {
      mockPubsub = {
        publish: vi.fn().mockResolvedValue(),
        subscribe: vi.fn().mockResolvedValue(),
        unsubscribe: vi.fn().mockResolvedValue(),
      };
    });

    test("publishes squad_invite event to pubsub when target is remote", () => {
      squadManager.getSquadForPlayer.mockReturnValue({
        id: "squad1",
        leaderId: "p1",
        memberIds: new Set(["p1"]),
      });

      handleSquadAction(
        clientObj,
        {
          type: "squad_invite",
          targetId: "remote-p",
          targetNickname: "RemotePilot",
        },
        // empty clients wss, representing remote player
        { clients: new Set([{ clientObj: clientObj }]) },
        squadManager,
        mockPubsub,
      );

      expect(mockPubsub.publish).toHaveBeenCalledWith("squad:events", {
        type: "squad_invite",
        senderId: "p1",
        senderNickname: "Player1",
        targetId: "remote-p",
        targetNickname: "RemotePilot",
        squadId: "squad1",
      });
      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Sent squad invite to RemotePilot!",
        style: "success",
      });
    });

    test("publishes squad_update event to pubsub upon squad creation inside invite flow", () => {
      squadManager.getSquadForPlayer.mockReturnValue(null);
      squadManager.createSquad.mockReturnValue({
        id: "new-squad-123",
        leaderId: "p1",
        memberIds: new Set(["p1"]),
      });

      handleSquadAction(
        clientObj,
        { type: "squad_invite", targetId: "p2" },
        wss,
        squadManager,
        mockPubsub,
      );

      expect(squadManager.createSquad).toHaveBeenCalledWith("p1");
      expect(mockPubsub.publish).toHaveBeenCalledWith("squad:events", {
        type: "squad_update",
        squadId: "new-squad-123",
        leaderId: "p1",
        memberIds: ["p1"],
      });
    });

    test("publishes squad_update event to pubsub when joining a squad", () => {
      squadManager.joinSquad.mockReturnValue({ success: true });
      squadManager.getSquadForPlayer.mockReturnValue({
        id: "squad1",
        leaderId: "p2",
        memberIds: new Set(["p1", "p2"]),
      });

      handleSquadAction(
        clientObj,
        { type: "squad_join", squadId: "squad1" },
        wss,
        squadManager,
        mockPubsub,
      );

      expect(mockPubsub.publish).toHaveBeenCalledWith("squad:events", {
        type: "squad_update",
        squadId: "squad1",
        leaderId: "p2",
        memberIds: ["p1", "p2"],
      });
    });

    test("publishes squad_update event to pubsub when leaving a squad", () => {
      squadManager.getSquadForPlayer.mockReturnValue({ id: "squad1" });
      squadManager.squads = new Map([
        [
          "squad1",
          {
            id: "squad1",
            leaderId: "p2",
            memberIds: new Set(["p2"]),
          },
        ],
      ]);

      handleSquadAction(
        clientObj,
        { type: "squad_leave" },
        wss,
        squadManager,
        mockPubsub,
      );

      expect(squadManager.leaveSquad).toHaveBeenCalledWith("p1");
      expect(mockPubsub.publish).toHaveBeenCalledWith("squad:events", {
        type: "squad_update",
        squadId: "squad1",
        leaderId: "p2",
        memberIds: ["p2"],
      });
    });
  });
});
