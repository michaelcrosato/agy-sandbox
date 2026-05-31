# SPEC-170: Autonomic Process Tree Teardown Registry in ProcessReaper on Host Signal Interceptions

## Summary

Build automated, self-healing host process shutdown listeners inside `ProcessReaper.js`. Guarantee that the `ProcessReaper` automatically cleans up and terminates all nested child processes, worker threads, and socket allocations whenever the host process receives termination signals (`SIGINT`, `SIGTERM`) or is about to exit naturally, preventing zombie leaks.

## Motivation

- If the orchestrator host process exits due to an unhandled rejection, error, or manual Ctrl+C (`SIGINT`), child guest worker processes could be left orphaned on the host.
- A long-running evaluation loop must guarantee 100% clean teardown under any failure condition to avoid resource exhaustion or OOM.
- Registering automated signal hooks within the reaper itself ensures absolute process cleanup without relying on external orchestration callers.

## Scope

**In:**

- Add process-level signal listeners (`SIGINT`, `SIGTERM`, `exit`) directly inside `src/net/ProcessReaper.js`.
- Upon `exit`, perform a synchronous process tree teardown sweep of all registered child PIDs (using synchronous child process termination logic).
- Upon `SIGINT` or `SIGTERM`, execute the asynchronous `reap()` pipeline to cleanly terminate all processes and threads, then invoke `process.exit()`.
- Unreference the signal hooks or cleanly register/deregister them under active execution flows to ensure Jest test suites can terminate cleanly without leaking active listeners.
- Authored unit/integration tests proving that processes are reaped on exit and standard signals.

**Out:**

- Do not intercept signals in nested child processes (only intercept in the host process environment where reaper registers them).

## Acceptance Criteria

- [ ] Host exit triggers a synchronous, recursive cleanup of all active subprocesses.
- [ ] SIGINT/SIGTERM signals are intercepted to cleanly trigger reaper teardowns.
- [ ] Standard test runs clear listeners and exit with 100% green status (no open handles).
- [ ] 100% green test validation gate.
