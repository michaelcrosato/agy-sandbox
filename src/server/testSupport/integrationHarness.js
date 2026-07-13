import { Worker } from "worker_threads";
import WebSocket from "ws";
import fs from "fs";

/**
 * Boots `src/server.js` in a worker_threads Worker and resolves once the
 * server accepts WebSocket connections. Integration suites previously used
 * fixed `setTimeout` sleeps, which both wasted wall-clock time and flaked on
 * slow CI runners; polling for readiness removes that race entirely.
 *
 * @param {object} options
 * @param {number} options.port - Dedicated port for this suite.
 * @param {string} [options.persistenceDir] - Purged before boot; pass the same
 *   value to {@link stopGameServerWorker} to purge it again on teardown.
 * @param {object} [options.env] - Extra environment variables for the worker.
 * @param {number} [options.readyTimeoutMs=20000] - Max time to wait for readiness.
 * @returns {Promise<Worker>} The running server worker.
 */
export async function bootGameServerWorker({
  port,
  persistenceDir,
  env = {},
  readyTimeoutMs = 20000,
}) {
  if (persistenceDir) {
    removeDirBestEffort(persistenceDir);
  }

  // Boot the compiled server artifact. Phase 1 of the TS migration builds
  // `dist/` before the test run, and worker_threads cannot load `.ts` sources,
  // so integration suites exercise the shipped `dist/server.js`.
  const worker = new Worker(
    new URL("../../../dist/server.js", import.meta.url),
    {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        ...(persistenceDir ? { PERSISTENCE_DIR: persistenceDir } : {}),
        ...env,
      },
    },
  );

  try {
    await waitForWebSocketReady(port, readyTimeoutMs);
  } catch (err) {
    await worker.terminate();
    throw err;
  }

  return worker;
}

/**
 * Polls until a WebSocket connection to `ws://localhost:<port>` succeeds.
 *
 * @param {number} port - Port to probe.
 * @param {number} [timeoutMs=20000] - Max time to wait.
 * @returns {Promise<void>} Resolves when the server accepts connections.
 */
export async function waitForWebSocketReady(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const probe = new WebSocket(`ws://localhost:${port}`);
        const timer = setTimeout(() => {
          probe.terminate();
          reject(new Error("readiness probe timed out"));
        }, 2000);
        probe.on("open", () => {
          clearTimeout(timer);
          probe.close();
          resolve();
        });
        probe.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  throw new Error(
    `Server on port ${port} did not accept WebSocket connections within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${lastError.message})` : ""),
  );
}

/**
 * Terminates a server worker and purges its persistence directory.
 *
 * @param {Worker|null} worker - Worker returned by {@link bootGameServerWorker}.
 * @param {string} [persistenceDir] - Directory to purge after termination.
 * @returns {Promise<void>} Resolves when teardown completes.
 */
export async function stopGameServerWorker(worker, persistenceDir) {
  if (worker) {
    await worker.terminate();
  }
  if (persistenceDir) {
    removeDirBestEffort(persistenceDir);
  }
}

function removeDirBestEffort(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; leftover test dirs are gitignored
  }
}
