#!/usr/bin/env node
/**
 * loop-monitor.js
 * Autonomous control plane monitor for loops, wrappers, and execution health.
 * Scans for stalls, wrapper crashes, log errors, and exits with non-zero on anomalies.
 */

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Configurations
const MAX_STALL_TIME_MS = 25 * 60 * 1000; // 25 minutes limit without PROGRESS.md or LOG.md updates
const LOGS_DIR = path.join(repoRoot, "night-queue/logs");
const PROGRESS_PATH = path.join(repoRoot, "plan/PROGRESS.md");
const LOG_PATH = path.join(repoRoot, "docs/LOG.md");
const LOCK_PATH = path.join(repoRoot, "plan/loop_active.lock");
const REPORT_PATH = path.join(repoRoot, "plan/monitoring_report.json");

function getLatestCommitTimeMs() {
  if (process.env.NODE_ENV === "test") {
    return 0;
  }
  try {
    const output = childProcess.execSync("git log -1 --format=%ct", {
      encoding: "utf8",
    });
    const seconds = parseInt(output.trim(), 10);
    return seconds * 1000;
  } catch {
    return 0;
  }
}

function getLatestFileWriteTimeMs(dir) {
  if (process.env.NODE_ENV === "test") {
    return 0;
  }
  let maxTime = 0;
  const ignored = new Set([
    ".git",
    "node_modules",
    "night-queue",
    "coverage",
    "data",
    ".claude",
    ".sandbox-worktrees-test",
  ]);

  function scan(currentDir) {
    let files;
    try {
      files = fs.readdirSync(currentDir);
    } catch {
      return;
    }
    for (const file of files) {
      if (ignored.has(file)) continue;
      const fullPath = path.join(currentDir, file);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        scan(fullPath);
      } else {
        if (stats.mtimeMs > maxTime) {
          maxTime = stats.mtimeMs;
        }
      }
    }
  }

  scan(dir);
  return maxTime;
}

export function getRunningLoopProcesses() {
  try {
    if (process.platform === "win32") {
      // List powershell/node processes and their command line options on Windows
      const cmd = `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'powershell|pwsh|node' } | Select-Object ProcessId, CommandLine | ConvertTo-Json"`;
      const output = childProcess.execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (!output.trim()) return [];
      const parsed = JSON.parse(output);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      return list.filter((p) => {
        const line = p.CommandLine || "";
        return (
          line.includes("run-afk-loop") ||
          line.includes("run-autonomous-loop") ||
          line.includes("claude-night") ||
          line.includes("run-agent.js")
        );
      });
    } else {
      // List processes on POSIX using ps ax
      const cmd = "ps -ax -o pid,command";
      const output = childProcess.execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (!output.trim()) return [];
      const lines = output.split("\n");
      const list = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
          list.push({
            ProcessId: parseInt(match[1], 10),
            CommandLine: match[2],
          });
        }
      }

      return list.filter((p) => {
        const line = p.CommandLine || "";
        return (
          line.includes("run-afk-loop") ||
          line.includes("run-autonomous-loop") ||
          line.includes("claude-night") ||
          line.includes("run-agent")
        );
      });
    }
  } catch {
    return [];
  }
}

