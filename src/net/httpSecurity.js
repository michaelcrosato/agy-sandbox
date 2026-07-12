import crypto from "crypto";
import path from "path";

/**
 * HTTP/WebSocket security helpers shared by the server surface.
 *
 * These guard the admin/sandbox HTTP API, static file serving, request-body
 * size, and client-IP derivation. They are pure and dependency-free so they can
 * be unit-tested without booting a server.
 */

/**
 * Returns true if a socket remote address is a loopback address, covering the
 * IPv4, IPv6, and IPv4-mapped-IPv6 forms Node reports.
 *
 * @param {string|undefined|null} address - `req.socket.remoteAddress`.
 * @returns {boolean}
 */
export function isLoopbackAddress(address) {
  if (!address || typeof address !== "string") return false;
  const addr = address.trim().toLowerCase();
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.startsWith("127.") ||
    addr.startsWith("::ffff:127.")
  );
}

/**
 * Constant-time string comparison that never short-circuits on length.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a comparison to avoid leaking length via early return timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Decides whether a request may reach an administrative/sandbox endpoint.
 *
 * Policy: allow when the caller is on the loopback interface (local operator
 * tooling and the integration test suite), OR when a non-empty `adminToken` is
 * configured and the request presents a matching `x-admin-token` header. When
 * no token is configured, only loopback callers are admitted — a remote request
 * is refused rather than served with a default credential.
 *
 * @param {import("http").IncomingMessage} req
 * @param {object} opts
 * @param {string} [opts.adminToken] - The configured admin token (env-provided).
 * @returns {boolean}
 */
export function isAdminAuthorized(req, { adminToken } = {}) {
  const remote = req && req.socket ? req.socket.remoteAddress : undefined;
  if (isLoopbackAddress(remote)) return true;

  if (adminToken && typeof adminToken === "string") {
    const provided =
      req && req.headers ? req.headers["x-admin-token"] : undefined;
    if (typeof provided === "string" && safeEqual(provided, adminToken)) {
      return true;
    }
  }
  return false;
}

/**
 * Reads a request body into a string, aborting if it exceeds `maxBytes`.
 *
 * @param {import("http").IncomingMessage} req
 * @param {number} [maxBytes=65536] - Hard cap; the socket is destroyed past it.
 * @returns {Promise<string>} Resolves with the collected body.
 */
export function readBodyWithLimit(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        /** @type {Error & { code?: string }} */
        const err = new Error("Request body exceeds maximum allowed size");
        err.code = "E_BODY_TOO_LARGE";
        try {
          req.destroy();
        } catch {
          // ignore
        }
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
  });
}

// Static assets the game client and dashboards actually load, by extension.
const STATIC_EXTENSION_ALLOWLIST = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
]);

// Directories that must never be served statically even if inside the root.
const STATIC_DENIED_PREFIXES = [
  "data",
  "node_modules",
  "plan",
  "docs",
  "tickets",
];

/**
 * Resolves a request path to a safe absolute file path for static serving, or
 * returns null if it must be refused. Blocks path traversal outside the root,
 * dotfiles (`.env`, `.git/...`), non-allowlisted extensions (`.json`, `.md`,
 * `.py`, `.ps1`, …), and sensitive directories.
 *
 * @param {string} rootDir - Absolute repository/serving root.
 * @param {string} urlPath - Already query-stripped request path (e.g. "/index.html").
 * @returns {string|null} Absolute file path to serve, or null to refuse.
 */
export function resolveStaticFile(rootDir, urlPath) {
  let rel = urlPath;
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel === "/dashboard-codex") rel = "/dashboard-codex.html";

  // Reject encoded traversal or NUL before any filesystem resolution.
  if (rel.includes("\0") || rel.includes("%2e") || rel.includes("%2f")) {
    return null;
  }

  const decodedRel = rel.replace(/^\/+/, "");
  const segments = decodedRel.split(/[/\\]/);

  // Block dotfiles/dotdirs (.env, .git, .aiignore, ..) at any depth.
  if (segments.some((seg) => seg.startsWith("."))) {
    return null;
  }

  // Block sensitive top-level directories.
  if (segments.length > 1 && STATIC_DENIED_PREFIXES.includes(segments[0])) {
    return null;
  }

  const ext = path.extname(decodedRel).toLowerCase();
  if (!STATIC_EXTENSION_ALLOWLIST.has(ext)) {
    return null;
  }

  const resolvedRoot = path.resolve(rootDir);
  const filePath = path.resolve(resolvedRoot, decodedRel);
  if (
    filePath !== resolvedRoot &&
    !filePath.startsWith(resolvedRoot + path.sep)
  ) {
    return null;
  }
  return filePath;
}

/**
 * Derives the client IP for flood/rate accounting. `X-Forwarded-For` is only
 * honored when `trustProxy` is enabled (server sits behind a known proxy that
 * sets it); otherwise the header is attacker-controlled and ignored in favor of
 * the real socket peer address.
 *
 * @param {import("http").IncomingMessage} req
 * @param {object} [opts]
 * @param {boolean} [opts.trustProxy=false]
 * @returns {string}
 */
export function clientIpFromRequest(req, { trustProxy = false } = {}) {
  if (!req) return "unknown";
  if (trustProxy && req.headers && req.headers["x-forwarded-for"]) {
    const first = String(req.headers["x-forwarded-for"]).split(",")[0].trim();
    if (first) return first;
  }
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return "unknown";
}

/**
 * Whether the process trusts a fronting proxy's forwarding headers.
 * @returns {boolean}
 */
export function isProxyTrusted() {
  const v = process.env.TRUST_PROXY;
  return v === "1" || v === "true";
}
