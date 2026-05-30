/**
 * SchemaValidator.js — pure, zero-dependency, zero-trust schema validation
 * for authoritative server WebSocket messages (SPEC-089).
 *
 * It validates that client-provided JSON messages contain correct types,
 * formats, and constraints, and strips undeclared keys to prevent prototype
 * pollution and malicious injections.
 */

const SCHEMAS = {
  join: {
    sessionToken: { type: "string", optional: true },
    nickname: { type: "string", optional: true, maxLength: 20 },
  },
  quick_join: {
    mode: { type: "string", optional: true },
    tags: { type: "array", optional: true, itemType: "string" },
  },
  create_room: {
    roomName: { type: "string", required: true, maxLength: 50 },
    mode: { type: "string", optional: true },
    tags: { type: "array", optional: true, itemType: "string" },
  },
  join_room: {
    roomId: { type: "string", required: true },
    nickname: { type: "string", optional: true, maxLength: 20 },
  },
  controls: {
    keys: { type: "object", optional: true },
    heading: { type: "number", optional: true, finite: true },
    warp: { type: "boolean", optional: true },
  },
  land: {
    planetName: { type: "string", required: true },
  },
  launch: {},
  trade: {
    planetName: { type: "string", required: true },
    commodity: { type: "string", required: true },
    amount: { type: "integer", required: true, min: 0 },
    buy: { type: "boolean", required: true },
  },
  port_service: {
    service: { type: "string", required: true },
  },
  port_refine: {},
  ore_refine: {},
  jettison: {
    commodity: { type: "string", required: true },
    amount: { type: "integer", required: true, min: 1 },
  },
  outfit_buy: {
    outfitKey: { type: "string", required: true },
  },
  outfit_sell: {
    outfitKey: { type: "string", required: true },
  },
  preset_save: {
    presetIndex: { type: "integer", optional: true, min: 0 },
  },
  preset_load: {
    presetIndex: { type: "integer", optional: true, min: 0 },
  },
  ship_buy: {
    hullKey: { type: "string", required: true },
  },
  squad_invite: {
    targetPlayerId: { type: "string", required: true },
  },
  squad_join: {
    squadId: { type: "string", required: true },
  },
  squad_leave: {},
  port_redeem_vouchers: {},
  mission_accept: {
    missionId: { type: "string", required: true },
  },
  mission_abandon: {
    missionId: { type: "string", required: true },
  },
  fleet_create: {
    fleetName: { type: "string", required: true, maxLength: 30 },
  },
  fleet_join: {
    fleetName: { type: "string", required: true, maxLength: 30 },
  },
  fleet_leave: {},
  chat: {
    text: { type: "string", required: true, maxLength: 100 },
    channel: { type: "string", optional: true },
  },
  warp_jump: {
    stargateId: { type: "string", required: true },
  },
  boarding_action: {
    targetId: { type: "string", required: true },
  },
  escort_command: {
    command: { type: "string", required: true },
  },
  escort_formation: {
    formation: { type: "string", required: true },
  },
  distress_beacon: {},
  ping: {},
};

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

  for (const [propName, rule] of Object.entries(schema)) {
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
