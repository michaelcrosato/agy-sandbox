# SPEC-149: Dynamic OS-Level Child Process CPU Priority Throttling Scheduler

## Summary

Implement operating system-level process priority scheduling inside the `GuestRunner.js` host environment to protect hosts from CPU resource-starvation attacks. Upon spawning a child worker thread, the host process will programmatically throttle the process priority of the guest child PID to the lowest scheduler priority (e.g. `os.constants.priority.PRIORITY_LOW` or platform-agnostic positive nice increments) using native OS scheduler interfaces. This guarantees that host multiplayer engines, WebSockets, and database persistence layers take complete CPU precedence even if the guest script executes tight infinite loops.

## Motivation

- Runaway or malicious guest executions that peg CPU cores can starve the host process's event loop, resulting in dropped socket connections, high network latency, or database corruption.
- Restricting OS scheduling priority at spawn guarantees host process stability, ensuring the host always commands CPU scheduling precedence.

## Scope

**In:**

- Enhance `GuestRunner.js` to dynamically set the spawned worker process priority.
- Import Node's native `os` module to read platform-agnostic constants or configure priority states.
- Set the priority of the child process `child.pid` to low priority (e.g. `process.setPriority(child.pid, 19)` or Windows equivalent low priority constants like `19` / idle classes) immediately upon fork.
- Gracefully catch and degrade if process priority modification fails due to system privileges, logging warnings without process termination.
- Cover priority setting and degradation behaviors in Jest tests.

**Out:**

- Do not affect the host process's own priority or system-level processes outside the sandboxed PID.

## Acceptance Criteria

- [ ] Guest process priorities are programmatically adjusted to low scheduler priority upon spawning.
- [ ] System handles priority modifications robustly across Windows, macOS, and Linux platforms.
- [ ] Safe try-catch boundaries gracefully degrade if the runtime lacks setPriority permissions.
- [ ] Jest unit tests verify priority assignment attempts and graceful fallback behaviors.
