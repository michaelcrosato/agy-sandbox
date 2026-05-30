import { RedisStore } from "./RedisStore.js";

class FakeRedisClient {
  constructor() {
    this.data = new Map();
  }

  async set(key, value) {
    this.data.set(key, value);
  }

  async get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }
}

describe("RedisStore", () => {
  let client;
  let store;

  beforeEach(() => {
    client = new FakeRedisClient();
    store = new RedisStore({ client });
  });

  test("save then load round-trips equal JSON value", async () => {
    const payload = { credits: 1200, cargo: { food: 3, electronics: 1 } };
    await store.save("player-42", payload);

    const loaded = await store.load("player-42");
    expect(loaded).toEqual(payload);
  });

  test("load returns null for an unknown key", async () => {
    await expect(store.load("ghost")).resolves.toBeNull();
  });

  test("has reflects whether save has been called for a key", async () => {
    await expect(store.has("k")).resolves.toBe(false);
    await store.save("k", { v: 1 });
    await expect(store.has("k")).resolves.toBe(true);
  });

  test("saved value is decoupled from the caller's reference via JSON serialize/deserialize", async () => {
    const obj = { cargo: { food: 1 } };
    await store.save("p", obj);
    // Mutating the original must not affect what's in the store.
    obj.cargo.food = 99;
    const loaded = await store.load("p");
    expect(loaded.cargo.food).toBe(1);
  });

  test("loaded value is decoupled from the stored copy", async () => {
    await store.save("p", { cargo: { food: 1 } });
    const first = await store.load("p");
    first.cargo.food = 99;
    const second = await store.load("p");
    expect(second.cargo.food).toBe(1);
  });

  test("save/load/has rejects empty or non-string keys", async () => {
    await expect(store.save("", {})).rejects.toThrow(TypeError);
    await expect(store.save(null, {})).rejects.toThrow(TypeError);
    await expect(store.load("")).rejects.toThrow(TypeError);
    await expect(store.load(null)).rejects.toThrow(TypeError);
    await expect(store.has("")).rejects.toThrow(TypeError);
    await expect(store.has(null)).rejects.toThrow(TypeError);
  });

  test("isolates keys with the custom prefix", async () => {
    const customPrefixStore = new RedisStore({ client, keyPrefix: "custom:" });
    await customPrefixStore.save("mykey", { ok: true });

    // Verify key was actually prefixed on the client
    expect(client.data.has("custom:mykey")).toBe(true);
    expect(client.data.has("starfall:mykey")).toBe(false);

    const loaded = await customPrefixStore.load("mykey");
    expect(loaded).toEqual({ ok: true });
  });

  test("rejects if client is missing in constructor", () => {
    expect(() => new RedisStore()).toThrow(/client must be provided/);
  });
});
