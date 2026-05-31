/**
 * GuestRunner.js (SPEC-136) — secure host-isolated guest execution runner.
 * Spawns untrusted scripts in low-privilege child processes with environment and timeout controls.
 */

import fs from "fs";
import childProcess from "child_process";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { ProcessReaper } from "./ProcessReaper.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import { GuestRpcSentry } from "./GuestRpcSentry.js";
import { WorkspaceDriftSentry } from "./WorkspaceDriftSentry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.join(__dirname, "GuestRunnerWorker.js");

export const GuestRunner = {
  activeRuns: new Map(), // pid -> info
  recentRuns: [], // array of completed run summaries, keep last 15

  /**
   * Run an untrusted guest script in an isolated child process.
   * @param {string} scriptPath - Absolute or relative path to the guest script.
   * @param {Object} [options]
   * @param {string} [options.sandboxDir] - Optional directory to jail filesystem writes.
   * @param {number} [options.timeoutMs=5000] - Hard execution time budget.
   * @param {number} [options.maxMemoryMb=128] - Hard V8 old generation heap memory cap.
   * @param {number} [options.cpuTimeBudgetMs=2000] - Cumulative CPU execution time budget.
   * @param {Object} [options.rpcHandlers] - Custom RPC query handlers.
   * @returns {Promise<{ status: string, exitCode: number | null, signal: string | null, error?: string, stack?: string, stdout: string, stderr: string, childAuditFile?: string }>}
   */
  runScript(scriptPath, options = {}) {
    const sandboxDir = options.sandboxDir
      ? path.resolve(options.sandboxDir)
      : null;

    let baselineSnapshot = null;
    if (sandboxDir && fs.existsSync(sandboxDir)) {
      try {
        baselineSnapshot = WorkspaceDriftSentry.takeSnapshot(sandboxDir);
      } catch {
        // ignore
      }
    }

    return new Promise((realResolve) => {
      const resolve = (result) => {
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
        realResolve(result);
      };

      const timeoutMs = options.timeoutMs ?? 5000;
      const maxMemoryMb = options.maxMemoryMb ?? 128;
      const cpuTimeBudgetMs = options.cpuTimeBudgetMs ?? 2000;
      const resolvedScriptPath = path.resolve(scriptPath);

      const childAuditFile = sandboxDir
        ? path.join(sandboxDir, "security_audit_child.json")
        : process.env.SECURITY_AUDIT_FILE || "";

      // Configure execArgv with V8 memory limit override
      const parentExecArgv = (process.execArgv || []).filter(
        (arg) => !arg.startsWith("--max-old-space-size="),
      );
      const execArgv = [
        ...parentExecArgv,
        `--max-old-space-size=${maxMemoryMb}`,
      ];

      // Generate a high-entropy single-use run token for Guest RPC auth verification (SPEC-148)
      const runToken = crypto.randomBytes(32).toString("hex");

      // Configure secure env mask to prevent sensitive host info leakage (SPEC-141)
      const allowedKeys = [
        "NODE_ENV",
        "PATH",
        "Path",
        "GUEST_SCRIPT_PATH",
        "GUEST_SANDBOX_DIR",
        "SECURITY_AUDIT_FILE",
        "GUEST_RUN_TOKEN",
      ];
      const childEnv = {};
      for (const key of allowedKeys) {
        if (process.env[key] !== undefined) {
          childEnv[key] = process.env[key];
        }
      }
      if (!childEnv.NODE_ENV) {
        childEnv.NODE_ENV = process.env.NODE_ENV || "production";
      }
      childEnv.GUEST_SCRIPT_PATH = resolvedScriptPath;
      childEnv.GUEST_SANDBOX_DIR = sandboxDir || "";
      childEnv.SECURITY_AUDIT_FILE = childAuditFile;
      childEnv.GUEST_RUN_TOKEN = runToken;

      // Spawn the bootstrap worker via fork to establish IPC channel
      const child = childProcess.fork(workerPath, [], {
        env: /** @type {any} */ (childEnv),
        execArgv,
        stdio: "pipe",
      });

      // Configure low OS scheduling priority to safeguard host resources (SPEC-149)
      const procAny = /** @type {any} */ (process);
      if (child.pid && typeof procAny.setPriority === "function") {
        try {
          procAny.setPriority(child.pid, 19); // 19 is the lowest scheduling priority (lowest nice value)
        } catch (err) {
          // Gracefully degrade if system restrictions or permissions prevent priority tuning
          console.warn(
            `[WARNING] Failed to set low CPU scheduling priority for guest PID ${child.pid}: ${err.message}`,
          );
        }
      }

      const startTime = Date.now();
      const runInfo = {
        pid: child.pid,
        script: path.basename(resolvedScriptPath),
        fullScriptPath: resolvedScriptPath,
        timeoutMs,
        maxMemoryMb,
        cpuTimeBudgetMs,
        rssBytes: 0,
        heapUsedBytes: 0,
        cpuTimeMs: 0,
        status: "running",
        startTime,
      };

      if (child.pid) {
        GuestRunner.activeRuns.set(child.pid, runInfo);
      }

      function recordCompletion(pid, finalStatus, errorMsg = null) {
        if (!pid) return;
        const current = GuestRunner.activeRuns.get(pid);
        if (current) {
          GuestRunner.activeRuns.delete(pid);
          current.status = finalStatus;
          current.endTime = Date.now();
          current.durationMs = current.endTime - current.startTime;
          if (errorMsg) {
            current.error = errorMsg;
          }
          GuestRunner.recentRuns.unshift(current);
          if (GuestRunner.recentRuns.length > 15) {
            GuestRunner.recentRuns.pop();
          }
        }
      }

      // Register the child process with ProcessReaper to prevent host leaks
      ProcessReaper.registerProcess(child);

      let isSettled = false;
      let IPCData = null;
      let lastHeartbeatTime = Date.now();
      let lastCpuTimeMs = 0;

      // Monitor CPU limits via heartbeats and blocked loops
      const checkInterval = setInterval(() => {
        if (isSettled) {
          clearInterval(checkInterval);
          return;
        }

        const elapsedSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
        // If event loop has been blocked with no heartbeat ticks, that constitutes active CPU pegging.
        // Also check if cumulative reported CPU exceeds the budget.
        if (
          elapsedSinceLastHeartbeat > cpuTimeBudgetMs ||
          lastCpuTimeMs > cpuTimeBudgetMs
        ) {
          killCpuExhausted(
            elapsedSinceLastHeartbeat > cpuTimeBudgetMs
              ? "blocked"
              : "accumulated",
          );
        }
      }, 50);

      function killCpuExhausted(reasonType) {
        if (isSettled) return;
        isSettled = true;
        clearInterval(checkInterval);
        clearTimeout(timeoutTimer);

        const errMsg = `[SECURITY ACCESS DENIED] Guest script execution exceeded cumulative CPU budget of ${cpuTimeBudgetMs}ms (${reasonType})`;
        SandboxSecurityRegistry.logViolation("cpu", "cpu_exhaustion", {
          script: resolvedScriptPath,
          cpuBudgetMs: cpuTimeBudgetMs,
          reason: errMsg,
        });

        recordCompletion(child.pid, "killed_cpu", errMsg);

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
          status: "error",
          exitCode: null,
          signal: "SIGKILL",
          error: errMsg,
          stdout: stdoutData,
          stderr: stderrData,
          childAuditFile,
        });
      }

      function killIntruder(reason) {
        if (isSettled) return;
        isSettled = true;
        clearInterval(checkInterval);
        clearTimeout(timeoutTimer);

        const errMsg = `[SECURITY ACCESS DENIED] Guest RPC channel authentication failure: ${reason}`;

        recordCompletion(child.pid, "killed_auth", errMsg);

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
          status: "error",
          exitCode: null,
          signal: "SIGKILL",
          error: errMsg,
          stdout: stdoutData,
          stderr: stderrData,
          childAuditFile,
        });
      }

      // Listen for IPC messages from the bootstrap worker
      child.on("message", async (msg) => {
        const m = /** @type {any} */ (msg);
        if (m && m.type === "cpu_heartbeat") {
          lastHeartbeatTime = Date.now();
          lastCpuTimeMs = m.cpuTimeMs;
          if (child.pid) {
            const current = GuestRunner.activeRuns.get(child.pid);
            if (current) {
              current.cpuTimeMs = m.cpuTimeMs;
              current.rssBytes = m.rssBytes || 0;
              current.heapUsedBytes = m.heapUsedBytes || 0;
              current.heapTotalBytes = m.heapTotalBytes || 0;
            }
          }
        } else if (m && m.type === "guest_rpc") {
          const response = await GuestRpcSentry.handleMessage(
            m,
            options.rpcHandlers,
            runToken,
          );
          if (response) {
            if (
              response.status === "error" &&
              response.error === "AUTH_FAILURE"
            ) {
              killIntruder(response.error);
              return;
            }
            if (child.send) {
              child.send(response);
            }
          }
        } else if (m && (m.status === "success" || m.status === "error")) {
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
        clearInterval(checkInterval);

        // Log CPU/timeout violation
        SandboxSecurityRegistry.logViolation("cpu", "guest_timeout", {
          script: resolvedScriptPath,
          timeoutMs,
          reason: `Guest script execution exceeded time budget of ${timeoutMs}ms`,
        });

        const errMsg = `Execution timeout after ${timeoutMs}ms`;
        recordCompletion(child.pid, "timeout", errMsg);

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
          error: errMsg,
          stdout: stdoutData,
          stderr: stderrData,
          childAuditFile,
        });
      }, timeoutMs);

      child.on("exit", (code, signal) => {
        if (isSettled) return;
        isSettled = true;
        clearInterval(checkInterval);
        clearTimeout(timeoutTimer);

        if (code === 0) {
          recordCompletion(child.pid, "success");
          resolve({
            status: "success",
            exitCode: 0,
            signal: null,
            stdout: stdoutData,
            stderr: stderrData,
            childAuditFile,
          });
        } else {
          const errMsg = IPCData?.error || `Process exited with code ${code}`;
          recordCompletion(child.pid, "error", errMsg);
          resolve({
            status: "error",
            exitCode: code,
            signal,
            error: errMsg,
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
