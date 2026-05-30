# 036 — Matchmaking with room filters + queue

- **Phase:** 2 (competitive) · **Priority:** P2 · **Blocked by:** none (pairs with `019d`)

## Description & Expected Impact
Rooms are joined by a fixed id (`public`) or created ad hoc; there is no **metadata-filtered matchmaking**.
The market reference (**Colyseus**) ships room-based matchmaking with **filtering, queuing, and capacity**
out of the box. **Impact:** players are matched into appropriate rooms (by mode/region/capacity), and full
rooms queue instead of failing — table-stakes for a live multiplayer product.

## Definition of Done & Acceptance Criteria
- [ ] Rooms carry **metadata** (mode, capacity, current population, optional region/tags); a pure
      `matchRoom(rooms, criteria)` selects the best joinable room (capacity-aware, filter-aware) or signals
      "create new" / "queue".
- [ ] A `join_room` with criteria routes through matchmaking; a full room **queues** the client (FIFO) and
      admits it when a slot frees, rather than rejecting.
- [ ] The existing lobby/`join_room` flow still works for explicit ids (no regression); `npm run
      agent:check` green; server boots; a `ws`-smoke joins via criteria and lands in a room.

## Implementation Approach
- New pure `src/server/matchmaking.js`: `matchRoom(rooms, { mode, maxPlayers, tags })` + a `JoinQueue` (pure
  FIFO with admit-on-slot). The server's lobby/`join_room` handler consults it; room metadata lives on
  `GameInstance` (additive).

## Test Strategy
- **Unit:** `matchRoom` picks the right room across capacity/filter cases; returns create/queue signals;
  `JoinQueue` admits FIFO as slots free. **Integration:** a `ws`-smoke joining by criteria reaches a room;
  a full room queues then admits.
