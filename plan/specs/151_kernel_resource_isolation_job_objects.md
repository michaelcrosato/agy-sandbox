# SPEC-151: Guest Process Kernel-level Resource Isolation and Job Objects Containment Sentry

## Summary

Implement operating system kernel-level resource containerization inside the `GuestRunner.js` host orchestration environment. Using native Windows Job Objects (on Windows platforms) and Linux control groups / cgroups (on Linux platforms), enforce absolute system-level caps on guest processes (such as max CPU core affinity, hardware memory ceilings, and write/read I/O bandwidth). This guarantees absolute host protection even if the guest script tries to allocate sub-processes or bypass standard Node `process.setPriority` and V8 heap limits.

## Motivation

- A sandboxed guest could spawn nested processes that escape Node-level limits.
- OS-level Priority Throttling limits CPU precedence, but does not limit CPU core usage or physical disk I/O rates.
- Enforcing kernel-level container limits (Windows Job Objects / Linux cgroups) guarantees enterprise-grade resource isolation.

## Scope

**In:**

- Enhance `GuestRunner.js` to create or assign the spawned worker process pid into a restricted Windows Job Object or cgroup container immediately upon spawn.
- Use native platform utilities or node-native bindings (with soft fallbacks) to restrict processor affinity (e.g. limit execution to a single CPU core) and restrict I/O priority.
- Fall back gracefully to standard priority/limit policing if administrative privileges prevent kernel-level configurations, logging details to SandboxSecurityRegistry.

**Out:**

- Do not alter system-wide cgroups or job objects affecting non-guest host processes.

## Acceptance Criteria

- [ ] Worker child PIDs are successfully assigned to restricted Windows Job Objects or Linux cgroups upon spawn.
- [ ] Safe try-catch blocks gracefully degrade and log warnings if administrative privileges are missing.
- [ ] Integration tests verify the containerization initialization routines and fallback tolerances.
