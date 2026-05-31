/**
 * DynamicResourceGovernor.test.js (SPEC-172) — comprehensive test suite
 * for the host resource governor, queue, and priority scheduler.
 */

import os from "node:os";
import { DynamicResourceGovernor } from "./DynamicResourceGovernor.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

// Mock os.setPriority to check OS interactions cleanly
const originalSetPriority = os.setPriority;
let setPriorityCalls = [];

describe("DynamicResourceGovernor", () => {
  beforeAll(() => {
    os.setPriority = (pid, priority) => {
      setPriorityCalls.push({ pid, priority });
    };
  });

  afterAll(() => {
    os.setPriority = originalSetPriority;
  });

  beforeEach(() => {
    DynamicResourceGovernor.clear();
    setPriorityCalls = [];
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    DynamicResourceGovernor.clear();
  });

  test("should report unstressed host capacity by default under normal conditions", () => {
    // Unsimulate everything
    DynamicResourceGovernor.setSimulation(null, null);

    const freemem = DynamicResourceGovernor.getFreeMemoryRatio();
    const cpu = DynamicResourceGovernor.getCpuLoadRatio();

    expect(typeof freemem).toBe("number");
    expect(freemem).toBeGreaterThanOrEqual(0.0);
    expect(freemem).toBeLessThanOrEqual(1.0);

    expect(typeof cpu).toBe("number");
    expect(cpu).toBeGreaterThanOrEqual(0.0);

    // Host should not be stressed unless actual hardware is extremely overloaded
    const stressed = DynamicResourceGovernor.isHostStressed();
    expect(typeof stressed).toBe("boolean");
  });

  test("should report stressed host when simulated free memory is below 15%", () => {
    DynamicResourceGovernor.setSimulation(0.14, 0.5); // 14% free mem, 50% cpu
    expect(DynamicResourceGovernor.isHostStressed()).toBe(true);
    expect(DynamicResourceGovernor.getFreeMemoryRatio()).toBe(0.14);
    expect(DynamicResourceGovernor.getCpuLoadRatio()).toBe(0.5);
  });

  test("should report stressed host when simulated CPU load is above 85%", () => {
    DynamicResourceGovernor.setSimulation(0.2, 0.86); // 20% free mem, 86% cpu
    expect(DynamicResourceGovernor.isHostStressed()).toBe(true);
  });

  test("should immediate execute and acquire permit when host capacity is normal", async () => {
    DynamicResourceGovernor.setSimulation(0.3, 0.4); // Healthy
    let resolved = false;

    await DynamicResourceGovernor.acquireLaunchPermit().then(() => {
      resolved = true;
    });

    expect(resolved).toBe(true);
    expect(DynamicResourceGovernor.getQueueLength()).toBe(0);
  });

  test("should queue script execution runs when simulated host stress is crossed", async () => {
    DynamicResourceGovernor.setSimulation(0.1, 0.5); // Under stress (<15% free mem)

    let resolved = false;
    const promise = DynamicResourceGovernor.acquireLaunchPermit().then(() => {
      resolved = true;
    });

    // Promise should be pending because it's queued under resource stress
    expect(resolved).toBe(false);
    expect(DynamicResourceGovernor.getQueueLength()).toBe(1);

    // Relieve stress
    DynamicResourceGovernor.setSimulation(0.25, 0.3); // Healthy

    await promise;

    expect(resolved).toBe(true);
    expect(DynamicResourceGovernor.getQueueLength()).toBe(0);
  });

  test("should dynamically set scheduling priority to 19 when RSS memory exceeds 80% budget", () => {
    const mockPid = 99999;
    const runInfo = {
      script: "test_mem_hog.js",
      cpuTimeBudgetMs: 2000,
      cpuTimeMs: 100,
      maxMemoryMb: 100, // 100MB budget
      rssBytes: 81 * 1024 * 1024, // 81MB used (81% budget)
      heapUsedBytes: 0,
    };

    DynamicResourceGovernor.evaluateAndThrottle(mockPid, runInfo);

    expect(setPriorityCalls).toContainEqual({ pid: mockPid, priority: 19 });
    expect(DynamicResourceGovernor.isThrottled(mockPid)).toBe(true);
    expect(DynamicResourceGovernor.getThrottledCount()).toBe(1);

    // Verify SandboxSecurityRegistry logged the violation
    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.security_violations_by_category.process).toBe(1);
  });

  test("should dynamically set scheduling priority to 19 when heap memory exceeds 80% budget", () => {
    const mockPid = 88888;
    const runInfo = {
      script: "test_heap_hog.js",
      cpuTimeBudgetMs: 2000,
      cpuTimeMs: 100,
      maxMemoryMb: 100, // 100MB budget
      rssBytes: 10 * 1024 * 1024,
      heapUsedBytes: 82 * 1024 * 1024, // 82% heap budget
    };

    DynamicResourceGovernor.evaluateAndThrottle(mockPid, runInfo);

    expect(setPriorityCalls).toContainEqual({ pid: mockPid, priority: 19 });
    expect(DynamicResourceGovernor.isThrottled(mockPid)).toBe(true);
  });

  test("should dynamically set scheduling priority to 19 when CPU usage exceeds 80% budget", () => {
    const mockPid = 77777;
    const runInfo = {
      script: "test_cpu_hog.js",
      cpuTimeBudgetMs: 1000, // 1000ms budget
      cpuTimeMs: 810, // 810ms CPU usage (81% budget)
      maxMemoryMb: 128,
      rssBytes: 10 * 1024 * 1024,
      heapUsedBytes: 10 * 1024 * 1024,
    };

    DynamicResourceGovernor.evaluateAndThrottle(mockPid, runInfo);

    expect(setPriorityCalls).toContainEqual({ pid: mockPid, priority: 19 });
    expect(DynamicResourceGovernor.isThrottled(mockPid)).toBe(true);
  });

  test("should NOT throttle processes that are within safe budgets", () => {
    const mockPid = 66666;
    const runInfo = {
      script: "safe_script.js",
      cpuTimeBudgetMs: 1000,
      cpuTimeMs: 200, // 20%
      maxMemoryMb: 128, // 128MB budget
      rssBytes: 30 * 1024 * 1024, // ~23%
      heapUsedBytes: 20 * 1024 * 1024,
    };

    DynamicResourceGovernor.evaluateAndThrottle(mockPid, runInfo);

    expect(setPriorityCalls.length).toBe(0);
    expect(DynamicResourceGovernor.isThrottled(mockPid)).toBe(false);
  });

  test("should compile and return correct observability metrics", () => {
    DynamicResourceGovernor.setSimulation(0.2, 0.4);
    const mockPid = 55555;
    const runInfo = {
      script: "heavy_run.js",
      cpuTimeBudgetMs: 1000,
      cpuTimeMs: 900, // 90% CPU budget
      maxMemoryMb: 128,
      rssBytes: 10 * 1024 * 1024,
      heapUsedBytes: 10 * 1024 * 1024,
    };

    // Trigger one throttled process
    DynamicResourceGovernor.evaluateAndThrottle(mockPid, runInfo);

    // Queue one pending launch
    DynamicResourceGovernor.setSimulation(0.1, 0.5); // Under memory stress
    DynamicResourceGovernor.acquireLaunchPermit();

    const metrics = DynamicResourceGovernor.getMetrics();

    expect(metrics).toEqual({
      queued_runs_count: 1,
      active_throttled_processes: 1,
      host_capacity_free_memory_ratio: 0.1,
      host_capacity_cpu_load: 0.5,
    });
  });

  test("should completely clear queue, throttled processes, and timers during clear()", () => {
    DynamicResourceGovernor.setSimulation(0.1, 0.9);
    DynamicResourceGovernor.acquireLaunchPermit();
    DynamicResourceGovernor.evaluateAndThrottle(11111, {
      script: "x.js",
      cpuTimeBudgetMs: 1000,
      cpuTimeMs: 950,
      maxMemoryMb: 128,
    });

    expect(DynamicResourceGovernor.getQueueLength()).toBe(1);
    expect(DynamicResourceGovernor.getThrottledCount()).toBe(1);

    DynamicResourceGovernor.clear();

    expect(DynamicResourceGovernor.getQueueLength()).toBe(0);
    expect(DynamicResourceGovernor.getThrottledCount()).toBe(0);
    expect(DynamicResourceGovernor.getFreeMemoryRatio()).not.toBe(0.1); // Simulation is cleared
  });
});
