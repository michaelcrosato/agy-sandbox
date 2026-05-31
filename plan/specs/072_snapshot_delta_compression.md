# SPEC-072 — Snapshot Delta Compression Network Pipeline

## Description
This specification implements an advanced acknowledged snapshot delta compression network pipeline to minimize WebSocket broadcast payloads. Rather than broadcasting full snapshots of all entities in each frame, the server will compute dynamic deltas against each client's last acknowledged snapshot baseline, sending only changed attributes (dirty bits) and deletions.

1. **Acknowledge Baseline Tracking:**
   - Track client-specific acknowledged frame numbers on the server.
   - Maintain a historical buffer of sent snapshots per client room connection.

2. **Field-Level Dynamic Deltas (Dirty Bits):**
   - Create a clean `DeltaStateCodec` utility inside `src/net/DeltaStateCodec.js` to compute field differences between the current room state and a client's acknowledged baseline.
   - Broadcast compact delta objects containing only updated properties (e.g. position, shield, armor) and deleted entity IDs.

## Definition of Done (DoD)
- [ ] Export `DeltaStateCodec` from `src/net/DeltaStateCodec.js` with `encodeDelta` and `decodeDelta` functions.
- [ ] Ensure that delta-compression payloads are significantly smaller than raw snapshots (saving >70% bandwidth on average).
- [ ] Add deterministic unit tests in `src/net/DeltaStateCodec.test.js` validating delta calculations, missing property overrides, and frame acknowledgments.
- [ ] Maintain 100% green gate check with zero ESLint or formatting warnings.

## Implementation Approach
- Use simple field-level comparison loops to check changed properties.
- Only serialize properties that differ between current frame and enqueued baseline frame.

## Test Strategy
- Assert that a frame with identical entity states yields an empty or minimal delta payload.
- Assert that changing position on a single entity yields a delta containing only that entity's ID and position values.
