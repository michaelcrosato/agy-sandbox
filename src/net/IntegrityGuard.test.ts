import { describe, test, expect, beforeEach, afterEach } from "vitest";
/**
 * IntegrityGuard.test.js (spec 134) — comprehensive verification suite
 * for global prototype freeze and object integrity sentry.
 */

import { IntegrityGuard } from "./IntegrityGuard.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

describe("IntegrityGuard", () => {
  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    IntegrityGuard.stop();
    SandboxSecurityRegistry.clearRegistry();
    // Clean up any test global leakage
    delete globalThis.maliciousGlobal;
  });

  test("should start, stop, and report active status correctly", () => {
    expect(IntegrityGuard.isActive()).toBe(false);
    IntegrityGuard.start(50);
    expect(IntegrityGuard.isActive()).toBe(true);
    IntegrityGuard.stop();
    expect(IntegrityGuard.isActive()).toBe(false);
  });

  test("should block and log defineProperty attempts on protected prototypes", () => {
    IntegrityGuard.start(50);

    expect(() => {
      Object.defineProperty(Array.prototype, "unauthorizedExploit", {
        value: () => "evil",
        configurable: true,
      });
    }).toThrow(/SECURITY BLOCKED/);

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.recent_violations[0].category).toBe("integrity");
    expect(metrics.recent_violations[0].action).toBe("prototype_tamper");
    expect(metrics.recent_violations[0].details.property).toBe(
      "unauthorizedExploit",
    );
  });

  test("should block and log setPrototypeOf attempts on protected constructors/prototypes", () => {
    IntegrityGuard.start(50);

    expect(() => {
      Object.setPrototypeOf(Array.prototype, { custom: "proto" });
    }).toThrow(/SECURITY BLOCKED/);

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.recent_violations[0].category).toBe("integrity");
    expect(metrics.recent_violations[0].action).toBe("prototype_tamper");
  });

  test("should intercept, log, and self-heal global scope pollution violations", async () => {
    IntegrityGuard.start(30);

    // Pollute global scope
    globalThis.maliciousGlobal = "evil-payload";

    // Wait shortly for the periodic sentry scanner to fire
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Sentry must have detected, logged, and deleted the global property
    expect(globalThis.maliciousGlobal).toBeUndefined();

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.recent_violations[0].category).toBe("integrity");
    expect(metrics.recent_violations[0].action).toBe("global_pollution");
    expect(metrics.recent_violations[0].details.property).toBe(
      "maliciousGlobal",
    );
  });
});
