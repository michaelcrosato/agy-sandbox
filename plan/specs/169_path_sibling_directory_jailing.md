# SPEC-169: Prevent Sandbox Directory Traversal Escapes via Sibling Directory Boundary Separation

## Summary

Harden the absolute path validation inside `ProcessSentinel.js` (`checkPath`) to prevent boundary escapes into sibling directories that share a naming prefix. Enforce trailing path separators on container directories during all `startsWith` string comparisons.

## Motivation

- Currently, `ProcessSentinel.js` performs path prefix matching using `.startsWith(sandboxDir)`.
- If the sandbox directory is `C:\dev\agy-sandbox\.sandbox-runner-test-dir`, a file path like `C:\dev\agy-sandbox\.sandbox-runner-test-dir-sibling\file.txt` will erroneously pass the startsWith check because it starts with the same string.
- This creates a critical directory traversal escape vulnerability where an agent could access files in a sibling folder.
- Standardizing directory path matches with trailing separators (`path.sep`) guarantees absolute boundary containment.

## Scope

**In:**

- Modify the `checkPath` function in `src/net/ProcessSentinel.js` to ensure the container directories (`sandboxDir`, `rootNodeModules`, `workspaceNodeModules`, and `workerFile`) are compared with trailing path separators.
- Replace simple `.startsWith(dir)` checks with `.startsWith(dirWithSep)` or matching equality `resolved === dir`.
- Add robust unit tests inside `src/net/ProcessSentinel.test.js` validating sibling prefix directory rejections for both reads and writes.

**Out:**

- None.

## Acceptance Criteria

- [ ] Path checks strictly jail guest script accesses inside the exact sandbox directory.
- [ ] Attempting to write or read a file in a sibling directory sharing the sandbox path prefix is blocked and logs an absolute path escape violation to `SandboxSecurityRegistry`.
- [ ] Read-only whitelists for dependency node_modules are strictly validated with trailing path separators.
- [ ] 100% green test validation gate.
