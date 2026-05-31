/**
 * MainThreadWatchdog.js (spec 133) — main-thread watchdog orchestrator
 * that spawns a background watchdog worker thread to prevent Event Loop freezes.
 */

import { fileURLToPath } from "url";
import path from "path";
import { ProcessReaper } from "./ProcessReaper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.join(__dirname, "MainThreadWatchdogWorker.js");

let activeWorker = null;

export const MainThreadWatchdog = {
  /**
   * Starts the main-thread event loop watchdog.
   * @param {number} [timeoutMs=1000] - Hard threshold for loop unresponsive timeout in ms.
   * @param {number} [pingIntervalMs=200] - Interval between heartbeat pings in ms.
   */
  start(timeoutMs = 1000, pingIntervalMs = 200) {
    if (activeWorker) {
      return;
    }

    // Spawn worker thread via ProcessReaper to guarantee clean automatic lifecycle sweeps
    activeWorker = ProcessReaper.spawnWorker(workerPath, {
      workerData: { timeoutMs, pingIntervalMs },
    });

    const worker = activeWorker;

    // Listen for heartbeat pings from the worker
    worker.on("message", (msg) => {
      if (msg && msg.type === "ping") {
        // Heartbeat received; reply with a pong immediately
        if (activeWorker === worker) {
          worker.postMessage({ type: "pong", id: msg.id });
        }
      }
    });

    worker.on("error", (err) => {
      console.error("[WATCHDOG WORKER ERROR]", err);
      if (activeWorker === worker) {
        this.stop();
      }
    });

    worker.on("exit", (code) => {
      if (activeWorker === worker) {
        activeWorker = null;
      }
    });
  },

  /**
   * Stops the active watchdog worker.
   */
  stop() {
    if (activeWorker) {
      try {
        activeWorker.terminate();
      } catch {
        // ignore
      }
      activeWorker = null;
    }
  },

  /**
   * Checks whether the watchdog is active.
   * @returns {boolean}
   */
  isActive() {
    return activeWorker !== null;
  },
};
