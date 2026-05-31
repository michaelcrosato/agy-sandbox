# SPEC-111: Lobby & Matchmaking Connection Decomposition

## Summary
Extract the massive lobby room joining, quick matching, and custom room creation lifecycle message handlers (`join`, `quick_join`, `create_room`, `join_room`) from `src/server.js` into a dedicated, unit-tested module `src/server/connectionHandlers.js`. This will reduce `server.js` close to 1,600 LOC, keeping it a pure thin composition root.

## Motivation
- The room matching and join lifecycle accounts for over 300 lines of complex inline code in `src/server.js`.
- Decoupling these handlers allows for testing the matchmaking state flow independently from the live WebSocket server bindings.
- Completes the P8 pillar ("Horizontal scale primitives") by isolating the entry points of new player sessions.

## Scope
**In:**
- Extract `join`, `quick_join`, `create_room`, `join_room` message handlers into `src/server/connectionHandlers.js`
- Pass all required singletons (such as `instances`, `clients`, `galacticChronicle`, `persistenceManager`, and pubsub/lobby sync helpers) as arguments
- Wire the connectionHandlers into the main `src/server.js` WebSocket `message` event dispatcher
- Write full unit and integration tests for `src/server/connectionHandlers.js`
- Retain complete backward compatibility

## Files
- `src/server.js` (modify)
- `src/server/connectionHandlers.js` (create)
- `src/server/connectionHandlers.test.js` (create)

## Acceptance Criteria
- [ ] `src/server.js` reduced by 300+ LOC
- [ ] Matchmaking, joining, and creation flows fully covered by independent unit tests
- [ ] `npm run agent:check` green
