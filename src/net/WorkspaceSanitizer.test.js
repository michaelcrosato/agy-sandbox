import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("WorkspaceSanitizer (SPEC-093)", () => {
  const repoRoot = path.resolve(process.cwd());

  // Helper to create directories recursively if they don't exist
  const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  };

  test("sweeps untracked temp files and directories while protecting plan and ledger files", () => {
    // 1. Set up temp folders and files that should be cleaned
    const tempTestDir = path.join(repoRoot, "data-test-temp-sanitize-spec");
    const tempVitestDir = path.join(repoRoot, ".vitest-attachments");
    const tempCommitMsgFile = path.join(repoRoot, ".git-commit-msg.txt");
    const tempNpmDebugLog = path.join(repoRoot, "npm-debug.log.123");

    ensureDir(tempTestDir);
    ensureDir(tempVitestDir);

    fs.writeFileSync(path.join(tempTestDir, "dummy.txt"), "test content");
    fs.writeFileSync(
      path.join(tempVitestDir, "screenshot.png"),
      "image content",
    );
    fs.writeFileSync(tempCommitMsgFile, "commit msg content");
    fs.writeFileSync(tempNpmDebugLog, "error content");

    // 2. Set up plan and log files that MUST be preserved
    // (We will use the actual files since they are active, but let's make sure they exist first)
    const planFile = path.join(repoRoot, "plan", "STATE.md");
    const ledgerFile = path.join(repoRoot, "docs", "LOG.md");

    expect(fs.existsSync(planFile)).toBe(true);
    expect(fs.existsSync(ledgerFile)).toBe(true);

    // Get the initial content of the plan and ledger to verify they are untouched
    const initialPlanContent = fs.readFileSync(planFile, "utf8");
    const initialLedgerContent = fs.readFileSync(ledgerFile, "utf8");

    // 3. Execute the sanitization PowerShell script
    const scriptPath = path.join(
      repoRoot,
      "scripts",
      "agent",
      "workspace-sanitize.ps1",
    );
    const cmd =
      process.platform === "win32"
        ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`
        : `pwsh -NoProfile -File "${scriptPath}"`;

    let output;
    try {
      output = execSync(cmd, { encoding: "utf8" });
    } catch (err) {
      console.error("Execution failed:", err.stdout, err.stderr);
      throw err;
    }

    expect(output).toContain(
      "[WORKSPACE-SANITIZE] Workspace sanitization complete.",
    );

    // 4. Verify that temp folders and files are GONE
    expect(fs.existsSync(tempTestDir)).toBe(false);
    expect(fs.existsSync(tempVitestDir)).toBe(false);
    expect(fs.existsSync(tempCommitMsgFile)).toBe(false);
    expect(fs.existsSync(tempNpmDebugLog)).toBe(false);

    // 5. Verify that protected files are kept strictly INTACT
    expect(fs.existsSync(planFile)).toBe(true);
    expect(fs.existsSync(ledgerFile)).toBe(true);
    expect(fs.readFileSync(planFile, "utf8")).toBe(initialPlanContent);
    expect(fs.readFileSync(ledgerFile, "utf8")).toBe(initialLedgerContent);
  });
});
