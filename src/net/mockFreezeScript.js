/**
 * mockFreezeScript.js (spec 133 test helper)
 * Initializes MainThreadWatchdog and simulates an event loop freeze.
 */

import { MainThreadWatchdog } from "./MainThreadWatchdog.js";

const timeoutMs = parseInt(process.env.WATCHDOG_TIMEOUT || "300", 10);
const intervalMs = parseInt(process.env.WATCHDOG_INTERVAL || "50", 10);

// Start the watchdog
MainThreadWatchdog.start(timeoutMs, intervalMs);

// Wait shortly to let some heartbeats pass successfully, then freeze
setTimeout(() => {
  // Induces an absolute synchronous CPU-exhausting freeze
  const endTime = Date.now() + 5000;
  while (Date.now() < endTime) {
    // Spin in a CPU block
  }
}, 150);
