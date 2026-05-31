/**
 * ProcessSentinel.js (spec 106) — strict guest containment sentinel that
 * monkey-patches Node's child_process methods to enforce a strict whitelist,
 * preventing malicious process escapes and unauthorized network egress.
 */

import childProcess from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Writable, Readable } from "stream";
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

const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;
const originalReaddir = fs.readdir;
const originalReaddirSync = fs.readdirSync;
const originalCreateReadStream = fs.createReadStream;

// Store original promises fs functions
const originalPromisesWriteFile = fs.promises ? fs.promises.writeFile : null;
const originalPromisesMkdir = fs.promises ? fs.promises.mkdir : null;
const originalPromisesRm = fs.promises ? fs.promises.rm : null;
const originalPromisesUnlink = fs.promises ? fs.promises.unlink : null;
const originalPromisesRename = fs.promises ? fs.promises.rename : null;

const originalPromisesReadFile = fs.promises ? fs.promises.readFile : null;
const originalPromisesReaddir = fs.promises ? fs.promises.readdir : null;

// Store original native fs existsSync
const originalExistsSync = fs.existsSync;

// Virtual COW FS overlay variables (SPEC-150)
let virtualCowActive = false;
const virtualFiles = new Map(); // resolved absolute path -> Buffer or string
const virtualDirs = new Set(); // resolved absolute path of directories

// Virtual Write stream class for Zero-Trust COW
class VirtualWriteStream extends Writable {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.chunks = [];
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(chunk);
    callback();
  }
  end(chunk, encoding, callback) {
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = null;
    } else if (typeof encoding === "function") {
      callback = encoding;
    }
    if (chunk) {
      this.chunks.push(chunk);
    }
    const finalBuffer = Buffer.concat(
      this.chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c)),
    );
    virtualFiles.set(this.filePath, finalBuffer);
    if (callback) {
      process.nextTick(callback);
    }
    this.emit("finish");
    this.emit("close");
    return /** @type {this} */ (this);
  }
}

// Virtual Read stream class for Zero-Trust COW
class VirtualReadStream extends Readable {
  constructor(filePath, data) {
    super();
    this.data = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.sent = false;
  }
  _read(size) {
    if (this.sent) {
      this.push(null);
      return;
    }
    this.push(this.data);
    this.sent = true;
  }
}

// Helper to remove virtual files/directories recursively
function handleVirtualDelete(resolved, options = {}) {
  let deleted = false;
  if (virtualFiles.has(resolved)) {
    virtualFiles.delete(resolved);
    deleted = true;
  }
  if (virtualDirs.has(resolved)) {
    virtualDirs.delete(resolved);
    if (options.recursive) {
      for (const key of virtualFiles.keys()) {
        if (key.startsWith(resolved + path.sep)) {
          virtualFiles.delete(key);
        }
      }
      for (const key of virtualDirs) {
        if (key.startsWith(resolved + path.sep)) {
          virtualDirs.delete(key);
        }
      }
    }
    deleted = true;
  }
  return deleted;
}

// Helper to merge directory contents
function mergeVirtualReaddir(resolvedPath, physicalResults = []) {
  const resultSet = new Set(physicalResults);
  const prefix = resolvedPath.endsWith(path.sep)
    ? resolvedPath
    : resolvedPath + path.sep;

  // Add virtual files directly in this directory
  for (const f of virtualFiles.keys()) {
    if (f.startsWith(prefix)) {
      const relative = f.slice(prefix.length);
      const parts = relative
        .slice(relative.startsWith(path.sep) ? 1 : 0)
        .split(path.sep);
      if (parts[0]) resultSet.add(parts[0]);
    }
  }

  // Add virtual dirs directly in this directory
  for (const d of virtualDirs) {
    if (d.startsWith(prefix)) {
      const relative = d.slice(prefix.length);
      const parts = relative
        .slice(relative.startsWith(path.sep) ? 1 : 0)
        .split(path.sep);
      if (parts[0]) resultSet.add(parts[0]);
    }
  }

  return Array.from(resultSet);
}

let isPatched = false;
let activeSandboxDir = null;
let isCheckingPath = false;

const stats = {
  allowedCount: 0,
  blockedCount: 0,
};

/**
 * Asserts that the given file path resides strictly within the active sandbox containment directory,
 * resolving directory traversals and whitelisting read-only dependency paths.
 * Throws a security boundary isolation error if an escape is detected.
 * @param {any} filePath - Path to check.
 * @param {boolean} [isWrite=false] - True if path is evaluated for a write/delete action.
 */
