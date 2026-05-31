import { ResourceLimiter } from "./ResourceLimiter.js";
import { jest } from "@jest/globals";

describe("ResourceLimiter (SPEC-116)", () => {
  let originalMemoryUsage;
  let originalHrtime;
  let originalGc;

  beforeEach(() => {
    originalMemoryUsage = process.memoryUsage;
    originalHrtime = process.hrtime;
    originalGc = global.gc;
  });

  afterEach(() => {
    process.memoryUsage = originalMemoryUsage;
    process.hrtime = originalHrtime;
    global.gc = originalGc;
  });

  test("tracks memory metrics and triggers soft limit callback", () => {
    // 1. Mock process.memoryUsage to return values above the soft limit but below the hard limit
    process.memoryUsage = () => ({
      rss: 600 * 1024 * 1024, // 600 MB (soft limit is 512MB)
      heapUsed: 200 * 1024 * 1024,
      heapTotal: 300 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    });

    let softTriggered = false;
    let softData = null;

    const limiter = new ResourceLimiter({
      intervalMs: 100,
      softMemoryLimit: 512 * 1024 * 1024,
      hardMemoryLimit: 640 * 1024 * 1024,
      onSoftLimit: (data) => {
        softTriggered = true;
        softData = data;
      },
    });

    // Mock hrtime to always return standard intervals
    let mockTime = 1000000000n; // 1s
    process.hrtime.bigint = () => {
      const current = mockTime;
      mockTime += 100000000n; // add 100ms
      return current;
    };

    // First check establishes lastTime
    limiter.check();
    expect(limiter.isBackpressureActive).toBe(false);

    // Second check compares intervals
    limiter.check();

    expect(limiter.isBackpressureActive).toBe(true);
    expect(softTriggered).toBe(true);
    expect(softData).not.toBeNull();
    expect(softData.rss).toBe(600 * 1024 * 1024);
    expect(softData.softMemoryCrossed).toBe(true);
  });

  test("triggers hard limit callback and deactivates when memory is below caps", () => {
    let rssVal = 700 * 1024 * 1024; // 700 MB (above hard limit of 640MB)
    process.memoryUsage = () => ({
      rss: rssVal,
      heapUsed: 300 * 1024 * 1024,
      heapTotal: 400 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    });

    let hardTriggered = false;
    let hardData = null;

    const limiter = new ResourceLimiter({
      intervalMs: 100,
      softMemoryLimit: 512 * 1024 * 1024,
      hardMemoryLimit: 640 * 1024 * 1024,
      onHardLimit: (data) => {
        hardTriggered = true;
        hardData = data;
      },
    });

    let mockTime = 1000000000n;
    process.hrtime.bigint = () => {
      const current = mockTime;
      mockTime += 100000000n;
      return current;
    };

    limiter.check();
    limiter.check();

    expect(limiter.isBackpressureActive).toBe(true);
    expect(hardTriggered).toBe(true);
    expect(hardData.rss).toBe(700 * 1024 * 1024);
    expect(hardData.hardMemoryCrossed).toBe(true);

    // Recover below soft and hard thresholds
    rssVal = 400 * 1024 * 1024; // 400MB
    limiter.check();

    expect(limiter.isBackpressureActive).toBe(false);
  });

  test("invokes global.gc() on soft limits if available", () => {
    process.memoryUsage = () => ({
      rss: 600 * 1024 * 1024, // 600 MB (above 512MB soft limit)
      heapUsed: 100 * 1024 * 1024,
      heapTotal: 200 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    });

    let gcCalled = false;
    global.gc = () => {
      gcCalled = true;
    };

    const limiter = new ResourceLimiter({
      intervalMs: 100,
      softMemoryLimit: 512 * 1024 * 1024,
      hardMemoryLimit: 640 * 1024 * 1024,
    });

    let mockTime = 1000000000n;
    process.hrtime.bigint = () => {
      const current = mockTime;
      mockTime += 100000000n;
      return current;
    };

    limiter.check();
    limiter.check();

    expect(gcCalled).toBe(true);
    expect(limiter.isBackpressureActive).toBe(true);
  });

  test("detects soft/hard Event Loop latency delays", () => {
    process.memoryUsage = () => ({
      rss: 100 * 1024 * 1024, // below soft limit
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    });

    let softTriggered = false;
    let hardTriggered = false;

    const limiter = new ResourceLimiter({
      intervalMs: 100,
      softLatencyLimit: 20,
      hardLatencyLimit: 100,
      onSoftLimit: () => {
        softTriggered = true;
      },
      onHardLimit: () => {
        hardTriggered = true;
      },
    });

    // 1. First interval: standard 100ms interval -> 0ms delay
    let mockTime = 1000000000n;
    process.hrtime.bigint = () => {
      const current = mockTime;
      mockTime += 100000000n; // 100ms
      return current;
    };
    limiter.check(); // establish baseline

    // 2. Second interval: 130ms duration -> 30ms delay (above soft limit of 20ms)
    mockTime += 130000000n;
    limiter.check();
    expect(softTriggered).toBe(true);
    expect(limiter.isBackpressureActive).toBe(true);

    // 3. Third interval: 220ms duration -> 120ms delay (above hard limit of 100ms)
    mockTime += 220000000n;
    limiter.check();
    expect(hardTriggered).toBe(true);
  });

  test("lifecycle start and stop cleanly schedules timer", async () => {
    const limiter = new ResourceLimiter({ intervalMs: 20 });
    expect(limiter.timer).toBeNull();
    limiter.start();
    expect(limiter.timer).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));

    limiter.stop();
    expect(limiter.timer).toBeNull();
  });
});