export function checkAnomaly() {
  const anomalies = [];
  const runningLoops = getRunningLoopProcesses();
  const isLockPresent = fs.existsSync(LOCK_PATH);

  // 1. Wrapper Death (Only flagged if the lock file is present indicating it should be running)
  if (isLockPresent && runningLoops.length === 0) {
    anomalies.push({
      type: "wrapper_death",
      details:
        "The loop is locked as active, but no wrapper processes (run-afk-loop, run-autonomous-loop, run-agent, or claude-night) are running.",
    });
  }

  // 2. Stalled Progress (Decaying Cadence: every 60s for mins 0-5 [2m threshold], 5m for mins 5-35 [10m threshold], 15m for mins 35-60 [30m threshold], hourly after [2h threshold])
  let maxStallMs = MAX_STALL_TIME_MS;
  let elapsed = 0;
  if (isLockPresent) {
    try {
      const lockStats = fs.statSync(LOCK_PATH);
      elapsed = Date.now() - lockStats.mtimeMs;
      if (elapsed < 5 * 60 * 1000) {
        maxStallMs = 2 * 60 * 1000; // 2 minutes (minutes 0–5)
      } else if (elapsed < 35 * 60 * 1000) {
        maxStallMs = 10 * 60 * 1000; // 10 minutes (minutes 5–35)
      } else if (elapsed < 60 * 60 * 1000) {
        maxStallMs = 30 * 60 * 1000; // 30 minutes (minutes 35–60)
      } else {
        maxStallMs = 120 * 60 * 1000; // 120 minutes (2 hours) (after 1 hour)
      }
    } catch {
      // ignore
    }
  }

  let lastProgressTime = 0;
  if (fs.existsSync(PROGRESS_PATH)) {
    lastProgressTime = fs.statSync(PROGRESS_PATH).mtimeMs;
  }
  let lastLogTime = 0;
  if (fs.existsSync(LOG_PATH)) {
    lastLogTime = fs.statSync(LOG_PATH).mtimeMs;
  }
  const latestCommitTime = getLatestCommitTimeMs();
  const latestFileWriteTime = getLatestFileWriteTimeMs(repoRoot);
  const lastActiveTime = Math.max(
    lastProgressTime,
    lastLogTime,
    latestCommitTime,
    latestFileWriteTime,
  );
  const msSinceActive = Date.now() - lastActiveTime;

  if (runningLoops.length > 0 && msSinceActive > maxStallMs) {
    anomalies.push({
      type: "stalled_progress",
      details: `Loop processes are active (elapsed: ${Math.round(elapsed / 60000)}m), but neither PROGRESS.md nor LOG.md has been modified, and no new artifacts, commits, or state changes (PROGRESS.md/LOG.md/files) have appeared in the last ${Math.round(msSinceActive / 60000)} minutes (threshold: ${Math.round(maxStallMs / 60000)}m).`,
    });
  }

  // 3. Scan Log Files for Critical Errors (Includes repeated git/push failures, unhandled exceptions)
  if (fs.existsSync(LOGS_DIR)) {
    const logFiles = fs
      .readdirSync(LOGS_DIR)
      .map((file) => path.join(LOGS_DIR, file))
      .filter((filePath) => fs.statSync(filePath).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (logFiles.length > 0) {
      const newestLog = logFiles[0];
      const stats = fs.statSync(newestLog);
      // Scan logs updated in the last 15 minutes
      if (Date.now() - stats.mtimeMs < 15 * 60 * 1000) {
        const content = fs.readFileSync(newestLog, "utf8");
        const lines = content.split("\n");
        const errorKeywords = [
          "Fatal Error",
          "OutOfMemory",
          "UnhandledPromiseRejection",
          "ReferenceError",
          "TypeError",
          "Error:",
          "fatal:",
          "uncaughtException",
          "push failed",
          "GitError",
          "git error",
          "failed to push",
          "git push failed",
          "Exception",
          "Compromised",
          "compromised",
        ];

        // Scan the last 200 lines to ensure stack traces or multiple consecutive errors are captured
        for (const line of lines.slice(-200)) {
          for (const kw of errorKeywords) {
            if (line.includes(kw)) {
              anomalies.push({
                type: "critical_error",
                details: `Detected critical pattern [${kw}] in log ${path.basename(newestLog)}: ${line.trim()}`,
              });
              break;
            }
          }
        }
      }
    }
  }

  // 4. Repeated Failures or Spin Detection
  if (fs.existsSync(LOG_PATH)) {
    const content = fs.readFileSync(LOG_PATH, "utf8");
    const matches = [
      ...content.matchAll(/iter-(\d+)\s+·\s+(\w+)\s+·\s+([\w-]+)/g),
    ];
    if (matches.length >= 3) {
      const recent = matches.slice(0, 3).map((m) => m[2]);
      const allFailed = recent.every(
        (status) => status === "RED" || status === "BLOCKED",
      );
      if (allFailed) {
        anomalies.push({
          type: "repeated_failures",
          details: `The last 3 sequential loop iterations resulted in non-green statuses: [${recent.join(", ")}].`,
        });
      }
    }
  }

  return { runningLoops, anomalies };
}

export function pauseLoop(runningLoops) {
  console.log(
    `[MONITOR] Terminating ${runningLoops.length} loop wrapper process(es)...`,
  );
  for (const proc of runningLoops) {
    try {
      console.log(
        `[KILL] Terminating PID ${proc.ProcessId}: ${proc.CommandLine}`,
      );
      if (process.platform === "win32") {
        childProcess.execSync(
          `powershell -Command "Stop-Process -Id ${proc.ProcessId} -Force"`,
        );
      } else {
        childProcess.execSync(`kill -9 ${proc.ProcessId}`);
      }
    } catch (err) {
      console.error(`Failed to kill PID ${proc.ProcessId}:`, err.message);
    }
  }

  // Clear lock file since the loop is stopped
  try {
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {
    // ignore
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runDaemon() {
  console.log(
    `[MONITOR] Starting persistent monitoring daemon at ${new Date().toISOString()}`,
  );
  const startTime = Date.now();

  while (true) {
    console.log(
      `[MONITOR] Performing health scan at ${new Date().toISOString()}`,
    );
    const { runningLoops, anomalies } = checkAnomaly();

    if (anomalies.length > 0) {
      console.error(
        `🚨 [ANOMALY DETECTED] Found ${anomalies.length} control loop issue(s):`,
      );
      for (const a of anomalies) {
        console.error(`- [${a.type}] ${a.details}`);
      }

      // Write structured JSON report
      fs.writeFileSync(
        REPORT_PATH,
        JSON.stringify(
          {
            timestamp: Date.now(),
            timestampIso: new Date().toISOString(),
            anomalies,
            runningLoops,
          },
          null,
          2,
        ),
        "utf8",
      );

      // Filter out the monitor script itself from termination target
      const loopWrappers = runningLoops.filter(
        (p) => !p.CommandLine.includes("loop-monitor.js"),
      );
      if (loopWrappers.length > 0) {
        pauseLoop(loopWrappers);
      }

      process.exit(1);
    }

    // Calculate interval based on elapsed time from daemon start
    const elapsed = Date.now() - startTime;
    let intervalMs = 60 * 60 * 1000; // default 1 hour
    let intervalDesc = "1 hour";

    if (elapsed < 5 * 60 * 1000) {
      intervalMs = 60 * 1000; // 60 seconds
      intervalDesc = "60 seconds";
    } else if (elapsed < 35 * 60 * 1000) {
      intervalMs = 5 * 60 * 1000; // 5 minutes
      intervalDesc = "5 minutes";
    } else if (elapsed < 60 * 60 * 1000) {
      intervalMs = 15 * 60 * 1000; // 15 minutes
      intervalDesc = "15 minutes";
    }

    console.log(
      `[MONITOR] Control loop healthy. Next check in ${intervalDesc} (elapsed: ${Math.round(elapsed / 60000)}m).`,
    );
    await sleep(intervalMs);
  }
}

export function run() {
  console.log(
    `[MONITOR] Starting control loop health scan at ${new Date().toISOString()}`,
  );
  const { runningLoops, anomalies } = checkAnomaly();

  if (anomalies.length > 0) {
    console.error(
      `🚨 [ANOMALY DETECTED] Found ${anomalies.length} control loop issue(s):`,
    );
    for (const a of anomalies) {
      console.error(`- [${a.type}] ${a.details}`);
    }

    // Write structured JSON report
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          timestamp: Date.now(),
          timestampIso: new Date().toISOString(),
          anomalies,
          runningLoops,
        },
        null,
        2,
      ),
      "utf8",
    );

    // Filter out the monitor script itself from termination target
    const loopWrappers = runningLoops.filter(
      (p) => !p.CommandLine.includes("loop-monitor.js"),
    );
    if (loopWrappers.length > 0) {
      pauseLoop(loopWrappers);
    }

    process.exit(1);
  }

  console.log(
    `[MONITOR] Control loop verified healthy. Found ${runningLoops.length} active process(es).`,
  );
  process.exit(0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.includes("--daemon")) {
    runDaemon().catch((err) => {
      console.error("Daemon crashed:", err);
      process.exit(1);
    });
  } else {
    run();
  }
}
