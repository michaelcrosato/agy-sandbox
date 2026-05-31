# SPEC-167: Lock Down Node Native C++ Bindings (process.dlopen, process.binding, process._linkedBinding)

## Summary

Prevent untrusted guest scripts from escaping the JavaScript environment inside child processes by blocking raw access to Node's internal C++ native bindings. Lock down and seal `process.dlopen`, `process.binding`, and `process._linkedBinding` on the global `process` object within the guest sandbox context.

## Motivation

- In Node.js, `process.dlopen` allows dynamically loading compiled C++ binary addons, which can run native machine instructions and completely bypass all JavaScript-level monkey-patches and security rules.
- Access to `process.binding` and `process._linkedBinding` exposes raw V8 C++ bindings that let scripts interact directly with the OS (bypassing custom path jailing, child process spawns, and domain firewalling).
- Intercepting and blocking these C++ binding interfaces secures the host against severe in-process container breakouts.

## Scope

**In:**

- Modify `src/net/IntegrityGuard.js` to override `process.dlopen`, `process.binding`, and `process._linkedBinding` when the integrity guard starts.
- Replace these methods with dummy hooks that log a security violation to `SandboxSecurityRegistry` and throw a `TypeError/Error` block.
- Seal or freeze the global `process` properties inside guest run configurations to prevent scripts from restoring original methods.
- Authored a comprehensive integration test proving that attempts to access `process.binding` or `process.dlopen` are blocked and logged.

**Out:**

- Do not disable these native methods for host-level execution runs (only apply blocks to the Guest execution environments where `IntegrityGuard` is started).

## Acceptance Criteria

- [ ] Untrusted guest scripts attempting to call `process.dlopen` are blocked, throw an error, and log to `SandboxSecurityRegistry`.
- [ ] Untrusted guest scripts attempting to call `process.binding` or `process._linkedBinding` are blocked and logged.
- [ ] Global `process` C++ bindings are immutable and cannot be restored or un-monkey-patched by the guest.
- [ ] 100% green test validation gate showing clean environment teardown.
