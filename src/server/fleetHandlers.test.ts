import { describe, test, expect, beforeEach, vi } from "vitest";
import { handleFleetAction } from "./fleetHandlers.js";

describe("fleetHandlers", () => {
  let clientObj;
  let room;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      fleetName: null,
      send: vi.fn(),
    };
    room = {
      fleets: new Map(),
      leaveCurrentFleet: vi.fn(),
      broadcastFleetUpdate: vi.fn(),
      broadcastRosterUpdate: vi.fn(),
    };
  });

  test("does nothing if room is null/undefined", () => {
    handleFleetAction(
      clientObj,
      { type: "fleet_join", fleetName: "TEST" },
      null,
    );
    expect(clientObj.send).not.toHaveBeenCalled();
  });

  test("joins existing or new fleet", () => {
    handleFleetAction(
      clientObj,
      { type: "fleet_join", fleetName: "test-code" },
      room,
    );

    expect(room.leaveCurrentFleet).toHaveBeenCalledWith(clientObj);
    expect(clientObj.fleetName).toBe("TEST-CODE");
    expect(room.fleets.has("TEST-CODE")).toBe(true);
    expect(room.fleets.get("TEST-CODE").has(clientObj)).toBe(true);
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Joined fleet: TEST-CODE",
      style: "success",
    });
    expect(room.broadcastFleetUpdate).toHaveBeenCalledWith("TEST-CODE");
    expect(room.broadcastRosterUpdate).toHaveBeenCalled();
  });

  test("rejects invalid fleet names", () => {
    handleFleetAction(clientObj, { type: "fleet_create", fleetName: "" }, room);
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Invalid Fleet Code!",
      style: "error",
    });
    expect(room.leaveCurrentFleet).not.toHaveBeenCalled();
  });

  test("leaves fleet if in one", () => {
    clientObj.fleetName = "ALPHA";
    handleFleetAction(clientObj, { type: "fleet_leave" }, room);

    expect(room.leaveCurrentFleet).toHaveBeenCalledWith(clientObj);
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Left fleet: ALPHA",
      style: "info",
    });
    expect(room.broadcastRosterUpdate).toHaveBeenCalled();
  });

  test("does nothing on fleet_leave if not in fleet", () => {
    clientObj.fleetName = null;
    handleFleetAction(clientObj, { type: "fleet_leave" }, room);
    expect(room.leaveCurrentFleet).not.toHaveBeenCalled();
    expect(clientObj.send).not.toHaveBeenCalled();
  });
});