function checkPath(filePath, isWrite = false) {
  if (isCheckingPath) return;
  isCheckingPath = true;
  try {
    // Bypass containment check when not executing a guest script and not in forced test mode (SPEC-160)
    if (!process.env.GUEST_SCRIPT_PATH && !process.env.TEST_SENTINEL_FORCE) {
      return;
    }

    const sandboxDir =
      activeSandboxDir ||
      (process.env.GUEST_SANDBOX_DIR
        ? path.resolve(process.env.GUEST_SANDBOX_DIR)
        : null);
    if (!sandboxDir || !filePath) return;
    let pStr;
    if (filePath instanceof URL) {
      pStr = fileURLToPath(filePath);
    } else if (typeof filePath === "string") {
      pStr = filePath;
    } else {
      pStr = String(filePath);
    }

    // Intercept and reject relative directory traversal strings containing '..'
    const normalizedStr = pStr.replace(/\\/g, "/");
    if (normalizedStr.split("/").includes("..")) {
      stats.blockedCount++;
      const errMsg = `[SECURITY ACCESS DENIED] Traversal pattern '..' detected in path: [${pStr}]`;
      SandboxSecurityRegistry.logViolation("filesystem", "fs_access", {
        path: pStr,
        sandboxDir: sandboxDir,
        reason: errMsg,
      });
      throw new Error(errMsg);
    }

    const resolved = path.resolve(pStr);

    // 1. If it resolved inside the active sandboxDir, it's always allowed (read/write)
    if (
      resolved === sandboxDir ||
      resolved.startsWith(
        sandboxDir.endsWith(path.sep) ? sandboxDir : sandboxDir + path.sep,
      )
    ) {
      return;
    }

    // 2. If it's a write operation and outside the sandboxDir, block it instantly!
    if (isWrite) {
      stats.blockedCount++;
      const errMsg = `[SECURITY ACCESS DENIED] Write attempt outside sandboxed directory: path [${resolved}] is outside [${sandboxDir}]`;
      SandboxSecurityRegistry.logViolation("filesystem", "fs_access", {
        path: resolved,
        sandboxDir: sandboxDir,
        reason: errMsg,
      });
      throw new Error(errMsg);
    }

    // 3. For read operations, only jail if we are running inside a guest script process
    if (!process.env.GUEST_SCRIPT_PATH) {
      return;
    }

    // (a) allowed read-only scopes: project's node_modules directory
    const rootNodeModules = path.resolve(sandboxDir, "../../node_modules");
    const workspaceNodeModules = path.resolve(process.cwd(), "node_modules");
    if (
      resolved === rootNodeModules ||
      resolved.startsWith(
        rootNodeModules.endsWith(path.sep)
          ? rootNodeModules
          : rootNodeModules + path.sep,
      ) ||
      resolved === workspaceNodeModules ||
      resolved.startsWith(
        workspaceNodeModules.endsWith(path.sep)
          ? workspaceNodeModules
          : workspaceNodeModules + path.sep,
      )
    ) {
      return;
    }

    // (b) the active guest script itself (for ESM loader importing)
    const guestScript = process.env.GUEST_SCRIPT_PATH
      ? path.resolve(process.env.GUEST_SCRIPT_PATH)
      : null;
    if (guestScript && resolved === guestScript) {
      return;
    }

    // (c) the worker's bootstrap files (in the same directory)
    const workerFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
    );
    if (
      resolved === workerFile ||
      resolved.startsWith(
        workerFile.endsWith(path.sep) ? workerFile : workerFile + path.sep,
      )
    ) {
      return;
    }

    // Otherwise, deny access!
    stats.blockedCount++;
    const errMsg = `[SECURITY ACCESS DENIED] Read attempt outside sandboxed directory: path [${resolved}] is outside [${sandboxDir}]`;
    SandboxSecurityRegistry.logViolation("filesystem", "fs_access", {
      path: resolved,
      sandboxDir: sandboxDir,
      reason: errMsg,
    });
    throw new Error(errMsg);
  } finally {
    isCheckingPath = false;
  }
}

/**
 * Normalizes and resolves PathLike / URL arguments safely into absolute path strings.
 * @param {any} fileOrPath - The file path or URL to resolve.
 * @returns {string}
 */
