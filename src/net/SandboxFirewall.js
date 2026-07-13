/**
 * SandboxFirewall.js (SPEC-120)
 * High-performance outbound connection packet-filtering firewall.
 *
 * Governs all network egress requests from Sandboxed runs. Monkey-patches
 * Node's DNS lookups and raw net socket connections to enforce domain allowlists
 * and strictly block private IP subnets (RFC 1918 + AWS metadata).
 */

import dns from "dns";
import net from "net";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

/**
 * High-performance outbound connection packet-filtering firewall.
 */
export class SandboxFirewall {
  /**
   * @param {Object} [options]
   * @param {Array<string>} [options.allowlistDomains] - Standard approved egress domains.
   * @param {number} [options.maxBlockedEvents=100] - Ring-buffer cap on retained block records.
   */
  constructor({
    allowlistDomains = ["google.com", "api.google.com", "localhost"],
    maxBlockedEvents = 100,
  } = {}) {
    this.allowlistDomains = allowlistDomains.map((d) => d.toLowerCase());
    this.blockCount = 0;
    /**
     * Recent block records, retained newest-last and bounded to
     * `maxBlockedEvents`. `blockCount` remains the lifetime total. Bounding this
     * prevents unbounded memory growth (and `/metrics` payload bloat) under
     * sustained egress-block activity from a misbehaving guest run.
     * @type {Array<{host: string, timestamp: number, reason: string}>}
     */
    this.blockedEvents = [];
    this.maxBlockedEvents = maxBlockedEvents;
  }

  /**
   * Appends a block record, trimming the oldest entries past the cap.
   * @param {string} host
   * @param {string} reason
   * @private
   */
  recordBlockedEvent(host, reason) {
    this.blockedEvents.push({ host, timestamp: Date.now(), reason });
    if (this.blockedEvents.length > this.maxBlockedEvents) {
      this.blockedEvents.splice(
        0,
        this.blockedEvents.length - this.maxBlockedEvents,
      );
    }
  }

  /**
   * Identifies if an IP address belongs to standard private subnet blocks.
   *
   * @param {string} ipString
   * @returns {boolean}
   */
  isPrivateIp(ipString) {
    const trimmed = ipString.trim();

    // IPv4 format check
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = trimmed.match(ipv4Regex);
    if (match) {
      const octet1 = parseInt(match[1], 10);
      const octet2 = parseInt(match[2], 10);
      const octet3 = parseInt(match[3], 10);
      const octet4 = parseInt(match[4], 10);

      // Verify octets validity
      if (
        octet1 < 0 ||
        octet1 > 255 ||
        octet2 < 0 ||
        octet2 > 255 ||
        octet3 < 0 ||
        octet3 > 255 ||
        octet4 < 0 ||
        octet4 > 255
      ) {
        return false;
      }

      // Permit localhost loopbacks explicitly
      if (octet1 === 127) return false;

      // 10.0.0.0/8 (RFC 1918)
      if (octet1 === 10) return true;

      // 172.16.0.0/12 (RFC 1918)
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;

      // 192.168.0.0/16 (RFC 1918)
      if (octet1 === 192 && octet2 === 168) return true;

      // 169.254.0.0/16 (Link-local / AWS metadata API)
      if (octet1 === 169 && octet2 === 254) return true;
    }

    // IPv6 format checks
    const lower = trimmed.toLowerCase();
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return false; // Loopback
    if (
      lower.startsWith("fe80:") ||
      lower.startsWith("fc00:") ||
      lower.startsWith("fd00:")
    ) {
      return true; // IPv6 local subnets
    }

    return false;
  }

