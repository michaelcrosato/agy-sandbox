/**
 * roomRouter — pure room→shard assignment and a process-agnostic room ownership
 * registry (spec 019, horizontal-scaling first slice).
 *
 * The server is a single Node process today. Scaling rooms across processes or
 * hosts needs two orchestration primitives that are independent of any one
 * process and therefore unit-testable in isolation:
 *
 *  1. A deterministic router: given a `roomId` and a shard count, decide which
 *     shard/process should own that room. Stable (same room → same shard) and
 *     evenly distributed, so a stateless front door can route a client to the
 *     right node without coordination.
 *
 *  2. A room registry: the authoritative map of which node currently owns which
 *     room (presence), with claim / release / hand-off operations. In a real
 *     deployment this map lives in the shared backend (Redis/the `Store`); here
 *     it is a plain serializable structure so the same logic can be exercised
 *     headlessly and persisted through the existing `Store` interface.
 *
 * Pure: no sockets, processes, or randomness. The engine stays process-agnostic;
 * only orchestration consumes these helpers. Single-process mode never calls
 * them, so it is unaffected.
 */

/**
 * 32-bit FNV-1a hash of a string. Fast, dependency-free, and well-distributed
 * for short keys like room ids.
 * @param {string} str
 * @returns {number} Unsigned 32-bit hash.
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically maps a room id to a shard index in `[0, shardCount)`.
 * Same inputs always yield the same shard, so any node can compute the owner of
 * a room without consulting shared state. A non-positive `shardCount` collapses
 * to shard 0 (single-process).
 * @param {string} roomId
 * @param {number} shardCount - Number of shards/processes.
 * @returns {number} Shard index.
 */
export function assignShard(roomId, shardCount) {
  if (!Number.isInteger(shardCount) || shardCount <= 1) return 0;
  return hashString(roomId) % shardCount;
}

/**
 * Authoritative ownership map: which node currently owns which room. Plain,
 * JSON-serializable state so it can be round-tripped through the shared `Store`
 * (presence) and reasoned about in tests. All operations are O(1) except the
 * per-node listing.
 */
export class RoomRegistry {
  /**
   * @param {Object<string, string|Object>} [initial={}] - roomId → nodeId or lease object seed map.
   */
  constructor(initial = {}) {
    /** @type {Map<string, string|Object>} */
    this.owners = new Map(
      initial && typeof initial === "object" ? Object.entries(initial) : [],
    );
  }

  /**
   * @param {string} roomId
   * @returns {string|null} The owning node id, or null if unowned.
   */
  owner(roomId) {
    const o = this.owners.get(roomId);
    if (o === undefined) return null;
    if (typeof o === "string") return o;
    if (o && typeof o === "object") return o.nodeId || null;
    return null;
  }

  /**
   * @param {string} roomId
   * @param {number} [now] - Current time in ms to check expiry.
   * @returns {boolean} True if any node owns the room and it has not expired.
   */
  isOwned(roomId, now = null) {
    if (!this.owners.has(roomId)) return false;
    if (now === null) return true;
    const o = this.owners.get(roomId);
    if (
      o &&
      typeof o === "object" &&
      o.expiresAt !== null &&
      o.expiresAt < now
    ) {
      return false;
    }
    return true;
  }

  /**
   * Claims a room for `nodeId`. Succeeds (and is idempotent) when the room is
   * unowned, already owned by `nodeId`, or its previous lease has expired;
   * fails when another node owns it.
   * @param {string} roomId
   * @param {string} nodeId
   * @param {number} [expiresAt=null] - Absolute expiry timestamp in ms.
   * @param {number} [now=null] - Current timestamp in ms.
   * @returns {boolean} True if `nodeId` owns the room after the call.
   */
  claim(roomId, nodeId, expiresAt = null, now = null) {
    const cur = this.owners.get(roomId);
    if (cur === undefined) {
      this.owners.set(
        roomId,
        expiresAt !== null ? { nodeId, expiresAt } : nodeId,
      );
      return true;
    }

    let curOwner = cur;
    let curExpiresAt = null;
    if (cur && typeof cur === "object") {
      curOwner = cur.nodeId;
      curExpiresAt = cur.expiresAt;
    }

    // If lease has expired, any node can claim it
    if (now !== null && curExpiresAt !== null && curExpiresAt < now) {
      this.owners.set(
        roomId,
        expiresAt !== null ? { nodeId, expiresAt } : nodeId,
      );
      return true;
    }

    if (curOwner !== nodeId) return false;

    // Idempotent lease renewal/update
    this.owners.set(
      roomId,
      expiresAt !== null ? { nodeId, expiresAt } : nodeId,
    );
    return true;
  }

