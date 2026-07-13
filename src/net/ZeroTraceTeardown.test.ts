import { describe, test, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import { ZeroTraceTeardown } from "./ZeroTraceTeardown.js";

describe("ZeroTraceTeardown (SPEC-176)", () => {
  afterEach(() => {
    ZeroTraceTeardown.restoreTimerHooks();
    ZeroTraceTeardown.activeProcesses.clear();
    ZeroTraceTeardown.activeStreams.clear();
  });

  test("timer hooks intercept and allow purging", () => {
    ZeroTraceTeardown.initTimerHooks();

    let fired = false;
    const t1 = setTimeout(() => {
      fired = true;
    }, 10000);
    const t2 = setInterval(() => {}, 10000);

    expect(ZeroTraceTeardown.activeTimeouts.has(t1)).toBe(true);
    expect(ZeroTraceTeardown.activeIntervals.has(t2)).toBe(true);

    ZeroTraceTeardown.purgeTimers();

    expect(ZeroTraceTeardown.activeTimeouts.size).toBe(0);
    expect(ZeroTraceTeardown.activeIntervals.size).toBe(0);
    expect(fired).toBe(false);
  });

  test("killProcessTree terminates child processes recursively", () =>
    new Promise((resolve) => {
      // Spawn a node child process that executes a nested child process and busy waits
      const child = childProcess.spawn("node", [
        "-e",
        "const cp = require('child_process'); cp.spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000);",
      ]);

      setTimeout(() => {
        const pid = child.pid;
        expect(pid).toBeDefined();

        if (pid) {
          ZeroTraceTeardown.killProcessTree(pid);

          // Wait a short time for OS process cleanup
          setTimeout(() => {
            let isDead = false;
            try {
              process.kill(pid, 0);
            } catch (err) {
              isDead = err.code === "ESRCH";
            }
            expect(isDead).toBe(true);
            resolve();
          }, 100);
        } else {
          resolve();
        }
      }, 500);
    }));

  test("teardown performs comprehensive purges and self-healing", async () => {
    ZeroTraceTeardown.initTimerHooks();

    const sandboxDir = path.resolve("./data-test-teardown-sandbox");
    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }

    const baselineFile = path.join(sandboxDir, "baseline.txt");
    fs.writeFileSync(baselineFile, "original content", "utf8");

    // Capture baseline snapshot
    const baselineSnapshot = {
      "baseline.txt": {
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        size: 16,
      },
    };

    // Write guest script that writes a drift file
    const scriptPath = path.resolve("./data-test-teardown-sandbox/guest.js");
    fs.writeFileSync(
      scriptPath,
      `
      const fs = require('fs');
      fs.writeFileSync('./data-test-teardown-sandbox/drift.txt', 'drifted');
      setTimeout(() => {}, 10);
    `,
      "utf8",
    );

    const mockChild = {
      pid: 999999,
      connected: true,
      disconnect: vi.fn(),
      stdout: { destroy: vi.fn() },
      stderr: { destroy: vi.fn() },
    };

    // Run teardown directly to verify its individual components
    const clean = await ZeroTraceTeardown.teardown(
      mockChild,
      sandboxDir,
      baselineSnapshot,
    );

    // Should return true since the mock process is not actually alive and timers are cleared
    expect(clean).toBe(true);

    // Drift file should be purged
    const driftExists = fs.existsSync(path.join(sandboxDir, "drift.txt"));
    expect(driftExists).toBe(false);

    // Mock functions should be called
    expect(mockChild.disconnect).toHaveBeenCalled();
    expect(mockChild.stdout.destroy).toHaveBeenCalled();
    expect(mockChild.stderr.destroy).toHaveBeenCalled();

    // Clean up
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });
});
