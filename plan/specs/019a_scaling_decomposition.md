# 019a — Horizontal-scaling decomposition (design doc for epic 019)

- **Parent:** [`019`](019_horizontal_scaling.md) · **Status:** decomposition + first slice landed

This doc satisfies the first DoD bullet of epic 019 ("a written design doc decomposing the epic into
atomic, testable sub-specs"). Each sub-spec below is independently shippable with its own DoD, ordered so
single-process mode keeps working at every step. The engine stays pure/process-agnostic — only the
orchestration/transport layer changes.

## Landed in this first slice (iter for 019)
- **Router + registry (`src/net/roomRouter.js`):** `assignShard(roomId, shardCount)` is a deterministic,
  evenly-distributed FNV-1a hash → shard index (stable so any node computes a room's owner without
  coordination). `RoomRegistry` is the authoritative roomId→nodeId ownership map with
  claim/release/transfer/`roomsForNode` and `serialize`/`fromJSON` (so presence can live in the shared
  `Store`). Pure, fully unit-tested (`roomRouter.test.js`).
- **Shared-state proof (`src/persistence/multinode.integration.test.js`):** two in-test "nodes" sharing one
  `Store` (an `InMemoryStore` standing in for a future `RedisStore` behind the same contract) both restore
  the same persisted galaxy, and a room handed off A→B via the registry preserves its exact state.
- **No regression:** the router/registry are standalone modules; the live server still runs single-process
  and never calls them, so local play is unchanged.

## Remaining sub-specs (roadmap)

### 019b — `RedisStore` behind the `Store` interface
Add a `RedisStore extends Store` implementing `save`/`load`/`has` against an injected redis client (so it
is testable with a fake client, no live server). **DoD:** round-trip behind the `Store` contract (mirror
`Store.test.js`) with a fake client; `npm i redis` is optional/lazy like localtunnel; `JsonFileStore`
remains the default. Out of scope: a real Redis deployment.

### 019c — Process model + worker orchestration
A supervisor that spawns N worker processes (Node `cluster`/`worker_threads`/child procs), each running the
existing single-process server bound to a shard. **DoD:** a supervisor unit-tests the spawn/restart policy
as a pure decision function; an integration test boots 2 in-process workers and routes a room to each.
Single-process stays the default (`WORKERS=1`).

### 019d — Sticky routing / load balancer front door
A stateless entry point that, per incoming connection, computes `assignShard(roomId)` and routes to the
owning worker (consulting `RoomRegistry` for dynamic ownership/rebalances). **DoD:** pure routing-decision
helper tested across (room, registry, shardCount) inputs; a connection is delivered to the correct worker
in an integration harness.

### 019e — Cross-process presence + room lifecycle in the registry
Persist `RoomRegistry` to the shared `Store` (or Redis pub/sub) so all nodes agree on ownership; claim on
first client, release on GC (reuse `shouldGcRoom`), heartbeat liveness. **DoD:** a node crash releases its
rooms (lease/TTL) and another node re-claims them, proven with two in-test nodes + a shared store.

### 019f — Graceful drain / zero-downtime restart
Drain a worker: stop accepting new clients, `transfer` its rooms (saving galaxy first), let clients
reconnect to the new owner (the client already has reconnect backoff + keyframe re-sync). **DoD:** an
integration test drains node A mid-session and asserts node B serves the same room state with no data loss.

## Cross-cutting notes
- Binary broadcast (`015`) and AOI filtering (`014`) already cut per-client and would cut inter-node
  bandwidth; metrics (`010`) give per-process load to drive rebalancing.
- **Explicitly out of scope for epic 019 here:** real multi-host deployment, container/infra wiring, and a
  production Redis cluster — these are ops follow-ups, not engine work.
