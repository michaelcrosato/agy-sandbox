import { describe, test, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ConfigWatcher } from "./ConfigWatcher.js";
import { ApiRateLimiter } from "./ApiRateLimiter.js";
import { SandboxFirewall } from "./SandboxFirewall.js";

describe("ConfigWatcher", () => {
  const testConfigPath = path.join(
    os.tmpdir(),
    `config_test_temp_${process.pid}.json`,
  );

  // Helper to write JSON config helper
  const writeTestConfig = (data) => {
    fs.writeFileSync(testConfigPath, JSON.stringify(data, null, 2), "utf-8");
  };

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      try {
        fs.unlinkSync(testConfigPath);
      } catch (_e) {
        // ignore
      }
    }
  });

  test("loads and applies valid configuration on instantiation/startup", () => {
    const initialConfig = {
      apiRateLimit: {
        maxPerMinute: 15,
        maxPerHour: 300,
        allowlistDomains: ["domain1.com", "domain2.org"],
      },
      sandboxFirewall: {
        allowlistDomains: ["trusted.edu"],
      },
      wsRateLimit: {
        maxPerSecond: 150,
      },
      standings: {
        hostileThreshold: -40,
        friendlyThreshold: 40,
        minStanding: -100,
        maxStanding: 100,
        allyPropagation: 0.6,
        enemyPropagation: 0.6,
        decayRate: 0.02,
        maxPriceSwing: 0.25,
      },
    };

    writeTestConfig(initialConfig);

    const apiLimiter = new ApiRateLimiter();
    const firewall = new SandboxFirewall();
    const wsConfig = { maxPerSecond: 100 };
    const mockRoom = {
      factionRegistry: {
        options: {
          hostileThreshold: -30,
          friendlyThreshold: 30,
        },
      },
    };
    const instances = new Map([["room1", mockRoom]]);

    const watcher = new ConfigWatcher(testConfigPath, {
      apiRateLimiter: apiLimiter,
      sandboxFirewall: firewall,
      wsRateLimitConfig: wsConfig,
      instances,
    });

    watcher.start();
    expect(watcher.reloadCount).toBe(1);

    // Assert API rate limiter hot-updates
    expect(apiLimiter.maxPerMinute).toBe(15);
    expect(apiLimiter.maxPerHour).toBe(300);
    expect(apiLimiter.allowlistDomains).toEqual(["domain1.com", "domain2.org"]);

    // Assert firewall allowlist hot-updates
    expect(firewall.allowlistDomains).toEqual(["trusted.edu"]);

    // Assert WebSocket connection rate limits
    expect(wsConfig.maxPerSecond).toBe(150);

    // Assert FactionRegistry options
    expect(mockRoom.factionRegistry.options.hostileThreshold).toBe(-40);
    expect(mockRoom.factionRegistry.options.friendlyThreshold).toBe(40);
    expect(mockRoom.factionRegistry.options.allyPropagation).toBe(0.6);
    expect(mockRoom.factionRegistry.options.decayRate).toBe(0.02);

    watcher.stop();
  });

  test("gracefully swallows syntax errors without crashing or losing previous configurations", () => {
    const goodConfig = {
      wsRateLimit: {
        maxPerSecond: 150,
      },
    };

    writeTestConfig(goodConfig);

    const wsConfig = { maxPerSecond: 100 };
    const watcher = new ConfigWatcher(testConfigPath, {
      wsRateLimitConfig: wsConfig,
    });

    watcher.start();
    expect(watcher.reloadCount).toBe(1);
    expect(wsConfig.maxPerSecond).toBe(150);

    // Write absolute garbage syntax to config file
    fs.writeFileSync(testConfigPath, "{ bad: json, garbage ", "utf-8");

    const success = watcher.loadAndApply();
    expect(success).toBe(false);
    // Reload count did not increment
    expect(watcher.reloadCount).toBe(1);
    // Value remains unchanged (safe state preservation)
    expect(wsConfig.maxPerSecond).toBe(150);

    watcher.stop();
  });

  test("rejects invalid options violating JSDoc / Schema bounds", () => {
    const invalidConfig = {
      wsRateLimit: {
        maxPerSecond: -20, // Cannot be negative / below min: 1
      },
    };

    writeTestConfig(invalidConfig);

    const wsConfig = { maxPerSecond: 100 };
    const watcher = new ConfigWatcher(testConfigPath, {
      wsRateLimitConfig: wsConfig,
    });

    const success = watcher.loadAndApply();
    expect(success).toBe(false);
    expect(wsConfig.maxPerSecond).toBe(100); // Retained original

    watcher.stop();
  });

  test("loads and applies connectionFlood and resourceLimits configurations", () => {
    const validConfig = {
      connectionFlood: {
        maxConnectionsPerIp: 8,
      },
      resourceLimits: {
        softMemoryLimit: 200 * 1024 * 1024,
        hardMemoryLimit: 300 * 1024 * 1024,
        softLatencyLimit: 15,
        hardLatencyLimit: 85,
      },
    };

    writeTestConfig(validConfig);

    const connectionFloodSentry = { maxConnectionsPerIp: 5 };
    const resourceLimiter = {
      softMemoryLimit: 100,
      hardMemoryLimit: 200,
      softLatencyLimit: 20,
      hardLatencyLimit: 100,
    };

    const watcher = new ConfigWatcher(testConfigPath, {
      connectionFloodSentry,
      resourceLimiter,
    });

    watcher.start();
    expect(watcher.reloadCount).toBe(1);

    expect(connectionFloodSentry.maxConnectionsPerIp).toBe(8);
    expect(resourceLimiter.softMemoryLimit).toBe(200 * 1024 * 1024);
    expect(resourceLimiter.hardMemoryLimit).toBe(300 * 1024 * 1024);
    expect(resourceLimiter.softLatencyLimit).toBe(15);
    expect(resourceLimiter.hardLatencyLimit).toBe(85);

    watcher.stop();
  });

  test("watches config file for disk mutations and triggers reload asynchronously", () =>
    new Promise((resolve) => {
      const config1 = {
        wsRateLimit: {
          maxPerSecond: 80,
        },
      };

      writeTestConfig(config1);

      const wsConfig = { maxPerSecond: 80 };
      const watcher = new ConfigWatcher(testConfigPath, {
        wsRateLimitConfig: wsConfig,
      });

      watcher.start();
      expect(watcher.reloadCount).toBe(1);

      // Overwrite config
      const config2 = {
        wsRateLimit: {
          maxPerSecond: 120,
        },
      };

      setTimeout(() => {
        writeTestConfig(config2);
      }, 50);

      // Wait for fs.watch event debounce timeout to fire
      setTimeout(() => {
        expect(watcher.reloadCount).toBe(2);
        expect(wsConfig.maxPerSecond).toBe(120);
        watcher.stop();
        resolve();
      }, 300);
    }));

  test("safely ignores fs.watch events and clears timers after stop() is invoked to prevent async leaks (SPEC-125)", () =>
    new Promise((resolve) => {
      const config1 = {
        wsRateLimit: {
          maxPerSecond: 80,
        },
      };

      writeTestConfig(config1);

      const wsConfig = { maxPerSecond: 80 };
      const watcher = new ConfigWatcher(testConfigPath, {
        wsRateLimitConfig: wsConfig,
      });

      watcher.start();
      expect(watcher.reloadCount).toBe(1);

      // Call stop() immediately to simulate teardown
      watcher.stop();

      // Trigger a file change
      const config2 = {
        wsRateLimit: {
          maxPerSecond: 120,
        },
      };
      writeTestConfig(config2);

      // Wait and assert that reloadCount did NOT increment, and wsConfig limits were NOT updated
      setTimeout(() => {
        expect(watcher.reloadCount).toBe(1);
        expect(wsConfig.maxPerSecond).toBe(80);
        resolve();
      }, 250);
    }));
});
