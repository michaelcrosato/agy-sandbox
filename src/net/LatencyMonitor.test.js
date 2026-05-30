import { LatencyMonitor } from "./LatencyMonitor.js";

describe("LatencyMonitor (SPEC-090)", () => {
  let monitor;

  beforeEach(() => {
    monitor = new LatencyMonitor({ intervalMs: 10, windowSize: 5 });
  });

  afterEach(() => {
    monitor.stop();
  });

  test("initial state is normal and has zero latency", () => {
    expect(monitor.getLatency()).toBe(0);
    expect(monitor.getStatus()).toBe("normal");
    expect(monitor.shouldShed("chat")).toBe(false);
    expect(monitor.shouldShed("cosmetic")).toBe(false);
    expect(monitor.shouldShed("optional")).toBe(false);
  });

  test("adding samples computes correct rolling average", () => {
    monitor.addSample(10);
    expect(monitor.getLatency()).toBe(10);

    monitor.addSample(20);
    expect(monitor.getLatency()).toBe(15);

    monitor.addSample(30);
    expect(monitor.getLatency()).toBe(20);

    // Keep adding beyond window size (5)
    monitor.addSample(40);
    monitor.addSample(50);
    expect(monitor.getLatency()).toBe(30); // (10+20+30+40+50)/5 = 30

    monitor.addSample(60);
    expect(monitor.getLatency()).toBe(40); // (20+30+40+50+60)/5 = 40
  });

  test("transitions status based on rolling average", () => {
    // Normal threshold (<25)
    monitor.addSample(10);
    expect(monitor.getStatus()).toBe("normal");

    // Degraded threshold (25 - 50)
    monitor.addSample(40); // (10+40)/2 = 25
    expect(monitor.getStatus()).toBe("degraded");

    // Critical threshold (>= 50)
    monitor.addSample(100); // (10+40+100)/3 = 50
    expect(monitor.getStatus()).toBe("critical");
  });

  test("asserts shouldShed correct load shedding policies", () => {
    // 1. Normal state (<25)
    monitor.addSample(15);
    expect(monitor.shouldShed("chat")).toBe(false);
    expect(monitor.shouldShed("cosmetic")).toBe(false);
    expect(monitor.shouldShed("optional")).toBe(false);

    // 2. Degraded state (25 - 50)
    monitor.addSample(45); // (15+45)/2 = 30
    expect(monitor.getStatus()).toBe("degraded");
    expect(monitor.shouldShed("chat")).toBe(true);
    expect(monitor.shouldShed("cosmetic")).toBe(true);
    expect(monitor.shouldShed("optional")).toBe(false);

    // 3. Critical state (>= 50)
    monitor.addSample(100); // (15+45+100)/3 = 53.33
    expect(monitor.getStatus()).toBe("critical");
    expect(monitor.shouldShed("chat")).toBe(true);
    expect(monitor.shouldShed("cosmetic")).toBe(true);
    expect(monitor.shouldShed("optional")).toBe(true);
  });

  test("lifecycle start and stop cleanly schedules timer", async () => {
    expect(monitor.timer).toBeNull();
    monitor.start();
    expect(monitor.timer).not.toBeNull();

    // Let it sample at least once
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(monitor.getLatency()).toBeGreaterThanOrEqual(0);

    monitor.stop();
    expect(monitor.timer).toBeNull();
  });
});
