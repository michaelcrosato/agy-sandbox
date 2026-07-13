/**
 * Low-overhead rolling window statistical anomaly detection sentry.
 * Tracks active connections, event-loop latency, and memory utilization variations
 * using Z-score statistics (standard deviations from the rolling mean) to detect anomalies.
 */
export class AnomalyDetector {
  declare anomalyTriggersTotal;
  declare connectionsWindow;
  declare diagnostics;
  declare lastHeapUsed;
  declare latencyWindow;
  declare memoryWindow;
  declare windowSize;
  declare zThreshold;
  /**
   * @param {number} [windowSize=60] - Number of observations to retain in the rolling window.
   * @param {number} [zThreshold=3.0] - Z-score threshold above which an observation is anomalous.
   */
  constructor(windowSize = 60, zThreshold = 3.0) {
    this.windowSize = windowSize;
    this.zThreshold = zThreshold;

    // Rolling windows for metrics
    this.connectionsWindow = [];
    this.latencyWindow = [];
    this.memoryWindow = []; // Tracks heap increment velocity (diffs between consecutive heapUsed values)

    this.lastHeapUsed = null;
    this.anomalyTriggersTotal = 0;

    // Diagnostics info
    this.diagnostics = {
      connections: { mean: 0, stdDev: 0, lastZ: 0 },
      latency: { mean: 0, stdDev: 0, lastZ: 0 },
      memoryIncrement: { mean: 0, stdDev: 0, lastZ: 0 },
    };
  }

  /**
   * Resets the rolling windows and trigger counters.
   */
  reset() {
    this.connectionsWindow = [];
    this.latencyWindow = [];
    this.memoryWindow = [];
    this.lastHeapUsed = null;
    this.anomalyTriggersTotal = 0;
    this.diagnostics = {
      connections: { mean: 0, stdDev: 0, lastZ: 0 },
      latency: { mean: 0, stdDev: 0, lastZ: 0 },
      memoryIncrement: { mean: 0, stdDev: 0, lastZ: 0 },
    };
  }

  /**
   * Helper to calculate mean of an array of numbers.
   * @param {Array<number>} arr
   * @returns {number}
   */
  static getMean(arr) {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return sum / arr.length;
  }

  /**
   * Helper to calculate standard deviation of an array of numbers given its mean.
   * @param {Array<number>} arr
   * @param {number} mean
   * @returns {number}
   */
  static getStdDev(arr, mean) {
    if (arr.length <= 1) return 0;
    const variance =
      arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * Observes new telemetry values and checks for statistical anomalies.
   * @param {number} connections - Active client connections.
   * @param {number} latency - Event-loop delay in milliseconds.
   * @param {number} heapUsed - Current heap usage bytes.
   * @returns {boolean} - True if any metric was flagged as anomalous in this step.
   */
  observe(connections, latency, heapUsed) {
    let isAnomalous = false;

    // 1. Connection counts z-score
    if (this.connectionsWindow.length >= 10) {
      const mean = AnomalyDetector.getMean(this.connectionsWindow);
      const stdDev = AnomalyDetector.getStdDev(this.connectionsWindow, mean);
      const z = stdDev > 0 ? Math.abs(connections - mean) / stdDev : 0;
      this.diagnostics.connections = { mean, stdDev, lastZ: z };

      if (z > this.zThreshold) {
        isAnomalous = true;
        this.anomalyTriggersTotal++;
        console.warn(
          `⚠️ [ANOMALY DETECTOR] Active connections spike! Val: ${connections}, Mean: ${mean.toFixed(1)}, StdDev: ${stdDev.toFixed(1)}, Z-score: ${z.toFixed(2)}`,
        );
      }
    }
    this.connectionsWindow.push(connections);
    if (this.connectionsWindow.length > this.windowSize) {
      this.connectionsWindow.shift();
    }

    // 2. Event-loop latency z-score
    if (this.latencyWindow.length >= 10) {
      const mean = AnomalyDetector.getMean(this.latencyWindow);
      const stdDev = AnomalyDetector.getStdDev(this.latencyWindow, mean);
      const z = stdDev > 0 ? Math.abs(latency - mean) / stdDev : 0;
      this.diagnostics.latency = { mean, stdDev, lastZ: z };

      if (z > this.zThreshold) {
        isAnomalous = true;
        this.anomalyTriggersTotal++;
        console.warn(
          `⚠️ [ANOMALY DETECTOR] Latency lag spike! Val: ${latency.toFixed(1)}ms, Mean: ${mean.toFixed(1)}ms, StdDev: ${stdDev.toFixed(1)}ms, Z-score: ${z.toFixed(2)}`,
        );
      }
    }
    this.latencyWindow.push(latency);
    if (this.latencyWindow.length > this.windowSize) {
      this.latencyWindow.shift();
    }

    // 3. Memory increment z-score (heapUsed delta)
    if (this.lastHeapUsed !== null) {
      const memDiff = Math.max(0, heapUsed - this.lastHeapUsed);
      if (this.memoryWindow.length >= 10) {
        const mean = AnomalyDetector.getMean(this.memoryWindow);
        const stdDev = AnomalyDetector.getStdDev(this.memoryWindow, mean);
        const z = stdDev > 0 ? Math.abs(memDiff - mean) / stdDev : 0;
        this.diagnostics.memoryIncrement = { mean, stdDev, lastZ: z };

        if (z > this.zThreshold) {
          isAnomalous = true;
          this.anomalyTriggersTotal++;
          const memDiffMb = memDiff / (1024 * 1024);
          const meanMb = mean / (1024 * 1024);
          const stdDevMb = stdDev / (1024 * 1024);
          console.warn(
            `⚠️ [ANOMALY DETECTOR] Memory allocation rate spike! Val: ${memDiffMb.toFixed(2)}MB, Mean: ${meanMb.toFixed(2)}MB, StdDev: ${stdDevMb.toFixed(2)}MB, Z-score: ${z.toFixed(2)}`,
          );
        }
      }
      this.memoryWindow.push(memDiff);
      if (this.memoryWindow.length > this.windowSize) {
        this.memoryWindow.shift();
      }
    }
    this.lastHeapUsed = heapUsed;

    return isAnomalous;
  }

  /**
   * Gets a complete diagnostic snapshot object.
   * @returns {object}
   */
  getDiagnostics() {
    return {
      anomalyTriggersTotal: this.anomalyTriggersTotal,
      diagnostics: this.diagnostics,
    };
  }
}
