import { Worker } from "worker_threads";
import http from "http";
import fs from "fs";
import path from "path";

describe("Dynamic Egress Firewall Admin HTTP Integration Tests (SPEC-137)", () => {
  let worker;
  const port = 18194;
  let originalConfigContent = "";
  const configPath = path.resolve("plan/config.json");

  beforeAll(async () => {
    // Backup original config.json content
    if (fs.existsSync(configPath)) {
      originalConfigContent = fs.readFileSync(configPath, "utf-8");
    }

    // Purge test directories
    try {
      fs.rmSync("./data-test-firewall-admin", {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }

    // Ensure codex.json exists
    const codexPath = path.resolve("plan/codex.json");
    if (!fs.existsSync(codexPath)) {
      fs.writeFileSync(
        codexPath,
        JSON.stringify({ stats: { totalLoc: 15600 } }),
        "utf8",
      );
    }

    // Boot Worker on custom port
    worker = new Worker(new URL("../server.js", import.meta.url), {
      env: {
        NODE_ENV: "test",
        PORT: String(port),
        SHARD_INDEX: "0",
        WORKERS: "1",
        PERSISTENCE_DIR: "./data-test-firewall-admin",
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

    // Restore original config.json
    if (originalConfigContent) {
      fs.writeFileSync(configPath, originalConfigContent, "utf-8");
    }

    // Clean up test directories
    try {
      fs.rmSync("./data-test-firewall-admin", {
        recursive: true,
        force: true,
      });
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

      req.on("error", reject);
      req.write(postData);
      req.end();
    });
  };

  test("OPTIONS /api/firewall/rules returns 204 CORS preflight", () => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path: "/api/firewall/rules",
          method: "OPTIONS",
        },
        (res) => {
          expect(res.statusCode).toBe(204);
          expect(res.headers["access-control-allow-origin"]).toBe("*");
          expect(res.headers["access-control-allow-methods"]).toContain("POST");
          resolve();
        },
      );
      req.on("error", reject);
      req.end();
    });
  });

  test("POST /api/firewall/rules whitelists and then blocks a domain successfully", async () => {
    const testDomain = "sandbox-integration-test-sentry.com";

    // 1. Whitelist domain
    const allowRes = await sendPost("/api/firewall/rules", {
      action: "allow",
      domain: testDomain,
    });
    if (allowRes.statusCode !== 200) {
      console.error("DEBUG - allowRes status is not 200:", allowRes);
    }
    expect(allowRes.statusCode).toBe(200);
    expect(allowRes.body.success).toBe(true);
    expect(allowRes.body.allowlistDomains).toContain(testDomain);

    // Verify config.json on disk includes the domain
    const configContent1 = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(configContent1.sandboxFirewall.allowlistDomains).toContain(
      testDomain,
    );

    // 2. Block domain
    const blockRes = await sendPost("/api/firewall/rules", {
      action: "block",
      domain: testDomain,
    });
    expect(blockRes.statusCode).toBe(200);
    expect(blockRes.body.success).toBe(true);
    expect(blockRes.body.allowlistDomains).not.toContain(testDomain);

    // Verify config.json on disk removes the domain
    const configContent2 = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(configContent2.sandboxFirewall.allowlistDomains).not.toContain(
      testDomain,
    );
  });

  test("POST /api/firewall/rules rejects invalid payloads", async () => {
    // Invalid action
    const res1 = await sendPost("/api/firewall/rules", {
      action: "invalid_action",
      domain: "example.com",
    });
    expect(res1.statusCode).toBe(400);
    expect(res1.body.error).toContain("Action must be 'allow' or 'block'");

    // Missing domain
    const res2 = await sendPost("/api/firewall/rules", {
      action: "allow",
    });
    expect(res2.statusCode).toBe(400);
    expect(res2.body.error).toContain("Domain parameter is required");

    // Invalid domain name format
    const res3 = await sendPost("/api/firewall/rules", {
      action: "allow",
      domain: "invalid-domain-no-extension",
    });
    expect(res3.statusCode).toBe(400);
    expect(res3.body.error).toContain("Invalid domain name format");
  });
});
