# SPEC-165: Clustered Sync for Galactic Military Fleets over Redis Pub/Sub

## Summary

Extend the multi-worker cluster coordination architecture to synchronize faction military deployment actions, active sector sieges, and conquest alerts globally across all sharded Node processes. Leveraging Redis Pub/Sub under a dedicated `faction:campaign` channel ensures that campaign developments, planetary dynamic takeovers, and tactical alerts remain symmetric across all worker nodes.

## Motivation

- Hardens the multi-process sharding paradigm (P7) to guarantee zero state drift between workers during parallel client runs.
- Resolves potential caching or race conditions when players on different workers purchase items, redeem vouchers, or complete localized missions.
- Keeps cluster notifications highly scalable via sharded channels.

## Scope

**In:**

- Register subscriber for the `faction:campaign` channel during multi-process cluster initialization inside `src/server.js`.
- Coordinate real-time broadcasts when a sector falls, dispatching synchronized messages to all connected pilot sockets on local shards.
- Serialize shared campaign history and active sieges to the central persistent `Store` registry under `faction:campaign:state` keys.
- Write robust integration tests inside `src/server/squad.integration.test.js` (or a new dedicated clustered campaign test suite) simulating sharded processes.

**Out:**

- Only handle cross-worker messaging and state synchronization; do not implement individual player squad mechanics or REST routing.

## Approach

1. **Redis Pub/Sub Subscription:**
   - Add a `faction:campaign` sub-channel to the sharded worker subscriber loop in `setupPubSubSubscriptions` in `src/server.js`.
   - Dispatch clean custom handlers to synchronize the authoritative local `FactionWarCampaign` instance whenever remote workers publish changes.

2. **Persistence Synchronization:**
   - Write updated strategic maps back to the authoritative `PersistenceManager` during heartbeat sweeps.
   - Load remote campaign baselines on worker startup, ensuring seamless failover and hot configuration reloading bounds.

3. **Test Strategy:**
   - Clustered integration tests verifying that triggering a dynamic siege or conquest on Shard 0 instantly synchronizes all Shard 1 state and triggers local client notifications.

## Acceptance Criteria

- [ ] Workers subscribe to `faction:campaign` and synchronise tactical maps dynamically.
- [ ] Sector conquests and skirmishes publish clean payload frames across sharded workers.
- [ ] Authorities synchronize state cleanly on cache misses from the central persistent store.
- [ ] Sharded unit and multi-process integration tests are completely green.
