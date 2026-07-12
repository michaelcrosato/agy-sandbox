import WebSocket from "ws";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("Interactive Onboarding Tutorial Server-Side Rewards Integration Tests (SPEC-105)", () => {
  let worker;
  const port = 18200;
  const persistenceDir = "./data-test-tutorial";

  beforeAll(async () => {
    // Boot the game server Worker on a dedicated port
    worker = await bootGameServerWorker({ port, persistenceDir });
  }, 25000);

  afterAll(async () => {
    await stopGameServerWorker(worker, persistenceDir);
  });

  /**
   * Helper: open a WS, send a payload, and collect parsed JSON messages
   * until a predicate returns true or a timeout is hit.
   */
  function connectAndCollect(payload, predicate, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const msgs = [];
      const timer = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms. Collected: ${JSON.stringify(msgs)}`,
          ),
        );
      }, timeoutMs);

      ws.on("open", () => {
        ws.send(JSON.stringify(payload));
      });

      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return; // Ignore binary state broadcasts
        }
        msgs.push(msg);
        if (predicate(msg, msgs)) {
          clearTimeout(timer);
          resolve({ ws, msgs });
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        ws.close();
        reject(err);
      });
    });
  }

  test("tracks and persists tutorial completion, awards +500 CR, and revives state on reconnect", async () => {
    // ── Step 1: Connect as a fresh pilot ──
    const { ws, msgs } = await connectAndCollect(
      { type: "join_room", roomId: "public", nickname: "NeoPilot" },
      (msg) => msg.type === "stats",
    );

    const initMsg = msgs.find((m) => m.type === "init");
    expect(initMsg).toBeDefined();
    expect(initMsg.tutorialCompleted).toBe(false);
    const sessionToken = initMsg.sessionToken;
    expect(typeof sessionToken).toBe("string");

    const statsMsg = msgs.find((m) => m.type === "stats");
    expect(statsMsg).toBeDefined();
    const originalCredits = statsMsg.credits;
    expect(typeof originalCredits).toBe("number");

    // ── Step 2: Send tutorial_complete and collect the reward stats ──
    ws.send(JSON.stringify({ type: "tutorial_complete" }));

    // Wait for the updated stats broadcast
    const rewardCredits = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for reward stats")),
        3000,
      );
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "stats") {
          clearTimeout(timer);
          resolve(msg.credits);
        }
      });
    });

    expect(rewardCredits).toBe(originalCredits + 500);

    // ── Step 3: Disconnect ──
    ws.close();
    // Allow the server to process the close event
    await new Promise((r) => setTimeout(r, 500));

    // ── Step 4: Reconnect using session token (type: "join") ──
    const { ws: ws2, msgs: msgs2 } = await connectAndCollect(
      { type: "join", sessionToken, nickname: "NeoPilot" },
      (msg) => msg.type === "init",
    );

    const reconnectInit = msgs2.find((m) => m.type === "init");
    expect(reconnectInit).toBeDefined();
    expect(reconnectInit.tutorialCompleted).toBe(true);

    ws2.close();
  }, 15000);
});
