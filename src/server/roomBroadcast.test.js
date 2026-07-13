import { jest } from "@jest/globals";
import { broadcastRoomState } from "./roomBroadcast.js";

describe("roomBroadcast", () => {
  let room;
  let client1;
  let client2;
  let squadManagerMock;
  let latencyMonitorMock;
  let metricsMock;

  beforeEach(() => {
    client1 = {
      id: "player-1",
      ws: {
        readyState: 1, // OPEN
        OPEN: 1,
        bufferedAmount: 0,
        send: jest.fn(),
        terminate: jest.fn(),
      },
      ship: {
        id: "player-1",
        position: { x: 0, y: 0 },
      },
      broadcastState: null,
      needsKeyframe: false,
    };

    client2 = {
      id: "player-2",
      ws: {
        readyState: 1, // OPEN
        OPEN: 1,
        bufferedAmount: 0,
        send: jest.fn(),
        terminate: jest.fn(),
      },
      ship: {
        id: "player-2",
        position: { x: 5000, y: 5000 },
      },
      broadcastState: null,
      needsKeyframe: false,
    };

    room = {
      id: "room-1",
      needsKeyframe: false,
      clients: new Map([
        ["player-1", client1],
        ["player-2", client2],
      ]),
      serializeEntities: jest.fn().mockReturnValue([
        { id: "player-1", type: "ship", x: 0, y: 0, position: { x: 0, y: 0 } },
        {
          id: "player-2",
          type: "ship",
          x: 5000,
          y: 5000,
          position: { x: 5000, y: 5000 },
        },
        {
          id: "asteroid-1",
          // Real asteroids are typed "generic"/"gem_asteroid", not "asteroid".
          type: "gem_asteroid",
          x: 100,
          y: 100,
          position: { x: 100, y: 100 },
        },
        {
          id: "projectile-1",
          type: "projectile",
          x: 200,
          y: 200,
          position: { x: 200, y: 200 },
        },
      ]),
    };

    squadManagerMock = {
      getSquadForPlayer: jest.fn().mockReturnValue(null),
    };

    latencyMonitorMock = {
      shouldShed: jest.fn().mockReturnValue(false),
    };

    metricsMock = {
      inc: jest.fn(),
    };
  });

  test("broadcasts to active open sockets", () => {
    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: false,
      interestRadius: 3000,
      binaryProtocol: false,
    });

    expect(client1.ws.send).toHaveBeenCalled();
    expect(client2.ws.send).toHaveBeenCalled();
    expect(client1.broadcastState).not.toBeNull();
    expect(metricsMock.inc).toHaveBeenCalledWith(
      "broadcast_bytes",
      expect.any(Number),
    );
  });

  test("applies Area-of-Interest (AOI) filtering when interestEnabled is true", () => {
    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: true,
      interestRadius: 500,
      binaryProtocol: false,
    });

    // client1 is at (0,0) and interestRadius is 500.
    // client2 is at (5000,5000) and should be filtered out from client1's view.
    expect(client1.ws.send).toHaveBeenCalled();
    const sentData1 = JSON.parse(client1.ws.send.mock.calls[0][0]);
    const sentEntities1 = sentData1.entities || {};
    expect(sentEntities1["player-2"]).toBeUndefined();

    // client2 is at (5000,5000) and should not see client1 or asteroid-1
    expect(client2.ws.send).toHaveBeenCalled();
    const sentData2 = JSON.parse(client2.ws.send.mock.calls[0][0]);
    const sentEntities2 = sentData2.entities || {};
    expect(sentEntities2["player-1"]).toBeUndefined();
    expect(sentEntities2["asteroid-1"]).toBeUndefined();
  });

  test("includes squadmates in client visible entity list", () => {
    // Put player-1 and player-2 in the same squad
    squadManagerMock.getSquadForPlayer.mockReturnValue({
      memberIds: ["player-1", "player-2"],
    });

    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: true,
      interestRadius: 500,
      binaryProtocol: false,
    });

    // Even though player-2 is at (5000,5000), it should be visible to player-1 because they are squadmates
    const sentData1 = JSON.parse(client1.ws.send.mock.calls[0][0]);
    const sentEntities1 = sentData1.entities || {};
    expect(sentEntities1["player-2"]).toBeDefined();
  });

  test("sheds optional entities under high latency", () => {
    latencyMonitorMock.shouldShed.mockImplementation(
      (type) => type === "optional",
    );

    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: false,
      interestRadius: 3000,
      binaryProtocol: false,
    });

    // Asteroids (generic/gem_asteroid) and projectiles should be filtered out
    const sentData1 = JSON.parse(client1.ws.send.mock.calls[0][0]);
    const sentEntities1 = Object.values(sentData1.entities || {});
    const hasAsteroid = sentEntities1.some(
      (e) => e.type === "generic" || e.type === "gem_asteroid",
    );
    const hasProjectile = sentEntities1.some((e) => e.type === "projectile");
    expect(hasAsteroid).toBe(false);
    expect(hasProjectile).toBe(false);
    // Ships remain visible.
    expect(sentEntities1.some((e) => e.type === "ship")).toBe(true);
  });

  test("terminates connections for slow clients (backpressure drop)", () => {
    // Mock highly backed-up socket
    client1.ws.bufferedAmount = 5 * 1024 * 1024; // 5 MB

    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: false,
      interestRadius: 3000,
      binaryProtocol: false,
    });

    expect(client1.ws.terminate).toHaveBeenCalled();
    expect(metricsMock.inc).toHaveBeenCalledWith("slow_client_drops");
  });

  test("skips broadcast but does not terminate on moderate backpressure", () => {
    // Mock moderate backed-up socket (triggering skip decision on delta frames)
    // We seed a broadcastState so nextFrame calculates a state_delta instead of state_snapshot
    client1.broadcastState = {
      snapshot: { entities: {} },
      seq: 1,
      ticksSinceKeyframe: 0,
    };
    client1.ws.bufferedAmount = 1.5 * 1024 * 1024; // 1.5 MB (above softLimit of 1 MB, below hardLimit of 4 MB)

    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: false,
      interestRadius: 3000,
      binaryProtocol: false,
    });

    expect(client1.ws.send).not.toHaveBeenCalled();
    expect(client1.ws.terminate).not.toHaveBeenCalled();
    expect(client1.broadcastState.seq).toBe(1); // baseline should not advance
  });

  test("serializes as binary if binaryProtocol is true", () => {
    broadcastRoomState(room, {
      squadManager: squadManagerMock,
      latencyMonitor: latencyMonitorMock,
      metrics: metricsMock,
      interestEnabled: false,
      interestRadius: 3000,
      binaryProtocol: true,
    });

    expect(client1.ws.send).toHaveBeenCalled();
    const payload = client1.ws.send.mock.calls[0][0];
    expect(payload).toBeInstanceOf(Uint8Array);
  });
});
