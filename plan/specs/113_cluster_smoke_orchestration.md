# SPEC-113: Authoritative Multi-Process Cluster Test Harness & Orchestration Smoke Tests

## Summary
Create a comprehensive, programmatic multi-process cluster test harness and orchestration smoke test suite (`scripts/agent/cluster-smoke.js`) to assert the correct execution of the sharded multi-worker system under sticky load balancer routing and cross-shard pub/sub matching.

## Motivation
- The horizontal scaling sharded worker structures (router, shared store, Redis/InMemory pubsub, worker supervisor) have isolated unit test coverage, but lack a unified orchestration integration script proving they work cleanly together under real concurrency.
- Ensures the scaling P7 pillar ("Netcode & Scale") is verified end-to-end dynamically before full Redis deployment.

## Scope
**In:**
- Create `scripts/agent/cluster-smoke.js` executing programmatic booting of the supervisor.
- Spin up two sharded workers on distinct ports (e.g., `18201` and `18202`) with an active HTTP/WebSocket sticky routing gateway.
- Simulate pilot presence leases, custom sector creation, cross-shard matchmaking queue matching, and graceful drains.
- Tear down all spawned processes cleanly using the process reaper to prevent locked ports or zombie processes.
- Hook the cluster smoke test into the main test or gate check structure as an optional benchmark.

**Out:**
- Do not introduce real Redis dependencies (use `InMemoryPubSub` and local swappable memory store mocks for sharded data).

## Files
- `scripts/agent/cluster-smoke.js` (create)
- `plan/specs/113_cluster_smoke_orchestration.md` (create)

## Acceptance Criteria
- [ ] Programmatic cluster spawner spins up and tears down multiple workers cleanly.
- [ ] Mock sessions successfully routed via sticky routing presence hashes.
- [ ] No locked socket ports or dangling child processes remain post-execution.
- [ ] `npm run agent:check` green.
