/**
 * SchemaValidator.js — pure, zero-dependency, zero-trust schema validation
 * for authoritative server WebSocket messages (SPEC-089).
 *
 * It validates that client-provided JSON messages contain correct types,
 * formats, and constraints, and strips undeclared keys to prevent prototype
 * pollution and malicious injections.
 */

import { SCHEMAS } from "./SchemaRegistry.js";

/**
 * Validates and sanitizes a WebSocket input message against its registered schema.
 * Returns { valid: true, sanitized: Object } or { valid: false, error: string }.
 *
 * @param {any} msg
 * @returns {{ valid: boolean, sanitized?: Object, error?: string }}
 */
export function validateMessage(msg) {
  if (typeof msg !== "object" || msg === null) {
    return { valid: false, error: "Message must be a non-null object" };
  }

  const type = msg.type;
  if (typeof type !== "string" || !type) {
    return {
      valid: false,
      error: "Message must specify a non-empty string type",
    };
  }

  const schema = SCHEMAS[type];
  if (!schema) {
    return { valid: false, error: `Unknown message type: "${type}"` };
  }

  const sanitized = { type };

  for (const [propName, rule] of Object.entries(schema) as [string, any][]) {
    const val = msg[propName];

    // Check optional/required constraints
    if (val === undefined || val === null) {
      if (rule.required) {
        return {
          valid: false,
          error: `Missing required property: "${propName}"`,
        };
      }
      continue;
    }

    // Validate type constraints
    if (rule.type === "string") {
      if (typeof val !== "string") {
        return {
          valid: false,
          error: `Property "${propName}" must be a string`,
        };
      }
      if (rule.maxLength !== undefined && val.length > rule.maxLength) {
        return {
          valid: false,
          error: `Property "${propName}" exceeds max length of ${rule.maxLength}`,
        };
      }

      const CRITICAL_PROPS = [
        "nickname",
        "sessionToken",
        "roomName",
        "roomId",
        "presetName",
        "squadId",
        "fleetName",
      ];
      if (CRITICAL_PROPS.includes(propName)) {
        const INJECTION_PATTERN = /(\.\.|[/\\]|[&|;$><`\r\n]|--|\/\*|\*\/)/;
        if (INJECTION_PATTERN.test(val)) {
          return {
            valid: false,
            error: `Security warning: Property "${propName}" contains disallowed injection characters`,
          };
        }
      }
    } else if (rule.type === "number" || rule.type === "integer") {
      if (typeof val !== "number") {
        return {
          valid: false,
          error: `Property "${propName}" must be a number`,
        };
      }
      if (rule.finite && !Number.isFinite(val)) {
        return {
          valid: false,
          error: `Property "${propName}" must be a finite number`,
        };
      }
      if (rule.type === "integer") {
        if (!Number.isInteger(val)) {
          return {
            valid: false,
            error: `Property "${propName}" must be an integer`,
          };
        }
        if (rule.min !== undefined && val < rule.min) {
          return {
            valid: false,
            error: `Property "${propName}" must be >= ${rule.min}`,
          };
        }
        if (rule.max !== undefined && val > rule.max) {
          return {
            valid: false,
            error: `Property "${propName}" must be <= ${rule.max}`,
          };
        }
      }
    } else if (rule.type === "boolean") {
      if (typeof val !== "boolean") {
        return {
          valid: false,
          error: `Property "${propName}" must be a boolean`,
        };
      }
    } else if (rule.type === "array") {
      if (!Array.isArray(val)) {
        return {
          valid: false,
          error: `Property "${propName}" must be an array`,
        };
      }
      if (rule.itemType) {
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] !== rule.itemType) {
            return {
              valid: false,
              error: `Element at index ${i} of property "${propName}" must be of type ${rule.itemType}`,
            };
          }
        }
      }
    } else if (rule.type === "object") {
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        return {
          valid: false,
          error: `Property "${propName}" must be a plain object`,
        };
      }
    }

    sanitized[propName] = val;
  }

  return { valid: true, sanitized };
}
