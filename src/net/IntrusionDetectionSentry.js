/**
 * IntrusionDetectionSentry.js (SPEC-175)
 * Real-time global hook scanner and sandbox process escape intrusion detection.
 * Monitors prototype tampering, unauthorized command executions, and verifies IPC signatures.
 */

import childProcess from "child_process";
import crypto from "crypto";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const coreBuiltins = [
  Object,
  Function,
  Array,
  String,
  Number,
  Boolean,
  Date,
  RegExp,
  Error,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Symbol,
  BigInt,
  Proxy,
  Reflect,
  JSON,
  Math,
];

const protectedObjects = new Set();
for (const builtin of coreBuiltins) {
  if (builtin) {
    protectedObjects.add(builtin);
    const b = /** @type {any} */ (builtin);
    if (b.prototype) {
      protectedObjects.add(b.prototype);
    }
  }
}

let isActivated = false;

export const IntrusionDetectionSentry = {
  /**
   * Activates the intrusion detection sentry within the sandboxed child process.
   *
   * @param {string} hmacSecret - Cryptographic key to sign host-bound IPC messages.
   */
  activate(hmacSecret) {
    if (isActivated) return;
    isActivated = true;

    const originalDefineProperty = Object.defineProperty;
    const originalDefineProperties = Object.defineProperties;
    const originalSetPrototypeOf = Object.setPrototypeOf;

    originalDefineProperty(Object, "defineProperty", {
      value: function (target, prop, descriptor) {
        if (protectedObjects.has(target)) {
          IntrusionDetectionSentry.triggerAlarm("prototype_tamper", {
            target: target.constructor ? target.constructor.name : "Unknown",
            property: String(prop),
            reason: `Unauthorized attempt to redefine [${String(prop)}] on protected constructor/prototype`,
          });
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot define property on protected prototype: ${String(prop)}`,
          );
        }
        return originalDefineProperty(target, prop, descriptor);
      },
      configurable: true,
      writable: true,
      enumerable: false,
    });

    originalDefineProperty(Object, "defineProperties", {
      value: function (target, props) {
        if (protectedObjects.has(target)) {
          IntrusionDetectionSentry.triggerAlarm("prototype_tamper", {
            target: target.constructor ? target.constructor.name : "Unknown",
            reason: `Unauthorized attempt to define multiple properties on protected constructor/prototype`,
          });
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot define properties on protected prototype`,
          );
        }
        return originalDefineProperties(target, props);
      },
      configurable: true,
      writable: true,
      enumerable: false,
    });

    originalDefineProperty(Object, "setPrototypeOf", {
      value: function (target, proto) {
        if (protectedObjects.has(target) || protectedObjects.has(proto)) {
          IntrusionDetectionSentry.triggerAlarm("prototype_tamper", {
            reason: `Unauthorized attempt to alter prototype chain of protected constructor/prototype`,
          });
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot modify prototype chain of protected prototype`,
          );
        }
        return originalSetPrototypeOf(target, proto);
      },
      configurable: true,
      writable: true,
      enumerable: false,
    });

    // 2. Child Process Hook Watchdog
    const originalSpawn = childProcess.spawn;
    const originalSpawnSync = childProcess.spawnSync;
    const originalExec = childProcess.exec;
    const originalExecSync = childProcess.execSync;
    const originalExecFile = childProcess.execFile;
    const originalExecFileSync = childProcess.execFileSync;
    const originalFork = childProcess.fork;

    const cpAny = /** @type {any} */ (childProcess);

    cpAny.spawn = function (command, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "spawn",
        command,
        args: args[0],
      });
      return originalSpawn.call(childProcess, command, ...args);
    };

    cpAny.spawnSync = function (command, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "spawnSync",
        command,
        args: args[0],
      });
      return originalSpawnSync.call(childProcess, command, ...args);
    };

    cpAny.exec = function (command, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "exec",
        command,
      });
      return originalExec.call(childProcess, command, ...args);
    };
    if (originalExec.__promisify__) {
      cpAny.exec.__promisify__ = originalExec.__promisify__;
    }

    cpAny.execSync = function (command, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "execSync",
        command,
      });
      return originalExecSync.call(childProcess, command, ...args);
    };

    cpAny.execFile = function (file, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "execFile",
        file,
      });
      return originalExecFile.call(childProcess, file, ...args);
    };
    if (originalExecFile.__promisify__) {
      cpAny.execFile.__promisify__ = originalExecFile.__promisify__;
    }

    cpAny.execFileSync = function (file, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "execFileSync",
        file,
      });
      return originalExecFileSync.call(childProcess, file, ...args);
    };

    cpAny.fork = function (modulePath, ...args) {
      IntrusionDetectionSentry.triggerAlarm("process_spawn", {
        method: "fork",
        modulePath,
      });
      return originalFork.call(childProcess, modulePath, ...args);
    };

    // 3. Intercept & HMAC-sign host-bound IPC messages
    if (process.send) {
      const originalSend = process.send;
      process.send = function (msg, ...args) {
        if (msg && typeof msg === "object") {
          const payload = { ...msg, signature: undefined };
          const payloadStr = JSON.stringify(payload);
          msg.signature = crypto
            .createHmac("sha256", hmacSecret)
            .update(payloadStr)
            .digest("hex");
        }
        return originalSend.call(process, msg, ...args);
      };
    }

    // 4. Hook SandboxSecurityRegistry.logViolation to upgrade integrity violations to instant alarms
    const originalLogViolation = SandboxSecurityRegistry.logViolation;
    SandboxSecurityRegistry.logViolation = function (
      category,
      action,
      details,
    ) {
      if (category === "intrusion") {
        return originalLogViolation.call(this, category, action, details);
      }
      const result = originalLogViolation.call(this, category, action, details);
      if (
        category === "integrity" &&
        (action === "prototype_tamper" || action === "cpp_binding_escape")
      ) {
        IntrusionDetectionSentry.triggerAlarm(action, details);
      }
      return result;
    };
  },

  /**
   * Triggers an intrusion alarm, logging the violation and killing the process immediately.
   *
   * @param {string} category - Alarm category ("prototype_tamper" | "process_spawn")
   * @param {Object} details - Incident diagnostics/callstack context.
   */
  triggerAlarm(category, details) {
    try {
      SandboxSecurityRegistry.logViolation("intrusion", category, details);
    } catch {
      // ignore
    }

    try {
      if (process.send) {
        // Sign the alert manually first to satisfy host checks
        const alertMsg = {
          type: "intrusion_alert",
          category,
          details,
        };
        // Handled dynamically by the process.send monkeypatch wrapper
        process.send(alertMsg);
      }
    } catch {
      // ignore
    }

    try {
      process.kill(process.pid, "SIGKILL");
    } catch {
      process.exit(1);
    }
  },
};
