import { reclaimPort } from "./PortReclaimer.js";
import { ProcessSentinel } from "./ProcessSentinel.js";
import childProcess from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, "temp_port_worker.mjs");

describe("PortReclaimer (SPEC-106)", () => {
  beforeEach(() => {
    ProcessSentinel.activate();
  });

  afterEach(() => {
    ProcessSentinel.deactivate();
  });

  test("reclaimPort successfully terminates a zombie process holding the port", async () => {
    // 1. Spawn the helper process to occupy port 28196
    const child = childProcess.fork(workerPath, [], { silent: true });

    // Wait for the child process to bind to port 28196
    await new Promise((resolve) => {
      child.stdout.on("data", (data) => {
        if (data.toString().includes("READY")) {
          resolve();
        }
      });
      // Fallback delay in case stdout buffering delays notifications
      setTimeout(resolve, 800);
    });

    // Verify child is active and has a PID
    expect(child.pid).toBeGreaterThan(0);

    // 2. Call reclaimPort to self-heal and release port 28196
    const reclaimed = await reclaimPort(28196);
    expect(reclaimed).toBe(true);

    // 3. Assert child process is terminated
    expect(
      child.killed || child.signalCode === "SIGKILL" || child.exitCode !== null,
    ).toBe(true);

    // 4. Assert we can now successfully bind to port 28196 ourselves
    const testServer = http.createServer();
    const bound = await new Promise((resolve) => {
      testServer.listen(28196, () => {
        resolve(true);
      });
      testServer.on("error", () => {
        resolve(false);
      });
    });

    expect(bound).toBe(true);

    // Clean up our test server
    await new Promise((resolve) => testServer.close(resolve));
  });

  test("reclaimPort returns false if no process is occupying the port", async () => {
    const reclaimed = await reclaimPort(28197); // unused port
    expect(reclaimed).toBe(false);
  });
});
