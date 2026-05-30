import { ProcessReaper } from "./ProcessReaper.js";
import { spawn } from "child_process";

describe("ProcessReaper (SPEC-092)", () => {
  afterEach(async () => {
    await ProcessReaper.reap();
  });

  test("registers, tracks, and terminates worker threads", async () => {
    expect(ProcessReaper.getWorkerCount()).toBe(0);

    // Spawn an infinite loop worker using eval option
    const worker = ProcessReaper.spawnWorker("setInterval(() => {}, 1000);", {
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
    const worker = ProcessReaper.spawnWorker("console.log('exiting');", {
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
});
