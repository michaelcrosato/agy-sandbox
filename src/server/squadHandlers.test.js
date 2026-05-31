import { jest } from "@jest/globals";
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
      send: jest.fn(),
      sendStats: jest.fn(),
    };
    targetClient = {
      id: "p2",
      nickname: "Player2",
      send: jest.fn(),
      sendStats: jest.fn(),
    };
    wss = {
      clients: new Set([{ clientObj: clientObj }, { clientObj: targetClient }]),
    };
    squadManager = {
      getSquadForPlayer: jest.fn(),
      createSquad: jest.fn().mockReturnValue({ id: "squad1" }),
      joinSquad: jest.fn(),
      leaveSquad: jest.fn(),
      getSquadId: jest.fn(),
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
});
