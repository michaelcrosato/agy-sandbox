# 019 — Horizontal scaling (multi-process / Redis) — North-Star epic

- **Phase:** 2 · **Priority:** P2 (GOAL P7) · **Blocked by:** 007, 010, 015 (recommended)

## Description & Expected Impact
The server is a **single Node process** holding all rooms in memory; it cannot scale past one core/host
and is a single point of failure. Market leaders (Colyseus + Redis, Hathora on-demand) scale rooms
across processes/hosts. **Impact:** the path from tens to thousands of CCU and zero-downtime restarts —
the long-term ceiling-raiser. **This is an epic; decompose before executing.**

## Definition of Done & Acceptance Criteria
- [ ] A written design doc (`plan/specs/019a_*` … as needed) decomposing the epic into atomic, testable
      sub-specs (process model, room ownership/registry, cross-process presence, shared state backend,
      sticky routing/load balancing, graceful drain) — each with its own DoD.
- [ ] A minimal first slice lands: rooms can run in a worker process behind a router, with the JSON
      persistence layer (or a `RedisStore` behind the existing `Store` interface) as shared state — proven
      by a test that two processes see the same persisted galaxy.
- [ ] No regression to single-process mode (it remains the default for local play).
- [ ] `npm run agent:check` green throughout; each sub-slice is independently shippable.

## Implementation Approach
- Reuse the swappable `Store` interface: add a `RedisStore` (or keep `JsonFileStore` as the shared
  backend for a first cut) so galaxy/player state lives outside any one process.
- Introduce a room registry/router (which process owns which room) and presence via the shared backend.
- Lean on `007` (server already modularized) and `010` (metrics to observe per-process load); `015`
  (binary) reduces inter-node and client bandwidth.
- Keep the engine pure and process-agnostic — only the orchestration/transport changes.

## Test Strategy
- **Unit:** `RedisStore` (or shared-store) round-trip behind the `Store` contract (mirror
  `Store.test.js`); room-registry/router decisions as pure helpers.
- **Integration:** two in-test "nodes" sharing one store both restore the same galaxy; a room handed off
  between them preserves state.
- **Out of scope here:** real multi-host deployment/infra (document as ops follow-up).

## Notes
Lowest feasibility/fit in the priority table on purpose — do not attempt as a single task. Treat as a
roadmap North Star: land `007/010/015` first, then decompose.
