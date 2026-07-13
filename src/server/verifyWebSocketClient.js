import { isAllowedOrigin } from "../net/originPolicy.js";
import { clientIpFromRequest, isProxyTrusted } from "../net/httpSecurity.js";

/**
 * Validates WebSocket connection upgrades (URI length, payload length, allowed origins, flood sentry).
 * @param {Object} info Connection info metadata.
 * @param {Function} cb Callback function to accept or reject.
 * @param {Object} options Configuration dependencies.
 * @param {string[]} options.allowedOrigins Allowlisted client origins.
 * @param {Object} options.connectionFloodSentry Sentry instance managing IP connection counts.
 * @returns {*}
 */
export function verifyWebSocketClient(
  info,
  cb,
  { allowedOrigins, connectionFloodSentry },
) {
  const req = info.req;

  // 1. Raw upgrade URI length validation (>2048)
  if (req && req.url && req.url.length > 2048) {
    console.warn(
      `[ws] rejected upgrade: request URI length (${req.url.length}) exceeds maximum limit (2048)`,
    );
    return cb(false, 414, "URI Too Long");
  }

  // 2. Raw Content-Length validation (>4096)
  if (req && req.headers) {
    const contentLengthHeader = req.headers["content-length"];
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > 4096) {
        console.warn(
          `[ws] rejected upgrade: request Content-Length (${contentLength}) exceeds maximum limit (4096)`,
        );
        return cb(false, 413, "Payload Too Large");
      }
    }
  }

  // 3. Origin checking
  const allowed = isAllowedOrigin(info.origin, {
    host: req && req.headers ? req.headers.host : "",
    allow: allowedOrigins,
  });
  if (!allowed) {
    console.warn(
      `[ws] rejected upgrade from disallowed origin: ${info.origin}`,
    );
    return cb(false, 403, "Forbidden");
  }

  // 4. Inbound Connection Flood Protection & Active IP Sentry.
  // X-Forwarded-For is spoofable unless the server is behind a trusted proxy,
  // so it is only honored when TRUST_PROXY is set (else flood limits are
  // trivially bypassed by rotating a fake header).
  const ip = clientIpFromRequest(req, { trustProxy: isProxyTrusted() });

  const floodCheck = connectionFloodSentry.register(ip);
  if (!floodCheck.allowed) {
    console.warn(`[ws] rejected upgrade from ${ip}: ${floodCheck.reason}`);
    return cb(false, 429, "Too Many Requests");
  }

  cb(true);
}
