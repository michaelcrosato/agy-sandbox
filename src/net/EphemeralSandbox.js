import fs from "fs";
import path from "path";
import childProcess from "child_process";
import { ProcessSentinel } from "./ProcessSentinel.js";

/**
 * EphemeralSandbox (spec 115) — copy-on-write virtual workspace sandboxing cloner.
 * Provisions strictly-contained transient workspaces and restricts file mutations.
 */
export class EphemeralSandbox {
  /**
   * @param {Object} [config]
   * @param {string} [config.worktreeDir="./.sandbox-worktrees"] - Directory hosting temporary sandbox workspaces.
   * @param {string} [config.runId] - Custom unique run ID, otherwise auto-generated.
   */
  constructor({ worktreeDir = "./.sandbox-worktrees", runId = null } = {}) {
    this.worktreeDir = path.resolve(worktreeDir);
    this.runId =
      runId ||
      `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.sandboxDir = path.join(this.worktreeDir, this.runId);
    this.isActive = false;
  }

  /**
   * Provisions a new ephemeral directory copying only the git-tracked files in the workspace.
   * Runs fast copy routines by completely bypassing untracked directories (node_modules, .git, temp data).
   * @returns {Promise<string>} The path to the created sandbox directory.
   */
  async create() {
    // 1. Ensure sandbox worktree parent exists
    fs.mkdirSync(this.worktreeDir, { recursive: true });

    // 2. Query all git-tracked files in the current workspace (pure list, ignores ignored files)
    const trackedFiles = childProcess
      .execSync("git ls-files", { encoding: "utf8" })
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    // 3. Copy each tracked file dynamically preserving the structure
    for (const file of trackedFiles) {
      const sourcePath = path.resolve(file);
      const targetPath = path.join(this.sandboxDir, file);

      // Skip the sandbox directory itself if it's somehow git-tracked
      if (!targetPath.startsWith(path.resolve(this.sandboxDir))) {
        continue;
      }

      // Ensure parent subdirectory exists in target
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }

    console.log(
      `📦 EphemeralSandbox [${this.runId}]: Successfully provisioned at ${this.sandboxDir}`,
    );
    return this.sandboxDir;
  }

  /**
   * Activates ProcessSentinel containment and strictly binds all file operations to the sandbox directory.
   */
  activate() {
    if (this.isActive) return;

    // Ensure the sandbox dir exists
    if (!fs.existsSync(this.sandboxDir)) {
      throw new Error(
        `Cannot activate EphemeralSandbox: path [${this.sandboxDir}] does not exist. Call create() first.`,
      );
    }

    // Set ProcessSentinel boundaries
    ProcessSentinel.activate();
    ProcessSentinel.setSandboxDirectory(this.sandboxDir);
    this.isActive = true;
    console.log(
      `🔒 EphemeralSandbox [${this.runId}]: Active with absolute file system containment!`,
    );
  }

  /**
   * Restores normal file system operations and lifts ProcessSentinel bounds.
   */
  deactivate() {
    if (!this.isActive) return;
    ProcessSentinel.clearSandboxDirectory();
    ProcessSentinel.deactivate();
    this.isActive = false;
    console.log(
      `🔓 EphemeralSandbox [${this.runId}]: Deactivated boundary containment.`,
    );
  }

  /**
   * Completely purges the ephemeral workspace directory from disk.
   */
  cleanup() {
    this.deactivate();
    if (fs.existsSync(this.sandboxDir)) {
      fs.rmSync(this.sandboxDir, { recursive: true, force: true });
      console.log(
        `🧹 EphemeralSandbox [${this.runId}]: Cleaned up and deleted sandbox workspace.`,
      );
    }
  }
}
