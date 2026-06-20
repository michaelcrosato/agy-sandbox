import { jest } from "@jest/globals";
import { RoomRegistry } from "../net/roomRouter.js";
import {
  loadRegistry,
  saveRegistry,
  REGISTRY_KEY,
} from "./roomRegistryStore.js";

describe("roomRegistryStore", () => {
  let mockStore;

  beforeEach(() => {
    mockStore = {
      load: jest.fn(),
      save: jest.fn(),
    };
  });

  describe("loadRegistry", () => {
    test("should load and parse room registry data successfully", async () => {
      const mockData = {
        "room-1": "node-0",
        "room-2": { nodeId: "node-1", expiresAt: 123456 },
      };
      mockStore.load.mockResolvedValue(mockData);

      const registry = await loadRegistry(mockStore);

      expect(mockStore.load).toHaveBeenCalledWith(REGISTRY_KEY);
      expect(registry).toBeInstanceOf(RoomRegistry);
      expect(registry.owner("room-1")).toBe("node-0");
      expect(registry.owner("room-2")).toBe("node-1");
    });

    test("should return empty RoomRegistry when loaded data is null/undefined", async () => {
      mockStore.load.mockResolvedValue(null);

      const registry = await loadRegistry(mockStore);

      expect(mockStore.load).toHaveBeenCalledWith(REGISTRY_KEY);
      expect(registry).toBeInstanceOf(RoomRegistry);
      expect(registry.owner("room-1")).toBeNull();
    });

    test("should handle load errors gracefully and return empty RoomRegistry", async () => {
      const consoleErrorMock = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockStore.load.mockRejectedValue(
        new Error("Database connection timeout"),
      );

      const registry = await loadRegistry(mockStore);

      expect(mockStore.load).toHaveBeenCalledWith(REGISTRY_KEY);
      expect(registry).toBeInstanceOf(RoomRegistry);
      expect(consoleErrorMock).toHaveBeenCalled();

      consoleErrorMock.mockRestore();
    });
  });

  describe("saveRegistry", () => {
    let registry;

    beforeEach(() => {
      registry = new RoomRegistry({
        "room-1": "node-0",
      });
    });

    test("should serialize and save room registry data successfully", async () => {
      mockStore.save.mockResolvedValue(true);

      await saveRegistry(mockStore, registry);

      expect(mockStore.save).toHaveBeenCalledWith(
        REGISTRY_KEY,
        expect.objectContaining({ "room-1": "node-0" }),
      );
    });

    test("should retry up to 5 times on transient failures before giving up", async () => {
      const consoleErrorMock = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      jest.useFakeTimers();

      mockStore.save
        .mockRejectedValueOnce(new Error("transient 1"))
        .mockRejectedValueOnce(new Error("transient 2"))
        .mockResolvedValueOnce(true);

      const savePromise = saveRegistry(mockStore, registry);

      // Flush microtasks and tick timers to advance retries
      await Promise.resolve();
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      await savePromise;

      expect(mockStore.save).toHaveBeenCalledTimes(3);
      expect(consoleErrorMock).not.toHaveBeenCalled();

      consoleErrorMock.mockRestore();
      jest.useRealTimers();
    });

    test("should log error and stop retrying after 5 failed attempts", async () => {
      const consoleErrorMock = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      jest.useFakeTimers();

      mockStore.save.mockRejectedValue(new Error("persistent failure"));

      const savePromise = saveRegistry(mockStore, registry);

      // Let all 5 attempts tick and resolve
      for (let i = 1; i <= 5; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(50 * i);
        await Promise.resolve();
        await Promise.resolve();
      }
      await savePromise;

      expect(mockStore.save).toHaveBeenCalledTimes(5);
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to save RoomRegistry to store after 5 attempts",
        ),
      );

      consoleErrorMock.mockRestore();
      jest.useRealTimers();
    });
  });
});
