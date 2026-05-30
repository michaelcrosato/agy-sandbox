/**
 * wsCompression — `permessage-deflate` configuration + evaluation helper (spec 037).
 *
 * `ws` supports the permessage-deflate extension but disables it server-side by
 * default, because (per 2026 guidance) it trades wire size for real CPU/memory:
 * Node's zlib can fragment memory badly at high concurrency. Since the broadcast
 * is already shrunk by AoI (spec 014) + the binary protocol (spec 015), this is
 * an **opt-in, measure-first** knob, not a default.
 *
 * This module owns the (data-only) deflate option so the decision is unit-testable
 * and the server just consumes it behind the `WS_COMPRESSION` flag.
 *
 * Recommendation (measured in wsCompression.test.js): deflate meaningfully
 * shrinks large text frames, but the binary state channel is already compact, so
 * the CPU/memory cost rarely pays off for the hot path. Keep it OFF by default;
 * enable only if profiling shows egress bandwidth (not CPU) is the bottleneck —
 * and consider scoping it to the JSON channels (chat/market) rather than the
 * binary state broadcast.
 */

/**
 * Recommended `ws` perMessageDeflate tuning when compression is enabled:
 * only compress frames above `threshold` bytes, cap zlib concurrency, and
 * disable context takeover so per-connection memory stays bounded.
 */
export const DEFAULT_DEFLATE_OPTIONS = Object.freeze({
  threshold: 1024,
  concurrencyLimit: 10,
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
});

/**
 * The value to pass as the `WebSocketServer`'s `perMessageDeflate` option.
 * `false` (the ws default) when disabled; the tuned options object when enabled.
 * @param {boolean} enabled
 * @returns {false|Object}
 */
export function perMessageDeflateOption(enabled) {
  return enabled ? DEFAULT_DEFLATE_OPTIONS : false;
}
