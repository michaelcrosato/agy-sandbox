import { jest } from "@jest/globals";

// Mock the imported serializer function
jest.unstable_mockModule("../persistence/serializers.js", () => ({
  applyGalaxy: jest.fn(),
}));

// Resolve the mocked modules
const { initializeDefaultRooms } = await import("./roomInitializer.js");
const { GameInstance } = await import("../engine/GameInstance.js");
const { applyGalaxy } = await import("../persistence/serializers.js");

describe("roomInitializer", () => {
  let instances;
  let mockGalacticChronicle;
  let mockPersistenceManager;
  let options;

  beforeEach(() => {
    jest.clearAllMocks();
    instances = new Map();
    mockGalacticChronicle = {};
    mockPersistenceManager = {
      loadGalaxy: jest.fn(),
    };

    options = {
      workers: 1,
      shardIndex: 0,
      instances,
      galacticChronicle: mockGalacticChronicle,
      persistenceManager: mockPersistenceManager,
    };
  });

  test("should initialize public room and load its state in single worker mode", async () => {
    mockPersistenceManager.loadGalaxy.mockResolvedValue({ some: "snapshot" });

    await initializeDefaultRooms(options);

    expect(instances.has("public")).toBe(true);
    const room = instances.get("public");
    expect(room).toBeInstanceOf(GameInstance);
    expect(room.chronicle).toBe(mockGalacticChronicle);
    expect(mockPersistenceManager.loadGalaxy).toHaveBeenCalledWith("public");
    expect(applyGalaxy).toHaveBeenCalledWith(room, { some: "snapshot" });
  });

  test("should initialize public room if this shard owns it in multi-worker mode", async () => {
    // Shard count 4, shard index 0 owns "public" because assignShard("public", 4) = 0
    options.workers = 4;
    options.shardIndex = 0;
    mockPersistenceManager.loadGalaxy.mockResolvedValue(null);

    await initializeDefaultRooms(options);

    expect(instances.has("public")).toBe(true);
    expect(mockPersistenceManager.loadGalaxy).toHaveBeenCalled();
  });

  test("should NOT initialize public room if this shard does not own it in multi-worker mode", async () => {
    // Shard count 4, shard index 1 does not own "public"
    options.workers = 4;
    options.shardIndex = 1;

    await initializeDefaultRooms(options);

    expect(instances.has("public")).toBe(false);
    expect(mockPersistenceManager.loadGalaxy).not.toHaveBeenCalled();
  });

  test("should handle missing snapshot gracefully", async () => {
    mockPersistenceManager.loadGalaxy.mockResolvedValue(null);

    await initializeDefaultRooms(options);

    expect(instances.has("public")).toBe(true);
    expect(applyGalaxy).not.toHaveBeenCalled();
  });

  test("should handle load error gracefully without throwing", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockPersistenceManager.loadGalaxy.mockRejectedValue(
      new Error("File system read failure"),
    );

    await initializeDefaultRooms(options);

    expect(instances.has("public")).toBe(true);
    expect(applyGalaxy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to restore public room galaxy: File system read failure",
      ),
    );

    consoleErrorSpy.mockRestore();
  });
});
