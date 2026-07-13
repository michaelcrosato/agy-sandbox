import { WebSocketServer } from "ws";
import { waitForWebSocketReady } from "./integrationHarness.js";

describe("integrationHarness.waitForWebSocketReady", () => {
  test("resolves once a server accepts WebSocket connections", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise((resolve) => wss.on("listening", resolve));
    const { port } = wss.address();
    try {
      await expect(waitForWebSocketReady(port, 5000)).resolves.toBeUndefined();
    } finally {
      await new Promise((resolve) => wss.close(resolve));
    }
  });

  test("rejects when nothing accepts connections before the timeout", async () => {
    // Reserve a port and immediately close it so nothing is listening there.
    const probe = new WebSocketServer({ port: 0 });
    await new Promise((resolve) => probe.on("listening", resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));

    await expect(waitForWebSocketReady(port, 400)).rejects.toThrow(
      /did not accept WebSocket connections/,
    );
  }, 10000);
});
