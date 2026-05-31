/**
 * GuestRpcSentry.js (SPEC-145)
 * Secure Sandboxed Guest RPC Sentry validating all child process communication.
 */

import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

// Strict allowlisted actions
export const ALLOWED_RPC_ACTIONS = new Set([
  "GET_SECTOR_STATE",
  "GET_FACTION_STANDINGS",
]);

/**
 * Validates the parameters against strict schemas depending on the action.
 * @param {string} action
 * @param {any} params
 * @returns {{ allowed: boolean; reason?: string }}
 */
export function validateRpcRequest(action, params) {
  if (!ALLOWED_RPC_ACTIONS.has(action)) {
    return {
      allowed: false,
      reason: `Action [${action || "undefined"}] is not authorized.`,
    };
  }

  if (params && typeof params === "object") {
    // 1. Prototype pollution scan
    const dangerousKeys = ["__proto__", "constructor", "prototype"];
    const jsonString = JSON.stringify(params);
    for (const key of dangerousKeys) {
      if (
        jsonString.includes(`"${key}"`) ||
        Object.prototype.hasOwnProperty.call(params, key)
      ) {
        return {
          allowed: false,
          reason: `Dangerous prototype key sequence [${key}] detected.`,
        };
      }
    }
  }

  // 2. Action specific parameters schema check
  if (action === "GET_SECTOR_STATE") {
    if (!params || typeof params !== "object") {
      return { allowed: false, reason: "Parameters must be an object." };
    }
    if (params.sectorId !== undefined && typeof params.sectorId !== "string") {
      return { allowed: false, reason: "Parameter sectorId must be a string." };
    }
    if (params.sectorId && params.sectorId.length > 64) {
      return {
        allowed: false,
        reason: "Parameter sectorId length exceeds limit of 64 characters.",
      };
    }
  }

  if (action === "GET_FACTION_STANDINGS") {
    if (!params || typeof params !== "object") {
      return { allowed: false, reason: "Parameters must be an object." };
    }
    if (params.playerId !== undefined && typeof params.playerId !== "string") {
      return { allowed: false, reason: "Parameter playerId must be a string." };
    }
    if (params.playerId && params.playerId.length > 64) {
      return {
        allowed: false,
        reason: "Parameter playerId length exceeds limit of 64 characters.",
      };
    }
  }

  return { allowed: true };
}

// Default secure handlers that do not leak private details
const defaultHandlers = {
  GET_SECTOR_STATE: async (params) => {
    const sectorId = params?.sectorId || "sol";
    return {
      sectorId,
      name: sectorId.toUpperCase() + " Sector",
      entities: [
        {
          id: "station-1",
          type: "spaceport",
          x: 100,
          y: 200,
          faction: "Federation",
        },
        { id: "star-1", type: "star", x: 0, y: 0 },
      ],
    };
  },
  GET_FACTION_STANDINGS: async (params) => {
    const playerId = params?.playerId || "player-1";
    return {
      playerId,
      standings: {
        Federation: 10,
        Outlaws: -50,
        Empire: 0,
      },
    };
  },
};

export const GuestRpcSentry = {
  // Observability counters
  totalRequests: 0,
  blockedRequests: 0,

  /**
   * Safe entrypoint to process an RPC message from the child worker.
   * @param {any} msg - IPC message from child.
   * @param {Object} [handlers] - RPC action handlers.
   * @returns {Promise<{ type: string, requestId: string, status: string, data?: any, error?: string } | null>}
   */
  async handleMessage(msg, handlers = {}) {
    if (!msg || msg.type !== "guest_rpc") {
      return null;
    }

    this.totalRequests++;
    const { action, params, requestId } = msg;

    const validation = validateRpcRequest(action, params);
    if (!validation.allowed) {
      this.blockedRequests++;
      SandboxSecurityRegistry.logViolation("rate_limit", "guest_rpc_block", {
        action,
        reason: validation.reason,
      });
      return {
        type: "guest_rpc_response",
        requestId,
        status: "error",
        error: `[SECURITY ACCESS DENIED] RPC Validation failed: ${validation.reason}`,
      };
    }

    // Call the handler safely
    try {
      const handler = handlers[action] || defaultHandlers[action];
      if (!handler) {
        throw new Error(`Handler for action [${action}] is not implemented.`);
      }

      const result = await handler(params);
      return {
        type: "guest_rpc_response",
        requestId,
        status: "success",
        data: result,
      };
    } catch (err) {
      return {
        type: "guest_rpc_response",
        requestId,
        status: "error",
        error: err.message,
      };
    }
  },
};
