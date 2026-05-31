/**
 * ProcessSentinel.js (spec 106) — strict guest containment sentinel that
 * monkey-patches Node's child_process methods to enforce a strict whitelist,
 * preventing malicious process escapes and unauthorized network egress.
 */

import childProcess from "child_process";

// Store original native child_process functions
const originalSpawn = childProcess.spawn;
const originalSpawnSync = childProcess.spawnSync;
const originalFork = childProcess.fork;
const originalExec = childProcess.exec;
const originalExecSync = childProcess.execSync;
const originalExecFile = childProcess.execFile;
const originalExecFileSync = childProcess.execFileSync;

let isPatched = false;
const stats = {
  allowedCount: 0,
  blockedCount: 0,
};

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
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        return originalSpawn.apply(this, arguments);
      }
    );

    childProcess.spawnSync = /** @type {any} */ (
      function (command, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(command, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        return originalSpawnSync.apply(this, arguments);
      }
    );

    childProcess.fork = /** @type {any} */ (
      function (modulePath, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand("node", [modulePath, ...actualArgs]);
        if (!validation.allowed) {
          stats.blockedCount++;
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        return originalFork.apply(this, arguments);
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
          const err = new Error(
            `[SECURITY ACCESS DENIED] Shell metacharacters are forbidden in sandbox execution`,
          );
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
        return originalExec.apply(this, arguments);
      }
    );

    childProcess.execSync = /** @type {any} */ (
      function (command, options) {
        const forbiddenShellChars = /[&|;><$]/;
        if (forbiddenShellChars.test(command)) {
          stats.blockedCount++;
          throw new Error(
            `[SECURITY ACCESS DENIED] Shell metacharacters are forbidden in sandbox execution`,
          );
        }

        const parsed = parseCommandString(command);
        const validation = validateCommand(parsed.command, parsed.args);
        if (!validation.allowed) {
          stats.blockedCount++;
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }

        stats.allowedCount++;
        return originalExecSync.apply(this, arguments);
      }
    );

    childProcess.execFile = /** @type {any} */ (
      function (file, args, options, callback) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(file, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
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
        return originalExecFile.apply(this, arguments);
      }
    );

    childProcess.execFileSync = /** @type {any} */ (
      function (file, args, options) {
        const actualArgs = Array.isArray(args) ? args : [];
        const validation = validateCommand(file, actualArgs);
        if (!validation.allowed) {
          stats.blockedCount++;
          throw new Error(`[SECURITY ACCESS DENIED] ${validation.reason}`);
        }
        stats.allowedCount++;
        return originalExecFileSync.apply(this, arguments);
      }
    );

    isPatched = true;
  },

  /**
   * Deactivates monkey-patches and restores original native child_process methods.
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
    isPatched = false;
  },
};
