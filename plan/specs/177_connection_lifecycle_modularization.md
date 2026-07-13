# SPEC-177: Connection Lifecycle & Disconnect Cleanup Extraction

- **Status:** Todo
- **Wave:** v50 — LLM Token Cost Governance, Intrusion Sentries & Zero-Trace Teardowns
- **Priority:** Normal
- **Product Pillar:** P7 — Netcode & Scale

## Summary

Extract the room joining lifecycle logic (`joinRoom`) and WebSocket disconnect cleanup handling (`handleClientDisconnect`) from the main `src/server.js` monolith into a dedicated, unit-tested module `src/server/connectionLifecycle.js`. This continues the reduction of the server monolith to a clean composition root.

## Motivation

- Isolates the complex state management of new connection setup, sector transfers, dynamic room loads, and cleanup timeouts.
- Reduces the size of `src/server.js` by approximately 250 lines of code.
- Enables high-fidelity unit testing of connection teardown, player session saving, and room presence cleanup without requiring active WebSocket server instances.

## Scope

### In
- Create `src/server/connectionLifecycle.js` to house `joinRoom` and `handleClientDisconnect`.
- Update `src/server.js` to import and call these handlers.
- Write robust mock-based unit tests in `src/server/connectionLifecycle.test.js`.
- Verify correctness of state updates (presence maps, persistent sessions, matchmaking queue removals).

### Out
- Modifying client-side connection/reconnect logic.
- Rewriting matchmaking algorithms or database persistence adapters.

## Approach

1. **Unified Options Injection:**
   - Both `joinRoom` and `handleClientDisconnect` will accept a structured options context containing all necessary singletons (`instances`, `clients`, `persistentSessions`, `persistenceManager`, `galacticChronicle`, etc.) and helper callbacks (`routeConnection`, `loadRegistry`, `saveRegistry`, `processMatchmakingQueueForRoom`, `broadcastLobbySync`, `sendLobbyList`).

2. **Test-Driven Assertions:**
   - Test room transition cleanup (removing entities and escorts from a previous room).
   - Test client disconnection and verification of cleanup timeout persistence triggers.
   - Assert roster updates and lobby synchronizations are broadcast correctly.

## Acceptance Criteria

- [x] `src/server.js` size reduced by 200+ LOC.
- [x] Spec validations and checklist items fully complete.
- [x] Unit tests verify room transitions and disconnect teardown behaviors.
- [x] Check gate `npm run agent:check` passes green.
