# SPEC-138: Strict Path Jailing & Sandboxed Input File Boundary Guard

## Summary
Harden the filesystem boundary containment sentinel (`src/net/ProcessSentinel.js`) to support strict virtual workspace path jailing. Any filesystem reads, writes, or deletions made by guest code must resolve *strictly* inside the designated `sandboxDir` or allowed subdirectories (like `node_modules` for dependency access). It will intercept and block any directory traversal patterns (`../`), relative directory jumps, or absolute escapes, logging violations instantly to `SandboxSecurityRegistry`.

## Motivation
- Smart guest AI scripts can attempt sandbox escapes by using relative traversal (`../../`) or accessing absolute system paths (like `/etc/passwd` or `C:\Windows\System32`) through standard file APIs.
- Enforcing strict path resolution and whitelisting at the `ProcessSentinel` layer ensures guest code cannot read or modify any host resources outside its designated sandbox boundary.
- Aligns with the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Enhance `checkPath` inside `src/net/ProcessSentinel.js` to perform secure absolute resolution of all paths.
- Ensure resolved absolute paths start strictly with the `activeSandboxDir` string.
- Provide a clear exceptions whitelist for essential read-only dependency scopes (like the workspace's `node_modules` and Node's core libraries).
- Intercept and reject relative directory traversal strings (`..`) or double-dot segments within paths.
- Throw a strict security isolation exception on escape attempts and record violations in the `SandboxSecurityRegistry`.
- Author robust unit tests in `src/net/ProcessSentinel.test.js` validating traversal escapes, absolute escapes, read-only dependencies, and sandbox integrity.

**Out:**
- Do not restrict legitimate system libraries or required npm packages from reading dependencies.

## Acceptance Criteria
- [ ] File system check rigorously resolves and validates paths before allowing access.
- [ ] Relative directory traversal jumps (`..`) and absolute path escapes are blocked.
- [ ] Read-only whitelists for dependency directories (like `node_modules`) are permitted.
- [ ] Jest tests verify isolation containment, whitelisted reads, and traversal escapes.
