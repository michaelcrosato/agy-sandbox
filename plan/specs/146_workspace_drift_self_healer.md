# SPEC-146: Workspace Drift Auditing Sentinel & Integrity Self-Healer

## Summary
Implement a high-fidelity workspace drift sentinel and post-execution integrity self-healer inside `EphemeralSandbox.js`. Prior to executing untrusted guest scripts, take a fast in-memory snapshot of the sandbox workspace directory's file structures and checksums. Post-execution, audit the workspace to identify untracked file leaks, mutated file bytes, or deleted assets, logging drift telemetry and automatically self-healing the workspace by purging leaks and restoring baseline files to preserve environment purity.

## Motivation
- Smart guest scripts might attempt persistent directory pollution, leaving backdoor scripts or junk artifacts in temporary workspaces.
- Stale file modifications or untracked trash leftover from execution can consume disk space and degrade future runs.
- Automating drift detection and self-healing guarantees that every guest run executes in an absolute pristine, reproducible, and tamper-proof sandbox baseline.

## Scope
**In:**
- Develop a modular `src/net/WorkspaceDriftSentry.js` providing snapshotting, auditing, and self-healing routines.
- Capture baseline paths, file sizes, and fast hashes (FNV-1a or crypto hash) of all sandbox workspace files before script execution.
- Perform post-execution audit scans to compile a comprehensive **Workspace Drift Report**:
  - `added`: List of untracked files created during the run.
  - `modified`: List of files whose contents or sizes were altered.
  - `deleted`: List of baseline files deleted during the run.
- Automatically self-heal the workspace:
  - Delete all added untracked file leaks.
  - Re-copy baseline files for any modified or deleted elements to restore 100% initial purity.
- Log workspace drift events exceeding limits (e.g. >0 bytes or custom bounds) to `SandboxSecurityRegistry` under the `filesystem` category and `workspace_drift` action.
- Write extensive Jest tests in `src/net/WorkspaceDriftSentry.test.js` verifying snapshot integrity, drift detection, self-healing correctness, and violation logging.

**Out:**
- Do not affect system-wide files or git repositories outside the designated ephemeral sandbox directory bounds.

## Acceptance Criteria
- [ ] Drift sentry successfully captures baseline sandbox snapshots prior to execution.
- [ ] Post-execution audits accurately identify all added, modified, or deleted files.
- [ ] Workspace automatically self-heals back to 100% pristine baseline.
- [ ] Violations are logged to SandboxSecurityRegistry on detected workspace drifts.
- [ ] Comprehensive Jest unit tests cover snapshot, audit, self-healing, and logging.
