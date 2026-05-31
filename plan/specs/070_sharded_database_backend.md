# SPEC-070 — Sharded Database Storage Backend Partitioning

## Description
This specification introduces a horizontal scale-out storage partition adapter called `ShardedStore` that implements distributed key hashing and horizontal sharding across multiple underlying `Store` instances. This architectural pattern matches leading sharded database storage clusters (e.g., Redis Cluster, horizontal PostgreSQL/MongoDB shards), ensuring data scaling without CPU/memory bottlenecks on any single shard.

1. **Partition-Sharded Store Interface:**
   - Create `src/persistence/ShardedStore.js` extending the base `Store` class.
   - The `ShardedStore` constructor takes an array of underlying `Store` instances (shards) and an optional custom hashing function.
   - It hashes keys using a highly uniform algorithm (e.g., FNV-1a or standard string hashing modulo the shard count) to determine which specific shard owns a given key.

2. **Delegation Loops & State Isolation:**
   - Implement `save(key, obj)`, `load(key)`, and `has(key)` to dynamically resolve the target shard and delegate the operations.
   - Verify that data saved on shard A is fully isolated and unreachable from shard B, maintaining strict horizontal partitioning invariants.

## Definition of Done (DoD)
- [ ] Export `ShardedStore` from `src/persistence/ShardedStore.js` extending the base `Store` interface.
- [ ] Implement uniform key hashing inside `ShardedStore` to partition keys evenly across a variable list of backend stores.
- [ ] Add deterministic unit tests in `src/persistence/ShardedStore.test.js` validating key distribution, shard isolation, and multi-shard integration.
- [ ] Ensure that existing persistence tests (`serializers`, `restart`) remain fully compatible and pass cleanly.
- [ ] Gate passes 100% green with zero lint or formatting warnings.

## Implementation Approach
- Use `src/persistence/Store.js` as the base class reference.
- Use a simple and fast uniform hashing function like `Math.abs(hash(key)) % shards.length` to balance storage load across available partition shards.

## Test Strategy
- Assert that saving keys with distinct hashes distributes them to different underlying sub-stores.
- Assert that loading from the `ShardedStore` retrieves correct values from the correct shard.
- Assert that `has(key)` resolves correctly and queries only the designated shard.
