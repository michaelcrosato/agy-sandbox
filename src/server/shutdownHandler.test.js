import { jest } from "@jest/globals";

// Define mocks before importing the target module
const mockStopPeriodicIntervals = jest.fn();
jest.unstable_mockModule("./periodicIntervals.js", () => ({
  stopPeriodicIntervals: mockStopPeriodicIntervals,
}));

const mockAssignShard = jest.fn(() => 0);
jest.unstable_mockModule("../net/roomRouter.js", () => ({
  assignShard: mockAssignShard,
}));

// Dynamically import the handler
const { createShutdownHandler } = await import("./shutdownHandler.js");

describe("shutdownHandler", () => {
  let options;
  let exitProcessMock;
  let wssMock;
  let serverMock;
  let persistenceManagerMock;
  let configWatcherMock;
  let activeTunnelMock;
  let clientsMock;
  let instancesMock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    exitProcessMock = jest.fn();
    wssMock = {
      close: jest.fn((cb) => cb()),
    };
    serverMock = {
      close: jest.fn((cb) => cb()),
    };
    persistenceManagerMock = {
      stopAutosave: jest.fn(),
      saveGalaxy: jest.fn(),
      saveAllGalaxies: jest.fn().mockResolvedValue(2),
      savePlayer: jest.fn().mockResolvedValue(true),
    };
    configWatcherMock = {
      stop: jest.fn(),
    };
    activeTunnelMock = {
      close: jest.fn(),
    };
    clientsMock = new Map([
      [
        "socket-1",
        {
          id: "p1",
          ship: {},
          roomId: "room-1",
        },
      ],
    ]);
    instancesMock = new Map([
      [
        "room-1",
        {
          clients: new Map([
            [
              "client-1",
              {
                send: jest.fn(),
                ws: { close: jest.fn() },
              },
            ],
          ]),
        },
      ],
    ]);

    options = {
      latencyMonitor: { stop: jest.fn() },
      sandboxTelemetry: { stop: jest.fn() },
      memoryLeakSentry: { stop: jest.fn() },
      resourceLimiter: { stop: jest.fn() },
      getConfigWatcher: () => configWatcherMock,
      physicsInterval: 123,
      getPeriodicIntervalHandles: () => ({ handle: 456 }),
      loadRegistry: jest.fn().mockResolvedValue({
        transfer: jest.fn(),
      }),
      saveRegistry: jest.fn(),
      instances: instancesMock,
      persistenceManager: persistenceManagerMock,
      clients: clientsMock,
      getActiveTunnel: () => activeTunnelMock,
      wss: wssMock,
      server: serverMock,
      workers: 1,
      shardIndex: 0,
      exitProcess: exitProcessMock,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("runs correct sequence of stops, interval clears, persists, and triggers server closes and exit 0", async () => {
    const handler = createShutdownHandler(options);

    await handler();

    // Telemetry stops
    expect(options.latencyMonitor.stop).toHaveBeenCalled();
    expect(options.sandboxTelemetry.stop).toHaveBeenCalled();
    expect(options.memoryLeakSentry.stop).toHaveBeenCalled();
    expect(options.resourceLimiter.stop).toHaveBeenCalled();

    // Config watcher stop
    expect(configWatcherMock.stop).toHaveBeenCalled();

    // Stops periodic intervals
    expect(mockStopPeriodicIntervals).toHaveBeenCalledWith({ handle: 456 });

    // Autosaver and persistence saves
    expect(persistenceManagerMock.stopAutosave).toHaveBeenCalled();
    expect(persistenceManagerMock.saveAllGalaxies).toHaveBeenCalled();
    expect(persistenceManagerMock.savePlayer).toHaveBeenCalledWith(
      "p1",
      expect.any(Object),
      "room-1",
    );

    // Active tunnel close
    expect(activeTunnelMock.close).toHaveBeenCalled();

    // WSS and HTTP server closes
    expect(wssMock.close).toHaveBeenCalled();
    expect(serverMock.close).toHaveBeenCalled();

    // Process exits
    expect(exitProcessMock).toHaveBeenCalledWith(0);
  });

  test("runs graceful multi-worker drain and transfers rooms on restart", async () => {
    options.workers = 2; // trigger drain logic
    const registryMock = {
      transfer: jest.fn(),
    };
    options.loadRegistry.mockResolvedValue(registryMock);

    const handler = createShutdownHandler(options);
    await handler();

    expect(options.loadRegistry).toHaveBeenCalled();
    expect(registryMock.transfer).toHaveBeenCalledWith(
      "room-1",
      "node-0",
      "node-1", // target returned from mockAssignShard
      expect.any(Number),
    );
    expect(options.saveRegistry).toHaveBeenCalledWith(registryMock);

    // Client reconnection notice sent
    const targetClient = roomMockClient();
    expect(targetClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reconnect",
      }),
    );
  });

  test("triggers fallback exit 1 if server close timeouts exceed force exit threshold", async () => {
    wssMock.close = jest.fn(); // hang WebSocket server close callback

    const handler = createShutdownHandler(options);
    await handler();

    // WebSocket server close called but hasn't responded yet
    expect(wssMock.close).toHaveBeenCalled();
    expect(exitProcessMock).not.toHaveBeenCalled();

    // Advance fake timers by 2 seconds
    jest.advanceTimersByTime(2000);

    expect(exitProcessMock).toHaveBeenCalledWith(1);
  });

  function roomMockClient() {
    return instancesMock.get("room-1").clients.get("client-1");
  }
});
