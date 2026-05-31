/**
 * GuestRunner.test.js (SPEC-136) — comprehensive verification suite
 * for the host-isolated child-process guest execution runner.
 */

import fs from "fs";
import path from "path";
import { GuestRunner } from "./GuestRunner.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testAuditFile = "plan/security_audit_runner_test.json";
process.env.SECURITY_AUDIT_FILE = testAuditFile;

describe("GuestRunner", () => {
  const tempOkScript = path.join(__dirname, "temp_guest_ok.js");
  const tempEvilScript = path.join(__dirname, "temp_guest_evil.js");
  const tempTamperScript = path.join(__dirname, "temp_guest_tamper.js");
  const tempFreezeScript = path.join(__dirname, "temp_guest_freeze.js");
  const sandboxDir = path.resolve("./.sandbox-runner-test-dir");

  beforeAll(() => {
    // Write out mock guest scripts dynamically
    fs.writeFileSync(
      tempOkScript,
      `console.log("GUEST_STDOUT: hello from guest");`,
      "utf8",
    );

    fs.writeFileSync(
      tempEvilScript,
      `import fs from "fs";
try {
  fs.writeFileSync("../test-file-leak.txt", "escape payload");
  console.log("SUCCESS_WRITE");
} catch (e) {
  console.error("DENIED: " + e.message);
}`,
      "utf8",
    );

    fs.writeFileSync(
      tempTamperScript,
      `try {
  Object.defineProperty(Array.prototype, "tamperField", {
    value: "evil",
    configurable: true
  });
} catch (e) {
  console.error("TAMPER_ERROR: " + e.message);
}`,
      "utf8",
    );

    fs.writeFileSync(tempFreezeScript, `while (true) {}`, "utf8");

    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temporary guest script files
    const files = [
      tempOkScript,
      tempEvilScript,
      tempTamperScript,
      tempFreezeScript,
    ];
    for (const f of files) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    try {
      if (fs.existsSync(sandboxDir)) {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

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

  test("should successfully execute a compliant guest script and capture stdout", async () => {
    const result = await GuestRunner.runScript(tempOkScript, {
      timeoutMs: 2000,
    });

    expect(result.status).toBe("success");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GUEST_STDOUT: hello from guest");
  });

  test("should strictly jail filesystem mutations to the active sandboxDir", async () => {
    const result = await GuestRunner.runScript(tempEvilScript, {
      sandboxDir: sandboxDir,
      timeoutMs: 3000,
    });

    // The guest script must catch the DENIED error inside the sandbox process
    expect(result.status).toBe("success"); // Script completed its execution/try-catch
    expect(result.stderr).toContain("DENIED: [SECURITY ACCESS DENIED]");

    // Verify that the violation was logged to the disk registry
    const auditFile = path.resolve(result.childAuditFile);
    expect(fs.existsSync(auditFile)).toBe(true);
    const logs = JSON.parse(fs.readFileSync(auditFile, "utf8"));
    const fileViolation = logs.find(
      (l) => l.category === "filesystem" && l.action === "fs_access",
    );
    expect(fileViolation).toBeDefined();
  });

  test("should block and log prototype tampering attempts inside the guest thread", async () => {
    const result = await GuestRunner.runScript(tempTamperScript, {
      sandboxDir: sandboxDir,
      timeoutMs: 3000,
    });

    expect(result.status).toBe("success");
    expect(result.stderr).toContain("TAMPER_ERROR: [SECURITY BLOCKED]");

    // Verify that the prototype mutation violation was registered to the disk registry
    const auditFile = path.resolve(result.childAuditFile);
    expect(fs.existsSync(auditFile)).toBe(true);
    const logs = JSON.parse(fs.readFileSync(auditFile, "utf8"));
    const integrityViolation = logs.find(
      (l) => l.category === "integrity" && l.action === "prototype_tamper",
    );
    expect(integrityViolation).toBeDefined();
  });

  test("should forcefully terminate a frozen runaway guest script and record timeout", async () => {
    const result = await GuestRunner.runScript(tempFreezeScript, {
      timeoutMs: 400,
    });

    expect(result.status).toBe("timeout");
    expect(result.signal).toBe("SIGKILL");

    // Timeout must register as a CPU violation
    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_total).toBe(1);
    expect(metrics.recent_violations[0].category).toBe("cpu");
    expect(metrics.recent_violations[0].action).toBe("guest_timeout");
  });
});
