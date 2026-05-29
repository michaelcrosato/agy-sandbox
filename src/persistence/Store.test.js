import fs from "fs/promises";
import os from "os";
import path from "path";

import { InMemoryStore, JsonFileStore, Store } from "./Store.js";

describe("Store base class", () => {
  test("base Store class throws on direct save/load/has calls", async () => {
    const base = new Store();
    await expect(base.save("k", { a: 1 })).rejects.toThrow(/must be implemented/);
    await expect(base.load("k")).rejects.toThrow(/must be implemented/);
    await expect(base.has("k")).rejects.toThrow(/must be implemented/);
  });
});

describe("InMemoryStore", () => {
  test("save then load round-trips equal JSON value", async () => {
    const store = new InMemoryStore();
    const payload = { credits: 1200, cargo: { food: 3, electronics: 1 } };
    await store.save("player-42", payload);

    const loaded = await store.load("player-42");
    expect(loaded).toEqual(payload);
  });

  test("load returns null for an unknown key", async () => {
    const store = new InMemoryStore();
    await expect(store.load("ghost")).resolves.toBeNull();
  });

  test("has reflects whether save has been called for a key", async () => {
    const store = new InMemoryStore();
    await expect(store.has("k")).resolves.toBe(false);
    await store.save("k", { v: 1 });
    await expect(store.has("k")).resolves.toBe(true);
  });

  test("saved value is decoupled from the caller's reference", async () => {
    const store = new InMemoryStore();
    const obj = { cargo: { food: 1 } };
    await store.save("p", obj);
    // Mutating the original must not affect what's in the store.
    obj.cargo.food = 99;
    const loaded = await store.load("p");
    expect(loaded.cargo.food).toBe(1);
  });

  test("loaded value is decoupled from the stored copy", async () => {
    const store = new InMemoryStore();
    await store.save("p", { cargo: { food: 1 } });
    const first = await store.load("p");
    first.cargo.food = 99;
    const second = await store.load("p");
    expect(second.cargo.food).toBe(1);
  });

  test("save rejects empty or non-string keys", async () => {
    const store = new InMemoryStore();
    await expect(store.save("", {})).rejects.toThrow(TypeError);
    await expect(store.save(null, {})).rejects.toThrow(TypeError);
  });
});

describe("JsonFileStore", () => {
  let tmpDir;
  let store;

  beforeEach(async () => {
    // Create a fresh temp dir per test so leftover files from a previous test
    // can never bleed in or out. The directory lives only for this test.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-store-"));
    store = new JsonFileStore({ dir: tmpDir });
  });

  afterEach(async () => {
    // Always wipe the temp dir, even if a test failed. Production code never
    // touches ./data; the test stays purely within the tmp dir we own.
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("save then load round-trips equal JSON value via the filesystem", async () => {
    const payload = { markets: { Sol: { food: 110, electronics: 320 } } };
    await store.save("galaxy-public", payload);

    const loaded = await store.load("galaxy-public");
    expect(loaded).toEqual(payload);

    // Verify a file actually landed on disk in the tmp dir.
    const files = await fs.readdir(tmpDir);
    expect(files).toContain("galaxy-public.json");
  });

  test("load returns null when the file is missing", async () => {
    await expect(store.load("never-saved")).resolves.toBeNull();
  });

  test("has reflects whether the file is present on disk", async () => {
    await expect(store.has("k")).resolves.toBe(false);
    await store.save("k", { ok: true });
    await expect(store.has("k")).resolves.toBe(true);
  });

  test("save overwrites the previous value at the same key", async () => {
    await store.save("k", { v: 1 });
    await store.save("k", { v: 2 });
    await expect(store.load("k")).resolves.toEqual({ v: 2 });
  });

  test("sanitises unusual key characters so they cannot escape the dir", async () => {
    // A key containing a path-separator-style sequence must not write outside
    // the configured directory, nor crash the filesystem call.
    await store.save("../escape/key", { safe: true });
    const files = await fs.readdir(tmpDir);
    // Exactly one .json file should exist, and the resolved write path must
    // stay strictly inside the configured tmp dir (no path-traversal escape).
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain("/");
    expect(files[0]).not.toContain(path.sep);
    const resolved = path.resolve(store.pathFor("../escape/key"));
    expect(resolved.startsWith(path.resolve(tmpDir) + path.sep)).toBe(true);
    await expect(store.load("../escape/key")).resolves.toEqual({ safe: true });
  });

  test("creates its directory on demand on first save", async () => {
    // Use a non-existent nested subdir to confirm mkdir recursive works.
    const nested = path.join(tmpDir, "nested", "twice");
    const nestedStore = new JsonFileStore({ dir: nested });
    await nestedStore.save("k", { ok: 1 });
    await expect(nestedStore.load("k")).resolves.toEqual({ ok: 1 });
  });

  test("save rejects empty or non-string keys", async () => {
    await expect(store.save("", {})).rejects.toThrow(TypeError);
    await expect(store.save(null, {})).rejects.toThrow(TypeError);
  });
});
