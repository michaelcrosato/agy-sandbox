/**
 * ProcessSentinel.js (spec 106) — strict guest containment sentinel that
 * monkey-patches Node's child_process methods to enforce a strict whitelist,
 * preventing malicious process escapes and unauthorized network egress.
 */

import childProcess from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ProcessReaper } from "./ProcessReaper.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

// Store original native child_process functions
const originalSpawn = childProcess.spawn;
const originalSpawnSync = childProcess.spawnSync;
const originalFork = childProcess.fork;
const originalExec = childProcess.exec;
const originalExecSync = childProcess.execSync;
const originalExecFile = childProcess.execFile;
const originalExecFileSync = childProcess.execFileSync;

// Store original native fs functions
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const originalMkdir = fs.mkdir;
const originalMkdirSync = fs.mkdirSync;
const originalRm = fs.rm;
const originalRmSync = fs.rmSync;
const originalUnlink = fs.unlink;
const originalUnlinkSync = fs.unlinkSync;
const originalRename = fs.rename;
const originalRenameSync = fs.renameSync;
const originalCreateWriteStream = fs.createWriteStream;

// Store original promises fs functions
const originalPromisesWriteFile = fs.promises ? fs.promises.writeFile : null;
const originalPromisesMkdir = fs.promises ? fs.promises.mkdir : null;
const originalPromisesRm = fs.promises ? fs.promises.rm : null;
const originalPromisesUnlink = fs.promises ? fs.promises.unlink : null;
const originalPromisesRename = fs.promises ? fs.promises.rename : null;

let isPatched = false;
let activeSandboxDir = null;

const stats = {
  allowedCount: 0,
  blockedCount: 0,
};

/**
 * Asserts that the given file path resides strictly within the active sandbox containment directory.
 * Throws a security boundary isolation error if an escape is detected.
 * @param {any} filePath - Path to check.
 */
function checkPath(filePath) {
  if (!activeSandboxDir || !filePath) return;
  let pStr;
  if (filePath instanceof URL) {
    pStr = fileURLToPath(filePath);
  } else if (typeof filePath === "string") {
    pStr = filePath;
  } else {
    pStr = String(filePath);
  }
  const resolved = path.resolve(pStr);
  if (!resolved.startsWith(activeSandboxDir)) {
    stats.blockedCount++;
    const errMsg = `[SECURITY ACCESS DENIED] Isolation boundary escape attempt detected: path [${resolved}] is outside sandboxed directory [${activeSandboxDir}]`;
    SandboxSecurityRegistry.logViolation("filesystem", "fs_access", {
      path: resolved,
      sandboxDir: activeSandboxDir,
      reason: errMsg,
    });
    throw new Error(errMsg);
  }
}

/**
 * Logs a process sentinel whitelisting violation.
 * @param {string} command
 * @param {string[]} args
 * @param {string} reason
 */
function logProcessBlock(command, args, reason) {
  SandboxSecurityRegistry.logViolation("process", command, {
    args,
    reason,
  });
}

/**
 * Parsed representation of a command.
 * @typedef {object} ParsedCommand
 * @property {string} command - Command name/binary.
 * @property {string[]} args - Array of command line arguments.
 */

/**
 * Parses a full command string into a binary name and an array of arguments,
 * respecting basic quotes.
 * @param {string} cmdStr - Full shell command string.
 * @returns {ParsedCommand}
 */
export function parseCommandString(cmdStr) {
  if (!cmdStr || typeof cmdStr !== "string") {
    return { command: "", args: [] };
  }

  const tokens = [];
  let currentToken = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];
    if ((char === '"' || char === "'") && (i === 0 || cmdStr[i - 1] !== "\\")) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
    } else if (char === " " && !inQuotes) {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = "";
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken.length > 0) {
    tokens.push(currentToken);
  }

  return {
    command: tokens[0] || "",
    args: tokens.slice(1),
  };
}

