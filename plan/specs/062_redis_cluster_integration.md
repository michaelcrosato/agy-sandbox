# SPEC-062 — High-Concurrency Multi-Worker Redis Cluster State Sync

## Description
This spec wires the horizontal scaling primitives (`019b–f` scale epic) to utilize real `RedisStore` and sharded `RedisPubSub` instances behind a toggleable flag (`REDIS_SCALE_OUT=1`), enabling high-concurrency production deployments while keeping single-node fully operational as the green default.

1. Implement real Redis cluster presence synchronization in `src/server/supervisor.js` to coordinate rooms and shard locations across multiple supervisor forks.
2. Wire sharded Redis Pub/Sub channels for real-time multiplayer message routing between separate worker threads.
3. Integrate graceful failover recovery: if a node lease expires, a standby node automatically re-bootstraps the room from `RedisStore` snapshot states without active client drops.
4. Write exhaustive multi-worker integration tests proving concurrent websocket message deliveries, sharded presence lease swaps, and seamless cluster failovers.

## Definition of Done (DoD)
- [ ] Connect `roomRouter.js` and `PubSub.js` to real Redis cluster connection pools.
- [ ] Enforce graceful lease renewal heartbeats inside the multi-worker process loop.
- [ ] Add `REDIS_SCALE_OUT` environment variable toggle in `supervisor.js`.
- [ ] Write cluster-sharding integration tests in `multinode.integration.test.js` validating cross-process syncing.

## Implementation Approach
- Wrap Redis commands inside try-catch bounds with graceful local memory fallbacks.
- Never weaken existing single-process tests.
