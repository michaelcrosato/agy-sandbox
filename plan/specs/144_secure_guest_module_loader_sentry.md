# SPEC-144: Secure Dynamic Guest Module Loader Sentry & ESM Import Jail

## Summary
Harden guest module imports inside `GuestRunnerWorker.js` by establishing a secure dynamic ESM import validator. When loading guest scripts and resolving child sub-module dependencies (via dynamic `import()` or native resolution paths), intercept and validate all module descriptors against strict jail boundaries. Any attempts by guest code to import host filesystem modules outside the active sandbox directory (other than allowed whitelisted node_modules dependencies) must be blocked instantly with a security isolation exception.

## Motivation
- Smart guest scripts can attempt sandboxing escapes by utilizing dynamic ESM imports pointing to absolute system files or host codebase modules.
- Enforcing strict path resolution checks at the module loader layer ensures that the guest process cannot read or execute any host codebase modules or packages outside its designated workspace jail.

## Scope
**In:**
- Integrate module path validation hooks inside `GuestRunnerWorker.js` before dynamically importing any modules.
- Ensure that `import()` descriptors (including relative path files, absolute paths, and native libraries) are securely resolved relative to the guest workspace and strictly audited via `ProcessSentinel.checkPath`.
- Intercept and block attempts to import host modules (like `src/server.js` or system settings) that resolve outside the `sandboxDir` or allowed `node_modules` paths.
- Write robust tests in `src/net/GuestRunner.test.js` validating that guest worker attempts to dynamically import forbidden host codebase modules throw strict security loader errors.

## Acceptance Criteria
- [ ] Guest workers validate ESM sub-module imports using strict path checks.
- [ ] Dynamic imports targeting host codebase modules outside sandbox jails are blocked.
- [ ] Safe whitelisted package imports (like standard npm node_modules) are permitted.
- [ ] Jest tests verify ESM loader isolation and blocked sub-module jumps.
