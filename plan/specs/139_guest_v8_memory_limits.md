# SPEC-139: Safe Guest V8 Memory Limits & Heap Size Allocation Control

## Summary
Implement a V8 old generation heap memory cap for isolated guest workers launched by `GuestRunner.js`. When spawning a child process to execute untrusted code, enforce a strict memory budget (default 128MB) by passing `--max-old-space-size=128` as part of `execArgv`. This protects the host process from memory exhaustion exploits or runaway garbage collection issues caused by buggy/malicious guest scripts.

## Motivation
- Untrusted AI guest scripts running in child processes can cause memory leaks or attempt heap-exhaustion attacks (e.g. infinite allocation loops).
- A single runaway child process consuming gigabytes of system memory can degrade system responsiveness, trigger OS swaps, or cause other active containers/processes to be forcefully terminated by the kernel's Out-Of-Memory (OOM) killer.
- Capping the V8 heap limits at launch provides hardware-level containment of memory footprints with zero runtime polling overhead.

## Scope
**In:**
- Update `GuestRunner.js` to accept a `maxMemoryMb` option in `GuestRunner.runScript()` (defaulting to `128`).
- Configure `execArgv` inside the `childProcess.fork` call to append `--max-old-space-size=N` where `N` is `maxMemoryMb`.
- Ensure other existing `execArgv` options (like `--experimental-vm-modules` and other native Node.js V8 flags) are properly preserved and merged.
- Validate that the child process throws an expected termination error or exits with a memory-limit code when it exceeds the heap budget.
- Author robust unit tests in `src/net/GuestRunner.test.js` verifying that guest processes spawned with low heap ceilings (e.g., `--max-old-space-size=16`) are terminated immediately when exceeding memory allocations.

**Out:**
- Do not affect memory allocation configurations of the main Starfall server thread or parent test environments.

## Acceptance Criteria
- [ ] GuestRunner supports configuring and applying `--max-old-space-size` memory limits.
- [ ] Child execution environments correctly inherit merged V8 flag configurations.
- [ ] Low-limit memory test script is forcefully terminated upon exceeding memory boundaries.
- [ ] Existing linter, type-check, and Jest test suite remain fully green.
