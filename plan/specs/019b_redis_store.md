# 019b — `RedisStore` behind the `Store` interface

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** none · **Parent:** `019` / `019a`

## Description & Expected Impact
Galaxy/player/presence state lives in a process-local `JsonFileStore`. Multi-node operation needs state in a
**shared backend**. The swappable `Store` contract (`save`/`load`/`has`) already exists. **Impact:** state
outside any one process — the prerequisite for the worker model (`019c`) and cross-node presence (`019e`).

## Definition of Done & Acceptance Criteria
- [ ] A `RedisStore extends Store` implementing `save`/`load`/`has` against an **injected** redis client
      (constructor takes the client, so it is testable with a fake/in-memory client — no live Redis needed
      for the gate). JSON values round-trip cleanly.
- [ ] `redis` is an **optional/lazy** dependency (mirror the `localtunnel` pattern) so the default
      single-process build neither requires nor installs it; `JsonFileStore` stays the default.
- [ ] Round-trip tests behind the `Store` contract (mirror `Store.test.js`) using a fake client; `npm run
      agent:check` green; `npm audit` 0.

## Implementation Approach
- New `src/persistence/RedisStore.js` taking `{ client, keyPrefix }`; `save`→`client.set(prefix+key, JSON)`,
  `load`→`JSON.parse(client.get(...))` (null on miss), `has`→`client.exists`. No singleton; the server wires
  a real client only when `REDIS_URL` is set.
- Document Redis 7+ as the target (sharded pub/sub is `019e`).

## Test Strategy
- **Unit:** a `FakeRedisClient` (Map-backed) drives the same round-trip suite as `InMemoryStore`/`JsonFileStore`
  (save→load equality, `has`, missing-key → null, JSON fidelity).
- **Integration:** the `019` `multinode.integration.test.js` runs unchanged with `RedisStore(fakeClient)`
  swapped in as the shared backend.
