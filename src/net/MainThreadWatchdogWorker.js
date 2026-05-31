/**
 * MainThreadWatchdogWorker.js (spec 133) — background worker thread
 * that monitors the responsiveness of Node's main event loop.
 */

import { parentPort, workerData } from "worker_threads";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const timeoutMs = workerData?.timeoutMs || 1000;
const pingIntervalMs = workerData?.pingIntervalMs || 200;

let pingCounter = 0;
let currentTimeout = null;
let _nextPingTimeout = null;
let isStopped = false;

/**
 * Sends a ping message to the main thread and starts a timeout.
 */
function sendPing() {
  if (isStopped) return;

  pingCounter++;
  const id = pingCounter;

  // Send ping to parent thread
  parentPort.postMessage({ type: "ping", id });

  // Set timeout to wait for pong response
  currentTimeout = setTimeout(() => {
    if (isStopped) return;

    // Heartbeat failed — Main thread is frozen!
    try {
      SandboxSecurityRegistry.logViolation("cpu", "main_thread_freeze", {
        timeoutMs,
        reason: `Node main event loop is unresponsive (no heartbeat received for > ${timeoutMs}ms).`,
      });
    } catch {
      // Degrade gracefully if logger fails
    }

    // Forcefully SIGKILL the frozen process
    process.kill(process.pid, "SIGKILL");
  }, timeoutMs);
}

// Listen for pong response from main thread
parentPort.on("message", (msg) => {
  if (isStopped) return;

  if (msg.type === "pong" && msg.id === pingCounter) {
    // Clear the active response timeout
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }

    // Schedule the next ping
    _nextPingTimeout = setTimeout(sendPing, pingIntervalMs);
  }
});

// Start the watchdog ping loop
sendPing();
