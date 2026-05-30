/**
 * matchmaking — pure room matchmaking + a join queue (spec 036).
 *
 * Rooms are joined today by a fixed id; there is no metadata-filtered
 * matchmaking. The market reference (Colyseus) ships room filtering, capacity,
 * and queuing out of the box. This module is the pure decision core: given the
 * live rooms' metadata and a client's criteria, pick the best joinable room (or
 * signal "create a new one" / "queue"), and FIFO-queue clients for a full room
 * until a slot frees.
 *
 * Pure: no sockets, timers, or randomness. The server consults these helpers;
 * the transport (actually joining/creating a room) stays in the handler.
 *
 * Room metadata shape (duck-typed): `{ id, mode?, maxPlayers?, players?, tags? }`
 * where `players` is the current population and `tags` an array of strings.
 */

/**
 * Whether `room` satisfies the `criteria` (mode + required tags). A criterion
 * left undefined matches anything.
 * @param {Object} room
 * @param {Object} criteria - `{ mode?, tags? }`.
 * @returns {boolean}
 */
export function roomMatches(room, criteria = {}) {
  if (!room) return false;
  if (criteria.mode !== undefined && room.mode !== criteria.mode) return false;
  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
    const roomTags = Array.isArray(room.tags) ? room.tags : [];
    for (const tag of criteria.tags) {
      if (!roomTags.includes(tag)) return false;
    }
  }
  return true;
}

/**
 * Remaining open slots in a room. A room without `maxPlayers` is treated as
 * unbounded (Infinity).
 * @param {Object} room
 * @returns {number}
 */
export function freeSlots(room) {
  if (!room) return 0;
  const cap = Number.isFinite(room.maxPlayers) ? room.maxPlayers : Infinity;
  const pop = Number.isFinite(room.players) ? room.players : 0;
  return Math.max(0, cap - pop);
}

/**
 * Picks the best room for a client given the live rooms and join criteria.
 *
 * Strategy: among rooms matching the criteria, prefer the **fullest room that
 * still has a free slot** (fill rooms before opening new ones — fewer
 * fragmented lobbies). If matching rooms exist but all are full, **queue**. If
 * no room matches at all, signal **create**.
 *
 * @param {Array<Object>} rooms - Live room metadata.
 * @param {Object} [criteria] - `{ mode?, maxPlayers?, tags? }`.
 * @returns {{action: "join"|"queue"|"create", roomId: (string|null)}}
 */
export function matchRoom(rooms, criteria = {}) {
  const list = Array.isArray(rooms) ? rooms : [];
  const matching = list.filter((r) => roomMatches(r, criteria));

  if (matching.length === 0) {
    return { action: "create", roomId: null };
  }

  let best = null;
  let bestFree = Infinity; // prefer the SMALLEST positive free count (fullest joinable)
  for (const room of matching) {
    const free = freeSlots(room);
    if (free > 0 && free < bestFree) {
      best = room;
      bestFree = free;
    }
  }

  if (best) return { action: "join", roomId: best.id };
  // Matching rooms exist but every one is full → wait in line.
  return { action: "queue", roomId: null };
}

/**
 * A FIFO join queue: clients wait here for a full room to free a slot, then are
 * admitted in arrival order. Pure/in-memory; the server holds one queue per
 * matchmaking pool (e.g. per mode).
 */
export class JoinQueue {
  constructor() {
    /** @type {Array<*>} */
    this.waiting = [];
  }

  /**
   * Appends a client to the back of the queue.
   * @param {*} client
   * @returns {number} The client's 1-based position in line.
   */
  enqueue(client) {
    this.waiting.push(client);
    return this.waiting.length;
  }

  /** @returns {number} How many clients are waiting. */
  get size() {
    return this.waiting.length;
  }

  /**
   * Removes a specific client from the queue (e.g. they disconnected).
   * @param {*} client
   * @returns {boolean} True if the client was waiting and got removed.
   */
  remove(client) {
    const i = this.waiting.indexOf(client);
    if (i === -1) return false;
    this.waiting.splice(i, 1);
    return true;
  }

  /**
   * Admits the next client(s) now that `slots` have opened, in FIFO order.
   * @param {number} [slots=1] - Number of freed slots to fill.
   * @returns {Array<*>} The admitted clients (front of the queue), in order.
   */
  admit(slots = 1) {
    const n = Math.max(0, Math.min(slots, this.waiting.length));
    return this.waiting.splice(0, n);
  }
}