  /**
   * Releases a room, but only if `nodeId` is the current owner.
   * @param {string} roomId
   * @param {string} nodeId
   * @returns {boolean} True if the room was released.
   */
  release(roomId, nodeId) {
    const currentOwner = this.owner(roomId);
    if (currentOwner !== nodeId) return false;
    this.owners.delete(roomId);
    return true;
  }

  /**
   * Hands a room off from `fromNode` to `toNode` (graceful drain / rebalance).
   * Only succeeds if `fromNode` is the current owner.
   * @param {string} roomId
   * @param {string} fromNode
   * @param {string} toNode
   * @param {number} [expiresAt=null] - Optional absolute expiry timestamp in ms.
   * @returns {boolean} True if ownership moved.
   */
  transfer(roomId, fromNode, toNode, expiresAt = null) {
    const currentOwner = this.owner(roomId);
    if (currentOwner !== fromNode) return false;
    this.owners.set(
      roomId,
      expiresAt !== null ? { nodeId: toNode, expiresAt } : toNode,
    );
    return true;
  }

  /**
   * @param {string} nodeId
   * @returns {Array<string>} Sorted room ids owned by `nodeId`.
   */
  roomsForNode(nodeId) {
    const out = [];
    for (const [room, node] of this.owners) {
      let ownerId = node;
      if (node && typeof node === "object") {
        ownerId = node.nodeId;
      }
      if (ownerId === nodeId) out.push(room);
    }
    return out.sort();
  }

  /**
   * Reaps all expired leases from the registry.
   * @param {number} now - Current time in ms.
   * @returns {number} The count of reaped rooms.
   */
  reapExpired(now) {
    let reapedCount = 0;
    for (const [roomId, o] of this.owners) {
      if (
        o &&
        typeof o === "object" &&
        o.expiresAt !== null &&
        o.expiresAt < now
      ) {
        this.owners.delete(roomId);
        reapedCount++;
      }
    }
    return reapedCount;
  }

  /**
   * @returns {Object<string, string|Object>} A roomId → nodeId snapshot for the
   *   shared store.
   */
  serialize() {
    const out = {};
    for (const [room, val] of this.owners) {
      if (val && typeof val === "object") {
        out[room] = { nodeId: val.nodeId, expiresAt: val.expiresAt };
      } else {
        out[room] = val;
      }
    }
    return out;
  }

  /**
   * Rebuilds a registry from a {@link serialize} snapshot.
   * @param {Object<string, string|Object>} [data={}]
   * @returns {RoomRegistry}
   */
  static fromJSON(data = {}) {
    return new RoomRegistry(data);
  }
}

/**
 * Stateless connection router (spec 019d).
 * Decides which node currently owns or should own a given room.
 * Consults the registry for dynamic presence/ownership, falling back to
 * FNV-1a assignShard for unclaimed rooms.
 *
 * @param {Object} params
 * @param {string} params.roomId - The room to connect to.
 * @param {RoomRegistry} [params.registry] - Current dynamic registry.
 * @param {number} params.shardCount - Total number of shards (WORKERS).
 * @returns {string} The target worker/node id (e.g. "node-0", "node-1").
 */
export function routeConnection({ roomId, registry, shardCount }) {
  if (!roomId) return "node-0";

  // 1. Consult registry for active dynamic ownership
  if (registry) {
    const owner = registry.owner(roomId);
    if (owner) return owner;
  }

  // 2. Fall back to FNV-1a static assignment
  const shardIdx = assignShard(roomId, shardCount);
  return `node-${shardIdx}`;
}
