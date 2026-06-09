import fs from "fs";
import childProcess from "child_process";
import { SecureModuleRegistry } from "./SecureModuleRegistry.js";
import { WorkspaceDriftSentry } from "./WorkspaceDriftSentry.js";

let isHooked = false;
const activeTimeouts = new Set();
const activeIntervals = new Set();

const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

/**
 * ZeroTraceTeardown.js (SPEC-176)
 * Autonomic, zero-trace post-execution teardown purifier.
 * Sweeps process trees, files, timers, and handles after guest script executions.
 */
export const ZeroTraceTeardown = {
  activeTimeouts,
  activeIntervals,
  activeProcesses: new Set(),
  activeStreams: new Set(),

  /**
   * Initialize global timer hooks to track active timeouts and intervals.
   */
  initTimerHooks() {
    if (isHooked) return;
    isHooked = true;

    const g = /** @type {any} */ (global);

    g.setTimeout = (cb, delay, ...args) => {
      let timer;
      timer = originalSetTimeout(
        (...cbArgs) => {
          activeTimeouts.delete(timer);
          cb(...cbArgs);
        },
        delay,
        ...args,
      );
      activeTimeouts.add(timer);
      return timer;
    };

    g.clearTimeout = (timer) => {
      if (timer) {
        activeTimeouts.delete(timer);
      }
      originalClearTimeout(timer);
    };

    g.setInterval = (cb, delay, ...args) => {
      const timer = originalSetInterval(cb, delay, ...args);
      activeIntervals.add(timer);
      return timer;
    };

    g.clearInterval = (timer) => {
      if (timer) {
        activeIntervals.delete(timer);
      }
      originalClearInterval(timer);
    };
  },

  /**
   * Restore original timer functions.
   */
  restoreTimerHooks() {
    if (!isHooked) return;
    const g = /** @type {any} */ (global);
    g.setTimeout = originalSetTimeout;
    g.clearTimeout = originalClearTimeout;
    g.setInterval = originalSetInterval;
    g.clearInterval = originalClearInterval;
    isHooked = false;
  },

  /**
   * Register a process for tracking.
   * @param {any} proc
   */
  registerProcess(proc) {
    if (proc) {
      this.activeProcesses.add(proc);
    }
  },

  /**
   * Register a stream for tracking.
   * @param {any} stream
   */
  registerStream(stream) {
    if (stream) {
      this.activeStreams.add(stream);
    }
  },

  /**
   * Clear all active timeouts and intervals tracked.
   */
  purgeTimers() {
    for (const timer of activeTimeouts) {
      originalClearTimeout(timer);
    }
    activeTimeouts.clear();

    for (const timer of activeIntervals) {
      originalClearInterval(timer);
    }
    activeIntervals.clear();
  },

  /**
   * Forcefully terminate all registered and discovered process trees.
   */
  async purgeProcesses() {
    for (const proc of this.activeProcesses) {
      try {
        if (proc.pid) {
          this.killProcessTree(proc.pid);
          proc.killed = true;
        }
        if (!proc.killed && typeof proc.kill === "function") {
          proc.kill("SIGKILL");
        }
      } catch {
        // ignore
      }
    }
    this.activeProcesses.clear();
  },

  /**
   * Destroy tracked streams.
   */
  purgeStreams() {
    for (const stream of this.activeStreams) {
      if (stream && typeof stream.destroy === "function") {
        try {
          stream.destroy();
        } catch {
          // ignore
        }
      }
    }
    this.activeStreams.clear();
  },

  /**
   * Recursively kill process tree for a given PID.
   * @param {number} pid
   */
  killProcessTree(pid) {
    if (!pid) return;
    const children = this.getChildPids(pid);
    for (const childPid of children) {
      this.killProcessTree(childPid);
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  },

  /**
   * Get all child process PIDs for a parent PID.
   * @param {number} parentPid
   * @returns {number[]}
   */
  getChildPids(parentPid) {
    try {
      if (process.platform === "win32") {
        const cmd = `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} } | Select-Object -ExpandProperty ProcessId"`;
        const output = childProcess.execSync(cmd, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        return output
          .split("\n")
          .map((line) => parseInt(line.trim(), 10))
          .filter((pid) => !isNaN(pid));
      } else {
        const output = childProcess.execSync(`pgrep -P ${parentPid}`, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        return output
          .split("\n")
          .map((line) => parseInt(line.trim(), 10))
          .filter((pid) => !isNaN(pid));
      }
    } catch {
      return [];
    }
  },

  /**
   * Core post-execution teardown sweep.
   * @param {any} [childProcessInstance]
   * @param {string} [sandboxDir]
   * @param {Object} [baselineSnapshot]
   * @returns {Promise<boolean>} Status confirming if zero residual trace remains active.
   */
  async teardown(childProcessInstance, sandboxDir, baselineSnapshot) {
    // 1. Purge all registered active timers
    this.purgeTimers();

    // 2. Kill the main child process and its grandchildren
    if (childProcessInstance) {
      this.registerProcess(childProcessInstance);
      if (childProcessInstance.stdout) {
        this.registerStream(childProcessInstance.stdout);
      }
      if (childProcessInstance.stderr) {
        this.registerStream(childProcessInstance.stderr);
      }
    }
    await this.purgeProcesses();

    // 3. Purge streams and disconnect IPC channels
    if (
      childProcessInstance &&
      typeof childProcessInstance.disconnect === "function" &&
      childProcessInstance.connected
    ) {
      try {
        childProcessInstance.disconnect();
      } catch {
        // ignore
      }
    }
    this.purgeStreams();

    // 4. Clear module registry checksums
    try {
      SecureModuleRegistry.clear();
    } catch {
      // ignore
    }

    // 5. Clean up sandbox workspace drift files
    if (sandboxDir && baselineSnapshot && fs.existsSync(sandboxDir)) {
      try {
        const report = WorkspaceDriftSentry.auditDrift(
          sandboxDir,
          baselineSnapshot,
        );
        WorkspaceDriftSentry.selfHeal(sandboxDir, report);
      } catch {
        // ignore
      }
    }

    // 6. Validation check: assert zero traces remain active
    let allClean = true;

    if (activeTimeouts.size > 0 || activeIntervals.size > 0) {
      allClean = false;
    }

    if (childProcessInstance && childProcessInstance.pid) {
      // Check if process is still running
      try {
        process.kill(childProcessInstance.pid, 0);
        allClean = false; // still alive!
      } catch (err) {
        if (err.code !== "ESRCH") {
          allClean = false;
        }
      }

      // Check if any grandchildren are still running
      const children = this.getChildPids(childProcessInstance.pid);
      if (children.length > 0) {
        allClean = false;
      }
    }

    return allClean;
  },
};
