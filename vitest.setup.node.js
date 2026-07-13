import { afterAll } from "vitest";

// process.env isolation for the `node` project (Phase 1 migration).
//
// Jest gave every test file its own `process`, so a file that set
// `process.env.*` never leaked into the next file. Vitest's `vmForks` pool
// isolates the module graph per file but shares the host `process` across the
// files that reuse a fork, so env writes (GUEST_SANDBOX_DIR, TEST_SENTINEL_FORCE,
// SECURITY_AUDIT_FILE, …) would otherwise bleed between suites and flake tests
// such as ProcessSentinel's path-jailing checks.
//
// This setup file runs once per test file (fresh context under `isolate`).
// It snapshots the env before the file's code runs and restores it after the
// file finishes. As long as every file restores to its own clean baseline, the
// chain stays clean: each fork starts from the pristine parent env, so the
// first file's baseline is clean and every subsequent file inherits a restored,
// clean env.
const ENV_BASELINE = { ...process.env };

afterAll(() => {
  // Drop any keys the file added.
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_BASELINE)) {
      delete process.env[key];
    }
  }
  // Restore original values for keys the file mutated.
  for (const [key, value] of Object.entries(ENV_BASELINE)) {
    if (process.env[key] !== value) {
      process.env[key] = value;
    }
  }
});
