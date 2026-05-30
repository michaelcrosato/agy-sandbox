# SPEC-042 — Server Monolith Extraction: Heartbeats, GC, and Lobby Sync

## Description
The `server.js` monolith has grown back to `2,378` lines. This large size increases maintenance difficulty and reduces the testability of core server orchestrations. In previous extraction rounds, we extracted outfitting, trading, boarding, hyperdrive, and room lifecycle logic into isolated pure modules.

This specification extracts three core monolithic systems from `server.js`:
1. **Galaxy Heartbeat ticker**: The periodic short- and long-term interval tasks that trigger economic price diffusion, asteroid replenishment, and NPC faction spawning.
2. **Room Garbage Collection**: The logic verifying `shouldGcRoom` and executing the safe teardown, persistence saving, and memory release of idle sectors.
3. **Lobby Synchronization**: The system compiling active rooms metadata (mode, capacity, player counts, tags) and broadcasting it to clients in the matchmaking lobby.

## Definition of Done (DoD)
- [ ] Create `src/server/galaxyTicker.js` managing short- and long-term background updates and galaxy heartbeats, fully modularized.
- [ ] Create `src/server/roomGc.js` orchestrating idle room checks, saving, and teardowns, fully modularized.
- [ ] Create `src/server/lobbySync.js` compiling room metadata payload formatters, fully modularized.
- [ ] `server.js` is refactored to delegate to these three new modules, reducing its total line count by at least 300 LOC.
- [ ] Write unit tests for each new module in `src/server/galaxyTicker.test.js`, `src/server/roomGc.test.js`, and `src/server/lobbySync.test.js`.
- [ ] The global gate (`npm run agent:check`) passes 100% green.

## Implementation Approach
- Extract inline heartbeat/diffusion logic from `server.js` to `src/server/galaxyTicker.js`.
- Extract GC interval actions to `src/server/roomGc.js`, ensuring it cleanly calls `saveGalaxy` and releases memory.
- Extract lobby frame builder to `src/server/lobbySync.js`.
- Refactor `server.js` to import and call these modules.

## Test Strategy
- Run all server tests:
  `npm test -- src/server/`
- Verify global verification:
  `npm run agent:check`
