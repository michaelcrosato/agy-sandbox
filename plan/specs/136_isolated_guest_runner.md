# SPEC-136: Host-Isolated Process Guest Runner & Workspace Self-Healer

## Summary
Implement a secure, modular child-process execution harness (`src/net/GuestRunner.js`) that programmatically spawns untrusted guest scripts in an isolated, low-privilege child process. The guest runner will spin up the process, inject sandbox environment parameters, pre-activate `ProcessSentinel` and `IntegrityGuard` inside the guest thread prior to code execution, enforce strict time budgets (timeouts), and perform a complete teardown using `ProcessReaper` to guarantee zero dangling resources.

## Motivation
- Running untrusted guest scripts in the host Node process is a security hazard, risking memory leaks, global prototype mutations, or state leaks between consecutive runs.
- Offloading execution to a low-privilege child process ensures absolute V8 instance and heap isolation.
- Automatic CPU/time budgets and process-tree reaping prevent runaway infinite loops from hogging host resources.
- Aligns with the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Create `src/net/GuestRunner.js` exposing `runScript(scriptPath, options)`.
- Spawn the script in a dedicated child process using `childProcess.fork` or `childProcess.spawn`.
- Pass environment parameters securely, specifying sandbox boundaries.
- Pre-activate `ProcessSentinel` and `IntegrityGuard` in the child context before the guest payload starts.
- Enforce strict timeouts (e.g., default 5000ms) and forcefully SIGKILL the guest and its process tree via `ProcessReaper` on expiration, logging CPU/timeout events to `SandboxSecurityRegistry`.
- Author comprehensive Jest unit tests verifying complete process isolation, timeout enforcement, and clean resource teardowns.

**Out:**
- Do not run untrusted guest code in the main application process.

## Acceptance Criteria
- [ ] Guest scripts run inside isolated child processes with dedicated V8 instances.
- [ ] `ProcessSentinel` and `IntegrityGuard` are successfully initialized in the child before execution.
- [ ] Runaway guest scripts are killed cleanly via SIGKILL and process tree reaping on timeout.
- [ ] Complete test suite confirms process isolation, timeout handling, and leak-free teardowns.
