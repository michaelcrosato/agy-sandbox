# 029 — Reputation `decayAll` heartbeat hook

- **Phase:** 0 · **Priority:** P1 (sim depth; BACKLOG from spec 016) · **Blocked by:** none

## Description & Expected Impact
`FactionRegistry.decayAll(rate)` (reputations heal toward neutral over time) is built and tested but
**never called** — so a standing earned by kills/missions is permanent. **Impact:** delivers the GOAL P3
"reputations heal when left alone" behaviour, closing the faction loop, and makes hostile lock-outs
recoverable over time.

## Definition of Done & Acceptance Criteria
- [ ] A periodic step calls `room.factionRegistry.decayAll()` at a sensible cadence (the galaxy heartbeat
      or a dedicated low-frequency timer), with a small `decayRate` so a max standing takes many minutes to
      neutralize — gentle enough not to undo a fresh action within a session.
- [ ] A deterministic test sets a non-zero standing, advances N decay steps, and asserts it moved **toward
      0** (and that allies/enemies are untouched by decay — decay is per-stored-standing, no propagation).
- [ ] No regression: persistence still round-trips standings; `npm run agent:check` green; server boots.

## Implementation Approach
- Decay math stays in `FactionRegistry` (pure). Invoke it from `GameInstance` — either inside the existing
  `galaxyHeartbeat` pulse path or via a `scheduleTimer` (use the existing `pendingTimers`/`unref` pattern so
  it never keeps the process/Jest alive).
- Tune `decayRate` (e.g. ~0.01–0.02 per step at the heartbeat cadence) and document it.

## Test Strategy
- **Unit/integration:** seed `adjustStanding(player, "Federation", 80)`, run the decay step N times, assert
  the value strictly decreased toward 0 and stayed within the clamp band. Pure, no `Math.random`.
- **Regression:** the spec-016 `faction.integration.test.js` still passes (standings persist/restore).
