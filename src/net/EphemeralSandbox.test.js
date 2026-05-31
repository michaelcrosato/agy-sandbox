import fs from "fs";
import path from "path";
import { EphemeralSandbox } from "./EphemeralSandbox.js";
import { ProcessSentinel } from "./ProcessSentinel.js";

describe("EphemeralSandbox copy-on-write workspace & containment (spec 115)", () => {
  let sandbox;
  let testRoot;

  beforeAll(() => {
    process.env.TEST_SENTINEL_FORCE = "true";
    testRoot = path.resolve("./.sandbox-worktrees-test");
    // Ensure any stale test directories are removed
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    if (sandbox) {
      sandbox.cleanup();
    }
    // Restore sentinel
    ProcessSentinel.deactivate();
    ProcessSentinel.clearSandboxDirectory();
  });

  afterAll(() => {
    delete process.env.TEST_SENTINEL_FORCE;
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("provisions ephemeral workspace copying tracked files", async () => {
    sandbox = new EphemeralSandbox({ worktreeDir: testRoot });
    const sandboxDir = await sandbox.create();

    expect(fs.existsSync(sandboxDir)).toBe(true);
    // Verify that standard tracked files like package.json were copied
    expect(fs.existsSync(path.join(sandboxDir, "package.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(sandboxDir, "src/net/ProcessSentinel.js")),
    ).toBe(true);
  });

  test("enforces absolute file system containment under active sandbox", async () => {
    sandbox = new EphemeralSandbox({ worktreeDir: testRoot });
    const sandboxDir = await sandbox.create();

    sandbox.activate();

    // 1. Write INSIDE the sandbox must succeed
    const okPath = path.join(sandboxDir, "test-file-ok.txt");
    expect(() => {
      fs.writeFileSync(okPath, "hello inside sandbox");
    }).not.toThrow();
    expect(fs.readFileSync(okPath, "utf8")).toBe("hello inside sandbox");

    // 2. Write OUTSIDE the sandbox must throw security access denied exception
    const failPath = path.resolve("./test-file-escaped.txt");
    expect(() => {
      fs.writeFileSync(failPath, "trying to escape sandbox");
    }).toThrow(/SECURITY ACCESS DENIED/);

    expect(fs.existsSync(failPath)).toBe(false);
  });

  test("lifts containment and allows normal operations post deactivation", async () => {
    sandbox = new EphemeralSandbox({ worktreeDir: testRoot });
    await sandbox.create();

    sandbox.activate();
    sandbox.deactivate();

    // Normal file creation outside sandbox must succeed now
    const testPath = path.resolve(
      "./.sandbox-worktrees-test/temp-normal-file.txt",
    );
    fs.mkdirSync(path.dirname(testPath), { recursive: true });

    expect(() => {
      fs.writeFileSync(testPath, "normal write");
    }).not.toThrow();

    expect(fs.readFileSync(testPath, "utf8")).toBe("normal write");
    fs.unlinkSync(testPath);
  });

  test("purges and deletes sandbox directory cleanly during cleanup", async () => {
    sandbox = new EphemeralSandbox({ worktreeDir: testRoot });
    const sandboxDir = await sandbox.create();

    expect(fs.existsSync(sandboxDir)).toBe(true);

    sandbox.cleanup();

    expect(fs.existsSync(sandboxDir)).toBe(false);
  });
});
