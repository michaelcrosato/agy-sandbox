import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

// Mock node:module to prevent register from executing during test
jest.unstable_mockModule("node:module", () => ({
  register: jest.fn(),
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
jest.unstable_mockModule("./IntrusionDetectionSentry.js", () => ({
  IntrusionDetectionSentry: {
    activate: jest.fn(),
  },
}));

jest.unstable_mockModule("./ProcessSentinel.js", () => ({
  ProcessSentinel: {
    activate: jest.fn(),
    setSandboxDirectory: jest.fn(),
  },
}));

jest.unstable_mockModule("./SandboxFirewall.js", () => {
  const mockFirewall = jest.fn();
  return {
    SandboxFirewall: mockFirewall,
    activateFirewall: jest.fn(),
  };
});

jest.unstable_mockModule("./DnsEgressSentry.js", () => ({
  DnsEgressSentry: {
    activate: jest.fn(),
  },
}));

jest.unstable_mockModule("./TokenCostGovernor.js", () => ({
  TokenCostGovernor: {
    activate: jest.fn(),
    getTokensSpent: jest.fn().mockReturnValue(123),
    getUsdConsumed: jest.fn().mockReturnValue(0.01),
  },
}));

jest.unstable_mockModule("./IntegrityGuard.js", () => ({
  IntegrityGuard: {
    start: jest.fn(),
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
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    processSendSpy = jest.fn();
    process.send = processSendSpy;
    jest.useFakeTimers();

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
    jest.restoreAllMocks();
    jest.useRealTimers();
    jest.resetModules();
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

    // Allow async bootstrap to complete
    await new Promise((resolve) => {
      jest.requireActual("node:timers").setTimeout(resolve, 50);
    });

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
    jest.advanceTimersByTime(55);
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
