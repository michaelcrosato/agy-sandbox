import http from "http";
import {
  bootGameServerWorker,
  stopGameServerWorker,
} from "./testSupport/integrationHarness.js";

describe("Interactive Codex CLI Sandbox Terminal HTTP Integration Tests (SPEC-153)", () => {
  let worker;
  const port = 19185;
  const dbDir = "./data-test-sandbox-cli";

  beforeAll(async () => {
    // Boot Server Worker on custom port
    worker = await bootGameServerWorker({ port, persistenceDir: dbDir });
  }, 25000);

  afterAll(async () => {
    // Terminate worker & clean up test directories
    await stopGameServerWorker(worker, dbDir);
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

  test("should refuse to reap a PID this server did not spawn", async () => {
    // Hardening: /api/sandbox/kill must only reap process trees spawned by
    // GuestRunner, never an arbitrary attacker-chosen host PID.
    const payload = {
      pid: 99999,
    };

    const res = await sendPost("/api/sandbox/kill", payload);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("not spawned by this server");
  });

  test("should reject a missing or invalid PID before any reap attempt", async () => {
    const res = await sendPost("/api/sandbox/kill", { pid: "not-a-pid" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("Valid PID parameter is required");
  });
});
