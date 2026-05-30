# 019e — Cross-process presence (Redis pub/sub + leases)

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** `019b` · **Parent:** `019`

## Description & Expected Impact
`RoomRegistry` is in-memory today. Multi-node needs all nodes to **agree** on ownership and to **broadcast
cross-node** (e.g. global chat, fleet ops spanning shards). 2026 practice: **Redis pub/sub** for cross-node
messaging, **sharded pub/sub (Redis 7+ `SPUBLISH`/`SSUBSCRIBE`)** to keep per-room traffic on-shard, and
**lease/TTL** keys so a crashed node's rooms are reclaimed. **Impact:** consistent presence + safe failover.

## Definition of Done & Acceptance Criteria
- [ ] Room ownership is backed by the shared store/Redis with a **lease/TTL**: a node renews its rooms; an
      expired lease lets another node `claim` the room (proven with two in-test nodes + a fake clock).
- [ ] A pub/sub-shaped transport abstraction (`publish(channel, msg)` / `subscribe(channel, cb)`) with an
      in-memory implementation for tests and a Redis implementation behind `REDIS_URL`; per-room channels use
      sharded pub/sub when available.
- [ ] A node "crash" (stops renewing) releases its rooms and another node re-claims them; `npm run
      agent:check` green.

## Implementation Approach
- Extend `RoomRegistry` (or a `PresenceManager`) with lease timestamps + a `reapExpired(now, ttl)` pure step
  (mirror the heartbeat reaper). Persist presence via `019b`'s store. Add a `PubSub` interface
  (in-memory + Redis impls); the broadcast layer publishes cross-node events through it.

## Test Strategy
- **Unit:** `reapExpired` releases only stale leases (fake clock); claim-after-expiry succeeds.
- **Integration:** node A owns + renews; node A "dies"; node B reaps + re-claims + restores the room from the
  shared store (extends the `019` multinode test).
