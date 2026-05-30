/**
 * ProcessReaper.js (spec 092) — pure, modular lifecycle manager to track
 * and aggressively terminate background workers, child processes, and
 * sockets to prevent memory leaks and zombie locks in AI sandbox.
 */

import { Worker } from "worker_threads";

const activeWorkers = new Set();
const activeProcesses = new Set();

export const ProcessReaper = {
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
      });
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
      });
    }
    return proc;
  },

  /**
   * Terminates all currently tracked worker threads and child processes.
   * @returns {Promise<void>}
   */
  async reap() {
    // Terminate child processes
    for (const proc of activeProcesses) {
      try {
        if (!proc.killed) {
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