/**
 * Validates whether a command and its arguments are permitted under the strict security whitelist.
 * @param {string} command - The command or binary path under evaluation.
 * @param {string[]} [args=[]] - Optional array of arguments passed to the command.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateCommand(command, args = []) {
  if (!command || typeof command !== "string") {
    return { allowed: false, reason: "Command must be a non-empty string" };
  }

  // Extract base binary name (e.g. 'C:\git\bin\git.exe' or '/usr/bin/git' -> 'git')
  const baseBinary = command
    .split(/[/\\]/)
    .pop()
    .toLowerCase()
    .replace(/\.exe$/, "");

  const allowedBinaries = new Set([
    "git",
    "npm",
    "node",
    "eslint",
    "prettier",
    "tsc",
    "netstat",
    "lsof",
  ]);
  if (!allowedBinaries.has(baseBinary)) {
    return {
      allowed: false,
      reason: `Binary [${baseBinary}] is not in the sandbox whitelist`,
    };
  }

  // 1. Git Command Guardrails
  if (baseBinary === "git") {
    const allowedGitSubcommands = new Set([
      "status",
      "add",
      "commit",
      "restore",
      "diff",
      "ls-files",
    ]);
    const sub = args[0];
    if (!sub || !allowedGitSubcommands.has(sub)) {
      return {
        allowed: false,
        reason: `Git subcommand [${sub || ""}] is unauthorized`,
      };
    }
  }

  // 2. Npm Command Guardrails
  if (baseBinary === "npm") {
    const allowedNpmArgs = new Set(["run", "test", "ci", "install"]);
    const sub = args[0];
    if (!sub || !allowedNpmArgs.has(sub)) {
      return {
        allowed: false,
        reason: `Npm argument [${sub || ""}] is unauthorized`,
      };
    }
  }

  // 3. Node Command Guardrails
  if (baseBinary === "node") {
    // Prevent eval or arbitrary code execution options
    const forbiddenNodeArgs = new Set([
      "-e",
      "--eval",
      "-p",
      "--print",
      "--interactive",
      "-i",
    ]);
    for (const arg of args) {
      if (forbiddenNodeArgs.has(arg)) {
        return {
          allowed: false,
          reason: `Node execution option [${arg}] is forbidden`,
        };
      }
    }
  }

  // 4. Netstat Command Guardrails (Windows Port checks)
  if (baseBinary === "netstat") {
    const sub = args[0];
    if (sub !== "-ano" && sub !== "-an") {
      return {
        allowed: false,
        reason: `Netstat option [${sub || ""}] is unauthorized`,
      };
    }
  }

  // 5. Lsof Command Guardrails (Unix Port checks)
  if (baseBinary === "lsof") {
    // Restrict strictly to -t and -i options
    for (const arg of args) {
      if (arg !== "-t" && !arg.startsWith("-i")) {
        return {
          allowed: false,
          reason: `Lsof option [${arg}] is unauthorized`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * ProcessSentinel (spec 106) — child process security sentinel whitelister.
 * @type {object}
 */
