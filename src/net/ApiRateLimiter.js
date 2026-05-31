import http from "http";
import https from "https";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

/**
 * ApiRateLimiter (P0).
 *
 * Active sliding-window API rate limiter and outbound network sentinel.
 * Protects host budgets from runaway recursive LLM API calls and restricts
 * egress destinations to a secure, developer-configured allowlist.
 */
export class ApiRateLimiter {
  /**
   * @param {Object} [config]
   * @param {number} [config.maxPerMinute=5] - Maximum API calls allowed per minute.
   * @param {number} [config.maxPerHour=100] - Maximum API calls allowed per hour.
   * @param {Array<string>} [config.allowlistDomains] - Approved egress domains (allow wildcard subdomains).
   */
  constructor({
    maxPerMinute = 5,
    maxPerHour = 100,
    allowlistDomains = ["google.com", "api.google.com"],
  } = {}) {
    this.maxPerMinute = maxPerMinute;
    this.maxPerHour = maxPerHour;
    this.allowlistDomains = allowlistDomains.map((d) => d.toLowerCase());

    /** @type {Array<number>} */
    this.requestTimestamps = [];
    this.blockCount = 0;
    this.expendedTokens = 0;
  }

  /**
   * Evaluates if a request URL meets egress allowlist and sliding window criteria.
   *
   * @param {string} urlString - Target URL destination.
   * @returns {{ allowed: boolean; reason?: string }} Assessment outcome.
   */
  checkRequest(urlString) {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (_err) {
      this.blockCount++;
      return { allowed: false, reason: `Invalid URL: ${urlString}` };
    }

    const host = parsedUrl.hostname.toLowerCase();

    // 1. Outbound Domain Sentinel Validation
    const isAllowed = this.allowlistDomains.some((domain) => {
      return host === domain || host.endsWith("." + domain);
    });

    if (!isAllowed) {
      this.blockCount++;
      const reason = `Outbound sentinel blocked non-allowlisted domain: ${host}`;
      SandboxSecurityRegistry.logViolation("rate_limit", "api_call", {
        url: urlString,
        reason,
      });
      return {
        allowed: false,
        reason,
      };
    }

    // 2. Sliding-Window Limit Checks
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    // Keep memory lean: prune timestamps older than 1 hour
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => t > oneHourAgo,
    );

    const callsInLastMinute = this.requestTimestamps.filter(
      (t) => t > oneMinuteAgo,
    ).length;
    if (callsInLastMinute >= this.maxPerMinute) {
      this.blockCount++;
      const reason = `API Rate Limit Exceeded: max ${this.maxPerMinute} per minute. (Calls in last minute: ${callsInLastMinute})`;
      SandboxSecurityRegistry.logViolation("rate_limit", "api_call", {
        url: urlString,
        reason,
      });
      return {
        allowed: false,
        reason,
      };
    }

    const callsInLastHour = this.requestTimestamps.length;
    if (callsInLastHour >= this.maxPerHour) {
      this.blockCount++;
      const reason = `API Rate Limit Exceeded: max ${this.maxPerHour} per hour. (Calls in last hour: ${callsInLastHour})`;
      SandboxSecurityRegistry.logViolation("rate_limit", "api_call", {
        url: urlString,
        reason,
      });
      return {
        allowed: false,
        reason,
      };
    }

    // Request is accepted: append timestamp and record simulated token usage
    this.requestTimestamps.push(now);
    this.expendedTokens += 1000; // Simulated token cost burn
    return { allowed: true };
  }

  /**
   * Resets all sliding windows, block counts, and token telemetry metrics.
   */
  reset() {
    this.requestTimestamps = [];
    this.blockCount = 0;
    this.expendedTokens = 0;
  }
}

// Keep track of patched global endpoints to avoid multi-patching leaks
let originalHttpRequest = null;
let originalHttpsRequest = null;
let originalHttpGet = null;
let originalHttpsGet = null;
let originalFetch = null;

/**
 * Activates monkey-patching on core Node.js http/https and globalThis.fetch
 * interfaces to strictly redirect and govern all outbound egress network calls.
 *
 * @param {ApiRateLimiter} limiter - The active rate limiter governance instance.
 */
