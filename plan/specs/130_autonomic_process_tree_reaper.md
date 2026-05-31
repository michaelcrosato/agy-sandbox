# SPEC-130: Autonomic Process-Tree Tracking & Orphan Reaper

## Summary
Secure child process boundaries by automatically registering all spawned processes (via monkey-patched `child_process` triggers) into the central `ProcessReaper`, and enhance `ProcessReaper` to recursively kill nested process trees, ensuring absolute teardown of orphaned or zombie background processes.

## Motivation
- AI agents running untrusted code can spawn background tasks or grandchildren processes that continue running as zombies after the main runner exits or crashes. This leaks host system memory, causes port conflict failures, and bypasses sandbox containment.
- Automatically intercepting spawns at the sentinel boundary and recursively tearing down process trees eliminates zombie leaks entirely, guaranteeing environment determinism and scale.
- Supports the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Intercept and automatically register successful child process instances inside `ProcessSentinel.js`'s patched `spawn`, `spawnSync`, `fork`, `exec`, `execSync`, `execFile`, `execFileSync` methods into `ProcessReaper`.
- Extend `ProcessReaper.js` with recursive process tree tracking and termination, ensuring that child PIDs, grandchildren, and process groups are thoroughly killed via portable commands (`taskkill /F /T /PID` on Windows, recursive signal kills on Unix).
- Implement thorough unit tests in `src/net/ProcessReaper.test.js` validating nested process tree tracking and clean teardown.

**Out:**
- Do not affect standard Git execution routines required by the test framework itself.

## Acceptance Criteria
- [ ] Every process successfully spawned via Node `child_process` inside the sandboxed environment is automatically registered in `ProcessReaper`.
- [ ] ProcessReaper terminates the entire nested process tree (including children and grandchildren) recursively when `reap()` is invoked.
- [ ] Portable platform-agnostic commands are executed based on host OS (Windows vs Unix) to terminate process groups.
- [ ] Extensive unit tests under Jest confirm that nested process trees are tracked and terminated cleanly with zero dangling children.
