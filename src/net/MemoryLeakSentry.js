/**
 * MemoryLeakSentry.js (SPEC-121)
 * Lightweight memory leak sentinel and self-healing garbage collector.
 *
 * Monitors memory growth rates using SandboxTelemetry, registers leak alert counts,
 * and automatically triggers global.gc() sweeps under active workloads when
 * memory growth exceeds configured thresholds.
 */

export class MemoryLeakSentry {
  /**
   * @param {Object} options
   * @param {import("./SandboxTelemetry.js").SandboxTelemetry} options.sandboxTelemetry - Sentry resource telemetry.
   * @param {number} [options.leakThresholdBytesPerMin=5242880] - Leak rate limit (default 5MB/minute).
   * @param {number} [options.intervalMs=5000] - Polling interval (default 5 seconds).
   * @param {() => boolean} [options.isActiveLoad] - Callback returning active client load status.
   */
  constructor({
    sandboxTelemetry,
    leakThresholdBytesPerMin = 5 * 1024 * 1024,
    intervalMs = 5000,
    isActiveLoad = () => true,
  }) {
    if (!sandboxTelemetry) {
      throw new Error("MemoryLeakSentry requires a SandboxTelemetry instance.");
    }
    this.sandboxTelemetry = sandboxTelemetry;
    this.leakThresholdBytesPerMin = leakThresholdBytesPerMin;
    this.intervalMs = intervalMs;
    this.isActiveLoad = isActiveLoad;

    this.alertCount = 0;
    this.lastAlertTime = null;
    /** @type {any} */
    this.timer = null;
  }

  /**
   * Starts periodic memory growth polling.
   */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.check();
    }, this.intervalMs);

    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /**
   * Stops periodic memory growth polling.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Performs growth velocity and active workload assertions.
   */
  check() {
    const leakRate = this.sandboxTelemetry.getMemoryLeakRate();

    // Check if memory growth velocity crosses threshold under active load
    if (leakRate > this.leakThresholdBytesPerMin && this.isActiveLoad()) {
      this.alertCount++;
      this.lastAlertTime = Date.now();

      const leakRateMb = (leakRate / (1024 * 1024)).toFixed(2);
      console.warn(
        `⚠️ [MEMORY LEAK SENTRY] High memory leak rate detected: ${leakRateMb} MB/min. Self-healing via Garbage Collection.`,
      );

      // Trigger V8 Garbage Collection if exposed via --expose-gc
      if (global.gc) {
        try {
          global.gc();
        } catch (_err) {
          /* ignore */
        }
      }
    }
  }

  /**
   * Exposes detailed memory leak diagnostics.
   * @returns {Object}
   */
  getDiagnostics() {
    const leakRate = this.sandboxTelemetry.getMemoryLeakRate();
    return {
      leakRateBytesPerMin: Math.round(leakRate),
      alertCount: this.alertCount,
      leakThresholdBytesPerMin: this.leakThresholdBytesPerMin,
      hasFired: this.alertCount > 0,
      lastAlertTime: this.lastAlertTime,
    };
  }
}
