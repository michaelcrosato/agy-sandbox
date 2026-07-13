import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
/**
 * WorkspaceDriftSentry.test.js (SPEC-146)
 * Comprehensive unit and integration verification suite for the Workspace Drift Sentry.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WorkspaceDriftSentry } from "./WorkspaceDriftSentry.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testAuditFile = "plan/security_audit_drift_test.json";
process.env.SECURITY_AUDIT_FILE = testAuditFile;

describe("WorkspaceDriftSentry", () => {
  const mockBaselineDir = path.resolve(__dirname, "drift_test_baseline");
  const mockSandboxDir = path.resolve(__dirname, "drift_test_sandbox");

  beforeAll(() => {
    // 1. Create a pristine baseline mock directory structure
    fs.mkdirSync(mockBaselineDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockBaselineDir, "file1.txt"),
      "original content 1",
      "utf8",
    );
    fs.writeFileSync(
      path.join(mockBaselineDir, "file2.txt"),
      "original content 2",
      "utf8",
    );
    fs.mkdirSync(path.join(mockBaselineDir, "subdir"), { recursive: true });
    fs.writeFileSync(
      path.join(mockBaselineDir, "subdir/subfile.txt"),
      "sub content",
      "utf8",
    );
  });

  afterAll(() => {
    // Clean up all mock directories
    try {
      if (fs.existsSync(mockBaselineDir)) {
        fs.rmSync(mockBaselineDir, { recursive: true, force: true });
      }
      if (fs.existsSync(mockSandboxDir)) {
        fs.rmSync(mockSandboxDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
    try {
      if (fs.existsSync(testAuditFile)) {
        fs.unlinkSync(testAuditFile);
      }
    } catch {
      // ignore
    }

    // Provision pristine sandbox from baseline
    if (fs.existsSync(mockSandboxDir)) {
      fs.rmSync(mockSandboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(mockSandboxDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockSandboxDir, "file1.txt"),
      "original content 1",
      "utf8",
    );
    fs.writeFileSync(
      path.join(mockSandboxDir, "file2.txt"),
      "original content 2",
      "utf8",
    );
    fs.mkdirSync(path.join(mockSandboxDir, "subdir"), { recursive: true });
    fs.writeFileSync(
      path.join(mockSandboxDir, "subdir/subfile.txt"),
      "sub content",
      "utf8",
    );
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

  test("should capture baseline snapshot metadata accurately", () => {
    const snapshot = WorkspaceDriftSentry.takeSnapshot(mockSandboxDir);

    expect(snapshot["file1.txt"]).toBeDefined();
    expect(snapshot["file2.txt"]).toBeDefined();
    expect(snapshot["subdir/subfile.txt"]).toBeDefined();

    expect(snapshot["file1.txt"].size).toBe(18);
    expect(typeof snapshot["file1.txt"].hash).toBe("string");
    expect(snapshot["file1.txt"].hash.length).toBe(64); // SHA-256 hex length
  });

  test("should detect zero drift on a pristine unmodified sandbox", () => {
    const snapshot = WorkspaceDriftSentry.takeSnapshot(mockSandboxDir);
    const report = WorkspaceDriftSentry.auditDrift(mockSandboxDir, snapshot);

    expect(report.added).toEqual([]);
    expect(report.modified).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(report.driftedBytes).toBe(0);
  });

  test("should audit and report added, modified, and deleted files correctly", () => {
    const snapshot = WorkspaceDriftSentry.takeSnapshot(mockSandboxDir);

    // Induce drifts:
    // 1. Added file
    fs.writeFileSync(
      path.join(mockSandboxDir, "file_added.txt"),
      "untracked file payload",
      "utf8",
    );
    // 2. Modified file
    fs.writeFileSync(
      path.join(mockSandboxDir, "file1.txt"),
      "altered content!",
      "utf8",
    );
    // 3. Deleted file
    fs.unlinkSync(path.join(mockSandboxDir, "file2.txt"));

    const report = WorkspaceDriftSentry.auditDrift(mockSandboxDir, snapshot);

    expect(report.added).toContain("file_added.txt");
    expect(report.modified).toContain("file1.txt");
    expect(report.deleted).toContain("file2.txt");
    expect(report.driftedBytes).toBeGreaterThan(0);
  });

  test("should automatically self-heal sandbox directory and log violation to registry", () => {
    const snapshot = WorkspaceDriftSentry.takeSnapshot(mockSandboxDir);

    // Induce drifts:
    fs.writeFileSync(
      path.join(mockSandboxDir, "file_added.txt"),
      "untracked file payload",
      "utf8",
    );
    fs.writeFileSync(
      path.join(mockSandboxDir, "file1.txt"),
      "altered content!",
      "utf8",
    );
    fs.unlinkSync(path.join(mockSandboxDir, "file2.txt"));

    const report = WorkspaceDriftSentry.auditDrift(mockSandboxDir, snapshot);
    const selfHealCount = WorkspaceDriftSentry.selfHeal(
      mockSandboxDir,
      report,
      mockBaselineDir,
    );

    // Expect 3 files were self-healed (1 deleted, 1 modified restored, 1 added purged)
    expect(selfHealCount).toBe(3);

    // Assert sandbox structure is fully restored to pristine state
    expect(fs.existsSync(path.join(mockSandboxDir, "file_added.txt"))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(mockSandboxDir, "file1.txt"), "utf8"),
    ).toBe("original content 1");
    expect(fs.existsSync(path.join(mockSandboxDir, "file2.txt"))).toBe(true);
    expect(
      fs.readFileSync(path.join(mockSandboxDir, "file2.txt"), "utf8"),
    ).toBe("original content 2");

    // A filesystem violation must be persistently recorded in SandboxSecurityRegistry
    const metrics = SandboxSecurityRegistry.getMetrics();
    const violation = metrics.recent_violations.find(
      (v) => v.category === "filesystem" && v.action === "workspace_drift",
    );
    expect(violation).toBeDefined();
    expect(violation.details.selfHealCount).toBe(3);
    expect(violation.details.addedCount).toBe(1);
    expect(violation.details.modifiedCount).toBe(1);
    expect(violation.details.deletedCount).toBe(1);
  });
});
