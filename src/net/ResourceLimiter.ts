import { ProcessReaper } from "./ProcessReaper.js";

/**
 * ResourceLimiter (spec 116) — light-overhead resource monitor and backpressure sentinel
 * that regularly polls host system/thread health metrics (memory usage, CPU event loop latency)
 * and actively prevents runaway infinite loops or Out-Of-Memory (OOM) failures.
 */
export class ResourceLimiter {
  declare hardLatencyLimit;
  declare hardMemoryLimit;
  declare intervalMs;
  declare isBackpressureActive;
  declare isShuttingDown;
  declare lastTime;
  declare latencySamples;
  declare onHardLimit;
  declare onSoftLimit;
  declare softLatencyLimit;
  declare softMemoryLimit;
  declare timer;
  /**
   * @param {object} [options]
   * @param {number} [options.intervalMs=1000] - Polling interval in milliseconds.
   * @param {number} [options.softMemoryLimit=536870912] - Soft memory limit (default 512MB).
   * @param {number} [options.hardMemoryLimit=671088640] - Hard memory limit (default 640MB).
   * @param {number} [options.softLatencyLimit=20] - Soft Event Loop latency limit (default 20ms).
   * @param {number} [options.hardLatencyLimit=100] - Hard Event Loop latency limit (default 100ms).
   * @param {Function} [options.onSoftLimit] - Optional callback when soft limit is crossed.
   * @param {Function} [options.onHardLimit] - Optional callback when hard limit is crossed.
   */
  constructor(options: any = {}) {
    this.intervalMs = options.intervalMs || 1000;
    this.softMemoryLimit = options.softMemoryLimit || 512 * 1024 * 1024;
    this.hardMemoryLimit = options.hardMemoryLimit || 640 * 1024 * 1024;
    this.softLatencyLimit = options.softLatencyLimit || 20;
    this.hardLatencyLimit = options.hardLatencyLimit || 100;

    this.onSoftLimit = options.onSoftLimit || null;
    this.onHardLimit = options.onHardLimit || null;

    /** @type {any} */
    this.timer = null;
    /** @type {bigint|null} */
    this.lastTime = null;
    /** @type {number[]} */
    this.latencySamples = [];
    this.isBackpressureActive = false;
    this.isShuttingDown = false;
  }

  /**
   * Starts the polling monitor.
   */
  start() {
    if (this.timer) return;
    this.lastTime = process.hrtime.bigint();
    this.timer = setInterval(() => {
      this.check();
    }, this.intervalMs);

    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /**
   * Stops the polling monitor.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Performs the metric assertion checks.
   */
  check() {
    if (!this.lastTime) {
      this.lastTime = process.hrtime.bigint();
      return;
    }

    const now = process.hrtime.bigint();
    const expected = this.intervalMs;
    const actual = Number(now - this.lastTime) / 1_000_000;
    const delay = Math.max(0, actual - expected);
    this.lastTime = now;

    this.latencySamples.push(delay);
    if (this.latencySamples.length > 5) {
      this.latencySamples.shift();
    }
    const avgLatency =
      this.latencySamples.reduce((a, b) => a + b, 0) /
      this.latencySamples.length;

    const mem = process.memoryUsage();
    const rss = mem.rss;
    const heapUsed = mem.heapUsed;

    const softMemoryCrossed = rss > this.softMemoryLimit;
    const softLatencyCrossed = avgLatency > this.softLatencyLimit;

    if (softMemoryCrossed || softLatencyCrossed) {
      this.isBackpressureActive = true;

      // Trigger global GC if available
      if (global.gc) {
        try {
          global.gc();
        } catch {
          // ignore
        }
      }

      if (this.onSoftLimit) {
        this.onSoftLimit({
          rss,
          heapUsed,
          avgLatency,
          softMemoryCrossed,
          softLatencyCrossed,
        });
      }
    } else {
      this.isBackpressureActive = false;
    }

    const hardMemoryCrossed = rss > this.hardMemoryLimit;
    const hardLatencyCrossed = avgLatency > this.hardLatencyLimit;

    if (hardMemoryCrossed || hardLatencyCrossed) {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        console.error(
          `🚨 [RESOURCE LIMITER] Hard limit crossed! RSS: ${Math.round(
            rss / (1024 * 1024),
          )}MB (Cap: ${Math.round(
            this.hardMemoryLimit / (1024 * 1024),
          )}MB), Event Loop delay: ${avgLatency.toFixed(
            1,
          )}ms (Cap: ${this.hardLatencyLimit}ms)`,
        );

        if (this.onHardLimit) {
          this.onHardLimit({
            rss,
            heapUsed,
            avgLatency,
            hardMemoryCrossed,
            hardLatencyCrossed,
          });
        } else {
          // Default action: reap processes and exit worker
          ProcessReaper.reap()
            .then(() => {
              process.exit(1);
            })
            .catch(() => {
              process.exit(1);
            });
        }
      }
    }
  }
}
