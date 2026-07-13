/**
 * StaticSecuritySentry.js (SPEC-171) — Advanced static analysis AST/lexical sentry.
 * Pre-scans guest script source code to block dangerous language constructs before execution.
 */

import { isBuiltin } from "node:module";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

const SAFE_CORE_MODULES = new Set([
  "node:path",
  "path",
  "node:url",
  "url",
  "node:crypto",
  "crypto",
  "node:util",
  "util",
  "node:stream",
  "stream",
  "node:string_decoder",
  "string_decoder",
]);

/**
 * Checks if a module specifier is an unauthorized native core Node.js module.
 * @param {string} specifier - The module import specifier.
 * @returns {boolean}
 */
function isUnauthorizedCoreModule(specifier) {
  const isCore = specifier.startsWith("node:") || isBuiltin(specifier);
  if (!isCore) return false;
  return !SAFE_CORE_MODULES.has(specifier);
}

/**
 * Static Analysis AST Security Sentry.
 */
export const StaticSecuritySentry = {
  /**
   * Statically scans guest script source code for dangerous language constructs.
   * Throws a security error if violations are identified.
   * @param {string} codeContent - The script source code to analyze.
   * @returns {void}
   */
  checkScript(codeContent) {
    const tokens = this.tokenize(codeContent);
    const len = tokens.length;

    for (let idx = 0; idx < len; idx++) {
      const token = tokens[idx];

      // 1. Block eval and Function identifiers
      if (token.type === "identifier") {
        const val = token.value;
        if (val === "eval") {
          this.raiseViolation(
            "eval_usage",
            "Static analysis blocked usage of 'eval()'.",
          );
        }
        if (val === "Function") {
          this.raiseViolation(
            "Function_constructor",
            "Static analysis blocked usage of 'Function' constructor.",
          );
        }
        if (val === "globalThis" || val === "global" || val === "window") {
          this.raiseViolation(
            "global_manipulation",
            `Static analysis blocked access to global scope identifier '${val}'.`,
          );
        }
      }

      // 2. Block prototype, constructor, and __proto__ property accesses
      // Dot notation check: obj.prototype, obj.constructor, obj.__proto__
      if (token.type === "punctuator" && token.value === ".") {
        const nextToken = tokens[idx + 1];
        if (nextToken && nextToken.type === "identifier") {
          const prop = nextToken.value;
          if (
            prop === "prototype" ||
            prop === "constructor" ||
            prop === "__proto__"
          ) {
            this.raiseViolation(
              "prototype_pollution_attempt",
              `Static analysis blocked property access to '.${prop}'.`,
            );
          }
        }
      }

      // Bracket notation check: obj["prototype"], obj['constructor'], obj[`__proto__`]
      if (token.type === "punctuator" && token.value === "[") {
        const nextToken = tokens[idx + 1];
        const nextNextToken = tokens[idx + 2];
        if (
          nextToken &&
          nextToken.type === "string" &&
          nextNextToken &&
          nextNextToken.type === "punctuator" &&
          nextNextToken.value === "]"
        ) {
          const prop = nextToken.value;
          if (
            prop === "prototype" ||
            prop === "constructor" ||
            prop === "__proto__"
          ) {
            this.raiseViolation(
              "prototype_pollution_attempt",
              `Static analysis blocked bracket access to property '${prop}'.`,
            );
          }
        }
      }

      // 3. Block dynamic require or unauthorized static/dynamic imports
      if (
        token.type === "identifier" &&
        (token.value === "require" || token.value === "import")
      ) {
        const nextToken = tokens[idx + 1];

        // Case A: require('module') or import('module')
        if (
          nextToken &&
          nextToken.type === "punctuator" &&
          nextToken.value === "("
        ) {
          const argToken = tokens[idx + 2];
          const closeToken = tokens[idx + 3];

          // Enforce strict dynamic import structure: require/import must be followed by ( 'string' )
          if (
            !argToken ||
            argToken.type !== "string" ||
            !closeToken ||
            closeToken.type !== "punctuator" ||
            closeToken.value !== ")"
          ) {
            this.raiseViolation(
              "dynamic_import_violation",
              `Static analysis blocked dynamic non-literal '${token.value}(...)'. Only static string literal imports are allowed.`,
            );
          }

          // Verify the import specifier is authorized
          const specifier = argToken.value;
          if (isUnauthorizedCoreModule(specifier)) {
            this.raiseViolation(
              "unauthorized_module_import",
              `Static analysis blocked import of unauthorized native module '${specifier}'.`,
            );
          }
        }
      }

      // Case B: static import ... from 'module'
      if (token.type === "identifier" && token.value === "from") {
        const nextToken = tokens[idx + 1];
        if (nextToken && nextToken.type === "string") {
          const specifier = nextToken.value;
          if (isUnauthorizedCoreModule(specifier)) {
            this.raiseViolation(
              "unauthorized_module_import",
              `Static analysis blocked static import of unauthorized native module '${specifier}'.`,
            );
          }
        }
      }

      // Case C: static import 'module'
      if (token.type === "identifier" && token.value === "import") {
        const nextToken = tokens[idx + 1];
        if (nextToken && nextToken.type === "string") {
          const specifier = nextToken.value;
          if (isUnauthorizedCoreModule(specifier)) {
            this.raiseViolation(
              "unauthorized_module_import",
              `Static analysis blocked static import of unauthorized native module '${specifier}'.`,
            );
          }
        }
      }
    }
  },

  /**
   * Helper to throw a standardized security error and log to SandboxSecurityRegistry.
   * @param {string} action - Triggered action type.
   * @param {string} message - Descriptive error message.
   */
  raiseViolation(action, message) {
    try {
      SandboxSecurityRegistry.logViolation("static_analysis", action, {
        message,
      });
    } catch {
      // Fail-safe registry logging bypass
    }
    const err: any = new Error(
      `[SECURITY ACCESS DENIED] Static Security Sentry Violation [${action}]: ${message}`,
    );
    err.category = "static_analysis";
    err.action = action;
    throw err;
  },

  /**
   * Pure JS state-machine lexical tokenizer.
   * @param {string} code - The script source code.
   * @returns {Array<{type: string, value: string, raw?: string}>}
   */
  tokenize(code) {
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
      const char = code[i];

      // 1. Whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // 2. Comments
      if (char === "/" && code[i + 1] === "/") {
        i += 2;
        while (i < len && code[i] !== "\n" && code[i] !== "\r") {
          i++;
        }
        continue;
      }
      if (char === "/" && code[i + 1] === "*") {
        i += 2;
        while (i < len && !(code[i] === "*" && code[i + 1] === "/")) {
          i++;
        }
        i += 2;
        continue;
      }

      // 3. String literals (single quote, double quote, template literal)
      if (char === "'" || char === '"' || char === "`") {
        const quote = char;
        let strVal = "";
        const startPos = i;
        i++; // skip open quote
        let escaped = false;
        while (i < len) {
          const c = code[i];
          if (escaped) {
            strVal += c;
            escaped = false;
            i++;
          } else if (c === "\\") {
            escaped = true;
            i++;
          } else if (c === quote) {
            i++; // skip close quote
            break;
          } else {
            strVal += c;
            i++;
          }
        }
        tokens.push({
          type: "string",
          value: strVal,
          raw: code.slice(startPos, i),
        });
        continue;
      }

      // 4. Identifiers / Keywords
      if (/[a-zA-Z_$]/.test(char)) {
        let identVal = char;
        i++;
        while (i < len && /[a-zA-Z0-9_$]/.test(code[i])) {
          identVal += code[i];
          i++;
        }
        tokens.push({ type: "identifier", value: identVal });
        continue;
      }

      // 5. Numbers
      if (/[0-9]/.test(char)) {
        let numVal = char;
        i++;
        while (i < len && /[0-9.]/.test(code[i])) {
          numVal += code[i];
          i++;
        }
        tokens.push({ type: "number", value: numVal });
        continue;
      }

      // 6. Operators & Punctuation
      tokens.push({ type: "punctuator", value: char });
      i++;
    }

    return tokens;
  },
};
