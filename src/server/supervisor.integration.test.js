import { Worker } from "worker_threads";
import WebSocket from "ws";
import fs from "fs";
import { assignShard } from "../net/roomRouter.js";
import { ProcessReaper } from "../net/ProcessReaper.js";

describe("Supervisor process model integration (spec 019c)", () => {
  let worker0;
  let worker1;
  const port0 = 18082;
  const port1 = 18083;

  beforeAll(async () => {
    // Purge test directories to avoid leftover registry or sector files dirtying the state (spec 019f)
    for (const dir of [
      "./data-test-0",
      "./data-test-1",
      "./data-test-shared",
    ]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    // Boot Worker 0 on port0 (Shard index 0, Shard count 2)
    worker0 = ProcessReaper.registerWorker(
      new Worker(new URL("../server.js", import.meta.url), {
        env: {
          NODE_ENV: "test",
          PORT: String(port0),
          SHARD_INDEX: "0",
          WORKERS: "2",
          PERSISTENCE_DIR: "./data-test-shared",
        },
      }),
    );

    // Boot Worker 1 on port1 (Shard index 1, Shard count 2)
    worker1 = ProcessReaper.registerWorker(
      new Worker(new URL("../server.js", import.meta.url), {
        env: {
          NODE_ENV: "test",
          PORT: String(port1),
          SHARD_INDEX: "1",
          WORKERS: "2",
          PERSISTENCE_DIR: "./data-test-shared",
        },
      }),
    );

    // Wait for both worker threads to bind to their ports
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Terminate both worker threads cleanly
    await ProcessReaper.reap();
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
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "notification" && msg.style === "error") {
            clearTimeout(timeout);
            resolve(msg);
            wsNonOwner.close();
          }
        } catch {
          // ignore
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
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "init") {
            clearTimeout(timeout);
            resolve(msg);
            wsOwner.close();
          }
        } catch {
          // ignore
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
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "notification" && msg.style === "error") {
            clearTimeout(timeout);
            resolve(msg);
            wsFail.close();
          }
        } catch {
          // ignore
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
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "init") {
            clearTimeout(timeout);
            resolve(msg);
            wsSuccess.close();
          }
        } catch {
          // ignore
        }
      });

      wsSuccess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(okRes.roomId).toBe(roomForShard0);
  });

  test("asserts a worker gracefully drains its sectors to a peer on shutdown", async () => {
    // 1. We determine which room hashes to Shard 0. We know "room-98" (roomForShard0) hashes to 0.
    const testRoom = "room-98";

    // 2. Connect a client to Worker 0 (port0), dynamically creating and joining room-98.
    const wsClient = new WebSocket(`ws://localhost:${port0}`);
    const initRes = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout joining room")),
        4000,
      );
      wsClient.on("open", () => {
        wsClient.send(
          JSON.stringify({
            type: "join_room",
            roomId: testRoom,
            nickname: "Drainee",
          }),
        );
      });
      wsClient.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "init") {
            clearTimeout(timeout);
            resolve(msg);
          }
        } catch {
          // ignore
        }
      });
      wsClient.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(initRes.roomId).toBe(testRoom);

    // 3. We trigger a graceful shutdown on Worker 0 by posting "shutdown" message
    worker0.postMessage("shutdown");

    // 4. We listen for a "reconnect" signal from Worker 0
    const reconnectMsg = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for reconnect signal")),
        4000,
      );
      wsClient.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "reconnect") {
            clearTimeout(timeout);
            resolve(msg);
          }
        } catch {
          // ignore
        }
      });
    });
    expect(reconnectMsg.type).toBe("reconnect");
    wsClient.close();

    // Give the worker time to persist the galaxy state to disk and transfer the registry ownership
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // 5. Try to join testRoom on Worker 1 (port1). Since Worker 0 has shut down and transferred the room,
    // Worker 1 should now host the dynamically transferred room and load its persisted state!
    const wsClientPeer = new WebSocket(`ws://localhost:${port1}`);
    const peerRes = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout joining transferred room on peer")),
        4000,
      );
      wsClientPeer.on("open", () => {
        wsClientPeer.send(
          JSON.stringify({
            type: "join_room",
            roomId: testRoom,
            nickname: "DraineePeer",
          }),
        );
      });
      wsClientPeer.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "init") {
            clearTimeout(timeout);
            resolve(msg);
            wsClientPeer.close();
          }
        } catch {
          // ignore
        }
      });
      wsClientPeer.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(peerRes.roomId).toBe(testRoom);
  }, 10000);
});
