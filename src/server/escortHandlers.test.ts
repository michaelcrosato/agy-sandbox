import { describe, test, expect, beforeEach, vi } from "vitest";

// Mock portHandlers before importing escortHandlers
vi.doMock("./portHandlers.js", () => ({
  handleEscortCommand: vi.fn(),
}));

const { handleEscortAction } = await import("./escortHandlers.js");
const { handleEscortCommand } = await import("./portHandlers.js");

describe("escortHandlers", () => {
  let clientObj;
  let room;

  beforeEach(() => {
    vi.clearAllMocks();
    clientObj = {
      id: "p1",
      ship: { id: "ship1" },
      send: vi.fn(),
    };
    room = {
      ais: [
        { role: "escort", flagship: clientObj.ship, formation: "orbit" },
        { role: "escort", flagship: { id: "other" }, formation: "orbit" },
        { role: "pirate", flagship: null, formation: "patrol" },
      ],
    };
  });

  test("does nothing if room is null", () => {
    handleEscortAction(clientObj, { type: "escort_command" }, null);
    expect(handleEscortCommand).not.toHaveBeenCalled();
  });

  test("delegates escort_command to handleEscortCommand", () => {
    const msg = { type: "escort_command", action: "attack" };
    handleEscortAction(clientObj, msg, room);

    expect(handleEscortCommand).toHaveBeenCalledWith(clientObj, msg, room);
  });

  test("updates formation for wingmen and sends notification", () => {
    const msg = { type: "escort_formation", formation: "delta" };
    handleEscortAction(clientObj, msg, room);

    expect(room.ais[0].formation).toBe("delta");
    expect(room.ais[1].formation).toBe("orbit"); // unaffected
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Wingmen ordered into [DELTA] formation (1 ships)",
      style: "success",
    });
  });

  test("defaults formation to orbit if unspecified", () => {
    room.ais[0].formation = "delta";
    handleEscortAction(clientObj, { type: "escort_formation" }, room);

    expect(room.ais[0].formation).toBe("orbit");
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Wingmen ordered into [ORBIT] formation (1 ships)",
      style: "success",
    });
  });
});
