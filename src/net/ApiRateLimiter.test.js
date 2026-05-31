import http from "http";
import https from "https";
import {
  ApiRateLimiter,
  activateOutboundSentinel,
  deactivateOutboundSentinel,
} from "./ApiRateLimiter.js";

describe("ApiRateLimiter & Outbound Network Sentinel", () => {
  let limiter;

  beforeEach(() => {
    limiter = new ApiRateLimiter({
      maxPerMinute: 3,
      maxPerHour: 5,
      allowlistDomains: ["google.com", "api.openai.com", "localhost"],
    });
  });

  afterEach(() => {
    deactivateOutboundSentinel();
  });

  test("constructor options fallback to defaults", () => {
    const defaultLimiter = new ApiRateLimiter();
    expect(defaultLimiter.maxPerMinute).toBe(5);
    expect(defaultLimiter.maxPerHour).toBe(100);
    expect(defaultLimiter.allowlistDomains).toContain("google.com");
  });

  test("allows allowlisted exact domains and subdomains", () => {
    // Exact domain
    expect(limiter.checkRequest("https://google.com/search").allowed).toBe(
      true,
    );
    // Subdomain matching
    expect(limiter.checkRequest("https://api.google.com/v1").allowed).toBe(
      true,
    );
    // Alternate domain
    expect(limiter.checkRequest("https://api.openai.com/v1/chat").allowed).toBe(
      true,
    );
    expect(limiter.blockCount).toBe(0);
  });

  test("blocks unauthorized non-allowlisted domains", () => {
    const res = limiter.checkRequest("https://malicious.ru/steal-tokens");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Outbound sentinel blocked non-allowlisted");
    expect(limiter.blockCount).toBe(1);
  });

  test("blocks invalid URL paths safely", () => {
    const res = limiter.checkRequest("not-a-valid-url");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Invalid URL");
    expect(limiter.blockCount).toBe(1);
  });

  test("enforces sliding-window minute limits", () => {
    // Max per minute is 3
    expect(limiter.checkRequest("https://google.com/1").allowed).toBe(true);
    expect(limiter.checkRequest("https://google.com/2").allowed).toBe(true);
    expect(limiter.checkRequest("https://google.com/3").allowed).toBe(true);

    const blocked = limiter.checkRequest("https://google.com/4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain(
      "API Rate Limit Exceeded: max 3 per minute",
    );
    expect(limiter.blockCount).toBe(1);
    expect(limiter.expendedTokens).toBe(3000); // 3 successful calls
  });

  test("enforces sliding-window hour limits", () => {
    // Max per hour is 5, max per minute is 3.
    // Let's manually populate old timestamps inside the minute window but outside
    // the current seconds so we only hit the hourly limit.
    const now = Date.now();
    limiter.requestTimestamps = [
      now - 5 * 60000, // 5 mins ago
      now - 4 * 60000,
      now - 3 * 60000,
      now - 2 * 60000,
      now - 1 * 60000, // 1 min ago
    ];

    const blocked = limiter.checkRequest("https://google.com/6");
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("API Rate Limit Exceeded: max 5 per hour");
  });

  test("reset clears all metrics and history", () => {
    limiter.checkRequest("https://google.com/1");
    limiter.checkRequest("https://malicious.com");
    expect(limiter.requestTimestamps).toHaveLength(1);
    expect(limiter.blockCount).toBe(1);
    expect(limiter.expendedTokens).toBe(1000);

    limiter.reset();
    expect(limiter.requestTimestamps).toHaveLength(0);
    expect(limiter.blockCount).toBe(0);
    expect(limiter.expendedTokens).toBe(0);
  });

  describe("Outbound Sentinel Pre-Flight Interceptions", () => {
    beforeEach(() => {
      activateOutboundSentinel(limiter);
    });

    test("http.request permits authorized requests", () => {
      // Since it's allowlisted (localhost), it passes through to original request.
      // We don't verify connection completion, just check that it returns a ClientRequest object.
      const req = http.request({
        host: "localhost",
        port: 18080,
        path: "/metrics",
      });
      expect(req).toBeDefined();
      req.abort(); // Clean up socket connection
    });

    test("http.request intercepts and emits pre-flight validation error on block", (done) => {
      const req = http.request(
        {
          host: "malicious.com",
          path: "/leak",
        },
        (_res) => {
          done(
            new Error("Should not invoke response callback on blocked domain"),
          );
        },
      );

      req.on("error", (err) => {
        expect(err.message).toContain(
          "Outbound sentinel blocked non-allowlisted",
        );
        expect(err.code).toBe("ENETUNREACH");
        done();
      });
    });

    test("https.request intercepts and emits pre-flight validation error on block", (done) => {
      const req = https.request(
        "https://secret-leak.com/exfiltrate",
        (_res) => {
          done(
            new Error("Should not invoke response callback on blocked domain"),
          );
        },
      );

      req.on("error", (err) => {
        expect(err.message).toContain("Outbound sentinel blocked");
        expect(err.code).toBe("ENETUNREACH");
        done();
      });
    });

    test("globalThis.fetch intercepts and throws on block", async () => {
      if (typeof globalThis.fetch === "function") {
        await expect(
          globalThis.fetch("https://not-allowlisted.com/api"),
        ).rejects.toThrow(/fetch failed: Outbound sentinel blocked/);
      }
    });
  });
});
