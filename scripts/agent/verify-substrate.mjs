#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(repoRoot, "scripts/manifest.txt");

function sha256Upper(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function readManifest() {
  const raw = readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.lastIndexOf(":");
      if (separator === -1) {
        throw new Error(`Invalid manifest line ${index + 1}: ${line}`);
      }
      return {
        relativePath: line.slice(0, separator),
        expectedHash: line.slice(separator + 1).toUpperCase(),
      };
    });
}

const entries = readManifest();
const failures = [];

for (const { relativePath, expectedHash } of entries) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing`);
    continue;
  }

  const actualHash = sha256Upper(readFileSync(absolutePath));
  if (actualHash !== expectedHash) {
    failures.push(
      `${relativePath}: expected ${expectedHash}, got ${actualHash}`,
    );
  }
}

if (failures.length > 0) {
  console.error("[substrate] integrity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[substrate] integrity verified (${entries.length} files)`);
