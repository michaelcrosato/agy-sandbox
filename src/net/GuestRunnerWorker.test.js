import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";

// Mock node:module to prevent register from executing during test
vi.doMock("node:module", () => ({
  register: vi.fn(),
  isBuiltin: (specifier) => {
    return (
      specifier.startsWith("node:") ||
      [
        "path",
        "fs",
        "crypto",
        "url",
        "stream",
        "util",
        "string_decoder",
        "child_process",
        "vm",
      ].includes(specifier)
    );
  },
}));

// Mock internal sentries/modules
vi.doMock("./IntrusionDetectionSentry.js", () => ({
  IntrusionDetectionSentry: {
    activate: vi.fn(),
  },
}));

vi.doMock("./ProcessSentinel.js", () => ({
  ProcessSentinel: {
    activate: vi.fn(),
    setSandboxDirectory: vi.fn(),
  },
}));

vi.doMock("./SandboxFirewall.js", () => {
  const mockFirewall = vi.fn();
  return {
    SandboxFirewall: mockFirewall,
    activateFirewall: vi.fn(),
  };
});

vi.doMock("./DnsEgressSentry.js", () => ({
  DnsEgressSentry: {
    activate: vi.fn(),
  },
}));

vi.doMock("./TokenCostGovernor.js", () => ({
  TokenCostGovernor: {
    activate: vi.fn(),
    getTokensSpent: vi.fn().mockReturnValue(123),
    getUsdConsumed: vi.fn().mockReturnValue(0.01),
  },
}));

vi.doMock("./IntegrityGuard.js", () => ({
  IntegrityGuard: {
    start: vi.fn(),
  },
}));

describe("GuestRunnerWorker", () => {
  const tempScriptPath = path.resolve(
    "src/net/temp_guest_runner_worker_script.js",
  );
  let exitSpy;
  let consoleErrorSpy;
  let processSendSpy;

  const indicatorFile = path.resolve(
    "src/net/temp_guest_executed_indicator.txt",
  );

  beforeAll(() => {
    fs.writeFileSync(
      tempScriptPath,
      `import fs from "node:fs";\nfs.writeFileSync("${indicatorFile.replace(/\\/g, "\\\\")}", "executed", "utf8");\n`,
      "utf8",
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
    if (fs.existsSync(indicatorFile)) {
      fs.unlinkSync(indicatorFile);
    }
  });

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processSendSpy = vi.fn();
    process.send = processSendSpy;
    vi.useFakeTimers();

    if (fs.existsSync(indicatorFile)) {
      fs.unlinkSync(indicatorFile);
    }
    delete process.env.GUEST_SCRIPT_PATH;
    delete process.env.GUEST_SANDBOX_DIR;
    delete process.env.GUEST_HMAC_KEY;
    delete process.env.GUEST_RUN_TOKEN;
    globalThis.guestRpcQuery = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.resetModules();
    delete process.send;
  });

  test("should print error and exit with 1 if GUEST_SCRIPT_PATH is missing", async () => {
    await import("./GuestRunnerWorker.js?v=missing");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing GUEST_SCRIPT_PATH"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test("should bootstrap worker, activate sentries, and run script under containment", async () => {
    process.env.GUEST_SCRIPT_PATH = tempScriptPath;
    process.env.GUEST_SANDBOX_DIR = path.resolve("src/net");
    process.env.GUEST_HMAC_KEY = "dummy-hmac-key";
    process.env.GUEST_RUN_TOKEN = "dummy-run-token";

    await import("./GuestRunnerWorker.js?v=success");

    // Allow async bootstrap to complete. Fake timers are active, so pull the
    // real setTimeout from node:timers (Vitest's importActual is async). Poll
    // for the guest script's side effect rather than sleeping a fixed amount —
    // the dynamic import + guest run time varies with runner/machine load.
    const { setTimeout: realSetTimeout } = await vi.importActual("node:timers");
    const bootstrapDeadline = Date.now() + 5000;
    while (!fs.existsSync(indicatorFile) && Date.now() < bootstrapDeadline) {
      await new Promise((resolve) => realSetTimeout(resolve, 25));
    }

    // Expect the dynamically imported script to have executed
    expect(fs.existsSync(indicatorFile)).toBe(true);

    // Expect guestRpcQuery to be registered on globalThis
    expect(typeof globalThis.guestRpcQuery).toBe("function");

    // Verify it communicates over IPC correctly
    globalThis.guestRpcQuery("TEST_ACTION", { foo: "bar" });
    expect(processSendSpy).toHaveBeenCalledWith({
      type: "guest_rpc",
      requestId: expect.any(String),
      action: "TEST_ACTION",
      params: { foo: "bar" },
      token: "dummy-run-token",
    });

    // Verify CPU heartbeat telemetry triggers
    vi.advanceTimersByTime(55);
    expect(processSendSpy).toHaveBeenCalledWith({
      type: "cpu_heartbeat",
      cpuTimeMs: expect.any(Number),
      rssBytes: expect.any(Number),
      heapUsedBytes: expect.any(Number),
      heapTotalBytes: expect.any(Number),
      tokensSpent: 123,
      usdConsumed: 0.01,
    });
  });
});
