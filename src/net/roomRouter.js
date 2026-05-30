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
   * @param {Object<string, string>} [initial={}] - roomId → nodeId seed map.
   */
  constructor(initial = {}) {
    /** @type {Map<string, string>} */
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
    return o === undefined ? null : o;
  }

  /**
   * @param {string} roomId
   * @returns {boolean} True if any node owns the room.
   */
  isOwned(roomId) {
    return this.owners.has(roomId);
  }

  /**
   * Claims a room for `nodeId`. Succeeds (and is idempotent) when the room is
   * unowned or already owned by `nodeId`; fails when another node owns it.
   * @param {string} roomId
   * @param {string} nodeId
   * @returns {boolean} True if `nodeId` owns the room after the call.
   */
  claim(roomId, nodeId) {
    const cur = this.owners.get(roomId);
    if (cur !== undefined && cur !== nodeId) return false;
    this.owners.set(roomId, nodeId);
    return true;
  }

  /**
   * Releases a room, but only if `nodeId` is the current owner.
   * @param {string} roomId
   * @param {string} nodeId
   * @returns {boolean} True if the room was released.
   */
  release(roomId, nodeId) {
    if (this.owners.get(roomId) !== nodeId) return false;
    this.owners.delete(roomId);
    return true;
  }

  /**
   * Hands a room off from `fromNode` to `toNode` (graceful drain / rebalance).
   * Only succeeds if `fromNode` is the current owner.
   * @param {string} roomId
   * @param {string} fromNode
   * @param {string} toNode
   * @returns {boolean} True if ownership moved.
   */
  transfer(roomId, fromNode, toNode) {
    if (this.owners.get(roomId) !== fromNode) return false;
    this.owners.set(roomId, toNode);
    return true;
  }

  /**
   * @param {string} nodeId
   * @returns {Array<string>} Sorted room ids owned by `nodeId`.
   */
  roomsForNode(nodeId) {
    const out = [];
    for (const [room, node] of this.owners) {
      if (node === nodeId) out.push(room);
    }
    return out.sort();
  }

  /**
   * @returns {Object<string, string>} A plain roomId → nodeId snapshot for the
   *   shared store.
   */
  serialize() {
    return Object.fromEntries(this.owners);
  }

  /**
   * Rebuilds a registry from a {@link serialize} snapshot.
   * @param {Object<string, string>} [data={}]
   * @returns {RoomRegistry}
   */
  static fromJSON(data = {}) {
    return new RoomRegistry(data);
  }
}
