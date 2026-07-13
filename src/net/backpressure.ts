/**
 * backpressure (spec 004) — pure decision for whether to send a frame to a
 * client given how much data is already queued on its socket (`bufferedAmount`).
 *
 * The 30Hz broadcast serializes once and fans out to every client. A slow client
 * cannot drain that fast, so its socket buffer grows without bound → server OOM.
 * Policy: below the soft limit, always send. At/above the soft limit, send only
 * keyframes (skip deltas — the client self-heals on the next scheduled keyframe).
 * At/above the hard limit, the client is unrecoverably slow → drop it.
 *
 * Pure: no sockets, timers, or `Math.random`.
 */

/** Default backpressure thresholds (bytes). Frozen; override per-call. */
export const DEFAULT_BACKPRESSURE_OPTIONS = Object.freeze({
  softLimit: 1 * 1024 * 1024, // 1 MB — skip deltas above this
  hardLimit: 4 * 1024 * 1024, // 4 MB — drop the client above this
});

/**
 * Decides how to treat an outgoing frame for a client.
 * @param {number} bufferedAmount - The socket's queued bytes (`ws.bufferedAmount`).
 * @param {Object} [options]
 * @param {boolean} [options.isKeyframe=false] - Whether this frame is a full keyframe.
 * @param {number} [options.softLimit]
 * @param {number} [options.hardLimit]
 * @returns {"send"|"skip"|"drop"}
 */
export function sendDecision(bufferedAmount, options = {}) {
  const o: any = { ...DEFAULT_BACKPRESSURE_OPTIONS, ...options };
  const buf = Number.isFinite(bufferedAmount) ? bufferedAmount : 0;
  if (buf >= o.hardLimit) return "drop";
  if (buf >= o.softLimit) return o.isKeyframe ? "send" : "skip";
  return "send";
}
