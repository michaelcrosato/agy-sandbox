import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import fs from "fs";
import path from "path";

const testAuditFile = "plan/security_audit_registry_test.json";
process.env.SECURITY_AUDIT_FILE = testAuditFile;

describe("SandboxSecurityRegistry (SPEC-131)", () => {
  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    SandboxSecurityRegistry.clearRegistry();
    try {
      if (fs.existsSync(testAuditFile)) {
        fs.unlinkSync(testAuditFile);
      }
    } catch {
      // ignore
    }
  });

  test("correctly registers security violations into in-memory storage", () => {
    const event1 = SandboxSecurityRegistry.logViolation(
      "filesystem",
      "writeFile",
      { path: "/outside/sandbox" },
    );

    expect(event1.category).toBe("filesystem");
    expect(event1.action).toBe("writeFile");
    expect(event1.details.path).toBe("/outside/sandbox");
    expect(event1.stack).toContain("Error");

    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.security_violations_by_category.filesystem).toBe(1);
    expect(metrics.recent_violations.length).toBe(1);
  });

  test("persists violation logs correctly into plan/security_audit.json", () => {
    const auditFilePath = path.resolve(process.env.SECURITY_AUDIT_FILE);
    expect(fs.existsSync(auditFilePath)).toBe(false);

    SandboxSecurityRegistry.logViolation("firewall", "connect", {
      host: "malicious.com",
    });

    expect(fs.existsSync(auditFilePath)).toBe(true);

    const fileContent = fs.readFileSync(auditFilePath, "utf8");
    const parsedLogs = JSON.parse(fileContent);

    expect(Array.isArray(parsedLogs)).toBe(true);
    expect(parsedLogs.length).toBe(1);
    expect(parsedLogs[0].category).toBe("firewall");
    expect(parsedLogs[0].details.host).toBe("malicious.com");
  });

  test("gracefully handles corrupt json file or filesystem errors during persistence", () => {
    const auditFilePath = path.resolve(process.env.SECURITY_AUDIT_FILE);

    // Write corrupt JSON
    fs.writeFileSync(auditFilePath, "not-a-valid-json", "utf8");

    // Logging should succeed even with corrupt JSON on disk
    SandboxSecurityRegistry.logViolation("process", "spawn", {
      binary: "curl",
    });

    const fileContent = fs.readFileSync(auditFilePath, "utf8");
    const parsedLogs = JSON.parse(fileContent);

    expect(Array.isArray(parsedLogs)).toBe(true);
    expect(parsedLogs.length).toBe(1);
    expect(parsedLogs[0].category).toBe("process");
    expect(parsedLogs[0].details.binary).toBe("curl");
  });

  test("bounds the persistent file log count to maximum 500 entries", () => {
    const auditFilePath = path.resolve(process.env.SECURITY_AUDIT_FILE);

    // Pre-populate the audit file with 499 mock entries to avoid Windows lock contention
    const mockEntries = [];
    for (let i = 0; i < 499; i++) {
      mockEntries.push({
        timestamp: Date.now(),
        timestampIso: new Date().toISOString(),
        category: "rate_limit",
        action: "api_call",
        details: { index: i },
        stack: "",
      });
    }
    fs.writeFileSync(
      auditFilePath,
      JSON.stringify(mockEntries, null, 2),
      "utf8",
    );

    // Now log 2 more times to trigger the bounds limit (499 + 2 = 501 -> sliced to 500)
    SandboxSecurityRegistry.logViolation("rate_limit", "api_call", {
      index: 499,
    });
    SandboxSecurityRegistry.logViolation("rate_limit", "api_call", {
      index: 500,
    });

    const fileContent = fs.readFileSync(auditFilePath, "utf8");
    const parsedLogs = JSON.parse(fileContent);

    expect(parsedLogs.length).toBe(500);
    // Should have sliced off the first entry (index 0)
    expect(parsedLogs[0].details.index).toBe(1);
    expect(parsedLogs[499].details.index).toBe(500);
  });
});
