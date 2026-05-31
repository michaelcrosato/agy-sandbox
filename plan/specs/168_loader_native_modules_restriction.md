# SPEC-168: Restrict Dynamic and Static Imports of Dangerous Core Native Libraries in GuestLoader

## Summary

Harden the custom dynamic ESM import loader hook (`GuestLoader.js`) to intercept and restrict native module loading. Block untrusted guest scripts from importing dangerous core Node.js libraries (such as `node:child_process`, `node:vm`, `node:worker_threads`, and `node:module`) dynamically or statically, while allowlisting only safe utility libraries.

## Motivation

- Currently, `GuestLoader.js` only checks URLs starting with `file://`, allowing `node:` prefixed native imports (e.g. `import child_process from 'node:child_process'`) to bypass module-integrity signature checks.
- If a guest script escapes the V8 sandbox or accesses dynamic imports, it could bypass `ProcessSentinel` entirely by loading raw built-ins on some platforms or contexts.
- Restricting native module loading at the ESM loader layer implements a robust defense-in-depth boundary.

## Scope

**In:**

- Enhance the `resolve` hook inside `src/net/GuestLoader.js` to inspect the `specifier` string.
- If the specifier represents a core Node.js library (starts with `node:` or is a native module name), check it against a strict security allowlist.
- Allowlist only safe utilities: `node:path`, `node:url`, `node:crypto`, `node:util`, `node:stream`, `node:string_decoder`.
- Block dangerous libraries (e.g., `node:child_process`, `node:vm`, `node:worker_threads`, `node:cluster`, `node:module`, `node:fs`, `node:net`, `node:http`) by throwing a security violation and logging to `SandboxSecurityRegistry`.
- Authored integration tests in `src/net/GuestRunner.test.js` validating the ESM loader blocks native imports.

**Out:**

- Allow the orchestrator parent processes to import core libraries normally.

## Acceptance Criteria

- [ ] ESM loader intercepts and rejects static or dynamic imports of `node:child_process`, `node:vm`, and other dangerous libraries.
- [ ] Safe libraries like `node:path` and `node:crypto` continue to load successfully.
- [ ] Integrity violations are logged to the `SandboxSecurityRegistry`.
- [ ] 100% green test validation gate.
