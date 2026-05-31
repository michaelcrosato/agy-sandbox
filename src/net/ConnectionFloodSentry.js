/**
 * ConnectionFloodSentry.js (SPEC-127)
 * High-performance inbound connection rate-limiting and concurrent IP sentry.
 * Enforces strict ceilings on concurrent WebSocket connections per unique client remote IP,
 * and tracks socket bounds to prevent distributed flood attacks and host memory exhaustion.
 */
export class ConnectionFloodSentry {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxConnectionsPerIp=5] - Absolute concurrent socket ceiling per unique remote IP.
   */
  constructor({ maxConnectionsPerIp = 5 } = {}) {
    this.maxConnectionsPerIp = maxConnectionsPerIp;
    /** @type {Map<string, number>} */
    this.activeConnectionsByIp = new Map();
  }

  /**
   * Registers a connection attempt from a remote IP address.
   * If the limit is crossed, returns { allowed: false, reason: string }.
   * Otherwise, increments the count and returns { allowed: true }.
   *
   * @param {string} ip
   * @returns {{ allowed: boolean; reason?: string }}
   */
  register(ip) {
    if (!ip || typeof ip !== "string") {
      return { allowed: true }; // Bypassed for invalid/empty IPs (safeguard)
    }

    // Always allow local loopback connections to bypass flood restrictions
    // (covers local unit/integration tests and sharded proxies)
    const normalized = ip.trim().toLowerCase();
    if (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "::ffff:127.0.0.1"
    ) {
      return { allowed: true };
    }

    const currentCount = this.activeConnectionsByIp.get(normalized) || 0;
    if (currentCount >= this.maxConnectionsPerIp) {
      return {
        allowed: false,
        reason: `Connection flood protection blocked IP: ${ip}. Active connection count (${currentCount}) has reached the maximum concurrent ceiling of ${this.maxConnectionsPerIp}.`,
      };
    }

    this.activeConnectionsByIp.set(normalized, currentCount + 1);
    return { allowed: true };
  }

  /**
   * Decrements the active connection count for a remote IP address when a socket closes.
   *
   * @param {string} ip
   */
  deregister(ip) {
    if (!ip || typeof ip !== "string") return;

    const normalized = ip.trim().toLowerCase();
    if (this.activeConnectionsByIp.has(normalized)) {
      const currentCount = this.activeConnectionsByIp.get(normalized);
      if (currentCount <= 1) {
        this.activeConnectionsByIp.delete(normalized);
      } else {
        this.activeConnectionsByIp.set(normalized, currentCount - 1);
      }
    }
  }

  /**
   * Resets all tracked connections.
   */
  reset() {
    this.activeConnectionsByIp.clear();
  }
}
