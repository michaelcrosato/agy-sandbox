import fs from "fs";
import path from "path";

/**
 * Sandbox Resource Telemetry Recorder (SPEC-094).
 * Compiles and exposes real-time CPU, memory, and repository disk utilization.
 */
export class SandboxTelemetry {
  /**
   * Initializes the SandboxTelemetry recorder.
   * @param {string} [rootPath=process.cwd()] - Root directory of the repository.
   * @param {number} [intervalMs=5000] - Polling interval for background updates.
   */
  constructor(rootPath = process.cwd(), intervalMs = 5000) {
    this.rootPath = rootPath;
    this.intervalMs = intervalMs;
    this.startupTime = Date.now();

    // CPU Usage Tracking
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuEpoch = process.hrtime();

    // Base Memory Reference
    const initialMem = process.memoryUsage();
    this.baseRss = initialMem.rss;
    this.baseHeapUsed = initialMem.heapUsed;

    // Peak Memory Tracking
    this.peakRss = initialMem.rss;
    this.peakHeapUsed = initialMem.heapUsed;
    this.peakHeapTotal = initialMem.heapTotal;

    this.currentCpuPercent = 0;
    this.diskSizeBytes = 0;
    this.timer = null;
  }

  /**
   * Starts periodic resource polling.
   */
  start() {
    this.update();
    if (this.intervalMs > 0) {
      this.timer = setInterval(() => {
        this.update();
      }, this.intervalMs);
    }
  }

  /**
   * Stops periodic resource polling.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Synchronously polls resource usage and calculates current state metrics.
   */
  update() {
    try {
      // 1. CPU Percentage calculation
      const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
      const currentEpoch = process.hrtime();
      const elapsedHrTime = this.getHrtimeDeltaInMs(
        this.lastCpuEpoch,
        currentEpoch,
      );
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuEpoch = currentEpoch;

      const cpuTimeUs = currentCpuUsage.user + currentCpuUsage.system;
      const elapsedUs = elapsedHrTime * 1000;
      this.currentCpuPercent =
        elapsedUs > 0 ? (cpuTimeUs / elapsedUs) * 100 : 0;

      // 2. Memory Peaks
      const mem = process.memoryUsage();
      if (mem.rss > this.peakRss) this.peakRss = mem.rss;
      if (mem.heapUsed > this.peakHeapUsed) this.peakHeapUsed = mem.heapUsed;
      if (mem.heapTotal > this.peakHeapTotal)
        this.peakHeapTotal = mem.heapTotal;

      // 3. Disk Footprint
      this.diskSizeBytes = this.getDirSizeRecursive(this.rootPath);
    } catch (err) {
      // Defensively swallow polling errors to avoid halting host thread
    }
  }

  /**
   * Calculates hrtime delta in milliseconds.
   * @private
   */
  getHrtimeDeltaInMs(start, end) {
    const ns = (end[0] - start[0]) * 1e9 + (end[1] - start[1]);
    return ns / 1e6;
  }

  /**
   * Recursively computes directory size while avoiding massive system folders.
   * @private
   */
  getDirSizeRecursive(
    dirPath,
    excludeDirs = [".git", "node_modules", "coverage"],
  ) {
    let totalSize = 0;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (excludeDirs.includes(file)) continue;
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          totalSize += this.getDirSizeRecursive(fullPath, excludeDirs);
        } else if (stat.isFile()) {
          totalSize += stat.size;
        }
      }
    } catch (err) {
      // Return partial size or fallback gracefully on permission blocks
    }
    return totalSize;
  }

  /**
   * Calculates memory leak rate in bytes per minute.
   */
  getMemoryLeakRate() {
    const elapsedMinutes = (Date.now() - this.startupTime) / 60000;
    if (elapsedMinutes <= 0.05) return 0; // Avoid startup noise
    const currentMem = process.memoryUsage();
    const bytesGrown = currentMem.heapUsed - this.baseHeapUsed;
    return Math.max(0, bytesGrown / elapsedMinutes);
  }

  /**
   * Compiles the resource metric snapshot.
   * @returns {Object} Compiled telemetry metrics.
   */
  getMetrics() {
    const mem = process.memoryUsage();
    if (mem.rss > this.peakRss) this.peakRss = mem.rss;
    if (mem.heapUsed > this.peakHeapUsed) this.peakHeapUsed = mem.heapUsed;
    if (mem.heapTotal > this.peakHeapTotal) this.peakHeapTotal = mem.heapTotal;

    const elapsedSeconds = (Date.now() - this.startupTime) / 1000;

    return {
      cpu_percent: Math.round(this.currentCpuPercent * 100) / 100,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        peakRss: this.peakRss,
        peakHeapUsed: this.peakHeapUsed,
        leakRateBytesPerMin: Math.round(this.getMemoryLeakRate() * 100) / 100,
      },
      disk: {
        repositorySizeBytes: this.diskSizeBytes,
      },
      uptimeSeconds: Math.round(elapsedSeconds),
    };
  }
}
