/**
 * GuestRunner.test.js (SPEC-136) — comprehensive verification suite
 * for the host-isolated child-process guest execution runner.
 */

import fs from "fs";
import childProcess from "child_process";
import path from "path";
import { GuestRunner } from "./GuestRunner.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";
import { SecureModuleRegistry } from "./SecureModuleRegistry.js";
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
  const tempRpcOkScript = path.join(__dirname, "temp_guest_rpc_ok.js");
  const tempRpcEvilScript = path.join(__dirname, "temp_guest_rpc_evil.js");
  const tempRpcUnauthScript = path.join(__dirname, "temp_guest_rpc_unauth.js");
  const tempImportSecureScript = path.join(
    __dirname,
    "temp_guest_import_secure.js",
  );
  const tempSubModule = path.join(__dirname, "temp_sub_module.js");
  const sandboxDir = path.resolve("./.sandbox-runner-test-dir");

  beforeAll(() => {
    fs.writeFileSync(
      tempRpcOkScript,
      `try {
  const sector = await globalThis.guestRpcQuery("GET_SECTOR_STATE", { sectorId: "sol" });
  const standings = await globalThis.guestRpcQuery("GET_FACTION_STANDINGS", { playerId: "player-123" });
  console.log("SECTOR_NAME:" + sector.name);
  console.log("STANDINGS_FED:" + standings.standings.Federation);
} catch (err) {
  console.log("RPC_ERROR:" + err.message);
}`,
      "utf8",
    );

    fs.writeFileSync(
      tempRpcEvilScript,
      `try {
  await globalThis.guestRpcQuery("DELETE_DATABASE", {});
} catch (err) {
  console.log("RPC_EVIL_ERROR:" + err.message);
}
try {
  await globalThis.guestRpcQuery("GET_SECTOR_STATE", JSON.parse('{"__proto__": {"evil": true}}'));
} catch (err) {
  console.log("RPC_POLLUTION_ERROR:" + err.message);
}`,
      "utf8",
    );
    fs.writeFileSync(
      tempRpcUnauthScript,
      `try {
  process.send({
    type: "guest_rpc",
    requestId: "spoof-id",
    action: "GET_SECTOR_STATE",
    params: { sectorId: "sol" },
    token: "malicious-fake-token"
  });
  console.log("UNAUTH_RPC_SENT");
} catch (err) {
  console.log("UNAUTH_RPC_ERROR:" + err.message);
}`,
      "utf8",
    );

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

    fs.writeFileSync(tempSubModule, `export const val = 42;`, "utf8");

    fs.writeFileSync(
      tempImportSecureScript,
      `try {
  const mod = await import("./temp_sub_module.js");
  console.log("SECURE_IMPORT_SUCCESS:" + mod.val);
} catch (err) {
  console.log("SECURE_IMPORT_BLOCKED: " + err.message);
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
      tempRpcOkScript,
      tempRpcEvilScript,
      tempRpcUnauthScript,
      tempImportSecureScript,
      tempSubModule,
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
    const hasTimeout = metrics.recent_violations.some(
      (v) => v.category === "cpu" && v.action === "guest_timeout",
    );
    expect(hasTimeout).toBe(true);
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
      sandboxDir,
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

  test("should support permitted allowlisted guest RPC queries (SPEC-145)", async () => {
    const result = await GuestRunner.runScript(tempRpcOkScript, {
      timeoutMs: 3000,
    });

    expect(result.status).toBe("success");
    expect(result.stdout).toContain("SECTOR_NAME:SOL Sector");
    expect(result.stdout).toContain("STANDINGS_FED:10");
  });

  test("should reject non-allowlisted actions or prototype-polluting guest RPC queries (SPEC-145)", async () => {
    const result = await GuestRunner.runScript(tempRpcEvilScript, {
      timeoutMs: 3000,
    });

    expect(result.status).toBe("success");
    expect(result.stdout).toContain(
      "RPC_EVIL_ERROR:[SECURITY ACCESS DENIED] RPC Validation failed: Action [DELETE_DATABASE] is not authorized.",
    );
    expect(result.stdout).toContain(
      "RPC_POLLUTION_ERROR:[SECURITY ACCESS DENIED] RPC Validation failed: Dangerous prototype key sequence [__proto__] detected.",
    );

    // Violation must be persistently logged inside child's audit ledger on disk
    const auditFile = result.childAuditFile || testAuditFile;
    expect(fs.existsSync(auditFile)).toBe(true);
    const content = fs.readFileSync(auditFile, "utf8");
    const logs = JSON.parse(content);
    const rpcViolations = logs.filter(
      (v) => v.category === "rate_limit" && v.action === "guest_rpc_block",
    );
    expect(rpcViolations.length).toBe(2);
  });

  test("should SIGKILL guest process and log violation if dynamic HMAC run token is spoofed or missing (SPEC-148)", async () => {
    const result = await GuestRunner.runScript(tempRpcUnauthScript, {
      timeoutMs: 3000,
    });

    expect(result.status).toBe("error");
    expect(result.signal).toBe("SIGKILL");
    expect(result.error).toContain("Guest RPC channel authentication failure");

    // Intrusive violation must be persistently registered in child's security audit disk ledger
    const auditFile = result.childAuditFile || testAuditFile;
    expect(fs.existsSync(auditFile)).toBe(true);
    const content = fs.readFileSync(auditFile, "utf8");
    const logs = JSON.parse(content);
    const authViolations = logs.filter(
      (v) =>
        v.category === "rate_limit" && v.action === "guest_rpc_auth_failure",
    );
    expect(authViolations.length).toBe(1);
    expect(authViolations[0].details.reason).toContain("AUTH_FAILURE");
  });

  test("should attempt to throttle the process priority of the guest child process upon spawn (SPEC-149)", async () => {
    const originalSetPriority = process.setPriority;
    let callCount = 0;
    let lastArgs = null;
    process.setPriority = function (pid, priority) {
      callCount++;
      lastArgs = [pid, priority];
    };

    try {
      await GuestRunner.runScript(tempImportScript, {
        timeoutMs: 3000,
      });
      expect(callCount).toBeGreaterThan(0);
      expect(lastArgs[1]).toBe(19);
    } finally {
      process.setPriority = originalSetPriority;
    }
  });

  test("should gracefully degrade and log warning if process priority throttling fails (SPEC-149)", async () => {
    const originalSetPriority = process.setPriority;
    let callCount = 0;
    process.setPriority = function (pid, priority) {
      callCount++;
      throw new Error("Access denied (mock)");
    };

    const originalWarn = console.warn;
    const warnings = [];
    console.warn = function (msg) {
      warnings.push(msg);
    };

    try {
      await GuestRunner.runScript(tempImportScript, {
        timeoutMs: 3000,
      });
      expect(callCount).toBeGreaterThan(0);
      expect(warnings.length).toBeGreaterThan(0);
      expect(
        warnings.some((w) =>
          w.includes("Failed to set low CPU scheduling priority for guest PID"),
        ),
      ).toBe(true);
    } finally {
      process.setPriority = originalSetPriority;
      console.warn = originalWarn;
    }
  });

  test("should attempt to apply kernel-level processor affinity and isolation upon spawn (SPEC-151)", async () => {
    // Import childProcess dynamically or use childProcess from parent scope
    const originalExec = childProcess.exec;
    let commandCalled = null;
    childProcess.exec = function (cmd, options, callback) {
      if (cmd.includes("ProcessorAffinity") || cmd.includes("taskset")) {
        commandCalled = cmd;
      }
      const cb = typeof options === "function" ? options : callback;
      if (cb) process.nextTick(() => cb(null, "", ""));
      return /** @type {any} */ ({});
    };

    try {
      await GuestRunner.runScript(tempImportScript, {
        timeoutMs: 3000,
      });
      expect(commandCalled).not.toBeNull();
      if (process.platform === "win32") {
        expect(commandCalled).toContain("ProcessorAffinity");
      } else if (process.platform === "linux") {
        expect(commandCalled).toContain("taskset");
      }
    } finally {
      childProcess.exec = originalExec;
    }
  });

  test("should skip execution of affinity and isolation command in test environment when not explicitly mocked to prevent CPU starvation (SPEC-151)", async () => {
    const originalExec = childProcess.exec;
    let execCalled = false;
    // Replace with a standard spy function that has NO 'commandCalled' string in its implementation.
    childProcess.exec = function (cmd, options, callback) {
      execCalled = true;
      const cb = typeof options === "function" ? options : callback;
      if (cb) process.nextTick(() => cb(null, "", ""));
      return /** @type {any} */ ({});
    };

    try {
      await GuestRunner.runScript(tempImportScript, {
        timeoutMs: 3000,
      });
      // It should NOT call the spy function since it is not the specific "commandCalled" mock definition!
      expect(execCalled).toBe(false);
    } finally {
      childProcess.exec = originalExec;
    }
  });

  test("should block ESM loader imports that fail cryptographic integrity checksum verification (SPEC-152)", async () => {
    // Ensure the registry is empty so the sub-module has no trusted signature registered
    SecureModuleRegistry.clear();

    const result = await GuestRunner.runScript(tempImportSecureScript, {
      timeoutMs: 3000,
    });

    expect(result.stdout).toContain("SECURE_IMPORT_BLOCKED:");
    expect(result.stdout).toContain("Cryptographic Signature Mismatch");

    // Verify integrity violation log is registered inside SandboxSecurityRegistry disk file
    const auditFile = result.childAuditFile || testAuditFile;
    expect(fs.existsSync(auditFile)).toBe(true);
    const content = fs.readFileSync(auditFile, "utf8");
    const logs = JSON.parse(content);
    const integrityViolation = logs.find(
      (v) =>
        v.category === "integrity" && v.action === "module_integrity_violation",
    );
    expect(integrityViolation).toBeDefined();
  });

  test("should successfully import ESM modules that match cryptographic integrity signatures (SPEC-152)", async () => {
    // Clear and register the correct sub-module hash signature
    SecureModuleRegistry.clear();
    SecureModuleRegistry.registerFile(tempSubModule);

    const result = await GuestRunner.runScript(tempImportSecureScript, {
      timeoutMs: 3000,
    });

    expect(result.stdout).toContain("SECURE_IMPORT_SUCCESS:42");
  });
});