  /**
   * Asserts whether a connection host is approved under current firewall guidelines.
   *
   * @param {string} host
   * @returns {{ allowed: boolean; reason?: string }}
   */
  checkHost(host) {
    if (!host || typeof host !== "string") {
      return { allowed: false, reason: "Host must be a non-empty string" };
    }

    const lowerHost = host.toLowerCase();

    // Standard loopbacks are fully permitted
    if (
      lowerHost === "localhost" ||
      lowerHost === "127.0.0.1" ||
      lowerHost === "::1"
    ) {
      return { allowed: true };
    }

    // Block private IP hosts
    if (this.isPrivateIp(lowerHost)) {
      this.blockCount++;
      const reason = `Outbound firewall blocked connection to private IP range: ${host}`;
      this.recordBlockedEvent(host, reason);
      SandboxSecurityRegistry.logViolation("firewall", "connect", {
        host,
        reason,
      });
      return { allowed: false, reason };
    }

    // Block non-whitelisted domains
    const isAllowed = this.allowlistDomains.some((domain) => {
      return lowerHost === domain || lowerHost.endsWith("." + domain);
    });

    if (!isAllowed) {
      this.blockCount++;
      const reason = `Outbound firewall blocked non-allowlisted host domain: ${host}`;
      this.recordBlockedEvent(host, reason);
      SandboxSecurityRegistry.logViolation("firewall", "connect", {
        host,
        reason,
      });
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Asserts whether a resolved endpoint IP address is permitted.
   *
   * @param {string} ip
   * @returns {{ allowed: boolean; reason?: string }}
   */
  checkIp(ip) {
    if (!ip || typeof ip !== "string") {
      return { allowed: true };
    }

    if (this.isPrivateIp(ip)) {
      this.blockCount++;
      const reason = `Outbound firewall blocked resolved private IP: ${ip}`;
      this.recordBlockedEvent(ip, reason);
      SandboxSecurityRegistry.logViolation("firewall", "connect", {
        host: ip,
        reason,
      });
      return { allowed: false, reason };
    }

    return { allowed: true };
  }
}

// Module levels to safeguard native implementations
let originalDnsLookup = null;
let originalNetConnect = null;
let originalNetCreateConnection = null;

/**
 * Activates active low-overhead DNS and socket level monkeypatching sentries.
 *
 * @param {SandboxFirewall} firewall
 */
export function activateFirewall(firewall) {
  if (originalDnsLookup) return; // Prevent double patch

  originalDnsLookup = dns.lookup;
  originalNetConnect = net.connect;
  originalNetCreateConnection = net.createConnection;

  // 1. Patch DNS Lookup
  const patchedLookup = function (hostname, options, callback) {
    const actualCallback = typeof options === "function" ? options : callback;

    const hostEval = firewall.checkHost(hostname);
    if (!hostEval.allowed) {
      /** @type {any} */
      const err = new Error(hostEval.reason);
      err.code = "ENETUNREACH";
      if (actualCallback) {
        process.nextTick(() => actualCallback(err));
      }
      return;
    }

    return originalDnsLookup(hostname, options, (err, address, family) => {
      if (!err && address) {
        const ipEval = firewall.checkIp(address);
        if (!ipEval.allowed) {
          /** @type {any} */
          const ipErr = new Error(ipEval.reason);
          ipErr.code = "ENETUNREACH";
          if (actualCallback) actualCallback(ipErr, address, family);
          return;
        }
      }
      if (actualCallback) {
        actualCallback(err, address, family);
      }
    });
  };

  // Copy promisified properties and custom fields to satisfy TypeScript
  Object.assign(patchedLookup, originalDnsLookup);
  if (originalDnsLookup && originalDnsLookup.__promisify__) {
    patchedLookup.__promisify__ = originalDnsLookup.__promisify__;
  }

  dns.lookup = /** @type {any} */ (patchedLookup);

  // 2. Patch socket connection
  net.connect = function (...args) {
    const options = normalizeConnectArgs(args);
    const host = options.host || "localhost";

    const hostEval = firewall.checkHost(host);
    if (!hostEval.allowed) {
      const socket = new net.Socket();
      process.nextTick(() => {
        socket.emit("error", new Error(hostEval.reason));
      });
      return socket;
    }

    return originalNetConnect.apply(net, args);
  };

  net.createConnection = net.connect;
}

/**
 * Restores original native network connection and resolution configurations.
 */
export function deactivateFirewall() {
  if (!originalDnsLookup) return;

  dns.lookup = originalDnsLookup;
  net.connect = originalNetConnect;
  net.createConnection = originalNetCreateConnection;

  originalDnsLookup = null;
  originalNetConnect = null;
  originalNetCreateConnection = null;
}

/**
 * Helper to normalize connection arguments.
 * @private
 */
function normalizeConnectArgs(args) {
  let options = {};
  if (args[0] && typeof args[0] === "object") {
    options = args[0];
  } else if (typeof args[0] === "number") {
    options.port = args[0];
    if (typeof args[1] === "string") {
      options.host = args[1];
    }
  } else if (typeof args[0] === "string") {
    options.path = args[0];
  }
  return options;
}
