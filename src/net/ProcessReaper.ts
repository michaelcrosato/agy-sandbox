/**
 * ProcessReaper.js (spec 092) — pure, modular lifecycle manager to track
 * and aggressively terminate background workers, child processes, and
 * sockets to prevent memory leaks and zombie locks in AI sandbox.
 */

import { Worker } from "worker_threads";
import childProcess from "child_process";

const originalExecSync = childProcess.execSync;

/**
 * Recursively terminates child processes on Unix platforms.
 * @param {number} pid
 */
function killUnixProcessTree(pid) {
  try {
    const stdout = originalExecSync(`pgrep -P ${pid}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pids = stdout
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p && /^\d+$/.test(p));
    for (const childPid of pids) {
      killUnixProcessTree(parseInt(childPid, 10));
    }
  } catch {
    // pgrep throws if no children are found
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
}

/**
 * Terminates the entire process tree recursively.
 * @param {number} pid
 */
function killProcessTree(pid) {
  if (!pid) return;
  const isWin = process.platform === "win32";
  if (isWin) {
    try {
      originalExecSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch {
      // ignore
    }
  } else {
    killUnixProcessTree(pid);
  }
}

const activeWorkers = new Set<any>();
const activeProcesses = new Set<any>();

let isListenersRegistered = false;

// Synchronous reaping helper for exit hook
function reapSync() {
  for (const proc of activeProcesses) {
    try {
      if (proc.pid) {
        killProcessTree(proc.pid);
        proc.killed = true;
      }
      if (!proc.killed && typeof proc.kill === "function") {
        proc.kill("SIGKILL");
      }
    } catch {
      // ignore
    }
  }
  activeProcesses.clear();

  for (const worker of activeWorkers) {
    try {
      worker.terminate();
    } catch {
      // ignore
    }
  }
  activeWorkers.clear();
}

const sigintHandler = async () => {
  await ProcessReaper.reap();
  process.exit(130);
};

const sigtermHandler = async () => {
  await ProcessReaper.reap();
  process.exit(143);
};

const exitHandler = () => {
  reapSync();
};

/**
 * ProcessReaper (spec 092) — pure, modular lifecycle manager to track
 * and aggressively terminate background workers, child processes, and
 * sockets to prevent memory leaks and zombie locks in the AI sandbox.
 * @type {object}
 */
export const ProcessReaper = {
  /**
   * Registers signal and exit listeners on the host process to ensure autonomic teardowns.
   */
  registerSignalListeners() {
    if (!isListenersRegistered) {
      process.on("SIGINT", sigintHandler);
      process.on("SIGTERM", sigtermHandler);
      process.on("exit", exitHandler);
      isListenersRegistered = true;
    }
  },

  /**
   * Deregisters signal and exit listeners from the host process.
   */
  deregisterSignalListeners() {
    if (isListenersRegistered) {
      process.off("SIGINT", sigintHandler);
      process.off("SIGTERM", sigtermHandler);
      process.off("exit", exitHandler);
      isListenersRegistered = false;
    }
  },

  /**
   * Registers an active Worker thread to the cleanup ledger.
   * @param {Worker} worker
   * @returns {Worker}
   */
  registerWorker(worker) {
    if (worker && typeof worker.terminate === "function") {
      activeWorkers.add(worker);
      worker.on("exit", () => {
        activeWorkers.delete(worker);
        if (activeWorkers.size === 0 && activeProcesses.size === 0) {
          this.deregisterSignalListeners();
        }
      });
      this.registerSignalListeners();
    }
    return worker;
  },

  /**
   * Spawns and registers a Worker thread.
   * @param {string|URL} scriptPath
   * @param {any} [options]
   * @returns {Worker}
   */
  spawnWorker(scriptPath, options) {
    const worker = new Worker(scriptPath, options);
    return this.registerWorker(worker);
  },

  /**
   * Registers a child process to the cleanup ledger.
   * @param {any} proc
   * @returns {any}
   */
  registerProcess(proc) {
    if (proc && typeof proc.kill === "function") {
      activeProcesses.add(proc);
      proc.on("exit", () => {
        activeProcesses.delete(proc);
        if (activeWorkers.size === 0 && activeProcesses.size === 0) {
          this.deregisterSignalListeners();
        }
      });
      this.registerSignalListeners();
    }
    return proc;
  },

  /**
   * Terminates all currently tracked worker threads and child processes.
   * @returns {Promise<void>}
   */
  async reap(_pid?: any) {
    // Terminate child processes
    for (const proc of activeProcesses) {
      try {
        if (proc.pid) {
          killProcessTree(proc.pid);
          proc.killed = true;
        }
        if (!proc.killed && typeof proc.kill === "function") {
          proc.kill("SIGKILL");
        }
      } catch {
        // ignore
      }
    }
    activeProcesses.clear();

    // Terminate worker threads
    const termPromises = [];
    for (const worker of activeWorkers) {
      try {
        termPromises.push(worker.terminate());
      } catch {
        // ignore
      }
    }
    activeWorkers.clear();

    await Promise.all(termPromises);
    this.deregisterSignalListeners();
  },

  /**
   * Synchronously terminates all tracked child processes and worker threads immediately.
   */
  reapSync() {
    reapSync();
    this.deregisterSignalListeners();
  },

  /**
   * Returns the count of actively tracked workers.
   * @returns {number}
   */
  getWorkerCount() {
    return activeWorkers.size;
  },

  /**
   * Returns the count of actively tracked processes.
   * @returns {number}
   */
  getProcessCount() {
    return activeProcesses.size;
  },
};
