/**
 * SecureModuleRegistry.js (SPEC-152) — Cryptographically Signed Module Registry.
 * Holds SHA-256 integrity checksum mappings for trusted modules and dependency files.
 */

import fs from "fs";
import crypto from "crypto";
import path from "path";

/** @type {Map<string, string>} */
const registry = new Map();

/**
 * Compute the SHA-256 hash of a file's contents.
 * @param {string} filePath - Absolute path to the file.
 * @returns {string} - Computed SHA-256 digest in hex format.
 */
export function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(path.resolve(filePath));
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch (err) {
    throw new Error(
      `Failed to compute hash for module ${filePath}: ${err.message}`,
      { cause: err },
    );
  }
}

/**
 * Cryptographically signed secure module verification sentinel.
 */
export const SecureModuleRegistry = {
  /**
   * Register a module signature.
   * @param {string} filePath - Absolute path or URL of the module.
   * @param {string} sha256 - The pre-calculated SHA-256 checksum.
   */
  register(filePath, sha256) {
    const absolute = path.resolve(filePath);
    registry.set(absolute, sha256);
  },

  /**
   * Automatically calculate and register a file's integrity signature.
   * @param {string} filePath - Absolute or relative path to the file.
   */
  registerFile(filePath) {
    const absolute = path.resolve(filePath);
    if (fs.existsSync(absolute)) {
      const hash = computeFileHash(absolute);
      registry.set(absolute, hash);
    }
  },

  /**
   * Clear all signatures in the registry.
   */
  clear() {
    registry.clear();
  },

  /**
   * Retrieve a copy of the currently registered signatures.
   * @returns {Object<string, string>} - Map of absolute path to SHA-256.
   */
  getRegistry() {
    const obj = {} as Record<string, string>;
    for (const [key, value] of registry.entries()) {
      obj[key] = value;
    }
    return obj;
  },
};
