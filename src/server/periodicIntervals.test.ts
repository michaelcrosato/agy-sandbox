import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Define mocks before importing the target module
const mockRunEconomyShortage = vi.fn();
const mockRunEnvironmentalSiege = vi.fn();
const mockRunEconomyNormalization = vi.fn();
const mockRunGalaxyHeartbeat = vi.fn();

vi.doMock("./galaxyTicker.js", () => ({
  runEconomyShortageInterval: mockRunEconomyShortage,
  runEnvironmentalSiegeInterval: mockRunEnvironmentalSiege,
  runEconomyNormalizationInterval: mockRunEconomyNormalization,
  runGalaxyHeartbeatInterval: mockRunGalaxyHeartbeat,
}));

const mockRunGcSweep = vi.fn();
vi.doMock("./roomGc.js", () => ({
  runGcSweep: mockRunGcSweep,
}));

const mockBroadcastLobbySync = vi.fn();
vi.doMock("./lobbySync.js", () => ({
  broadcastLobbySync: mockBroadcastLobbySync,
}));

const mockStartRegistryHeartbeat = vi.fn(() => setInterval(() => {}, 4000));
vi.doMock("./registryHeartbeat.js", () => ({
  startRegistryHeartbeat: mockStartRegistryHeartbeat,
}));

const mockSelectDeadSockets = vi.fn(() => []);
vi.doMock("../net/heartbeat.js", () => ({
  selectDeadSockets: mockSelectDeadSockets,
  DEFAULT_HEARTBEAT_MS: 30000,
}));

// Dynamically import periodicIntervals
const { startPeriodicIntervals, stopPeriodicIntervals } =
  await import("./periodicIntervals.js");

describe("periodicIntervals", () => {
  let options;
  let instances;
  let pubsub;
  let wss;
  let clients;
  let metrics;
  let latencyMonitor;
  let anomalyDetector;
  let connectionFloodSentry;
  let resourceLimiter;
  let loadRegistry;
  let saveRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    instances = new Map();
    pubsub = {
      publish: vi.fn(),
    };
    wss = {
      clients: new Set(),
    };
    clients = new Map();
    metrics = {
      inc: vi.fn(),
    };
    latencyMonitor = {
      getLatency: vi.fn().mockReturnValue(5),
      shouldShed: vi.fn().mockReturnValue(false),
    };
    anomalyDetector = {
      observe: vi.fn(),
    };
    connectionFloodSentry = {};
    resourceLimiter = {};
    loadRegistry = vi.fn();
    saveRegistry = vi.fn();

    options = {
      instances,
      pubsub,
      wss,
      clients,
      metrics,
      latencyMonitor,
      anomalyDetector,
      connectionFloodSentry,
      resourceLimiter,
      loadRegistry,
      saveRegistry,
      shardIndex: 0,
      workers: 1,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts all expected intervals and calls correct tick functions", () => {
    const handles = startPeriodicIntervals(options);

    expect(handles.anomalyInterval).toBeDefined();
    expect(handles.economyShortageInterval).toBeDefined();
    expect(handles.environmentalSiegeInterval).toBeDefined();
    expect(handles.economyNormalizationInterval).toBeDefined();
    expect(handles.galaxyHeartbeatInterval).toBeDefined();
    expect(handles.gcInterval).toBeDefined();
    expect(handles.lobbySyncInterval).toBeDefined();
    expect(handles.heartbeatInterval).toBeDefined();
    expect(handles.registryHeartbeatInterval).toBeUndefined(); // workers count = 1

    // Advance 1s -> anomaly
    vi.advanceTimersByTime(1000);
    expect(anomalyDetector.observe).toHaveBeenCalled();

    // Advance to 5s -> lobby sync
    vi.advanceTimersByTime(4000);
    expect(mockBroadcastLobbySync).toHaveBeenCalled();

    // Advance to 6s -> economy normalization
    vi.advanceTimersByTime(1000);
    expect(mockRunEconomyNormalization).toHaveBeenCalledWith(instances);

    // Advance to 8s -> galaxy heartbeat
    vi.advanceTimersByTime(2000);
    expect(mockRunGalaxyHeartbeat).toHaveBeenCalledWith(instances);

    // Advance to 10s -> gc sweep
    vi.advanceTimersByTime(2000);
    expect(mockRunGcSweep).toHaveBeenCalled();

    // Advance to 30s -> heartbeat
    vi.advanceTimersByTime(20000);
    expect(mockSelectDeadSockets).toHaveBeenCalled();

    // Advance to 45s -> economy shortage
    vi.advanceTimersByTime(15000);
    expect(mockRunEconomyShortage).toHaveBeenCalledWith(instances);

    // Advance to 90s -> environmental siege
    vi.advanceTimersByTime(45000);
    expect(mockRunEnvironmentalSiege).toHaveBeenCalledWith(instances);

    stopPeriodicIntervals(handles);
  });

  test("starts registry heartbeat when workers > 1", () => {
    options.workers = 2;
    const handles = startPeriodicIntervals(options);
    expect(handles.registryHeartbeatInterval).toBeDefined();
    expect(mockStartRegistryHeartbeat).toHaveBeenCalled();
    stopPeriodicIntervals(handles);
  });

  test("gracefully catches errors inside intervals and doesn't crash", () => {
    mockRunEconomyShortage.mockImplementationOnce(() => {
      throw new Error("Economy error");
    });
    mockSelectDeadSockets.mockImplementationOnce(() => {
      throw new Error("Heartbeat error");
    });

    const handles = startPeriodicIntervals(options);

    // Trigger economy shortage (45s) and heartbeat (30s)
    expect(() => {
      vi.advanceTimersByTime(45000);
    }).not.toThrow();

    stopPeriodicIntervals(handles);
  });

  test("stopPeriodicIntervals clears all running timers", () => {
    const handles = startPeriodicIntervals(options);
    stopPeriodicIntervals(handles);

    // Clear mocks to ensure no calls are made after stop
    vi.clearAllMocks();

    // Advance time by 100s
    vi.advanceTimersByTime(100000);

    expect(anomalyDetector.observe).not.toHaveBeenCalled();
    expect(mockBroadcastLobbySync).not.toHaveBeenCalled();
    expect(mockRunEconomyNormalization).not.toHaveBeenCalled();
    expect(mockRunGalaxyHeartbeat).not.toHaveBeenCalled();
    expect(mockRunGcSweep).not.toHaveBeenCalled();
    expect(mockSelectDeadSockets).not.toHaveBeenCalled();
    expect(mockRunEconomyShortage).not.toHaveBeenCalled();
    expect(mockRunEnvironmentalSiege).not.toHaveBeenCalled();
  });
});
