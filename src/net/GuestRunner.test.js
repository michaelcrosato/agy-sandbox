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
  const tempOomScript = path.join(__dirname, "temp_guest_oom.js");
  const tempCpuScript = path.join(__dirname, "temp_guest_cpu.js");
  const tempEnvScript = path.join(__dirname, "temp_guest_env.js");
  const tempNetworkScript = path.join(__dirname, "temp_guest_net.js");
  const tempImportScript = path.join(__dirname, "temp_guest_import.js");
  const sandboxDir = path.resolve("./.sandbox-runner-test-dir");

  beforeAll(() => {
    // Write out mock guest scripts dynamically
    fs.writeFileSync(
      tempNetworkScript,
      `import dns from "dns";
dns.lookup("google.com", (err) => {
  if (err) {
    console.log("NET_BLOCKED: " + err.message);
  } else {
    console.log("NET_SUCCESS");
  }
});`,
      "utf8",
    );

    fs.writeFileSync(
      tempImportScript,
      `try {
  await import("../../src/server.js");
  console.log("IMPORT_SUCCESS");
} catch (err) {
  console.log("IMPORT_BLOCKED: " + err.message);
}`,
      "utf8",
    );
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

    fs.writeFileSync(
      tempOomScript,
      `// Allocate plain JS objects in a loop to trigger V8 old space heap OOM
const chunks = [];
for (let i = 0; i < 1000000; i++) {
  chunks.push({ a: i, b: String(i) });
}`,
      "utf8",
    );

    fs.writeFileSync(
      tempCpuScript,
      `// High CPU script that periodically yields back to event loop but eats CPU
function runCpu() {
  const start = Date.now();
  while (Date.now() - start < 50) {
    Math.sqrt(Math.random() * 1000);
  }
  setTimeout(runCpu, 10);
}
runCpu();`,
      "utf8",
    );

    fs.writeFileSync(
      tempEnvScript,
      `// Try to read parent's secret variables or common keys
console.log("SECRET_KEY:" + process.env.SECRET_API_TOKEN);
console.log("DB_URI:" + process.env.DATABASE_PRIVATE_URI);
console.log("NODE_ENV:" + process.env.NODE_ENV);`,
      "utf8",
    );

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
      tempOomScript,
      tempCpuScript,
      tempEnvScript,
      tempNetworkScript,
      tempImportScript,
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

  test("should forcefully terminate or fail a guest script that exceeds the V8 memory limit", async () => {
    const result = await GuestRunner.runScript(tempOomScript, {
      maxMemoryMb: 16, // extremely low limit
      timeoutMs: 4000,
    });

    // The script must crash or exit with a non-zero code when it hits the 16MB heap limit
    expect(result.status).toBe("error");
    expect(result.exitCode).not.toBe(0);
    // Standard V8 OOM prints allocation failures to stdout/stderr
    expect(result.stdout + result.stderr).toContain("Allocation failed");
  });

  test("should forcefully terminate a blocked guest script exceeding CPU time-slice budget", async () => {
    const result = await GuestRunner.runScript(tempFreezeScript, {
      cpuTimeBudgetMs: 300,
      timeoutMs: 4000,
    });

    expect(result.status).toBe("error");
    expect(result.signal).toBe("SIGKILL");
    expect(result.error).toContain("exceeded cumulative CPU budget");
    expect(result.error).toContain("(blocked)");

    // Should log a cpu_exhaustion violation
    const metrics = SandboxSecurityRegistry.getMetrics();
    const violation = metrics.recent_violations.find(
      (v) => v.category === "cpu" && v.action === "cpu_exhaustion",
    );
    expect(violation).toBeDefined();
  });

  test("should forcefully terminate a cooperative high-CPU guest script exceeding accumulated budget", async () => {
    const result = await GuestRunner.runScript(tempCpuScript, {
      cpuTimeBudgetMs: 400,
      timeoutMs: 4000,
    });

    expect(result.status).toBe("error");
    expect(result.signal).toBe("SIGKILL");
    expect(result.error).toContain("exceeded cumulative CPU budget");
    expect(result.error).toContain("(accumulated)");

    // Should log a cpu_exhaustion violation
    const metrics = SandboxSecurityRegistry.getMetrics();
    const violation = metrics.recent_violations.find(
      (v) => v.category === "cpu" && v.action === "cpu_exhaustion",
    );
    expect(violation).toBeDefined();
  });

  test("should completely mask and sanitize host environment variables in guest processes", async () => {
    // Inject mock sensitive keys in host process environment
    process.env.SECRET_API_TOKEN = "parent_secret_abc123";
    process.env.DATABASE_PRIVATE_URI = "mongodb://parent_secret_db";

    try {
      const result = await GuestRunner.runScript(tempEnvScript, {
        timeoutMs: 3000,
      });

      expect(result.status).toBe("success");
      // Assert that parent secret keys resolve to undefined inside guest worker stdout
      expect(result.stdout).toContain("SECRET_KEY:undefined");
      expect(result.stdout).toContain("DB_URI:undefined");
      // Whitelisted keys must still be preserved correctly
      expect(result.stdout).toContain("NODE_ENV:test");
    } finally {
      delete process.env.SECRET_API_TOKEN;
      delete process.env.DATABASE_PRIVATE_URI;
    }
  });

  test("should pre-activate outbound firewall inside guest process and block egress network attempts (SPEC-143)", async () => {
    const result = await GuestRunner.runScript(tempNetworkScript, {
      timeoutMs: 3000,
    });

    expect(result.status).toBe("success");
    expect(result.stdout).toContain(
      "NET_BLOCKED: Outbound firewall blocked non-allowlisted host domain: google.com",
    );

    // Network violation trigger must be persistently recorded in security registry disk file
    const auditFile = result.childAuditFile || testAuditFile;
    expect(fs.existsSync(auditFile)).toBe(true);
    const content = fs.readFileSync(auditFile, "utf8");
    const logs = JSON.parse(content);
    const firewallViolation = logs.find(
      (v) => v.category === "firewall" && v.action === "connect",
    );
    expect(firewallViolation).toBeDefined();
    expect(firewallViolation.details.host).toBe("google.com");
  });

  test("should block dynamic imports targeting host codebase modules outside sandbox jails (SPEC-144)", async () => {
    const result = await GuestRunner.runScript(tempImportScript, {
      sandboxDir,
      timeoutMs: 3000,
    });

    expect(result.status).toBe("success");
    expect(result.stdout).toContain(
      "IMPORT_BLOCKED: [SECURITY ACCESS DENIED] ESM Import Violation: [SECURITY ACCESS DENIED] Read attempt outside sandboxed directory:",
    );
  });
});
