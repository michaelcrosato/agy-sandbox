/**
 * heartbeat (spec 003) — pure helper for the WebSocket liveness sweep.
 *
 * The server pings every socket on an interval and flips `isAlive=false`; a
 * `pong` handler flips it back to true. A socket still `isAlive===false` at the
 * next sweep never responded and is dead (half-open TCP) — it should be
 * terminated so its room/fleet state and file descriptor are reclaimed. This
 * module owns the *selection* (pure, testable); the server owns the timer and
 * the side-effecting ping/terminate.
 */

/** Default liveness sweep interval (ms). */
export const DEFAULT_HEARTBEAT_MS = 30000;

/**
 * Returns the sockets that failed to pong since the last sweep (`isAlive` is
 * strictly `false`). A socket whose `isAlive` is `true` or unset (brand new) is
 * considered live and excluded.
 * @param {Iterable<{isAlive?: boolean}>} sockets
 * @returns {Array<Object>} The dead sockets to terminate.
 */
export function selectDeadSockets(sockets) {
  if (!sockets || typeof sockets[Symbol.iterator] !== "function") return [];
  const dead = [];
  for (const s of sockets) {
    if (s && s.isAlive === false) dead.push(s);
  }
  return dead;
}
