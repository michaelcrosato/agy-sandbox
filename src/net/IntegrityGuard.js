/**
 * IntegrityGuard.js (spec 134) — global prototype freeze sentry
 * and global scope pollution protection registry.
 */

import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const originalDefineProperty = Object.defineProperty;
const originalDefineProperties = Object.defineProperties;
const originalSetPrototypeOf = Object.setPrototypeOf;

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

let isSentryActivated = false;
let initialGlobals = new Set();
let pollutionInterval = null;
const allowedGlobals = new Set(["gc"]);

export const IntegrityGuard = {
  /**
   * Initializes and activates the global prototype freeze and integrity sentry.
   * @param {number} [pollutionCheckIntervalMs=50] - Polling interval to detect global scope pollution in ms.
   */
  start(pollutionCheckIntervalMs = 50) {
    if (!isSentryActivated) {
      isSentryActivated = true;

      // 1. Monkey-patch Object object mutation APIs to intercept defineProperty and prototype alterations first
      Object.defineProperty = function (target, prop, descriptor) {
        if (protectedObjects.has(target)) {
          SandboxSecurityRegistry.logViolation(
            "integrity",
            "prototype_tamper",
            {
              target: target.constructor ? target.constructor.name : "Unknown",
              property: String(prop),
              reason: `Unauthorized defineProperty attempt to redefine [${String(prop)}] on protected constructor/prototype`,
            },
          );
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot define property on protected prototype: ${String(prop)}`,
          );
        }
        return originalDefineProperty.call(this, target, prop, descriptor);
      };

      Object.defineProperties = function (target, props) {
        if (protectedObjects.has(target)) {
          SandboxSecurityRegistry.logViolation(
            "integrity",
            "prototype_tamper",
            {
              target: target.constructor ? target.constructor.name : "Unknown",
              reason:
                "Unauthorized defineProperties attempt to redefine properties on protected constructor/prototype",
            },
          );
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot define properties on protected prototype`,
          );
        }
        return originalDefineProperties.call(this, target, props);
      };

      Object.setPrototypeOf = function (target, proto) {
        if (protectedObjects.has(target) || protectedObjects.has(proto)) {
          SandboxSecurityRegistry.logViolation(
            "integrity",
            "prototype_tamper",
            {
              reason:
                "Unauthorized setPrototypeOf attempt to alter prototype chain of protected constructor/prototype",
            },
          );
          throw new TypeError(
            `[SECURITY BLOCKED] Cannot modify prototype chain of protected prototype`,
          );
        }
        return originalSetPrototypeOf.call(this, target, proto);
      };

      // 2. Freeze all core constructors and prototypes recursively so they are immutable and secure
      for (const builtin of coreBuiltins) {
        if (builtin) {
          try {
            Object.freeze(builtin);
            const b = /** @type {any} */ (builtin);
            if (b.prototype) {
              Object.freeze(b.prototype);
            }
          } catch {
            // Degrade gracefully if some built-in cannot be frozen
          }
        }
      }
    }

    // 3. Snapshot global scope properties
    initialGlobals = new Set(Reflect.ownKeys(globalThis));

    // 4. Set up periodic check to intercept and clean up global scope pollution
    if (!pollutionInterval) {
      pollutionInterval = setInterval(() => {
        this.checkGlobalPollution();
      }, pollutionCheckIntervalMs);
    }
  },

  /**
   * Scans global scope to intercept, log, and delete new global pollution.
   */
  checkGlobalPollution() {
    const currentKeys = Reflect.ownKeys(globalThis);
    for (const key of currentKeys) {
      const keyStr = String(key);
      // Skip already allowlisted, initial, or Jest/coverage internals to prevent false positives
      if (
        initialGlobals.has(key) ||
        allowedGlobals.has(keyStr) ||
        /^(__jest__|__coverage__|jest|expect|describe|test|before|after)/.test(
          keyStr,
        )
      ) {
        continue;
      }

      // Found pollution violation!
      try {
        SandboxSecurityRegistry.logViolation("integrity", "global_pollution", {
          property: keyStr,
          reason: `Global scope pollution detected: untrusted property [${keyStr}] was defined on globalThis`,
        });

        // Clean up the sandbox by deleting the polluted property
        delete globalThis[key];
      } catch {
        // Degrade gracefully
      }
    }
  },

  /**
   * Registers a key to the allowed globals list.
   * @param {string} key
   */
  allowlistGlobal(key) {
    allowedGlobals.add(key);
  },

  /**
   * Stops the active global pollution scanner.
   */
  stop() {
    if (pollutionInterval) {
      clearInterval(pollutionInterval);
      pollutionInterval = null;
    }
    // Note: Monkey-patches and frozen states cannot be cleanly undone due to native Object.freeze permanence.
    // We keep the secure patches active in the process lifetime for absolute protection.
  },

  /**
   * Checks whether the pollution scanner is active.
   * @returns {boolean}
   */
  isActive() {
    return pollutionInterval !== null;
  },
};
