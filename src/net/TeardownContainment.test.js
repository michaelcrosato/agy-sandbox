import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { validateCommand, ProcessSentinel } from "./ProcessSentinel.js";
import { ProcessReaper } from "./ProcessReaper.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import { Worker } from "worker_threads";
import fs from "fs";
import path from "path";

beforeAll(() => {
  process.env.TEST_SENTINEL_FORCE = "true";
});

afterAll(() => {
  delete process.env.TEST_SENTINEL_FORCE;
});

describe("ProcessSentinel Path Jailing Sentry", () => {
  const mockSandboxDir = path.resolve("./.sandbox-worktrees/test-run-jailing");

  beforeAll(() => {
    ProcessSentinel.setSandboxDirectory(mockSandboxDir);
    fs.mkdirSync(mockSandboxDir, { recursive: true });
  });

  afterAll(() => {
    ProcessSentinel.clearSandboxDirectory();
    if (fs.existsSync(mockSandboxDir)) {
      fs.rmSync(mockSandboxDir, { recursive: true, force: true });
    }
  });

  test("should allow node script targets residing inside sandboxDir", () => {
    const insideScript = path.join(mockSandboxDir, "script.js");
    fs.writeFileSync(insideScript, "console.log('hello');");

    const val = validateCommand("node", [insideScript]);
    expect(val.allowed).toBe(true);
  });

  test("should reject node script targets resolving outside sandboxDir", () => {
    const outsideScript = path.resolve("./outside_malicious_script.js");

    const val = validateCommand("node", [outsideScript]);
    expect(val.allowed).toBe(false);
    expect(val.reason).toContain("resolves outside sandboxed workspace");
  });

  test("should allow approved node_modules dependencies", () => {
    const workspaceNodeModules = path.resolve("./node_modules/vitest/index.js");
    const val = validateCommand("node", [workspaceNodeModules]);
    expect(val.allowed).toBe(true);
  });

  test("should allow absolute node commands with standard flags but reject arbitrary code exec", () => {
    const val1 = validateCommand("node", ["-v"]);
    expect(val1.allowed).toBe(true);

    const val2 = validateCommand("node", ["-e", "console.log('escape')"]);
    expect(val2.allowed).toBe(false);
    expect(val2.reason).toContain("is forbidden");
  });
});

describe("ProcessReaper Container Teardown lifecycle", () => {
  test("should successfully track and terminate worker threads and processes", async () => {
    // 1. Spawning dummy worker
    const worker = new Worker(
      "const { parentPort } = require('worker_threads');",
      { eval: true },
    );
    ProcessReaper.registerWorker(worker);
    expect(ProcessReaper.getWorkerCount()).toBe(1);

    // 2. Register dummy process mock
    const mockProc = {
      pid: 99999,
      kill: () => {},
      on: () => {},
    };
    ProcessReaper.registerProcess(mockProc);
    expect(ProcessReaper.getProcessCount()).toBe(1);

    // 3. Reap and confirm total teardown
    await ProcessReaper.reap();
    expect(ProcessReaper.getWorkerCount()).toBe(0);
    expect(ProcessReaper.getProcessCount()).toBe(0);
  });
});

describe("SandboxSecurityRegistry Log Compaction Sentry", () => {
  const customAuditFile = "plan/security_audit_teardown_test.json";
  let originalAuditFile;

  beforeAll(() => {
    originalAuditFile = process.env.SECURITY_AUDIT_FILE;
    process.env.SECURITY_AUDIT_FILE = customAuditFile;
  });

  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  afterAll(() => {
    SandboxSecurityRegistry.clearRegistry();
    if (originalAuditFile !== undefined) {
      process.env.SECURITY_AUDIT_FILE = originalAuditFile;
    } else {
      delete process.env.SECURITY_AUDIT_FILE;
    }
  });

  test("should limit audit file capacity strictly to 500 records to prevent OOM", () => {
    // Generate 520 logs
    for (let i = 0; i < 520; i++) {
      SandboxSecurityRegistry.logViolation("filesystem", "connect", { idx: i });
    }

    const metrics = SandboxSecurityRegistry.getMetrics();
    // In-memory cache is capped at maxLogsInMemory (100)
    expect(metrics.recent_violations.length).toBeLessThanOrEqual(100);

    const auditFilePath = path.resolve(customAuditFile);
    expect(fs.existsSync(auditFilePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(auditFilePath, "utf8"));
    expect(content.length).toBe(500);
  });
});
