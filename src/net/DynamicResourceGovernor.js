/**
 * DynamicResourceGovernor.js (SPEC-172) — Dynamic host resource governor & scheduler.
 * Monitors host system resources (CPU load, free memory) to queue guest process launches,
 * and dynamically down-throttles near-budget guest processes to low OS priorities.
 */

import os from "node:os";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

// Queue for holding deferred launches under stress
const launchQueue = [];

// Tracked active throttled guest process PIDs
const throttledPids = new Set();

// Active starts counter to balance OS recoveries
let activeLaunches = 0;

// Simulation parameters for tests
let simulatedMemoryRatio = null;
let simulatedCpuLoad = null;

// Background polling loop for stress recovery draining
let pollInterval = null;

/**
 * Dynamic Resource Governor (SPEC-172) balancing memory and CPU usage.
 */
export const DynamicResourceGovernor = {
  /**
   * Clears governor queue and simulation metrics (mostly for test hygiene).
   */
  clear() {
    launchQueue.length = 0;
    throttledPids.clear();
    activeLaunches = 0;
    simulatedMemoryRatio = null;
    simulatedCpuLoad = null;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },

  /**
   * Sets simulated stress metrics directly (for testing).
   * @param {number|null} memoryRatio - Ratio [0.0 - 1.0] of free memory (e.g. 0.10 for 10% free)
   * @param {number|null} cpuLoad - Ratio [0.0 - 1.0] of CPU usage (e.g. 0.90 for 90% load)
   */
  setSimulation(memoryRatio, cpuLoad) {
    simulatedMemoryRatio = memoryRatio;
    simulatedCpuLoad = cpuLoad;
    this.checkQueue();
  },

  /**
   * Helper to check if the host system is under resource stress.
   * Stress thresholds: Free Memory < 15% OR CPU load average > 85%
   * @returns {boolean}
   */
  isHostStressed() {
    const freeMemRatio = this.getFreeMemoryRatio();
    const cpuLoad = this.getCpuLoadRatio();
    return freeMemRatio < 0.15 || cpuLoad > 0.85;
  },

  /**
   * Returns current host free memory ratio.
   * @returns {number}
   */
  getFreeMemoryRatio() {
    if (simulatedMemoryRatio !== null) {
      return simulatedMemoryRatio;
    }
    const total = os.totalmem();
    if (total <= 0) return 1.0;
    return os.freemem() / total;
  },

  /**
   * Returns current host CPU load ratio.
   * @returns {number}
   */
  getCpuLoadRatio() {
    if (simulatedCpuLoad !== null) {
      return simulatedCpuLoad;
    }
    const loadavg = os.loadavg();
    if (!loadavg || loadavg.length === 0 || isNaN(loadavg[0])) {
      return 0.0;
    }
    const numCpus = os.cpus().length || 1;
    return loadavg[0] / numCpus;
  },

  /**
   * Queue or immediately execute guest launch script based on host stress.
   * Returns a promise that resolves when the permit is acquired.
   * @returns {Promise<void>}
   */
  acquireLaunchPermit() {
    this.startPollingLoop();

    if (!this.isHostStressed()) {
      activeLaunches++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      launchQueue.push({ resolve });
    });
  },

  /**
   * Releases an active launch permit on run completion, checking the queue.
   */
  releaseLaunchPermit() {
    activeLaunches = Math.max(0, activeLaunches - 1);
    this.checkQueue();
  },

  /**
   * Evaluates if active run utilizes > 80% budget, dynamically lowering OS process priority.
   * @param {number|null} pid - Process ID of the guest child process.
   * @param {Object} runInfo - Dynamic run metadata.
   */
  evaluateAndThrottle(pid, runInfo) {
    if (!pid || !runInfo) return;

    // 1. Calculate CPU usage ratio
    const cpuRatio =
      runInfo.cpuTimeBudgetMs > 0
        ? runInfo.cpuTimeMs / runInfo.cpuTimeBudgetMs
        : 0;

    // 2. Calculate Memory usage ratio
    const budgetBytes = runInfo.maxMemoryMb * 1024 * 1024;
    const maxUsedBytes = Math.max(
      runInfo.heapUsedBytes || 0,
      runInfo.rssBytes || 0,
    );
    const memRatio = budgetBytes > 0 ? maxUsedBytes / budgetBytes : 0;

    // If either resource crosses 80%, throttle down to OS priority 19
    if (cpuRatio > 0.8 || memRatio > 0.8) {
      if (!throttledPids.has(pid)) {
        try {
          os.setPriority(pid, 19);
          throttledPids.add(pid);

          SandboxSecurityRegistry.logViolation("process", "resource_throttle", {
            pid,
            script: runInfo.script,
            cpuRatio: Math.round(cpuRatio * 100) / 100,
            memRatio: Math.round(memRatio * 100) / 100,
            cpuTimeMs: runInfo.cpuTimeMs,
            cpuBudgetMs: runInfo.cpuTimeBudgetMs,
            memBytes: maxUsedBytes,
            memBudgetBytes: budgetBytes,
          });
        } catch {
          // Gracefully degrade on system or permission constraints
        }
      }
    }
  },

  /**
   * Checks queue and dispatches next launches if stress subsides.
   */
  checkQueue() {
    while (launchQueue.length > 0 && !this.isHostStressed()) {
      const next = launchQueue.shift();
      if (next) {
        activeLaunches++;
        next.resolve();
      }
    }
    // Shut down polling loop if queue has fully drained to avoid idle resource utilization
    if (launchQueue.length === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },

  /**
   * Starts periodic polling loop to drain queued scripts once OS capacity heals.
   */
  startPollingLoop() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      this.checkQueue();
    }, 50);
    pollInterval.unref(); // Avoid holding the Node process or Jest runtime open
  },

  /**
   * Accessor for metrics
   */
  getQueueLength() {
    return launchQueue.length;
  },

  getThrottledCount() {
    return throttledPids.size;
  },

  isThrottled(pid) {
    return throttledPids.has(pid);
  },

  /**
   * Compiles observability metrics for RestHandlers /metrics integration.
   * @returns {Object}
   */
  getMetrics() {
    return {
      queued_runs_count: this.getQueueLength(),
      active_throttled_processes: this.getThrottledCount(),
      host_capacity_free_memory_ratio:
        Math.round(this.getFreeMemoryRatio() * 100) / 100,
      host_capacity_cpu_load: Math.round(this.getCpuLoadRatio() * 100) / 100,
    };
  },
};
