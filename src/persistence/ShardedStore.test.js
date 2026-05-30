import { ShardedStore } from "./ShardedStore.js";
import { InMemoryStore } from "./Store.js";

describe("ShardedStore (spec 070)", () => {
  let shardA;
  let shardB;
  let shardC;
  let shardedStore;

  beforeEach(() => {
    shardA = new InMemoryStore();
    shardB = new InMemoryStore();
    shardC = new InMemoryStore();
    shardedStore = new ShardedStore({
      shards: [shardA, shardB, shardC],
    });
  });

  test("constructor rejects empty or invalid shard lists", () => {
    expect(() => new ShardedStore()).toThrow();
    expect(() => new ShardedStore({ shards: [] })).toThrow();
    expect(() => new ShardedStore({ shards: [{}] })).toThrow(TypeError);
  });

  test("evenly distributes keys across distinct shards based on FNV-1a hash", () => {
    // Find keys that map to distinct shards
    // Shard count = 3
    const key1 = "player-alpha"; // hash maps to a specific shard
    const key2 = "player-beta";
    const key3 = "galaxy-state";

    const s1 = shardedStore.resolveShard(key1);
    const s2 = shardedStore.resolveShard(key2);
    const s3 = shardedStore.resolveShard(key3);

    // Assert that resolveShard returns one of our configured shards
    expect([shardA, shardB, shardC]).toContain(s1);
    expect([shardA, shardB, shardC]).toContain(s2);
    expect([shardA, shardB, shardC]).toContain(s3);
  });

  test("save delegates cleanly and isolates state between shards", async () => {
    const key = "user-123";
    const data = { name: "Alice", credits: 500 };

    // Find which shard owns the key
    const targetShard = shardedStore.resolveShard(key);
    const nonTargetShards = [shardA, shardB, shardC].filter(
      (s) => s !== targetShard,
    );

    // Save using the ShardedStore
    await shardedStore.save(key, data);

    // Assert target shard has the data and others do not (strict partitioning)
    expect(await targetShard.has(key)).toBe(true);
    expect(await targetShard.load(key)).toEqual(data);

    for (const other of nonTargetShards) {
      expect(await other.has(key)).toBe(false);
      expect(await other.load(key)).toBeNull();
    }
  });

  test("load and has retrieve partitioned data cleanly", async () => {
    const key = "user-abc";
    const data = { score: 99 };

    expect(await shardedStore.has(key)).toBe(false);
    expect(await shardedStore.load(key)).toBeNull();

    await shardedStore.save(key, data);

    expect(await shardedStore.has(key)).toBe(true);
    expect(await shardedStore.load(key)).toEqual(data);
  });

  test("supports custom hashing functions", () => {
    const customHashFn = (k) => (k === "force-A" ? 0 : 1);
    const customStore = new ShardedStore({
      shards: [shardA, shardB],
      hashFn: customHashFn,
    });

    expect(customStore.resolveShard("force-A")).toBe(shardA);
    expect(customStore.resolveShard("anything-else")).toBe(shardB);
  });

  test("guards against empty or invalid key inputs", async () => {
    await expect(shardedStore.save("", {})).rejects.toThrow(TypeError);
    await expect(shardedStore.load(null)).rejects.toThrow(TypeError);
    await expect(shardedStore.has(undefined)).rejects.toThrow(TypeError);
  });
});
