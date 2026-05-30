# SPEC-043 — Matchmaking Queue Disconnect-Rejoin Lifecycle

## Description
While spec `036` introduced a `JoinQueue` and `matchRoom` matchmaking core, the lifecycle that admits queued players dynamically when an active player disconnects or leaves a sector room is not fully integrated. Currently, a room slot becomes free but queued players are not automatically notified/admitted from the matchmaking queue.

This specification completes this pipeline:
1. Wire the disconnection and room exit events in `server.js` to automatically scan the `JoinQueue` for any waiting players matching the room criteria.
2. Automatically admit the next matching queued player, sending a `"match_admitted"` message to their socket with the target `roomId` they can now join.
3. Handle potential connection timeouts or queued player cancellations.

## Definition of Done (DoD)
- [ ] Update `src/server/matchmaking.js` to support matching queued players on room slot availability and auto-admission events.
- [ ] Integrate room exit and socket disconnect hooks in `server.js` to trigger the queue check and automatically emit `"match_admitted"` to the next waiting player.
- [ ] Add integration tests in `src/server/matchmaking.integration.test.js` verifying that:
  - When player A disconnects from a full room, player B (who is in the queue) is automatically dequeued and admitted.
  - Connection/socket drops from queued players safely prune the queue without memory leaks.
- [ ] Global verification gate `npm run agent:check` is 100% green.

## Implementation Approach
- Edit `src/server/matchmaking.js`:
  - Enhance `JoinQueue` or write a helper to locate and pop the next candidate for a freed room slot.
- Edit `src/server.js`:
  - Hook into `ws.on("close")` and room departure logic.
  - When room player count drops: locate queue entries for this mode/tags/capacity.
  - Pop the candidate, update room reservation slot, and send the socket a direct message containing the authorized `roomId`.

## Test Strategy
- Run matchmaking tests:
  `npm test -- src/server/matchmaking.integration.test.js`
- Verify global verification:
  `npm run agent:check`
