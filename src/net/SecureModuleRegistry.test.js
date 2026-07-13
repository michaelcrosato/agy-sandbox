import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeFileHash,
  SecureModuleRegistry,
} from "./SecureModuleRegistry.js";

describe("SecureModuleRegistry", () => {
  const testFile = path.resolve("src/net/test_module_temp.js");

  beforeAll(() => {
    fs.writeFileSync(testFile, 'console.log("hello test");', "utf8");
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  beforeEach(() => {
    SecureModuleRegistry.clear();
  });

  describe("computeFileHash", () => {
    test("computes sha256 hash for an existing file", () => {
      const hash = computeFileHash(testFile);
      expect(hash).toHaveLength(64); // SHA-256 is 64 characters in hex
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("throws an error for a non-existent file", () => {
      expect(() => {
        computeFileHash("src/net/does_not_exist.js");
      }).toThrow("Failed to compute hash for module");
    });
  });

  describe("registry operations", () => {
    test("register and getRegistry", () => {
      const fakeSha = "a".repeat(64);
      SecureModuleRegistry.register("src/net/fake.js", fakeSha);

      const registry = SecureModuleRegistry.getRegistry();
      const absolutePath = path.resolve("src/net/fake.js");

      expect(registry[absolutePath]).toBe(fakeSha);
    });

    test("registerFile calculates and registers file hash", () => {
      SecureModuleRegistry.registerFile(testFile);

      const registry = SecureModuleRegistry.getRegistry();
      const hash = computeFileHash(testFile);

      expect(registry[testFile]).toBe(hash);
    });

    test("registerFile does not throw and does not register non-existent file", () => {
      SecureModuleRegistry.registerFile("src/net/does_not_exist.js");
      const registry = SecureModuleRegistry.getRegistry();
      expect(Object.keys(registry)).toHaveLength(0);
    });

    test("clear removes all registered modules", () => {
      SecureModuleRegistry.register("src/net/fake.js", "a".repeat(64));
      expect(Object.keys(SecureModuleRegistry.getRegistry())).toHaveLength(1);

      SecureModuleRegistry.clear();
      expect(Object.keys(SecureModuleRegistry.getRegistry())).toHaveLength(0);
    });
  });
});
