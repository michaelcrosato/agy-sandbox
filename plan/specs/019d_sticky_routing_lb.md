# 019d — Sticky routing / load-balancer front door

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** `019c` (recommended) · **Parent:** `019`

## Description & Expected Impact
With multiple workers, each incoming WebSocket must reach the worker that **owns** that client's room.
2026 practice: a stateless front door computing the shard + `least_conn` sticky balancing for long-lived
connections. **Impact:** correct routing under multi-process, no cross-worker chatter on the hot path.

## Definition of Done & Acceptance Criteria
- [ ] A pure routing-decision helper `routeConnection({ roomId, registry, shardCount })` → target worker id,
      consulting `RoomRegistry` for dynamic ownership and falling back to `assignShard` for unclaimed rooms.
- [ ] Documented LB guidance: `least_conn` (not round-robin) for long-lived WS, sticky by room/worker; an
      example NGINX/HAProxy snippet in the spec/README (config artifact, not code).
- [ ] An integration harness delivers a connection to the correct worker for a given room; `npm run
      agent:check` green.

## Implementation Approach
- New `src/server/router.js` (or extend `roomRouter`): `routeConnection` pure helper. The front door
  (a thin proxy or the supervisor's accept loop) uses it to hand the socket to the owning worker.
- Keep it a pure decision + a thin transport; no balancer is bundled (ops-owned).

## Test Strategy
- **Unit:** `routeConnection` across (claimed vs unclaimed room, varying shardCount, registry states).
- **Integration:** with 2 in-test workers, a client for room R reaches R's owner; re-routes after a
  `transfer`.