export function activateOutboundSentinel(limiter) {
  if (originalHttpRequest) return; // Prevent double-wrapping

  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;
  originalHttpGet = http.get;
  originalHttpsGet = https.get;

  if (typeof globalThis.fetch === "function") {
    originalFetch = globalThis.fetch;
  }

  // Intercept http.request
  http.request = function (options, callback) {
    const urlStr = getUrlFromOptions(options, "http:");
    const evaluation = limiter.checkRequest(urlStr);

    if (!evaluation.allowed) {
      /** @type {any} */
      const err = new Error(evaluation.reason);
      err.code = "ENETUNREACH"; // Standard network unreachable error code
      const mockReq = new (class extends http.ClientRequest {
        constructor() {
          let safeOptions;
          if (typeof options === "string") {
            try {
              const urlObj = new URL(options);
              safeOptions = {
                protocol: urlObj.protocol,
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
              };
            } catch (_e) {
              safeOptions = { path: options };
            }
          } else if (options instanceof URL) {
            safeOptions = {
              protocol: options.protocol,
              hostname: options.hostname,
              port: options.port,
              path: options.pathname + options.search,
            };
          } else {
            safeOptions = { ...options };
          }

          /** @type {any} */
          const dummyAgent = new http.Agent();
          dummyAgent.addRequest = () => {}; // Prevent background connection/DNS resolution
          super({ ...safeOptions, agent: dummyAgent }, callback);

          process.nextTick(() => {
            this.emit("error", err);
          });
        }
      })();
      return mockReq;
    }

    return originalHttpRequest.call(http, options, callback);
  };

  // Intercept http.get
  http.get = function (options, callback) {
    const req = http.request(options, callback);
    req.end();
    return req;
  };

  // Intercept https.request
  https.request = function (options, callback) {
    const urlStr = getUrlFromOptions(options, "https:");
    const evaluation = limiter.checkRequest(urlStr);

    if (!evaluation.allowed) {
      /** @type {any} */
      const err = new Error(evaluation.reason);
      err.code = "ENETUNREACH";
      const mockReq = new (class extends http.ClientRequest {
        constructor() {
          let safeOptions;
          if (typeof options === "string") {
            try {
              const urlObj = new URL(options.replace(/^https:/i, "http:"));
              safeOptions = {
                protocol: "http:",
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
              };
            } catch (_e) {
              safeOptions = { path: options, protocol: "http:" };
            }
          } else if (options instanceof URL) {
            safeOptions = {
              protocol: "http:",
              hostname: options.hostname,
              port: options.port,
              path: options.pathname + options.search,
            };
          } else {
            safeOptions = { ...options, protocol: "http:" };
          }

          /** @type {any} */
          const dummyAgent = new http.Agent();
          dummyAgent.addRequest = () => {}; // Prevent background connection/DNS resolution
          super({ ...safeOptions, agent: dummyAgent }, callback);

          process.nextTick(() => {
            this.emit("error", err);
          });
        }
      })();
      return mockReq;
    }

    return originalHttpsRequest.call(https, options, callback);
  };

  // Intercept https.get
  https.get = function (options, callback) {
    const req = https.request(options, callback);
    req.end();
    return req;
  };

  // Intercept globalThis.fetch if active
  if (originalFetch) {
    globalThis.fetch = async function (input, init) {
      let urlStr = "";
      if (typeof input === "string") {
        urlStr = input;
      } else if (input instanceof URL) {
        urlStr = input.toString();
      } else if (input && typeof input === "object" && "url" in input) {
        urlStr = input.url;
      }

      const evaluation = limiter.checkRequest(urlStr);
      if (!evaluation.allowed) {
        throw new TypeError(`fetch failed: ${evaluation.reason}`);
      }

      return originalFetch(input, init);
    };
  }
}

/**
 * Safely deactivates all monkey-patches, restoring the original Node.js core
 * HTTP request methods and standard web fetch.
 */
export function deactivateOutboundSentinel() {
  if (!originalHttpRequest) return;

  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;

  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }

  originalHttpRequest = null;
  originalHttpsRequest = null;
  originalHttpGet = null;
  originalHttpsGet = null;
  originalFetch = null;
}

/**
 * Reconstructs a full URL string segment from standard http.request options.
 *
 * @param {string | URL | Object} options - Raw http request option structures.
 * @param {string} defaultProtocol - Protocol fallback (e.g. 'http:').
 * @returns {string} Fully parsed destination URL segment.
 */
function getUrlFromOptions(options, defaultProtocol) {
  if (typeof options === "string") return options;
  if (options instanceof URL) return options.toString();

  const protocol = options.protocol || defaultProtocol;
  const host = options.hostname || options.host || "localhost";
  const port = options.port ? `:${options.port}` : "";
  const path = options.path || "/";
  return `${protocol}//${host}${port}${path}`;
}
