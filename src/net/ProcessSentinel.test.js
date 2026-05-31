import {
  ProcessSentinel,
  validateCommand,
  parseCommandString,
} from "./ProcessSentinel.js";
import childProcess from "child_process";

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
});
