/**
 * WorkspaceDriftSentry.js (SPEC-146)
 * Workspace Drift Auditing Sentinel & Integrity Self-Healer.
 *
 * Takes baseline copy-on-write directory snapshots and purges untracked file leaks
 * or modifications post-execution, preserving environment purity.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

/**
 * Computes a fast SHA-256 hash of a file's content on disk.
 * @param {string} filePath - Absolute path to the file.
 * @returns {string} The computed hash.
 */
function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Recursively scans a directory and compiles a list of absolute paths.
 * @param {string} dir - Absolute directory path.
 * @returns {string[]} List of absolute file paths.
 */
function scanDirRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...scanDirRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Workspace Snapshot Drift Auditor & Copy-On-Write Self-Healing Restoration (SPEC-146).
 */
export const WorkspaceDriftSentry = {
  // Cumulative counters
  totalSelfHeals: 0,
  totalFilesRestoredOrPurged: 0,
  /**
   * Captures an in-memory snapshot of the given sandbox directory.
   * @param {string} sandboxDir - Absolute path to the active sandbox workspace.
   * @returns {Object} Mapping of relative path to metadata { hash, size }.
   */
  takeSnapshot(sandboxDir) {
    const resolvedDir = path.resolve(sandboxDir);
    const files = scanDirRecursive(resolvedDir);
    const snapshot = {};

    for (const file of files) {
      const relPath = path.relative(resolvedDir, file).replace(/\\/g, "/");
      const stat = fs.statSync(file);
      snapshot[relPath] = {
        hash: computeFileHash(file),
        size: stat.size,
      };
    }

    return snapshot;
  },

  /**
   * Audits the active sandbox directory against the baseline snapshot.
   * @param {string} sandboxDir - Absolute path to sandbox.
   * @param {Object} snapshot - Baseline snapshot.
   * @returns {Object} Drift report { added, modified, deleted, driftedBytes }.
   */
  auditDrift(sandboxDir, snapshot) {
    const resolvedDir = path.resolve(sandboxDir);
    const currentFiles = scanDirRecursive(resolvedDir);
    const currentRelFiles = new Set(
      currentFiles.map((f) =>
        path.relative(resolvedDir, f).replace(/\\/g, "/"),
      ),
    );

    const added = [];
    const modified = [];
    const deleted = [];
    let driftedBytes = 0;

    // Check for added or modified files
    for (const relPath of currentRelFiles) {
      const fullPath = path.join(resolvedDir, relPath);
      const baseline = snapshot[relPath];

      if (!baseline) {
        // File did not exist in baseline snapshot -> ADDED
        const stat = fs.statSync(fullPath);
        added.push(relPath);
        driftedBytes += stat.size;
      } else {
        // File exists in baseline -> check size and hash for modification
        const stat = fs.statSync(fullPath);
        const currentHash = computeFileHash(fullPath);
        if (stat.size !== baseline.size || currentHash !== baseline.hash) {
          modified.push(relPath);
          driftedBytes += Math.abs(stat.size - baseline.size);
        }
      }
    }

    // Check for deleted files
    for (const relPath of Object.keys(snapshot)) {
      if (!currentRelFiles.has(relPath)) {
        deleted.push(relPath);
        driftedBytes += snapshot[relPath].size;
      }
    }

    return {
      added,
      modified,
      deleted,
      driftedBytes,
    };
  },

  /**
   * Purges file leaks and restores baseline files in sandboxDir.
   * @param {string} sandboxDir - Absolute path to sandbox.
   * @param {Object} driftReport - Audit drift report.
   * @param {string} baselineDir - Absolute path to baseline (e.g. process.cwd()).
   * @returns {number} The count of files restored/purged.
   */
  selfHeal(sandboxDir, driftReport, baselineDir = process.cwd()) {
    const resolvedDir = path.resolve(sandboxDir);
    const resolvedBaseline = path.resolve(baselineDir);
    let selfHealCount = 0;

    // 1. Purge all added untracked file leaks
    for (const relPath of driftReport.added) {
      const baseName = path.basename(relPath);
      if (
        baseName === "security_audit_child.json" ||
        baseName.startsWith("security_audit_")
      ) {
        continue;
      }
      const fullPath = path.join(resolvedDir, relPath);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          selfHealCount++;
        }
      } catch {
        // graceful degrade
      }
    }

    // 2. Restore modified and deleted files from baseline
    const toRestore = [...driftReport.modified, ...driftReport.deleted];
    for (const relPath of toRestore) {
      const sourcePath = path.join(resolvedBaseline, relPath);
      const targetPath = path.join(resolvedDir, relPath);

      try {
        if (fs.existsSync(sourcePath)) {
          // Ensure parent directory exists in target
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.copyFileSync(sourcePath, targetPath);
          selfHealCount++;
        }
      } catch {
        // graceful degrade
      }
    }

    // Log drift security violation to central registry
    if (
      driftReport.added.length > 0 ||
      driftReport.modified.length > 0 ||
      driftReport.deleted.length > 0
    ) {
      this.totalSelfHeals++;
      this.totalFilesRestoredOrPurged += selfHealCount;
      SandboxSecurityRegistry.logViolation("filesystem", "workspace_drift", {
        sandboxDir,
        addedCount: driftReport.added.length,
        modifiedCount: driftReport.modified.length,
        deletedCount: driftReport.deleted.length,
        driftedBytes: driftReport.driftedBytes,
        selfHealCount,
      });
    }

    return selfHealCount;
  },
};
