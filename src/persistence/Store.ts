import fs from "fs/promises";
import path from "path";

/**
 * Persistence Store interface (P1).
 *
 * The world-state persistence layer is intentionally decoupled from any
 * concrete storage backend. A Store is a tiny async key/value box:
 *   - `save(key, obj)` writes a JSON-serialisable value under `key`.
 *   - `load(key)`     reads it back (or returns `null` if absent).
 *   - `has(key)`      reports whether a value exists for `key`.
 *
 * Keys are opaque strings. Implementations sanitise them where their
 * underlying storage demands it (e.g. the filesystem). Values must round-trip
 * cleanly through `JSON.stringify` / `JSON.parse`; the serializers in
 * `serializers.js` guarantee this for galaxy and player snapshots.
 *
 * Adding a new backend (Redis, SQLite, S3...) means subclassing `Store` and
 * implementing the three methods — nothing else in the engine needs to know.
 */
export class Store {
  /**
   * Persists `obj` under `key`. Overwrites any existing value.
   * @param {string} _key
   * @param {Object} _obj
   * @returns {Promise<void>}
   */
  async save(_key, _obj) {
    throw new Error("Store.save must be implemented by subclass");
  }

  /**
   * Reads the value stored under `key`. Returns `null` when the key is absent.
   * @param {string} _key
   * @returns {Promise<Object|null>}
   */
  async load(_key) {
    throw new Error("Store.load must be implemented by subclass");
  }

  /**
   * Reports whether a value exists for `key`.
   * @param {string} _key
   * @returns {Promise<boolean>}
   */
  async has(_key): Promise<boolean> {
    throw new Error("Store.has must be implemented by subclass");
  }
}

/**
 * Headless, process-local persistence store.
 *
 * Useful for tests, the unit-test gate, and unit-of-work scenarios where
 * survival across process restarts isn't required. Values are deep-cloned on
 * the way in AND the way out, so callers cannot accidentally mutate stored
 * state through a stale reference — load/save behave like a real disk store.
 */
export class InMemoryStore extends Store {
  declare data;
  constructor() {
    super();
    this.data = new Map();
  }

  async save(key, obj) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("InMemoryStore.save: key must be a non-empty string");
    }
    this.data.set(key, cloneJson(obj));
  }

  async load(key) {
    if (!this.data.has(key)) return null;
    return cloneJson(this.data.get(key));
  }

  async has(key) {
    return this.data.has(key);
  }
}

/**
 * Filesystem-backed persistence store.
 *
 * Each key gets its own JSON file under `dir` (default `./data`), named after
 * a sanitised version of the key so unusual characters can't escape the
 * directory or trip the filesystem. The directory is created on demand the
 * first time something is written.
 *
 * Writes are atomic: the value is written to a sibling temp file and then
 * renamed into place, so a process crash mid-write never leaves a half-written
 * JSON file that a later `load` would choke on.
 */
export class JsonFileStore extends Store {
  declare dir;
  /**
   * @param {Object} [config={}]
   * @param {string} [config.dir="./data"] - Directory the store reads/writes inside.
   */
  constructor({ dir = "./data" } = {}) {
    super();
    this.dir = dir;
  }

  /**
   * Computes the absolute file path used for a given key.
   * @param {string} key
   * @returns {string}
   */
  pathFor(key) {
    return path.join(this.dir, `${sanitizeKey(key)}.json`);
  }

  async save(key, obj) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("JsonFileStore.save: key must be a non-empty string");
    }
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.pathFor(key);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    const payload = JSON.stringify(obj, null, 2);
    await fs.writeFile(tmp, payload, "utf8");
    await fs.rename(tmp, target);
  }

  async load(key) {
    try {
      const raw = await fs.readFile(this.pathFor(key), "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async has(key) {
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Sanitises a key so it can safely become a filesystem path segment. Keeps
 * letters, digits, dash, underscore, dot; replaces everything else with `_`.
 * Empty results fall back to `_` so a key never produces an empty filename.
 * @param {string} key
 * @returns {string}
 */
function sanitizeKey(key) {
  const cleaned = String(key).replace(/[^a-zA-Z0-9_\-.]/g, "_");
  return cleaned.length > 0 ? cleaned : "_";
}

/**
 * Deep-clones a JSON-serialisable value via `structuredClone` when available,
 * falling back to JSON round-trip for older runtimes. Functions, undefined
 * values, and cycles are not supported — same constraints as the on-disk store.
 * @param {*} value
 * @returns {*}
 */
function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
