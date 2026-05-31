/**
 * PortReclaimer.js (spec 106) — cross-platform utility to detect and aggressively
 * terminate zombie processes holding a specific socket port, preventing EADDRINUSE crashes.
 */

import childProcess from "child_process";

/**
 * Searches and terminates any other process occupying the target port.
 * @param {number} port - The TCP port to inspect and reclaim.
 * @returns {Promise<boolean>} Resolves to true if a process was found and terminated, false otherwise.
 */
export async function reclaimPort(port) {
  if (!port || typeof port !== "number") {
    return false;
  }

  const pids = [];
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      // Execute netstat -ano to find process mappings
      const stdout = childProcess.execSync("netstat -ano").toString();
      const lines = stdout.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Example line: TCP  0.0.0.0:18196  0.0.0.0:0  LISTENING  12345
        const parts = trimmed.split(/\s+/);
        if (parts.length < 5) continue;

        const localAddress = parts[1];
        const state = parts[3];
        const pidStr = parts[parts.length - 1];

        // Check if local address matches the port suffix
        const matchesPort =
          localAddress.endsWith(`:${port}`) ||
          localAddress.endsWith(`]:${port}`);

        if (matchesPort && state === "LISTENING") {
          const pid = parseInt(pidStr, 10);
          if (
            !isNaN(pid) &&
            pid > 0 &&
            pid !== process.pid &&
            !pids.includes(pid)
          ) {
            pids.push(pid);
          }
        }
      }
    } else {
      // Execute lsof to find listening PIDs on Unix/macOS
      try {
        const stdout = childProcess.execSync(`lsof -t -i :${port}`).toString();
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          const pid = parseInt(line.trim(), 10);
          if (
            !isNaN(pid) &&
            pid > 0 &&
            pid !== process.pid &&
            !pids.includes(pid)
          ) {
            pids.push(pid);
          }
        }
      } catch (err) {
        // lsof returns exit code 1 if no process is found on the port
      }
    }

    if (pids.length === 0) {
      return false;
    }

    // Terminate discovered zombie processes
    for (const pid of pids) {
      console.log(
        `[PORT RECLAIMER] Found zombie PID [${pid}] occupying port [${port}]. Reclaiming...`,
      );
      try {
        process.kill(pid, "SIGKILL");
      } catch (killErr) {
        console.warn(
          `[PORT RECLAIMER] Failed to kill PID [${pid}]: ${killErr.message}`,
        );
      }
    }

    // Briefly sleep to let the OS release the socket binding
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  } catch (err) {
    console.error(
      `[PORT RECLAIMER] Port reclamation encountered an error: ${err.message}`,
    );
    return false;
  }
}
