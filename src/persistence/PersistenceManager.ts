import {
  serializeGalaxy,
  serializePlayer,
  SNAPSHOT_VERSION,
} from "./serializers.js";

/**
 * PersistenceManager (P1).
 *
 * Glue between the live server runtime and a {@link Store}. The server holds
 * one of these; the engine layer never touches a store directly. All disk
 * paths come back through `save…` / `load…` here, which:
 *   - serialize the live world via {@link serializeGalaxy} / {@link serializePlayer},
 *   - wrap player snapshots with the room id the player was in so a returning
 *     pilot can be auto-routed to the right sector after a restart,
 *   - swallow + log errors so missing or corrupted save files NEVER take down
 *     the live server.
 *
 * Nothing in this class touches sockets, randomness, or the global clock —
 * it is unit-testable against any {@link Store} backend.
 */
export class PersistenceManager {
  declare _autosaveHandle;
  declare logger;
  declare store;
  /**
   * @param {Object} [config]
   * @param {import("./Store.js").Store} [config.store] - Backing store, validated at runtime (filesystem, memory, ...).
   * @param {(msg: string, err?: Error) => void} [config.logger] - Optional log sink.
   *   Defaults to `console.warn` so failures are visible without crashing.
   */
  constructor({ store, logger }: any = {}) {
    if (!store) {
      throw new TypeError("PersistenceManager: a Store instance is required");
    }
    this.store = store;
    this.logger =
      typeof logger === "function"
        ? logger
        : (msg, err) => {
            if (err) {
              console.warn(`[persistence] ${msg}: ${err.message}`);
            } else {
              console.warn(`[persistence] ${msg}`);
            }
          };
    this._autosaveHandle = null;
  }

  /**
   * Disk key for a galaxy snapshot. Keyed by room id so multi-room setups can
   * each persist their own world without colliding.
   * @param {string} roomId
   * @returns {string}
   */
  galaxyKey(roomId) {
    return `galaxy-${roomId}`;
  }

  /**
   * Disk key for a player snapshot. Keyed by the stable session token so a
   * returning client carrying the same token gets the same save file.
   * @param {string} token
   * @returns {string}
   */
  playerKey(token) {
    return `player-${token}`;
  }

  /**
   * Disk key for the faction war campaign state snapshot.
   * @param {string} roomId
   * @returns {string}
   */
  campaignKey(roomId) {
    return `faction:campaign:state:${roomId}`;
  }

  /**
   * Persists the live galaxy for `roomId`. Errors are logged and swallowed —
   * a transient I/O failure must never crash the live game.
   * @param {string} roomId
   * @param {Object} gameInstance
   * @returns {Promise<boolean>} `true` if the snapshot landed on disk.
   */
  async saveGalaxy(roomId, gameInstance) {
    if (!roomId || !gameInstance) return false;
    try {
      const snapshot = serializeGalaxy(gameInstance);
      await this.store.save(this.galaxyKey(roomId), snapshot);

      // SPEC-165: Persist faction campaign state under its own central key
      if (
        gameInstance.factionWarCampaign &&
        typeof gameInstance.factionWarCampaign.save === "function"
      ) {
        await this.store.save(
          this.campaignKey(roomId),
          gameInstance.factionWarCampaign.save(),
        );
      }

      return true;
    } catch (err) {
      this.logger(`saveGalaxy(${roomId}) failed`, err);
      return false;
    }
  }

  /**
   * Reads the saved galaxy snapshot for `roomId`. Returns `null` when no save
   * exists, or when the on-disk payload is missing/corrupt — callers then run
   * the un-restored seed unchanged.
   * @param {string} roomId
   * @returns {Promise<Object|null>}
   */
  async loadGalaxy(roomId) {
    if (!roomId) return null;
    try {
      const raw = await this.store.load(this.galaxyKey(roomId));
      if (!raw || typeof raw !== "object") return null;

      // SPEC-165: Recover campaign state from central store key on cache misses
      if (!raw.factionWarCampaign) {
        const campaignData = await this.store.load(this.campaignKey(roomId));
        if (campaignData) {
          raw.factionWarCampaign = campaignData;
        }
      }

      return raw;
    } catch (err) {
      this.logger(`loadGalaxy(${roomId}) failed; ignoring save`, err);
      return null;
    }
  }

