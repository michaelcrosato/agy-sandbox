# SPEC-176: Ephemeral Guest Sandbox Zero-Trace State Wiper & Purger

## Summary

Design and build an autonomic, zero-trace post-execution teardown purifier (`ZeroTraceTeardown.js`) that runs immediately after sandboxed guest executions. It executes comprehensive file system sweeps, process tree audits, and handles/timer registry purges to guarantee that absolutely zero residual trace (zombie processes, untracked worktree files, lingering Event Loop handles, or unref-ed timers) remains in memory or host disks.

## Motivation

- Ensures the perpetual unattended loop does not exhaust host memory (OOM) or disk storage over multi-day iterations.
- Guarantees 100% clean, predictable baselines for subsequent agent runs, preventing cross-test pollution.
- Fulfills the strict substrate boundary teardown and resources compliance Axioms.

## Scope

**In:**

- Create `src/net/ZeroTraceTeardown.js` to execute automatic cleanups after `GuestRunner.runScript()` finishes.
- Systematically sweep and purge:
  - Lingering child processes or grandchildren (via recursive process tree scanning).
  - Open file descriptors, dynamic ESM dynamic import cache maps, and worker sockets.
  - Lingering background timers (forcing clear on any unref-ed `setInterval` or `setTimeout` handles).
  - Residual worktree temp files and sandbox sibling drifts.
- Perform a final validation sweep, returning a boolean status confirming that zero handles, timers, or orphaned child processes remain active.
- Write robust verification tests in `src/net/ZeroTraceTeardown.test.js` validating absolute zero-trace teardown states.

**Out:**

- Do not clear active server listener ports, primary galaxy ticker loops, or host observability metrics channels.

## Approach

1. **Active Sweepers:**
   - Maintain a centralized registration mapping all resources (processes, streams, timers, file caches) allocated per script run.
   - Execute a synchronous/asynchronous teardown sequence on run end, purging all mappings and invoking underlying sweeping commands natively.

## Acceptance Criteria

- [ ] Post-run sweeps successfully terminate all related processes and delete all temporary workspace files.
- [ ] No unref-ed handles or active timers remain from the sandboxed run, preventing Jest open-handle warnings.
- [ ] Verification tests validate that both successful runs and crashed/timed-out runs achieve a 100% zero-trace state.
