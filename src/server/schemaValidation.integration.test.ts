import { describe, test, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("WebSocket Schema Validation Integration Tests (SPEC-089)", () => {
  let worker;
  const port = 18195;
  const persistenceDir = "./data-test-validation";

  beforeAll(async () => {
    // Boot the game server Worker on a dedicated port
    worker = await bootGameServerWorker({ port, persistenceDir });
  }, 25000);

  afterAll(async () => {
    await stopGameServerWorker(worker, persistenceDir);
  });

  test("accepts valid join_room message and returns standard response", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: "Tracer",
          }),
        );
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (_e) {
          return; // Ignore binary state broadcasts
        }
        if (msg.type === "init") {
          expect(msg.nickname).toBe("Tracer");
          ws.close();
          resolve();
        }
      });

      ws.on("error", (err) => {
        ws.close();
        reject(err);
      });
    });
  });

  test("rejects malformed message with invalid structure", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        // Send join_room message with invalid type of nickname (number instead of string)
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: 99999,
          }),
        );
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (_e) {
          return; // Ignore binary state broadcasts
        }
        if (msg.type === "notification") {
          expect(msg.style).toBe("error");
          expect(msg.message).toContain("Invalid network payload");
          expect(msg.message).toContain("nickname");
          ws.close();
          resolve();
        }
      });

      ws.on("error", (err) => {
        ws.close();
        reject(err);
      });
    });
  });

  test("rejects trade message with negative amount", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        // Join first to set up session
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: "Merchant",
          }),
        );
      });

      let joined = false;
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (_e) {
          return; // Ignore binary state broadcasts
        }
        if (msg.type === "init") {
          joined = true;
          // Send invalid trade command
          ws.send(
            JSON.stringify({
              type: "trade",
              planetName: "Sol Prime",
              commodity: "ore",
              amount: -10,
              buy: true,
            }),
          );
        } else if (
          joined &&
          msg.type === "notification" &&
          msg.message.includes("Invalid network payload")
        ) {
          expect(msg.style).toBe("error");
          expect(msg.message).toContain("amount");
          ws.close();
          resolve();
        }
      });

      ws.on("error", (err) => {
        ws.close();
        reject(err);
      });
    });
  });

  test("rejects join_room message containing path traversal or shell character", () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        // Send join_room message with path traversal characters in roomId
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: "../etc/passwd",
            nickname: "Tracer",
          }),
        );
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (_e) {
          return; // Ignore binary state broadcasts
        }
        if (msg.type === "notification") {
          expect(msg.style).toBe("error");
          expect(msg.message).toContain("Invalid network payload");
          expect(msg.message).toContain("Security warning");
          ws.close();
          resolve();
        }
      });

      ws.on("error", (err) => {
        ws.close();
        reject(err);
      });
    });
  });

  test("serves centralized commodities and schemas on GET /schema", async () => {
    const response = await fetch(`http://localhost:${port}/schema`);
    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body.commodities).toBeDefined();
    expect(body.schemas).toBeDefined();

    // Verify commodity details are exposed
    expect(body.commodities.food).toBeDefined();
    expect(body.commodities.food.mass).toBe(1.0);
    expect(body.commodities.food.baseValue).toBe(100);
    expect(body.commodities.food.illegal).toBe(false);
    expect(body.commodities.food.category).toBe("basic");

    expect(body.commodities.contraband).toBeDefined();
    expect(body.commodities.contraband.illegal).toBe(true);

    // Verify schemas are exposed
    expect(body.schemas.join).toBeDefined();
    expect(body.schemas.trade).toBeDefined();
  });
});
