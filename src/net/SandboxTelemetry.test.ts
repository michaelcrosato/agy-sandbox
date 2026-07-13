import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { SandboxTelemetry } from "./SandboxTelemetry.js";

describe("SandboxTelemetry (SPEC-094)", () => {
  let testDir;

  beforeAll(() => {
    // Create a temporary nested directory inside process.cwd() for testing disk calculation
    testDir = path.join(process.cwd(), "temp-telemetry-test-dir");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    fs.writeFileSync(path.join(testDir, "file1.txt"), "hello"); // 5 bytes
    const nested = path.join(testDir, "nested");
    if (!fs.existsSync(nested)) {
      fs.mkdirSync(nested);
    }
    fs.writeFileSync(path.join(nested, "file2.txt"), "world123"); // 8 bytes
    // Total size = 13 bytes
  });

  afterAll(() => {
    // Clean up our temporary test directory recursively
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("initializes default parameters and properties", () => {
    const telemetry = new SandboxTelemetry(testDir, 0);
    expect(telemetry.rootPath).toBe(testDir);
    expect(telemetry.intervalMs).toBe(0);
    expect(telemetry.peakRss).toBeGreaterThan(0);
    expect(telemetry.peakHeapUsed).toBeGreaterThan(0);
  });

  test("compiles accurate CPU, memory and disk metrics synchronously", () => {
    const telemetry = new SandboxTelemetry(testDir, 0);
    telemetry.update();
    const metrics = telemetry.getMetrics();

    expect(metrics.cpu_percent).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.rss).toBeGreaterThan(0);
    expect(metrics.memory.heapUsed).toBeGreaterThan(0);
    expect(metrics.memory.heapTotal).toBeGreaterThan(0);
    expect(metrics.memory.peakRss).toBeGreaterThanOrEqual(metrics.memory.rss);
    expect(metrics.memory.peakHeapUsed).toBeGreaterThanOrEqual(
      metrics.memory.heapUsed,
    );
    expect(metrics.disk.repositorySizeBytes).toBe(13); // 5 + 8 bytes
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test("calculates memory leak rate without errors or division by zero", () => {
    const telemetry = new SandboxTelemetry(testDir, 0);
    // Directly after startup, leak rate should be 0 because of the guards
    expect(telemetry.getMemoryLeakRate()).toBe(0);

    // Manipulate startupTime to simulate elapsed time
    telemetry.startupTime = Date.now() - 120000; // 2 minutes ago

    const originalMemoryUsage = process.memoryUsage;
    try {
      process.memoryUsage = () => ({
        rss: 120000000,
        heapUsed: 80000000,
        heapTotal: 100000000,
        external: 5000000,
        arrayBuffers: 1000000,
      });
      telemetry.baseHeapUsed = 50000000; // base is 50MB, current is 80MB (grew by 30MB)
      const rate = telemetry.getMemoryLeakRate();
      expect(rate).toBeGreaterThan(0);
    } finally {
      process.memoryUsage = originalMemoryUsage;
    }
  });

  test("correctly handles exclude directories", () => {
    // Create an excluded directory
    const gitDir = path.join(testDir, ".git");
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(gitDir);
    }
    fs.writeFileSync(path.join(gitDir, "ignored.txt"), "some git data"); // 13 bytes

    const telemetry = new SandboxTelemetry(testDir, 0);
    telemetry.update();
    const metrics = telemetry.getMetrics();
    // Excluded directory should be ignored, total stays 13 bytes
    expect(metrics.disk.repositorySizeBytes).toBe(13);
  });

  test("starts and stops the background interval timer", async () => {
    const telemetry = new SandboxTelemetry(testDir, 10);
    expect(telemetry.timer).toBeNull();

    telemetry.start();
    expect(telemetry.timer).not.toBeNull();

    // Let it sample a couple of times
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(telemetry.getMetrics().cpu_percent).toBeGreaterThanOrEqual(0);

    telemetry.stop();
    expect(telemetry.timer).toBeNull();
  });
});
