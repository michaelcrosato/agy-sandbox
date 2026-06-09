/**
 * loop-monitor.test.js
 * Comprehensive unit tests for loop-monitor.js control plane health checks.
 */

import { jest } from "@jest/globals";
import fs from "node:fs";
import childProcess from "node:child_process";
import { checkAnomaly, runDaemon } from "./loop-monitor.js";

describe("Control Loop Monitor (Anomaly Detector)", () => {
  let existsSpy;
  let readSpy;
  let readdirSpy;
  let statSpy;
  let execSpy;

  const mockProcessesOutput = (list) => {
    if (process.platform === "win32") {
      return JSON.stringify(list);
    } else {
      let output = "  PID COMMAND\n";
      for (const p of list) {
        output += ` ${p.ProcessId} ${p.CommandLine}\n`;
      }
      return output;
    }
  };

  beforeEach(() => {
    existsSpy = jest.spyOn(fs, "existsSync").mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("loop_active.lock")) return false;
      if (pathStr.includes("logs")) return false;
      return true;
    });
    readSpy = jest.spyOn(fs, "readFileSync");
    readdirSpy = jest.spyOn(fs, "readdirSync");
    statSpy = jest.spyOn(fs, "statSync");
    execSpy = jest.spyOn(childProcess, "execSync");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should report no anomalies under healthy normal execution", () => {
    statSpy.mockImplementation(() => ({
      mtimeMs: Date.now(), // fresh files
      isFile: () => true,
    }));

    execSpy.mockReturnValue(
      mockProcessesOutput([
        {
          ProcessId: 1234,
          CommandLine: "powershell -File scripts/run-afk-loop.ps1",
        },
      ]),
    );

    readSpy.mockReturnValue(
      "## 2026-06-09T06:01 · iter-0149 · GREEN · some-task\n" +
        "## 2026-06-09T06:01 · iter-0148 · GREEN · another-task\n",
    );

    const { anomalies } = checkAnomaly();
    expect(anomalies.length).toBe(0);
  });

  test("should report wrapper_death if lock file exists but no processes are running", () => {
    existsSpy.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("loop_active.lock")) return true;
      return false;
    });

    execSpy.mockReturnValue(""); // No running loops

    const { anomalies } = checkAnomaly();
    const death = anomalies.find((a) => a.type === "wrapper_death");
    expect(death).toBeDefined();
    expect(death.details).toContain("no wrapper processes");
  });

  test("should report stalled_progress if loop runs but progress has not updated", () => {
    existsSpy.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("loop_active.lock")) return true;
      if (pathStr.includes("logs")) return false;
      return true;
    });

    statSpy.mockImplementation(() => ({
      mtimeMs: Date.now() - 40 * 60 * 1000, // 40 minutes ago (exceeds MAX_STALL_TIME_MS)
      isFile: () => true,
    }));

    execSpy.mockReturnValue(
      mockProcessesOutput([
        {
          ProcessId: 1234,
          CommandLine: "powershell -File scripts/run-afk-loop.ps1",
        },
      ]),
    );

    readSpy.mockReturnValue(
      "## 2026-06-09T06:01 · iter-0149 · GREEN · some-task",
    );

    const { anomalies } = checkAnomaly();
    const stall = anomalies.find((a) => a.type === "stalled_progress");
    expect(stall).toBeDefined();
    expect(stall.details).toContain(
      "neither PROGRESS.md nor LOG.md has been modified",
    );
  });

  test("should report critical_error if a log file has unhandled exceptions", () => {
    existsSpy.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("loop_active.lock")) return false;
      return true;
    });

    statSpy.mockImplementation(() => ({
      mtimeMs: Date.now(), // modified recently
      isFile: () => true,
    }));

    readdirSpy.mockReturnValue(["run-20260608-230000.log"]);

    readSpy.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("run-20260608-230000.log")) {
        return "Info: start running task\nFatal Error: OutOfMemoryException on V8 heap\n";
      }
      return "## 2026-06-09T06:01 · iter-0149 · GREEN · task";
    });

    execSpy.mockReturnValue(
      mockProcessesOutput([
        {
          ProcessId: 1234,
          CommandLine: "powershell -File scripts/run-afk-loop.ps1",
        },
      ]),
    );

    const { anomalies } = checkAnomaly();
    const error = anomalies.find((a) => a.type === "critical_error");
    expect(error).toBeDefined();
    expect(error.details).toContain("OutOfMemory");
  });

  test("should report repeated_failures if last 3 runs failed", () => {
    // Use default existsSpy mock

    statSpy.mockImplementation(() => ({
      mtimeMs: Date.now(),
      isFile: () => true,
    }));

    execSpy.mockReturnValue(
      mockProcessesOutput([
        {
          ProcessId: 1234,
          CommandLine: "powershell -File scripts/run-afk-loop.ps1",
        },
      ]),
    );

    readSpy.mockReturnValue(
      "## 2026-06-09T06:01 · iter-0149 · RED · task-1\n" +
        "## 2026-06-09T06:01 · iter-0148 · BLOCKED · task-2\n" +
        "## 2026-06-09T06:01 · iter-0147 · RED · task-3\n",
    );

    const { anomalies } = checkAnomaly();
    const rep = anomalies.find((a) => a.type === "repeated_failures");
    expect(rep).toBeDefined();
    expect(rep.details).toContain("non-green statuses");
  });

  test("runDaemon should loop and terminate when an anomaly is detected", async () => {
    jest.useFakeTimers();
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    let callCount = 0;
    existsSpy.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes("loop_active.lock")) {
        return callCount > 0;
      }
      if (pathStr.includes("logs")) return false;
      return true;
    });

    execSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return mockProcessesOutput([
          {
            ProcessId: 1234,
            CommandLine: "powershell -File scripts/run-afk-loop.ps1",
          },
        ]);
      } else {
        return "";
      }
    });

    const daemonPromise = runDaemon();

    await expect(
      Promise.all([daemonPromise, jest.advanceTimersByTimeAsync(60 * 1000)]),
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);

    jest.useRealTimers();
  });
});
