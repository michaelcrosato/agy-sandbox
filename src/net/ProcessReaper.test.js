import { ProcessReaper } from "./ProcessReaper.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ProcessSentinel } from "./ProcessSentinel.js";
import childProcess from "child_process";

describe("ProcessReaper (SPEC-092)", () => {
  afterEach(async () => {
    await ProcessReaper.reap();
  });

  test("registers, tracks, and terminates worker threads", async () => {
    expect(ProcessReaper.getWorkerCount()).toBe(0);

    // Spawn an infinite loop worker using eval option
    const _worker = ProcessReaper.spawnWorker("setInterval(() => {}, 1000);", {
      eval: true,
    });

    expect(ProcessReaper.getWorkerCount()).toBe(1);

    // Reaping must clean it up
    await ProcessReaper.reap();
    expect(ProcessReaper.getWorkerCount()).toBe(0);
  });

  test("registers, tracks, and terminates child processes", async () => {
    expect(ProcessReaper.getProcessCount()).toBe(0);

    // Spawn an infinite process
    const proc = spawn("node", ["-e", "setInterval(() => {}, 1000)"]);
    ProcessReaper.registerProcess(proc);

    expect(ProcessReaper.getProcessCount()).toBe(1);

    // Reaping must kill it
    await ProcessReaper.reap();
    expect(ProcessReaper.getProcessCount()).toBe(0);
    expect(proc.killed).toBe(true);
  });

  test("automatically removes exited worker threads and processes", async () => {
    // Spawn a worker that exits instantly
    const _worker = ProcessReaper.spawnWorker("console.log('exiting');", {
      eval: true,
    });

    // Wait briefly for exit
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(ProcessReaper.getWorkerCount()).toBe(0);

    // Spawn a process that exits instantly
    const proc = spawn("node", ["-e", "process.exit(0)"]);
    ProcessReaper.registerProcess(proc);

    // Wait briefly for exit
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(ProcessReaper.getProcessCount()).toBe(0);
  });

  test("automatically registers spawned processes when ProcessSentinel is active", async () => {
    expect(ProcessReaper.getProcessCount()).toBe(0);

    process.env.TEST_SENTINEL_FORCE = "true";
    ProcessSentinel.activate();
    try {
      const _proc = childProcess.spawn("node", [
        "src/net/temp_port_worker.mjs",
      ]);
      expect(ProcessReaper.getProcessCount()).toBe(1);

      await ProcessReaper.reap();
      expect(ProcessReaper.getProcessCount()).toBe(0);
    } finally {
      ProcessSentinel.deactivate();
      delete process.env.TEST_SENTINEL_FORCE;
    }
  });

  test("reaps a nested process tree (children and grandchildren) recursively", async () => {
    // Write temporary scripts for nesting
    const childScriptPath = path.resolve("temp_child.js");
    const grandchildScriptPath = path.resolve("temp_grandchild.js");
    const childPidPath = path.resolve("child.pid");
    const grandchildPidPath = path.resolve("grandchild.pid");

    fs.writeFileSync(
      grandchildScriptPath,
      `import fs from "fs";
fs.writeFileSync("${grandchildPidPath.replace(/\\/g, "/")}", process.pid.toString());
setInterval(() => {}, 1000);`,
    );

    fs.writeFileSync(
      childScriptPath,
      `import { spawn } from "child_process";
import fs from "fs";
fs.writeFileSync("${childPidPath.replace(/\\/g, "/")}", process.pid.toString());
const proc = spawn("node", ["${grandchildScriptPath.replace(/\\/g, "/")}"]);
setInterval(() => {}, 1000);`,
    );

    // Spawn child
    const childProc = childProcess.spawn("node", [childScriptPath]);
    ProcessReaper.registerProcess(childProc);

    // Wait for pids to be written
    let attempts = 0;
    while (
      (!fs.existsSync(childPidPath) || !fs.existsSync(grandchildPidPath)) &&
      attempts < 50
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    expect(fs.existsSync(childPidPath)).toBe(true);
    expect(fs.existsSync(grandchildPidPath)).toBe(true);

    const childPid = parseInt(fs.readFileSync(childPidPath, "utf8"), 10);
    const grandchildPid = parseInt(
      fs.readFileSync(grandchildPidPath, "utf8"),
      10,
    );

    // Verify they are running
    expect(() => process.kill(childPid, 0)).not.toThrow();
    expect(() => process.kill(grandchildPid, 0)).not.toThrow();

    // Reap
    await ProcessReaper.reap();

    // Verify both are dead
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(() => process.kill(grandchildPid, 0)).toThrow();

    // Clean up files
    try {
      fs.unlinkSync(childScriptPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(grandchildScriptPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(childPidPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(grandchildPidPath);
    } catch {
      // ignore
    }
  });

  test("manages signal and exit listeners autonomously (SPEC-170)", () => {
    // Initially no listeners registered because getProcessCount/getWorkerCount is 0
    expect(ProcessReaper.getProcessCount()).toBe(0);
    expect(ProcessReaper.getWorkerCount()).toBe(0);

    // Spawn a mock process
    const proc = spawn("node", ["-e", "setInterval(() => {}, 1000)"]);
    ProcessReaper.registerProcess(proc);

    // Verify it added the process and auto-registered the signal handlers
    expect(ProcessReaper.getProcessCount()).toBe(1);

    // Reap synchronously via reapSync
    ProcessReaper.reapSync();

    // Verify it reaped everything and automatically removed signal handlers
    expect(ProcessReaper.getProcessCount()).toBe(0);
  });
});
