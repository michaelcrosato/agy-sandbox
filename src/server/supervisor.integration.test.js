import { Worker } from "worker_threads";
import WebSocket from "ws";
import { assignShard } from "../net/roomRouter.js";

describe("Supervisor process model integration (spec 019c)", () => {
  let worker0;
  let worker1;
  const port0 = 18082;
  const port1 = 18083;

  beforeAll(async () => {
    // Boot Worker 0 on port0 (Shard index 0, Shard count 2)
    worker0 = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port0),
        SHARD_INDEX: "0",
        WORKERS: "2",
        PERSISTENCE_DIR: "./data-test-0",
      },
    });

    // Boot Worker 1 on port1 (Shard index 1, Shard count 2)
    worker1 = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port1),
        SHARD_INDEX: "1",
        WORKERS: "2",
        PERSISTENCE_DIR: "./data-test-1",
      },
    });

    // Wait for both worker threads to bind to their ports
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Terminate both worker threads cleanly
    await worker0.terminate();
    await worker1.terminate();
  });

  test("asserts a room routes to and runs only on the owning shard worker", async () => {
    const publicOwnerShard = assignShard("public", 2);
    const ownerPort = publicOwnerShard === 0 ? port0 : port1;
    const nonOwnerPort = publicOwnerShard === 0 ? port1 : port0;

    // 1. Connecting to the non-owning worker and trying to join "public" should yield an error/notification
    const wsNonOwner = new WebSocket(`ws://localhost:${nonOwnerPort}`);
    const nonOwnerResponse = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for non-owner response")),
        4000,
      );

      wsNonOwner.on("open", () => {
        wsNonOwner.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: "TesterNonOwner",
          }),
        );
      });

      wsNonOwner.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "notification" && msg.style === "error") {
          clearTimeout(timeout);
          resolve(msg);
          wsNonOwner.close();
        }
      });

      wsNonOwner.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(nonOwnerResponse.message).toContain("hosted on a different shard");

    // 2. Connecting to the owning worker and joining "public" should succeed and receive the 'init' payload
    const wsOwner = new WebSocket(`ws://localhost:${ownerPort}`);
    const ownerResponse = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for owner response")),
        4000,
      );

      wsOwner.on("open", () => {
        wsOwner.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: "TesterOwner",
          }),
        );
      });

      wsOwner.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "init") {
          clearTimeout(timeout);
          resolve(msg);
          wsOwner.close();
        }
      });

      wsOwner.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(ownerResponse.roomId).toBe("public");
  });
});
