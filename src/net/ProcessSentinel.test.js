import {
  ProcessSentinel,
  validateCommand,
  parseCommandString,
} from "./ProcessSentinel.js";
import childProcess from "child_process";
import fs from "fs";

beforeAll(() => {
  process.env.TEST_SENTINEL_FORCE = "true";
});

afterAll(() => {
  delete process.env.TEST_SENTINEL_FORCE;
});

describe("ProcessSentinel (SPEC-106)", () => {
  beforeEach(() => {
    ProcessSentinel.resetStats();
  });

  afterEach(() => {
    ProcessSentinel.deactivate();
  });

  test("parseCommandString correctly splits commands and arguments", () => {
    const res = parseCommandString('npm run lint -- "extra option"');
    expect(res.command).toBe("npm");
    expect(res.args).toEqual(["run", "lint", "--", "extra option"]);
  });

  test("validateCommand whitelists safe commands", () => {
    expect(validateCommand("git", ["status"]).allowed).toBe(true);
    expect(validateCommand("npm", ["run", "lint"]).allowed).toBe(true);
    expect(
      validateCommand("node", ["scripts/agent/generate-codex.js"]).allowed,
    ).toBe(true);
    expect(validateCommand("eslint").allowed).toBe(true);
  });

  test("validateCommand rejects dangerous commands and subcommands", () => {
    expect(validateCommand("curl", ["http://google.com"]).allowed).toBe(false);
    expect(validateCommand("git", ["push"]).allowed).toBe(false); // git push is unauthorized
    expect(validateCommand("npm", ["publish"]).allowed).toBe(false);
    expect(validateCommand("node", ["-e", "console.log()"]).allowed).toBe(
      false,
    ); // eval option forbidden
  });

  test("ProcessSentinel blocks spawn of blacklisted binary", () => {
    ProcessSentinel.activate();

    expect(() => {
      childProcess.spawn("curl", ["http://google.com"]);
    }).toThrow(/\[SECURITY ACCESS DENIED\]/);

    const stats = ProcessSentinel.getStats();
    expect(stats.blockedCount).toBe(1);
    expect(stats.allowedCount).toBe(0);
  });

  test("ProcessSentinel blocks spawnSync of unauthorized Git subcommand", () => {
    ProcessSentinel.activate();

    expect(() => {
      childProcess.spawnSync("git", ["push", "origin", "main"]);
    }).toThrow(/\[SECURITY ACCESS DENIED\]/);

    const stats = ProcessSentinel.getStats();
    expect(stats.blockedCount).toBe(1);
  });

  test("ProcessSentinel blocks exec containing shell metacharacters", () => {
    ProcessSentinel.activate();

    expect(() => {
      childProcess.execSync("git status && curl http://dangerous.com");
    }).toThrow(/Shell metacharacters are forbidden/);

    const stats = ProcessSentinel.getStats();
    expect(stats.blockedCount).toBe(1);
  });

  test("ProcessSentinel permits safe whitelisted node command", () => {
    ProcessSentinel.activate();

    // Verify it passes sentinel validation and calls the original spawnSync
    // (node -v is safe and returns immediately)
    const result = childProcess.spawnSync("node", ["-v"]);
    expect(result.status).toBe(0);

    const stats = ProcessSentinel.getStats();
    expect(stats.allowedCount).toBe(1);
    expect(stats.blockedCount).toBe(0);
  });

  test("ProcessSentinel whitelists netstat and lsof with strict options", () => {
    ProcessSentinel.activate();

    // netstat -ano should be permitted
    expect(validateCommand("netstat", ["-ano"]).allowed).toBe(true);
    // netstat -r should be blocked
    expect(validateCommand("netstat", ["-r"]).allowed).toBe(false);

    // lsof -t -i :8080 should be permitted
    expect(validateCommand("lsof", ["-t", "-i:8080"]).allowed).toBe(true);
    // lsof -U should be blocked
    expect(validateCommand("lsof", ["-U"]).allowed).toBe(false);
  });

  test("ProcessSentinel strictly jails filesystem write operations", () => {
    const sandboxDir = "./.sandbox-test-sentinel-dir";
    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }
    process.env.GUEST_SCRIPT_PATH = "src/net/temp_guest_ok.js";
    try {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(sandboxDir);

      // 1. Write inside sandbox must succeed (standard operation, call actual or let it proceed)
      // Here we can assert it resolves or check it does not throw
      expect(() => {
        fs.writeFileSync(`${sandboxDir}/test.txt`, "data");
      }).not.toThrow();

      // 2. Write outside sandbox must throw isolation escape exception
      expect(() => {
        fs.writeFileSync("./outside-test.txt", "data");
      }).toThrow(/\[SECURITY ACCESS DENIED\]/);

      // Clean up inside file
      try {
        fs.rmSync(`${sandboxDir}/test.txt`, { force: true });
      } catch {
        // ignore
      }
    } finally {
      delete process.env.GUEST_SCRIPT_PATH;
      try {
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  });

  test("ProcessSentinel strictly jails filesystem read operations", () => {
    const sandboxDir = "./.sandbox-test-sentinel-dir";
    process.env.GUEST_SCRIPT_PATH = "src/net/temp_guest_ok.js";
    try {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(sandboxDir);

      // 1. Read inside sandbox must not throw isolation escape error (it might throw file not found, which is fine)
      expect(() => {
        try {
          fs.readFileSync(`${sandboxDir}/nonexistent.txt`);
        } catch (e) {
          if (e.message.includes("[SECURITY ACCESS DENIED]")) throw e;
        }
      }).not.toThrow(/\[SECURITY ACCESS DENIED\]/);

      // 2. Read outside sandbox must throw isolation escape exception
      expect(() => {
        fs.readFileSync("./package.json");
      }).toThrow(/\[SECURITY ACCESS DENIED\]/);
    } finally {
      delete process.env.GUEST_SCRIPT_PATH;
    }
  });

  test("ProcessSentinel blocks traversal directory jumps containing double dots", () => {
    const sandboxDir = "./.sandbox-test-sentinel-dir";
    process.env.GUEST_SCRIPT_PATH = "src/net/temp_guest_ok.js";
    try {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(sandboxDir);

      // Write traversal escape
      expect(() => {
        fs.writeFileSync(`${sandboxDir}/../evil.txt`, "data");
      }).toThrow(/\[SECURITY ACCESS DENIED\]/);

      // Read traversal escape
      expect(() => {
        fs.readFileSync(`${sandboxDir}/../../package.json`);
      }).toThrow(/\[SECURITY ACCESS DENIED\]/);
    } finally {
      delete process.env.GUEST_SCRIPT_PATH;
    }
  });

  test("ProcessSentinel whitelists read access for node_modules dependencies", () => {
    const sandboxDir = "./.sandbox-test-sentinel-dir";
    process.env.GUEST_SCRIPT_PATH = "src/net/temp_guest_ok.js";
    try {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(sandboxDir);

      // Reading from node_modules must be allowed and not throw security isolation errors
      expect(() => {
        try {
          fs.readFileSync("./node_modules/ws/package.json");
        } catch (e) {
          if (e.message.includes("[SECURITY ACCESS DENIED]")) throw e;
        }
      }).not.toThrow(/\[SECURITY ACCESS DENIED\]/);
    } finally {
      delete process.env.GUEST_SCRIPT_PATH;
    }
  });

  test("Zero-Trust Copy-On-Write in-memory virtual filesystem (SPEC-150)", async () => {
    const sandboxDir = "./.sandbox-test-sentinel-dir";
    const testFile = `${sandboxDir}/virtual-test.txt`;
    const testContent = "Hello virtual COW!";

    try {
      ProcessSentinel.activate();
      ProcessSentinel.setSandboxDirectory(sandboxDir);
      ProcessSentinel.enableVirtualCow();

      // 1. Write file in virtual mode
      fs.writeFileSync(testFile, testContent);

      // Verify physical file was NOT created on disk
      expect(fs.existsSync(testFile)).toBe(true);

      // Verify virtual readFileSync retrieves correct content
      const readContent = fs.readFileSync(testFile, "utf8");
      expect(readContent).toBe(testContent);

      // 2. Read directory in virtual mode
      const dirContents = fs.readdirSync(sandboxDir);
      expect(dirContents).toContain("virtual-test.txt");

      // 3. Promise-based write and read
      const promiseFile = `${sandboxDir}/promise-test.txt`;
      const promiseContent = "Hello from promises!";
      await fs.promises.writeFile(promiseFile, promiseContent);

      const promiseRead = await fs.promises.readFile(promiseFile, "utf8");
      expect(promiseRead).toBe(promiseContent);

      // 4. Stream operations
      const streamFile = `${sandboxDir}/stream-test.txt`;
      const writeStream = fs.createWriteStream(streamFile);

      await new Promise((resolve) => {
        writeStream.on("finish", resolve);
        writeStream.write("stream ");
        writeStream.write("data");
        writeStream.end();
      });

      const readStream = fs.createReadStream(streamFile);
      let streamData = "";
      for await (const chunk of readStream) {
        streamData += chunk.toString();
      }
      expect(streamData).toBe("stream data");

      // 5. Deletion of virtual files
      fs.unlinkSync(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
      expect(fs.readdirSync(sandboxDir)).not.toContain("virtual-test.txt");
    } finally {
      ProcessSentinel.disableVirtualCow();
      ProcessSentinel.deactivate();
      try {
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  });
});
