/**
 * StaticSecuritySentry.test.js (SPEC-171) — Unit and integration tests
 * for Static Analysis AST Security Sentry.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StaticSecuritySentry } from "./StaticSecuritySentry.js";
import { GuestRunner } from "./GuestRunner.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.resolve(__dirname, "temp_sentry_test_files");

describe("StaticSecuritySentry & GuestRunner Integration", () => {
  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  describe("Unit Tests - Prohibited Syntax Detection", () => {
    const testCases = [
      {
        name: "eval call",
        code: "const x = eval('2 + 2');",
        action: "eval_usage",
      },
      {
        name: "eval variable reference",
        code: "const myEval = eval; myEval('1');",
        action: "eval_usage",
      },
      {
        name: "Function constructor usage",
        code: "const run = new Function('return 42;');",
        action: "Function_constructor",
      },
      {
        name: "Function reference",
        code: "const F = Function; const run = new F();",
        action: "Function_constructor",
      },
      {
        name: "globalThis access",
        code: "globalThis.secret = 'stolen';",
        action: "global_manipulation",
      },
      {
        name: "global access",
        code: "global.secret = 'stolen';",
        action: "global_manipulation",
      },
      {
        name: "window access",
        code: "window.location = 'evil.com';",
        action: "global_manipulation",
      },
      {
        name: "dot prototype access",
        code: "Object.prototype.polluted = true;",
        action: "prototype_pollution_attempt",
      },
      {
        name: "bracket prototype access",
        code: "Object['prototype']['polluted'] = true;",
        action: "prototype_pollution_attempt",
      },
      {
        name: "dot constructor access",
        code: "const c = obj.constructor;",
        action: "prototype_pollution_attempt",
      },
      {
        name: "bracket constructor access",
        code: "const c = obj['constructor'];",
        action: "prototype_pollution_attempt",
      },
      {
        name: "dot __proto__ access",
        code: "const p = obj.__proto__;",
        action: "prototype_pollution_attempt",
      },
      {
        name: "bracket __proto__ access",
        code: "const p = obj['__proto__'];",
        action: "prototype_pollution_attempt",
      },
      {
        name: "unauthorized static import from",
        code: "import fs from 'fs';",
        action: "unauthorized_module_import",
      },
      {
        name: "unauthorized static import from node prefix",
        code: "import cp from 'node:child_process';",
        action: "unauthorized_module_import",
      },
      {
        name: "unauthorized static bare import",
        code: "import 'vm';",
        action: "unauthorized_module_import",
      },
      {
        name: "unauthorized dynamic import string",
        code: "const vm = await import('vm');",
        action: "unauthorized_module_import",
      },
      {
        name: "unauthorized require string",
        code: "const fs = require('fs');",
        action: "unauthorized_module_import",
      },
      {
        name: "dynamic require non-literal",
        code: "const myMod = 'child_process'; require(myMod);",
        action: "dynamic_import_violation",
      },
      {
        name: "dynamic import non-literal",
        code: "const myMod = 'vm'; import(myMod);",
        action: "dynamic_import_violation",
      },
    ];

    testCases.forEach(({ name, code, action }) => {
      it(`should block ${name}`, () => {
        expect(() => {
          StaticSecuritySentry.checkScript(code);
        }).toThrow(
          new RegExp(`Static Security Sentry Violation.*${action}`, "i"),
        );

        // Ensure it logged to registry
        const metrics = SandboxSecurityRegistry.getMetrics();
        expect(metrics.security_violations_total).toBe(1);
        expect(metrics.security_violations_by_category.static_analysis).toBe(1);
        expect(metrics.recent_violations[0].action).toBe(action);
      });
    });
  });

  describe("Unit Tests - Harmless Code Allowance", () => {
    it("should allow safe JavaScript constructs and authorized core modules", () => {
      const harmlessScripts = [
        "const path = require('path'); const p = path.join('a', 'b');",
        "import crypto from 'crypto'; const hash = crypto.createHash('sha256').digest('hex');",
        "const obj = { a: 1 }; const keys = Object.keys(obj);",
        "// A harmless comment referencing eval or Function\nconst a = 1;",
        "/* block constructor or prototype comments */ const b = 2;",
        "const str = 'This string has eval and Function and __proto__ in it';",
        "function mySafeFunc() { return 'hello'; }",
      ];

      harmlessScripts.forEach((code) => {
        expect(() => {
          StaticSecuritySentry.checkScript(code);
        }).not.toThrow();
      });
    });
  });

  describe("Integration Tests - GuestRunner Interception", () => {
    it("should allow safe script execution via GuestRunner", async () => {
      const safeFile = path.join(tempDir, "safe_run.js");
      fs.writeFileSync(
        safeFile,
        "console.log('GUEST_STDOUT: hello from guest');",
        "utf8",
      );

      const res = await GuestRunner.runScript(safeFile);
      expect(res.status).toBe("success");
      expect(res.error).toBeUndefined();
    });

    it("should statically block malicious script before starting process", async () => {
      const evilFile = path.join(tempDir, "evil_run.js");
      fs.writeFileSync(evilFile, "const x = eval('1 + 2');", "utf8");

      const res = await GuestRunner.runScript(evilFile);

      // Verify immediate short-circuit exit state
      expect(res.status).toBe("crashed");
      expect(res.exitCode).toBeNull();
      expect(res.signal).toBeNull();
      expect(res.error).toContain(
        "Static Security Sentry Violation [eval_usage]",
      );
      expect(res.stderr).toContain(
        "[SECURITY ACCESS DENIED] Static analysis failed",
      );

      // Verify that NO worktree or process drift is left, and the block was registered
      const metrics = SandboxSecurityRegistry.getMetrics();
      expect(metrics.security_violations_total).toBe(1);
      expect(metrics.security_violations_by_category.static_analysis).toBe(1);
      expect(metrics.recent_violations[0].action).toBe("eval_usage");
    });
  });
});
