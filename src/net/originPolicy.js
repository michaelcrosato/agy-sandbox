/**
 * originPolicy (spec 002) — pure decision for whether to accept a WebSocket
 * upgrade based on its `Origin` header. Defends against Cross-Site WebSocket
 * Hijacking (CSWSH): a browser always sends `Origin`, and it cannot be spoofed
 * from page script, so we accept only same-origin connections (the page host
 * equals the WS host — true for localhost AND any tunnel the game is served
 * through) plus an explicit allowlist. Non-browser tools (no `Origin`) are
 * allowed by default so CLIs/tests still work.
 *
 * Pure: no DOM, sockets, env, or `Math.random`.
 */

/**
 * Extracts the host (`host:port`) from an origin/URL string; returns the input
 * lowercased if it is not a parseable URL (e.g. a bare host entry).
 * @param {string} s
 * @returns {string}
 */
function hostOf(s) {
  const lower = String(s).toLowerCase();
  try {
    return new URL(lower).host;
  } catch {
    return lower;
  }
}

/**
 * Decides whether a WebSocket connection from `origin` is allowed.
 * @param {string|undefined|null} origin - The request's `Origin` header.
 * @param {Object} [options]
 * @param {string} [options.host] - The upgrade request's `Host` header (for the
 *   same-origin check).
 * @param {ReadonlyArray<string>} [options.allow] - Allowlist of full origins or
 *   bare hosts; `"*"` allows any.
 * @param {boolean} [options.allowNoOrigin=true] - Allow connections that send no
 *   `Origin` (non-browser tools).
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, options = {}) {
  const { host = "", allow = [], allowNoOrigin = true } = options;
  if (origin === undefined || origin === null || origin === "") {
    return allowNoOrigin;
  }
  if (Array.isArray(allow) && allow.includes("*")) return true;

  const originLower = String(origin).toLowerCase();
  const originHost = hostOf(originLower);
  const hostLower = String(host).toLowerCase();

  // Same-origin: the page that opened the socket is served from the same host.
  if (hostLower && originHost && originHost === hostLower) return true;

  return (Array.isArray(allow) ? allow : []).some((entry) => {
    const e = String(entry).toLowerCase();
    if (!e) return false;
    return e === originLower || hostOf(e) === originHost || e === originHost;
  });
}
