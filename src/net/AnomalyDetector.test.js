import { AnomalyDetector } from "./AnomalyDetector.js";

describe("AnomalyDetector Unit Tests", () => {
  let detector;

  beforeEach(() => {
    detector = new AnomalyDetector(15, 2.0); // Using small window and low Z-threshold for tests
  });

  test("should initialize with zero alerts and empty windows", () => {
    const diag = detector.getDiagnostics();
    expect(diag.anomalyTriggersTotal).toBe(0);
    expect(detector.connectionsWindow).toHaveLength(0);
    expect(detector.latencyWindow).toHaveLength(0);
    expect(detector.memoryWindow).toHaveLength(0);
  });

  test("static getMean computes accurate numeric averages", () => {
    expect(AnomalyDetector.getMean([])).toBe(0);
    expect(AnomalyDetector.getMean([10, 20, 30])).toBe(20);
    expect(AnomalyDetector.getMean([5, 5, 5, 5])).toBe(5);
  });

  test("static getStdDev computes accurate standard deviations", () => {
    expect(AnomalyDetector.getStdDev([], 0)).toBe(0);
    expect(AnomalyDetector.getStdDev([10], 10)).toBe(0);

    const arr = [2, 4, 4, 4, 5, 5, 7, 9];
    const mean = AnomalyDetector.getMean(arr); // 5.0
    const stdDev = AnomalyDetector.getStdDev(arr, mean); // 2.0
    expect(stdDev).toBeCloseTo(2.0);
  });

  test("does not trigger anomaly alerts for the first 9 observations (baseline building)", () => {
    for (let i = 0; i < 9; i++) {
      const isAnomalous = detector.observe(10, 5.0, 1024 * 1024);
      expect(isAnomalous).toBe(false);
    }
    expect(detector.getDiagnostics().anomalyTriggersTotal).toBe(0);
  });

  test("stable connection patterns do not trigger anomaly alerts", () => {
    // Feed 10 baseline observations
    for (let i = 0; i < 10; i++) {
      detector.observe(10, 5.0, 1024 * 1024);
    }

    // Feed a normal connection count (10)
    const isAnomalous = detector.observe(10, 5.0, 1024 * 1024);
    expect(isAnomalous).toBe(false);
    expect(detector.getDiagnostics().anomalyTriggersTotal).toBe(0);
  });

  test("sudden connection spike triggers a statistical connection anomaly alert", () => {
    // Feed 10 baseline observations (all identical = mean 10, stdDev 0)
    // Wait, if stdDev is 0, Z-score will be 0 to prevent division by zero.
    // So let's add variance to the baseline to get a positive stdDev!
    // Baseline: 9, 10, 11, 9, 10, 11, 9, 10, 11, 10 (mean = 10, variance ~ 0.67, stdDev ~ 0.8)
    const baseline = [9, 10, 11, 9, 10, 11, 9, 10, 11, 10];
    for (const val of baseline) {
      detector.observe(val, 5.0, 1024 * 1024);
    }

    // Now send a spike of 20 (Z-score is (20-10)/0.8 = 12.5 > threshold 2.0)
    const isAnomalous = detector.observe(20, 5.0, 1024 * 1024);
    expect(isAnomalous).toBe(true);
    expect(detector.getDiagnostics().anomalyTriggersTotal).toBe(1);
  });

  test("sudden event-loop lag spike triggers a latency anomaly alert", () => {
    const baseline = [4.5, 5.0, 5.5, 4.5, 5.0, 5.5, 4.5, 5.0, 5.5, 5.0];
    for (const val of baseline) {
      detector.observe(10, val, 1024 * 1024);
    }

    // Send a latency spike of 25ms
    const isAnomalous = detector.observe(10, 25.0, 1024 * 1024);
    expect(isAnomalous).toBe(true);
    expect(detector.getDiagnostics().anomalyTriggersTotal).toBe(1);
  });

  test("sudden memory allocation rate spike triggers a memory anomaly alert", () => {
    // Feed baseline observations with constant increments of 1MB (1024 * 1024)
    // Let's add slight variance to make stdDev positive.
    let heap = 10 * 1024 * 1024;
    const increments = [1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0]; // in MB

    // We need 11 heap values to get 10 memory increments in memoryWindow
    detector.observe(10, 5.0, heap); // First observation sets lastHeapUsed
    for (const inc of increments) {
      heap += inc * 1024 * 1024;
      detector.observe(10, 5.0, heap);
    }

    // Send a massive allocation spike of 15MB
    heap += 15 * 1024 * 1024;
    const isAnomalous = detector.observe(10, 5.0, heap);
    expect(isAnomalous).toBe(true);
    expect(detector.getDiagnostics().anomalyTriggersTotal).toBe(1);
  });

  test("reset clears windows, triggers counter, and diagnostics", () => {
    const baseline = [9, 10, 11, 9, 10, 11, 9, 10, 11, 10];
    for (const val of baseline) {
      detector.observe(val, 5.0, 1024 * 1024);
    }
    detector.observe(30, 5.0, 1024 * 1024); // trigger alert

    expect(detector.getDiagnostics().anomalyTriggersTotal).toBeGreaterThan(0);

    detector.reset();
    const diag = detector.getDiagnostics();
    expect(diag.anomalyTriggersTotal).toBe(0);
    expect(detector.connectionsWindow).toHaveLength(0);
    expect(detector.lastHeapUsed).toBeNull();
  });
});
