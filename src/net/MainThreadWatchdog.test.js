/**
 * MainThreadWatchdog.test.js (spec 133) — robust verification suite for
 * the main-thread event loop watchdog.
 */

import { MainThreadWatchdog } from "./MainThreadWatchdog.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import childProcess from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockScriptPath = path.join(__dirname, "mockFreezeScript.js");

describe("MainThreadWatchdog", () => {
  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    MainThreadWatchdog.stop();
    SandboxSecurityRegistry.clearRegistry();
  });

  test("should start, stop, and report active status correctly", () => {
    expect(MainThreadWatchdog.isActive()).toBe(false);
    MainThreadWatchdog.start(500, 100);
    expect(MainThreadWatchdog.isActive()).toBe(true);
    MainThreadWatchdog.stop();
    expect(MainThreadWatchdog.isActive()).toBe(false);
  });

  test("should tolerate normal responsive execution without false-positive blocks", async () => {
    MainThreadWatchdog.start(400, 80);
    // Let the event loop execute normally for a brief period
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(MainThreadWatchdog.isActive()).toBe(true);

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(0);
  });

  test("should forcefully terminate a frozen process and record the violation in the ledger", async () => {
    // Spawn mock script as an isolated child process to test freeze detection safely
    const child = childProcess.fork(mockScriptPath, [], {
      env: {
        ...process.env,
        WATCHDOG_TIMEOUT: "200",
        WATCHDOG_INTERVAL: "30",
      },
      stdio: "pipe",
    });

    const exitPromise = new Promise((resolve) => {
      child.on("exit", (code, signal) => {
        resolve({ code, signal });
      });
    });

    const { code, signal } = await exitPromise;

    // The child must have exited with a non-zero code or a SIGKILL signal
    const exitedIncorrectly =
      (code !== 0 && code !== null) || signal === "SIGKILL";
    expect(exitedIncorrectly).toBe(true);

    // Verify that the freeze violation was recorded to the security registry
    const auditFile = path.resolve("plan/security_audit.json");
    expect(fs.existsSync(auditFile)).toBe(true);
    const logs = JSON.parse(fs.readFileSync(auditFile, "utf8"));

    const cpuViolation = logs.find(
      (log) => log.category === "cpu" && log.action === "main_thread_freeze",
    );
    expect(cpuViolation).toBeDefined();
    expect(cpuViolation.details.timeoutMs).toBe(200);
  });
});
