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

  test("asserts a client dynamically routes and is accepted by its owner under dynamic room ownership", async () => {
    // Shard 0 owns room "room-A" or "room-B" depending on FNV-1a.
    // Let's find room IDs that deterministically map to Shard 0 and Shard 1 respectively.
    let roomForShard0 = "room-0";

    for (let i = 0; i < 100; i++) {
      const rid = `room-${i}`;
      if (assignShard(rid, 2) === 0) {
        roomForShard0 = rid;
      }
    }

    // 1. Client trying to join roomForShard0 on Worker 1 (port1) must fail (hosted on a different shard)
    const wsFail = new WebSocket(`ws://localhost:${port1}`);
    const failRes = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for join failure")),
        4000,
      );

      wsFail.on("open", () => {
        wsFail.send(
          JSON.stringify({
            type: "join_room",
            roomId: roomForShard0,
            nickname: "TesterFail",
          }),
        );
      });

      wsFail.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "notification" && msg.style === "error") {
          clearTimeout(timeout);
          resolve(msg);
          wsFail.close();
        }
      });

      wsFail.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(failRes.message).toContain("hosted on a different shard");

    // 2. Client joining roomForShard0 on Worker 0 (port0) must succeed
    const wsSuccess = new WebSocket(`ws://localhost:${port0}`);
    const okRes = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for join success")),
        4000,
      );

      wsSuccess.on("open", () => {
        wsSuccess.send(
          JSON.stringify({
            type: "join_room",
            roomId: roomForShard0,
            nickname: "TesterOk",
          }),
        );
      });

      wsSuccess.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "init") {
          clearTimeout(timeout);
          resolve(msg);
          wsSuccess.close();
        }
      });

      wsSuccess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(okRes.roomId).toBe(roomForShard0);
  });
});