export const ProcessSentinel = {
  /**
   * Returns security statistics of monitored spawns.
   * @returns {{ allowedCount: number, blockedCount: number }}
   */
  getStats() {
    return { ...stats };
  },

  /**
   * Resets security stats.
   */
  resetStats() {
    stats.allowedCount = 0;
    stats.blockedCount = 0;
  },

  /**
   * Activates the global child_process monkey-patch sandbox containment.
   */
  activate() {
    if (isPatched) return;

    childProcess.spawn = /** @type {any} */ (
      function (command, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(command, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(command, actualArgs, validation.reason);
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        const proc = originalSpawn.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.spawnSync = /** @type {any} */ (
      function (command, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(command, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(command, actualArgs, validation.reason);
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        const proc = originalSpawnSync.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.fork = /** @type {any} */ (
      function (modulePath, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand("node", [modulePath, ...actualArgs]);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(
            "node",
            [modulePath, ...actualArgs],
            validation.reason,
          );
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        const proc = originalFork.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.exec = /** @type {any} */ (
      function (command, options, callback) {
        const actualCallback =
          typeof options === "function" ? options : callback;

        // 1. Metacharacter scan for shell injections
        const forbiddenShellChars = /[&|;><$]/;
        if (forbiddenShellChars.test(command)) {
          stats.blockedCount++;
          const reason =
            "Shell metacharacters are forbidden in sandbox execution";
          logProcessBlock(command, [], reason);
          const err = new Error(`[SECURITY ACCESS DENIED] ${reason}`);
          if (typeof actualCallback === "function") {
            actualCallback(err, "", "");
            return;
          }
          throw err;
        }

        // 2. Parse and validate command string
        const parsed = parseCommandString(command);
        const validation = validateCommand(parsed.command, parsed.args);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(parsed.command, parsed.args, validation.reason);
          const err = new Error(
            `[SECURITY ACCESS DENIED] ${validation.reason}`,
          );
          if (typeof actualCallback === "function") {
            actualCallback(err, "", "");
            return;
          }
          throw err;
        }

        stats.allowedCount++;
        const proc = originalExec.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.execSync = /** @type {any} */ (
      function (command, options) {
        const forbiddenShellChars = /[&|;><$]/;
        if (forbiddenShellChars.test(command)) {
          stats.blockedCount++;
          const reason =
            "Shell metacharacters are forbidden in sandbox execution";
          logProcessBlock(command, [], reason);
          throw new Error(`[SECURITY ACCESS DENIED] ${reason}`);
        }

        const parsed = parseCommandString(command);
        const validation = validateCommand(parsed.command, parsed.args);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(parsed.command, parsed.args, validation.reason);
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }

        stats.allowedCount++;
        const proc = originalExecSync.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.execFile = /** @type {any} */ (
      function (file, args, options, callback) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(file, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(file, actualArgs, validation.reason);
          const actualCallback =
            typeof options === "function" ? options : callback;
          const err = new Error(
            `[SECURITY ACCESS DENIED] ${validation.reason}`,
          );
          if (typeof actualCallback === "function") {
            actualCallback(err, "", "");
            return;
          }
          throw err;
        }
        stats.allowedCount++;
        const proc = originalExecFile.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    childProcess.execFileSync = /** @type {any} */ (
      function (file, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(file, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          logProcessBlock(file, actualArgs, validation.reason);
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        const proc = originalExecFileSync.apply(this, arguments);
        return ProcessReaper.registerProcess(proc);
      }
    );

    // Monkeypatch synchronous/callback fs write operations
    fs.writeFile = /** @type {any} */ (
      function (file, ...args) {
        checkPath(file);
        return originalWriteFile.apply(this, arguments);
      }
    );
    if (originalWriteFile && originalWriteFile.__promisify__) {
      fs.writeFile.__promisify__ = originalWriteFile.__promisify__;
    }

    fs.writeFileSync = function (file, ...args) {
      checkPath(file);
      return originalWriteFileSync.apply(this, arguments);
    };

    fs.mkdir = /** @type {any} */ (
      function (dir, ...args) {
        checkPath(dir);
        return originalMkdir.apply(this, arguments);
      }
    );
    if (originalMkdir && originalMkdir.__promisify__) {
      fs.mkdir.__promisify__ = originalMkdir.__promisify__;
    }

    fs.mkdirSync = function (dir, ...args) {
      checkPath(dir);
      return originalMkdirSync.apply(this, arguments);
    };

    fs.rm = /** @type {any} */ (
      function (p, ...args) {
        checkPath(p);
        return originalRm.apply(this, arguments);
      }
    );
    if (originalRm && originalRm.__promisify__) {
      fs.rm.__promisify__ = originalRm.__promisify__;
    }

    fs.rmSync = function (p, ...args) {
      checkPath(p);
      return originalRmSync.apply(this, arguments);
    };

    fs.unlink = /** @type {any} */ (
      function (p, ...args) {
        checkPath(p);
        return originalUnlink.apply(this, arguments);
      }
    );
    if (originalUnlink && originalUnlink.__promisify__) {
      fs.unlink.__promisify__ = originalUnlink.__promisify__;
    }

    fs.unlinkSync = function (p, ...args) {
      checkPath(p);
      return originalUnlinkSync.apply(this, arguments);
    };

    fs.rename = /** @type {any} */ (
      function (oldPath, newPath, ...args) {
        checkPath(oldPath);
        checkPath(newPath);
        return originalRename.apply(this, arguments);
      }
    );
    if (originalRename && originalRename.__promisify__) {
      fs.rename.__promisify__ = originalRename.__promisify__;
    }

    fs.renameSync = function (oldPath, newPath, ...args) {
      checkPath(oldPath);
      checkPath(newPath);
      return originalRenameSync.apply(this, arguments);
    };

    fs.createWriteStream = function (pathName, ...args) {
      checkPath(pathName);
      return originalCreateWriteStream.apply(this, arguments);
    };

    // Monkeypatch fs.promises if available
    if (fs.promises) {
      fs.promises.writeFile = function (file, ...args) {
        checkPath(file);
        return originalPromisesWriteFile.apply(this, arguments);
      };

      fs.promises.mkdir = function (dir, ...args) {
        checkPath(dir);
        return originalPromisesMkdir.apply(this, arguments);
      };

      fs.promises.rm = function (p, ...args) {
        checkPath(p);
        return originalPromisesRm.apply(this, arguments);
      };

      fs.promises.unlink = function (p, ...args) {
        checkPath(p);
        return originalPromisesUnlink.apply(this, arguments);
      };

      fs.promises.rename = function (oldPath, newPath, ...args) {
        checkPath(oldPath);
        checkPath(newPath);
        return originalPromisesRename.apply(this, arguments);
      };
    }

    isPatched = true;
  },

  /**
   * Sets the active sandbox containment directory. All subsequent file mutations
   * will be strictly bound within this directory.
   * @param {string} dirPath - Absolute path to sandbox.
   */
  setSandboxDirectory(dirPath) {
    if (dirPath) {
      activeSandboxDir = path.resolve(dirPath);
    } else {
      activeSandboxDir = null;
    }
  },

  /**
   * Clears the active sandbox containment directory, disabling fs boundaries.
   */
  clearSandboxDirectory() {
    activeSandboxDir = null;
  },

  /**
   * Deactivates monkey-patches and restores original native child_process and fs methods.
   */
  deactivate() {
    if (!isPatched) return;
    childProcess.spawn = originalSpawn;
    childProcess.spawnSync = originalSpawnSync;
    childProcess.fork = originalFork;
    childProcess.exec = originalExec;
    childProcess.execSync = originalExecSync;
    childProcess.execFile = originalExecFile;
    childProcess.execFileSync = originalExecFileSync;

    // Restore fs functions
    fs.writeFile = originalWriteFile;
    fs.writeFileSync = originalWriteFileSync;
    fs.mkdir = originalMkdir;
    fs.mkdirSync = originalMkdirSync;
    fs.rm = originalRm;
    fs.rmSync = originalRmSync;
    fs.unlink = originalUnlink;
    fs.unlinkSync = originalUnlinkSync;
    fs.rename = originalRename;
    fs.renameSync = originalRenameSync;
    fs.createWriteStream = originalCreateWriteStream;

    // Restore promises functions
    if (fs.promises) {
      fs.promises.writeFile = originalPromisesWriteFile;
      fs.promises.mkdir = originalPromisesMkdir;
      fs.promises.rm = originalPromisesRm;
      fs.promises.unlink = originalPromisesUnlink;
      fs.promises.rename = originalPromisesRename;
    }

    activeSandboxDir = null;
    isPatched = false;
  },
};