  /**
   * Persists `clientObj`'s state under `token`. The on-disk shape is
   * `{ version, roomId, savedAt, player }` so the server can route the
   * returning pilot back to their old sector after a restart.
   * @param {string} token - Stable session token (typically the client's id).
   * @param {Object} clientObj
   * @param {string} [roomId] - Sector the player was in when saved.
   * @returns {Promise<boolean>}
   */
  async savePlayer(token, clientObj, roomId) {
    if (!token || !clientObj) return false;
    try {
      const player = serializePlayer(clientObj);
      const wrapped = {
        version: SNAPSHOT_VERSION,
        roomId: roomId || clientObj.roomId || null,
        savedAt: Date.now(),
        player,
      };
      await this.store.save(this.playerKey(token), wrapped);
      return true;
    } catch (err) {
      this.logger(`savePlayer(${token}) failed`, err);
      return false;
    }
  }

  /**
   * Reads the wrapped player snapshot for `token`. Returns `null` when no
   * save exists, when the payload is corrupt, or when its inner shape is not
   * a plain player object — the caller should then treat the connection as a
   * fresh pilot rather than crashing.
   * @param {string} token
   * @returns {Promise<{roomId: string|null, player: Object}|null>}
   */
  async loadPlayer(token) {
    if (!token) return null;
    try {
      const raw = await this.store.load(this.playerKey(token));
      if (!raw || typeof raw !== "object") return null;
      // The wrapped format always carries `player`. If we ever encounter a
      // raw player snapshot from an earlier shape, accept it too so older
      // saves don't strand players.
      const player =
        raw.player && typeof raw.player === "object" ? raw.player : raw;
      const roomId = typeof raw.roomId === "string" ? raw.roomId : null;
      return { roomId, player };
    } catch (err) {
      this.logger(`loadPlayer(${token}) failed; ignoring save`, err);
      return null;
    }
  }

  /**
   * Persists every entry in `rooms` (an iterable of `GameInstance`-shaped
   * objects). Used at shutdown and as the body of the autosave timer.
   * Errors per room are isolated — a single failing save does not block the
   * others.
   * @param {Iterable<Object>} rooms
   * @returns {Promise<number>} Count of rooms successfully saved.
   */
  async saveAllGalaxies(rooms) {
    let saved = 0;
    for (const room of rooms) {
      if (!room || !room.id) continue;
      const ok = await this.saveGalaxy(room.id, room);
      if (ok) saved++;
    }
    return saved;
  }

  /**
   * Starts a recurring background save. Returns a stop function so callers do
   * not need to know about the underlying timer handle. The timer is `unref`'d
   * where possible so it never holds the process open on its own.
   * @param {() => Iterable<Object>} getRooms - Called each tick to get the
   *   current rooms iterable; this lets the manager pick up rooms that the
   *   server creates after autosave starts.
   * @param {number} [intervalMs=30000] - Cadence between saves.
   * @returns {() => void} Stop function.
   */
  startAutosave(getRooms, intervalMs = 30000) {
    if (typeof getRooms !== "function") {
      throw new TypeError(
        "PersistenceManager.startAutosave: getRooms must be a function",
      );
    }
    this.stopAutosave();
    const handle = setInterval(() => {
      // Fire-and-forget: persistence runs alongside the game loop, never
      // blocks it. Errors land in the per-room log line inside saveGalaxy.
      this.saveAllGalaxies(getRooms()).catch((err) => {
        this.logger("autosave tick failed", err);
      });
    }, intervalMs);
    if (handle && typeof handle.unref === "function") {
      handle.unref();
    }
    this._autosaveHandle = handle;
    return () => this.stopAutosave();
  }

  /**
   * Cancels any active autosave timer. Safe to call when no timer is running.
   */
  stopAutosave() {
    if (this._autosaveHandle) {
      clearInterval(this._autosaveHandle);
      this._autosaveHandle = null;
    }
  }
}
