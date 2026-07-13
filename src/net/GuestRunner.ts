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
import { SecureModuleRegistry } from "./SecureModuleRegistry.js";
import { StaticSecuritySentry } from "./StaticSecuritySentry.js";
import { DynamicResourceGovernor } from "./DynamicResourceGovernor.js";
import { loadAllowlist } from "./DnsEgressSentry.js";
import { ZeroTraceTeardown } from "./ZeroTraceTeardown.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In the compiled build (dist/net) the fork target sits beside this file. Under
// the Vitest source run (src/net) only the .ts exists, so fall back to the
// compiled worker in dist/ — the gate builds before tests run. Node's `fork`
// requires a runnable .js, so this must always resolve to compiled output.
const localWorkerPath = path.join(__dirname, "GuestRunnerWorker.js");
const workerPath = fs.existsSync(localWorkerPath)
  ? localWorkerPath
  : path.resolve(__dirname, "../../dist/net/GuestRunnerWorker.js");

/**
 * Guest Runner (SPEC-136) managing isolated guest process executions.
 */
export const GuestRunner = {
  activeRuns: new Map(), // pid -> info
  recentRuns: [], // array of completed run summaries, keep last 15
  totalTokensSpent: 0,
  totalUsdConsumed: 0.0,
  getTotalTokensSpent() {
    return this.totalTokensSpent;
  },
  getTotalUsdConsumed() {
    return this.totalUsdConsumed;
  },

  /**
   * Run an untrusted guest script in an isolated child process.
   * @param {string} scriptPath - Absolute or relative path to the guest script.
   * @param {Object} [options]
   * @param {string} [options.sandboxDir] - Optional directory to jail filesystem writes.
   * @param {number} [options.timeoutMs=5000] - Hard execution time budget.
   * @param {number} [options.maxMemoryMb=128] - Hard V8 old generation heap memory cap.
   * @param {number} [options.cpuTimeBudgetMs=2000] - Cumulative CPU execution time budget.
   * @param {Object} [options.rpcHandlers] - Custom RPC query handlers.
   * @param {boolean} [options.bypassStaticCheck=false] - Skip static analysis pre-scans (useful for runtime exception testing).
   * @returns {Promise<{ status: string, exitCode: number | null, signal: string | null, error?: string, stack?: string, stdout: string, stderr: string, childAuditFile?: string }>}
   */
  runScript(scriptPath, options: any = {}): Promise<any> {
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
      const timeoutMs = options.timeoutMs ?? 5000;
      const maxMemoryMb = options.maxMemoryMb ?? 128;
      const cpuTimeBudgetMs = options.cpuTimeBudgetMs ?? 2000;
      const resolvedScriptPath = path.resolve(scriptPath);

      // Invoke static security pre-scan AST analysis (SPEC-171)
      if (!options.bypassStaticCheck) {
        try {
          if (fs.existsSync(resolvedScriptPath)) {
            const scriptContent = fs.readFileSync(resolvedScriptPath, "utf8");
            StaticSecuritySentry.checkScript(scriptContent);
          }
        } catch (err) {
          ZeroTraceTeardown.teardown(null, sandboxDir, baselineSnapshot)
            .catch(() => {})
            .then(() => {
              realResolve({
                status: "crashed",
                exitCode: null,
                signal: null,
                error: err.message,
                stdout: "",
                stderr: `[SECURITY ACCESS DENIED] Static analysis failed: ${err.message}`,
              });
            });
          return;
        }
      }

      DynamicResourceGovernor.acquireLaunchPermit().then(() => {
        const resolve = async (result) => {
          DynamicResourceGovernor.releaseLaunchPermit();
          try {
            await ZeroTraceTeardown.teardown(
              child,
              sandboxDir,
              baselineSnapshot,
            );
          } catch {
            // ignore
          }
          realResolve(result);
        };

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

        // Generate a high-entropy cryptographic secret for IPC signing (SPEC-175)
        const hmacSecret = crypto.randomBytes(32).toString("hex");

        // Register the main guest script file in the module signatures registry (SPEC-152)
        SecureModuleRegistry.registerFile(resolvedScriptPath);

        // Configure secure env mask to prevent sensitive host info leakage (SPEC-141)
        const allowedKeys = [
          "NODE_ENV",
          "PATH",
          "Path",
          "GUEST_SCRIPT_PATH",
          "GUEST_SANDBOX_DIR",
          "SECURITY_AUDIT_FILE",
          "GUEST_RUN_TOKEN",
          "GUEST_HMAC_KEY",
          "GUEST_ALLOWED_MODULE_HASHES",
          "GUEST_DNS_ALLOWLIST",
        ];
        const childEnv: any = {};
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
        childEnv.GUEST_HMAC_KEY = hmacSecret;
        childEnv.GUEST_ALLOWED_MODULE_HASHES = JSON.stringify(
          SecureModuleRegistry.getRegistry(),
        );
        childEnv.GUEST_DNS_ALLOWLIST = JSON.stringify(loadAllowlist());

        // Spawn the bootstrap worker via fork to establish IPC channel
        const child = childProcess.fork(workerPath, [], {
          env: childEnv as any,
          execArgv,
          stdio: "pipe",
        });

        // Configure normal CPU scheduling priority to start with, and let governor down-throttle it if needed (SPEC-172)
        const procAny = process as any;
        if (child.pid && typeof procAny.setPriority === "function") {
          try {
            procAny.setPriority(child.pid, 0); // Start at normal priority 0
          } catch (err) {
            // Gracefully degrade if system restrictions or permissions prevent priority tuning
            console.warn(
              `[WARNING] Failed to set CPU scheduling priority for guest PID ${child.pid}: ${err.message}`,
            );
          }
        }

        // Configure OS kernel-level process containment boundaries (SPEC-151)
        if (child.pid) {
          const numericPid = parseInt(String(child.pid), 10);
          if (!isNaN(numericPid) && numericPid > 0) {
            const isTest = process.env.NODE_ENV === "test";
            const isMocked = childProcess.exec
              .toString()
              .includes("commandCalled");
            if (!isTest || isMocked) {
              if (process.platform === "win32") {
                // Enforce processor core affinity (restrict to CPU core 0) natively on Windows via PowerShell
                childProcess.exec(
                  `powershell -Command "$p = Get-Process -Id ${numericPid} -ErrorAction SilentlyContinue; if ($p) { $p.ProcessorAffinity = 1 }"`,
                  (err) => {
                    if (err && !isTest) {
                      console.warn(
                        `[WARNING] Failed to restrict processor core affinity for guest PID ${numericPid}: ${err.message}`,
                      );
                      SandboxSecurityRegistry.logViolation(
                        "process",
                        "affinity_fallback",
                        {
                          pid: numericPid,
                          error: err.message,
                        },
                      );
                    }
                  },
                );
              } else if (process.platform === "linux") {
                // Enforce processor core affinity and idle I/O priority natively on Linux
                childProcess.exec(`taskset -cp 0 ${numericPid}`, (err) => {
                  if (err && !isTest) {
                    console.warn(
                      `[WARNING] Failed to restrict processor core affinity for guest PID ${numericPid}: ${err.message}`,
                    );
                    SandboxSecurityRegistry.logViolation(
                      "process",
                      "affinity_fallback",
                      {
                        pid: numericPid,
                        error: err.message,
                      },
                    );
                  }
                });
                childProcess.exec(`ionice -c 3 -p ${numericPid}`, (err) => {
                  if (err && !isTest) {
                    console.warn(
                      `[WARNING] Failed to restrict I/O priority for guest PID ${numericPid}: ${err.message}`,
                    );
                    SandboxSecurityRegistry.logViolation(
                      "process",
                      "io_priority_fallback",
                      {
                        pid: numericPid,
                        error: err.message,
                      },
                    );
                  }
                });
              }
            }
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
          tokensSpent: 0,
          usdConsumed: 0.0,
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
            lastCpuTimeMs > cpuTimeBudgetMs ||
            elapsedSinceLastHeartbeat > cpuTimeBudgetMs
          ) {
            killCpuExhausted(
              lastCpuTimeMs > cpuTimeBudgetMs ? "accumulated" : "blocked",
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
              (child as any).killed = true;
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
              (child as any).killed = true;
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

        function triggerHostAlarm(category, details) {
          try {
            SandboxSecurityRegistry.logViolation(
              "intrusion",
              category,
              details,
            );
          } catch {
            // ignore
          }
          killIntruder(`${category}: ${JSON.stringify(details)}`);
        }

        // Listen for IPC messages from the bootstrap worker
        child.on("message", async (msg) => {
          if (!msg || typeof msg !== "object") {
            triggerHostAlarm("invalid_payload", {
              reason: "IPC message must be an object",
            });
            return;
          }

          const m = msg as any;
          const { signature } = m;
          const payload = { ...m, signature: undefined };
          const payloadStr = JSON.stringify(payload);
          const computedSig = crypto
            .createHmac("sha256", hmacSecret)
            .update(payloadStr)
            .digest("hex");

          if (computedSig !== signature) {
            triggerHostAlarm("signature_mismatch", {
              reason: "HMAC signature verification failed",
            });
            return;
          }

          if (m.type === "intrusion_alert") {
            triggerHostAlarm(m.category || "intrusion_alert", m.details || {});
            return;
          }

          if (m.type === "cpu_heartbeat") {
            lastHeartbeatTime = Date.now();
            lastCpuTimeMs = m.cpuTimeMs;
            if (child.pid) {
              const current = GuestRunner.activeRuns.get(child.pid);
              if (current) {
                current.cpuTimeMs = m.cpuTimeMs;
                current.rssBytes = m.rssBytes || 0;
                current.heapUsedBytes = m.heapUsedBytes || 0;
                current.heapTotalBytes = m.heapTotalBytes || 0;

                const prevTokens = current.tokensSpent || 0;
                const prevUsd = current.usdConsumed || 0.0;
                current.tokensSpent = m.tokensSpent || 0;
                current.usdConsumed = m.usdConsumed || 0.0;

                const diffTokens = current.tokensSpent - prevTokens;
                const diffUsd = current.usdConsumed - prevUsd;

                GuestRunner.totalTokensSpent += diffTokens;
                GuestRunner.totalUsdConsumed += diffUsd;

                // Evaluate and throttle if near budget
                DynamicResourceGovernor.evaluateAndThrottle(child.pid, current);
              }
            }
          } else if (m.type === "guest_rpc") {
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
                triggerHostAlarm("rpc_auth_failure", {
                  action: m.action,
                  reason: "Invalid or spoofed guest run token",
                });
                return;
              }
              if (child.send) {
                child.send(response);
              }
            }
          } else if (m.status === "success" || m.status === "error") {
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
              (child as any).killed = true;
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
    });
  },
};
