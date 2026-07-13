import { describe, test, expect, beforeEach } from "vitest";
import { MemoryLeakSentry } from "./MemoryLeakSentry.js";

describe("MemoryLeakSentry", () => {
  let mockTelemetry;
  let activeLoadStatus;
  let simulatedLeakRate;

  beforeEach(() => {
    activeLoadStatus = true;
    simulatedLeakRate = 0;
    mockTelemetry = {
      getMemoryLeakRate: () => simulatedLeakRate,
    };
  });

  test("triggers GC sweep and increments alerts under high leak rate and active load", () => {
    // Simulated leak rate of 8MB/minute (threshold is 5MB/minute)
    simulatedLeakRate = 8 * 1024 * 1024;

    const sentry = new MemoryLeakSentry({
      sandboxTelemetry: mockTelemetry,
      leakThresholdBytesPerMin: 5 * 1024 * 1024,
      isActiveLoad: () => activeLoadStatus,
    });

    // Mock global.gc
    const originalGc = global.gc;
    let gcCalled = false;
    global.gc = () => {
      gcCalled = true;
    };

    try {
      sentry.check();

      expect(sentry.alertCount).toBe(1);
      expect(sentry.lastAlertTime).not.toBeNull();
      expect(gcCalled).toBe(true);

      const diag = sentry.getDiagnostics();
      expect(diag.alertCount).toBe(1);
      expect(diag.hasFired).toBe(true);
      expect(diag.leakRateBytesPerMin).toBe(8 * 1024 * 1024);
    } finally {
      global.gc = originalGc;
    }
  });

  test("does not trigger GC sweep when leak rate is below threshold", () => {
    // Simulated leak rate of 2MB/minute
    simulatedLeakRate = 2 * 1024 * 1024;

    const sentry = new MemoryLeakSentry({
      sandboxTelemetry: mockTelemetry,
      leakThresholdBytesPerMin: 5 * 1024 * 1024,
      isActiveLoad: () => activeLoadStatus,
    });

    const originalGc = global.gc;
    let gcCalled = false;
    global.gc = () => {
      gcCalled = true;
    };

    try {
      sentry.check();

      expect(sentry.alertCount).toBe(0);
      expect(gcCalled).toBe(false);

      const diag = sentry.getDiagnostics();
      expect(diag.alertCount).toBe(0);
      expect(diag.hasFired).toBe(false);
    } finally {
      global.gc = originalGc;
    }
  });

  test("does not trigger GC sweep under high leak rate when there is no active load", () => {
    // Simulated high leak rate of 12MB/minute
    simulatedLeakRate = 12 * 1024 * 1024;
    activeLoadStatus = false; // No active connections

    const sentry = new MemoryLeakSentry({
      sandboxTelemetry: mockTelemetry,
      leakThresholdBytesPerMin: 5 * 1024 * 1024,
      isActiveLoad: () => activeLoadStatus,
    });

    const originalGc = global.gc;
    let gcCalled = false;
    global.gc = () => {
      gcCalled = true;
    };

    try {
      sentry.check();

      expect(sentry.alertCount).toBe(0);
      expect(gcCalled).toBe(false);
    } finally {
      global.gc = originalGc;
    }
  });

  test("start and stop orchestrate polling loop", () => {
    const sentry = new MemoryLeakSentry({
      sandboxTelemetry: mockTelemetry,
    });

    sentry.start();
    expect(sentry.timer).not.toBeNull();

    sentry.stop();
    expect(sentry.timer).toBeNull();
  });
});
