# 038 — Schema-based state encoding evaluation

- **Phase:** 2 (perf/architecture) · **Priority:** P3 · **Blocked by:** `015` · **Parent of idea:** `BinaryCodec`

## Description & Expected Impact
`BinaryCodec` (`015`) already beats JSON via a per-frame **key dictionary**. The market reference
(**Colyseus**) goes further with **schema-based** encoding: a fixed field order/typing per entity means keys
and tags vanish from the wire entirely. **Impact:** another bandwidth/CPU step for entity-dense frames — but
it trades the codec's generality for a maintained schema, so it must be **evaluated**, not assumed.

## Definition of Done & Acceptance Criteria
- [ ] A prototype `SchemaCodec` (or a `BinaryCodec` extension) encodes the **known entity shape**
      (`id/type/x/y/vx/vy/heading/radius` + ship fields) by fixed schema + a **value-string dictionary**
      (dedup repeated `"ship"` etc.), with the same bit-exact round-trip invariant as `015`.
- [ ] A measured comparison (bytes + encode/decode time) vs the current `BinaryCodec` for a representative
      40-entity frame; a written recommendation (adopt / keep generic / hybrid) with the numbers.
- [ ] If adopted: wired behind a version byte / flag with a JSON+generic-binary fallback; `npm run
      agent:check` green; a `ws`-smoke round-trips the schema frames.

## Implementation Approach
- Reuse the `015` round-trip test harness. Add a fixed `ENTITY_SCHEMA` (field order + types) and encode
  positional values without keys; intern repeated value strings. Keep the generic codec as the fallback for
  non-state / unknown shapes. Bump the protocol version byte.

## Test Strategy
- **Unit:** exhaustive round-trip (`toStrictEqual`, incl. `undefined` removals + unknown fields falling back
  to generic); schema-version rejection; **size/time** beats `BinaryCodec` for the 40-entity frame.
- **Integration:** `StateCodec` churn sequence through the schema codec reconstructs exactly (mirror `015`).
