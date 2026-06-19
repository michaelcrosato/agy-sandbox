import { jest } from "@jest/globals";

// Set up mock before importing the module under test
let messageListener = null;
const mockPostMessage = jest.fn();
const mockOn = jest.fn((event, cb) => {
  if (event === "message") {
    messageListener = cb;
  }
});

jest.unstable_mockModule("worker_threads", () => ({
  parentPort: {
    on: mockOn,
    postMessage: mockPostMessage,
  },
  workerData: {
    timeoutMs: 100,
    pingIntervalMs: 20,
  },
}));

// Mock SandboxSecurityRegistry
jest.unstable_mockModule("./SandboxSecurityRegistry.js", () => ({
  SandboxSecurityRegistry: {
    logViolation: jest.fn(),
  },
}));

const { SandboxSecurityRegistry } =
  await import("./SandboxSecurityRegistry.js");

describe("MainThreadWatchdogWorker", () => {
  let killSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("should start ping loop and trigger process.kill if heartbeat fails", async () => {
    // Dynamically import to execute the module body with mocked environment
    await import("./MainThreadWatchdogWorker.js");

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "ping", id: 1 });

    // Advance timers past timeoutMs (100ms)
    jest.advanceTimersByTime(105);

    expect(SandboxSecurityRegistry.logViolation).toHaveBeenCalledWith(
      "cpu",
      "main_thread_freeze",
      expect.any(Object),
    );
    expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGKILL");
  });

  test("should reset timeout and schedule next ping upon receiving pong", async () => {
    // Reset module registry so the import executes the body again
    jest.resetModules();
    await import("./MainThreadWatchdogWorker.js");

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "ping", id: 1 });

    // Simulate sending pong back to the worker
    if (messageListener) {
      messageListener({ type: "pong", id: 1 });
    }

    // Advance time by pingIntervalMs (20ms)
    jest.advanceTimersByTime(25);

    // Should have sent the second ping
    expect(mockPostMessage).toHaveBeenLastCalledWith({ type: "ping", id: 2 });

    // Ensure it hasn't killed the process yet
    expect(killSpy).not.toHaveBeenCalled();
  });
});
