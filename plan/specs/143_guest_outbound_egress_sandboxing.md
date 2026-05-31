# SPEC-143: Guest Outbound Egress Sandboxing & Network Containment

## Summary
Implement absolute network isolation for untrusted guest workers spawned by `GuestRunner.js`. Pre-activate the zero-trust `SandboxFirewall` globally inside `GuestRunnerWorker.js` prior to dynamically importing the guest script. This guarantees that guest worker processes have strictly zero outbound network access capabilities (preventing dynamic command-and-control leakages or data exfiltration) while permitting essential local cluster loopback operations if required.

## Motivation
- While the host process has general firewall rules, untrusted guest scripts executing arbitrary network operations pose a high security risk.
- Pre-activating the monkey-patched network sentry inside the child worker V8 process prevents any dynamic socket connections (`net.connect`) or host lookups (`dns.lookup`), completely containing all execution runs.

## Scope
**In:**
- Configure `GuestRunnerWorker.js` to initialize and activate `SandboxFirewall` prior to guest script evaluation.
- Ensure that dns and network connection attempts made by the guest script throw an immediate expected network security boundary violation exception and record the trigger inside the centralized security ledger.
- Author robust unit tests in `src/net/GuestRunner.test.js` validating that guest worker network requests (like `fetch()`, `http.get()`, or raw TCP sockets) are blocked instantly and throw security containment failures.

## Acceptance Criteria
- [ ] GuestRunner workers pre-activate SandboxFirewall containment at bootstrap.
- [ ] Guest outbound DNS lookups and TCP connections throw immediate security isolation errors.
- [ ] Network violation triggers are persistently appended to the security ledger.
- [ ] Tests verify absolute egress blocking inside active child processes.
