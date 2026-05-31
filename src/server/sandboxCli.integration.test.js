import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";

describe("Interactive Codex CLI Sandbox Terminal HTTP Integration Tests (SPEC-153)", () => {
  let worker;
  const port = 19185;
  const dbDir = "./data-test-sandbox-cli";

  beforeAll(async () => {
    // Purge test directories
    try {
      fs.rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Boot Server Worker on custom port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: dbDir,
      },
    });

    // Wait for the worker to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Terminate worker
    if (worker) {
      await worker.terminate();
    }

    // Clean up test directories
    try {
      fs.rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const sendPost = (pathUrl, payload) => {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path: pathUrl,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body ? JSON.parse(body) : null,
            });
          });
        },
      );

      req.on("error", (err) => reject(err));
      req.write(postData);
      req.end();
    });
  };

  test("should successfully execute code inside the sandboxed Guest isolator and capture stdout", async () => {
    const payload = {
      code: `console.log("INTERACTIVE_CLI_TEST_SUCCESS");`,
    };

    const res = await sendPost("/api/sandbox/execute", payload);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe("success");
    expect(res.body.stdout).toContain("INTERACTIVE_CLI_TEST_SUCCESS");
  });

  test("should block and reject non-string code executions", async () => {
    const payload = {
      code: 12345,
    };

    const res = await sendPost("/api/sandbox/execute", payload);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("Code parameter is required");
  });

  test("should gracefully handle runtime execution errors inside the sandbox", async () => {
    const payload = {
      code: `throw new Error("MOCK_CLI_CRASH");`,
    };

    const res = await sendPost("/api/sandbox/execute", payload);
    expect(res.statusCode).toBe(200); // the endpoint returns 200 and details the error inside body
    expect(res.body.status).toBe("error");
    expect(res.body.error).toContain("MOCK_CLI_CRASH");
  });

  test("should support forcefully reaping a running process via the sandbox/kill endpoint", async () => {
    // Call the kill endpoint with a mock PID.
    // Even if PID doesn't exist, ProcessReaper gracefully returns on Windows/Linux.
    const payload = {
      pid: 99999,
    };

    const res = await sendPost("/api/sandbox/kill", payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("forcefully reaped");
  });
});