function resolveSafePath(fileOrPath) {
  if (!fileOrPath) return "";
  if (fileOrPath instanceof URL) {
    return path.resolve(fileURLToPath(fileOrPath));
  }
  if (typeof fileOrPath === "object" && fileOrPath.toString) {
    return path.resolve(fileOrPath.toString());
  }
  return path.resolve(String(fileOrPath));
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

    // Path Jailing: Verify any JS script target passed to node resolves inside the sandbox bounds (SPEC-160)
    const sandboxDir =
      activeSandboxDir ||
      (process.env.GUEST_SANDBOX_DIR
        ? path.resolve(process.env.GUEST_SANDBOX_DIR)
        : null);
    if (sandboxDir) {
      for (const arg of args) {
        // Any positional argument not starting with - is treated as a target script/file path
        if (arg && !arg.startsWith("-")) {
          const resolved = path.resolve(arg);
          // Allow inside sandbox
          if (
            resolved === sandboxDir ||
            resolved.startsWith(
              sandboxDir.endsWith(path.sep)
                ? sandboxDir
                : sandboxDir + path.sep,
            )
          ) {
            continue;
          }
          // Allow inside node_modules
          const rootNodeModules = path.resolve(
            sandboxDir,
            "../../node_modules",
          );
          const workspaceNodeModules = path.resolve(
            process.cwd(),
            "node_modules",
          );
          if (
            resolved === rootNodeModules ||
            resolved.startsWith(
              rootNodeModules.endsWith(path.sep)
                ? rootNodeModules
                : rootNodeModules + path.sep,
            ) ||
            resolved === workspaceNodeModules ||
            resolved.startsWith(
              workspaceNodeModules.endsWith(path.sep)
                ? workspaceNodeModules
                : workspaceNodeModules + path.sep,
            )
          ) {
            continue;
          }
          // Allow worker bootstrap directory files
          const workerFile = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
          );
          if (
            resolved === workerFile ||
            resolved.startsWith(
              workerFile.endsWith(path.sep)
                ? workerFile
                : workerFile + path.sep,
            )
          ) {
            continue;
          }
          // Otherwise, it resolves outside sandbox and is an escape attempt!
          return {
            allowed: false,
            reason: `Node script execution target [${arg}] resolves outside sandboxed workspace: [${resolved}]`,
          };
        }
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
   * Enables the Zero-Trust Virtual Copy-On-Write filesystem overlay (SPEC-150).
   */
  enableVirtualCow() {
    virtualCowActive = true;
    virtualFiles.clear();
    virtualDirs.clear();
  },

  /**
   * Disables the Zero-Trust Virtual Copy-On-Write filesystem overlay.
   */
  disableVirtualCow() {
    virtualCowActive = false;
    virtualFiles.clear();
    virtualDirs.clear();
  },

  /**
   * Retrieves the in-memory virtual filesystem overlay map (useful for verification).
   * @returns {Map<string, string|Buffer>}
   */
  getVirtualFiles() {
    return virtualFiles;
  },

  /**
   * Externally validates a path against sandbox directory boundaries.
   * @param {any} filePath
   * @param {boolean} [isWrite=false]
   */
  checkPath(filePath, isWrite = false) {
    return checkPath(filePath, isWrite);
  },

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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalSpawn.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalSpawnSync.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalFork.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalExec.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalExecSync.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalExecFile.apply(this, arguments);
        }
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
        if (
          !process.env.GUEST_SCRIPT_PATH &&
          !process.env.TEST_SENTINEL_FORCE
        ) {
          return originalExecFileSync.apply(this, arguments);
        }
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
      function (file, data, ...args) {
        const resolved = resolveSafePath(file);
        checkPath(resolved, true);
        if (virtualCowActive) {
          virtualFiles.set(resolved, data);
          let parent = path.dirname(resolved);
          while (parent && parent !== path.dirname(parent)) {
            virtualDirs.add(parent);
            parent = path.dirname(parent);
          }
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null));
          }
          return;
        }
        return originalWriteFile.apply(this, arguments);
      }
    );
    if (originalWriteFile && originalWriteFile.__promisify__) {
      fs.writeFile.__promisify__ = originalWriteFile.__promisify__;
    }

    fs.writeFileSync = function (file, data, ...args) {
      const resolved = resolveSafePath(file);
      checkPath(resolved, true);
      if (virtualCowActive) {
        virtualFiles.set(resolved, data);
        let parent = path.dirname(resolved);
        while (parent && parent !== path.dirname(parent)) {
          virtualDirs.add(parent);
          parent = path.dirname(parent);
        }
        return;
      }
      return originalWriteFileSync.apply(this, arguments);
    };

    fs.mkdir = /** @type {any} */ (
      function (dir, ...args) {
        const resolved = resolveSafePath(dir);
        checkPath(resolved, true);
        if (virtualCowActive) {
          virtualDirs.add(resolved);
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null));
          }
          return;
        }
        return originalMkdir.apply(this, arguments);
      }
    );
    if (originalMkdir && originalMkdir.__promisify__) {
      fs.mkdir.__promisify__ = originalMkdir.__promisify__;
    }

    fs.mkdirSync = function (dir, ...args) {
      const resolved = resolveSafePath(dir);
      checkPath(resolved, true);
      if (virtualCowActive) {
        virtualDirs.add(resolved);
        return;
      }
      return originalMkdirSync.apply(this, arguments);
    };

    fs.rm = /** @type {any} */ (
      function (p, ...args) {
        const resolved = resolveSafePath(p);
        checkPath(resolved, true);
        if (virtualCowActive) {
          const options = typeof args[0] === "object" ? args[0] : {};
          handleVirtualDelete(resolved, options);
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null));
          }
          return;
        }
        return originalRm.apply(this, arguments);
      }
    );
    if (originalRm && originalRm.__promisify__) {
      fs.rm.__promisify__ = originalRm.__promisify__;
    }

    fs.rmSync = function (p, ...args) {
      const resolved = resolveSafePath(p);
      checkPath(resolved, true);
      if (virtualCowActive) {
        const options = args[0] || {};
        handleVirtualDelete(resolved, options);
        return;
      }
      return originalRmSync.apply(this, arguments);
    };

    fs.unlink = /** @type {any} */ (
      function (p, ...args) {
        const resolved = resolveSafePath(p);
        checkPath(resolved, true);
        if (virtualCowActive) {
          handleVirtualDelete(resolved);
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null));
          }
          return;
        }
        return originalUnlink.apply(this, arguments);
      }
    );
    if (originalUnlink && originalUnlink.__promisify__) {
      fs.unlink.__promisify__ = originalUnlink.__promisify__;
    }

    fs.unlinkSync = function (p, ...args) {
      const resolved = resolveSafePath(p);
      checkPath(resolved, true);
      if (virtualCowActive) {
        handleVirtualDelete(resolved);
        return;
      }
      return originalUnlinkSync.apply(this, arguments);
    };

    fs.rename = /** @type {any} */ (
      function (oldPath, newPath, ...args) {
        const resolvedOld = resolveSafePath(oldPath);
        const resolvedNew = resolveSafePath(newPath);
        checkPath(resolvedOld, true);
        checkPath(resolvedNew, true);
        if (virtualCowActive) {
          if (virtualFiles.has(resolvedOld)) {
            const data = virtualFiles.get(resolvedOld);
            virtualFiles.delete(resolvedOld);
            virtualFiles.set(resolvedNew, data);
          } else if (virtualDirs.has(resolvedOld)) {
            virtualDirs.delete(resolvedOld);
            virtualDirs.add(resolvedNew);
            for (const key of virtualFiles.keys()) {
              if (key.startsWith(resolvedOld + path.sep)) {
                const relative = key.slice(resolvedOld.length);
                const data = virtualFiles.get(key);
                virtualFiles.delete(key);
                virtualFiles.set(resolvedNew + relative, data);
              }
            }
            for (const key of virtualDirs) {
              if (key.startsWith(resolvedOld + path.sep)) {
                const relative = key.slice(resolvedOld.length);
                virtualDirs.delete(key);
                virtualDirs.add(resolvedNew + relative);
              }
            }
          }
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null));
          }
          return;
        }
        return originalRename.apply(this, arguments);
      }
    );
    if (originalRename && originalRename.__promisify__) {
      fs.rename.__promisify__ = originalRename.__promisify__;
    }

    fs.renameSync = function (oldPath, newPath, ...args) {
      const resolvedOld = resolveSafePath(oldPath);
      const resolvedNew = resolveSafePath(newPath);
      checkPath(resolvedOld, true);
      checkPath(resolvedNew, true);
      if (virtualCowActive) {
        if (virtualFiles.has(resolvedOld)) {
          const data = virtualFiles.get(resolvedOld);
          virtualFiles.delete(resolvedOld);
          virtualFiles.set(resolvedNew, data);
        } else if (virtualDirs.has(resolvedOld)) {
          virtualDirs.delete(resolvedOld);
          virtualDirs.add(resolvedNew);
          for (const key of virtualFiles.keys()) {
            if (key.startsWith(resolvedOld + path.sep)) {
              const relative = key.slice(resolvedOld.length);
              const data = virtualFiles.get(key);
              virtualFiles.delete(key);
              virtualFiles.set(resolvedNew + relative, data);
            }
          }
          for (const key of virtualDirs) {
            if (key.startsWith(resolvedOld + path.sep)) {
              const relative = key.slice(resolvedOld.length);
              virtualDirs.delete(key);
              virtualDirs.add(resolvedNew + relative);
            }
          }
        }
        return;
      }
      return originalRenameSync.apply(this, arguments);
    };

    fs.createWriteStream = function (pathName, ...args) {
      const resolved = resolveSafePath(pathName);
      checkPath(resolved, true);
      if (virtualCowActive) {
        return new VirtualWriteStream(resolved);
      }
      return originalCreateWriteStream.apply(this, arguments);
    };

    // Monkeypatch synchronous/callback fs read operations
    fs.readFile = /** @type {any} */ (
      function (file, ...args) {
        const resolved = resolveSafePath(file);
        checkPath(resolved, false);
        if (virtualCowActive && virtualFiles.has(resolved)) {
          const data = virtualFiles.get(resolved);
          const options = args[0];
          const encoding =
            typeof options === "string" ? options : options?.encoding;
          let result = data;
          if (encoding && Buffer.isBuffer(data)) {
            result = data.toString(encoding);
          } else if (!encoding && typeof data === "string") {
            result = Buffer.from(data);
          }
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            process.nextTick(() => callback(null, result));
          }
          return;
        }
        return originalReadFile.apply(this, arguments);
      }
    );
    if (originalReadFile && originalReadFile.__promisify__) {
      fs.readFile.__promisify__ = originalReadFile.__promisify__;
    }

    fs.readFileSync = function (file, ...args) {
      const resolved = resolveSafePath(file);
      checkPath(resolved, false);
      if (virtualCowActive && virtualFiles.has(resolved)) {
        const data = virtualFiles.get(resolved);
        const options = args[0];
        const encoding =
          typeof options === "string" ? options : options?.encoding;
        if (encoding && Buffer.isBuffer(data)) {
          return data.toString(encoding);
        }
        if (!encoding && typeof data === "string") {
          return Buffer.from(data);
        }
        return data;
      }
      return originalReadFileSync.apply(this, arguments);
    };

    fs.readdir = /** @type {any} */ (
      function (dir, ...args) {
        const resolved = resolveSafePath(dir);
        checkPath(resolved, false);
        const callback = args[args.length - 1];
        if (virtualCowActive) {
          let physical = [];
          try {
            physical = originalReaddirSync.apply(this, arguments);
          } catch (err) {
            if (
              !virtualDirs.has(resolved) &&
              !Array.from(virtualFiles.keys()).some((k) =>
                k.startsWith(resolved + path.sep),
              )
            ) {
              if (typeof callback === "function") {
                return callback(err);
              }
              throw err;
            }
          }
          const merged = mergeVirtualReaddir(resolved, physical);
          if (typeof callback === "function") {
            process.nextTick(() => callback(null, merged));
          }
          return;
        }
        return originalReaddir.apply(this, arguments);
      }
    );
    if (originalReaddir && originalReaddir.__promisify__) {
      fs.readdir.__promisify__ = originalReaddir.__promisify__;
    }

    fs.readdirSync = function (dir, ...args) {
      const resolved = resolveSafePath(dir);
      checkPath(resolved, false);
      let physical = [];
      try {
        physical = originalReaddirSync.apply(this, arguments);
      } catch (err) {
        if (
          !virtualCowActive ||
          (!virtualDirs.has(resolved) &&
            !Array.from(virtualFiles.keys()).some((k) =>
              k.startsWith(resolved + path.sep),
            ))
        ) {
          throw err;
        }
      }
      if (virtualCowActive) {
        return mergeVirtualReaddir(resolved, physical);
      }
      return physical;
    };

    fs.createReadStream = function (pathName, ...args) {
      const resolved = resolveSafePath(pathName);
      checkPath(resolved, false);
      if (virtualCowActive && virtualFiles.has(resolved)) {
        return new VirtualReadStream(resolved, virtualFiles.get(resolved));
      }
      return originalCreateReadStream.apply(this, arguments);
    };

    fs.existsSync = function (file) {
      const resolved = resolveSafePath(file);
      if (virtualCowActive) {
        if (virtualFiles.has(resolved) || virtualDirs.has(resolved)) {
          return true;
        }
      }
      return originalExistsSync.apply(this, arguments);
    };

    // Monkeypatch fs.promises if available
    if (fs.promises) {
      fs.promises.writeFile = function (file, data, ...args) {
        const resolved = resolveSafePath(file);
        checkPath(resolved, true);
        if (virtualCowActive) {
          virtualFiles.set(resolved, data);
          let parent = path.dirname(resolved);
          while (parent && parent !== path.dirname(parent)) {
            virtualDirs.add(parent);
            parent = path.dirname(parent);
          }
          return Promise.resolve();
        }
        return originalPromisesWriteFile.apply(this, arguments);
      };

      fs.promises.mkdir = function (dir, ...args) {
        const resolved = resolveSafePath(dir);
        checkPath(resolved, true);
        if (virtualCowActive) {
          virtualDirs.add(resolved);
          return Promise.resolve();
        }
        return originalPromisesMkdir.apply(this, arguments);
      };

      fs.promises.rm = function (p, ...args) {
        const resolved = resolveSafePath(p);
        checkPath(resolved, true);
        if (virtualCowActive) {
          const options = args[0] || {};
          handleVirtualDelete(resolved, options);
          return Promise.resolve();
        }
        return originalPromisesRm.apply(this, arguments);
      };

      fs.promises.unlink = function (p, ...args) {
        const resolved = resolveSafePath(p);
        checkPath(resolved, true);
        if (virtualCowActive) {
          handleVirtualDelete(resolved);
          return Promise.resolve();
        }
        return originalPromisesUnlink.apply(this, arguments);
      };

      fs.promises.rename = function (oldPath, newPath, ...args) {
        const resolvedOld = resolveSafePath(oldPath);
        const resolvedNew = resolveSafePath(newPath);
        checkPath(resolvedOld, true);
        checkPath(resolvedNew, true);
        if (virtualCowActive) {
          if (virtualFiles.has(resolvedOld)) {
            const data = virtualFiles.get(resolvedOld);
            virtualFiles.delete(resolvedOld);
            virtualFiles.set(resolvedNew, data);
          }
          return Promise.resolve();
        }
        return originalPromisesRename.apply(this, arguments);
      };

      fs.promises.readFile = function (file, ...args) {
        const resolved = resolveSafePath(file);
        checkPath(resolved, false);
        if (virtualCowActive && virtualFiles.has(resolved)) {
          const data = virtualFiles.get(resolved);
          const options = args[0];
          const encoding =
            typeof options === "string" ? options : options?.encoding;
          let result = data;
          if (encoding && Buffer.isBuffer(data)) {
            result = data.toString(encoding);
          } else if (!encoding && typeof data === "string") {
            result = Buffer.from(data);
          }
          return Promise.resolve(result);
        }
        return originalPromisesReadFile.apply(this, arguments);
      };

      fs.promises.readdir = async function (dir, ...args) {
        const resolved = resolveSafePath(dir);
        checkPath(resolved, false);
        if (virtualCowActive) {
          let physical = [];
          try {
            physical = await originalPromisesReaddir.apply(this, arguments);
          } catch (err) {
            if (
              !virtualDirs.has(resolved) &&
              !Array.from(virtualFiles.keys()).some((k) =>
                k.startsWith(resolved + path.sep),
              )
            ) {
              throw err;
            }
          }
          return mergeVirtualReaddir(resolved, physical);
        }
        return originalPromisesReaddir.apply(this, arguments);
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

    fs.readFile = originalReadFile;
    fs.readFileSync = originalReadFileSync;
    fs.readdir = originalReaddir;
    fs.readdirSync = originalReaddirSync;
    fs.createReadStream = originalCreateReadStream;
    fs.existsSync = originalExistsSync;

    // Restore promises functions
    if (fs.promises) {
      fs.promises.writeFile = originalPromisesWriteFile;
      fs.promises.mkdir = originalPromisesMkdir;
      fs.promises.rm = originalPromisesRm;
      fs.promises.unlink = originalPromisesUnlink;
      fs.promises.rename = originalPromisesRename;

      fs.promises.readFile = originalPromisesReadFile;
      fs.promises.readdir = originalPromisesReaddir;
    }

    activeSandboxDir = null;
    isPatched = false;
  },
};
