import { describe, test, expect, beforeEach, vi } from "vitest";
import { setupRedis } from "./redisSetup.js";
import { JsonFileStore } from "../persistence/Store.js";
import { InMemoryPubSub } from "../net/PubSub.js";

describe("redisSetup", () => {
  let mockRedisClient;
  let mockRedisLib;
  let mockRedisStore;
  let mockRedisPubSub;
  let mockRedisStoreLib;
  let mockRedisPubSubLib;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
    };

    mockRedisLib = {
      createClient: vi.fn().mockReturnValue(mockRedisClient),
    };

    mockRedisStore = vi.fn();
    mockRedisPubSub = vi.fn();

    mockRedisStoreLib = {
      RedisStore: mockRedisStore,
    };

    mockRedisPubSubLib = {
      RedisPubSub: mockRedisPubSub,
    };
  });

  test("should fallback to JsonFileStore and InMemoryPubSub if REDIS_URL is not set", async () => {
    const result = await setupRedis({ redisUrl: null });

    expect(result.storeInstance).toBeInstanceOf(JsonFileStore);
    expect(result.pubsub).toBeInstanceOf(InMemoryPubSub);
    expect(mockRedisLib.createClient).not.toHaveBeenCalled();
  });

  test("should initialize RedisStore when redisUrl is provided", async () => {
    const result = await setupRedis({
      redisUrl: "redis://localhost:6379",
      redisScaleOut: "0",
      redisLib: mockRedisLib,
      redisStoreLib: mockRedisStoreLib,
      redisPubSubLib: mockRedisPubSubLib,
    });

    expect(mockRedisLib.createClient).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
    });
    expect(mockRedisClient.connect).toHaveBeenCalled();
    expect(mockRedisStore).toHaveBeenCalledWith({ client: mockRedisClient });
    expect(result.pubsub).toBeInstanceOf(InMemoryPubSub);
  });

  test("should initialize RedisPubSub when redisScaleOut is 1", async () => {
    const _result = await setupRedis({
      redisUrl: "redis://localhost:6379",
      redisScaleOut: "1",
      redisLib: mockRedisLib,
      redisStoreLib: mockRedisStoreLib,
      redisPubSubLib: mockRedisPubSubLib,
    });

    expect(mockRedisLib.createClient).toHaveBeenCalledTimes(3); // 1 for store, 2 for pubsub
    expect(mockRedisClient.connect).toHaveBeenCalledTimes(3);
    expect(mockRedisStore).toHaveBeenCalled();
    expect(mockRedisPubSub).toHaveBeenCalled();
  });

  test("should fallback to JsonFileStore gracefully if connection throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockRedisClient.connect.mockRejectedValue(new Error("Connection refused"));

    const result = await setupRedis({
      redisUrl: "redis://localhost:6379",
      redisLib: mockRedisLib,
      redisStoreLib: mockRedisStoreLib,
      redisPubSubLib: mockRedisPubSubLib,
    });

    expect(result.storeInstance).toBeInstanceOf(JsonFileStore);
    expect(result.pubsub).toBeInstanceOf(InMemoryPubSub);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to connect to Redis, falling back to JsonFileStore: Connection refused",
      ),
    );

    consoleErrorSpy.mockRestore();
  });
});
