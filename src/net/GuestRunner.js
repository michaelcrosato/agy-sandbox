/**
 * GuestRunner.js (SPEC-136) — secure host-isolated guest execution runner.
 * Spawns untrusted scripts in low-privilege child processes with environment and timeout controls.
 */

import childProcess from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ProcessReaper } from "./ProcessReaper.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.join(__dirname, "GuestRunnerWorker.js");

export const GuestRunner = {
  /**
   * Run an untrusted guest script in an isolated child process.
   * @param {string} scriptPath - Absolute or relative path to the guest script.
   * @param {Object} [options]
   * @param {string} [options.sandboxDir] - Optional directory to jail filesystem writes.
   * @param {number} [options.timeoutMs=5000] - Hard execution time budget.
   * @returns {Promise<{ status: string, exitCode: number | null, signal: string | null, error?: string, stack?: string, stdout: string, stderr: string, childAuditFile?: string }>}
   */
  runScript(scriptPath, options = {}) {
    return new Promise((resolve) => {
      const timeoutMs = options.timeoutMs ?? 5000;
      const sandboxDir = options.sandboxDir
        ? path.resolve(options.sandboxDir)
        : null;
      const resolvedScriptPath = path.resolve(scriptPath);

      const childAuditFile = sandboxDir
        ? path.join(sandboxDir, "security_audit_child.json")
        : process.env.SECURITY_AUDIT_FILE || "";

      // Spawn the bootstrap worker via fork to establish IPC channel
      const child = childProcess.fork(workerPath, [], {
        env: {
          ...process.env,
          GUEST_SCRIPT_PATH: resolvedScriptPath,
          GUEST_SANDBOX_DIR: sandboxDir || "",
          SECURITY_AUDIT_FILE: childAuditFile,
        },
        stdio: "pipe",
      });

      // Register the child process with ProcessReaper to prevent host leaks
      ProcessReaper.registerProcess(child);

      let isSettled = false;
      let IPCData = null;

      // Listen for IPC messages from the bootstrap worker
      child.on("message", (msg) => {
        const m = /** @type {any} */ (msg);
        if (m && (m.status === "success" || m.status === "error")) {
          IPCData = m;
        }
      });

      // Handle child process outputs (stdout/stderr)
      let stdoutData = "";
      let stderrData = "";
      if (child.stdout) {
        child.stdout.on("data", (chunk) => {
          stdoutData += chunk;
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (chunk) => {
          stderrData += chunk;
        });
      }

      // Set hard time budget watchdog timer
      const timeoutTimer = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;

        // Log CPU/timeout violation
        SandboxSecurityRegistry.logViolation("cpu", "guest_timeout", {
          script: resolvedScriptPath,
          timeoutMs,
          reason: `Guest script execution exceeded time budget of ${timeoutMs}ms`,
        });

        // Forcefully SIGKILL the child and its entire process tree
        try {
          if (child.pid) {
            if (process.platform === "win32") {
              childProcess.execSync(`taskkill /F /T /PID ${child.pid}`, {
                stdio: "ignore",
              });
            } else {
              child.kill("SIGKILL");
            }
            /** @type {any} */ (child).killed = true;
          }
          if (!child.killed && typeof child.kill === "function") {
            child.kill("SIGKILL");
          }
        } catch {
          // ignore
        }

        resolve({
          status: "timeout",
          exitCode: null,
          signal: "SIGKILL",
          error: `Execution timeout after ${timeoutMs}ms`,
          stdout: stdoutData,
          stderr: stderrData,
          childAuditFile,
        });
      }, timeoutMs);

      child.on("exit", (code, signal) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutTimer);

        if (code === 0) {
          resolve({
            status: "success",
            exitCode: 0,
            signal: null,
            stdout: stdoutData,
            stderr: stderrData,
            childAuditFile,
          });
        } else {
          resolve({
            status: "error",
            exitCode: code,
            signal,
            error: IPCData?.error || `Process exited with code ${code}`,
            stack: IPCData?.stack,
            stdout: stdoutData,
            stderr: stderrData,
            childAuditFile,
          });
        }
      });
    });
  },
};
