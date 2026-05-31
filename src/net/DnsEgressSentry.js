/**
 * DnsEgressSentry.js (SPEC-173) — DNS Egress Firewall & Tunneling Sentry.
 * Intercepts all Node dns resolution methods inside sandboxed guest workers
 * to enforce domain allowlists and block data exfiltration via DNS tunneling.
 */

import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

// Shannon entropy scoring helper
function calculateEntropy(str) {
  if (!str) return 0;
  const len = str.length;
  const frequencies = {};
  for (let i = 0; i < len; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Safely loads allowlist domains from environment or config file
export function loadAllowlist() {
  if (process.env.GUEST_DNS_ALLOWLIST) {
    try {
      const parsed = JSON.parse(process.env.GUEST_DNS_ALLOWLIST);
      if (Array.isArray(parsed)) {
        return parsed.map((d) => d.toLowerCase());
      }
    } catch {
      // fallback
    }
  }

  try {
    const configPath = path.resolve("plan/config.json");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed?.sandboxFirewall?.allowlistDomains) {
        return parsed.sandboxFirewall.allowlistDomains.map((d) =>
          d.toLowerCase(),
        );
      }
    }
  } catch {
    // fallback
  }

  return [
    "google.com",
    "api.google.com",
    "openai.com",
    "api.openai.com",
    "localhost",
    "127.0.0.1",
  ];
}

const originalMethods = new Map();
const originalPromiseMethods = new Map();

export const DnsEgressSentry = {
  /**
   * Evaluates hostname query for DNS tunneling and allowlist conformance.
   * @param {string} hostname
   * @param {Array<string>} allowlist
   * @returns {{ allowed: boolean; reason?: string }}
   */
  checkHostname(hostname, allowlist) {
    if (!hostname || typeof hostname !== "string") {
      return { allowed: false, reason: "Hostname must be a non-empty string" };
    }

    const lower = hostname.toLowerCase().trim();

    // Standard loopbacks are fully permitted
    if (
      lower === "localhost" ||
      lower === "127.0.0.1" ||
      lower === "::1" ||
      lower === "0:0:0:0:0:0:0:1"
    ) {
      return { allowed: true };
    }

    // 1. Strict domain allowlist matching
    const matchedDomain = allowlist.find((domain) => {
      return lower === domain || lower.endsWith("." + domain);
    });

    if (!matchedDomain) {
      return {
        allowed: false,
        reason: `Outbound firewall blocked non-allowlisted host domain: ${hostname}`,
      };
    }

    // Extract the subdomain part prefixing the matched domain
    let subdomain = "";
    if (lower !== matchedDomain) {
      subdomain = lower.substring(0, lower.length - matchedDomain.length - 1);
    }

    if (subdomain) {
      // 2. Subdomain label depth limit (max 3 levels)
      const labels = subdomain.split(".");
      if (labels.length > 3) {
        return {
          allowed: false,
          reason: `Subdomain depth exceeds limit of 3 levels (found ${labels.length} levels in '${subdomain}')`,
        };
      }

      // 3. Subdomain total character length limit (max 64 chars)
      if (subdomain.length > 64) {
        return {
          allowed: false,
          reason: `Subdomain length exceeds limit of 64 characters (found ${subdomain.length} chars in '${subdomain}')`,
        };
      }

      // 4. Subdomain Shannon entropy limit to block hex/base64 tunneling (max 3.85 score for length >= 12)
      if (subdomain.length >= 12) {
        const entropy = calculateEntropy(subdomain);
        if (entropy > 3.85) {
          return {
            allowed: false,
            reason: `Potential DNS tunneling exfiltration detected: high entropy score of ${entropy.toFixed(2)} in '${subdomain}'`,
          };
        }
      }
    }

    return { allowed: true };
  },

  /**
   * Activates zero-trust DNS monkeypatching intercepts on core dns and promises resolution APIs.
   */
  activate() {
    if (originalMethods.size > 0) return; // Prevent double activation

    const allowlist = loadAllowlist();

    // Patch classic callback methods
    for (const key of Object.keys(dns)) {
      if (typeof dns[key] !== "function") continue;
      if (key.startsWith("resolve") || key === "lookup") {
        const original = dns[key];
        originalMethods.set(key, original);

        const patched = function (hostname, ...args) {
          // Find standard callback if present (usually the last argument)
          let callback = null;
          if (args.length > 0 && typeof args[args.length - 1] === "function") {
            callback = args[args.length - 1];
          }

          const evaluation = DnsEgressSentry.checkHostname(hostname, allowlist);
          if (!evaluation.allowed) {
            /** @type {any} */
            const err = new Error(evaluation.reason);
            err.code = "ENETUNREACH";

            SandboxSecurityRegistry.logViolation("firewall", "dns_block", {
              hostname,
              reason: evaluation.reason,
            });

            if (callback) {
              process.nextTick(() => callback(err));
              return;
            }
            throw err;
          }

          return original.call(dns, hostname, ...args);
        };

        // Preserve native static properties (like __promisify__)
        Object.assign(patched, original);
        if (/** @type {any} */ (original).__promisify__) {
          /** @type {any} */ (patched).__promisify__ = /** @type {any} */ (
            original
          ).__promisify__;
        }

        dns[key] = patched;
      }
    }

    // Patch modern promise-based API
    if (dns.promises) {
      for (const key of Object.keys(dns.promises)) {
        if (typeof dns.promises[key] !== "function") continue;
        if (key.startsWith("resolve") || key === "lookup") {
          const original = dns.promises[key];
          originalPromiseMethods.set(key, original);

          const patched = function (hostname, ...args) {
            const evaluation = DnsEgressSentry.checkHostname(
              hostname,
              allowlist,
            );
            if (!evaluation.allowed) {
              /** @type {any} */
              const err = new Error(evaluation.reason);
              err.code = "ENETUNREACH";

              SandboxSecurityRegistry.logViolation("firewall", "dns_block", {
                hostname,
                reason: evaluation.reason,
              });

              return Promise.reject(err);
            }

            return original.call(dns.promises, hostname, ...args);
          };

          Object.assign(patched, original);
          dns.promises[key] = patched;
        }
      }
    }
  },

  /**
   * Deactivates all DNS patches, restoring core native behaviors.
   */
  deactivate() {
    for (const [key, original] of originalMethods.entries()) {
      dns[key] = original;
    }
    originalMethods.clear();

    if (dns.promises) {
      for (const [key, original] of originalPromiseMethods.entries()) {
        dns.promises[key] = original;
      }
      originalPromiseMethods.clear();
    }
  },
};
