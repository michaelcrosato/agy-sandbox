/**
 * matchmaking — pure room matchmaking + a join queue (spec 036, upgraded spec 069).
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
 * Room metadata shape (duck-typed): `{ id, mode?, maxPlayers?, players?, tags?, combatRating? }`
 * where `players` is the current population and `tags` an array of strings.
 */

/**
 * Whether `room` satisfies the `criteria` (mode + required tags + MMR combat rating).
 * A criterion left undefined matches anything.
 * @param {Object} room
 * @param {Object} criteria - `{ mode?, tags?, combatRating?, combatRatingTolerance? }`.
 * @returns {boolean}
 */
export function roomMatches(room, criteria: any = {}) {
  if (!room) return false;
  if (criteria.mode !== undefined && room.mode !== criteria.mode) return false;
  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
    const roomTags = Array.isArray(room.tags) ? room.tags : [];
    for (const tag of criteria.tags) {
      if (!roomTags.includes(tag)) return false;
    }
  }

  // Rating-based matching (MMR, spec 069)
  if (criteria.combatRating !== undefined) {
    const roomRating =
      room.combatRating !== undefined ? room.combatRating : 100; // default average
    const tolerance =
      criteria.combatRatingTolerance !== undefined
        ? criteria.combatRatingTolerance
        : 20;
    if (Math.abs(roomRating - criteria.combatRating) > tolerance) {
      return false;
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
 * Supports squad group slot reservations via `criteria.playerCount`.
 *
 * @param {Array<Object>} rooms - Live room metadata.
 * @param {Object} [criteria] - `{ mode?, maxPlayers?, tags?, combatRating?, playerCount? }`.
 * @returns {{action: "join"|"queue"|"create", roomId: (string|null)}}
 */
export function matchRoom(rooms, criteria: any = {}) {
  const list = Array.isArray(rooms) ? rooms : [];
  const requestedSlots =
    criteria.playerCount !== undefined ? criteria.playerCount : 1;

  // Filter rooms that match criteria and have enough free slots for the group
  const matching = list.filter(
    (r) => roomMatches(r, criteria) && freeSlots(r) >= requestedSlots,
  );

  if (matching.length === 0) {
    // If there are rooms matching the criteria but they are just full, return queue
    const matchingWithoutSlotChecks = list.filter((r) =>
      roomMatches(r, criteria),
    );
    if (matchingWithoutSlotChecks.length > 0) {
      return { action: "queue", roomId: null };
    }
    return { action: "create", roomId: null };
  }

  let best = null;
  let bestFree = Infinity; // prefer the SMALLEST positive free count (fullest joinable)
  for (const room of matching) {
    const free = freeSlots(room);
    if (free >= requestedSlots && free < bestFree) {
      best = room;
      bestFree = free;
    }
  }

  if (best) return { action: "join", roomId: best.id };
  return { action: "queue", roomId: null };
}

/**
 * A FIFO join queue: clients wait here for a full room to free a slot, then are
 * admitted in arrival order. Supports progressive rating-based tolerance expansion (spec 069).
 */
export class JoinQueue {
  declare waiting;
  constructor() {
    /** @type {Array<*>} */
    this.waiting = [];
  }

  /**
   * Appends a client to the back of the queue with optional search criteria.
   * Supports backward compatibility with arbitrary objects or primitives.
   * @param {*} client
   * @param {Object} [criteria] - Match search criteria (combatRating, mode, tags, etc.)
   * @returns {number} The client's 1-based position in line.
   */
  enqueue(client, criteria: any = {}) {
    let record;
    if (typeof client === "object" && client !== null) {
      record = client;
    } else {
      record = { client, _wrapped: true };
    }

    const criteriaSource = record.criteria || criteria || {};

    record.combatRating =
      record.combatRating !== undefined
        ? record.combatRating
        : criteriaSource.combatRating;
    record.enqueuedAt =
      record.enqueuedAt || criteriaSource.enqueuedAt || Date.now();
    record.combatRatingTolerance =
      record.combatRatingTolerance ||
      criteriaSource.combatRatingTolerance ||
      20;
    record.mode = record.mode || criteriaSource.mode;
    record.tags = record.tags || criteriaSource.tags || [];

    this.waiting.push(record);
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
    const i = this.waiting.findIndex((item) => {
      if (item === client) return true;
      if (item._wrapped && item.client === client) return true;
      if (item.clientObj === client) return true;
      return false;
    });
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
    const spliced = this.waiting.splice(0, n);
    return spliced.map((item) => (item._wrapped ? item.client : item));
  }

  /**
   * Widens the acceptable Combat Rating tolerance of enqueued players progressively over elapsed wait times.
   * @param {number} now - The current timestamp.
   * @param {number} [intervalSec=5] - Expansion trigger interval in seconds.
   * @param {number} [expansionStep=10] - MMR points to add to tolerance per interval.
   */
  updateQueueTolerances(now, intervalSec = 5, expansionStep = 10) {
    for (const record of this.waiting) {
      if (
        record.combatRating !== undefined &&
        record.enqueuedAt !== undefined
      ) {
        const elapsedMs = now - record.enqueuedAt;
        const steps = Math.floor(elapsedMs / (intervalSec * 1000));
        record.combatRatingTolerance = 20 + steps * expansionStep;
      }
    }
  }
}

/**
 * Ticks the matchmaking queue, evaluates progressively widening tolerances, and matches enqueued players to newly freed rooms.
 * @param {JoinQueue} queue - The matchmaking queue instance.
 * @param {Array<Object>} rooms - Live room metadata.
 * @param {number} now - The current timestamp.
 * @param {number} [intervalSec=5] - Expansion trigger interval.
 * @param {number} [expansionStep=10] - MMR points to expand.
 * @returns {Array<{client: *, roomId: string}>} Array of matching admissions.
 */
export function matchQueueToRooms(
  queue,
  rooms,
  now,
  intervalSec = 5,
  expansionStep = 10,
) {
  if (!queue || !Array.isArray(rooms)) return [];

  // Update tolerances for all waiting players first
  queue.updateQueueTolerances(now, intervalSec, expansionStep);

  const matchedAdmissions = [];

  // Loop through enqueued records in FIFO order
  for (let i = 0; i < queue.waiting.length; i++) {
    const record = queue.waiting[i];

    const matchCriteria = {
      mode: record.mode,
      tags: record.tags,
      combatRating: record.combatRating,
      combatRatingTolerance: record.combatRatingTolerance,
    };

    const match = matchRoom(rooms, matchCriteria);
    if (match.action === "join" && match.roomId) {
      // Remove from queue and add to matched admissions
      queue.waiting.splice(i, 1);
      i--; // adjust index after removal
      const admittedClient = record._wrapped ? record.client : record;
      matchedAdmissions.push({ client: admittedClient, roomId: match.roomId });
    }
  }

  return matchedAdmissions;
}
