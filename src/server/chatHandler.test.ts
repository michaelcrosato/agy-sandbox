import { describe, test, expect, beforeEach, vi } from "vitest";
import { handleChat } from "./chatHandler.js";

describe("chatHandler", () => {
  let clientObj;
  let room;
  let pubsub;
  let squadManager;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      nickname: "TestPlayer",
      fleetName: null,
      send: vi.fn(),
    };
    room = {
      fleets: new Map(),
    };
    pubsub = {
      publish: vi.fn().mockImplementation(() => Promise.resolve()),
    };
    squadManager = {
      getSquadForPlayer: vi.fn(),
    };
  });

  test("skips empty messages", async () => {
    await handleChat(
      clientObj,
      { type: "chat", text: "   " },
      room,
      pubsub,
      squadManager,
    );
    expect(pubsub.publish).not.toHaveBeenCalled();
  });

  test("publishes global chat", async () => {
    await handleChat(
      clientObj,
      { type: "chat", text: "hello world" },
      room,
      pubsub,
      squadManager,
    );
    expect(pubsub.publish).toHaveBeenCalledWith("chat:global", {
      type: "chat",
      channel: "global",
      sender: "TestPlayer",
      text: "hello world",
    });
  });

  test("publishes squad chat when in squad and channel is squad", async () => {
    squadManager.getSquadForPlayer.mockReturnValue({ id: "squad1" });
    await handleChat(
      clientObj,
      { type: "chat", channel: "squad", text: "hi squad" },
      room,
      pubsub,
      squadManager,
    );
    expect(pubsub.publish).toHaveBeenCalledWith("chat:squad", {
      type: "chat",
      channel: "squad",
      sender: "TestPlayer",
      text: "hi squad",
      squadId: "squad1",
    });
  });

  test("publishes squad chat when text starts with /squad", async () => {
    squadManager.getSquadForPlayer.mockReturnValue({ id: "squad2" });
    await handleChat(
      clientObj,
      { type: "chat", text: "/squad secret msg" },
      room,
      pubsub,
      squadManager,
    );
    expect(pubsub.publish).toHaveBeenCalledWith("chat:squad", {
      type: "chat",
      channel: "squad",
      sender: "TestPlayer",
      text: "secret msg",
      squadId: "squad2",
    });
  });

  test("sends error notification when trying to squad chat but not in squad", async () => {
    squadManager.getSquadForPlayer.mockReturnValue(null);
    await handleChat(
      clientObj,
      { type: "chat", channel: "squad", text: "hi" },
      room,
      pubsub,
      squadManager,
    );
    expect(pubsub.publish).not.toHaveBeenCalled();
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message:
        "You are not in a squad! Invite someone using /squad invite or join a squad.",
      style: "error",
    });
  });

  test("broadcasts to fleet when in fleet and channel is fleet", async () => {
    clientObj.fleetName = "myfleet";
    const otherClient = { send: vi.fn() };
    room.fleets.set("myfleet", new Set([clientObj, otherClient]));

    await handleChat(
      clientObj,
      { type: "chat", channel: "fleet", text: "fleet comms" },
      room,
      pubsub,
      squadManager,
    );

    expect(pubsub.publish).not.toHaveBeenCalled();
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "chat",
      channel: "fleet",
      sender: "TestPlayer",
      text: "fleet comms",
    });
    expect(otherClient.send).toHaveBeenCalledWith({
      type: "chat",
      channel: "fleet",
      sender: "TestPlayer",
      text: "fleet comms",
    });
  });

  test("sends error notification when trying to fleet chat but not in fleet", async () => {
    clientObj.fleetName = null;
    await handleChat(
      clientObj,
      { type: "chat", channel: "fleet", text: "fleet comms" },
      room,
      pubsub,
      squadManager,
    );
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "You are not in a fleet! Join a fleet to use Fleet comms.",
      style: "error",
    });
  });
});
