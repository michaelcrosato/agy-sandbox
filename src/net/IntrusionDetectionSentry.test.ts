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
 * IntrusionDetectionSentry.test.js (SPEC-175)
 * Comprehensive unit and integration test suite for V8 Isolated Sandbox Process Escape Intrusion Sentry.
 */

import fs from "fs";
import path from "path";
import childProcess from "child_process";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// The forked worker runs under raw Node and imports "./IntrusionDetectionSentry.js"
// relatively; that resolves only against the compiled output, so place the
// generated worker in dist/net (built by the gate before tests run) rather than
// src/net where only the .ts source exists.
const workerScriptPath = path.resolve(
  __dirname,
  "../../dist/net/temp_sentry_test_worker.js",
);
const secretKey = "test-secret-key-12345";

describe("IntrusionDetectionSentry", () => {
  beforeAll(() => {
    // Write out the helper child worker script
    fs.writeFileSync(
      workerScriptPath,
      `import { IntrusionDetectionSentry } from "./IntrusionDetectionSentry.js";
      import childProcess from "child_process";

      const mode = process.argv[2];
      const secret = "${secretKey}";

      // Capture original send before activating sentry
      const nativeSend = process.send;

      IntrusionDetectionSentry.activate(secret);

      if (mode === "proto") {
        Object.defineProperty(Object.prototype, "tamperedKey", {
          value: "escaped",
          configurable: true
        });
      } else if (mode === "spawn") {
        childProcess.spawn("echo", ["hello"]);
      } else if (mode === "bypass") {
        if (nativeSend) {
          nativeSend.call(process, { type: "heartbeat", signature: "invalid-sig-payload" });
        }
      } else if (mode === "normal") {
        process.send({ type: "heartbeat" });
      }`,
      "utf8",
    );
  });

  afterAll(() => {
    try {
      if (fs.existsSync(workerScriptPath)) {
        fs.unlinkSync(workerScriptPath);
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
  });

  test("should instantly SIGKILL the process on prototype tampering", () =>
    new Promise((resolve, reject) => {
      const child = childProcess.fork(workerScriptPath, ["proto"], {
        stdio: "pipe",
      });

      let receivedAlert = false;
      child.on("message", (msg) => {
        if (
          msg &&
          msg.type === "intrusion_alert" &&
          msg.category === "prototype_tamper"
        ) {
          receivedAlert = true;
        }
      });

      child.on("exit", (code, signal) => {
        try {
          if (process.platform === "win32") {
            expect(code !== 0 || signal !== null).toBe(true);
          } else {
            expect(signal).toBe("SIGKILL");
          }
          expect(receivedAlert).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));

  test("should instantly SIGKILL the process on process spawn attempt", () =>
    new Promise((resolve, reject) => {
      const child = childProcess.fork(workerScriptPath, ["spawn"], {
        stdio: "pipe",
      });

      let receivedAlert = false;
      child.on("message", (msg) => {
        if (
          msg &&
          msg.type === "intrusion_alert" &&
          msg.category === "process_spawn"
        ) {
          receivedAlert = true;
        }
      });

      child.on("exit", (code, signal) => {
        try {
          if (process.platform === "win32") {
            expect(code !== 0 || signal !== null).toBe(true);
          } else {
            expect(signal).toBe("SIGKILL");
          }
          expect(receivedAlert).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));

  test("should compute and verify valid HMAC signatures on normal messages", () =>
    new Promise((resolve, reject) => {
      const child = childProcess.fork(workerScriptPath, ["normal"], {
        stdio: "pipe",
      });

      let verified = false;
      child.on("message", (msg) => {
        if (msg && msg.type === "heartbeat") {
          const { signature } = msg;
          const payload = { ...msg, signature: undefined };
          const payloadStr = JSON.stringify(payload);
          const computedSig = crypto
            .createHmac("sha256", secretKey)
            .update(payloadStr)
            .digest("hex");

          if (computedSig === signature) {
            verified = true;
          }
        }
      });

      child.on("exit", (code, signal) => {
        try {
          expect(verified).toBe(true);
          expect(code).toBe(0);
          expect(signal).toBeNull();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));

  test("should allow host to detect signature tampering and mismatch", () =>
    new Promise((resolve, reject) => {
      const child = childProcess.fork(workerScriptPath, ["bypass"], {
        stdio: "pipe",
      });

      let mismatchDetected = false;
      child.on("message", (msg) => {
        if (msg && msg.type === "heartbeat") {
          const { signature } = msg;
          const payload = { ...msg, signature: undefined };
          const payloadStr = JSON.stringify(payload);
          const computedSig = crypto
            .createHmac("sha256", secretKey)
            .update(payloadStr)
            .digest("hex");

          if (computedSig !== signature) {
            mismatchDetected = true;
            // In standard host supervisor, it would send SIGKILL
            child.kill("SIGKILL");
          }
        }
      });

      child.on("exit", (code, signal) => {
        try {
          expect(mismatchDetected).toBe(true);
          if (process.platform === "win32") {
            expect(code !== 0 || signal !== null).toBe(true);
          } else {
            expect(signal).toBe("SIGKILL");
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
});
