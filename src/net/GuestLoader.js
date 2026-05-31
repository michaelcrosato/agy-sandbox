import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProcessSentinel } from "./ProcessSentinel.js";
import { SandboxSecurityRegistry } from "./SandboxSecurityRegistry.js";

/**
 * GuestLoader.js (SPEC-144 / SPEC-152) — ESM Import Loader Hook.
 * Intercepts dynamic and static imports inside the guest process, asserting strict path boundaries
 * and verifying cryptographic SHA-256 module signatures.
 */
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);

  if (resolved && resolved.url && resolved.url.startsWith("file://")) {
    const filePath = fileURLToPath(resolved.url);
    const resolvedPath = path.resolve(filePath);

    // 1. Path Boundary Check (SPEC-144)
    try {
      ProcessSentinel.checkPath(resolvedPath, false);
    } catch (err) {
      throw new Error(
        `[SECURITY ACCESS DENIED] ESM Import Violation: ${err.message}`,
        { cause: err },
      );
    }

    // 2. Cryptographic ESM Module Integrity Verification Check (SPEC-152)
    let computedHash;
    try {
      const fileContent = fs.readFileSync(resolvedPath);
      computedHash = crypto
        .createHash("sha256")
        .update(fileContent)
        .digest("hex");
    } catch (err) {
      throw new Error(
        `[SECURITY ACCESS DENIED] ESM Integrity Hash Calculation Failed for: ${resolvedPath}. Error: ${err.message}`,
        { cause: err },
      );
    }

    // Parse GUEST_ALLOWED_MODULE_HASHES registry from environment
    let allowedHashes = {};
    try {
      if (process.env.GUEST_ALLOWED_MODULE_HASHES) {
        allowedHashes = JSON.parse(process.env.GUEST_ALLOWED_MODULE_HASHES);
      }
    } catch {
      // Gracefully handle JSON parse failures by keeping an empty object
    }

    // Retrieve expected hash from the registry (matching resolved absolute paths)
    const expectedHash = allowedHashes[resolvedPath];

    if (!expectedHash || expectedHash !== computedHash) {
      // Log integrity signature breach to the centralized SandboxSecurityRegistry
      try {
        SandboxSecurityRegistry.logViolation(
          "integrity",
          "module_integrity_violation",
          {
            path: resolvedPath,
            expectedHash: expectedHash || null,
            actualHash: computedHash,
          },
        );
      } catch {
        // Fail-safe registry logging bypass
      }

      throw new Error(
        `[SECURITY ACCESS DENIED] Cryptographic Signature Mismatch for module: ${resolvedPath}. (Expected: ${expectedHash || "none"}, Got: ${computedHash})`,
      );
    }
  }

  return resolved;
}
