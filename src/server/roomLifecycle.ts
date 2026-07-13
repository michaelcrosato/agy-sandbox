/**
 * roomLifecycle (spec 007) — pure room-lifecycle decisions extracted from the
 * server: whether an idle non-public room should be garbage-collected, and how a
 * player nickname is sanitized. Pure and unit-testable.
 */

/** Default idle window (ms) before an empty custom room is collected. */
export const DEFAULT_ROOM_IDLE_MS = 30000;

/**
 * Whether a room should be garbage-collected: it is not the persistent "public"
 * room, has no connected clients, and has been idle past the threshold.
 * @param {Object} room - `{ id, clients: Map, lastActiveTime: number }`.
 * @param {Object} [options]
 * @param {number} [options.now] - Current epoch ms.
 * @param {number} [options.idleMs] - Idle threshold (ms).
 * @returns {boolean}
 */
export function shouldGcRoom(
  room,
  { now = Date.now(), idleMs = DEFAULT_ROOM_IDLE_MS } = {},
) {
  if (!room || room.id === "public") return false;
  const clientCount = room.clients ? room.clients.size : 0;
  if (clientCount > 0) return false;
  return now - (room.lastActiveTime || 0) > idleMs;
}

/**
 * Sanitizes a raw nickname to a trimmed, length-capped display name (matches the
 * server's historical behaviour exactly).
 * @param {*} raw
 * @returns {string}
 */
export function sanitizeNickname(raw) {
  return (raw || "Pilot").trim().substring(0, 12);
}
