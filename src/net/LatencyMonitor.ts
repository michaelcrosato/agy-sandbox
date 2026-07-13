/**
 * Event-Loop Latency Monitor & Dynamic Backpressure Shedding (SPEC-090).
 * Actively monitors event loop delays using high-resolution timers and computes a rolling average.
 */
export class LatencyMonitor {
  declare intervalMs;
  declare lastTime;
  declare samples;
  declare timer;
  declare windowSize;
  /**
   * @param {Object} [options]
   * @param {number} [options.intervalMs=500] - Sampling frequency in milliseconds.
   * @param {number} [options.windowSize=10] - Size of the rolling window for latency samples.
   */
  constructor(options: any = {}) {
    this.intervalMs = options.intervalMs || 500;
    this.windowSize = options.windowSize || 10;
    this.samples = [];
    this.timer = null;
    this.lastTime = null;
  }

  /**
   * Starts monitoring the event loop latency.
   */
  start() {
    if (this.timer) return;
    this.lastTime = process.hrtime.bigint();
    this.timer = setInterval(() => {
      const now = process.hrtime.bigint();
      const expectedMs = this.intervalMs;
      const actualMs = Number(now - this.lastTime) / 1_000_000;
      const delay = Math.max(0, actualMs - expectedMs);
      this.addSample(delay);
      this.lastTime = now;
    }, this.intervalMs);

    // Unref the timer so it doesn't keep the Node.js process alive unnecessarily
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops monitoring the event loop latency and clears active timers.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Adds a latency sample to the rolling window.
   * @param {number} delay
   */
  addSample(delay) {
    this.samples.push(delay);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /**
   * Gets the rolling average of event loop latency.
   * @returns {number} Latency in milliseconds.
   */
  getLatency() {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return sum / this.samples.length;
  }

  /**
   * Gets the current operational load status based on rolling latency.
   * @returns {'normal'|'degraded'|'critical'}
   */
  getStatus() {
    const latency = this.getLatency();
    if (latency >= 50) {
      return "critical";
    } else if (latency >= 25) {
      return "degraded";
    }
    return "normal";
  }

  /**
   * Checks if dynamic backpressure load-shedding should drop or throttle a given type of payload.
   * @param {string} payloadType - e.g. 'chat', 'cosmetic', 'optional'
   * @returns {boolean} True if the payload should be dropped or throttled.
   */
  shouldShed(payloadType) {
    const status = this.getStatus();
    if (status === "critical") {
      if (
        payloadType === "cosmetic" ||
        payloadType === "chat" ||
        payloadType === "optional"
      ) {
        return true;
      }
    } else if (status === "degraded") {
      if (payloadType === "chat" || payloadType === "cosmetic") {
        return true;
      }
    }
    return false;
  }
}
