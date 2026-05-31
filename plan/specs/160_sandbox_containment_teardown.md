# SPEC-160: Secure Agent Sandbox Containment, Node-Script Path Jailing & Robust Teardown Sentry

## Summary

Harden the agent execution sandbox environment against command escapes and process leaks. Jail all child `node` script execution paths to reside strictly inside the active sandbox workspace. Strengthen the `ProcessReaper` cleanup logic, and implement automated security registry log compaction to protect the host against size explosions and zombie process hangs under infinite runs.

## Motivation

- A sandboxed agent could previously execute arbitrary host JS files by spawning `node host_file.js` since the command `node` is whitelisted and path parameters were not validated. Jailing script paths resolves this escape vector.
- Preventing memory/thread leakage and zombie process port-locks is essential for unattended multi-day execution loops.
- Bounding the local security ledger size prevents disk overhead and context memory bloat.

## Scope

**In:**

- Update `ProcessSentinel.js` `validateCommand` to inspect script paths passed to `node` arguments. Block and log violations to `SandboxSecurityRegistry` if any script path resolves outside the sandboxed directory (or allowed `node_modules` paths).
- Update `ProcessReaper.js` and `GuestRunner.js` to guarantee teardown cleans up all nested subprocesses, child threads, and locks.
- Implement automatic log ledger compaction in `SandboxSecurityRegistry.js` to bound `security_audit.json` to 500 lines/entries, resolving any memory/disk footprint risks.
- Authored a comprehensive integration test suite `src/net/TeardownContainment.test.js` verifying script path jailing, process tree termination, and log compaction.

**Out:**

- Do not modify hardware substrate files (e.g. `scripts/assert-gate-integrity.ps1`).

## Acceptance Criteria

- [ ] Spawned child `node` script parameters are strictly jailed to the sandbox workspace.
- [ ] Attempts to run `node` on host scripts (outside sandbox) throw a security access block and log to `SandboxSecurityRegistry`.
- [ ] `ProcessReaper` terminates nested process trees, leaving zero orphans.
- [ ] `SandboxSecurityRegistry` automatically limits the audit ledger to 500 records.
- [ ] 100% green test and linter validation gate.
