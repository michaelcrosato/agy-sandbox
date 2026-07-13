import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  tickRegistryHeartbeat,
  startRegistryHeartbeat,
} from "./registryHeartbeat.js";

describe("registryHeartbeat", () => {
  let instances;
  let registryMock;
  let loadRegistry;
  let saveRegistry;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    instances = new Map([
      ["room-1", {}],
      ["room-2", {}],
    ]);

    registryMock = {
      reapExpired: vi.fn().mockReturnValue(0),
      claim: vi.fn().mockReturnValue(false),
    };

    loadRegistry = vi.fn().mockResolvedValue(registryMock);
    saveRegistry = vi.fn().mockResolvedValue();

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("renews claims for active rooms and saves registry when claims succeed", async () => {
    registryMock.claim.mockReturnValue(true);

    await tickRegistryHeartbeat({
      instances,
      nodeId: "node-1",
      loadRegistry,
      saveRegistry,
      now: 1000,
    });

    expect(loadRegistry).toHaveBeenCalled();
    expect(registryMock.reapExpired).toHaveBeenCalledWith(1000);
    expect(registryMock.claim).toHaveBeenCalledWith(
      "room-1",
      "node-1",
      11000,
      1000,
    );
    expect(registryMock.claim).toHaveBeenCalledWith(
      "room-2",
      "node-1",
      11000,
      1000,
    );
    expect(saveRegistry).toHaveBeenCalledWith(registryMock);
  });

  test("does not save registry if nothing changed and no rooms were reaped", async () => {
    registryMock.claim.mockReturnValue(false);
    registryMock.reapExpired.mockReturnValue(0);

    await tickRegistryHeartbeat({
      instances,
      nodeId: "node-1",
      loadRegistry,
      saveRegistry,
      now: 1000,
    });

    expect(saveRegistry).not.toHaveBeenCalled();
  });

  test("saves registry if rooms were reaped, even if no claims succeeded", async () => {
    registryMock.claim.mockReturnValue(false);
    registryMock.reapExpired.mockReturnValue(2);

    await tickRegistryHeartbeat({
      instances,
      nodeId: "node-1",
      loadRegistry,
      saveRegistry,
      now: 1000,
    });

    expect(saveRegistry).toHaveBeenCalledWith(registryMock);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("reaped 2 expired rooms"),
    );
  });

  test("handles loadRegistry returning null/undefined gracefully", async () => {
    loadRegistry.mockResolvedValue(null);

    await tickRegistryHeartbeat({
      instances,
      nodeId: "node-1",
      loadRegistry,
      saveRegistry,
      now: 1000,
    });

    expect(saveRegistry).not.toHaveBeenCalled();
  });

  test("handles registry tick errors gracefully without bubbling up", async () => {
    loadRegistry.mockRejectedValue(new Error("Registry read timeout"));

    await expect(
      tickRegistryHeartbeat({
        instances,
        nodeId: "node-1",
        loadRegistry,
        saveRegistry,
        now: 1000,
      }),
    ).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Registry read timeout"),
    );
  });

  test("startRegistryHeartbeat registers periodic intervals", async () => {
    const options = {
      instances,
      nodeId: "node-1",
      loadRegistry,
      saveRegistry,
      intervalMs: 2000,
    };

    const interval = startRegistryHeartbeat(options);
    expect(interval).toBeDefined();

    expect(loadRegistry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);

    // Jest runs macro-ticks. The async task executes on next micro-tick.
    // Allow micro-tasks to flush:
    await Promise.resolve();

    expect(loadRegistry).toHaveBeenCalled();
    clearInterval(interval);
  });
});
