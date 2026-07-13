import { describe, test, expect, beforeEach, vi } from "vitest";
import { validateRpcRequest, GuestRpcSentry } from "./GuestRpcSentry.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

describe("GuestRpcSentry", () => {
  beforeEach(() => {
    GuestRpcSentry.totalRequests = 0;
    GuestRpcSentry.blockedRequests = 0;
    vi.restoreAllMocks();
  });

  describe("validateRpcRequest", () => {
    test("allows authorized actions", () => {
      expect(
        validateRpcRequest("GET_SECTOR_STATE", { sectorId: "sol" }),
      ).toEqual({
        allowed: true,
      });
      expect(
        validateRpcRequest("GET_FACTION_STANDINGS", { playerId: "player-1" }),
      ).toEqual({ allowed: true });
    });

    test("blocks unauthorized actions", () => {
      expect(validateRpcRequest("INVALID_ACTION", {})).toEqual({
        allowed: false,
        reason: "Action [INVALID_ACTION] is not authorized.",
      });
      expect(validateRpcRequest(undefined, {})).toEqual({
        allowed: false,
        reason: "Action [undefined] is not authorized.",
      });
    });

    test("blocks prototype pollution keys", () => {
      expect(
        validateRpcRequest(
          "GET_SECTOR_STATE",
          JSON.parse('{"__proto__": {"poll": true}}'),
        ),
      ).toEqual({
        allowed: false,
        reason: "Dangerous prototype key sequence [__proto__] detected.",
      });

      expect(
        validateRpcRequest(
          "GET_SECTOR_STATE",
          JSON.parse('{"constructor": {"poll": true}}'),
        ),
      ).toEqual({
        allowed: false,
        reason: "Dangerous prototype key sequence [constructor] detected.",
      });

      expect(
        validateRpcRequest(
          "GET_SECTOR_STATE",
          JSON.parse('{"prototype": {"poll": true}}'),
        ),
      ).toEqual({
        allowed: false,
        reason: "Dangerous prototype key sequence [prototype] detected.",
      });
    });

    test("enforces parameter types and lengths for GET_SECTOR_STATE", () => {
      expect(validateRpcRequest("GET_SECTOR_STATE", null)).toEqual({
        allowed: false,
        reason: "Parameters must be an object.",
      });
      expect(validateRpcRequest("GET_SECTOR_STATE", "not-an-object")).toEqual({
        allowed: false,
        reason: "Parameters must be an object.",
      });
      expect(validateRpcRequest("GET_SECTOR_STATE", { sectorId: 123 })).toEqual(
        {
          allowed: false,
          reason: "Parameter sectorId must be a string.",
        },
      );
      expect(
        validateRpcRequest("GET_SECTOR_STATE", { sectorId: "a".repeat(65) }),
      ).toEqual({
        allowed: false,
        reason: "Parameter sectorId length exceeds limit of 64 characters.",
      });
    });

    test("enforces parameter types and lengths for GET_FACTION_STANDINGS", () => {
      expect(validateRpcRequest("GET_FACTION_STANDINGS", null)).toEqual({
        allowed: false,
        reason: "Parameters must be an object.",
      });
      expect(
        validateRpcRequest("GET_FACTION_STANDINGS", { playerId: 123 }),
      ).toEqual({
        allowed: false,
        reason: "Parameter playerId must be a string.",
      });
      expect(
        validateRpcRequest("GET_FACTION_STANDINGS", {
          playerId: "a".repeat(65),
        }),
      ).toEqual({
        allowed: false,
        reason: "Parameter playerId length exceeds limit of 64 characters.",
      });
    });
  });

  describe("handleMessage", () => {
    test("ignores messages that are not guest_rpc", async () => {
      const result = await GuestRpcSentry.handleMessage({
        type: "some_other_msg",
      });
      expect(result).toBeNull();
      expect(GuestRpcSentry.totalRequests).toBe(0);
    });

    test("blocks requests with mismatched expected token", async () => {
      const logSpy = vi
        .spyOn(SandboxSecurityRegistry, "logViolation")
        .mockImplementation(() => {});
      const msg = {
        type: "guest_rpc",
        action: "GET_SECTOR_STATE",
        params: { sectorId: "sol" },
        requestId: "req-1",
        token: "bad-token",
      };

      const response = await GuestRpcSentry.handleMessage(
        msg,
        {},
        "good-token",
      );
      expect(response).toEqual({
        type: "guest_rpc_response",
        requestId: "req-1",
        status: "error",
        error: "AUTH_FAILURE",
      });
      expect(GuestRpcSentry.blockedRequests).toBe(1);
      expect(logSpy).toHaveBeenCalledWith(
        "rate_limit",
        "guest_rpc_auth_failure",
        expect.any(Object),
      );
    });

    test("blocks invalid RPC requests", async () => {
      const logSpy = vi
        .spyOn(SandboxSecurityRegistry, "logViolation")
        .mockImplementation(() => {});
      const msg = {
        type: "guest_rpc",
        action: "INVALID_ACTION",
        params: {},
        requestId: "req-2",
        token: "token-1",
      };

      const response = await GuestRpcSentry.handleMessage(msg, {}, "token-1");
      expect(response.status).toBe("error");
      expect(response.error).toContain("RPC Validation failed");
      expect(GuestRpcSentry.blockedRequests).toBe(1);
      expect(logSpy).toHaveBeenCalledWith(
        "rate_limit",
        "guest_rpc_block",
        expect.any(Object),
      );
    });

    test("executes valid RPC requests using custom handlers", async () => {
      const msg = {
        type: "guest_rpc",
        action: "GET_SECTOR_STATE",
        params: { sectorId: "alpha" },
        requestId: "req-3",
        token: "token-1",
      };

      const customHandlers = {
        GET_SECTOR_STATE: async (params) => {
          return { customData: params.sectorId };
        },
      };

      const response = await GuestRpcSentry.handleMessage(
        msg,
        customHandlers,
        "token-1",
      );
      expect(response).toEqual({
        type: "guest_rpc_response",
        requestId: "req-3",
        status: "success",
        data: { customData: "alpha" },
      });
      expect(GuestRpcSentry.blockedRequests).toBe(0);
      expect(GuestRpcSentry.totalRequests).toBe(1);
    });

    test("executes valid RPC requests using default handlers", async () => {
      const msg = {
        type: "guest_rpc",
        action: "GET_FACTION_STANDINGS",
        params: { playerId: "hero" },
        requestId: "req-4",
        token: "token-1",
      };

      const response = await GuestRpcSentry.handleMessage(msg, {}, "token-1");
      expect(response.status).toBe("success");
      expect(response.data.playerId).toBe("hero");
      expect(response.data.standings).toBeDefined();
    });

    test("handles errors thrown by handlers gracefully", async () => {
      const msg = {
        type: "guest_rpc",
        action: "GET_SECTOR_STATE",
        params: { sectorId: "sol" },
        requestId: "req-5",
        token: "token-1",
      };

      const customHandlers = {
        GET_SECTOR_STATE: async () => {
          throw new Error("Handler failure");
        },
      };

      const response = await GuestRpcSentry.handleMessage(
        msg,
        customHandlers,
        "token-1",
      );
      expect(response).toEqual({
        type: "guest_rpc_response",
        requestId: "req-5",
        status: "error",
        error: "Handler failure",
      });
    });
  });
});
