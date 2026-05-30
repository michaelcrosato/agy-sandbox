import WebSocket from "ws";

const connectionsCount = parseInt(process.env.STRESS_CONNS || "15", 10);
const port = parseInt(process.env.STRESS_PORT || "8080", 10);
const durationMs = parseInt(process.env.STRESS_DURATION || "3000", 10);

console.log(
  `🚀 Starting Concurrency Stress-Test: spawner count = ${connectionsCount}, port = ${port}, duration = ${durationMs}ms`,
);

const clients = [];

async function spawnClient(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    let intervalTimer = null;

    ws.on("open", () => {
      try {
        ws.send(
          JSON.stringify({
            type: "join_room",
            roomId: "public",
            nickname: `StressPilot-${id}`,
          }),
        );
      } catch (_err) {
        resolve();
      }
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (_e) {
        return; // Ignore binary state frames
      }

      if (msg.type === "init") {
        // Successfully joined! Start periodic simulated actions
        intervalTimer = setInterval(() => {
          try {
            if (ws.readyState === ws.OPEN) {
              const action = Math.random();
              if (action < 0.6) {
                // Fly input
                ws.send(
                  JSON.stringify({
                    type: "input",
                    controls: {
                      isThrusting: Math.random() < 0.7,
                      turnDirection:
                        Math.random() < 0.3 ? 1 : Math.random() < 0.3 ? -1 : 0,
                      isBoosting: Math.random() < 0.2,
                    },
                  }),
                );
              } else if (action < 0.8) {
                // Send chat
                ws.send(
                  JSON.stringify({
                    type: "chat",
                    text: `Concurrently stress-testing from pilot ${id}!`,
                  }),
                );
              } else {
                // Perform planetary trades
                ws.send(
                  JSON.stringify({
                    type: "trade",
                    planetName: "Sol Prime",
                    commodity: "ore",
                    amount: 1,
                    buy: Math.random() < 0.5,
                  }),
                );
              }
            }
          } catch (_err) {
            // Defensively swallow loop connection failures
          }
        }, 100);

        clients.push({ ws, timer: intervalTimer });
        resolve();
      }
    });

    ws.on("error", () => {
      resolve(); // Defensively resolve on handshake failures
    });

    ws.on("close", () => {
      if (intervalTimer) {
        clearInterval(intervalTimer);
      }
    });
  });
}

// Spawn all clients concurrently
const spawnPromises = [];
for (let i = 0; i < connectionsCount; i++) {
  spawnPromises.push(spawnClient(i));
}

await Promise.all(spawnPromises);
console.log(
  `✅ All ${clients.length} stress-test clients connected and executing action loops!`,
);

// Wait for stress-test duration
await new Promise((resolve) => setTimeout(resolve, durationMs));

// Teardown
console.log("🧹 Tearing down stress-test clients...");
for (const c of clients) {
  try {
    if (c.timer) {
      clearInterval(c.timer);
    }
    if (
      c.ws.readyState === WebSocket.OPEN ||
      c.ws.readyState === WebSocket.CONNECTING
    ) {
      c.ws.close();
    }
  } catch (_err) {
    // Ignore close errors during teardown
  }
}

console.log("🛑 Concurrency Stress-Test completed cleanly.");
