import { describe, test, expect, beforeEach, afterEach } from "vitest";
/**
 * DnsEgressSentry.test.js (SPEC-173) — comprehensive test suite
 * for the DNS exfiltration and tunneling sentry.
 */

import dns from "node:dns";
import { DnsEgressSentry } from "./DnsEgressSentry.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

describe("DnsEgressSentry", () => {
  const allowlist = ["google.com", "api.google.com", "localhost"];

  beforeEach(() => {
    DnsEgressSentry.deactivate();
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    DnsEgressSentry.deactivate();
  });

  describe("checkHostname validation", () => {
    test("should allow standard loopback queries", () => {
      expect(
        DnsEgressSentry.checkHostname("localhost", allowlist).allowed,
      ).toBe(true);
      expect(
        DnsEgressSentry.checkHostname("127.0.0.1", allowlist).allowed,
      ).toBe(true);
      expect(DnsEgressSentry.checkHostname("::1", allowlist).allowed).toBe(
        true,
      );
    });

    test("should permit allowlisted domains exactly", () => {
      expect(
        DnsEgressSentry.checkHostname("google.com", allowlist).allowed,
      ).toBe(true);
      expect(
        DnsEgressSentry.checkHostname("api.google.com", allowlist).allowed,
      ).toBe(true);
    });

    test("should permit standard safe subdomains", () => {
      expect(
        DnsEgressSentry.checkHostname("www.google.com", allowlist).allowed,
      ).toBe(true);
      expect(
        DnsEgressSentry.checkHostname("dev.api.google.com", allowlist).allowed,
      ).toBe(true);
    });

    test("should block non-allowlisted domains", () => {
      const res = DnsEgressSentry.checkHostname("evil.com", allowlist);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain(
        "Outbound firewall blocked non-allowlisted host domain",
      );
    });

    test("should block non-allowlisted subdomains of other domains", () => {
      expect(
        DnsEgressSentry.checkHostname("sub.evil.com", allowlist).allowed,
      ).toBe(false);
    });

    test("should block subdomain depths exceeding 3 levels", () => {
      // 4 levels of subdomains: a, b, c, d
      const res = DnsEgressSentry.checkHostname(
        "a.b.c.d.google.com",
        allowlist,
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Subdomain depth exceeds limit of 3 levels");
    });

    test("should block subdomain lengths exceeding 64 characters", () => {
      const longSub = "a".repeat(65);
      const res = DnsEgressSentry.checkHostname(
        `${longSub}.google.com`,
        allowlist,
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain(
        "Subdomain length exceeds limit of 64 characters",
      );
    });

    test("should block highly random subdomains containing potential exfiltrated key signatures (entropy)", () => {
      // Highly random hex string (length 32)
      const randomPayload = "4a8f9b2c3d7e6f0a1b2c3d4e5f6a7b8c";
      const res = DnsEgressSentry.checkHostname(
        `${randomPayload}.google.com`,
        allowlist,
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain(
        "Potential DNS tunneling exfiltration detected",
      );
    });
  });

  describe("API resolution monkey patching", () => {
    beforeEach(() => {
      DnsEgressSentry.activate();
    });

    test("should successfully resolve allowed domains under patched callback lookup", () =>
      new Promise((resolve) => {
        dns.lookup("localhost", (err, address) => {
          expect(err).toBeNull();
          expect(address).toBeDefined();
          resolve();
        });
      }));

    test("should fail resolving blocked domains with ENETUNREACH under callback lookup", () =>
      new Promise((resolve) => {
        dns.lookup("evil.com", (err) => {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe("ENETUNREACH");
          expect(err.message).toContain(
            "Outbound firewall blocked non-allowlisted host domain",
          );

          // Should log in SandboxSecurityRegistry
          const metrics = SandboxSecurityRegistry.getMetrics();
          expect(metrics.security_violations_total).toBe(1);
          expect(metrics.security_violations_by_category.firewall).toBe(1);
          resolve();
        });
      }));

    test("should fail resolving blocked resolves with ENETUNREACH under callback resolve4", () =>
      new Promise((resolve) => {
        dns.resolve4("evil.com", (err) => {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe("ENETUNREACH");
          resolve();
        });
      }));

    test("should fail resolving high-entropy tunneling domain under callback resolveTxt", () =>
      new Promise((resolve) => {
        const payload = "4a8f9b2c3d7e6f0a1b2c3d4e5f6a7b8c";
        dns.resolveTxt(`${payload}.google.com`, (err) => {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe("ENETUNREACH");
          expect(err.message).toContain(
            "Potential DNS tunneling exfiltration detected",
          );
          resolve();
        });
      }));

    test("should return a rejected promise under promises.lookup for blocked domain", async () => {
      await expect(dns.promises.lookup("evil.com")).rejects.toThrow(
        "Outbound firewall blocked non-allowlisted host domain",
      );
    });

    test("should return a rejected promise under promises.resolve4 for blocked domain", async () => {
      await expect(dns.promises.resolve4("evil.com")).rejects.toThrow(
        "Outbound firewall blocked non-allowlisted host domain",
      );
    });

    test("should return a rejected promise under promises.resolveTxt for tunneling domain", async () => {
      const payload = "4a8f9b2c3d7e6f0a1b2c3d4e5f6a7b8c";
      await expect(
        dns.promises.resolveTxt(`${payload}.google.com`),
      ).rejects.toThrow("Potential DNS tunneling exfiltration detected");
    });
  });

  describe("Teardown Restoration", () => {
    test("should completely restore core native methods upon deactivate", () => {
      const originalLookup = dns.lookup;
      DnsEgressSentry.activate();
      expect(dns.lookup).not.toBe(originalLookup);

      DnsEgressSentry.deactivate();
      expect(dns.lookup).toBe(originalLookup);
    });
  });
});
